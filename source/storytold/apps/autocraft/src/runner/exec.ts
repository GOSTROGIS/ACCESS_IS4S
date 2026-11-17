// `autocraft runner exec <id>`: runs one claimed job in the runner's child
// process. Writes progress, the summary or the error, and the job's model
// usage; the runner sets the final state from the exit code.
import type { DatabaseSync } from "node:sqlite";
import type { JobUsage } from "../../web/src/api/types.ts";
import { setCallContext, StoppedError } from "../agents/call.ts";
import { connect } from "../db.ts";
import { trackedNames } from "../repos.ts";
import { AUTOPILOT_USER, isEnabled } from "./autopilot.ts";
import { leaseSkipKeys, leaseSkips } from "./leases.ts";
import { DEADLINE_ERROR, jobRow, scrub } from "./jobs.ts";
import { loadSteps, validateParams, type StepContext } from "./steps.ts";

const oneLine = (s: string, max = 500): string => scrub(s.replace(/\s+/g, " ").trim()).slice(0, max);

function usageOf(db: DatabaseSync, runs: Set<string>, since: string): JobUsage | null {
  if (!runs.size) return null;
  const marks = [...runs].map(() => "?").join(",");
  const r = db.prepare(`SELECT COUNT(*) AS calls, COALESCE(SUM(input_tokens), 0) AS input, COALESCE(SUM(output_tokens), 0) AS output,
    SUM(cost_usd) AS cost FROM token_usage WHERE run_id IN (${marks}) AND started_at >= ?`).get(...runs, since) as
    { calls: number; input: number; output: number; cost: number | null };
  return { calls: r.calls, input: r.input, output: r.output, costUsd: r.cost };
}

export async function execJob(id: number): Promise<number> {
  const db = connect();
  const row = jobRow(db, id);
  if (!row || row.state !== "running" || !row.started_at) {
    console.error(`job ${id} is not running`);
    return 2;
  }
  const startedAt = row.started_at;
  const runs = new Set<string>();
  const saveUsage = () => {
    const u = usageOf(db, runs, startedAt);
    if (u) db.prepare("UPDATE jobs SET usage = ? WHERE id = ?").run(JSON.stringify(u), id);
  };
  const fail = (msg: string): number => {
    saveUsage();
    db.prepare("UPDATE jobs SET error = ? WHERE id = ?").run(oneLine(msg), id);
    console.error(`failed: ${msg}`);
    return 1;
  };
  process.once("SIGTERM", () => {
    saveUsage();
    console.log("stopped");
    process.exit(143);
  });

  const step = (await loadSteps()).get(row.step);
  if (!step) return fail(`no step ${row.step} in this build`);
  console.log(`${new Date().toISOString()} job ${id}: ${step.name} ${row.params}, requested by ${row.requested_by}`);
  let params;
  try {
    params = validateParams(step, JSON.parse(row.params), trackedNames(db));
    const why = step.available?.() ?? (step.check ? await step.check(db, params) : null);
    if (why) return fail(why);
  } catch (e) {
    return fail((e as Error).message);
  }

  let lastProgress = 0;
  const ctx: StepContext = {
    db,
    job: { id, requestedBy: row.requested_by, startedAt },
    params,
    progress(text) {
      const t = Date.now();
      if (t - lastProgress < 1000) return;
      lastProgress = t;
      db.prepare("UPDATE jobs SET progress = ? WHERE id = ?").run(oneLine(text, 200), id);
      console.log(text);
    },
    log: (line) => console.log(line),
    usageRun: (r) => void runs.add(r),
    handled: (n) => void db.prepare("UPDATE jobs SET items = ? WHERE id = ?").run(n, id),
    acted: (n) => void db.prepare("UPDATE jobs SET acted = ? WHERE id = ?").run(n, id),
    cancelled: () => {
      const r = db.prepare("SELECT cancel_requested_at, error FROM jobs WHERE id = ?").get(id) as { cancel_requested_at: string | null; error: string | null };
      return !!r.cancel_requested_at || DEADLINE_ERROR.test(r.error ?? "");
    },
    stopping: () => ctx.cancelled() || (row.requested_by === AUTOPILOT_USER && !isEnabled(db)),
  };
  setCallContext({ jobId: id, step: step.name, stage: step.stage, class: step.priority ?? 0, ...(typeof params.repo === "string" && { repo: params.repo }), cancelled: ctx.cancelled, stopping: ctx.stopping });
  try {
    const summary = await step.run(ctx);
    saveUsage();
    // Items skipped for a lease are work left for a later job: the planner retries once no job holds a lease (unchangedSinceIdle).
    if (leaseSkips()) db.prepare("UPDATE jobs SET lease_skips = ?, lease_skip_keys = ? WHERE id = ?").run(leaseSkips(), JSON.stringify(leaseSkipKeys()), id);
    db.prepare("UPDATE jobs SET summary = ? WHERE id = ?").run(oneLine(summary), id);
    console.log(`${new Date().toISOString()} done: ${summary}`);
    return 0;
  } catch (e) {
    if (e instanceof StoppedError) {
      saveUsage();
      const summary = "stopped: the pipeline was switched off";
      db.prepare("UPDATE jobs SET summary = ? WHERE id = ?").run(summary, id);
      console.log(`${new Date().toISOString()} done: ${summary}`);
      return 0;
    }
    console.error((e as Error).stack ?? e);
    return fail((e as Error).message ?? String(e));
  }
}
