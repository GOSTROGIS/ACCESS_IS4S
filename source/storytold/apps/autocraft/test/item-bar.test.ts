import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyJob, deriveSteps, type Evidence } from "../src/dash/api/item-bar.ts";

const ev = (stage: Evidence["stage"], state: Evidence["state"], at: string, jobId: number | null = null): Evidence => ({ stage, state, at, jobId, label: stage, reason: null });
const ids = (s: ReturnType<typeof deriveSteps>) => s.map((x) => `${x.stage}:${x.state}`);

test("an open PR shows what ran, the running stage and the core stages ahead; the latest result of a stage wins", () => {
  const steps = deriveSteps({
    kind: "pr", state: "open", current: "fixup", running: true, costs: new Map([["fixup", 0.5]]), ahead: true, postmergeNext: false,
    evidence: [ev("classify", "done", "2026-01-01T10:00"), ev("review", "done", "2026-01-01T11:00"), ev("fixup", "failed", "2026-01-01T12:00", 7), ev("fixup", "done", "2026-01-01T13:00", 8)],
  });
  assert.deepEqual(ids(steps), ["classify:done", "review:done", "fixup:current", "verify:next", "merge:next", "postmerge:next"]);
  assert.equal(steps.find((s) => s.stage === "fixup")!.running, true);
  assert.equal(steps.find((s) => s.stage === "fixup")!.costUsd, 0.5);
});

test("a merged PR keeps only the post-merge review ahead; an issue never shows PR stages", () => {
  assert.deepEqual(ids(deriveSteps({ kind: "pr", state: "merged", current: null, running: false, costs: new Map(), ahead: true, postmergeNext: true, evidence: [ev("review", "done", "a"), ev("merge", "done", "b")] })), ["review:done", "merge:done", "postmerge:next"]);
  assert.deepEqual(ids(deriveSteps({ kind: "issue", state: "open", current: null, running: false, costs: new Map(), ahead: true, postmergeNext: true, evidence: [ev("classify", "done", "a"), ev("review", "done", "b")] })), ["classify:done"]);
});

test("a done job whose outcome is a refusal is a failure, and queue-side steps never complete Merge", () => {
  assert.equal(classifyJob({ step: "fixup", state: "done", outcome: "refused: crates/doc/src/build.rs is not a file a fix-up may edit" }), "failed");
  assert.equal(classifyJob({ step: "unassign", state: "done", outcome: "unassigned" }), "neutral");
  assert.equal(classifyJob({ step: "merge", state: "done", outcome: "merged" }), "neutral");
  assert.equal(classifyJob({ step: "opus-review", state: "done", outcome: "take" }), "done");
});
