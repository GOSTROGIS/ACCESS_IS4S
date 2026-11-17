// Build batches: with the feature on, a build task checks the combined tree before the batch PR opens; every failure to
// build opens the PR anyway. GitHub, git and the build worker are faked (test/world-db.ts); no build runs.
import assert from "node:assert/strict";
import { afterEach, describe, test } from "node:test";
import { setFeature } from "../src/build/features.ts";
import { runBatches, type BatchDeps } from "../src/merge/batch.ts";
import { world, type World } from "./world-db.ts";

const quiet = () => {};
let current: World | null = null;
afterEach(() => current?.close());

const PATCH = "diff --git a/x b/x\n--- a/x\n+++ b/x\n@@ -1 +1 @@\n-a\n+b\n";
function setup(prs: number[], on: boolean) {
  const w = (current = world().repo());
  for (const n of prs) w.pr(n).review(n).verified(n).premerge(n, "clean");
  if (on) { setFeature(w.db, "batch-build", true, "op"); setFeature(w.db, "batch-build", true, "op", "app"); }
  const base = w.gh.batchDeps();
  const calls: string[] = [];
  let patch = PATCH;
  const deps: BatchDeps = { ...base, exec: async (cmd, args, opts) => {
    calls.push(`${cmd} ${args.join(" ")}`);
    if (cmd === "git" && args.includes("diff-tree")) return { code: 0, stdout: patch, stderr: "" };
    return base.exec(cmd, args, opts);
  } };
  return { w, deps, calls, setPatch: (p: string) => { patch = p; } };
}
const run = (t: ReturnType<typeof setup>) => runBatches(t.w.db, { repo: "app" }, quiet, t.deps);
const batches = (w: World) => w.rows("SELECT id, state, build_state, build_tries, task_id, parent_id, pr_number FROM merge_batches ORDER BY id");
const tasks = (w: World) => w.rows("SELECT id, step, state FROM build_tasks ORDER BY id");

/** Ends a task the way a worker would: every plan step passed, or the named step failed (earlier ones passed), or no step ran. */
function finish(w: World, id: number, how: "pass" | "env" | { failAt: string }): void {
  const plan = JSON.parse((w.rows("SELECT plan FROM build_tasks WHERE id = ?", id)[0] as { plan: string }).plan) as { name: string }[];
  const results: object[] = [];
  if (how !== "env") {
    for (const s of plan) {
      const bad = typeof how === "object" && s.name === how.failAt;
      results.push({ step: s.name, exitCode: bad ? 1 : 0, durationMs: 1, timedOut: false });
      if (bad) break;
    }
  }
  const state = how === "pass" ? "done" : "failed";
  w.db.prepare("UPDATE build_tasks SET state = ?, results = ?, ended_at = ?, summary = 'x' WHERE id = ?").run(state, JSON.stringify(results), "2026-01-02T00:00:00Z", id);
}

describe("batch-build", () => {
  test("off: the batch PR opens at once with no task; on: a task is queued, the PR opens once it passed", async () => {
    const off = setup([1, 2], false);
    await run(off);
    assert.deepEqual(tasks(off.w), []);
    assert.deepEqual(batches(off.w).map((b) => [b.build_state, b.pr_number]), [[null, 900]]);
    assert.ok(!off.calls.some((c) => c.includes("diff-tree")));
    off.w.close();

    const t = setup([1, 2], true);
    const first = await run(t);
    assert.equal(first.published.length, 0);
    assert.deepEqual(tasks(t.w), [{ id: 1, step: "merge-batch", state: "queued" }]);
    assert.deepEqual(batches(t.w).map((b) => [b.state, b.build_state, b.build_tries, b.pr_number]), [["checking", "pending", 1, null]]);
    assert.equal(t.w.gh.writesOf("pr").length, 0);

    assert.deepEqual((await run(t)).waiting.length, 1);
    assert.equal(t.w.gh.writesOf("pr").length, 0);
    finish(t.w, 1, "pass");
    assert.equal((await run(t)).published.length, 1);
    assert.deepEqual(batches(t.w).map((b) => [b.state, b.build_state, b.pr_number]), [["open", "passed", 900]]);
  });

  test("a binary diff, or the switch turned off mid-flight, opens the PR without the build", async () => {
    const bin = setup([1], true);
    bin.setPatch("diff --git a/x.png b/x.png\nBinary files a/x.png and b/x.png differ\n");
    await run(bin);
    assert.deepEqual(tasks(bin.w), []);
    assert.deepEqual(batches(bin.w).map((b) => [b.build_state, b.pr_number]), [["skipped", 900]]);
    bin.w.close();

    const t = setup([1], true);
    await run(t);
    setFeature(t.w.db, "batch-build", false, "op");
    await run(t);
    assert.deepEqual(tasks(t.w), [{ id: 1, step: "merge-batch", state: "cancelled" }]);
    assert.deepEqual(batches(t.w).map((b) => [b.build_state, b.pr_number]), [["skipped", 900]]);
  });

  test("a red tree splits the batch, each half is built before it opens; a single PR is held", async () => {
    const t = setup([1, 2, 3, 4], true);
    await run(t);
    t.w.db.prepare("UPDATE merge_batches SET build_tries = 2").run();
    finish(t.w, 1, { failAt: "test" });
    const s = await run(t);
    assert.equal(s.split.length, 1);
    const rows = batches(t.w);
    assert.deepEqual(rows.map((b) => [b.state, b.parent_id]), [["split", null], ["checking", 1], ["checking", 1]]);
    assert.deepEqual(rows.slice(1).map((b) => b.build_state), ["pending", "pending"]);
    assert.equal(t.w.rows("SELECT COUNT(*) AS n FROM merge_batch_prs WHERE batch_id = 2")[0]!.n, 2);
    assert.equal(tasks(t.w).length, 3);
    assert.equal(t.w.gh.writesOf("pr").length, 0);
    t.w.close();

    const one = setup([1], true);
    await run(one);
    finish(one.w, 1, { failAt: "build" });
    await run(one);
    assert.deepEqual(batches(one.w).map((b) => [b.state, b.build_state]), [["failed", "failed"]]);
    assert.match(one.w.rows("SELECT note FROM stages WHERE stage = 'hold' AND number = 1")[0]!.note as string, /combined tree failed at build/);
    assert.equal(one.w.gh.writesOf("pr").length, 0);
  });

  test("a failed test step is rerun once; an environment error is queued again, then the PR opens anyway", async () => {
    const t = setup([1], true);
    await run(t);
    finish(t.w, 1, { failAt: "test" });
    await run(t);
    assert.deepEqual(batches(t.w).map((b) => [b.state, b.build_tries, b.task_id]), [["checking", 2, 2]]);

    finish(t.w, 2, "env");
    assert.equal((await run(t)).waiting.length, 1);
    assert.equal(batches(t.w)[0]!.task_id, 2, "waits out the retry delay");
    t.w.db.prepare("UPDATE merge_batches SET updated_at = '2025-01-01T00:00:00Z'").run();
    await run(t);
    assert.deepEqual(batches(t.w).map((b) => [b.state, b.build_state, b.build_tries, b.task_id]), [["checking", "pending", 3, 3]]);
    assert.equal(t.w.gh.writesOf("pr").length, 0);

    finish(t.w, 3, "env");
    await run(t);
    assert.deepEqual(batches(t.w).map((b) => [b.state, b.build_state, b.pr_number]), [["open", "skipped", 900]]);
  });
});
