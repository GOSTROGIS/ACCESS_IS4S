// The Pipeline page over JSON. Everyone signed in reads steps, jobs, logs, the
// pipeline switch and the stage limits; only operators request or cancel jobs,
// flip the switch and change limits. The
// dashboard never runs a step: it writes job rows that the runner picks up.
import type { DatabaseSync } from "node:sqlite";
import type { Job, JobState, PipelineOverview, PipelineStage, PipelineState, PipelineStep, StepParam, SyncRun } from "../../../web/src/api/types.ts";
import { enqueue, getJob, jobDetail, JobError, JOB_STATES, listJobs, requestCancel, toJob, toJobs } from "../../runner/jobs.ts";
import { ackDeadline, LimitError, pipelineState as rawPipelineState, resetLimitCount, setEnabled, setLimit } from "../../runner/autopilot.ts";
import { HEARTBEAT_KEY } from "../../runner/runner.ts";
import { loadSteps, type StepDef } from "../../runner/steps.ts";
import { JUDGEMENT_MODELS, judgementModel, setJudgementModel } from "../../decide/judgement.ts";
import { audit } from "../audit.ts";
import { outsideState } from "../../outside.ts";
import { resumeStage, TripError } from "../../push-outcomes.ts";
import { HttpError } from "../server/util.ts";
import type { Req } from "../types.ts";
import { blankIfHidden, hiddenRepos, visibleRepos } from "./visible.ts";
import { filtered, hiddenTest, type HiddenRepos } from "../../hidden-sql.ts";
import { isQuiet } from "../../security/quiet.ts";
import { canSeeInternals } from "./staff.ts";
import { SECURITY_STEP } from "../../security/rules.ts";

// Stages of docs/pipeline.md. A stage with registered steps shows them; the
// mirror also runs on its own timer.
const STAGES: { n: number; name: string; automatic?: boolean }[] = [
  { n: 1, name: "Mirror", automatic: true },
  { n: 2, name: "Classify" },
  { n: 3, name: "Decide" },
  { n: 4, name: "Label" },
  { n: 5, name: "Review" },
  { n: 6, name: "Integrate" },
  { n: 7, name: "Fix issues" },
];

const RUNNER_ALIVE_MS = 30_000;

function requireOperator(req: Req, step?: StepDef): void {
  if (req.user.role !== "operator" || (step && step.requires !== "operator")) throw new HttpError(403, "only operators run or cancel pipeline steps and change the pipeline switch and limits");
}

/** The pipeline state for the requester: reasons that name a hidden repo are left out. */
async function pipelineState(db: DatabaseSync, req: Req): Promise<PipelineState> {
  const [s, hidden] = await Promise.all([rawPipelineState(db), hiddenRepos(db, req)]);
  return { ...s, outside: outsideState(db, hidden), limits: s.limits.map((l) => ({ ...l, pausedReason: blankIfHidden(l.pausedReason, hidden) || null, status: blankIfHidden(l.status, hidden) || null })) };
}

/** Viewers read that a job failed, not why: the error carries log and command text. */
/**
 * A job as the reader may see it: viewers get "failed" for an error; no reader gets a summary, progress or error that names a repo
 * hidden from them (a job without a repo works across repos), and an error left out that way reads "failed". Operators hide nothing.
 */
const forViewer = (req: Req, hidden: HiddenRepos) => (j: Job): Job => ({
  ...j, summary: blankIfHidden(j.summary, hidden) || null, progress: blankIfHidden(j.progress, hidden) || null,
  error: j.error && (canSeeInternals(req) ? blankIfHidden(j.error, hidden) || "failed" : "failed"),
});

const wrap = async <T>(f: () => T | Promise<T>): Promise<T> => {
  try {
    return await f();
  } catch (e) {
    if (e instanceof JobError) throw new HttpError(e.status, e.message);
    throw e;
  }
};

function wireParams(s: StepDef, repos: string[]): StepParam[] {
  return s.params.map((p): StepParam => {
    const base = { name: p.name, label: p.label, help: p.help, required: !!p.required };
    switch (p.kind) {
      case "enum": return { ...base, kind: "enum", options: p.options, default: p.default };
      case "repo": return { ...base, kind: "repo", options: repos };
      case "int": return { ...base, kind: "int", min: p.min, max: p.max, default: p.default };
      case "run-id": return { ...base, kind: "run-id", default: p.default };
    }
  });
}

const lastJob = (db: DatabaseSync, step: string, view: (j: Job) => Job, hidden: HiddenRepos): Job | null => {
  const h = hiddenTest("repo", hidden);
  const r = db.prepare(`SELECT * FROM jobs WHERE step = ?${filtered(hidden) ? ` AND (repo IS NULL OR NOT (${h.sql}))` : ""} ORDER BY id DESC LIMIT 1`).get(step, ...(filtered(hidden) ? h.args : []));
  return r ? view(toJobs(db, [r as Parameters<typeof toJob>[0]])[0]!) : null;
};

function stageState(db: DatabaseSync, steps: string[], syncFailed: boolean | null): PipelineStage["state"] {
  if (steps.length) {
    const marks = steps.map(() => "?").join(",");
    const active = db.prepare(`SELECT state FROM jobs WHERE step IN (${marks}) AND state IN ('running', 'queued') ORDER BY state = 'running' DESC LIMIT 1`).get(...steps) as { state: JobState } | undefined;
    if (active) return active.state === "running" ? "running" : "queued";
  }
  if (syncFailed !== null) return syncFailed ? "failed" : "ok";
  if (!steps.length) return "idle";
  const marks = steps.map(() => "?").join(",");
  const last = db.prepare(`SELECT state FROM jobs WHERE step IN (${marks}) AND state IN ('done', 'failed') ORDER BY id DESC LIMIT 1`).get(...steps) as { state: JobState } | undefined;
  return last?.state === "done" ? "ok" : last?.state === "failed" ? "failed" : "idle";
}

export async function overview(db: DatabaseSync, req: Req): Promise<PipelineOverview> {
  const all = [...(await loadSteps()).values()].filter((s) => s.name !== SECURITY_STEP || canSeeInternals(req));
  const repos = await visibleRepos(db, req);
  const hidden = await hiddenRepos(db, req);
  const steps: PipelineStep[] = all.map((s) => ({
    name: s.name, title: s.title, description: s.description, stage: s.stage, requires: s.requires,
    params: wireParams(s, repos), unavailable: s.available?.() ?? null,
    lastJob: lastJob(db, s.name, forViewer(req, hidden), hidden),
  }));
  const raw = db.prepare("SELECT started_at AS startedAt, ended_at AS endedAt, mode, items, error FROM sync_runs ORDER BY started_at DESC LIMIT 10").all() as unknown as SyncRun[];
  const lastSync = raw.find((r) => r.endedAt);
  // A sync error can quote GitHub's answer about any repo: staff read it unless it names a repo hidden from them, viewers read "failed".
  const runs = raw.map((r) => ({ ...r, error: r.error && (canSeeInternals(req) ? blankIfHidden(r.error, hidden) || "failed" : "failed") }));
  const high = (db.prepare("SELECT value FROM settings WHERE key = 'org_high_water'").get() as { value: string } | undefined)?.value ?? null;
  const stages: PipelineStage[] = STAGES.map((st) => {
    const names = steps.filter((s) => s.stage === st.n).map((s) => s.name);
    const mode = st.automatic ? "automatic" : names.length ? "steps" : "planned";
    return {
      n: st.n, name: st.name, mode, steps: names,
      state: mode === "planned" ? "planned" : stageState(db, names, st.automatic ? (lastSync ? lastSync.error !== null : high ? false : null) : null),
    };
  });
  const beat = (db.prepare("SELECT value FROM settings WHERE key = ?").get(HEARTBEAT_KEY) as { value: string } | undefined)?.value ?? null;
  const hj = hiddenTest("repo", hidden);
  const count = (state: string) => (db.prepare(`SELECT COUNT(*) AS n FROM jobs WHERE state = ?${filtered(hidden) ? ` AND (repo IS NULL OR NOT (${hj.sql}))` : ""}`).get(state, ...(filtered(hidden) ? hj.args : [])) as { n: number }).n;
  return {
    stages, steps,
    runner: { lastSeen: beat, alive: beat !== null && Date.now() - Date.parse(beat) < RUNNER_ALIVE_MS },
    sync: { lastFinishedAt: lastSync?.endedAt ?? high, runs },
    counts: { queued: count("queued"), running: count("running") },
  };
}

const intQuery = (req: Req, name: string): number | undefined => {
  const v = req.query.get(name);
  if (v === null || v === "") return undefined;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 0) throw new HttpError(400, `${name} must be a whole number`);
  return n;
};

export async function jobs(db: DatabaseSync, req: Req) {
  const state = req.query.get("state") || undefined;
  if (state && !JOB_STATES.includes(state as JobState)) throw new HttpError(400, "unknown state");
  const hidden = await hiddenRepos(db, req);
  const list = listJobs(db, { step: req.query.get("step") || undefined, state: state as JobState | undefined, limit: intQuery(req, "limit"), offset: intQuery(req, "offset") }, hidden);
  return { ...list, jobs: list.jobs.map(forViewer(req, hidden)) };
}

const jobId = (req: Req): number => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) throw new HttpError(400, "not a job id");
  return id;
};

export const job = (db: DatabaseSync, req: Req) => wrap(async () => {
  const hidden = await hiddenRepos(db, req);
  const d = jobDetail(db, jobId(req), { hidden, logs: canSeeInternals(req) });
  if (canSeeInternals(req)) return forViewer(req, hidden)(d) as typeof d;
  // An item's outcome reads "failed: <reason>" or carries notes: viewers get the leading state word, and nothing for a quiet pull request.
  const items = d.items.map((i) => ({ ...i, outcome: isQuiet(db, i.repo, i.number) ? null : /^[A-Za-z-]+/.exec(i.outcome ?? "")?.[0] ?? null }));
  return { ...forViewer(req, hidden)(d) as typeof d, items };
});

function body(req: Req): Record<string, unknown> {
  const b = req.json;
  if (!b || typeof b !== "object" || Array.isArray(b)) throw new HttpError(400, "the body must be a JSON object");
  return b as Record<string, unknown>;
}

export async function request(db: DatabaseSync, req: Req): Promise<Job> {
  requireOperator(req);
  const b = body(req);
  const step = typeof b.step === "string" ? (await loadSteps()).get(b.step) : undefined;
  if (!step) throw new HttpError(400, "no such step");
  requireOperator(req, step);
  if (step.name === SECURITY_STEP) throw new HttpError(400, "scans are started from the repo page");
  const j = await wrap(() => enqueue(db, step.name, b.params, req.user.login));
  audit(db, req.user.login, "job-request", `job:${j.id}`, { step: j.step, params: j.params });
  return j;
}

export async function cancel(db: DatabaseSync, req: Req): Promise<Job> {
  requireOperator(req);
  const id = jobId(req);
  const before = await wrap(() => getJob(db, id));
  const step = (await loadSteps()).get(before.step);
  if (step) requireOperator(req, step);
  const j = await wrap(() => requestCancel(db, id, req.user.login));
  audit(db, req.user.login, "job-cancel", `job:${id}`, { step: j.step, state: before.state });
  return j;
}

export const state = (db: DatabaseSync, req: Req) => pipelineState(db, req);

export async function putState(db: DatabaseSync, req: Req) {
  requireOperator(req);
  const b = body(req);
  if (typeof b.enabled !== "boolean") throw new HttpError(400, "enabled must be true or false");
  const was = (await rawPipelineState(db)).enabled;
  setEnabled(db, b.enabled, req.user.login);
  audit(db, req.user.login, "pipeline-switch", "pipeline", { enabled: b.enabled, was });
  return pipelineState(db, req);
}

/** The model of the prepare step and the models an operator may pick. */
export const getJudgementModel = (db: DatabaseSync) => ({ judgementModel: judgementModel(db), judgementModels: [...JUDGEMENT_MODELS] });

export async function putJudgementModel(db: DatabaseSync, req: Req) {
  requireOperator(req);
  const m = body(req).model;
  if (typeof m !== "string" || !(JUDGEMENT_MODELS as readonly string[]).includes(m)) throw new HttpError(400, `model must be one of ${JUDGEMENT_MODELS.join(", ")}`);
  const was = judgementModel(db);
  setJudgementModel(db, m);
  audit(db, req.user.login, "judgement-model", "pipeline", { model: m, was });
  return pipelineState(db, req);
}

export async function putLimit(db: DatabaseSync, req: Req) {
  requireOperator(req);
  try {
    setLimit(db, req.params.step, req.json, req.user.login);
  } catch (e) {
    if (e instanceof LimitError) throw new HttpError(e.status, e.message);
    throw e;
  }
  return (await pipelineState(db, req)).limits.find((l) => l.step === req.params.step)!;
}

/** An operator clears a stage the circuit breaker paused. */
export async function resumeTrip(db: DatabaseSync, req: Req) {
  requireOperator(req);
  try {
    resumeStage(db, req.params.stage, req.user.login);
  } catch (e) {
    if (e instanceof TripError) throw new HttpError(e.status, e.message);
    throw e;
  }
  return pipelineState(db, req);
}

/** Starts today's count of a step again from zero; the step `all` resets every stage. */
export async function resetLimit(db: DatabaseSync, req: Req) {
  requireOperator(req);
  try {
    resetLimitCount(db, req.params.step, req.user.login);
  } catch (e) {
    if (e instanceof LimitError) throw new HttpError(e.status, e.message);
    throw e;
  }
  return pipelineState(db, req);
}

/** An operator acknowledges the deadline stops of a step, which clears their warning in the header. */
export async function ackStepDeadline(db: DatabaseSync, req: Req) {
  requireOperator(req);
  const step = req.params.step!;
  if (!(await loadSteps()).has(step)) throw new HttpError(404, "no such step");
  ackDeadline(db, step, req.user.login);
  return { ok: true };
}
