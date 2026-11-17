// Fake merge queue: a few PRs in every state, over the mock repos.
import type { BatchFilter, BatchList, QueueBatch, QueueFilter, QueueList, QueueRow, QueueState, TypeLabel } from "../types";
import { AUTHORS, DECISIONS, NOW, REPOS, rng, titleFor } from "./fixtures";

const STATES: QueueState[] = ["ready", "decision-answered-merge", "refused", "waiting-ci", "waiting-premerge", "ci-failed", "conflict", "needs-fix-up", "waiting-verify", "verify-failed", "verify-error", "needs-decision", "declined", "merged", "held-duplicate", "held-backlog", "batch-checking", "in-batch", "batch-failed", "changes-requested"];
const REASONS = [
  "Fixes the off-by-one in the page range and adds a test.",
  "Small, correct guard against an empty selection.",
  "Restores the reference app's default margin.",
  "CI config change; runs the same jobs faster.",
  "Correct, but the error message should name the file.",
];
const LABELS: TypeLabel[] = ["bugfix", "infra", "missing feature", "performance"];

function verifyFor(state: QueueState, i: number): QueueRow["verify"] {
  switch (state) {
    case "ready": case "waiting-premerge": case "decision-answered-merge": case "refused": case "needs-decision":
      return i % 2 ? { state: "ci-enough", kind: "ci-enough", summary: "Docs and comments only; CI covers the checks.", note: null } : { state: "passed", kind: i % 3 ? "tests" : "regression", summary: null, note: i === 2 ? "regression test did not fail on the base commit" : null };
    case "waiting-verify": return i % 2 ? { state: "running", kind: "tests", summary: null, note: null } : { state: "planned", kind: "regression", summary: null, note: null };
    case "verify-failed": return { state: "failed", kind: "regression", summary: "The regression test panics at png.rs:91: the decoded stride is 4096 where 8192 is expected.", note: null };
    case "verify-error": return { state: "error", kind: "tests", summary: "fetch deps failed (exit 101)", note: null };
    default: return null;
  }
}

const at = (min: number): string => new Date(NOW - min * 60_000).toISOString();

/** Our own build of the head, for the repos with the pr-builds switch on. */
function prBuildFor(state: QueueState, i: number): QueueRow["prBuild"] {
  const base = { headSha: "c0ffee1", current: true, createdAt: at(50), ci: "success" };
  switch (state) {
    case "ready": return i % 2 ? { ...base, state: "passed", summary: null, disagree: false, finishedAt: at(20) } : { ...base, state: "failed", summary: "test failed with exit code 101", disagree: true, finishedAt: at(25) };
    case "waiting-verify": return { ...base, state: i % 2 ? "running" : "queued", summary: null, disagree: false, finishedAt: null };
    case "verify-error": return { ...base, state: "error", summary: "fetch deps failed (exit 101)", disagree: false, finishedAt: at(10) };
    default: return null;
  }
}

const ROWS: QueueRow[] = (() => {
  const r = rng(606);
  const mergeDecision = DECISIONS.find((d) => d.kind === "merge")?.id ?? null;
  const out: QueueRow[] = [];
  let k = 0;
  for (const state of STATES) {
    const n = state === "ready" || state === "waiting-verify" || state === "needs-decision" || state === "waiting-ci" ? 4 : 2;
    for (let i = 0; i < n; i++, k++) {
      const repo = k % 3 === 0 || k < 6 ? "designcraft" : REPOS[k % 6]!;
      const number = 200 + Math.floor(r() * 3000);
      const [author, tier] = AUTHORS[k % AUTHORS.length]!;
      const ruleTier = tier === "whitelisted" || tier === "override-allow";
      const rulePath = state === "ready" || state === "waiting-premerge" || ((state === "waiting-ci" || state === "refused") && i % 2 === 0);
      const label = rulePath ? (i % 2 ? "infra" : "bugfix") : LABELS[k % LABELS.length]!;
      const size = rulePath ? (i % 2 ? "M" : "S") : (["S", "M", "L"] as const)[k % 3];
      const outsideRule = rulePath ? [] : [
        ...(state === "needs-fix-up" ? ["review asks for fixes"] : []),
        ...(size === "L" ? ["size L"] : []),
        ...(label !== "bugfix" && label !== "infra" ? [`label ${label}`] : []),
        ...(ruleTier ? [] : ["author not on the whitelist"]),
      ];
      if (!rulePath && !outsideRule.length) outsideRule.push("author not on the whitelist");
      const ci: QueueRow["ci"] = state === "ci-failed" ? "failure" : state === "waiting-ci" ? "pending" : state === "needs-decision" && i === 3 ? "pending" : "success";
      out.push({
        repo, number, title: titleFor(repo, number), author, tier: rulePath ? "whitelisted" : tier, head: `${(number * 2654435761 >>> 0).toString(16).padStart(8, "0")}c0ffee12345678900abcdef1234`,
        size, label, verdict: state === "needs-fix-up" ? "take-fix" : "take", reason: REASONS[k % REASONS.length]!,
        fixes: state === "needs-fix-up" ? 1 + (i % 3) : 0, ci, mergeable: state === "conflict" ? "conflicts" : "clean", state,
        path: rulePath ? "rule" : state === "decision-answered-merge" || state === "refused" ? "operator" : null,
        outsideRule, decisionId: state === "needs-decision" || state === "decision-answered-merge" || state === "declined" ? mergeDecision : null,
        answer: state === "decision-answered-merge" ? "merge" : state === "declined" ? (i ? "close" : "hold") : null,
        refusedReason: state === "refused" ? "safe-merge: required check 'build (linux)' has not finished" : null,
        note: state === "changes-requested" ? "changes requested by a maintainer (reviewer)" : null,
        reviewedAt: new Date(NOW - (k + 1) * 3_600_000 * 5).toISOString(),
        verify: verifyFor(state, i),
        prBuild: prBuildFor(state, i),
        closes: k % 3 === 0 ? [] : k % 5 === 0 ? [number - 40, number - 13] : [number - 17],
      });
    }
  }
  out.sort((a, b) => a.repo.localeCompare(b.repo) || a.number - b.number);
  // In each repo the second PR also closes the first one's issue, so an issue with two closing PRs shows up.
  for (const repo of new Set(out.map((r) => r.repo))) {
    const [one, two] = out.filter((r) => r.repo === repo);
    const issue = one?.closes?.[0];
    if (two && issue !== undefined && !two.closes?.includes(issue)) two.closes = [...(two.closes ?? []), issue];
  }
  return out;
})();

export const PIPELINE_REPOS = ["designcraft"];

const BATCH_STATES: QueueBatch["state"][] = ["checking", "open", "merged", "merged", "failed", "split", "superseded", "merged"];

// Newest first; every repo's rows are shared round-robin so a batch can hold up to five PRs.
const BATCHES: QueueBatch[] = Array.from({ length: 45 }, (_, k) => {
  const id = 45 - k;
  const state = k < 2 ? (k ? "open" : "checking") : BATCH_STATES[k % BATCH_STATES.length]!;
  const repo = REPOS[id % 2]!;
  const pool = ROWS.filter((r) => r.repo === repo);
  const size = 1 + (id % 5);
  const prs = pool.length ? Array.from({ length: Math.min(size, pool.length) }, (_, i) => pool[(id + i) % pool.length]!) : [];
  const created = new Date(NOW - (k * 7 + 1) * 3_600_000).toISOString();
  const day = created.slice(0, 10).replace(/-/g, "");
  const branch = `integration-${repo}-${day}-${(id % 3) + 1}`;
  const opened = state !== "checking";
  return {
    id, repo, branch, fork: opened ? `pipeline-bot/${repo}` : null, state, baseSha: (id * 2654435761 >>> 0).toString(16).padStart(8, "0") + "b3d5a9f1c2e4078615a4d3b2c1f0e9d8",
    size, prs, prNumber: opened ? 500 + id : null, prUrl: opened ? `https://github.com/storytold/${repo}/pull/${500 + id}` : null,
    summary: state === "failed" ? "the regression test panics at png.rs:91: the decoded stride is 4096 where 8192 is expected" : state === "split" ? "upstream CI failed on the batch PR" : state === "superseded" ? "main moved: a new batch took over" : null,
    createdAt: created, updatedAt: new Date(NOW - k * 7 * 3_600_000 - 600_000).toISOString(),
  };
});

export const QUEUE_ROWS = ROWS;

// An open integration batch on designcraft: its members are the repo's first ready PRs, shown as in the batch.
const OPEN_BATCH: QueueBatch = (() => {
  const prs = ROWS.filter((r) => r.repo === "designcraft" && (r.state === "ready" || r.state === "decision-answered-merge")).slice(0, 3).map((r): QueueRow => ({ ...r, state: "in-batch" }));
  const created = new Date(NOW - 50 * 60_000).toISOString();
  return {
    id: 99, repo: "designcraft", branch: "integration-designcraft-20261103-4", fork: "pipeline-bot/designcraft", state: "open", baseSha: "7c1e9a04b3d5a9f1c2e4078615a4d3b2",
    size: prs.length, prs, prNumber: 2202, prUrl: "https://github.com/storytold/designcraft/pull/2202", summary: null, createdAt: created, updatedAt: new Date(NOW - 12 * 60_000).toISOString(),
  };
})();
const BATCH_MEMBERS = new Set(OPEN_BATCH.prs.map((r) => r.number));
BATCHES.unshift(OPEN_BATCH);

export function queueList(f: QueueFilter): QueueList {
  const all = ROWS.filter((x) => (!f.repo || x.repo === f.repo) && !(x.repo === "designcraft" && BATCH_MEMBERS.has(x.number)));
  const counts = Object.fromEntries(STATES.map((s) => [s, all.filter((x) => x.state === s).length])) as Record<QueueState, number>;
  const match = all.filter((x) => (f.state ? x.state === f.state : x.state !== "merged"));
  const from = f.after ? match.findIndex((x) => `${x.repo}#${x.number}` === f.after) + 1 : 0;
  const rows = match.slice(from, from + (f.limit ?? 100));
  const last = rows[rows.length - 1];
  return { rows, counts, total: match.length, next: last && from + rows.length < match.length ? `${last.repo}#${last.number}` : null };
}

export function queueBatchList(f: BatchFilter): BatchList {
  const all = BATCHES.filter((b) => !f.repo || b.repo === f.repo);
  const from = f.after ? all.findIndex((b) => String(b.id) === f.after) + 1 : 0;
  const batches = all.slice(from, from + (f.limit ?? 20));
  return { batches, total: all.length, next: batches.length && from + batches.length < all.length ? String(batches[batches.length - 1]!.id) : null };
}
