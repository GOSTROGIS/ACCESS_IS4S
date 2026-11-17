import { test } from "node:test";
import assert from "node:assert/strict";
import { labelWithScopeAnswer } from "../src/core/rules.ts";

test("a scope answer settles the label two scope classifiers left open, so the PR goes to review", () => {
  assert.equal(labelWithScopeAnswer(null, "small-extra"), "small extra");
  assert.equal(labelWithScopeAnswer("plugin candidate", "take"), "missing feature");
  assert.equal(labelWithScopeAnswer("bugfix", "take"), "bugfix");
  assert.equal(labelWithScopeAnswer(null, "plugin"), null);
});
