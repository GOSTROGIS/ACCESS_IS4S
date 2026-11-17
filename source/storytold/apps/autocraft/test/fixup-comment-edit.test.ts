import assert from "node:assert/strict";
import { test } from "node:test";
import { newestOwnComment } from "../src/fixup/conflict.ts";
import { withNote } from "../src/github/note.ts";
import { commentText, fixupCommentEdited, fixupCommentLines, carryCommentText, operatorCommentText } from "../src/fixup/template.ts";

const BOT = new Set(["bot"]);
const q = (nodes: object[], reviews: object[] = []) => ({ async query() { return { repository: { pullRequest: { comments: { nodes }, reviews: { nodes: reviews } } } }; } });
const node = (text: string, login = "bot") => ({ databaseId: 9, body: withNote({ by: "fixed" }, text), createdAt: "2026-01-01T00:00:00Z", author: { login } });

test("a second review-fix push extends our newest comment; anything else posts a new one", async () => {
  const first = commentText(["a.rs", "b.md"]);
  const mine = await newestOwnComment(q([node(first)]), BOT, "app", 1);
  assert.equal(mine?.id, "9");
  const lines = fixupCommentLines(mine!.body)!;
  const edited = fixupCommentEdited(lines, ["c.rs"]);
  assert.equal(edited, `${first}\n\nPushed further fixes from a later review: \`c.rs\`.`);
  // A third round keeps both earlier lines.
  assert.equal(fixupCommentLines(withNote({ by: "fixed" }, edited))?.length, 2);
  // Not ours to extend: carry, operator, other text, another author, a later review, a failed read.
  assert.equal(fixupCommentLines(carryCommentText([3], ["a.rs"])), null);
  assert.equal(fixupCommentLines(operatorCommentText(["a.rs"])), null);
  assert.equal(fixupCommentLines("Looks good"), null);
  assert.equal(await newestOwnComment(q([node(first, "someone")]), BOT, "app", 1), null);
  assert.equal(await newestOwnComment(q([node(first)], [{ submittedAt: "2026-01-02T00:00:00Z" }]), BOT, "app", 1), null);
  assert.equal(await newestOwnComment({ async query() { throw new Error("down"); } }, BOT, "app", 1), null);
});

test("on an app repo the bare slug GraphQL returns matches our login set", async () => {
  const mine = await newestOwnComment(q([node("x", "my-app")]), new Set(["boxuser", "my-app", "my-app[bot]"]), "app", 1);
  assert.equal(mine?.id, "9");
});
