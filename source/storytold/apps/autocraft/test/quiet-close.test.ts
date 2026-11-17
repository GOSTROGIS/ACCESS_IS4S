import { test } from "node:test";
import assert from "node:assert/strict";
import { closeQuestion } from "../src/act/index.ts";

const row = { repo: "r", number: 7, head_oid: "abc", reason: "this fixes an overflow in the parser", sure: 1, lines: 10, title: "t", author: "a" };

test("a quiet pull request's Close? question carries no review reason", () => {
  const q = closeQuestion(row as never, null, true);
  assert.equal(q.public_text, undefined);
  assert.ok(!JSON.stringify(q).includes("overflow"));
  assert.ok(JSON.stringify(closeQuestion(row as never)).includes("overflow"));
});
