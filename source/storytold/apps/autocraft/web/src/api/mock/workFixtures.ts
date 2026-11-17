// Fake work queue: open items in rank order (level, type, size, reach).
import type { TypeLabel, WorkBreakdown, WorkFilter, WorkList, WorkRow } from "../types";
import { REPOS, rng, titleFor } from "./fixtures";
import { QUEUE_ROWS } from "./queueFixtures";

const LABELS: TypeLabel[] = ["bugfix", "performance", "infra", "missing feature", "small extra", "plugin candidate"];
const SIZES = ["S", "M", "L", "XL"] as const;
const NEXT_PR = ["Review", "Verify", "Verify: running", "Merge queue", "Fix-up", "Needs a person"];
const NEXT_ISSUE = ["Fix", "Fix: in progress", "Fix: pull request opened", "Decide", "Needs a person", "Triage by a person"];

const LEVELS = ["P0", "P1", "P2", "P3", "P4"] as const;

const ROWS: WorkRow[] = (() => {
  const r = rng(808);
  const out: WorkRow[] = [];
  for (let k = 0; k < 60; k++) {
    const kind = k % 3 === 0 ? "issue" : "pr";
    const label = LABELS[Math.floor(r() * LABELS.length)]!;
    const size = SIZES[Math.floor(r() * 4)]!;
    const rated = k % 7 === 0 ? null : LEVELS[Math.floor(r() * 5)]!;
    const security = k % 11 === 0;
    const reach = Math.floor(r() * 100);
    const base = LEVELS.indexOf(rated ?? "P2");
    const level = LEVELS[security ? Math.max(0, base - 1) : base]!;
    const breakdown: WorkBreakdown = {
      level, rated, security, type: label, size, sizeSource: kind === "issue" ? (k % 2 ? "triage" : "default") : "lines", reach,
    };
    const score = (4 - base + (security && base > 0 ? 1 : 0)) * 10000 + (LABELS.length - LABELS.indexOf(label)) * 1000 + (3 - SIZES.indexOf(size)) * 100 + reach;
    const next = kind === "pr" ? NEXT_PR : NEXT_ISSUE;
    const repo = k % 5 < 2 ? "designcraft" : REPOS[k % REPOS.length]!;
    const number = 100 + Math.floor(r() * 3000);
    out.push({ repo, number, kind, title: titleFor(repo, number), score, level, size, breakdown, label, next: repo === "designcraft" && kind === "pr" && k % 4 === 0 ? "Review" : next[k % next.length]!, nextHref: null });
  }
  // Two merge-queue PRs also appear here, so a fast-tracked item shows in both lists.
  const pick = (repo: string, states: string[]) => QUEUE_ROWS.find((q) => q.repo === repo && states.includes(q.state));
  for (const q of [pick("wordcraft", ["waiting-ci", "ready", "waiting-verify"]), pick("designcraft", ["waiting-verify", "waiting-ci"])]) {
    if (q) out.push({ repo: q.repo, number: q.number, kind: "pr", title: q.title, score: 1, level: "P2", size: q.size, breakdown: { level: "P2", rated: "P2", security: false, type: q.label ?? "bugfix", size: q.size, sizeSource: "lines", reach: 10 }, label: q.label, next: "Merge queue", nextHref: null });
  }
  return out.sort((a, b) => b.score - a.score);
})();

const firstReview = ROWS.find((x) => x.repo === "designcraft" && x.next === "Review");
export const FAST_TRACK_SEED: string[] = [
  firstReview && `${firstReview.repo}#${firstReview.number}`,
  ...[QUEUE_ROWS.find((q) => q.repo === "wordcraft" && ["waiting-ci", "ready", "waiting-verify"].includes(q.state)), QUEUE_ROWS.find((q) => q.repo === "designcraft" && ["waiting-verify", "waiting-ci"].includes(q.state))].map((q) => q && `${q.repo}#${q.number}`),
].filter((x): x is string => !!x);

export function workList(f: WorkFilter): WorkList {
  const match = ROWS.filter((x) => (!f.repo || x.repo === f.repo) && (!f.kind || x.kind === f.kind));
  const offset = f.offset ?? 0, limit = f.limit ?? 100;
  const rows = match.slice(offset, offset + limit);
  return { rows, total: match.length, next: offset + rows.length < match.length ? offset + rows.length : null };
}
