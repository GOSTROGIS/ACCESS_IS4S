// Work leases and the daily-limit reservation: two jobs never work one PR together or pass the day's limit together.
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { after, test } from "node:test";
import { setCallContext } from "../src/agents/call.ts";
import { connect } from "../src/db.ts";
import { jobLimit } from "../src/runner/autopilot.ts";
import { endJob } from "../src/runner/jobs.ts";
import { leaseItem, leaseSkips, take } from "../src/runner/leases.ts";
import type { StepDef } from "../src/runner/steps.ts";
import { SCRATCH } from "./scratch.ts";

after(() => setCallContext(null));

function fresh(name: string) {
  mkdirSync(SCRATCH, { recursive: true });
  return connect(join(SCRATCH, `leases-${name}-${process.pid}.db`));
}
const addJob = (db: ReturnType<typeof fresh>, step: string, state: string, params: object = {}, items = 0): number =>
  Number(db.prepare("INSERT INTO jobs (step, params, requested_by, requested_at, state, started_at, items) VALUES (?, ?, 'pipeline', ?, ?, ?, ?)")
    .run(step, JSON.stringify(params), new Date().toISOString(), state, state === "queued" ? null : new Date().toISOString(), items).lastInsertRowid);
const as = (jobId: number, step: string) => setCallContext({ jobId, step, stage: 1, cancelled: () => false });

test("fixup and cifix on one PR: the second job skips it, and a lease of an ended job is free", () => {
  const db = fresh("pr");
  const fixup = addJob(db, "fixup", "running"), cifix = addJob(db, "cifix", "running");
  const lines: string[] = [];
  as(fixup, "fixup");
  const release = leaseItem(db, "pr:r#1", (l) => lines.push(l));
  assert.ok(release);
  as(cifix, "cifix");
  assert.equal(leaseItem(db, "pr:r#1", (l) => lines.push(l)), null);
  assert.equal(lines.length, 1);
  assert.equal(leaseSkips(), 1, "a lease skip is counted for the job record");
  assert.ok(leaseItem(db, "pr:r#2", () => {}), "another PR is free");
  as(fixup, "fixup");
  assert.ok(take(db, "pr:r#1", fixup, "fixup"), "the holder may take it again");
  // The holder's job ends: its leases go, and a lease left by a crash (job no longer running) is free.
  endJob(db, fixup, 0, null, null);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM work_leases WHERE job_id = ?").get(fixup)!.n, 0);
  db.prepare("INSERT INTO work_leases (key, job_id, step, taken_at) VALUES ('pr:r#3', ?, 'fixup', 'x')").run(fixup);
  assert.ok(take(db, "pr:r#3", cifix, "cifix"));
});

test("a second job of a step gets the day's remainder minus the first job's unspent limit", () => {
  const db = fresh("limit");
  db.prepare("INSERT OR REPLACE INTO stage_limits (step, per_day) VALUES ('fixup', 20)").run();
  const step = { name: "fixup", params: [{ name: "limit", kind: "int", min: 1, max: 50, default: 15 }] } as unknown as StepDef;
  assert.deepEqual(jobLimit(db, step), { limit: 15 });
  addJob(db, "fixup", "running", { limit: 15 }, 4); // 4 used (counted today), 11 unspent
  assert.deepEqual(jobLimit(db, step), { limit: 5 });
  addJob(db, "fixup", "queued", { limit: 5 });
  assert.equal(jobLimit(db, step), null);
});
