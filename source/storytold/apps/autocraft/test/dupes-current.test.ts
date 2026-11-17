import { test } from "node:test";
import assert from "node:assert/strict";
import { currentComparison, kindSetsOf, saveComparison, type StoredComparison } from "../src/dupes/plan.ts";
import { T0, world } from "./world-db.ts";

test("a duplicate comparison survives head pushes and small diff changes, and is redone for a state change or a diff that moved over 20%", () => {
  const w = world().repo().pr(1, { lines: 100 }).pr(2, { lines: 100 });
  const group = { repo: "app", canonical: 1, why: "", members: [1, 2], edges: [] };
  const set = () => kindSetsOf(w.db, group)[0]!;
  const s0 = set();
  const cmp: StoredComparison = { repo: "app", key: s0.key, kind: "pr", members: [1, 2], hash: s0.hash, kept: 1, source: "model", model: "m", reason: null, result: null, error: null, attempts: 0, at: T0 };
  saveComparison(w.db, cmp);
  assert.ok(currentComparison(w.db, set()));
  w.db.prepare("UPDATE items SET head_oid = 'newhead', title = 'edited', body = 'edited', additions = 115 WHERE repo = 'app' AND number = 2").run();
  assert.ok(currentComparison(w.db, set()), "a push with a 15% size change keeps the result");
  w.db.prepare("UPDATE items SET additions = 130 WHERE repo = 'app' AND number = 2").run();
  assert.equal(currentComparison(w.db, set()), null, "a 30% size change makes it stale");
  w.db.prepare("UPDATE items SET additions = 100 WHERE repo = 'app' AND number = 2").run();
  assert.ok(currentComparison(w.db, set()));
  w.db.prepare("UPDATE items SET state = 'MERGED' WHERE repo = 'app' AND number = 2").run();
  assert.equal(currentComparison(w.db, set()), null, "a state change makes it stale");
  w.db.prepare("UPDATE items SET state = 'OPEN' WHERE repo = 'app' AND number = 2").run();
  w.db.prepare("UPDATE items SET closing_issues = '[34]' WHERE repo = 'app' AND number = 2").run();
  assert.equal(currentComparison(w.db, set()), null, "a changed closing-issue link makes it stale");
});

test("the stored sizes are those of the compared snapshot, and a size unknown then makes the result stale once known", () => {
  const w = world().repo().pr(1, { lines: 100 }).pr(2, { lines: 100 });
  w.db.prepare("UPDATE items SET additions = NULL WHERE repo = 'app' AND number = 2").run();
  const group = { repo: "app", canonical: 1, why: "", members: [1, 2], edges: [] };
  const set = () => kindSetsOf(w.db, group)[0]!;
  const snap = set();
  w.db.prepare("UPDATE items SET additions = 500 WHERE repo = 'app' AND number = 1").run();
  saveComparison(w.db, { repo: "app", key: snap.key, kind: "pr", members: [1, 2], hash: snap.hash, kept: 1, source: "model", model: "m", reason: null, result: null, error: null, attempts: 0, at: T0 }, snap);
  assert.equal(currentComparison(w.db, set()), null, "PR 1 grew after the snapshot");
  w.db.prepare("UPDATE items SET additions = 100 WHERE repo = 'app' AND number = 1").run();
  assert.ok(currentComparison(w.db, set()));
  w.db.prepare("UPDATE items SET additions = 100 WHERE repo = 'app' AND number = 2").run();
  assert.equal(currentComparison(w.db, set()), null, "PR 2's size became known");
});
