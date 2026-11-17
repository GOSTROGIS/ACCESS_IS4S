// A Retry on a refused merge lets the merge step try again at once, instead of waiting for CI or the mergeable state to change.
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadPrFacts } from "../src/core/facts.ts";
import { mergeDecisionId } from "../src/core/rules.ts";
import { world } from "./world-db.ts";

test("a retry after a refused merge clears the refusal at that head", () => {
  const w = world().repo().pr(1).review(1);
  const head = (w.db.prepare("SELECT head_oid FROM items WHERE repo = 'app' AND number = 1").get() as { head_oid: string }).head_oid;
  w.db.prepare("INSERT INTO merges (repo, number, head_oid, run_id, at, path, outcome, reason, ci, mergeable) VALUES ('app', 1, ?, 'm', '2026-01-01T00:00:00Z', 'operator', 'refused', 'safe-merge: REFUSED', 'success', 'MERGEABLE')").run(head);
  const last = () => loadPrFacts(w.db).find((f) => f.number === 1)!.lastMerge;
  assert.equal(last()?.outcome, "refused");
  w.db.prepare("INSERT INTO audit (at, login, action, target) VALUES ('2026-01-01T00:05:00Z', 'op', 'retry', ?)").run(mergeDecisionId("app", 1, head));
  assert.equal(last(), null);
});
