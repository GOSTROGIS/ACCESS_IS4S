import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { connect } from "../src/db.ts";
import { tmpdir } from "./world-db.ts";
import { carriedReview } from "../src/review/carry.ts";
import { changedHunks, ownDiffKey } from "../src/review/own-diff.ts";
import { prepareOpusInput, type OpusDeps } from "../src/review/opus.ts";
import { conflictBucket } from "../src/fixup/conflict-state.ts";

process.env.AUTOCRAFT_DIFF_CACHE = join(tmpdir("conflict-cost-diffs"), "cache");

const diff = (ctx: string, add: string) => `diff --git a/src/a.rs b/src/a.rs
index 1111111..2222222 100644
--- a/src/a.rs
+++ b/src/a.rs
@@ -10,3 +10,4 @@ fn f() {
 ${ctx}
+${add}
 }
`;

test("a merge of the base that leaves the PR's own diff alone carries the verdict; changed hunks are read alone", () => {
  assert.equal(ownDiffKey(diff("let a = 1;", "let b = 2;")), ownDiffKey(diff("let a = 9;", "let b = 2;").replace("@@ -10,3", "@@ -40,3")), "context and line numbers moved by the base");
  assert.notEqual(ownDiffKey(diff("x", "let b = 2;")), ownDiffKey(diff("x", "let b = 3;")));
  const before = diff("x", "let b = 2;");
  const after = `${diff("x", "let b = 3;")}diff --git a/src/b.rs b/src/b.rs\n--- a/src/b.rs\n+++ b/src/b.rs\n@@ -1 +1 @@\n-old\n+new\n`;
  const only = changedHunks(before, after);
  assert.match(only, /let b = 3;/);
  assert.match(only, /src\/b\.rs/);
  assert.equal(changedHunks(before, before), "");

  const db = connect(join(tmpdir("conflict-cost"), "t.db"));
  const at = "2026-11-04T10:00:00.000Z";
  db.prepare(`INSERT INTO opus_reviews (repo, number, head_oid, at, model, mode, verdict, sure, reason, fixes, seen_at) VALUES ('app', 1, 'E', ?, 'opus', 'full', 'take-fix', 1, 'r', '[{"file":"a","change":"c"}]', ?)`).run(at, at);
  db.prepare("INSERT INTO conflict_merges (repo, number, from_head, to_head, state, attempt, created_at, own_diff) VALUES ('app', 1, 'E', 'H', 'merged', 1, ?, 'same')").run(at);
  db.prepare("INSERT INTO conflict_merges (repo, number, from_head, to_head, state, attempt, created_at, own_diff) VALUES ('app', 1, 'E', 'H2', 'merged', 1, ?, 'changed')").run(at);
  const k = carriedReview(db, { repo: "app", number: 1, head_oid: "H" });
  assert.equal(k?.review.verdict, "take-fix");
  assert.deepEqual(k?.review.fixes, [{ file: "a", change: "c" }]);
  assert.equal(carriedReview(db, { repo: "app", number: 1, head_oid: "H2" }), null, "changed diff: reviewed, not carried");
});

test("a third merge of the base into one PR in a UTC day waits for the next day", () => {
  const db = connect(join(tmpdir("conflict-cap"), "t.db"));
  const now = Date.parse("2026-11-04T20:00:00Z");
  const ins = (from: string, to: string, at: string) => db.prepare("INSERT INTO conflict_merges (repo, number, from_head, to_head, state, attempt, created_at) VALUES ('app', 1, ?, ?, 'merged', 1, ?)").run(from, to, at);
  const p = (head: string) => conflictBucket(db, { repo: "app", number: 1, head, pushable: true }, { push: true, comment: true }, now);
  ins("a", "b", "2026-11-03T23:00:00Z");
  ins("b", "c", "2026-11-04T01:00:00Z");
  assert.equal(p("c"), "merge", "one merge today");
  ins("c", "d", "2026-11-04T02:00:00Z");
  assert.equal(p("d"), "capped");
  assert.equal(conflictBucket(db, { repo: "app", number: 1, head: "d", pushable: true }, { push: true, comment: true }, now + 5 * 3600_000), "merge", "next UTC day");
});

test("the review after our resolution reads the changed and dropped PR hunks, and a head with no recorded delta is reviewed in full", async () => {
  const db = connect(join(tmpdir("conflict-delta"), "t.db"));
  const at = "2026-11-04T10:00:00.000Z";
  db.prepare(`INSERT INTO opus_reviews (repo, number, head_oid, at, model, mode, verdict, sure, reason, seen_at) VALUES ('app', 1, 'E', ?, 'opus', 'full', 'take', 1, 'r', ?)`).run(at, at);
  const before = `${diff("x", "let kept = 1;")}diff --git a/src/b.rs b/src/b.rs\n--- a/src/b.rs\n+++ b/src/b.rs\n@@ -1 +1 @@\n-old\n+dropped line\n`;
  const after = diff("x", "let kept = 1;");
  const delta = changedHunks(before, after);
  assert.match(delta, /\(gone\) \+dropped line/, "the dropped hunk is shown, marked");
  assert.doesNotMatch(delta, /^\+dropped line/m);
  assert.equal(delta.match(/^diff --git a\/src\/b\.rs/gm)?.length, 1, "a path's header appears once");
  // A file the resolver touched shows every hunk, including one whose text did not change.
  const two = `${diff("x", "let kept = 1;")}@@ -50,2 +51,3 @@\n y\n+let moved = 1;\n z\n`;
  assert.equal(changedHunks(two, two), "");
  assert.match(changedHunks(two, two, ["src/a.rs"]), /let moved = 1;/);
  assert.match(changedHunks(two, two, ["src/a.rs"]), /let kept = 1;/);
  db.prepare("INSERT INTO conflict_merges (repo, number, from_head, to_head, state, attempt, created_at, own_diff, own_delta) VALUES ('app', 1, 'E', 'H', 'merged', 1, ?, 'changed', ?)").run(at, delta);
  db.prepare("INSERT INTO conflict_merges (repo, number, from_head, to_head, state, attempt, created_at, own_diff, own_delta) VALUES ('app', 1, 'E', 'H2', 'merged', 1, ?, 'changed', NULL)").run(at);
  const deps: OpusDeps = { fetchDiff: async () => ({ ok: true, text: after }), fetchDelta: async () => ({ ok: false, tooLarge: false, error: "unused" }), model: "opus", maxChars: 120_000 };
  const c = (head_oid: string) => ({ repo: "app", number: 1, title: "t", body: "b", author_association: null, head_oid, lines_changed: 2, size: "S" as const, score: null });
  const d = await prepareOpusInput(db, "app", c("H"), deps, () => {});
  assert.equal(d.kind === "ready" && d.mode, "delta");
  assert.ok(d.kind === "ready" && d.input.diff.includes("dropped line"));
  const f = await prepareOpusInput(db, "app", c("H2"), deps, () => {});
  assert.equal(f.kind === "ready" && f.mode, "full", "an empty delta is not a delta");
});
