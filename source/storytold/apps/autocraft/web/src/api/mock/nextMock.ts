// Fake Next page: a few steps with items, one paused by its daily limit, one with a tripped breaker, and waiting items.
import type { NextItem, NextPage, NextStep } from "../types";
import { REPOS, titleFor } from "./fixtures";

const item = (repo: string, number: number, action: string, why: string, o: Partial<NextItem> = {}): NextItem => ({
  repo, number, kind: "pr", state: "open", title: titleFor(repo, number), action, bucket: null, why, fast: false, rank: null, inFlight: false, next: true, blocked: null, ...o,
});
const [a, b, c] = REPOS;

const STEPS: NextStep[] = ([
  {
    lane: "classify", title: "Classify new and changed items", stage: "Classify", steps: ["classify-new"], canRun: true, kind: "ok", why: null, note: null,
    items: [item(a!, 412, "classify", "Needs a first classification", { kind: "issue" }), item(a!, 418, "classify", "Changed since its last classification", { kind: "issue" }), item(b!, 77, "classify", "Needs a first classification", { kind: "issue" })],
  },
  {
    lane: "decide", title: "Ask scope decisions", stage: "Decide", steps: ["decide"], canRun: false, kind: "account", why: "No Claude account has headroom (Main: five-hour limit reached; resets 14:20 UTC)", note: null,
    items: [item(a!, 390, "decide", "Scope decision without a recommendation", { kind: "issue", rank: 71 }), item(b!, 64, "decide", "Scope decision without a recommendation", { kind: "issue", rank: 52 })],
  },
  {
    lane: "review", title: "Review pull requests", stage: "Review", steps: ["checks", "opus-review"], canRun: true, kind: "ok", why: null, note: null,
    items: [
      item(a!, 431, "review", "Review the new head", { fast: true, rank: 96, inFlight: true }),
      item(a!, 428, "review", "Review the new head", { rank: 88 }),
      item(b!, 102, "review", "First review", { rank: 64 }),
      item(c!, 15, "review", "First review", { rank: 40, next: false }),
    ],
  },
  {
    lane: "fixup", title: "Push fix-ups", stage: "Fix", steps: ["fixup"], canRun: false, kind: "limit", why: "The daily limit is 0", note: null,
    items: [item(a!, 431, "fixup", "Review asked for 2 fixes", { bucket: "fix", rank: 96, fast: true })],
  },
  {
    lane: "cifix", title: "Fix failing CI", stage: "Fix", steps: ["cifix"], canRun: false, kind: "breaker", why: "3 pushes refused in a row; an operator resumes it", note: null,
    items: [item(b!, 98, "cifix", "CI failed on the formatting check", { bucket: "work" })],
  },
  {
    lane: "merge", title: "Merge", stage: "Merge", steps: ["merge"], canRun: true, kind: "ok", why: null, note: "waiting for CI on 2 PRs in " + a,
    items: [item(a!, 425, "merge", "Ready to merge", { rank: 90 }), item(b!, 90, "merge", "Merging is not approved in " + b, { blocked: `Merges in ${b} are not approved`, next: false })],
  },
  {
    lane: "labels", title: "Apply pipeline labels", stage: "Label", steps: ["labels-apply"], canRun: false, kind: "approval", why: `Labels in ${c} are not approved`, note: null,
    items: [item(c!, 12, "label", "Label disagrees with the classification", { kind: "issue", blocked: `Labels in ${c} are not approved`, next: false })],
  },
] as Omit<NextStep, "total">[]).map((s) => ({ ...s, total: s.items.length }));

export function nextPageFixture(): NextPage {
  const waiting = [
    { repo: a!, number: 433, wait: "Waiting for CI", why: "Waits for CI on the new head" },
    { repo: a!, number: 429, wait: "Waiting for CI", why: "Waits for CI on the new head" },
    { repo: b!, number: 101, wait: "Waiting for the author", why: "Review asked for changes" },
    { repo: c!, number: 14, wait: "Waiting for a decision", why: "Scope decision open" },
  ].map((w) => ({ ...w, kind: "pr" as const, state: "open" as const, title: titleFor(w.repo, w.number) }));
  return { steps: STEPS, waiting, waitingTotal: waiting.length };
}
