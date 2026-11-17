// A review binds the base branch its diff was read against; a Merge answer carried across a base merge covers no fix-up.
import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { mergeDecisionId } from "../src/core/rules.ts";
import { recordLiveBase } from "../src/merge/base.ts";
import { premergeAt } from "../src/premerge/store.ts";
import { advancePreapprovals, preapprovalOf } from "../src/preapproval/index.ts";
import { markedStaleSince, staleReviews } from "../src/review/discussion.ts";
import { reviewHold } from "../src/review/gate.ts";
import { saveOpus } from "../src/review/opus.ts";
import { T0, world, type World } from "./world-db.ts";

let current: World | null = null;
afterEach(() => current?.close());
const answerOf = (w: World, n: number, head: string) => w.rows("SELECT answer FROM decisions WHERE id = ?", mergeDecisionId("app", n, head));

test("a retarget makes the review stale like a push, and the re-review against the new base voids the old base's answer and pre-merge review", () => {
  const w = (current = world().repo().pr(1).review(1).answer(1, "merge").premerge(1, "clean"));
  w.db.prepare("UPDATE items SET base_ref = 'release' WHERE number = 1").run();
  w.db.prepare("UPDATE opus_reviews SET base_ref = 'release' WHERE number = 1").run();
  assert.equal(staleReviews(w.db, "app").size, 0);

  // The PR author retargets to the default branch; a live read before the merge records it.
  recordLiveBase(w.db, "app", 1, "sha1", "main");
  assert.ok(staleReviews(w.db, "app").has("app#1@sha1"));
  assert.equal(markedStaleSince(w.db, "app", 1, ""), false);
  const today = new Date().toISOString();
  for (let i = 0; i < 3; i++) w.db.prepare("INSERT INTO opus_review_history (repo, number, head_oid, at, model, mode, verdict, sure, reason) VALUES ('app', 1, 'sha1', ?, 'm', 'full', 'take', 1, 'r')").run(today);
  assert.equal(reviewHold(w.db, "app", 1, "sha1")?.kind, "cap");

  saveOpus(w.db, "rv2", { repo: "app", number: 1, head_oid: "sha1" }, {
    mode: "full", base: null, baseRef: "main", model: "m",
    review: { ref: "app#1", verdict: "take", sure: true, reason: "fine", fixes: [], risks: [], summary: null, why: null, public: null, conflicts: [], claims: [], blocked_by: [] },
  });
  assert.equal(staleReviews(w.db, "app").size, 0);
  assert.deepEqual(answerOf(w, 1, "sha1"), []);
  assert.equal(premergeAt(w.db, "app", 1, "sha1"), null);
  assert.equal(w.rows("SELECT trigger FROM opus_review_history WHERE number = 1 ORDER BY rowid DESC LIMIT 1")[0]!.trigger, "base");
});

test("a Merge answer carried across a clean base merge ends when the review there asks for fixes", () => {
  const w = (current = world().repo().pr(30).review(30, { verdict: "take" }).answer(30, "merge"));
  w.db.prepare("INSERT INTO conflict_merges (repo, number, from_head, to_head, state, attempt, created_at, own_diff) VALUES ('app', 30, 'sha30', 'sha30m', 'merged', 1, ?, 'same')").run(T0);
  w.synced(30, "sha30m");
  advancePreapprovals(w.db);
  assert.equal(preapprovalOf(w.db, "app", 30)?.state, "review");

  w.review(30, { head: "sha30m", verdict: "take-fix" });
  for (let i = 0; i < 3; i++) advancePreapprovals(w.db);
  assert.equal(preapprovalOf(w.db, "app", 30)?.state, "asked");
  assert.deepEqual(answerOf(w, 30, "sha30m"), [{ answer: null }]);

  // The review's fix-up pushes model-written code: nothing answers Merge there in the operator's name.
  w.db.prepare("INSERT INTO fixups (repo, number, from_head, to_head, state, attempt, created_at) VALUES ('app', 30, 'sha30m', 'sha30f', 'pushed', 1, ?)").run(T0);
  w.synced(30, "sha30f").review(30, { head: "sha30f" });
  for (let i = 0; i < 3; i++) advancePreapprovals(w.db);
  assert.equal(w.rows("SELECT 1 FROM preapprovals WHERE number = 30 AND state NOT IN ('asked', 'cancelled')").length, 0);
  assert.deepEqual(answerOf(w, 30, "sha30f"), []);
});
