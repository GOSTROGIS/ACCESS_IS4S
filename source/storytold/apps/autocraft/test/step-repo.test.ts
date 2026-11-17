// Jobs are unique per (step, repo): two repos of one step run together within step_parallel, one repo never twice,
// and when the process cap is reached the security class starts first.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";
import { SCRATCH } from "./scratch.ts";

process.env.AUTOCRAFT_EXTRA_STEPS = fileURLToPath(new URL("./runner-steps.ts", import.meta.url));

const { connect } = await import("../src/db.ts");
const { enqueue, getJob } = await import("../src/runner/jobs.ts");
const { Runner } = await import("../src/runner/runner.ts");
const { setStepParallel } = await import("../src/runner/concurrency.ts");

mkdirSync(SCRATCH, { recursive: true });
const dir = mkdtempSync(join(SCRATCH, "step-repo-"));
const db = connect(join(dir, "t.db"));
for (const r of ["a", "b"]) db.prepare("INSERT OR IGNORE INTO tracked_repos (name, pipeline) VALUES (?, 1)").run(r);
const make = (maxJobs?: number) => new Runner({ db, dbFile: join(dir, "t.db"), logs: join(dir, "logs"), killAfterMs: 2000, log: () => {}, ...(maxJobs ? { maxJobs } : {}) });
const runners: InstanceType<typeof Runner>[] = [];
after(async () => { for (const r of runners) await r.stop(); db.close(); rmSync(dir, { recursive: true, force: true }); });

const state = (id: number) => getJob(db, id).state;
async function pump(r: InstanceType<typeof Runner>, cond: () => boolean, ms = 20_000): Promise<void> {
  const end = Date.now() + ms;
  while (!cond()) {
    if (Date.now() > end) throw new Error("timed out");
    await r.tick();
    await new Promise((x) => setTimeout(x, 50));
  }
}
const settle = async (r: InstanceType<typeof Runner>, ids: number[]) => pump(r, () => ids.every((i) => ["done", "failed"].includes(state(i))));

test("step_parallel: two repos run together with none, wait for each other with 1, and one repo never runs twice", async () => {
  const r = make();
  runners.push(r);
  setStepParallel(db, "none", "test");
  const [a, b, a2] = [await enqueue(db, "test-repo", { repo: "a", ms: 1500 }, "t"), await enqueue(db, "test-repo", { repo: "b", ms: 1500 }, "t"), await enqueue(db, "test-repo", { repo: "a", ms: 100 }, "t")];
  await pump(r, () => state(a.id) === "running" && state(b.id) === "running");
  assert.equal(state(a2.id), "queued", "the second job of repo a waits for the first");
  await settle(r, [a.id, b.id, a2.id]);

  setStepParallel(db, 1, "test");
  const [c, d] = [await enqueue(db, "test-repo", { repo: "a", ms: 1000 }, "t"), await enqueue(db, "test-repo", { repo: "b", ms: 100 }, "t")];
  await pump(r, () => state(c.id) === "running");
  await r.tick();
  assert.equal(state(d.id), "queued", "with step_parallel 1 the second repo waits");
  await settle(r, [c.id, d.id]);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM audit WHERE action = 'step-parallel'").get()!.n, 2);
});

test("at the process cap a queued security-class job starts before an older normal job", async () => {
  const r = make(1);
  runners.push(r);
  setStepParallel(db, "none", "test");
  const busy = await enqueue(db, "test-sleep", { ms: 1200 }, "t");
  await pump(r, () => state(busy.id) === "running");
  const normal = await enqueue(db, "test-repo", { repo: "a", ms: 50 }, "t");
  const urgent = await enqueue(db, "test-urgent", { repo: "b", ms: 50 }, "t");
  await settle(r, [busy.id, normal.id, urgent.id]);
  assert.ok(getJob(db, urgent.id).startedAt! <= getJob(db, normal.id).startedAt!, "the security job started first");
});

test("a proposal reserves the step it is gated on: at step_parallel 1 another repo's job of that step waits", async () => {
  const { applyProposals, detectAutopilot } = await import("../src/runner/autopilot.ts");
  db.exec("DELETE FROM jobs");
  setStepParallel(db, 1, "test");
  const lanes = [
    { name: "first", steps: ["test-repo"], detect: () => [{ step: "test-repo", params: { repo: "a" }, gate: { step: "test-urgent", params: { repo: "a" } } }] },
    { name: "second", steps: ["test-urgent"], detect: () => [{ step: "test-urgent", params: { repo: "b" } }] },
  ];
  const found = await detectAutopilot(db, { lanes });
  const ids = await applyProposals(db, found.proposals, { lanes });
  assert.deepEqual((db.prepare("SELECT step, repo FROM jobs WHERE id IN (" + ids.join(",") + ")").all() as { step: string; repo: string }[]).map((j) => `${j.step}:${j.repo}`), ["test-repo:a"]);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM jobs").get()!.n, 1);
});
