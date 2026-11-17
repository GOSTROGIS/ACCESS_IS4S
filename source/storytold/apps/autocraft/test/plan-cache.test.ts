// The planner's Plan cache (item_plans) and what a pass writes.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";
import { connect } from "../src/db.ts";
import { planHistory, prunePlanHistory, refreshPlanCache } from "../src/core/plan-cache.ts";
import { detectAutopilot, planDue, setEnabled } from "../src/runner/autopilot.ts";
import { SCRATCH } from "./scratch.ts";

mkdirSync(SCRATCH, { recursive: true });
const dir = mkdtempSync(join(SCRATCH, "plan-cache-"));
const T0 = "2026-01-01T00:00:00Z";

describe("Plan cache", () => {
  const db = connect(join(dir, "t.db"));
  db.prepare("INSERT INTO tracked_repos (name, pipeline) VALUES ('app', 1)").run();
  const add = db.prepare(`INSERT INTO items (repo, number, kind, state, title, body, is_draft, created_at, updated_at) VALUES ('app', ?, 'issue', 'OPEN', 't', 'b', 0, '${T0}', '${T0}')`);
  add.run(1); add.run(2);
  db.exec("UPDATE items SET embed_hash = NULL");
  setEnabled(db, true, "op");
  const cache = () => db.prepare("SELECT number, kind, state, actions FROM item_plans ORDER BY number").all() as { number: number; kind: string; state: string; actions: string }[];
  const seq = () => (db.prepare("SELECT seq FROM change_seq WHERE topic = 'plans'").get() as { seq: number }).seq;

  test("a pass writes one row per item, writes nothing else, and writes only changed rows the next time", async () => {
    const changes = () => (db.prepare("SELECT total_changes() AS n").get() as { n: number }).n;
    const before = db.prepare("SELECT COUNT(*) AS n FROM items WHERE embed_hash IS NULL").get() as { n: number };
    const first = await detectAutopilot(db);
    assert.equal(first.timing!.written, 2);
    assert.deepEqual(cache().map((r) => [r.number, r.kind]), [[1, "issue"], [2, "issue"]]);
    assert.ok(JSON.parse(cache()[0]!.actions).some((a: { kind: string }) => a.kind === "embed"), "the embed action is cached");
    assert.deepEqual(db.prepare("SELECT COUNT(*) AS n FROM items WHERE embed_hash IS NULL").get(), before, "planning fills no hashes");
    const s = seq();
    const n = changes();
    const second = await detectAutopilot(db);
    assert.deepEqual([second.timing!.written, second.timing!.deleted], [0, 0]);
    assert.equal(changes(), n, "an unchanged pass writes nothing");
    assert.equal(seq(), s);
  });

  test("a changed item rewrites its row only, and an item that closed leaves the cache", async () => {
    db.prepare("UPDATE items SET state = 'CLOSED' WHERE number = 2").run();
    const r = await detectAutopilot(db);
    assert.deepEqual([r.timing!.written, r.timing!.deleted], [0, 1]);
    assert.deepEqual(cache().map((x) => x.number), [1]);
  });

  test("with the pipeline off the planner is still due and caches the Plans (the runner queues no proposal then)", async () => {
    setEnabled(db, false, "op");
    db.prepare("UPDATE items SET state = 'OPEN' WHERE number = 2").run();
    assert.equal(planDue(db), true);
    const r = await detectAutopilot(db);
    assert.ok(r.proposals.every((p) => p.lane), "proposals are only data; applyProposals is not called while off");
    assert.equal(r.timing!.written, 1);
    assert.deepEqual(cache().map((x) => x.number), [1, 2]);
  });

  test("with the pipeline off a wake time that has passed makes one pass due, not every tick", () => {
    setEnabled(db, false, "op");
    planDue(db);
    db.prepare("INSERT INTO settings (key, value) VALUES ('pipeline_wake_at', ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value").run(new Date(Date.now() - 60_000).toISOString());
    assert.equal(planDue(db), true);
    assert.equal(planDue(db), false);
  });

  test("the history gets a row for each change of an item's state, none for a pass that changes nothing else", () => {
    const before = planHistory(db, "app", 1).length;
    refreshPlanCache(db);
    assert.equal(planHistory(db, "app", 1).length, before, "an unchanged pass adds no row");
    db.prepare("UPDATE item_plans SET state = 'earlier' WHERE number = 1").run();
    refreshPlanCache(db);
    db.prepare("UPDATE item_plans SET state = 'before-that', wait = 'x' WHERE number = 1").run();
    refreshPlanCache(db);
    const h = planHistory(db, "app", 1);
    assert.deepEqual(h.slice(before).map((r) => [r.oldState, r.wait === null]), [["earlier", true], ["before-that", true]]);
    db.prepare("UPDATE item_plans SET wait = 'y' WHERE number = 1").run();
    refreshPlanCache(db);
    const w = planHistory(db, "app", 1).at(-1)!;
    assert.deepEqual([w.oldWait, w.wait === null], ["y", true], "a wait-only change is recorded with the old wait");
    db.prepare("UPDATE items SET state = 'CLOSED' WHERE number = 2").run();
    refreshPlanCache(db);
    const gone = planHistory(db, "app", 2).at(-1)!;
    db.prepare("UPDATE items SET state = 'OPEN' WHERE number = 2").run();
    refreshPlanCache(db);
    assert.deepEqual([gone.newState, gone.oldState === null], ["gone", false], "an item leaving the plan set gets a row");
    assert.equal(h[h.length - 1]!.newState, cache()[0]!.state);
    assert.equal(h[0]!.oldState, null, "the first plan has no old state");
    assert.ok(prunePlanHistory(db, 0, Date.now() + 1000) >= h.length);
    assert.equal(planHistory(db, "app", 1).length, 0);
  });
});

describe("the cached next step of a PR outside the pipeline's scope", () => {
  test("names the step its stored rows wait on, not Review", () => {
    const db = connect(join(dir, "scope.db"));
    db.prepare("INSERT INTO tracked_repos (name, pipeline) VALUES ('off', 0)").run();
    const pr = db.prepare(`INSERT INTO items (repo, number, kind, state, title, body, is_draft, head_oid, created_at, updated_at) VALUES ('off', ?, 'pr', 'OPEN', 't', 'b', 0, ?, '${T0}', '${T0}')`);
    const jev = db.prepare(`INSERT INTO classifications (repo, number, classifier, run_id, at, type_label, flags, probs) VALUES ('off', ?, 'jev', 'r1', '${T0}', 'bugfix', '[]', '{"top":0.95}')`);
    const review = db.prepare(`INSERT INTO opus_reviews (repo, number, head_oid, run_id, at, model, verdict, reason, sure, mode) VALUES ('off', ?, ?, 'rv', '${T0}', 'sonnet', ?, 'why', 1, 'full')`);
    for (const [n, verdict] of [[1, "hold"], [2, "take-fix"], [3, "take"]] as const) { pr.run(n, `h${n}`); jev.run(n); review.run(n, `h${n}`, verdict); }
    pr.run(4, "h4"); jev.run(4);
    db.prepare(`INSERT INTO verifications (repo, number, head_sha, kind, reason, state, created_at) VALUES ('off', 3, 'h3', 'tests', 'r', 'passed', '${T0}')`).run();
    refreshPlanCache(db);
    const next = (n: number) => JSON.parse((db.prepare("SELECT view FROM item_plans WHERE repo = 'off' AND number = ?").get(n) as { view: string }).view).next;
    assert.deepEqual([1, 2, 3, 4].map(next), ["Needs a person", "Fix-up", "Merge queue", "Review"]);
    assert.equal((db.prepare("SELECT state FROM item_plans WHERE number = 3").get() as { state: string }).state, "out-of-scope");
  });
});
