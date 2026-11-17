// Item traces on fake data: a PR with two pushes, model calls, a check run, a review, a decision and a GitHub write.
import type { Api } from "../client";
import type { AgentRunDetail, AgentRunTool, ItemTrace, ItemTraceDetail, TraceEvent, TraceKind } from "../types";
import { NOW, PIPELINE_OFF } from "./fixtures";

const wait = <T,>(v: T, ms = 60) => new Promise<T>((r) => setTimeout(() => r(structuredClone(v)), ms));
export const at = (minAgo: number) => new Date(NOW - minAgo * 60_000).toISOString();
const H1 = "3f2a9c1d0e8b7a6f5e4d3c2b1a0f9e8d7c6b5a49";
const H2 = "9b8c7d6e5f4a3b2c1d0e9f8a7b6c5d4e3f2a1b0c";

/** The reference lint of one review: one call per text of the review (ten for Jev, one for Haiku), all in job 55. */
const LINT: TraceEvent[] = [
  ...Array.from({ length: 11 }, (_, i): TraceEvent => {
    const haiku = i === 7;
    return {
      id: `run:${950 + i}`, kind: "model-call", at: at(12.9 - i * 0.07), head: H2, actor: { type: "model", name: haiku ? "haiku" : "jev" },
      summary: `Reference lint: ${haiku ? "clean" : i % 4 === 3 ? "refers to documentation" : "clean"}`, ref: { runId: 950 + i, jobId: 55 },
      call: {
        promptId: haiku ? "lint.reference.haiku" : "lint.reference.jev", step: "Review pull requests", model: haiku ? "haiku" : "jev", provider: haiku ? "claude" : "jev",
        account: haiku ? "Team account A" : "Jev", state: "done", inputTokens: haiku ? 1_100 : 900, outputTokens: haiku ? 40 : 12, costUsd: haiku ? 0.003 : 0, toolCalls: 0, endedAt: at(12.9 - i * 0.07 - 0.02),
      },
    };
  }),
];

/** The calls behind the Opus review (the review row lists them, so the timeline does not): the call and its lint fix turn. */
const REVIEW_CALLS: TraceEvent[] = [
  {
    id: "run:903", kind: "model-call", at: at(14), head: H2, actor: { type: "model", name: "opus" }, summary: "Review pull requests: take-fix with two fixes", ref: { runId: 903, jobId: 55 },
    call: { promptId: "review.opus", step: "Review pull requests", model: "opus", provider: "claude", account: "Team account B", state: "done", inputTokens: 48_200, outputTokens: 2_900, costUsd: 0.91, toolCalls: 7, endedAt: at(13) },
  },
  {
    id: "run:904", kind: "model-call", at: at(13.4), head: H2, actor: { type: "model", name: "opus" }, summary: "Review pull requests: take-fix with two fixes", ref: { runId: 904, jobId: 55 },
    call: { promptId: "review.opus", step: "Review pull requests", model: "opus", provider: "claude", account: "Team account B", state: "done", inputTokens: 3_100, outputTokens: 2_800, costUsd: 0.12, toolCalls: 0, endedAt: at(13.2) },
  },
];

export const EVENTS: TraceEvent[] = ([
  { id: "plan:41", kind: "plan", at: at(4), head: H2, actor: { type: "step", name: "Planner" }, summary: "Plan reviewing → verifying, waiting for CI at 9b8c7d6", ref: { head: H2 } },
  { id: "check:12", kind: "check", at: at(9), head: H2, actor: { type: "step", name: "Fix-up" }, summary: "Clippy on app-core: no findings", ref: { checkId: 12, runId: 902, head: H2 } },
  { id: "task:905", kind: "check", at: at(10), head: H2, actor: { type: "step", name: "Verify" }, summary: "Build task done: build and 412 tests passed", ref: { taskId: 905, head: H2 } },
  { id: "audit:77", kind: "write", at: at(12), head: H2, actor: { type: "step", name: "AutoCraft" }, summary: "Posted review", ref: { auditRowid: 77, head: H2 } },
  { id: "review:opus:5", kind: "review", at: at(13), head: H2, actor: { type: "model", name: "opus" }, summary: "Opus review: take with two fixes, not sure", ref: { reviewId: "opus:5", head: H2, runId: 903, runIds: [903, 904] }, costUsd: 1.03 },
  { id: "gh:push", kind: "github", at: at(30), head: H2, actor: { type: "person", name: "contributor" }, summary: "Pushed 9b8c7d6", ref: { head: H2 } },
  { id: "comment:c2", kind: "github", at: at(70), head: H1, actor: { type: "person", name: "maintainer" }, summary: "Posted a comment, 214 characters", ref: { commentId: "c2" },
    body: "Thanks for the work on this. Two questions before I look at the diff:\n\n1. Why are the dictionary files committed instead of loaded from the **language pack**?\n2. Do the nonstandard hyphenation rules differ from the pack's?" },
  { id: "review:gh:r1", kind: "github", at: at(50), head: H1, actor: { type: "person", name: "mosswood" }, summary: "Submitted a review: changes requested", ref: { commentId: "r1" },
    body: "Changes requested.\n\n- `crates/text/src/lang/hu.rs`: the loader duplicates `load_pack`.\n- The data files are about 270,000 lines; they make every clone larger.\n\n```rust\nlet pack = load_pack(\"hu\")?;\n```" },
  { id: "decision:d9:asked", kind: "decision", at: at(95), head: H1, actor: { type: "step", name: "Ask decisions" }, summary: "Asked: Merge this fix?", ref: { decisionId: "designcraft#1484:merge" } },
  {
    id: "run:901", kind: "model-call", at: at(120), head: H1, actor: { type: "model", name: "opus" }, summary: "Review pull requests: hold", ref: { runId: 901, jobId: 52 },
    call: { promptId: "review.opus", step: "Review pull requests", model: "opus", provider: "claude", account: "Team account C", state: "done", inputTokens: 51_000, outputTokens: 3_300, costUsd: 0.97, toolCalls: 11, endedAt: at(118) },
  },
  { id: "plan:38", kind: "plan", at: at(125), head: H1, actor: { type: "step", name: "Planner" }, summary: "Plan started as reviewing", ref: { head: H1 } },
  { id: "gh:opened", kind: "github", at: at(400 * 1440), head: H1, actor: { type: "person", name: "contributor" }, summary: "Opened pull request on GitHub by contributor", ref: {} },
  { id: "gh:push0", kind: "github", at: at(6 * 1440 + 30), head: H1, actor: { type: "person", name: "contributor" }, summary: "Pushed 3f2a9c1", ref: { head: H1 } },
  { id: "comment:c1", kind: "github", at: at(1000), head: H1, actor: { type: "person", name: "maintainer" }, summary: "Posted a comment, 96 characters", ref: { commentId: "c1" },
    body: "Is this ready for review? The hyphenation tests pass locally on my machine, so I think the patterns are right." },
  ...LINT,
] as TraceEvent[]).sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : a.id < b.id ? -1 : 1));

/** An issue with no conversation: opened, classified, one comment. */
const ISSUE_EVENTS: TraceEvent[] = [
  { id: "gh:opened", kind: "github", at: at(2 * 1440), head: null, actor: { type: "person", name: "wren-h" }, summary: "Opened issue on GitHub by wren-h", ref: {} },
  { id: "run:810", kind: "model-call", at: at(2 * 1440 - 3), head: null, actor: { type: "model", name: "haiku" }, summary: "Classify items: bugfix", ref: { runId: 810, jobId: 41 },
    call: { model: "haiku", provider: "claude", account: "Team account A", state: "done", inputTokens: 1_900, outputTokens: 60, costUsd: 0.002, toolCalls: 0, endedAt: at(2 * 1440 - 4) } },
  { id: "run:811", kind: "model-call", at: at(2 * 1440 - 3.5), head: null, actor: { type: "model", name: "jev" }, summary: "Classify items: bugfix", ref: { runId: 811, jobId: 41 },
    call: { model: "jev", provider: "jev", account: "Jev", state: "done", inputTokens: 1_800, outputTokens: 40, costUsd: 0, toolCalls: 0, endedAt: at(2 * 1440 - 4) } },
  { id: "decision:dup:asked", kind: "decision", at: at(2 * 1440 - 20), head: null, actor: { type: "step", name: "Ask decisions" }, summary: "Asked: Is this a duplicate?", ref: {} },
  { id: "comment:i1", kind: "github", at: at(900), head: null, actor: { type: "person", name: "wren-h" }, summary: "Posted a comment, 120 characters", ref: { commentId: "i1" },
    body: "Same seams on a second machine. They only show up on 16-bit files, not on 8-bit ones." },
].sort((a, b) => (a.at < b.at ? -1 : 1)) as TraceEvent[];

const OFF_EVENTS: TraceEvent[] = [
  { id: "gh:merged", kind: "github", at: at(180), head: null, actor: { type: "person", name: "maintainer" }, summary: "Merged on GitHub by maintainer", ref: {} },
  { id: "run:801", kind: "model-call", at: at(1380), head: null, actor: { type: "model", name: "haiku" }, summary: "Classify items: bugfix", ref: { runId: 801, jobId: 40 },
    call: { model: "haiku", provider: "claude", account: "Team account A", state: "done", inputTokens: 1_900, outputTokens: 60, costUsd: 0.002, toolCalls: 0, endedAt: at(1379) } },
  { id: "run:800", kind: "model-call", at: at(1385), head: null, actor: { type: "model", name: "jev" }, summary: "Classify items: bugfix", ref: { runId: 800, jobId: 40 },
    call: { model: "jev", provider: "jev", account: "Jev", state: "done", inputTokens: 1_800, outputTokens: 40, costUsd: 0, toolCalls: 0, endedAt: at(1384) } },
  { id: "gh:opened", kind: "github", at: at(1440), head: null, actor: { type: "person", name: "contributor" }, summary: "Opened pull request on GitHub by contributor", ref: {} },
] as TraceEvent[];
const OFF_TRACE: Omit<ItemTrace, "events" | "nextCursor"> = {
  header: { now: { state: null, head: null, plannedAt: null, text: "Not planned yet", waitsOn: null, reasons: [], note: null }, next: [], who: { assignees: [], autocraftAssigned: false, openDecisions: [], holds: [] } },
  stamp: "mock-off",
};

const TRACE: Omit<ItemTrace, "events" | "nextCursor"> = {
  header: {
    now: { state: "verifying", head: H2, plannedAt: at(4), text: "Waiting for CI at 9b8c7d6", waitsOn: "CI at 9b8c7d6", reasons: [], note: null },
    next: [{ kind: "verify", head: H2 }, { kind: "premerge", head: H2 }],
    who: { assignees: ["autocraft"], autocraftAssigned: true, openDecisions: [{ id: "designcraft#1484:merge", kind: "merge", question: "Merge this fix?" }], holds: [] },
  },
  stamp: "mock",
};

const TOOLS: AgentRunTool[] = [
  { seq: 1, tool: "Read", args: '{"file_path":"crates/app-core/src/frame.rs"}', resultBytes: 18_400, isError: false, startedAt: at(14), endedAt: at(14), check: null },
  { seq: 2, tool: "Grep", args: '{"pattern":"overset","path":"crates"}', resultBytes: 2_100, isError: false, startedAt: at(14), endedAt: at(14), check: null },
  { seq: 3, tool: "mcp__build__check", args: "", resultBytes: 640, isError: false, startedAt: at(14), endedAt: at(13), check: { id: 12, command: "clippy", crate: "app-core", testName: null, outcome: "ok" } },
  { seq: 4, tool: "Read", args: '{"file_path":"crates/missing.rs"}', resultBytes: 90, isError: true, startedAt: null, endedAt: null, check: null },
];

/** Run detail for the runs of the trace mock, with tool calls. */
export function traceRunDetail(id: number): AgentRunDetail | null {
  const e = [...EVENTS, ...REVIEW_CALLS].find((x) => x.ref.runId === id && x.call);
  if (!e?.call) return null;
  const c = e.call;
  const text = (n: number) => Array.from({ length: n }, (_, i) => `Line ${i + 1} of the model text for ${e.summary}.`).join("\n");
  return {
    id, jobId: e.ref.jobId ?? null, step: "opus-review", stage: 5, promptId: c.promptId ?? "review.opus", promptVersion: "a1b2c3d", provider: "claude", model: c.model, accountId: "b", accountLabel: c.account,
    items: [], itemCount: 1, state: "done", startedAt: e.at, endedAt: c.endedAt, inputTokens: c.inputTokens, outputTokens: c.outputTokens, cacheReadTokens: null, cacheWriteTokens: null, costUsd: c.costUsd, summary: null,
    prompt: text(40), output: text(18), error: null, tools: TOOLS,
  };
}

const FIELDS: Record<string, Record<string, unknown>> = {
  "review:opus:5": { verdict: "take-fix", sure: false, reason: "The change is **correct**, but two spots need care.\n\n- The overset check ignores locked frames.", fixes: [{ file: "crates/app-core/src/frame.rs", change: "skip locked frames in the overset pass" }, { file: "crates/app-core/src/lib.rs", change: "export the new helper" }], risks: ["Frames with negative leading may flicker."] },
  "plan:41": { from: "reviewing", to: "verifying", wait: "CI at 9b8c7d6", reasons: ["review took the fix", "no open conflicts"] },
  "task:905": {},
  "audit:77": { action: "review-post", by: "autocraft", state: "done", textLength: 1480 },
};

export function createTraceMock(): Pick<Api, "itemTrace" | "itemTraceDetail"> {
  return {
    itemTrace(repo, number, q = {}) {
      if (repo === PIPELINE_OFF.repo && number === PIPELINE_OFF.number) return wait({ ...OFF_TRACE, events: [...OFF_EVENTS].reverse(), nextCursor: null });
      if (repo === "photocraft" && number === 4133) return wait({ ...OFF_TRACE, events: ISSUE_EVENTS, nextCursor: null });
      const kinds = q.kinds ? new Set<TraceKind>(q.kinds) : null;
      let list = EVENTS.filter((e) => (!kinds || kinds.has(e.kind)) && (!q.autocraftOnly || e.actor.type !== "person"));
      if (q.since === TRACE.stamp) return wait({ unchanged: true as const, stamp: TRACE.stamp });
      if (q.cursor) {
        const i = list.findIndex((e) => `${e.at}|${e.id}` === q.cursor);
        list = i < 0 ? list : list.slice(i + 1);
      }
      const limit = q.limit ?? 100;
      const events = list.slice(0, limit);
      const last = events[events.length - 1];
      return wait({ ...TRACE, events, nextCursor: list.length > limit && last ? `${last.at}|${last.id}` : null });
    },
    itemTraceDetail(_repo, _number, id): Promise<ItemTraceDetail> {
      const e = EVENTS.find((x) => x.id === id);
      if (!e) throw new Error(`no event ${id}`);
      return wait({ id: e.id, kind: e.kind, at: e.at, summary: e.summary, fields: FIELDS[e.id] ?? { head: e.head, note: "mock detail" } });
    },
  };
}
