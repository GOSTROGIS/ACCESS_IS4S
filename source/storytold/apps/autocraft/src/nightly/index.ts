// Nightly checks per repo (build feature "nightly"): once a day a repo's selected checks run as sandbox tasks at the
// default branch head, below all PR work. A later run of the step reads the finished tasks (pass or fail from the exit
// codes, never from a model), stores one result per check, parses benchmark lines, and, for a check that fails two
// nights running, asks an operator whether to open an issue. Nothing is read, written or queued while the switch is off.
import { readFileSync } from "node:fs";
import type { DatabaseSync } from "node:sqlite";
import type { BuildTask } from "../../web/src/api/types.ts";
import { absolute } from "../build/artifacts.ts";
import { listEnvs } from "../build/envs.ts";
import { featureOn } from "../build/features.ts";
import { createTask, getTask, MAX_QUEUED, TERMINAL } from "../build/tasks.ts";
import { CLI_BY, type By } from "../core/gates.ts";
import { guardRepo } from "../core/guard.ts";
import { actionable, ask, getDecision } from "../decisions.ts";
import { createIssue, IssueError } from "../github/write.ts";
import { exec } from "../fixup/git.ts";
import { mainCiRepos } from "../mainci/index.ts";
import { cleanLine } from "../review/post-template.ts";
import { scrub } from "../runner/scrub.ts";
import { outcomeOf } from "../verify/results.ts";
import { checkOf, NIGHTLY_CHECKS, type CheckOpts, type NightlyCheck } from "./checks.ts";

export { NIGHTLY_CHECKS, checkOf } from "./checks.ts";
export type { NightlyCheck, CheckOpts } from "./checks.ts";

export const ACTOR = "nightly";
/** Nightly tasks wait behind PR verification (0) and the warm build (-10). */
export const NIGHTLY_PRIORITY = -20;
/** The once-a-day schedule: a repo with a run started within this long ago is not queued again. */
const DAY_MS = 24 * 3600_000;
export const NIGHTLY_EVERY_MS = DAY_MS;
/** A run whose tasks never finished (no environment claims them) blocks the next night's run for this long, so tasks do not pile up. */
export const STALE_RUN_MS = 3 * DAY_MS;
export const BENCH_KEEP_MS = 180 * 24 * 3600_000;
/** A bench is judged against its last 7 nights, once at least this many are known. */
export const BENCH_WINDOW = 7;
export const BENCH_MIN_HISTORY = 3;
export const BENCH_WARN_RATIO = 1.1;
export const OPEN_ISSUE = "open-issue";
export const NOT_NOW = "not-now";
/** Failing nights in a row before an operator is asked. */
export const STREAK_TO_ASK = 2;

export type ResultState = "queued" | "pass" | "fail" | "error" | "skipped" | "warn";
export type NightlyResult = { runId: number; checkId: string; taskId: number | null; state: ResultState; summary: string | null; issueNumber: number | null; decisionId: string | null; finishedAt: string | null };
export type NightlyRun = { id: number; repo: string; sha: string; startedAt: string; state: "running" | "done" };
export type NightlySelection = { repo: string; checkId: string; enabled: boolean; crates: string[]; targets: string[] };
export type BenchPoint = { repo: string; bench: string; sha: string; at: string; value: number; unit: string };

export type NightlyDeps = {
  now: () => Date;
  /** Toolchain names some enabled, online build environment reports. */
  toolchains: (db: DatabaseSync) => Set<string>;
  /** The text of a finished task's artifact, or null. */
  readArtifact: (db: DatabaseSync, taskId: number, name: string) => string | null;
  /** Opens the issue the operator asked for; throws IssueError. The default checks the repo's comment approval first. */
  openIssue: (db: DatabaseSync, o: { repo: string; title: string; body: string; decisionId: string; by: By }) => Promise<{ number: number; url: string }>;
};

export type NightlySummary = { repo: string; queued: number; skipped: number; collected: number; asked: number; issues: number; note: string | null };

// ---- selection ----------------------------------------------------------------

type SelRow = { repo: string; check_id: string; enabled: number; params: string | null };
const paramsOf = (s: string | null): { crates: string[]; targets: string[] } => {
  try {
    const o = JSON.parse(s ?? "{}") as { crates?: unknown; targets?: unknown };
    const list = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
    return { crates: list(o.crates), targets: list(o.targets) };
  } catch { return { crates: [], targets: [] }; }
};

/** The repo's rows for checks the catalogue knows, in catalogue order. */
export function selectionOf(db: DatabaseSync, repo: string): NightlySelection[] {
  const rows = db.prepare("SELECT * FROM nightly_selection WHERE repo = ?").all(repo) as SelRow[];
  return NIGHTLY_CHECKS.flatMap((c) => {
    const r = rows.find((x) => x.check_id === c.id);
    return r ? [{ repo, checkId: c.id, enabled: r.enabled === 1, ...paramsOf(r.params) }] : [];
  });
}

/** Sets one check on or off for a repo, keeping its crates and targets unless new ones are given. */
export function setSelection(db: DatabaseSync, repo: string, checkId: string, enabled: boolean, o: { crates?: string[]; targets?: string[] } = {}): void {
  if (!checkOf(checkId)) throw new Error(`unknown nightly check ${checkId}`);
  const old = selectionOf(db, repo).find((s) => s.checkId === checkId);
  const params = JSON.stringify({ crates: o.crates ?? old?.crates ?? [], targets: o.targets ?? old?.targets ?? [] });
  db.prepare("INSERT INTO nightly_selection (repo, check_id, enabled, params) VALUES (?, ?, ?, ?) ON CONFLICT(repo, check_id) DO UPDATE SET enabled = excluded.enabled, params = excluded.params")
    .run(repo, checkId, enabled ? 1 : 0, params);
}

const enabledChecks = (db: DatabaseSync, repo: string): { check: NightlyCheck; opts: CheckOpts }[] =>
  selectionOf(db, repo).filter((s) => s.enabled).map((s) => ({ check: checkOf(s.checkId)!, opts: { crates: s.crates, targets: s.targets } }));

// ---- schedule -----------------------------------------------------------------

/** The default branch head the main CI poll last read for a tracked repo, or null. */
const headOf = (db: DatabaseSync, repo: string): string | null => mainCiRepos(db).find((r) => r.repo === repo)?.headSha ?? null;

/** A run started since `since`, or one still running that started since `staleSince`. */
const recentRun = (db: DatabaseSync, repo: string, since: string, staleSince: string): boolean =>
  !!db.prepare("SELECT 1 FROM nightly_runs WHERE repo = ? AND (started_at > ? OR (state = 'running' AND started_at > ?)) LIMIT 1").get(repo, since, staleSince);

const nightlyDecision = (repo: string, id: string): boolean => id.startsWith(`${repo}:nightly:`);

const TERMINAL_SQL = TERMINAL.map((s) => `'${s}'`).join(", ");

/**
 * Whether a run of the step has work for the repo: an answered issue decision, a result whose task ended, or (the
 * once-a-day schedule, in data, not a timer) a selected check, a known head and no run started in the last 24 hours.
 */
export function nightlyDue(db: DatabaseSync, repo: string, nowMs: number = Date.now()): boolean {
  if (!featureOn(db, "nightly", repo)) return false;
  if (actionable(db).some((a) => a.kind === "other" && nightlyDecision(repo, a.id))) return true;
  if (db.prepare(`SELECT 1 FROM nightly_results r JOIN nightly_runs u ON u.id = r.run_id JOIN build_tasks t ON t.id = r.task_id
    WHERE u.repo = ? AND r.state = 'queued' AND t.state IN (${TERMINAL_SQL}) LIMIT 1`).get(repo)) return true;
  if (!enabledChecks(db, repo).length) return false;
  const since = new Date(nowMs - NIGHTLY_EVERY_MS).toISOString();
  if (recentRun(db, repo, since, new Date(nowMs - STALE_RUN_MS).toISOString())) return false;
  return headOf(db, repo) !== null;
}

/** The lane's candidates: tracked repos with the work above, sorted. */
export const nightlyRepos = (db: DatabaseSync, tracked: string[], nowMs: number = Date.now()): string[] =>
  tracked.filter((r) => nightlyDue(db, r, nowMs)).sort();

// ---- reading ------------------------------------------------------------------

type ResRow = { run_id: number; check_id: string; task_id: number | null; state: ResultState; summary: string | null; issue_number: number | null; decision_id: string | null; finished_at: string | null };
const resultOf = (r: ResRow): NightlyResult => ({ runId: r.run_id, checkId: r.check_id, taskId: r.task_id, state: r.state, summary: r.summary, issueNumber: r.issue_number, decisionId: r.decision_id, finishedAt: r.finished_at });

/** Newest runs of a repo with their results; for the Nightly page. */
export function recentRuns(db: DatabaseSync, repo: string, limit = 14): (NightlyRun & { results: NightlyResult[] })[] {
  const runs = db.prepare("SELECT * FROM nightly_runs WHERE repo = ? ORDER BY id DESC LIMIT ?").all(repo, limit) as { id: number; repo: string; sha: string; started_at: string; state: "running" | "done" }[];
  return runs.map((u) => ({
    id: u.id, repo: u.repo, sha: u.sha, startedAt: u.started_at, state: u.state,
    results: (db.prepare("SELECT * FROM nightly_results WHERE run_id = ? ORDER BY check_id").all(u.id) as ResRow[]).map(resultOf),
  }));
}

/** A bench's points, oldest first. */
export function benchSeries(db: DatabaseSync, repo: string, bench: string): BenchPoint[] {
  return (db.prepare("SELECT * FROM nightly_bench WHERE repo = ? AND bench = ? ORDER BY at, sha").all(repo, bench) as BenchPoint[]);
}

export function defaultDeps(): NightlyDeps {
  return {
    now: () => new Date(),
    toolchains: (db) => new Set(listEnvs(db).filter((e) => e.enabled && e.online).flatMap((e) => e.capabilities?.toolchains ?? [])),
    readArtifact: (db, taskId, name) => {
      const row = db.prepare("SELECT file FROM build_artifacts WHERE task_id = ? AND name = ?").get(taskId, name) as { file: string } | undefined;
      const path = row ? absolute(row.file) : null;
      if (!path) return null;
      try { return readFileSync(path, "utf8"); } catch { return null; }
    },
    openIssue: async (db, o) => {
      const g = guardRepo(db, o.repo, "comment", o.by, o.decisionId);
      if ("refused" in g) throw new IssueError(g.refused, true);
      return createIssue({ db, login: ACTOR }, g, exec, { repo: o.repo, target: `${o.repo}:nightly`, title: o.title, body: o.body }, { by: "operator", model: "haiku" }, { decision: o.decisionId });
    },
  };
}

// ---- benchmarks ---------------------------------------------------------------

/** The lines of `cargo bench -- --output-format bencher`: `test name ... bench:   1,234 ns/iter (+/- 56)`. */
export function parseBench(text: string): { bench: string; value: number; unit: string }[] {
  const out: { bench: string; value: number; unit: string }[] = [];
  for (const line of text.split("\n")) {
    const m = /^test\s+(\S+)\s+\.\.\.\s+bench:\s+([\d,]+(?:\.\d+)?)\s+(\S+)/.exec(line);
    if (m) out.push({ bench: m[1]!.slice(0, 200), value: Number(m[2]!.replace(/,/g, "")), unit: m[3]!.slice(0, 20) });
  }
  return out;
}

const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
};

/** Stores the points and returns the benches more than 10% above the median of their last 7 earlier nights. */
function storeBench(db: DatabaseSync, repo: string, sha: string, at: string, points: { bench: string; value: number; unit: string }[]): { bench: string; pct: number }[] {
  const slow: { bench: string; pct: number }[] = [];
  const earlier = db.prepare("SELECT value FROM nightly_bench WHERE repo = ? AND bench = ? AND sha <> ? AND at < ? ORDER BY at DESC LIMIT ?");
  for (const p of points) {
    const prior = (earlier.all(repo, p.bench, sha, at, BENCH_WINDOW) as { value: number }[]).map((r) => r.value);
    if (prior.length >= BENCH_MIN_HISTORY) {
      const m = median(prior);
      if (m > 0 && p.value > m * BENCH_WARN_RATIO) slow.push({ bench: p.bench, pct: Math.round((p.value / m - 1) * 100) });
    }
    db.prepare("INSERT OR REPLACE INTO nightly_bench (repo, bench, sha, at, value, unit) VALUES (?, ?, ?, ?, ?, ?)").run(repo, p.bench, sha, at, p.value, p.unit);
  }
  return slow;
}

/** Drops benchmark points older than BENCH_KEEP_MS. */
export function pruneBench(db: DatabaseSync, nowMs: number = Date.now()): number {
  return Number(db.prepare("DELETE FROM nightly_bench WHERE at < ?").run(new Date(nowMs - BENCH_KEEP_MS).toISOString()).changes);
}

// ---- collecting ---------------------------------------------------------------

const one = (s: string, n = 200): string => scrub(s).replace(/\s+/g, " ").trim().slice(0, n);

/** Advisory ids only: the audit's text never reaches an issue. */
export function advisoryIds(text: string | null): string[] {
  return [...new Set(text?.match(/RUSTSEC-\d{4}-\d{4}/g) ?? [])].slice(0, 20);
}

function judge(db: DatabaseSync, c: NightlyCheck, t: BuildTask, run: NightlyRun, at: string, deps: NightlyDeps): { state: ResultState; summary: string | null } {
  const o = outcomeOf(t);
  if (o.kind === "error") return { state: "error", summary: one(o.reason) };
  if (o.kind === "fail") {
    const why = o.timedOut ? "timed out" : `exit ${o.exitCode ?? "none"}`;
    if (c.kind === "audit") {
      const ids = advisoryIds(c.artifact ? deps.readArtifact(db, t.id, c.artifact) : null);
      return { state: "fail", summary: ids.length ? `advisories: ${ids.join(", ")}` : `${o.step} failed (${why})` };
    }
    return { state: "fail", summary: `${o.step} failed (${why})` };
  }
  if (c.kind === "bench") {
    const text = c.artifact ? deps.readArtifact(db, t.id, c.artifact) : null;
    const points = text ? parseBench(text) : [];
    if (!points.length) return { state: "error", summary: "no benchmark lines in the output" };
    const slow = storeBench(db, run.repo, run.sha, at, points);
    if (slow.length) return { state: "warn", summary: one(`slower than the 7-night median: ${slow.slice(0, 5).map((s) => `${s.bench} +${s.pct}%`).join(", ")}${slow.length > 5 ? `, ${slow.length - 5} more` : ""}`, 300) };
  }
  return { state: "pass", summary: null };
}

/** The earlier results of one check, newest first, from runs before `runId`. */
const history = (db: DatabaseSync, repo: string, checkId: string, runId: number): ResRow[] =>
  db.prepare("SELECT r.* FROM nightly_results r JOIN nightly_runs u ON u.id = r.run_id WHERE u.repo = ? AND r.check_id = ? AND r.run_id < ? ORDER BY r.run_id DESC").all(repo, checkId, runId) as ResRow[];

const decisionIdOf = (repo: string, checkId: string, startRun: number): string => `${repo}:nightly:${checkId}@${startRun}`;

/** Issue text: fixed layout; the summary is scrubbed and, for an audit, only advisory ids. */
export function nightlyIssueBody(c: NightlyCheck, sha: string, summary: string | null): string {
  return `The nightly check "${cleanLine(c.label, 80)}" failed on the default branch at ${sha.slice(0, 8)} on two nights in a row.${summary ? `\n\n${cleanLine(summary, 300)}` : ""}`;
}
const issueTitle = (c: NightlyCheck): string => `Nightly check fails: ${cleanLine(c.label, 80)}`;

/**
 * After a failure: the failing streak is the consecutive failed nights before this one (a skipped or errored night says
 * nothing; a pass or warn ends it). A streak of two asks one decision, keyed by the streak's first run, so a repeat
 * failure of an issue-opened streak asks nothing; the next streak after a green night asks again.
 */
function afterFailure(db: DatabaseSync, c: NightlyCheck, run: NightlyRun, summary: string | null, at: string, s: NightlySummary): void {
  if (c.experimental) return;
  let start = run.id, count = 1;
  for (const h of history(db, run.repo, c.id, run.id)) {
    if (h.state === "error" || h.state === "skipped" || h.state === "queued") continue;
    if (h.state !== "fail") break;
    start = h.run_id; count++;
  }
  const id = decisionIdOf(run.repo, c.id, start);
  const known = getDecision(db, id);
  if (count < STREAK_TO_ASK && !known) return;
  if (!known) {
    ask(db, [{
      id, kind: "other", repo: run.repo, number: 0,
      question: `Open an issue for the nightly check "${cleanLine(c.label, 80)}" on ${run.repo}'s default branch?`,
      context: `The check failed ${count} nights in a row. AutoCraft can open one issue with the check name and the failure; it opens no second issue until the check has passed again.`,
      facts: [`check: ${c.id}`, `head: ${run.sha.slice(0, 8)}`, ...(summary ? [`failure: ${cleanLine(summary, 300)}`] : [])],
      options: [
        { key: OPEN_ISSUE, label: "Open issue", hint: "AutoCraft opens one issue on the repo with the check and the failure." },
        { key: NOT_NOW, label: "Not now", hint: "Nothing is posted." },
      ],
      recommended: OPEN_ISSUE, recommended_reason: "A failure that repeats is not a flake.",
      public_text: nightlyIssueBody(c, run.sha, summary), asked_by: ACTOR, asked_at: at,
    }]);
    s.asked++;
  }
  const issue = (db.prepare("SELECT issue_number AS n FROM nightly_results WHERE decision_id = ? AND issue_number IS NOT NULL LIMIT 1").get(id) as { n: number } | undefined)?.n ?? null;
  db.prepare("UPDATE nightly_results SET decision_id = ?, issue_number = ? WHERE run_id = ? AND check_id = ?").run(id, issue, run.id, c.id);
  // The streak's earlier failures point at the same decision.
  db.prepare("UPDATE nightly_results SET decision_id = ? WHERE decision_id IS NULL AND state = 'fail' AND check_id = ? AND run_id >= ? AND run_id IN (SELECT id FROM nightly_runs WHERE repo = ?)").run(id, c.id, start, run.repo);
}

function collect(db: DatabaseSync, repo: string, deps: NightlyDeps, s: NightlySummary): void {
  const at = deps.now().toISOString();
  const runs = db.prepare("SELECT * FROM nightly_runs WHERE repo = ? AND state = 'running' ORDER BY id").all(repo) as { id: number; repo: string; sha: string; started_at: string; state: "running" }[];
  for (const u of runs) {
    const run: NightlyRun = { id: u.id, repo: u.repo, sha: u.sha, startedAt: u.started_at, state: u.state };
    for (const r of db.prepare("SELECT * FROM nightly_results WHERE run_id = ? AND state = 'queued' ORDER BY check_id").all(u.id) as ResRow[]) {
      const c = checkOf(r.check_id);
      const t = r.task_id === null ? null : getTask(db, r.task_id);
      if (!c || !t) { db.prepare("UPDATE nightly_results SET state = 'error', summary = ?, finished_at = ? WHERE run_id = ? AND check_id = ?").run(!c ? "check no longer in the catalogue" : "the build task is gone", at, u.id, r.check_id); s.collected++; continue; }
      if (!TERMINAL.includes(t.state)) continue;
      const j = judge(db, c, t, run, t.endedAt ?? at, deps);
      db.prepare("UPDATE nightly_results SET state = ?, summary = ?, finished_at = ? WHERE run_id = ? AND check_id = ?").run(j.state, j.summary, at, u.id, r.check_id);
      s.collected++;
      if (j.state === "fail") afterFailure(db, c, run, j.summary, at, s);
    }
    if (!db.prepare("SELECT 1 FROM nightly_results WHERE run_id = ? AND state = 'queued'").get(u.id)) db.prepare("UPDATE nightly_runs SET state = 'done' WHERE id = ?").run(u.id);
  }
}

/** Opens the issues operators asked for and records the "not now" answers. */
async function applyAnswers(db: DatabaseSync, repo: string, deps: NightlyDeps, log: (l: string) => void, s: NightlySummary, by: By): Promise<void> {
  for (const a of actionable(db).filter((x) => x.kind === "other" && nightlyDecision(repo, x.id))) {
    const at = deps.now().toISOString();
    const done = (): void => void db.prepare("UPDATE main.decisions SET applied_at = ? WHERE id = ? AND applied_at IS NULL").run(at, a.id);
    if (a.answer === NOT_NOW) { done(); continue; }
    if (a.answer !== OPEN_ISSUE) continue;
    const rows = db.prepare("SELECT r.*, u.sha FROM nightly_results r JOIN nightly_runs u ON u.id = r.run_id WHERE r.decision_id = ? ORDER BY r.run_id DESC").all(a.id) as (ResRow & { sha: string })[];
    const last = rows[0];
    const c = last && checkOf(last.check_id);
    if (!last || !c || rows.some((r) => r.issue_number !== null)) { done(); continue; }
    try {
      const made = await deps.openIssue(db, { repo, title: issueTitle(c), body: nightlyIssueBody(c, last.sha, last.summary), decisionId: a.id, by });
      db.prepare("UPDATE nightly_results SET issue_number = ? WHERE decision_id = ?").run(made.number, a.id);
      done();
      s.issues++;
      log(`  ${repo}: opened ${made.url}`);
    } catch (e) {
      // A refusal leaves the answer unapplied for the next run; an unclear failure may have left an issue, so it is not retried.
      const clear = e instanceof IssueError && e.clear;
      log(`  ${repo}: issue for ${c.id} not opened: ${one(String((e as Error).message ?? e))}`);
      if (!clear) done();
    }
  }
}

// ---- queueing -----------------------------------------------------------------

/** One run: a row, and per selected check a queued task, or `skipped` when no environment has the toolchain or the selection leaves nothing to run. */
function queueRun(db: DatabaseSync, repo: string, deps: NightlyDeps, s: NightlySummary): void {
  const sha = headOf(db, repo);
  const checks = enabledChecks(db, repo);
  if (!sha || !checks.length) return;
  const nowMs = deps.now().getTime();
  if (recentRun(db, repo, new Date(nowMs - NIGHTLY_EVERY_MS).toISOString(), new Date(nowMs - STALE_RUN_MS).toISOString())) return;
  const queued = (db.prepare("SELECT COUNT(*) AS n FROM build_tasks WHERE state = 'queued'").get() as { n: number }).n;
  if (queued + checks.length > MAX_QUEUED) { s.note = "the build queue is full; tried again at the next run"; return; }
  const have = deps.toolchains(db);
  const at = new Date(nowMs).toISOString();
  db.exec("BEGIN IMMEDIATE");
  try {
    const runId = Number(db.prepare("INSERT INTO nightly_runs (repo, sha, started_at, state) VALUES (?, ?, ?, 'running')").run(repo, sha, at).lastInsertRowid);
    for (const { check, opts } of checks) {
      const insert = (taskId: number | null, state: ResultState, summary: string | null): void =>
        void db.prepare("INSERT INTO nightly_results (run_id, check_id, task_id, state, summary, finished_at) VALUES (?, ?, ?, ?, ?, ?)").run(runId, check.id, taskId, state, summary, state === "queued" ? null : at);
      if (!have.has(check.toolchain)) { insert(null, "skipped", "no toolchain"); s.skipped++; continue; }
      const plan = check.steps(opts);
      if (!plan) { insert(null, "skipped", check.id === "fuzz" ? "no fuzz targets chosen" : "no crates chosen"); s.skipped++; continue; }
      const id = createTask(db, { step: "nightly", repo, headSha: sha, baseSha: sha, requires: { os: "linux", toolchains: [check.toolchain] }, priority: NIGHTLY_PRIORITY, plan });
      insert(id, "queued", null);
      s.queued++;
    }
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}

/** One repo: answers first, then results of finished tasks, then (once a day) the next run. Nothing at all with the switch off. */
export async function runNightly(db: DatabaseSync, params: { repo: string; by?: By; onHandled?: (n: number) => void }, log: (l: string) => void = console.log, deps: NightlyDeps = defaultDeps()): Promise<NightlySummary> {
  const { repo } = params;
  const s: NightlySummary = { repo, queued: 0, skipped: 0, collected: 0, asked: 0, issues: 0, note: null };
  if (!featureOn(db, "nightly", repo)) {
    s.note = `the Nightly checks feature is off for ${repo}`;
    log(`nightly ${repo}: ${s.note}; nothing done`);
    return s;
  }
  await applyAnswers(db, repo, deps, log, s, params.by ?? CLI_BY);
  collect(db, repo, deps, s);
  queueRun(db, repo, deps, s);
  params.onHandled?.(s.queued + s.skipped + s.collected + s.issues);
  log(`nightly ${repo}: queued ${s.queued}, skipped ${s.skipped}, collected ${s.collected}, asked ${s.asked}, issues ${s.issues}`);
  return s;
}
