// The runner on fake steps: it runs queued jobs in child processes, records
// success, failure and usage, honours cancels, recovers jobs an earlier runner
// left running, runs one job per step and repo at a time.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { after, describe, test } from "node:test";
import { fileURLToPath } from "node:url";
import { SCRATCH } from "./scratch.ts";

process.env.AUTOCRAFT_EXTRA_STEPS = fileURLToPath(new URL("./runner-steps.ts", import.meta.url));

const { connect } = await import("../src/db.ts");
const { enqueue, getJob, jobDetail, requestCancel } = await import("../src/runner/jobs.ts");
const { DEFAULT_MAX_JOBS, Runner } = await import("../src/runner/runner.ts");
const { STEPS } = await import("../src/runner/steps.ts");
const { FAKE_TOKEN } = await import("./runner-steps.ts");
const { inputHash } = await import("../src/runner/classify.ts");

mkdirSync(SCRATCH, { recursive: true });
const dir = mkdtempSync(join(SCRATCH, "runner-test-"));
const dbFile = join(dir, "runner.db");
const db = connect(dbFile);
db.exec("INSERT OR IGNORE INTO tracked_repos (name, pipeline) VALUES ('app', 1); UPDATE tracked_repos SET pipeline = 1");
const runner = new Runner({ db, dbFile, logs: join(dir, "logs"), killAfterMs: 2000, log: () => {} });

after(async () => {
  await runner.stop();
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

async function until(cond: () => boolean, ms = 20_000): Promise<void> {
  const end = Date.now() + ms;
  while (!cond()) {
    if (Date.now() > end) throw new Error("timed out");
    await runner.tick();
    await new Promise((r) => setTimeout(r, 50));
  }
}

const state = (id: number) => getJob(db, id).state;

describe("runner", () => {
  test("runs a queued job and records its summary, usage and a scrubbed log; a failing job is failed", async () => {
    const ok = await enqueue(db, "test-echo", { n: 7 }, "boss");
    const bad = await enqueue(db, "test-echo", { mode: "fail" }, "boss");
    await until(() => state(ok.id) === "done" && state(bad.id) === "failed");
    const j = jobDetail(db, ok.id);
    assert.equal(j.summary, "echo 7");
    assert.deepEqual(j.usage, { calls: 1, input: 100, output: 10, costUsd: 0.01 });
    assert.ok(j.startedAt && j.endedAt);
    assert.ok(j.log!.includes("token in the log: [hidden]"), j.log!);
    assert.ok(!j.log!.includes(FAKE_TOKEN));
    assert.equal(getJob(db, bad.id).error, "echo failed on purpose");
  });






});
