// Group comparison: one call per set of same-kind members of a duplicate group.
// PRs go to Opus with read-only tools on a checkout of the base, issues to Sonnet
// without tools. A closed or merged member wins without a call; a set of more than
// GROUP_MAX members is compared in rounds whose winners meet. When the model gives
// no valid answer the canonical rule decides (source "rule"). Reads GitHub (live
// state, diffs); never writes to it.
//
//   autocraft dupe-compare [--limit N] [--dry-run]
import { jobItem } from "../runner/job-items.ts";
import { referenceDir } from "../reference.ts";
import { defaultSemanticDeps, type SemanticDeps } from "../reference-lint.ts";
import type { DatabaseSync } from "node:sqlite";
import { queueRoom } from "../agents/call.ts";
import { runModelStep } from "../agents/step.ts";
import { COMPARE_ISSUES, COMPARE_PRS } from "../agents/steps.ts";
import { add, askClaude, pool, saveUsage, type Usage } from "../classify/run.ts";
import { audit } from "../dash/audit.ts";
import { connect } from "../db.ts";
import { ownerOf } from "../owners.ts";
import { Client, type Querier } from "../mirror.ts";
import { CLAUDE_PROMPTS } from "../prompts/index.ts";
import { checksOf } from "../review/checks.ts";
import { cachedDiff, codeDiff, ghDiff, type DiffFetcher } from "../review/diff.ts";
import { REPO_PATH } from "../sandbox/command.ts";
import type { Lint } from "../replylint.ts";
import { compareCanonical, canonInfo, pickCanonical } from "./canonical.ts";
import { askGroupDecisions } from "./decide.ts";
import {
  GROUP_DIFF_CHARS, GROUP_MAX, prsRef, 
  type CompareIssue, type CompareIssues, type ComparePr, type ComparePrs,
} from "./group.ts";
import { dueSets, rememberDrop, saveComparison, storedComparison, type ComparisonResult, type KindSet, type StoredComparison } from "./plan.ts";

const PR_PROMPT = CLAUDE_PROMPTS["dupes.compare-prs.opus"];
const ISSUE_PROMPT = CLAUDE_PROMPTS["dupes.compare-issues.sonnet"];

/** Most sets compared per job unless the step's limit says otherwise. */
export const DEFAULT_LIMIT = 50;

export type Reply = { text: string; usage: Usage } | null;
export type CompareDeps = {
  /** Reads the live state and head of the members just before the model calls; absent: the mirror's view stands. */
  querier?: Querier;
  fetchDiff: DiffFetcher;
  /** Host directory with a read-only checkout of the base for a sandboxed call, or null to ask without tools. Absent: no tools. */
  baseCheckout?: (repo: string) => Promise<string | null>;
  /** `lint`: see AskOptions; a reply of the real `ask` may carry the lint's remaining problems and whether a fix turn ran. */
  ask(id: "dupes.compare-prs.opus", model: string, input: ComparePrs, checkout?: string, lint?: Lint): Promise<Reply>;
  ask(id: "dupes.compare-issues.sonnet", model: string, input: CompareIssues): Promise<Reply>;
  now(): Date;
  /** The semantic reference check of carry points; absent: the default (Jev, then Haiku). */
  semantic?: SemanticDeps;
};

export type CompareParams = { limit?: number; repo?: string; dryRun?: boolean; onHandled?: (n: number) => void };
export type CompareSummary = { due: number; compared: number; byRule: number; closedWins: number; single: number; dropped: number; asked: string[]; dryRun: boolean };

/** A read-only checkout of the repo's default branch at its current head, or null (no sandbox, no head, fetch failed). */
export async function baseCheckout(db: DatabaseSync, repo: string): Promise<string | null> {
  const { branchOf, defaultDeps } = await import("../fixissue/index.ts");
  const { checkoutForCommit } = await import("../sandbox/index.ts");
  const branch = branchOf(db, repo);
  const sha = await defaultDeps().mainHead(repo, branch);
  return sha ? checkoutForCommit(repo, branch, sha, console.log) : null;
}

export function defaultCompareDeps(db: DatabaseSync): CompareDeps {
  return {
    querier: new Client(500), fetchDiff: ghDiff,
    baseCheckout: (repo) => baseCheckout(db, repo),
    ask: ((id: "dupes.compare-prs.opus" | "dupes.compare-issues.sonnet", model: string, input: ComparePrs | CompareIssues, checkout?: string, lint?: Lint) =>
      askClaude(id, model, [input] as never, db, { checkout, reference: checkout ? referenceDir(input.ref.split("#")[0]!) : undefined, lint })) as CompareDeps["ask"],
    now: () => new Date(),
  };
}

export const liveQuery = (numbers: number[]) => `query($owner: String!, $name: String!) {
  repository(owner: $owner, name: $name) {${numbers.map((n) => `
    i${n}: issueOrPullRequest(number: ${n}) { __typename ... on Issue { state } ... on PullRequest { state headRefOid } }`).join("")}
  }
}`;

/** Live state and head of the items; an item GitHub returned null for is left out. */
async function liveOf(q: Querier, repo: string, numbers: number[]): Promise<Map<number, { state: string; head: string | null }>> {
  const out = new Map<number, { state: string; head: string | null }>();
  const data = await q.query(liveQuery(numbers), { owner: ownerOf(repo), name: repo }) as { repository?: Record<string, { state?: string; headRefOid?: string } | null> };
  for (const n of numbers) {
    const x = data.repository?.[`i${n}`];
    if (x?.state) out.set(n, { state: x.state, head: x.headRefOid ?? null });
  }
  return out;
}

const NOW_ISO = (d: CompareDeps) => d.now().toISOString();

function viaRule(db: DatabaseSync, s: KindSet, at: string, error: string | null, source: "rule" | "closed" | "single"): StoredComparison {
  const numbers = s.members.map((m) => m.number);
  const c = pickCanonical(db, s.repo, numbers);
  const others = numbers.filter((n) => n !== c.number).map((number) => (s.kind === "pr" ? { number, duplicate: true, better: [], carry: [] } : { number, adds: [] }));
  const reason = source === "closed" ? c.why : source === "single" ? "the only one" : `kept by rule: ${c.why}`;
  return { repo: s.repo, key: s.key, kind: s.kind, members: numbers, hash: s.hash, kept: c.number, source, model: null, reason, result: { others, rounds: 0 }, error, attempts: 0, at };
}

type Ctx = { db: DatabaseSync; deps: CompareDeps; log: (l: string) => void; checkouts: Map<string, Promise<string | null>>; runId: string };

const bodyOf = (db: DatabaseSync, repo: string, n: number) =>
  db.prepare("SELECT title, body, state, author_association, comments_count, closing_issues, head_oid FROM items WHERE repo = ? AND number = ?").get(repo, n) as
    { title: string | null; body: string | null; state: string; author_association: string | null; comments_count: number | null; closing_issues: string | null; head_oid: string | null };

async function prInput(x: Ctx, repo: string, numbers: number[]): Promise<ComparePrs> {
  const share = Math.floor(GROUP_DIFF_CHARS / numbers.length);
  const prs: ComparePr[] = [];
  for (const n of numbers) {
    const it = bodyOf(x.db, repo, n);
    let diff = "", files: string[] = [];
    if (it.head_oid) {
      const d = await cachedDiff(repo, n, it.head_oid, x.deps.fetchDiff);
      if (d.ok) {
        let cd = codeDiff(d.text);
        if (!cd.files.length && cd.testsOmitted.length) cd = codeDiff(d.text, true);
        files = cd.files;
        diff = cd.text.length > share ? `${cd.text.slice(0, share)}\n[diff cut]` : cd.text;
      } else diff = `[diff unavailable: ${d.error}]`;
    }
    const checks = it.head_oid ? checksOf(x.db, repo, n) : undefined;
    const review = it.head_oid ? (x.db.prepare("SELECT verdict FROM final_reviews WHERE repo = ? AND number = ? AND head_oid = ?").get(repo, n, it.head_oid) as { verdict: string } | undefined)?.verdict ?? null : null;
    let linked: number[] = [];
    try { const v = JSON.parse(it.closing_issues ?? "[]") as unknown; if (Array.isArray(v)) linked = v.filter((k): k is number => typeof k === "number"); } catch { /* none */ }
    prs.push({
      ref: `#${n}`, title: it.title ?? "", body: it.body ?? "", state: it.state.toLowerCase(), author_association: it.author_association,
      linked_issues: linked.map((k) => `#${k}`), ci: checks?.head_oid === it.head_oid ? checks.overall : "unknown", review, files, diff,
    });
  }
  return { ref: prsRef(repo, numbers), prs };
}

function issueInput(db: DatabaseSync, repo: string, numbers: number[]): CompareIssues {
  const issues: CompareIssue[] = numbers.map((n) => {
    const it = bodyOf(db, repo, n);
    return { ref: `#${n}`, title: it.title ?? "", body: it.body ?? "", state: it.state.toLowerCase(), author_association: it.author_association, comments: it.comments_count ?? 0 };
  });
  return { ref: prsRef(repo, numbers), issues };
}

type Chunk = { keep: number; reason: string; summary: string | null; why: string | null; others: ComparisonResult["others"] };

/** One call for up to GROUP_MAX members; null when the model gave no valid answer. */
async function compareChunk(x: Ctx, s: KindSet, numbers: number[], usage: { u: Usage; model: string }): Promise<Chunk | null> {
  const { deps } = x;
  if (s.kind === "pr") {
    const input = await prInput(x, s.repo, numbers);
    let checkout: string | null = null;
    if (deps.baseCheckout) {
      if (!x.checkouts.has(s.repo)) x.checkouts.set(s.repo, deps.baseCheckout(s.repo).catch(() => null));
      checkout = await x.checkouts.get(s.repo)!;
    }
    if (checkout) input.repo_dir = REPO_PATH;
    const model = PR_PROMPT.models[0]!;
    usage.model = model;
    // Carry points reach the close comment and the kept PR's suggestion: they get the reference checks of posted text.
    const dir = referenceDir(s.repo);
    const semantic = dir ? deps.semantic ?? defaultSemanticDeps(x.db, input.ref) : undefined;
    const r = await runModelStep(x.db, COMPARE_PRS, { numbers, input }, { ctx: { dir, semantic }, ask: (i, lint) => deps.ask("dupes.compare-prs.opus", model, i.input, checkout ?? undefined, lint) });
    usage.u = add(usage.u, r.usage);
    return r.ok ? r.value : null;
  }
  const input = issueInput(x.db, s.repo, numbers);
  const model = ISSUE_PROMPT.models[0]!;
  usage.model = model;
  const r = await runModelStep(x.db, COMPARE_ISSUES, { numbers, input }, { ask: (i) => deps.ask("dupes.compare-issues.sonnet", model, i.input) });
  usage.u = add(usage.u, r.usage);
  return r.ok ? r.value : null;
}

/** Compares the whole set, in rounds when it is larger than GROUP_MAX. */
async function compareSet(x: Ctx, s: KindSet): Promise<StoredComparison> {
  const at = NOW_ISO(x.deps);
  // Best by rule first, so every chunk holds a mix of strong and weak members and the rule's pick reaches the last round.
  const infos = canonInfo(x.db, s.repo, s.members.map((m) => m.number)).sort(compareCanonical);
  let current = infos.map((i) => i.number);
  const usage = { u: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: null } as Usage, model: "" };
  const start = at;
  const lost = new Map<number, { winner: number; other: ComparisonResult["others"][number] }>();
  let rounds = 0, last: Chunk | null = null;
  for (;;) {
    // Dealt round-robin, so every chunk holds a mix of strong and weak members.
    const count = Math.ceil(current.length / GROUP_MAX);
    const chunks: number[][] = Array.from({ length: count }, () => []);
    current.forEach((n, i) => chunks[i % count]!.push(n));
    const winners: number[] = [];
    for (const chunk of chunks) {
      if (chunk.length === 1) { winners.push(chunk[0]!); continue; }
      const r = await compareChunk(x, s, chunk, usage);
      if (!r) {
        saveUsage(x.db, x.runId, `dupes-compare-${s.key.replace(/[^A-Za-z0-9]/g, "-")}`, "dupes", usage.model, 0, usage.u, start, NOW_ISO(x.deps));
        return viaRule(x.db, s, at, "no valid answer from the model", "rule");
      }
      winners.push(r.keep);
      last = r;
      for (const o of r.others) lost.set(o.number, { winner: r.keep, other: o });
    }
    rounds++;
    current = winners;
    if (chunks.length === 1) break;
  }
  const kept = current[0]!;
  saveUsage(x.db, x.runId, `dupes-compare-${s.key.replace(/[^A-Za-z0-9]/g, "-")}`, "dupes", usage.model, s.members.length, usage.u, start, NOW_ISO(x.deps));
  const others = s.members.map((m) => m.number).filter((n) => n !== kept).sort((a, b) => a - b).map((n) => {
    const l = lost.get(n)!;
    return { ...l.other, ...(l.winner !== kept ? { via: l.winner } : {}) };
  });
  return {
    repo: s.repo, key: s.key, kind: s.kind, members: s.members.map((m) => m.number), hash: s.hash, kept, source: "model", model: usage.model,
    reason: last?.reason ?? null, summary: last?.summary ?? null, why: last?.why ?? null, result: { others, rounds }, error: null, attempts: 0, at,
  };
}

export async function runDupeCompare(db: DatabaseSync, params: CompareParams = {}, log: (line: string) => void = console.log, deps?: CompareDeps): Promise<CompareSummary> {
  if (params.limit !== undefined && !(Number.isInteger(params.limit) && params.limit >= 0)) throw new Error("limit must be a whole number ≥ 0");
  const d = deps ?? defaultCompareDeps(db);
  const s: CompareSummary = { due: 0, compared: 0, byRule: 0, closedWins: 0, single: 0, dropped: 0, asked: [], dryRun: !!params.dryRun };
  const sets = dueSets(db, params.repo, d.now().getTime());
  s.due = sets.length;
  if (params.dryRun) {
    log(`dupe-compare: ${sets.length} sets to compare; dry run, nothing written`);
    return s;
  }
  const runId = `dupe-compare-${d.now().toISOString().replace(/[-:]/g, "").slice(0, 15)}`;
  const x: Ctx = { db, deps: d, log, checkouts: new Map(), runId };
  let calls: KindSet[] = [];
  for (const set of sets) {
    const at = NOW_ISO(d);
    if (set.members.some((m) => m.state !== "OPEN")) {
      saveComparison(db, viaRule(db, set, at, null, "closed"), set);
      s.closedWins++;
    } else if (set.members.length < 2) {
      saveComparison(db, viaRule(db, set, at, null, "single"), set);
      s.single++;
    } else calls.push(set);
  }
  if (d.querier && calls.length) {
    // The mirror can be minutes behind: a set with a member closed or pushed since is compared on a later pass.
    const live = new Map<string, Map<number, { state: string; head: string | null }>>();
    try {
      for (const repo of new Set(calls.map((c) => c.repo))) live.set(repo, await liveOf(d.querier, repo, [...new Set(calls.filter((c) => c.repo === repo).flatMap((c) => c.members.map((m) => m.number)))]));
    } catch (e) {
      log(`dupe-compare: live state unavailable (${String((e as Error).message ?? e)}); nothing asked`);
      calls = [];
    }
    const asked = calls.length;
    calls = calls.filter((c) => {
      const l = live.get(c.repo)!;
      const bad = c.members.find((m) => { const v = l.get(m.number); return !v || v.state !== m.state || (m.kind === "pr" && v.head !== m.head_oid); });
      if (bad) {
        jobItem(db, c.repo, bad.number, `dropped from duplicate set ${c.key}, it changed on GitHub since the last sync`, log);
        rememberDrop(db, c, NOW_ISO(d));
      }
      return !bad;
    });
    s.dropped = asked - calls.length;
  }
  if (params.limit !== undefined) calls = calls.slice(0, params.limit);
  let handled = 0;
  await pool(calls.map((set) => async () => {
    const r = await compareSet(x, set);
    if (r.source === "rule") {
      const prev = storedComparison(db, set.repo, set.key);
      r.attempts = (prev && prev.source === "rule" && prev.hash === set.hash ? prev.attempts : 0) + 1;
    }
    saveComparison(db, r, set);
    if (r.source === "rule") {
      s.byRule++;
      log(`  ${set.repo} ${set.key}: no valid answer; kept #${r.kept} by rule`);
    } else s.compared++;
    for (const m of set.members) jobItem(db, set.repo, m.number, `compared in duplicate set ${set.key}, keep #${r.kept}${r.source === "rule" ? " (by rule)" : ""}`, () => {});
    params.onHandled?.(++handled);
  }), () => queueRoom(db));
  s.asked = askGroupDecisions(db, params.repo, NOW_ISO(d));
  log(`dupe-compare: ${s.compared} compared by a model, ${s.byRule} by rule, ${s.closedWins} won by a closed member, ${s.single} single, ${s.dropped} dropped; ${s.asked.length} decisions asked`);
  return s;
}

function parseArgs(args: string[]): CompareParams {
  const p: CompareParams = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (a === "--dry-run") p.dryRun = true;
    else if (a === "--limit" && args[i + 1] !== undefined) p.limit = Number(args[++i]);
    else throw new Error(`unknown or incomplete option ${a}; usage: dupe-compare [--limit N] [--dry-run]`);
  }
  return p;
}

/** Makes the stored comparisons that include the item not current, so the next dupe-compare step compares their sets again and refreshes the open group decision. Returns how many it marked. */
export function compareAgain(db: DatabaseSync, by: string, repo: string, number: number): number {
  const n = Number(db.prepare(`UPDATE dupe_comparisons SET hash = 'again:' || hash WHERE repo = ? AND hash NOT LIKE 'again:%'
    AND EXISTS (SELECT 1 FROM json_each(dupe_comparisons.members) WHERE value = ?)`).run(repo, number).changes);
  if (n) audit(db, by, "compare-again", `${repo}#${number}`, { sets: n });
  return n;
}

export const commands = {
  "dupe-compare": {
    summary: "dupe-compare [--limit N] [--dry-run] | again REPO#N [--by LOGIN]: compare each duplicate group in one pass (Opus for PRs, Sonnet for issues) and ask the group decisions; again compares the sets that include the item once more",
    async run(args: string[]): Promise<void> {
      const db = connect();
      if (args[0] === "again") {
        const m = /^([\w.-]+)#(\d+)$/.exec(args[1] ?? "");
        const by = args[2] === "--by" && args[3] ? args[3] : "cli";
        if (!m || args.length !== (args[2] ? 4 : 2)) throw new Error("usage: autocraft dupe-compare again <repo>#<number> [--by <login>]");
        const n = compareAgain(db, by, m[1]!, Number(m[2]));
        console.log(n ? `${args[1]}: ${n} comparison${n === 1 ? "" : "s"} marked; the next dupe-compare step compares again` : `${args[1]}: no stored comparison includes it`);
        return;
      }
      console.log(JSON.stringify(await runDupeCompare(db, parseArgs(args), (l) => console.error(l))));
    },
  },
};
