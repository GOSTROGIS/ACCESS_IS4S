// The Now page on fake data: a failing sync, a red main, a paused account, and one feed of running and finished work that grows over time.
import type { Api } from "../client";
import type { Now, NowEntry, NowFeed } from "../types";
import { NOW } from "./fixtures";
import { ackedDeadlines, mockSwitch } from "./pipelineMock";

const at = (minAgo: number) => new Date(NOW - minAgo * 60_000).toISOString();
const item = (repo: string, number: number, title: string, kind: "pr" | "issue" = "pr") => ({ repo, number, kind, state: "open" as const, title });
const A = item("designcraft", 1484, "Fix overset detection for locked frames");
const B = item("photocraft", 3921, "Add a wave filter to the effects panel");
const C = item("filmcraft", 2210, "Audio drifts after trimming a clip");
const D = item("pdfcraft", 877, "Export fails on pages with spot colors");

const HEALTH: Now["health"] = {
  pipeline: { enabled: true, by: "operator", at: at(60 * 30) },
  problems: [
    { id: "worker:sandbox", area: "workers", tone: "bad", text: "Build worker Sandbox has not reported for 4 h", to: "/envs", since: at(4 * 3600) },
    { id: "build-queue", area: "workers", tone: "bad", text: "3 build tasks have waited over 10 min for a worker", to: "/envs", since: at(1500) },
    { id: "sync-repo:stencilcraft", area: "sync", tone: "warn", text: "storytold/stencilcraft no longer resolves on GitHub (moved, renamed or deleted)", to: "/repos", since: at(3 * 3600) },
    { id: "main-ci:designcraft", area: "main-ci", tone: "bad", text: "Main is red in designcraft: Tests, Clippy", to: "/main-ci", since: at(95) },
    { id: "account:c", area: "account", tone: "warn", text: "Account Team account C is paused: 5-hour use 92 % (pauses at 90 %)", to: "/accounts", since: null },
    { id: "jobs", area: "jobs", tone: "warn", text: "2 jobs failed in the last hour: Review pull requests", to: "/pipeline", since: null },
    { id: "liveness", area: "liveness", tone: "bad", text: "4 open items are stuck: nothing is due and nobody is asked; 2 more unchanged for days", to: "/stuck", since: at(30 * 3600) },
    { id: "deadline:fixup", area: "deadline", tone: "warn", text: "Fix up pull requests was stopped (job 641: stopped: ran past 120 min)", to: "/pipeline/641", since: at(40), ackStep: "fixup" },
  ],
};

/** The header problems now: the static ones, minus acknowledged deadline stops, plus the Draining warning. */
const healthNow = (): Now["health"] => ({
  pipeline: { ...HEALTH.pipeline, enabled: !mockSwitch.draining },
  problems: [
    ...(mockSwitch.draining ? [{ id: "pipeline", area: "pipeline" as const, tone: "warn" as const, text: "Pipeline is draining, switched to drain by operator", to: "/pipeline", since: at(12) }] : []),
    ...HEALTH.problems.filter((p) => !(p.ackStep && ackedDeadlines.has(p.ackStep))),
  ],
});

const entry = (e: Partial<NowEntry> & Pick<NowEntry, "key" | "kind" | "state" | "at" | "title">): NowEntry => ({
  ids: [e.key], batchId: null, endedAt: null, repo: null, what: null, summary: null, progress: null, actor: "AutoCraft", item: null, items: [], itemCount: 0, more: 0, event: null, detail: null, writes: [], children: [], ...e,
});

const REVIEW_JOB = entry({
  key: "job:640", kind: "job", state: "running", at: at(7), title: "Review pull requests", progress: "Reviewing 1 of 2: designcraft#1484", item: A, items: [A, B], itemCount: 2, event: "job:2210", detail: "/pipeline/640",
  children: [
    entry({ key: "run:912", kind: "call", state: "running", at: at(6), title: "Review pull requests", what: "opus on Team account B", progress: "Reading crates/app-core/src/frame.rs", item: A, items: [A], itemCount: 1, event: "run:912", detail: "/agents/912" }),
    entry({ key: "task:931", kind: "task", state: "running", at: at(5), title: "Build task, Verify pull requests", what: "Build box", item: A, items: [A], itemCount: 1, event: "task:931", detail: "/envs/931" }),
  ],
});

const SAMPLES: (() => Partial<NowEntry> & Pick<NowEntry, "kind" | "state" | "title">)[] = [
  () => ({ kind: "job", state: "done", title: "Review pull requests", summary: "Reviewed 3 PRs: 2 take, 1 hold", item: A, items: [A, B, C], itemCount: 3, writes: [{ summary: "Posted 3 reviews", items: [A, B, C], more: 0 }], detail: "/pipeline/600" }),
  () => ({ kind: "merge", state: "done", title: "Merged (squash) by rule", item: item("craft-libs", 412, "Bump the egui pin"), items: [item("craft-libs", 412, "Bump the egui pin")], itemCount: 1 }),
  () => ({ kind: "batch", state: "done", title: "Merge batch #97: 3 PRs, stopped", batchId: 97, item: A, items: [A, B, C], itemCount: 3 }),
  () => ({ kind: "decision", state: "done", title: "Answered \"Merge this fix?\": Merge", actor: "maintainer", item: D, items: [D], itemCount: 1, detail: "/decisions/d4" }),
  () => ({ kind: "job", state: "failed", title: "Review pull requests", summary: "claude exited with code 1", item: C, items: [C], itemCount: 1, detail: "/pipeline/639" }),
  () => ({ kind: "write", state: "done", title: "Pushed: fix-up for overset detection", item: A, items: [A], itemCount: 1 }),
  () => ({ kind: "job", state: "done", title: "Fix up pull requests", summary: "Pushed fix-ups to 2 PRs", item: A, items: [A, D], itemCount: 2, writes: [{ summary: "Pushed to 2 PRs", items: [A, D], more: 0 }], detail: "/pipeline/601" }),
  () => ({ kind: "write", state: "done", title: "Closed 4 items", item: C, items: [C, D, A, B, item("pdfcraft", 880, "Fix gradient banding")], itemCount: 5 }),
];
const mk = (i: number, iso: string): NowEntry => {
  const e = SAMPLES[i % SAMPLES.length]!();
  return entry({ ...e, key: `mock:${i}`, at: iso, endedAt: e.kind === "job" ? iso : null, event: e.item && e.kind !== "job" ? `mock:${i}` : (e.kind === "job" ? "job:1" : null) });
};

/** With `?arrive` in the address, a new entry comes every 2 s instead of every 12 s. */
export function createNowMock(changed: () => void): Pick<Api, "now" | "nowFeed"> {
  const PAGE = 15;
  const entries: NowEntry[] = [
    REVIEW_JOB,
    entry({ key: "job:641", kind: "job", state: "done", at: at(2), endedAt: at(1), title: "Ask Merge? decisions", summary: "Asked Merge? on 1 PR", item: item("designcraft", 65, "Replace the fixed page grid with snap guides"), items: [item("designcraft", 65, "Replace the fixed page grid with snap guides")], itemCount: 1, event: "job:2211", detail: "/pipeline/641" }),
    entry({ key: "task:932", kind: "task", state: "queued", at: at(3), title: "Build task, Verify pull requests", item: C, items: [C], itemCount: 1, event: "task:932", detail: "/envs/932" }),
    entry({ key: "batch:14", kind: "batch", state: "queued", at: at(40), title: "Integration batch", what: "integration-pdfcraft-20261102-1", item: D, items: [D, item("pdfcraft", 871, "Update spot color table")], itemCount: 2, detail: "/queue/merge" }),
    ...Array.from({ length: 70 }, (_, i) => mk(69 - i, at(8 + i * 3))),
  ].sort((a, b) => (a.at < b.at ? 1 : -1));
  let n = 70;
  const fast = typeof location !== "undefined" && location.search.includes("arrive");
  let finished = false;
  setInterval(() => {
    if (!finished && n >= 72) {
      // The running job ends in place: same entry, now with its outcome and the reviews it posted.
      finished = true;
      Object.assign(REVIEW_JOB, { state: "done", endedAt: at(0), progress: null, children: [], summary: "Reviewed 2 PRs: 1 take, 1 hold", writes: [{ summary: "Posted 2 reviews", items: [A, B], more: 0 }] });
    }
    entries.unshift(mk(n, at(1 - (n - 69) * 0.01)));
    n++;
    changed();
  }, fast ? 2000 : 12_000);
  const page = (before: string | null): NowFeed => {
    const rest = before ? entries.filter((e) => e.at < before) : entries;
    const shown = rest.slice(0, PAGE);
    return { entries: shown, nextCursor: rest.length > PAGE ? shown[shown.length - 1]!.at : null };
  };
  return {
    now: () => new Promise((r) => setTimeout(() => r(structuredClone({ health: healthNow(), alsoRunning: ["Rank open items", "Embed items"], ...page(null) })), 60)),
    nowFeed: (before) => new Promise((r) => setTimeout(() => r(structuredClone(page(before))), 300)),
  };
}
