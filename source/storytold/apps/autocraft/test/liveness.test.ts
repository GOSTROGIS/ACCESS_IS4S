// The liveness classifier: an open item is live when something will move it or a person has been asked; otherwise stuck.
import assert from "node:assert/strict";
import { test } from "node:test";
import { classify, type ItemFlags, type PlanRowLike } from "../src/liveness.ts";

const row = (o: Partial<PlanRowLike>): PlanRowLike => ({ kind: "pr", state: "opus-hold", itemState: "classified", phase: "Held", wait: null, waitKind: null, actions: 0, since: "2026-11-01T00:00:00Z", ...o });
const none: ItemFlags = { question: false, dispute: false, stopped: false };
const cause = (o: Partial<PlanRowLike>, f: Partial<ItemFlags> = {}) => { const v = classify(row(o), { ...none, ...f }); return `${v.live ? "live" : "stuck"}:${v.cause}`; };

test("an item is live when work is due, a person is asked or the wait has an external clearing event", () => {
  assert.equal(cause({ actions: 1 }), "live:planned");
  assert.equal(cause({}, { question: true }), "live:question");
  assert.equal(cause({}, { dispute: true }), "live:dispute");
  assert.equal(cause({}, { stopped: true }), "live:stopped");
  assert.equal(cause({}, { answered: true }), "live:answered");
  assert.equal(cause({ state: "waiting-ci", wait: "CI or GitHub's mergeable state", waitKind: "system" }), "live:external");
  assert.equal(cause({ state: "conflict", wait: "the author", waitKind: "contributor" }), "live:contributor");
  assert.equal(cause({ state: "backlog" }), "live:parked");
  assert.equal(cause({ state: "ready", wait: "merge held by an operator", waitKind: "person" }), "live:parked");
});

test("an item nobody will move or answer is stuck", () => {
  assert.equal(cause({}), "stuck:no-plan");
  assert.equal(cause({ state: "needs-decision", wait: "an operator's Merge? answer", waitKind: "person" }), "stuck:person-wait-without-question");
  assert.equal(cause({ state: "duplicate", wait: "a Duplicate? answer", waitKind: "person" }), "stuck:duplicate-without-question");
  assert.equal(cause({ state: "not-reviewed", wait: "the label referee", waitKind: "system" }), "stuck:internal-wait");
  assert.equal(cause({ state: "needs-decision", wait: "an operator's Merge? answer", waitKind: "person" }, { question: true }), "live:question");
});

test("a review wait names its blockers, whose questions keep the item live", async () => {
  const { blockersOfWait } = await import("../src/review/blockers.ts");
  assert.deepEqual(blockersOfWait("deckcraft#1424, deckcraft#990, which blocks its review"), ["deckcraft#1424", "deckcraft#990"]);
  assert.deepEqual(blockersOfWait("CI on the latest commit to pass"), []);
  assert.deepEqual(blockersOfWait(null), []);
});
