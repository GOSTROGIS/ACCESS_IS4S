import assert from "node:assert/strict";
import { test } from "node:test";
import { newestConflictNote, type ConflictRun } from "../src/fixup/conflict.ts";
import type { ConflictCandidate } from "../src/fixup/conflict-state.ts";
import { withNote } from "../src/github/note.ts";
import { conflictCommentCount, conflictCommentText } from "../src/fixup/template.ts";

const c = { repo: "app", number: 7, base: "main" } as ConflictCandidate;
const run = (pr: object | Error): ConflictRun => ({
  repo: "app",
  who: async () => ({ login: "bot", nodeId: "U", email: "e" }),
  d: { querier: { async query() { if (pr instanceof Error) throw pr; return { repository: { pullRequest: pr } }; } } },
}) as unknown as ConflictRun;
const ours = (text: string, login = "bot") => ({ databaseId: 55, body: withNote({ by: "fixed" }, text), createdAt: "2026-01-01T00:00:00Z", author: { login } });

test("the conflict note is edited only when ours is the newest comment and no review followed", async () => {
  const first = conflictCommentText("main");
  assert.deepEqual(await newestConflictNote(run({ comments: { nodes: [ours(first)] }, reviews: { nodes: [] } }), c), { id: "55", count: 1 });
  const third = conflictCommentText("main", 3, "2026-01-01T04:47:00Z");
  assert.match(third, /\(3 times, last at 04:47 UTC\)/);
  assert.equal(conflictCommentCount(withNote({ by: "fixed" }, third), "main"), 3);
  assert.equal(conflictCommentCount(withNote({ by: "fixed" }, "Merged main into this branch to resolve conflicts (many times, last at x UTC)."), "main"), null);
  assert.equal((await newestConflictNote(run({ comments: { nodes: [ours(third)] }, reviews: { nodes: [] } }), c))?.count, 3);
  // A review after it, another author, other text, or a failed read: post a new note.
  assert.equal(await newestConflictNote(run({ comments: { nodes: [ours(first)] }, reviews: { nodes: [{ submittedAt: "2026-01-02T00:00:00Z" }] } }), c), null);
  assert.equal(await newestConflictNote(run({ comments: { nodes: [ours(first, "someone")] }, reviews: { nodes: [] } }), c), null);
  assert.equal(await newestConflictNote(run({ comments: { nodes: [ours("Looks good")] }, reviews: { nodes: [] } }), c), null);
  assert.equal(await newestConflictNote(run(new Error("down")), c), null);
});
