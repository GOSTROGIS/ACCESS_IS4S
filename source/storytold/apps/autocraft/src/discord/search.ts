// Issue search for the Discord bot. The question is embedded in memory with the local model and compared with the stored
// vectors of public issues; a Haiku call picks the best few of the closest ten and says why. When the daily dollar cap
// is used up, or the call fails, the closest three from the embedding search are the answer. The question is
// kept only for the length of the call: it is not stored, logged or sent anywhere but that one model call, and the
// prompt and reply texts the call records are deleted when it ends.
import type { DatabaseSync } from "node:sqlite";
import { CodexBudgetError, providerBudgetMode } from "../agents/codex/budget.ts";
import { dailyReportedUsd } from "./budget.ts";
import { askClaude } from "../classify/run.ts";
import type { Embedder } from "../embed/model.ts";
import type { VectorIndex } from "../embed/vectors.ts";
import { DEFAULT_OWNER } from "../owners.ts";
import { hiddenSql, isPublicRepo, publicRepoNames } from "../public/status.ts";
import { PICK_CANDIDATES, PICK_MAX, parsePicks, type PickInput } from "./pick.ts";

const CLOSED_WINDOW_MS = 180 * 86_400_000;
/** How many nearest vectors are read before the filters (pull requests, private repos and old closed issues are dropped). */
const SCAN = 300;
/** Cosine floor of the embedding-only answer, where no model judges relevance. */
export const FALLBACK_MIN_SCORE = 0.55;
export const DAILY_CAP_KEY = "discord_search_daily_usd";
export const DEFAULT_DAILY_CAP_USD = 1;
export const QUESTION_CHARS = 1000;
const USER_LIMIT = { n: 5, ms: 60_000 };
const CHANNEL_LIMIT = { n: 20, ms: 60_000 };
/** Longest the call waits for a Claude account before the embedding answer is used. */
const MODEL_WAIT_MS = 20_000;

export type Match = { repo: string; number: number; title: string; url: string; closed: boolean; reason?: string };
export type Found = { matches: Match[]; /** Whether a model chose and explained them. */ judged: boolean; budgetError?: string };

type Candidate = Match & { body: string; score: number; activity: number; updatedAt: string };

/** Open first, then by comments plus reactions (highest first), then by the latest update. */
function byActivity(a: Candidate, b: Candidate): number {
  return Number(a.closed) - Number(b.closed) || b.activity - a.activity || b.updatedAt.localeCompare(a.updatedAt);
}

/** The model step; tests replace it. Returns the reply text, or null when the call failed or got no answer. */
export type Ask = (db: DatabaseSync, input: PickInput) => Promise<string | null>;

export const askHaiku: Ask = async (db, input) => {
  const reply = await askClaude("discord.search", "haiku", [input], db, { maxWaitMs: MODEL_WAIT_MS });
  return reply?.text ?? null;
};

export type SearchDeps = {
  db: DatabaseSync; embedder: Embedder; index: VectorIndex; log: (line: string) => void;
  ask?: Ask; now?: () => number;
};

const oneLine = (s: string, n: number): string => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

export function dailyCapUsd(db: DatabaseSync): number {
  const v = Number((db.prepare("SELECT value FROM settings WHERE key = ?").get(DAILY_CAP_KEY) as { value: string } | undefined)?.value);
  return Number.isFinite(v) && v >= 0 ? v : DEFAULT_DAILY_CAP_USD;
}

/** What today's (UTC) search calls cost, from the agent runs. */
export function spentTodayUsd(db: DatabaseSync, now: number): number | null {
  return dailyReportedUsd(db, "discord-search", now);
}

/** The prompt and reply of a search call hold the question. After a call, the rows of finished calls are removed; `all` (at startup, when no call can be running) removes every row. */
export function dropTexts(db: DatabaseSync, all = false): void {
  db.prepare(`DELETE FROM agent_run_texts WHERE run_id IN (SELECT id FROM agent_runs WHERE step = 'discord-search'${all ? "" : " AND state <> 'running'"})`).run();
}

const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The one public tracked repo a question names as a whole word (case-insensitive), with the question minus that word; null when none or several are named. */
export function namedRepo(db: DatabaseSync, question: string): { repo: string; rest: string } | null {
  const hits = publicRepoNames(db).filter((r) => new RegExp(`(?<![\\w-])${escapeRe(r)}(?![\\w-])`, "i").test(question));
  const repo = hits.length === 1 ? hits[0]! : null;
  if (!repo) return null;
  const rest = question.replace(new RegExp(`(?<![\\w-])${escapeRe(repo)}(?![\\w-])`, "gi"), " ").replace(/\s+/g, " ").trim();
  return { repo, rest: rest || question };
}

export class Search {
  #d: SearchDeps;
  #hits = new Map<string, number[]>();

  constructor(deps: SearchDeps) {
    this.#d = deps;
  }

  /** Sliding-window limits per person and per channel (both given as keyed hashes). False when either is used up; a refused try is not counted. */
  allow(userKey: string, channelKey: string): boolean {
    const now = (this.#d.now ?? Date.now)();
    const live = (key: string, lim: { ms: number }): number[] => (this.#hits.get(key) ?? []).filter((t) => now - t < lim.ms);
    const u = live(`u:${userKey}`, USER_LIMIT), c = live(`c:${channelKey}`, CHANNEL_LIMIT);
    const pass = u.length < USER_LIMIT.n && c.length < CHANNEL_LIMIT.n;
    if (pass) {
      this.#hits.set(`u:${userKey}`, [...u, now]);
      this.#hits.set(`c:${channelKey}`, [...c, now]);
    } else {
      this.#hits.set(`u:${userKey}`, u);
      this.#hits.set(`c:${channelKey}`, c);
    }
    for (const [k, v] of this.#hits) if (!v.length) this.#hits.delete(k);
    return pass;
  }

  /** The ten closest public issues: open ones, and ones closed as completed in the last 180 days. */
  async candidates(question: string, repo?: string): Promise<Candidate[]> {
    const { db, embedder, index } = this.#d;
    // An explicit repo wins; otherwise a repo named in the question restricts the search and its word is left out of the embedded text.
    let only = repo && isPublicRepo(db, repo) ? repo : undefined;
    let text = question;
    if (!only) {
      const n = namedRepo(db, question);
      if (n) { only = n.repo; text = n.rest; }
    }
    const [vec] = await embedder.embed([text], "query");
    if (!vec) return [];
    await index.ready(db);
    const get = db.prepare(`SELECT i.title, i.body, i.state, i.state_reason, i.closed_at, i.updated_at, i.comments_count, i.reactions_count,
        COALESCE(i.url, 'https://github.com/' || COALESCE(r.owner, '${DEFAULT_OWNER}') || '/' || i.repo || '/issues/' || i.number) AS url
      FROM main.items i JOIN main.repos r ON r.name = i.repo WHERE i.repo = ? AND i.number = ? AND i.kind = 'issue' AND NOT ${hiddenSql("i.repo", "i.number", "i.labels")}`);
    const isPublic = new Map<string, boolean>();
    const now = (this.#d.now ?? Date.now)();
    const out: Candidate[] = [];
    for (const h of index.nearest(db, vec, SCAN, undefined, only)) {
      if (!isPublic.has(h.repo)) isPublic.set(h.repo, isPublicRepo(db, h.repo));
      if (!isPublic.get(h.repo)) continue;
      const r = get.get(h.repo, h.number) as { title: string | null; body: string | null; state: string; state_reason: string | null; closed_at: string | null; updated_at: string | null; comments_count: number | null; reactions_count: number | null; url: string } | undefined;
      if (!r) continue;
      const open = r.state === "OPEN";
      if (!open && !(r.state === "CLOSED" && r.state_reason === "COMPLETED" && now - Date.parse(r.closed_at ?? "") <= CLOSED_WINDOW_MS)) continue;
      out.push({ repo: h.repo, number: h.number, title: r.title ?? "", body: r.body ?? "", url: r.url, closed: !open, score: h.score,
        activity: (r.comments_count ?? 0) + (r.reactions_count ?? 0), updatedAt: r.updated_at ?? "" });
      if (out.length >= PICK_CANDIDATES) break;
    }
    return out;
  }

  /** Embedding search, then the model's pick when today's spend is under the cap. A failed call falls back to the embedding answer. */
  async find(question: string, repo?: string): Promise<Found> {
    const { db, log } = this.#d;
    const q = question.slice(0, QUESTION_CHARS);
    const cands = await this.candidates(q, repo);
    const strip = ({ body: _b, score: _s, activity: _a, updatedAt: _u, ...m }: Candidate): Match => m;
    const fallback = (): Found => ({ matches: cands.filter((c) => c.score >= FALLBACK_MIN_SCORE).slice(0, PICK_MAX).sort(byActivity).map(strip), judged: false });
    if (!cands.length) return { matches: [], judged: true };
    let mode: "usd" | "tokens";
    try { mode = providerBudgetMode(db, "Discord search"); }
    catch (error) {
      if (!(error instanceof CodexBudgetError)) throw error;
      log(`discord: ${error.message}`);
      return { ...fallback(), budgetError: error.message };
    }
    const spent = spentTodayUsd(db, (this.#d.now ?? Date.now)());
    if (mode === "usd" && (spent === null || spent >= dailyCapUsd(db))) return fallback();
    const input: PickInput = { ref: "discord", question: q, candidates: cands.map((c) => ({ ref: `${c.repo}#${c.number}`, title: c.title, body: c.body, closed: c.closed })) };
    try {
      const text = await (this.#d.ask ?? askHaiku)(db, input);
      const picks = text === null ? null : parsePicks(text, input.candidates);
      if (!picks) return fallback();
      const by = new Map(cands.map((c) => [`${c.repo}#${c.number}`, c]));
      return { matches: picks.map((p) => ({ c: by.get(p.ref)!, reason: p.reason })).sort((a, b) => byActivity(a.c, b.c))
        .map(({ c, reason }) => ({ ...strip(c), ...(reason && { reason }) })), judged: true };
    } catch (e) {
      log(`discord: search model call failed: ${oneLine((e as Error).message, 200)}`);
      return e instanceof CodexBudgetError ? { ...fallback(), budgetError: e.message } : fallback();
    } finally {
      try { dropTexts(db); } catch (e) { log(`discord: removing search texts failed: ${(e as Error).message}`); }
    }
  }
}
