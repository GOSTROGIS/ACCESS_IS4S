import assert from "node:assert/strict";
import { test } from "node:test";
import { linkReviewCalls, type Ev } from "../src/dash/api/trace.ts";

const call = (id: number, at: string, promptId: string): Ev => ({
  id: `run:${id}`, kind: "model-call", at, head: null, actor: { type: "model", name: "opus" }, summary: "x", ref: { runId: id },
  call: { promptId, model: "opus", provider: "claude", account: null, state: "done", inputTokens: null, outputTokens: null, costUsd: id === 2 ? 0.9 : id === 3 ? 0.12 : null, toolCalls: 0, endedAt: null },
});
const review = (id: string, at: string): Ev => ({ id, kind: "review", at, head: null, actor: { type: "model", name: "opus" }, summary: "r", ref: {} });

test("a review takes the calls of its prompt since the previous review of its kind, fix turn included", () => {
  const events = [
    call(1, "2026-01-01T10:00:00Z", "review.opus"), review("review:opus:1", "2026-01-01T10:05:00Z"),
    call(2, "2026-01-01T11:00:00Z", "review.opus"), call(3, "2026-01-01T11:02:00Z", "review.opus"), call(4, "2026-01-01T11:01:00Z", "lint.reference.jev"),
    review("review:opus:2", "2026-01-01T11:05:00Z"), call(5, "2026-01-01T11:10:00Z", "premerge.opus"),
  ];
  const taken = linkReviewCalls(events);
  assert.deepEqual(events.find((e) => e.id === "review:opus:1")!.ref.runIds, [1]);
  assert.deepEqual(events.find((e) => e.id === "review:opus:2")!.ref.runIds, [2, 3]);
  assert.equal(events.find((e) => e.id === "review:opus:2")!.costUsd, 1.02);
  assert.equal(events.find((e) => e.id === "review:opus:1")!.costUsd, null);
  assert.deepEqual([...taken].sort(), [1, 2, 3]);
});
