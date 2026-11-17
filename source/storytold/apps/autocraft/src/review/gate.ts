// Reasons a due review waits: another item blocks the PR, CI at its head has not passed, the PR used its reviews for the day,
// the last review is too recent, or the last attempts at this head failed.
import type { DatabaseSync } from "node:sqlite";
import { audit } from "../dash/audit.ts";
import { effectiveCi } from "../optional-checks.ts";
import { BLOCKS_REVIEW, activeBlockers, hasOpenQuestion, storedBlockedBy } from "./blockers.ts";
import { MAX_RERUNS_PER_DAY, discussionState, markedStaleSince, maintainerSince, reviewRequestedSince, type DiscussionState } from "./discussion.ts";
import { ourCommitsSince } from "./ours.ts";

/** Opus review calls of one PR per UTC day, new heads, re-runs and failed calls together (a reply-fix turn is part of its review). */
export const MAX_REVIEWS_PER_DAY = MAX_RERUNS_PER_DAY;

/** Setting: least minutes between two Opus reviews of one PR; 0 turns the wait off. */
export const MIN_INTERVAL_KEY = "review_min_interval_minutes";
export const MIN_INTERVAL_DEFAULT = 120;
const MIN_INTERVAL_MAX = 7 * 24 * 60;

/** Waits after the 1st, 2nd and 3rd failed review at one head; a 4th failure holds the head until a new commit or Review again. */
export const FAILURE_BACKOFF_MS = [10 * 60_000, 30 * 60_000, 2 * 3600_000];
const FAIL_KEY = "review_fail:";

export function reviewMinInterval(db: DatabaseSync): number {
  const v = (db.prepare("SELECT value FROM main.settings WHERE key = ?").get(MIN_INTERVAL_KEY) as { value: string } | undefined)?.value;
  const n = Number(v);
  return v !== undefined && Number.isInteger(n) && n >= 0 && n <= MIN_INTERVAL_MAX ? n : MIN_INTERVAL_DEFAULT;
}

export function setReviewMinInterval(db: DatabaseSync, input: unknown, by: string): number {
  const n = typeof input === "number" ? input : typeof input === "string" && /^[0-9]+$/.test(input) ? Number(input) : NaN;
  if (!Number.isInteger(n) || n < 0 || n > MIN_INTERVAL_MAX) throw new Error(`the minimum minutes between reviews must be a whole number from 0 to ${MIN_INTERVAL_MAX}`);
  const was = reviewMinInterval(db);
  db.prepare("INSERT INTO main.settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value").run(MIN_INTERVAL_KEY, String(n));
  if (n !== was) audit(db, by, "review-min-interval", "pipeline", { minutes: n, was });
  return n;
}

const failKey = (repo: string, number: number, head: string) => `${FAIL_KEY}${repo}#${number}@${head}`;

/** Counts a review call at this head that gave no valid review; the earlier heads' counts are forgotten. */
export function recordReviewFailure(db: DatabaseSync, repo: string, number: number, head: string, nowMs: number = Date.now()): void {
  const key = failKey(repo, number, head);
  const cur = (db.prepare("SELECT value FROM main.settings WHERE key = ?").get(key) as { value: string } | undefined)?.value;
  const n = (Number(cur?.split("|")[0]) || 0) + 1;
  db.prepare("DELETE FROM main.settings WHERE key LIKE ? AND key <> ?").run(`${FAIL_KEY}${repo}#${number}@%`, key);
  db.prepare("INSERT INTO main.settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value").run(key, `${n}|${new Date(nowMs).toISOString()}`);
}

/** `until`: when a timed wait ends (ms), so the planner wakes then. `red`: a ci hold whose head's CI has failed (not still running). */
export type ReviewHold = { kind: "blocked" | "ci" | "cap" | "interval" | "failed"; wait: string; until?: number; red?: boolean; /** A blocker has an open question: the wait is on a person. */ person?: boolean };

/** CI at the PR's head as the review gate reads it: "ok" (passed, or no checks and none pending), "pending", "failure", or "unknown" when the stored checks describe another head. */
export function headCi(db: DatabaseSync, repo: string, number: number, head: string): "ok" | "pending" | "failure" | "unknown" {
  const c = db.prepare("SELECT head_oid, overall, checks FROM main.pr_checks WHERE repo = ? AND number = ?").get(repo, number) as { head_oid: string; overall: string; checks: string | null } | undefined;
  if (!c || c.head_oid !== head) return "unknown";
  const o = effectiveCi(db, repo, c.overall, c.checks);
  return o === "pending" ? "pending" : o === "failure" ? "failure" : "ok";
}

export const nextUtcMidnight = (ms: number): number => { const d = new Date(ms); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1); };

/**
 * The hold check of every PR of one planning pass: statements are prepared once. A hold is what keeps the next review of a PR at `head`
 * from starting, or null. A maintainer's or operator's request after the latest review lifts every hold.
 * An unknown CI state does not hold (the review step reads the checks live before asking the model and applies this again).
 * Not held by CI: the first review of a PR when CI is red (running CI still waits), and the one review after the blockers settled.
 * Not held by the cap or the interval: a head that only our own pushes made since the last review.
 */
export function reviewHolds(db: DatabaseSync, nowMs: number = Date.now()): (repo: string, number: number, head: string) => ReviewHold | null {
  const lastReview = db.prepare(`SELECT head_oid, at, verdict, seen_at, disc_hash, blocked_by FROM main.opus_reviews WHERE repo = ? AND number = ? AND verdict IS NOT NULL ORDER BY at DESC, rowid DESC LIMIT 1`);
  const history = db.prepare(`SELECT COUNT(CASE WHEN at >= :today THEN 1 END) AS n, MAX(at) AS last FROM main.opus_review_history
    WHERE repo = :repo AND number = :number AND model IS NOT NULL AND model <> 'carried' AND COALESCE(mode, '') <> 'carried'`);
  // One review call per job and PR: the reply-lint fix turn is a follow-up run of the same job, not another review.
  const runs = db.prepare(`SELECT COUNT(CASE WHEN s >= :today THEN 1 END) AS n, MAX(s) AS last FROM (
      SELECT MIN(r.started_at) AS s FROM main.agent_run_items i JOIN main.agent_runs r ON r.id = i.run_id
      WHERE i.repo = :repo AND i.number = :number AND r.step = 'opus-review' GROUP BY COALESCE(r.job_id, -r.id))`);
  // A "Queue items" row at the head it started on (no fix-up, no push since) asks for no review of its own: CI, the cap and the interval hold it as any PR.
  const preapproved = db.prepare("SELECT 1 FROM main.preapprovals WHERE repo = ? AND number = ? AND head = ? AND state = 'review' AND (fix_id IS NOT NULL OR head <> from_head)");
  const failure = db.prepare("SELECT value FROM main.settings WHERE key = ?");
  const interval = reviewMinInterval(db) * 60_000;
  const today = new Date(nowMs).toISOString().slice(0, 10);
  const states = new Map<string, DiscussionState>();
  type Last = { head_oid: string; at: string; verdict: string; seen_at: string | null; disc_hash: string | null; blocked_by: string | null };
  return (repo, number, head) => {
    const last = lastReview.get(repo, number) as Last | undefined;
    // The failure backoff holds even after a request: a review that keeps failing is not retried on every pass.
    const failed = (failure.get(failKey(repo, number, head)) as { value: string } | undefined)?.value;
    if (failed) {
      const [n, at] = [Number(failed.split("|")[0]), Date.parse(failed.split("|")[1] ?? "")];
      const delay = FAILURE_BACKOFF_MS[n - 1];
      if (delay === undefined) {
        // Final. A request newer than the last failure grants one more try; a failure then stamps a newer time and makes it final again.
        const since = failed.split("|")[1] ?? "";
        const asked = markedStaleSince(db, repo, number, since) || maintainerSince(discussionState(db, repo).get(`${repo}#${number}`), since, null);
        if (!asked) return { kind: "failed", wait: `its review failed ${n} times at this commit; a new commit, a Review again press or a maintainer's comment gives it one more try` };
      } else if (at + delay > nowMs) return { kind: "failed", wait: `the review after ${n} failed ${n === 1 ? "try" : "tries"} at this commit, from ${new Date(at + delay).toISOString().slice(11, 16)}`, until: at + delay };
    }
    // A person's pre-approved merge waits for the review of the head the pipeline pushed for it: that is their request for it, as a review-again press would be.
    if (preapproved.get(repo, number, head)) return null;
    if (last) {
      let state = states.get(repo);
      if (!state) states.set(repo, (state = discussionState(db, repo)));
      if (reviewRequestedSince(db, repo, number, last.at, last.seen_at, last.disc_hash, state)) return null;
    }
    let settled = false;
    if (last?.verdict === "hold" && storedBlockedBy(last.blocked_by).length) {
      const open = activeBlockers(db, `${repo}#${number}`, last.blocked_by, last.at, nowMs);
      if (open.length) return { kind: "blocked", wait: `${open.join(", ")}${BLOCKS_REVIEW}`, ...(hasOpenQuestion(db, open) ? { person: true } : {}) };
      settled = true;
    }
    const ci = headCi(db, repo, number, head);
    if (ci === "pending") return { kind: "ci", wait: "CI on the latest commit to finish" };
    if (ci === "failure" && last && !settled) return { kind: "ci", wait: "CI on the latest commit to pass", red: true };
    const ours = last && last.head_oid !== head ? ourCommitsSince(db, repo, number, last.head_oid, head) : null;
    if (ours?.complete && ours.commits.length) return null;
    const h = history.get({ today, repo, number }) as { n: number; last: string | null };
    const r = runs.get({ today, repo, number }) as { n: number; last: string | null };
    if (Math.max(h.n, r.n) >= MAX_REVIEWS_PER_DAY) return { kind: "cap", wait: "review cap for today reached; next on a maintainer's request or tomorrow", until: nextUtcMidnight(nowMs) };
    if (interval) {
      // Successful reviews only: failed calls count toward the cap, and the failure backoff spaces their retries.
      const until = h.last ? Date.parse(h.last) + interval : 0;
      if (until > nowMs) return { kind: "interval", wait: `next review after ${new Date(until).toISOString().slice(11, 16)}`, until };
    }
    return null;
  };
}

export const reviewHold = (db: DatabaseSync, repo: string, number: number, head: string, nowMs: number = Date.now()): ReviewHold | null => reviewHolds(db, nowMs)(repo, number, head);
