// Stuck-job handling: the runner stops a job past its step's deadline and fails it with a warning until acknowledged or beaten by a
// later success; the drain state lets the writes of jobs already running through where plain off blocks them.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";
import { setCommentApproval } from "../src/act/approval.ts";
import { SCRATCH } from "./scratch.ts";
import { world } from "./world-db.ts";

process.env.AUTOCRAFT_EXTRA_STEPS = fileURLToPath(new URL("./runner-steps.ts", import.meta.url));

const { connect } = await import("../src/db.ts");
const { enqueue, getJob, jobDetail } = await import("../src/runner/jobs.ts");
const { Runner, deadlineError, noProgressError } = await import("../src/runner/runner.ts");
const { ackDeadline, deadlineStops, isDraining, isEnabled, setEnabled } = await import("../src/runner/autopilot.ts");
const { failureBackoff, DEADLINE_BACKOFF_MS } = await import("../src/runner/autopilot.ts");
const { STEP_PLANS, stepBoundMin, stepDeadlineMin } = await import("../src/runner/deadlines.ts");
const { loadSteps } = await import("../src/runner/steps.ts");
const { guardRepo } = await import("../src/core/guard.ts");

mkdirSync(SCRATCH, { recursive: true });
const dir = mkdtempSync(join(SCRATCH, "stuck-jobs-"));
const dbFile = join(dir, "runner.db");
const db = connect(dbFile);
const runner = new Runner({ db, dbFile, logs: join(dir, "logs"), killAfterMs: 2000, log: () => {}, maxMin: (s) => (s === "test-sleep" ? 0.02 : 999), noProgressMin: (s) => (s === "test-other" ? 0.02 : 999), graceMs: 500 });
after(async () => {
  await runner.stop();
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

test("a job past its step's deadline is stopped and failed, and warns until acknowledged or beaten", async () => {
  const slow = await enqueue(db, "test-sleep", { ms: 60_000 }, "boss");
  for (const end = Date.now() + 20_000; getJob(db, slow.id).state !== "failed" && Date.now() < end; await new Promise((r) => setTimeout(r, 50))) await runner.tick();
  const j = getJob(db, slow.id);
  assert.equal(j.state, "failed");
  assert.equal(j.error, deadlineError(0.02));
  assert.deepEqual(deadlineStops(db).map((d) => d.step), ["test-sleep"]);
  assert.match(jobDetail(db, slow.id).log ?? "", /may finish its current item/);
  // The stopped paid work is not started again for an hour, whatever the input does.
  db.prepare("UPDATE jobs SET requested_by = 'pipeline' WHERE id = ?").run(slow.id);
  const b = failureBackoff(db, "test-sleep", Date.now(), { fp: "changed" });
  assert.ok(b && b.until - Date.parse(j.endedAt!) >= DEADLINE_BACKOFF_MS);
  // Every step with model calls gets at least the time the code lets its job work.
  const known = await loadSteps();
  for (const step of Object.keys(STEP_PLANS)) {
    assert.ok(known.has(step), step);
    assert.ok(stepDeadlineMin(step) >= stepBoundMin(step)!, step);
  }
  ackDeadline(db, "test-sleep", "op");
  assert.deepEqual(deadlineStops(db), []);

  // A job that writes no log line for longer than its limit is stopped the same way, well inside its deadline.
  const quiet = await enqueue(db, "test-other", { ms: 60_000 }, "boss");
  for (const end = Date.now() + 20_000; getJob(db, quiet.id).state !== "failed" && Date.now() < end; await new Promise((r) => setTimeout(r, 50))) await runner.tick();
  assert.equal(getJob(db, quiet.id).error, noProgressError(0.02));
  assert.deepEqual(deadlineStops(db).map((d) => d.step), ["test-other"]);
});

test("draining keeps a running job's writes and starts nothing; off blocks the writes", async () => {
  const pipe = world().repo(["comment"]).pr(1).pipeline(false).db;
  setCommentApproval(pipe, "op", "app", true);
  const refused = () => (guardRepo(pipe, "app", "comment", "pipeline") as { refused?: string }).refused;
  setEnabled(pipe, false, "op", "drain");
  assert.ok(isDraining(pipe) && !isEnabled(pipe));
  // While draining no job starts, a manual one included; it runs once the pipeline is on.
  setEnabled(db, false, "op", "drain");
  const manual = await enqueue(db, "test-echo", {}, "boss");
  for (let n = 0; n < 5; n++) { await runner.tick(); await new Promise((r) => setTimeout(r, 50)); }
  assert.equal(getJob(db, manual.id).state, "queued");
  setEnabled(db, true, "op");
  for (const end = Date.now() + 20_000; getJob(db, manual.id).state !== "done" && Date.now() < end; await new Promise((r) => setTimeout(r, 50))) await runner.tick();
  assert.equal(getJob(db, manual.id).state, "done");
  assert.equal(refused(), undefined);
  setEnabled(pipe, false, "op");
  assert.match(refused() ?? "", /pipeline is off/);
  setEnabled(pipe, true, "op");
  assert.ok(isEnabled(pipe) && !isDraining(pipe));
  assert.equal(refused(), undefined);
});
