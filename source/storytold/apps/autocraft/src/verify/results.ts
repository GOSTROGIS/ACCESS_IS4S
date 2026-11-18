// Part 2 of the Verify stage: result collection from finished tasks, the failure summary, the retry of
// an infrastructure error and the cancel of tasks whose PR moved on. Part 1 (index.ts) only plans and queues.
// Pass or fail comes from the tasks' exit codes, never from a model; Haiku only describes a failure.
import { parseServingMetadata, serializeServingMetadata, summarizeStoredServingMetadata, type ServingMetadata } from "../agents/provenance.ts";
import { CodexUsageError } from "../agents/codex/budget.ts";
import { modelPolicy } from "../agents/codex/config.ts";
import { setAsideAnswerBeforeFailure } from "../merge/verify-override.ts";
import { leaseItem } from "../runner/leases.ts";
import type { DatabaseSync } from "node:sqlite";
import type { BuildTask, TaskResult, TaskStep } from "../../web/src/api/types.ts";
import { BuildError } from "../build/envs.ts";
import { TERMINAL, cancelTask, getTask } from "../build/tasks.ts";
import { add, askClaude, POOL_MAX, pool, saveUsage, type Usage } from "../classify/run.ts";
import { queueRoom } from "../agents/call.ts";
import { CLAUDE_PROMPTS } from "../prompts/index.ts";
import { scrub } from "../runner/scrub.ts";
import { cloneTask } from "./tasks.ts";
import { MAX_SUMMARY_WORDS, SUMMARY_LOG_BYTES, type VerifySummaryInput } from "./types.ts";
import { pilotSqlFor } from "../pilot.ts";
import { backlogHeldSql } from "../dupes/held.ts";
import { jobItem } from "../runner/job-items.ts";
import { collectScreenshots, screenshotsDue, type ScreenshotDeps } from "./screenshots.ts";

const PROMPT = CLAUDE_PROMPTS["verify.summary"];
const ACTOR = "verify";
/** The step whose failure says nothing about the change: it only downloads dependencies. */
const FETCH = "fetch deps";
/** An automatic retry per head: the new tasks run once more, then an error stays. */
export const MAX_RETRIES = 1;
export const NOT_FAILING_REASON = "regression test passes on base";
/** The PR's current head, as src/review/candidates.ts headOf picks it: the checks table's when fetched after the mirror last saw the PR change. */
export const CURRENT_HEAD_SQL = `CASE WHEN c.head_oid IS NOT NULL AND c.fetched_at IS NOT NULL AND (i.updated_at IS NULL OR c.fetched_at > i.updated_at)
  THEN c.head_oid ELSE COALESCE(i.head_oid, c.head_oid) END`;
const ERROR_LIMIT = 200;

export const VERIFICATION_STATES = ["planned", "running", "passed", "failed", "error", "ci-enough", "stale", "unavailable"] as const;
export type VerificationState = (typeof VERIFICATION_STATES)[number];

// ---- reading -----------------------------------------------------------------

export type VerificationTask = { id: number; role: "head" | "base"; state: BuildTask["state"]; results: TaskResult[]; summary: string | null; endedAt: string | null };
export type VerificationView = {
  repo: string; number: number; headSha: string; baseSha: string | null;
  kind: string; reason: string; plan: unknown; model: string | null;
  state: VerificationState;
  /** Why it failed or errored; for a failure written by Haiku. Null otherwise. */
  summary: string | null;
  /** On a pass: what the result does not show, such as a regression test that also passes on the base. */
  note: string | null;
  createdAt: string; finishedAt: string | null;
  /** Head task first, then the base task of a regression. After a retry these are the newest tasks. */
  tasks: VerificationTask[];
};

type Row = {
  serving_metadata: string | null;
  repo: string; number: number; head_sha: string; base_sha: string | null; kind: string; reason: string; plan: string | null; model: string | null;
  head_task_id: number | null; base_task_id: number | null; state: VerificationState; summary: string | null; note: string | null;
  created_at: string; finished_at: string | null;
};

function viewOf(db: DatabaseSync, r: Row): VerificationView {
  const tasks: VerificationTask[] = [];
  for (const [role, id] of [["head", r.head_task_id], ["base", r.base_task_id]] as const) {
    const t = id === null ? null : getTask(db, id);
    if (t) tasks.push({ id: t.id, role, state: t.state, results: t.results, summary: t.summary, endedAt: t.endedAt });
  }
  let plan: unknown = null;
  try { plan = r.plan === null ? null : JSON.parse(r.plan); } catch { /* stored by our own code; keep null */ }
  return {
    repo: r.repo, number: r.number, headSha: r.head_sha, baseSha: r.base_sha, kind: r.kind, reason: r.reason, plan, model: r.model, state: r.state,
    summary: r.summary, note: r.note, createdAt: r.created_at, finishedAt: r.finished_at, tasks,
  };
}

/** The verification of one PR head, or null. */
export function verificationOf(db: DatabaseSync, repo: string, number: number, headSha: string): VerificationView | null {
  const r = db.prepare("SELECT * FROM verifications WHERE repo = ? AND number = ? AND head_sha = ?").get(repo, number, headSha) as Row | undefined;
  return r ? viewOf(db, r) : null;
}

/** Verifications in the given states (all when none), newest first. */
export function listVerifications(db: DatabaseSync, o: { states?: VerificationState[]; repo?: string; limit?: number } = {}): VerificationView[] {
  const where: string[] = [], args: (string | number)[] = [];
  if (o.states?.length) { where.push(`state IN (${o.states.map(() => "?").join(",")})`); args.push(...o.states); }
  if (o.repo) { where.push("repo = ?"); args.push(o.repo); }
  const rows = db.prepare(`SELECT * FROM verifications ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY created_at DESC, number DESC LIMIT ?`)
    .all(...args, Math.min(o.limit ?? 100, 1000)) as Row[];
  return rows.map((r) => viewOf(db, r));
}

// ---- when to run -------------------------------------------------------------

const TERMINAL_SQL = TERMINAL.map((s) => `'${s}'`).join(", ");

/**
 * Whether a collection run has work: a pending verification whose PR head moved or closed, whose tasks are all
 * finished, or that is still `planned` while a task has started. One query on the state index.
 */
export function collectDue(db: DatabaseSync): boolean {
  return !!db.prepare(`SELECT 1 FROM verifications v
    LEFT JOIN items i ON i.repo = v.repo AND i.number = v.number
    LEFT JOIN pr_checks c ON c.repo = v.repo AND c.number = v.number
    LEFT JOIN build_tasks h ON h.id = v.head_task_id
    LEFT JOIN build_tasks b ON b.id = v.base_task_id
    WHERE v.state IN ('planned', 'running') AND ${pilotSqlFor("v.repo", "v.number")} AND NOT ${backlogHeldSql("v")} AND (
      i.state IS NOT 'OPEN' OR (${CURRENT_HEAD_SQL}) IS NOT v.head_sha
      OR (h.state IN (${TERMINAL_SQL}) AND (b.id IS NULL OR b.state IN (${TERMINAL_SQL})))
      OR (v.state = 'planned' AND (h.state IN ('claimed', 'running') OR b.state IN ('claimed', 'running'))))
    LIMIT 1`).get() || screenshotsDue(db);
}

// ---- judging tasks -----------------------------------------------------------

export type Outcome =
  | { kind: "pass" }
  | { kind: "fail"; step: string; exitCode: number | null; timedOut: boolean }
  | { kind: "error"; reason: string };

export const oneLine = (s: string): string => scrub(s).replace(/\s+/g, " ").trim().slice(0, ERROR_LIMIT);
const ok = (r: TaskResult): boolean => r.exitCode === 0 && !r.timedOut;

/** What a finished task says, from its state and exit codes. Callers pass only terminal tasks. */
export function outcomeOf(t: BuildTask): Outcome {
  if (t.state === "cancelled") return { kind: "error", reason: "the build task was cancelled" };
  if (t.state === "done") {
    return t.results.length === t.plan.length && t.results.every(ok) ? { kind: "pass" } : { kind: "error", reason: "the build task finished without a result for every step" };
  }
  // Lost, or failed. No step result means the task never got to run one: a lost worker, a malformed task, a patch that does not apply.
  const bad = t.results.find((r) => !ok(r));
  if (!bad) return { kind: "error", reason: oneLine(t.summary ?? "the build task failed before running a step") };
  const fetchStep = t.plan.find((s) => s.network === "fetch")?.name ?? FETCH;
  if (bad.step === fetchStep) return { kind: "error", reason: `${bad.step} ${bad.timedOut ? "timed out" : `failed (exit ${bad.exitCode ?? "none"})`}` };
  if (bad.exitCode === null && !bad.timedOut) return { kind: "error", reason: `${bad.step}: the build environment could not run it` };
  return { kind: "fail", step: bad.step, exitCode: bad.exitCode, timedOut: bad.timedOut };
}

export type Verdict = { state: "passed" | "failed" | "error"; note?: string; failed?: { role: "head" | "base"; step: string; exitCode: number | null; timedOut: boolean }; reason?: string };

/** Combines the head task's outcome and, for a regression, the base task's. */
export function verdictOf(head: Outcome, base: Outcome | null): Verdict {
  if (head.kind === "fail") return { state: "failed", failed: { role: "head", step: head.step, exitCode: head.exitCode, timedOut: head.timedOut } };
  if (head.kind === "error") return { state: "error", reason: head.reason };
  if (!base) return { state: "passed" };
  if (base.kind === "error") return { state: "error", reason: `base commit: ${base.reason}` };
  if (base.kind === "pass") return { state: "failed", reason: NOT_FAILING_REASON };
  if (base.step === "test") return base.timedOut ? { state: "passed", note: "regression test timed out on the base commit" } : { state: "passed" };
  return { state: "passed", note: "base commit did not build with the regression test, so the test was not shown to fail there" };
}

// ---- the run -----------------------------------------------------------------

export type CollectDeps = {
  model: string;
  /** The head commit of a repo's default branch, or null; used to cancel queued warm builds of a branch that moved on. */
  mainHead?: (repo: string, branch: string) => Promise<string | null>;
  /** The screenshot comparison, replaceable in tests. */
  screenshots?: ScreenshotDeps;
};

export type CollectSummary = {
  runId: string; looked: number; passed: number; failed: number; errors: number; retried: number; stale: number; running: number;
  warmCancelled: number; /** Screenshot runs that left planned/running. */ shots: number; /** Verifications that left planned/running, plus warm builds cancelled. */ changed: number;
};

const now = (): string => new Date().toISOString();
const cut = (s: string): string => s.trim().split(/\s+/).slice(0, MAX_SUMMARY_WORDS).join(" ");

function stageRow(db: DatabaseSync, v: Row, stage: string, at: string, note: string): void {
  db.prepare("INSERT INTO main.stages (repo, number, stage, at, actor, note) VALUES (?, ?, ?, ?, ?, ?)").run(v.repo, v.number, stage, at, ACTOR, note.slice(0, 300));
  if (stage !== "hold") jobItem(db, v.repo, v.number, note, () => {});   // the caller logs the outcome itself
}

/** The last bytes of the log chunks one step wrote. */
function stepLog(db: DatabaseSync, id: number, step: string): string {
  const parts: string[] = [];
  let size = 0;
  for (const c of db.prepare("SELECT chunk FROM build_task_logs WHERE task_id = ? AND step = ? ORDER BY seq DESC").iterate(id, step) as Iterable<{ chunk: string }>) {
    parts.push(c.chunk);
    size += Buffer.byteLength(c.chunk);
    if (size >= SUMMARY_LOG_BYTES) break;
  }
  const all = Buffer.from(parts.reverse().join(""));
  return all.subarray(-SUMMARY_LOG_BYTES).toString("utf8");
}

const fallbackSummary = (f: NonNullable<Verdict["failed"]>): string =>
  `${f.step} ${f.timedOut ? "timed out" : `failed with exit code ${f.exitCode ?? "none"}`}`;

/** Haiku's account of a failed step, or null. The log and the command are untrusted and scrubbed before they leave and before the reply is stored. */
export async function summariseFailure(db: DatabaseSync, v: { repo: string; number: number }, taskId: number, f: NonNullable<Verdict["failed"]>, deps: CollectDeps, runId: string, onServing?: (serving: ServingMetadata | undefined) => void): Promise<string> {
  const task = getTask(db, taskId);
  const step = task?.plan.find((s: TaskStep) => s.name === f.step);
  const input: VerifySummaryInput = {
    ref: `${v.repo}#${v.number}`, step: f.step, command: scrub((step?.cmd ?? []).join(" ")), log: scrub(stepLog(db, taskId, f.step)),
  };
  const start = now();
  const codex = modelPolicy(db).provider === "codex";
  let reply: Awaited<ReturnType<typeof askClaude>>;
  try { reply = await askClaude("verify.summary", deps.model, [input], db); }
  catch (error) {
    if (error instanceof CodexUsageError && error.usage) saveUsage(db, runId, `verify-collect-${v.number}`, "verify", deps.model, 0, error.usage, start, now());
    throw error;
  }
  if (reply || !codex) saveUsage(db, runId, `verify-collect-${v.number}`, "verify", deps.model, reply ? 1 : 0, reply?.usage ?? ({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: null } as Usage), start, now());
  const text = reply ? scrub(cut(reply.text)) : "";
  if (text) onServing?.(reply?.serving);
  return text || fallbackSummary(f);
}

/** Cancels the tasks of a verification that are not finished. */
export function cancelOpen(db: DatabaseSync, ids: (number | null)[]): void {
  for (const id of ids) {
    const t = id === null ? null : getTask(db, id);
    if (t && !TERMINAL.includes(t.state)) cancelTask(db, t.id, ACTOR);
  }
}

/** Head tasks created for this head: the first plus one per retry. */
const retriesOf = (db: DatabaseSync, v: Row): number =>
  (db.prepare("SELECT COUNT(*) AS n FROM build_tasks WHERE step = 'verify' AND repo = ? AND number = ? AND head_sha = ? AND warm_role = 'use'").get(v.repo, v.number, v.head_sha) as { n: number }).n - 1;

export async function runCollect(db: DatabaseSync, params: { dryRun?: boolean; /** True when no new item should start (cancel, deadline, pipeline off). */ stopping?: () => boolean } = {}, log: (line: string) => void = console.log, deps?: CollectDeps): Promise<CollectSummary> {
  const d: CollectDeps = deps ?? { model: PROMPT.models[0]!, mainHead: (await import("./index.ts")).defaultDeps().mainHead };
  const runId = `verify-collect-${now().replace(/[-:]/g, "").slice(0, 15)}`;
  const s: CollectSummary = { runId, looked: 0, passed: 0, failed: 0, errors: 0, retried: 0, stale: 0, running: 0, warmCancelled: 0, shots: 0, changed: 0 };
  const rows = db.prepare(`SELECT v.*, i.state AS item_state, ${CURRENT_HEAD_SQL} AS item_head FROM verifications v
    LEFT JOIN items i ON i.repo = v.repo AND i.number = v.number
    LEFT JOIN pr_checks c ON c.repo = v.repo AND c.number = v.number
    WHERE v.state IN ('planned', 'running') AND ${pilotSqlFor("v.repo", "v.number")} AND NOT ${backlogHeldSql("v")} ORDER BY v.created_at, v.number`).all() as (Row & { item_state: string | null; item_head: string | null })[];
  s.looked = rows.length;
  if (params.dryRun) { log(`verify-collect: ${rows.length} pending; dry run`); return s; }

  let stoppedLogged = false;
  const stopped = (): boolean => {
    if (!params.stopping?.()) return false;
    if (!stoppedLogged) log("verify-collect: stopping, no new PRs started");
    stoppedLogged = true;
    return true;
  };
  const one = async (v: (typeof rows)[number]): Promise<void> => {
    if (stopped()) return;
    const release = leaseItem(db, `pr:${v.repo}#${v.number}`, log);
    if (!release) return;
    try {
      if (stopped()) return;
      const ref = `${v.repo}#${v.number}`;
      const finish = (state: string, summary: string | null, note: string | null, servingMetadata?: string | null): boolean => {
        const r = db.prepare("UPDATE verifications SET state = ?, summary = ?, note = ?, serving_metadata = CASE WHEN ? THEN ? ELSE serving_metadata END, finished_at = ? WHERE repo = ? AND number = ? AND head_sha = ? AND state IN ('planned', 'running')")
          .run(state, summary, note, servingMetadata !== undefined ? 1 : 0, servingMetadata ?? null, now(), v.repo, v.number, v.head_sha);
        const changed = Number(r.changes) > 0;
        if (changed && (state === "failed" || state === "error")) setAsideAnswerBeforeFailure(db, v.repo, v.number, v.head_sha, now());
        return changed;
      };

      if (v.item_state !== "OPEN" || v.item_head !== v.head_sha) {
        cancelOpen(db, [v.head_task_id, v.base_task_id]);
        if (finish("stale", v.summary, v.note)) { s.stale++; s.changed++; jobItem(db, v.repo, v.number, `stale (${v.item_state === "OPEN" ? "head moved" : "no longer open"})`, log); }
        return;
      }

      const head = v.head_task_id === null ? null : getTask(db, v.head_task_id);
      const base = v.base_task_id === null ? null : getTask(db, v.base_task_id);
      const tasks = [head, base].filter((t): t is BuildTask => t !== null);
      if (!head) {
        if (finish("error", "the build task is gone", null)) { s.errors++; s.changed++; stageRow(db, v, "verify-error", now(), `${v.kind} at ${v.head_sha.slice(0, 7)}: the build task is gone`); }
        return;
      }
      if (tasks.some((t) => !TERMINAL.includes(t.state))) {
        if (v.state === "planned" && tasks.some((t) => t.state === "claimed" || t.state === "running")) {
          db.prepare("UPDATE verifications SET state = 'running' WHERE repo = ? AND number = ? AND head_sha = ? AND state = 'planned'").run(v.repo, v.number, v.head_sha);
          s.running++; s.changed++;
        }
        return;
      }

      const verdict = verdictOf(outcomeOf(head), base ? outcomeOf(base) : null);
      const at = now();
      const sha7 = v.head_sha.slice(0, 7);

      if (verdict.state === "error" && retriesOf(db, v) < MAX_RETRIES) {
        try {
          const ids = [v.head_task_id, v.base_task_id].map((id) => (id === null ? null : cloneTask(db, id)));
          db.prepare("UPDATE verifications SET head_task_id = ?, base_task_id = ?, state = 'planned' WHERE repo = ? AND number = ? AND head_sha = ?").run(ids[0], ids[1], v.repo, v.number, v.head_sha);
          s.retried++; s.changed++;
          jobItem(db, v.repo, v.number, `${verdict.reason}; queued the tasks again`, log);
          return;
        } catch (e) {
          if (!(e instanceof BuildError)) throw e;
          verdict.reason = `${verdict.reason}; tasks not queued again: ${e.message}`;
        }
      }

      if (verdict.state === "passed") {
        if (finish("passed", null, verdict.note ?? null)) {
          s.passed++; s.changed++;
          stageRow(db, v, "verified", at, `${v.kind} at ${sha7} passed${verdict.note ? `: ${verdict.note}` : ""}`);
        }
      } else if (verdict.state === "error") {
        const why = oneLine(verdict.reason ?? "error");
        if (finish("error", why, null)) { s.errors++; s.changed++; stageRow(db, v, "verify-error", at, `${v.kind} at ${sha7}: ${why}`); }
      } else {
        let gotServing = false, summaryServing: ServingMetadata | undefined;
        const summary = verdict.failed ? await summariseFailure(db, v, v.head_task_id!, verdict.failed, d, runId, serving => { gotServing = true; summaryServing = serving; }) : oneLine(verdict.reason ?? "failed");
        if (finish("failed", summary, null, gotServing ? serializeServingMetadata(summarizeStoredServingMetadata([parseServingMetadata(v.serving_metadata), summaryServing])) : undefined)) {
          s.failed++; s.changed++;
          stageRow(db, v, "verify-failed", at, `${v.kind} at ${sha7}: ${summary}`);
          stageRow(db, v, "hold", at, `verify failed: ${summary}`);
        }
      }
      log(`  ${ref}: ${verdict.state}`);
    } finally { release(); }
  };
  // Rows of one PR (an older head still pending) run one after the other; PRs run side by side.
  const byPr = new Map<string, typeof rows>();
  for (const v of rows) byPr.set(`${v.repo}#${v.number}`, [...(byPr.get(`${v.repo}#${v.number}`) ?? []), v]);
  await pool([...byPr.values()].map((group) => async (): Promise<void> => { for (const v of group) await one(v); }), () => queueRoom(db), { max: POOL_MAX.verifyCollect });

  // Screenshot runs: one read of an empty table while the Screenshots feature has never run.
  s.shots = await collectScreenshots(db, d, log, runId, params.stopping);
  s.changed += s.shots;
  s.warmCancelled = await cancelMovedWarmBuilds(db, d, log);
  s.changed += s.warmCancelled;
  log(`verify-collect: ${s.looked} pending: ${s.passed} passed, ${s.failed} failed, ${s.errors} errors, ${s.retried} retried, ${s.stale} stale, ${s.running} running; ${s.warmCancelled} warm builds cancelled`);
  return s;
}

/** Cancels queued warm builds whose branch head is no longer the commit they would build. */
async function cancelMovedWarmBuilds(db: DatabaseSync, d: CollectDeps, log: (line: string) => void): Promise<number> {
  if (!d.mainHead) return 0;
  const queued = db.prepare(`SELECT t.id, t.repo, t.head_sha, r.default_branch FROM build_tasks t LEFT JOIN repos r ON r.name = t.repo
    WHERE t.warm_role = 'build' AND t.state = 'queued'`).all() as { id: number; repo: string; head_sha: string; default_branch: string | null }[];
  let n = 0;
  for (const t of queued) {
    const main = await d.mainHead(t.repo, t.default_branch ?? "main");
    if (main && main !== t.head_sha) { cancelTask(db, t.id, ACTOR); n++; log(`  warm build ${t.id} of ${t.repo}: ${t.default_branch ?? "main"} moved on; cancelled`); }
  }
  return n;
}
