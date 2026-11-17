// The Queue page: tabs All, Review, Fix, Verify and Merge over one repo filter, with fast-tracked items first, plus
// the operator's fast-track, hold and batch controls. Reads are for anyone signed in, limited to the repos the
// requester may see; every write is for operators (the route says so) and audited.
import { prBuildView } from "../../prbuild/view.ts";
import { canSeeInternals } from "./staff.ts";
import type { DatabaseSync } from "node:sqlite";
import type { FastPosition, MergeWait, NextMerge, QueueMergeRow, QueueOrigin, QueuePage, QueueRepos, QueueTab, QueueWorkRow, TypeLabel } from "../../../web/src/api/types.ts";
import { cachedQueue, openViews, type CachedEntry } from "../../core/plan-read.ts";
import { addFastTrack, fastPositions, fastTrackList, FastTrackError, parseItemRef, parseWeight, removeFastTrack, setFastTrackWeight } from "../../fasttrack.ts";
import { preapproveMerge } from "../../preapproval/index.ts";
import type { Exec } from "../../fixup/git.ts";
import { ControlError, holdMerge, releaseMerge, removeFromBatch, stopBatch } from "../../merge/controls.ts";
import { pageBatches } from "../../merge/batch-store.ts";
import { pipelineRepos } from "../../pilot.ts";
import { mergeOrder, queueSlots, scoreLookup } from "../../rank/position.ts";
import { classifyListOf, NOT_PLANNED } from "../../rank/next.ts";
import type { RankBreakdown } from "../../rank/score.ts";
import { HttpError } from "../server/util.ts";
import type { Req } from "../types.ts";
import { toBatch, toRow } from "./queue.ts";
import { needVisible, visibleRepos } from "./visible.ts";
import { readerOf, veiledFor } from "./reader.ts";
import { stageById } from "../../stages/registry.ts";

export const TABS: QueueTab[] = ["all", "review", "fix", "verify", "merge"];
const NEXT_LIMIT = 10;

/** The tab a work row belongs to besides All, from its next step. */
export function tabOfNext(next: string): QueueTab | null {
  if (next === stageById("review").title) return "review";
  if (next.startsWith("Fix")) return "fix";
  if (next.startsWith("Verify")) return "verify";
  return null;
}

const WAITS: Record<string, [MergeWait, string, number]> = {
  ready: ["ready", "Ready", 0],
  "decision-answered-merge": ["ready", "Merge approved", 0],
  refused: ["refused", "Refused; tried again when GitHub reports something new", 1],
  "in-batch": ["batch-ci", "In a batch; waiting for the batch PR's CI", 1],
  "batch-checking": ["batch-check", "In a batch; checked in the sandbox", 1],
  "waiting-ci": ["ci", "Waiting for CI", 2],
  "waiting-main-ci": ["ci", "Waiting: main CI red", 2],
  "ci-approval": ["ci", "Waiting for CI run approval", 2],
  "waiting-verify": ["verify", "Waiting for Verify", 2],
  "waiting-premerge": ["premerge", "Waiting for the pre-merge review", 2],
};
const HELD: [MergeWait, string, number] = ["held", "Merge held by an operator", 9];

/** What merges next and what each PR waits for, from the queue states (src/merge/queue.ts). Fast-tracked first, held last. */
export function nextMerges(entries: CachedEntry[], fast: Map<string, FastPosition>, batchOf: Map<string, { id: number; branch: string }>, scores: Map<string, number>): NextMerge[] {
  const items = entries.flatMap((e) => {
    const w = e.held && e.state in WAITS ? HELD : e.state === "ci-approval" && e.runsBlocked ? WAITS[e.state]!.map((x, k) => (k === 1 ? "CI runs need a person to approve" : x)) as [MergeWait, string, number] : WAITS[e.state];
    return w ? [{ e, w }] : [];
  });
  items.sort((a, b) => {
    const fa = fast.get(`${a.e.repo}#${a.e.number}`)?.position ?? Infinity, fb = fast.get(`${b.e.repo}#${b.e.number}`)?.position ?? Infinity;
    return (a.w[2] === 9 ? 1 : 0) - (b.w[2] === 9 ? 1 : 0) || fa - fb || a.w[2] - b.w[2]
      || (scores.get(`${b.e.repo}#${b.e.number}`) ?? -1) - (scores.get(`${a.e.repo}#${a.e.number}`) ?? -1) || a.e.repo.localeCompare(b.e.repo) || a.e.number - b.e.number;
  });
  return items.slice(0, NEXT_LIMIT).map(({ e, w }) => ({
    repo: e.repo, number: e.number, title: e.title, waitsFor: w[0], label: w[1], fast: fast.get(`${e.repo}#${e.number}`) ?? null, batch: batchOf.get(`${e.repo}#${e.number}`) ?? null,
  }));
}

export async function queuePage(db: DatabaseSync, req: Req): Promise<QueuePage> {
  const tab = (req.query.get("tab") || "all") as QueueTab;
  if (!TABS.includes(tab)) throw new HttpError(400, `tab must be one of ${TABS.join(", ")}`);
  const reposParam = (req.query.get("repos") || "pipeline") as QueueRepos;
  const limit = Math.min(Math.max(Number(req.query.get("limit")) || 100, 1), 500);
  const offset = Math.max(Number(req.query.get("offset")) || 0, 0);
  const visible = await visibleRepos(db, req);
  const visibleSet = new Set(visible);
  if (reposParam !== "pipeline" && reposParam !== "all" && !visibleSet.has(reposParam)) throw new HttpError(404, `${reposParam} is not a tracked repo`);
  const scoped = reposParam === "pipeline" ? new Set([...openViews(db)].filter(([, v]) => v.scope).map(([k]) => k)) : null;
  const fast = new Map([...fastPositions(db)].filter(([k]) => visibleSet.has(k.slice(0, k.lastIndexOf("#")))));
  // The default view is the pipeline's scope (src/rank/position.ts), the same one the position badges count.
  const inScope = (repo: string, number: number): boolean =>
    reposParam === "all" ? visibleSet.has(repo) : reposParam === "pipeline" ? visibleSet.has(repo) && scoped!.has(`${repo}#${number}`) : repo === reposParam;
  const fastOf = (repo: string, number: number): FastPosition | null => fast.get(`${repo}#${number}`) ?? null;
  const held = new Set((db.prepare("SELECT repo, number FROM main.merge_holds").all() as { repo: string; number: number }[]).map((r) => `${r.repo}#${r.number}`));

  // A linked item (`item=repo:number`) comes with the first page: it is cut long enough to include the item.
  const item = req.query.get("item");
  const indexOf = (list: { repo: string; number: number }[]): number | null => {
    const at = item ? list.findIndex((r) => `${r.repo}:${r.number}` === item) : -1;
    return at < 0 ? null : at;
  };
  const sizeFor = (list: { repo: string; number: number }[], from: number): number => {
    const at = from === 0 ? indexOf(list) : null;
    return at === null ? limit : Math.min(500, Math.max(limit, Math.ceil((at + 1) / 100) * 100));
  };

  // Work rows (All, Review, Fix, Verify): each item's next step is the one its cached Plan stored; the position badges read the same rows.
  const allEntries = cachedQueue(db, { merged: "exclude" });
  const slots = queueSlots(db, visible);
  const score = scoreLookup(db);
  type Row = { repo: string; number: number; kind: string; title: string | null; score: number; breakdown: string; next: string | null; label: string | null; item_state: string | null };
  const ranked = db.prepare(`SELECT i.repo, i.number, i.kind, i.title, r.score, r.breakdown, json_extract(p.view, '$.next') AS next, json_extract(p.view, '$.label') AS label, p.item_state
    FROM items i JOIN item_rank r ON r.repo = i.repo AND r.number = i.number LEFT JOIN item_plans p ON p.repo = i.repo AND p.number = i.number
    WHERE i.state = 'OPEN' ORDER BY r.score DESC, i.repo, i.number`).all() as Row[];
  // Fast-tracked items (and the Fix PRs of fast-tracked issues) first, then the work rank.
  const inView = ranked.filter((r) => visibleSet.has(r.repo) && inScope(r.repo, r.number)).map((r) => ({ r, s: score(r.repo, r.number) ?? r.score }));
  inView.sort((a, b) => b.s - a.s);
  const work: QueueWorkRow[] = inView.map(({ r }) => {
    const bd = JSON.parse(r.breakdown) as RankBreakdown;
    return {
      repo: r.repo, number: r.number, kind: r.kind === "pr" ? "pr" : "issue", title: r.title ?? "", score: r.score, level: bd.level, size: bd.size, breakdown: bd,
      label: r.label as TypeLabel | null, next: r.next ?? NOT_PLANNED, nextHref: r.item_state === "referee-due" ? classifyListOf(r.repo) : null,
      queue: slots.get(`${r.repo}#${r.number}`) ?? null, fast: fastOf(r.repo, r.number), held: held.has(`${r.repo}#${r.number}`),
    };
  });

  // Merge queue rows
  const entries = allEntries.filter((e) => e.state !== "merged" && visibleSet.has(e.repo) && inScope(e.repo, e.number));
  const internals = canSeeInternals(req);
  const reader = await readerOf(db, req);
  const closes = closingIssues(db);
  const originOf = queueOrigins(db, internals);
  const asRow = (e: CachedEntry): QueueMergeRow => ({ ...toRow(e, reader), fast: fastOf(e.repo, e.number), held: e.held, prBuild: prBuildView(db, e.repo, e.number, e.head, internals), closes: closes.get(`${e.repo}#${e.number}`) ?? [], added: originOf(e) });
  // Tabs come from the stored next step; the text is veiled afterwards, so a quiet pull request stays in its tab.
  const tabOf = new Map(work.map((w) => [w, tabOfNext(w.next)]));
  const veilNext = (w: QueueWorkRow): QueueWorkRow => (veiledFor(reader, w.repo, w.number) ? { ...w, next: "" } : w);
  const count = (t: QueueTab): number => (t === "all" ? work.length : t === "merge" ? entries.length : work.filter((w) => tabOf.get(w) === t).length);
  const counts = { all: count("all"), review: count("review"), fix: count("fix"), verify: count("verify"), merge: count("merge") };

  const out: QueuePage = { tab, repos: reposParam, counts, rows: [], mergeRows: [], nextMerges: [], batches: [], total: 0, next: null };
  if (tab !== "merge") {
    const match = tab === "all" ? work : work.filter((w) => tabOf.get(w) === tab);
    out.itemIndex = indexOf(match);
    out.rows = match.slice(offset, offset + sizeFor(match, offset)).map(veilNext);
    out.total = match.length;
    out.next = offset + out.rows.length < match.length ? offset + out.rows.length : null;
    return out;
  }
  const { batches } = pageBatches(db, { hidden: reader.hidden, limit: 100 });
  const active = batches.filter((b) => (b.state === "checking" || b.state === "open") && b.prs.some((p) => inScope(b.repo, p.number)));
  const rowOf = new Map(entries.map((e) => [`${e.repo}#${e.number}`, asRow(e)]));
  const batchOf = new Map(active.flatMap((b) => b.prs.map((p) => [`${b.repo}#${p.number}`, { id: b.id, branch: b.branch }] as const)));
  const scores = new Map((db.prepare("SELECT repo, number, score FROM item_rank").all() as { repo: string; number: number; score: number }[]).map((r) => [`${r.repo}#${r.number}`, r.score]));
  const free = mergeOrder(db, entries).map(asRow);
  out.itemIndex = indexOf(free);
  out.mergeRows = free.slice(offset, offset + sizeFor(free, offset));
  out.total = free.length;
  out.next = offset + out.mergeRows.length < free.length ? offset + out.mergeRows.length : null;
  out.nextMerges = nextMerges(entries, fast, batchOf, scores);
  out.batches = active.map((b) => toBatch(b, b.prs.flatMap((p) => rowOf.get(`${b.repo}#${p.number}`) ?? [])));
  return out;
}

/**
 * How each PR came into the merge queue, and who put it there: an active pre-approval (added with Queue items, a Merge answer carried to a
 * new head, or a pre-approval after a fix-up), else an operator's Merge answer at the reviewed head, else the take review itself.
 * Operator logins are shown to staff only.
 */
export function queueOrigins(db: DatabaseSync, staff: boolean): (e: CachedEntry) => QueueOrigin {
  type Pre = { id: number; repo: string; number: number; by: string; at: string; instructions: string; from_head: string; head: string | null };
  const pre = new Map<string, Pre>();
  for (const p of db.prepare("SELECT id, repo, number, by, at, instructions, from_head, head FROM preapprovals WHERE state IN ('fixup', 'review', 'ci', 'queued') ORDER BY id").all() as Pre[]) pre.set(`${p.repo}#${p.number}`, p);
  const answer = db.prepare("SELECT answered_by, answered_at FROM decisions WHERE id = ? AND answer = 'merge'");
  // A Merge answer carried to a new head is audited as such when its row is made; a queued row's head also moves with our own pushes.
  const carried = db.prepare("SELECT 1 FROM audit WHERE action = 'preapproval' AND target = :target AND json_extract(details, '$.id') = :id AND json_extract(details, '$.carried') IS NOT NULL");
  const who = (login: string | null | undefined) => (staff ? login || null : null);
  return (e) => {
    const p = pre.get(`${e.repo}#${e.number}`);
    if (p) return { how: p.instructions ? "preapproved" : carried.get({ target: `${p.repo}#${p.number}`, id: p.id }) ? "answer" : "queued", by: who(p.by), at: p.at };
    const d = e.decisionId ? (answer.get(e.decisionId) as { answered_by: string | null; answered_at: string | null } | undefined) : undefined;
    if (d) return { how: "answer", by: who(d.answered_by), at: d.answered_at };
    return { how: "review", by: null, at: e.reviewedAt };
  };
}

/** The issues each PR closes when it merges (GitHub's closing references, from the mirror), by `repo#number`; PRs without any are left out. */
function closingIssues(db: DatabaseSync): Map<string, number[]> {
  const rows = db.prepare("SELECT repo, number, closing_issues FROM main.items INDEXED BY items_closing WHERE kind = 'pr' AND closing_issues IS NOT NULL AND closing_issues <> '[]'").all() as { repo: string; number: number; closing_issues: string }[];
  const out = new Map<string, number[]>();
  for (const r of rows) {
    try {
      const ns = (JSON.parse(r.closing_issues) as unknown[]).filter((x): x is number => typeof x === "number");
      if (ns.length) out.set(`${r.repo}#${r.number}`, ns);
    } catch {
      // A malformed list is left out.
    }
  }
  return out;
}

// ---- repo list, fast track and merge controls --------------------------------

/** Visible repos whose pipeline is on. */
export async function pipelineRepoNames(db: DatabaseSync, req: Req): Promise<string[]> {
  const on = pipelineRepos(db);
  return (await visibleRepos(db, req)).filter((r) => on.has(r));
}

/** Open fast-tracked items as `repo#number`, first to run first. */
export async function fastTrackRefs(db: DatabaseSync, req: Req): Promise<string[]> {
  const visible = new Set(await visibleRepos(db, req));
  return fastTrackList(db).filter((f) => visible.has(f.repo)).map((f) => `${f.repo}#${f.number}`);
}

/** PRs whose merge an operator holds, as `repo#number`, in visible repos. */
export async function heldMergeRefs(db: DatabaseSync, req: Req): Promise<string[]> {
  const visible = new Set(await visibleRepos(db, req));
  const rows = db.prepare("SELECT repo, number FROM main.merge_holds ORDER BY repo, number").all() as { repo: string; number: number }[];
  return rows.filter((r) => visible.has(r.repo)).map((r) => `${r.repo}#${r.number}`);
}

function item(req: Req): { repo: string; number: number } {
  const b = req.json;
  const text = b && typeof b === "object" && !Array.isArray(b) ? (b as { item?: unknown }).item : undefined;
  try {
    return parseItemRef(text);
  } catch (e) {
    throw new HttpError(400, (e as Error).message);
  }
}

/** Runs a library call, turning its errors into HTTP ones. */
async function guarded<T>(f: () => Promise<T> | T): Promise<T> {
  try {
    return await f();
  } catch (e) {
    if (e instanceof FastTrackError || e instanceof ControlError) throw new HttpError(e.status, e.message);
    throw e;
  }
}

export async function fastTrackAdd(db: DatabaseSync, req: Req): Promise<string[]> {
  const r = item(req);
  await needVisible(db, req, r.repo);
  await guarded(() => addFastTrack(db, req.user.login, `${r.repo}#${r.number}`));
  return fastTrackRefs(db, req);
}

/** The `weight` of the JSON body, checked; the default when it has none. */
function weightOf(req: Req): number {
  const b = req.json;
  const w = b && typeof b === "object" && !Array.isArray(b) ? (b as { weight?: unknown }).weight : undefined;
  try {
    return parseWeight(w);
  } catch (e) {
    throw new HttpError(400, (e as Error).message);
  }
}

export async function fastTrackWeight(db: DatabaseSync, req: Req): Promise<string[]> {
  const r = item(req);
  const w = weightOf(req);
  await needVisible(db, req, r.repo);
  await guarded(() => setFastTrackWeight(db, req.user.login, `${r.repo}#${r.number}`, w));
  return fastTrackRefs(db, req);
}

/** Fast-tracks an item with weight `w`; one already fast-tracked keeps a heavier weight it has, so this only ever moves it up. */
async function markFast(db: DatabaseSync, by: string, repo: string, number: number, w: number): Promise<void> {
  const ref = `${repo}#${number}`;
  const had = (db.prepare("SELECT weight FROM main.fast_track WHERE repo = ? AND number = ?").get(repo, number) as { weight: number } | undefined)?.weight;
  await guarded(() => (had === undefined ? addFastTrack(db, by, ref, w) : w > had ? setFastTrackWeight(db, by, ref, w) : null));
}

/** The open PRs of `repo` that close issue `issue` when they merge (GitHub's closing references, from the mirror). */
function openPrsClosing(db: DatabaseSync, repo: string, issue: number): number[] {
  const rows = db.prepare("SELECT number, closing_issues FROM main.items INDEXED BY items_closing WHERE repo = ? AND kind = 'pr' AND state = 'OPEN' AND closing_issues IS NOT NULL AND closing_issues <> '[]'").all(repo) as { number: number; closing_issues: string }[];
  return rows
    .filter((p) => {
      try {
        return (JSON.parse(p.closing_issues) as unknown[]).includes(issue);
      } catch {
        return false;
      }
    })
    .map((p) => p.number)
    .sort((a, b) => a - b);
}

/**
 * "Queue items", one line. A PR is pre-approved at its current head (it merges once the review says take, the pre-merge review is clean
 * and CI is green) and fast-tracked with the weight, so its review, checks and merge come first. An issue is fast-tracked, so Fix works it
 * first; when exactly one open PR closes it, that PR is queued as above. Several closing PRs are only listed: a person picks one.
 */
export async function queueAdd(db: DatabaseSync, req: Req): Promise<{ label: string; fast: string[] }> {
  const r = item(req);
  const w = weightOf(req);
  await needVisible(db, req, r.repo);
  const by = req.user.login;
  const kind = (db.prepare("SELECT kind FROM main.items WHERE repo = ? AND number = ?").get(r.repo, r.number) as { kind: string } | undefined)?.kind;
  if (kind === "issue") {
    await markFast(db, by, r.repo, r.number, w);
    const prs = openPrsClosing(db, r.repo, r.number);
    let rest: string;
    if (!prs.length) rest = "no open PR closes it yet";
    else if (prs.length > 1) rest = `${prs.map((n) => `#${n}`).join(", ")} close it; queue one of them`;
    else {
      try {
        preapproveMerge(db, { repo: r.repo, number: prs[0]!, by });
        try {
          await markFast(db, by, r.repo, prs[0]!, w);
          rest = `queued #${prs[0]}, which closes it`;
        } catch (e) {
          rest = `queued #${prs[0]}, which closes it, but did not fast-track it: ${(e as Error).message}`;
        }
      } catch (e) {
        rest = `#${prs[0]} closes it but was not queued: ${(e as Error).message}`;
      }
    }
    return { label: `Fast-tracked the issue; ${rest}`, fast: await fastTrackRefs(db, req) };
  }
  let done: { label: string };
  try {
    done = preapproveMerge(db, { repo: r.repo, number: r.number, by });
  } catch (e) {
    throw new HttpError(409, (e as Error).message);
  }
  await markFast(db, by, r.repo, r.number, w);
  return { label: done.label, fast: await fastTrackRefs(db, req) };
}

export async function fastTrackRemove(db: DatabaseSync, req: Req): Promise<string[]> {
  const r = item(req);
  await needVisible(db, req, r.repo);
  await guarded(() => removeFastTrack(db, req.user.login, `${r.repo}#${r.number}`));
  return fastTrackRefs(db, req);
}

export async function mergeHoldPr(db: DatabaseSync, req: Req, on: boolean): Promise<{ ok: true }> {
  const r = item(req);
  await needVisible(db, req, r.repo);
  const changed = await guarded(() => (on ? holdMerge(db, req.user.login, r.repo, r.number) : releaseMerge(db, req.user.login, r.repo, r.number)));
  if (!changed) throw new HttpError(409, `${r.repo}#${r.number} is ${on ? "already" : "not"} held`);
  return { ok: true };
}

export async function batchRemovePr(db: DatabaseSync, req: Req, run?: Exec): Promise<{ batch: string; closed: number | null }> {
  const r = item(req);
  await needVisible(db, req, r.repo);
  return guarded(() => removeFromBatch(db, req.user.login, r.repo, r.number, run));
}

export async function batchStop(db: DatabaseSync, req: Req, run?: Exec): Promise<{ batch: string; prs: number[]; held: number[]; closed: number | null }> {
  const id = Number(req.params.id);
  const repo = Number.isInteger(id) ? (db.prepare("SELECT repo FROM main.merge_batches WHERE id = ?").get(id) as { repo: string } | undefined)?.repo : undefined;
  if (!repo) throw new HttpError(404, `no batch ${req.params.id}`);
  await needVisible(db, req, repo);
  return guarded(() => stopBatch(db, req.user.login, id, run));
}
