import { test } from "node:test";
import assert from "node:assert/strict";
import { settle } from "../src/classify/settled.ts";

const jev = { label: "bugfix", flags: [], top: 0.5, nd: 0.1 };
const haiku = { label: "missing feature", flags: [] };

test("a sure referee settles the label with no flag", () => {
  const s = settle(jev, haiku, { label: "bugfix", sure: true, reason: "" });
  assert.deepEqual([s.status, s.label, s.flags], ["settled", "bugfix", []]);
});

test("an unsure first referee leaves the disagreement for the next one", () => {
  assert.equal(settle(jev, haiku, { label: "bugfix", sure: false, reason: "" }).status, "disagree");
});

test("an unsure final referee settles the label and flags a scope decision", () => {
  const s = settle(jev, haiku, { label: "missing feature", sure: false, reason: "", final: true });
  assert.deepEqual([s.status, s.label, s.flags], ["settled", "missing feature", ["needs decision"]]);
});

test("three failed Opus calls end the referee's turn like an unsure Opus", () => {
  const s = settle(jev, haiku, { label: "bugfix", sure: false, reason: "", failures: 3 });
  assert.deepEqual([s.status, s.flags], ["settled", ["needs decision"]]);
  assert.equal(settle(jev, haiku, { label: "bugfix", sure: false, reason: "", failures: 2 }).status, "disagree");
});
