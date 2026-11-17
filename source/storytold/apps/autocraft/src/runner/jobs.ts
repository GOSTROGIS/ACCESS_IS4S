// The jobs table: requests from the dashboard, the CLI and the autopilot,
// state written by the runner. Shared by the API, the runner and the CLI.
import { filtered, hiddenTest, isHiddenRepo, type HiddenRepos } from "../hidden-sql.ts";
import { closeSync, fstatSync, openSync, readSync, unlinkSync } from "node:fs";
import type { DatabaseSync } from "node:sqlite";
import type { Job, JobDetail,  JobFilter, JobList, JobParams, JobState, JobUsage } from "../../web/src/api/types.ts";
import { trackedNames } from "../repos.ts";
import { accountLabelsByJob, failRunning } from "../agents/runs.ts";
import { releaseJob } from "./leases.ts";
import { knownStep, loadSteps, modelsOf, ParamError, validateParams, type StepDef } from "./steps.ts";
import { shownLookup } from "../dash/api/shown.ts";
import { blankIfHidden } from "../dash/api/visible.ts";

export const JOB_STATES: JobState[] = ["queued", "running", "done", "failed", "cancelled"];
/** Error text of jobs ended by a runner stop or restart; the autopilot does not count them as failures. */
export const RUNNER_STOPPED = "The runner stopped while this job ran; start it again if needed.";
/** Error of a job the runner stopped for running past its step's deadline; set when the stop is asked, so the job can finish its current item. */
export const DEADLINE_ERROR = /^stopped: (ran past|no progress for) /;
export const now = (): string => new Date().toISOString();

export class JobError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

type JobRow = {
  repo: string | null; id: number; step: string; params: string; requested_by: string; requested_at: string; state: JobState;
  started_at: string | null; ended_at: string | null; progress: string | null; summary: string | null; error: string | null;
  usage: string | null; log_path: string | null; pid: number | null; cancel_requested_at: string | null; cancel_requested_by: string | null;
  items: number | null;
};

function parseJson<T>(s: string | null, fallback: T): T {
  try {
    return s ? (JSON.parse(s) as T) : fallback;
  } catch {
    return fallback;
  }
}

/** `accounts`: labels of the accounts the job's agent runs used (see `toJobs` for a page of jobs). */
export function toJob(r: JobRow, accounts: string[] = []): Job {
  const params = parseJson<JobParams>(r.params, {});
  return {
    id: r.id, step: r.step, params, requestedBy: r.requested_by, requestedAt: r.requested_at,
    state: r.state, startedAt: r.started_at, endedAt: r.ended_at, progress: r.progress, summary: r.summary, error: r.error,
    cancelRequested: r.cancel_requested_at !== null, usage: parseJson<JobUsage | null>(r.usage, null),
    models: modelsOf(knownStep(r.step), params), accounts,
  };
}

/** Jobs with their account labels, looked up in one query. */
export function toJobs(db: DatabaseSync, rows: JobRow[]): Job[] {
  const labels = accountLabelsByJob(db, rows.map((r) => r.id));
  return rows.map((r) => toJob(r, labels.get(r.id)));
}

export function jobRow(db: DatabaseSync, id: number): JobRow | undefined {
  return db.prepare("SELECT * FROM jobs WHERE id = ?").get(id) as JobRow | undefined;
}

export function getJob(db: DatabaseSync, id: number): Job {
  const r = jobRow(db, id);
  if (!r) throw new JobError(404, `no job ${id}`);
  return toJobs(db, [r])[0]!;
}

export function listJobs(db: DatabaseSync, f: JobFilter = {}, hidden: HiddenRepos = []): JobList {
  const where: string[] = [];
  const args: (string | number)[] = [];
  if (f.step) {
    where.push("step = ?");
    args.push(f.step);
  }
  if (f.state) {
    where.push("state = ?");
    args.push(f.state);
  }
  if (filtered(hidden)) {
    const h = hiddenTest("repo", hidden);
    where.push(`(repo IS NULL OR NOT (${h.sql}))`);
    args.push(...h.args);
  }
  const w = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const total = (db.prepare(`SELECT COUNT(*) AS n FROM jobs ${w}`).get(...args) as { n: number }).n;
  const limit = Math.min(Math.max(f.limit ?? 50, 1), 200), offset = Math.max(f.offset ?? 0, 0);
  const rows = db.prepare(`SELECT * FROM jobs ${w} ORDER BY id DESC LIMIT ? OFFSET ?`).all(...args, limit, offset) as JobRow[];
  return { jobs: toJobs(db, rows), total };
}

async function stepOf(name: unknown): Promise<StepDef> {
  const step = typeof name === "string" ? (await loadSteps()).get(name) : undefined;
  if (!step) throw new JobError(400, "no such step");
  return step;
}

/** Validated params for a step, or a 400. */
export async function checkRequest(db: DatabaseSync, stepName: unknown, rawParams: unknown): Promise<{ step: StepDef; params: JobParams }> {
  const step = await stepOf(stepName);
  let params: JobParams;
  try {
    params = validateParams(step, rawParams, trackedNames(db));
  } catch (e) {
    if (e instanceof ParamError) throw new JobError(400, e.message);
    throw e;
  }
  const why = step.available?.() ?? null;
  if (why) throw new JobError(409, why);
  const refused = step.check ? await step.check(db, params) : null;
  if (refused) throw new JobError(409, refused);
  return { step, params };
}

/** Queues a job. The same step with the same params already waiting is refused. */
/** `settle` runs after the request is checked and before the insert, with no await between: it may change the params (a recomputed limit) or return null to refuse. */
export async function enqueue(db: DatabaseSync, stepName: unknown, rawParams: unknown, by: string, settle?: (step: StepDef, params: Record<string, unknown>) => Record<string, unknown> | null): Promise<Job> {
  const checked = await checkRequest(db, stepName, rawParams);
  const { step } = checked;
  const params = settle ? settle(step, checked.params) : checked.params;
  if (!params) throw new JobError(409, `the daily limit of ${step.name} leaves too little for a job`);
  const json = JSON.stringify(params);
  if (db.prepare("SELECT 1 FROM jobs WHERE step = ? AND params = ? AND state = 'queued'").get(step.name, json)) {
    throw new JobError(409, `${step.name} with these settings is already queued`);
  }
  const repo = typeof params.repo === "string" ? params.repo : null;
  const id = Number(db.prepare("INSERT INTO jobs (step, params, repo, requested_by, requested_at, state) VALUES (?, ?, ?, ?, ?, 'queued')")
    .run(step.name, json, repo, by, now()).lastInsertRowid);
  return getJob(db, id);
}

/** A queued job is cancelled at once; a running one is marked and the runner stops it. */
export function requestCancel(db: DatabaseSync, id: number, by: string): Job {
  const r = jobRow(db, id);
  if (!r) throw new JobError(404, `no job ${id}`);
  const t = now();
  if (r.state === "queued") {
    const done = db.prepare("UPDATE jobs SET state = 'cancelled', ended_at = ?, cancel_requested_at = ?, cancel_requested_by = ? WHERE id = ? AND state = 'queued'")
      .run(t, t, by, id).changes;
    if (done) return getJob(db, id);
  }
  const marked = db.prepare("UPDATE jobs SET cancel_requested_at = COALESCE(cancel_requested_at, ?), cancel_requested_by = COALESCE(cancel_requested_by, ?) WHERE id = ? AND state = 'running'")
    .run(t, by, id).changes;
  if (!marked) throw new JobError(409, `job ${id} has already ended`);
  return getJob(db, id);
}

/** Finished jobs and their log files are kept this long; audit and token_usage are kept for good. */
export const JOB_KEEP_MS = 3650 * 24 * 3600_000;

/** Deletes finished jobs that ended more than JOB_KEEP_MS ago, with their log files. Returns the number of jobs. */
export function pruneJobs(db: DatabaseSync, nowMs: number = Date.now()): number {
  const before = new Date(nowMs - JOB_KEEP_MS).toISOString();
  const old = db.prepare("SELECT id, log_path FROM jobs WHERE ended_at IS NOT NULL AND ended_at < ? AND state IN ('done', 'failed', 'cancelled') ORDER BY ended_at LIMIT 1000");
  const del = db.prepare("DELETE FROM jobs WHERE id = ?");
  const delItems = db.prepare("DELETE FROM job_items WHERE job_id = ?");
  let n = 0;
  for (;;) {
    const rows = old.all(before) as { id: number; log_path: string | null }[];
    if (!rows.length) return n;
    for (const r of rows) {
      if (r.log_path) {
        try {
          unlinkSync(r.log_path);
        } catch {
          // already gone
        }
      }
      delItems.run(r.id);
      del.run(r.id);
      n++;
    }
  }
}

// ---- logs ----------------------------------------------------------------------

export { scrub } from "./scrub.ts";
import { scrub } from "./scrub.ts";

export const LOG_TAIL_BYTES = 48 * 1024;

export function logTail(path: string | null, bytes = LOG_TAIL_BYTES): { log: string; logTruncated: boolean } {
  if (!path) return { log: "", logTruncated: false };
  let fd: number;
  try {
    fd = openSync(path, "r");
  } catch {
    return { log: "", logTruncated: false };
  }
  try {
    const size = fstatSync(fd).size;
    const start = Math.max(0, size - bytes);
    const buf = Buffer.alloc(size - start);
    readSync(fd, buf, 0, buf.length, start);
    let text = buf.toString("utf8");
    if (start > 0) text = text.slice(text.indexOf("\n") + 1);
    return { log: scrub(text), logTruncated: start > 0 };
  } finally {
    closeSync(fd);
  }
}

/**
 * `hidden`: the repos the viewer may not see. A job of such a repo is not found.
 * `logs` false (viewers) leaves the log out: its lines can name hidden items and carry command output. For other readers the lines
 * that name a hidden repo are left out (a job without a repo, or a step that reads other repos, logs items of every repo it worked).
 */
export function jobDetail(db: DatabaseSync, id: number, view: { hidden?: HiddenRepos; logs?: boolean } = {}): JobDetail {
  const r = jobRow(db, id);
  const hidden = view.hidden ?? [];
  if (!r || (r.repo && isHiddenRepo(hidden, r.repo))) throw new JobError(404, `no job ${id}`);
  const shown = shownLookup(db);
  const items = (db.prepare("SELECT repo, number, outcome, ref FROM job_items WHERE job_id = ? ORDER BY id").all(id) as { repo: string; number: number; outcome: string | null; ref: string | null }[])
    .filter((i) => !isHiddenRepo(hidden, i.repo)).map((i) => ({ repo: i.repo, number: i.number, ...shown(i.repo, i.number), outcome: i.outcome, decision: i.ref }));
  if (view.logs === false) return { ...toJobs(db, [r])[0]!, items, log: null, logTruncated: false };
  const tail = logTail(r.log_path);
  return { ...toJobs(db, [r])[0]!, items, ...tail, log: tail.log && hidden.length ? tail.log.split("\n").filter((l) => !l || blankIfHidden(l, hidden)).join("\n") : tail.log };
}

/** Records the end of a job whose process closed: done on exit 0, cancelled when a cancel was asked, else failed with the reason. */
export function endJob(db: DatabaseSync, id: number, code: number | null, signal: NodeJS.Signals | null, spawnError: string | null, stopping = false): { state: "done" | "failed" | "cancelled"; error: string | null } | null {
  const row = jobRow(db, id);
  if (!row || row.state !== "running") return null;
  let state: "done" | "failed" | "cancelled";
  let error: string | null = row.error;
  if (row.cancel_requested_at) state = "cancelled";
  else if (code === 0 && !DEADLINE_ERROR.test(error ?? "")) state = "done";
  else {
    state = "failed";
    if (stopping) error = RUNNER_STOPPED;
    error ??= spawnError ?? (signal ? `The job's process ended on ${signal}.` : `The job's process exited with code ${code}.`);
  }
  failRunning(db, "The job ended during this call.", id);
  db.prepare("DELETE FROM model_waits WHERE job_id = ?").run(id);
  releaseJob(db, id);
  db.prepare("UPDATE jobs SET state = ?, ended_at = ?, pid = NULL, error = ?, progress = CASE WHEN ? = 'done' THEN NULL ELSE progress END WHERE id = ?")
    .run(state, now(), state === "failed" ? error : null, state, id);
  return { state, error: state === "failed" ? error : null };
}
