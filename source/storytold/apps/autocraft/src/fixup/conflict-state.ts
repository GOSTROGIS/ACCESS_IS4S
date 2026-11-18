// The conflict step's candidate shape, tries and per-head bucket (the PRs come from their Plans, fixup/select.ts).
import type { DatabaseSync } from "node:sqlite";
import { BASE_NAME, CONFLICT_MAX_MERGES_PER_PR_PER_DAY, conflictNote as coreConflictNote, unsentAsk } from "../core/rules.ts";

/** Base branch names the merge accepts as a fetch ref. */
export { BASE_NAME };

/** Merge tries per head (pushed, failed, refused or rejected) before the PR is left to a person. */
export const MAX_CONFLICT_TRIES = 2;

export const CONFLICT_STATES = ["pushing", "merged", "failed", "refused", "rejected", "asked", "comment-failed", "comment-unsent", "linting", "skipped", "cannot-push", "push-denied", "superseded"] as const;
export type ConflictState = (typeof CONFLICT_STATES)[number];
const TRY_STATES: ConflictState[] = ["pushing", "merged", "failed", "refused", "rejected"];

export type ConflictCandidate = {
  repo: string; number: number; head: string; /** The PR's base branch name. */ base: string; title: string;
  /** The final review's reason. */ reason: string; attempt: number; pushable: boolean;
  /** A model resolution stored and linted: the collect step pushes it, or gives it up. */
  lint?: { servingMetadata?: string | null; rowid: number; round: number; task: number | null; baseSha: string; resolved: string; files: string[]; /** The kept resolver sessions by file (src/prepush/resume.ts). */ session: string | null };
};
/** capped: the PR already had its merges of the base branch for the UTC day. merge: we will merge the base in; ask: comment once asking the contributor; ask-retry: that comment never reached GitHub and is due again at conflictAskRetryAt; asked: that comment is posted; held: nothing to do without a person and no comment approval to ask (two tries used, a deterministic skip recorded at this head, or a branch we can't push to); unapproved: pushable but the repo has no push approval; done: merged at this head already. */
export type ConflictBucket = "merge" | "ask" | "ask-retry" | "asked" | "held" | "unapproved" | "linting" | "capped" | "done";

export function conflictTries(db: DatabaseSync, repo: string, number: number, head: string): number {
  return (db.prepare(`SELECT COUNT(*) AS n FROM conflict_merges WHERE repo = ? AND number = ? AND from_head = ? AND state IN (${TRY_STATES.map(() => "?").join(",")})`)
    .get(repo, number, head, ...TRY_STATES) as { n: number }).n;
}

/** Merges of the base branch pushed into the PR since the start of the UTC day of `nowMs`, over all its heads. */
export function conflictMergesToday(db: DatabaseSync, repo: string, number: number, nowMs: number = Date.now()): number {
  return (db.prepare("SELECT COUNT(*) AS n FROM conflict_merges WHERE repo = ? AND number = ? AND state IN ('merged', 'pushing') AND created_at >= ?")
    .get(repo, number, new Date(nowMs).toISOString().slice(0, 10)) as { n: number }).n;
}

/** Where the head's unsent ask comments leave the next ask (src/core/rules.ts unsentAsk). */
function unsentConflictAsk(db: DatabaseSync, repo: string, number: number, head: string, nowMs: number): { until: number } | "final" | null {
  const ats = (db.prepare("SELECT created_at FROM conflict_merges WHERE repo = ? AND number = ? AND from_head = ? AND state = 'comment-unsent'").all(repo, number, head) as { created_at: string }[]).map((r) => r.created_at);
  return unsentAsk(ats, nowMs);
}

/** When an ask-retry bucket's comment is due again (ms). */
export function conflictAskRetryAt(db: DatabaseSync, repo: string, number: number, head: string, nowMs: number = Date.now()): number | undefined {
  const u = unsentConflictAsk(db, repo, number, head, nowMs);
  return u !== null && u !== "final" ? u.until : undefined;
}

export function conflictBucket(db: DatabaseSync, p: { repo: string; number: number; head: string; pushable: boolean }, approvals: { push: boolean; comment: boolean }, nowMs: number = Date.now()): ConflictBucket {
  const has = (state: string) => !!db.prepare("SELECT 1 FROM conflict_merges WHERE repo = ? AND number = ? AND from_head = ? AND state = ?").get(p.repo, p.number, p.head, state);
  if (has("merged")) return "done";
  // Nothing more can be done by a merge at this head: the contributor is asked once (a comment needs approval).
  // A comment that failed is final too: GitHub may have posted it, so it is not posted again. One that never reached
  // GitHub is asked again after a backoff, and is final after the last one.
  const stuck = (): ConflictBucket => {
    if (has("asked")) return "asked";
    const unsent = unsentConflictAsk(db, p.repo, p.number, p.head, nowMs);
    if (has("comment-failed") || unsent === "final" || !approvals.comment) return "held";
    return unsent ? "ask-retry" : "ask";
  };
  if (has("skipped") || has("push-denied")) return stuck();
  if (has("linting")) return "linting";
  if (!p.pushable || has("cannot-push")) return stuck();
  if (conflictTries(db, p.repo, p.number, p.head) >= MAX_CONFLICT_TRIES) return stuck();
  if (conflictMergesToday(db, p.repo, p.number, nowMs) >= CONFLICT_MAX_MERGES_PER_PR_PER_DAY) return "capped";
  return approvals.push ? "merge" : "unapproved";
}

export const conflictNote = (bucket: ConflictBucket, base: string): string | null => coreConflictNote(bucket, base);
