// The base branch a review read its diff against, and what may merge into which base.
import type { DatabaseSync } from "node:sqlite";
import { audit } from "../dash/audit.ts";
import { dropCachedDiff } from "../review/diff.ts";

/** The base branch the review of this head read its diff against; null when none was recorded. */
export function reviewedBaseOf(db: DatabaseSync, repo: string, number: number, head: string): string | null {
  return (db.prepare("SELECT base_ref FROM opus_reviews WHERE repo = ? AND number = ? AND head_oid = ?").get(repo, number, head) as { base_ref: string | null } | undefined)?.base_ref ?? null;
}

export function defaultBranchOf(db: DatabaseSync, repo: string): string | null {
  return (db.prepare("SELECT default_branch FROM repos WHERE name = ?").get(repo) as { default_branch: string | null } | undefined)?.default_branch ?? null;
}

/**
 * Why a PR may not merge into its current base, or null: the merge goes into the branch the review read the diff against.
 * A review that recorded none (stored earlier) allows only the default branch.
 */
export function baseRefusal(db: DatabaseSync, repo: string, head: string, number: number, liveBase: string): string | null {
  const reviewed = reviewedBaseOf(db, repo, number, head) ?? defaultBranchOf(db, repo);
  if (!reviewed) return null;
  return liveBase === reviewed ? null : `the base branch is ${liveBase}, but the review read the diff against ${reviewed}`;
}

/** Whether another branch may be merged into a PR: the default branch or the base its review read. */
export function mergeInAllowed(db: DatabaseSync, repo: string, number: number, head: string, branch: string): boolean {
  return branch === defaultBranchOf(db, repo) || branch === reviewedBaseOf(db, repo, number, head);
}

/**
 * A live read found the PR on another base than the mirror holds: the mirror takes the live base and the cached diff of the
 * old base is dropped. The planner then counts the review as stale (src/review/discussion.ts staleReviews), and the re-review
 * waits like one after a push: the PR author's retarget is no request for a review. `keepDiff`: the cached diff was just read
 * against the live base (a review's own read), so it stays.
 */
export function recordLiveBase(db: DatabaseSync, repo: string, number: number, head: string, liveBase: string, o: { by?: string; keepDiff?: boolean } = {}): void {
  if (!o.keepDiff) dropCachedDiff(repo, number, head);
  const was = (db.prepare("SELECT base_ref FROM items WHERE repo = ? AND number = ?").get(repo, number) as { base_ref: string | null } | undefined)?.base_ref ?? null;
  if (was === liveBase) return;
  db.prepare("UPDATE main.items SET base_ref = ? WHERE repo = ? AND number = ?").run(liveBase, repo, number);
  audit(db, o.by ?? "merge", "base-changed", `${repo}#${number}`, { head, from: was, base: liveBase });
}
