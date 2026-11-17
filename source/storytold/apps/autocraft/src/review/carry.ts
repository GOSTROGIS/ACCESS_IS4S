// A take or take-fix verdict carries over our own checked fix-up: when the only change since a sure review is the fix-up commit
// whose patch the patch check approved (and whose lint passed, since it was pushed), the new head gets the same verdict without an Opus call.
import type { DatabaseSync } from "node:sqlite";
import { ourCommitsSince } from "./ours.ts";
import type { OpusReview } from "./opus-parse.ts";
import { reviewAfterBaseMerge } from "./own-diff.ts";
import { defaultBranchOf } from "../merge/base.ts";

export const CARRIED = "carried";

type Stored = { head_oid: string; verdict: string; sure: number; risks: string | null; summary: string | null; why: string | null; conflicts: string | null; fixes: string | null; at: string; seen_at: string | null; disc_hash: string | null; model: string | null; base_ref: string | null };

/**
 * The review to record at `c.head_oid` as carried from the latest earlier review, with that review's discussion mark; null when it does not carry.
 * `stale` is the set of "repo#n@head" whose review is stale (staleReviews): a review that has not read the discussion as it is now is not carried,
 * and a head that already has a review (stale, being reviewed again) is never carried from an earlier one. A review read against
 * another base branch than the PR has now is not carried either; a carried review keeps the base its source read.
 */
export function carriedReview(db: DatabaseSync, c: { repo: string; number: number; head_oid: string }, stale: Set<string> = new Set()): { review: OpusReview; from: string; seen: string; hash: string | null; baseRef: string | null } | null {
  const e = db.prepare(`SELECT head_oid, verdict, sure, risks, summary, why, conflicts, fixes, at, seen_at, disc_hash, model, base_ref FROM opus_reviews
    WHERE repo = ? AND number = ? AND head_oid <> ? AND verdict IS NOT NULL AND model IS NOT NULL ORDER BY at DESC, rowid DESC LIMIT 1`).get(c.repo, c.number, c.head_oid) as Stored | undefined;
  if (db.prepare("SELECT 1 FROM opus_reviews WHERE repo = ? AND number = ? AND head_oid = ? AND verdict IS NOT NULL").get(c.repo, c.number, c.head_oid)) return null;
  if (!e || stale.has(`${c.repo}#${c.number}@${e.head_oid}`) || (e.verdict !== "take" && e.verdict !== "take-fix") || e.sure !== 1) return null;
  const baseRef = e.base_ref ?? defaultBranchOf(db, c.repo);
  const liveBase = (db.prepare("SELECT base_ref FROM items WHERE repo = ? AND number = ?").get(c.repo, c.number) as { base_ref: string | null } | undefined)?.base_ref ?? null;
  if (baseRef && liveBase && baseRef !== liveBase) return null;
  const path = ourCommitsSince(db, c.repo, c.number, e.head_oid, c.head_oid);
  const list = <T>(s: string | null): T[] => { try { const v = JSON.parse(s ?? "[]") as unknown; return Array.isArray(v) ? (v as T[]) : []; } catch { return []; } };
  const merge = path.complete && path.commits.length === 1 && path.commits[0]!.kind === "base merge"
    ? db.prepare("SELECT own_diff FROM conflict_merges WHERE repo = ? AND number = ? AND to_head = ? AND state = 'merged' ORDER BY rowid DESC").get(c.repo, c.number, c.head_oid) as { own_diff: string | null } | undefined : undefined;
  // Our merge of the base branch: the PR's own diff is what the review read, so an unchanged diff keeps the verdict and its fixes.
  if (merge && reviewAfterBaseMerge(merge.own_diff) === "carry") {
    const review: OpusReview = {
      ref: `${c.repo}#${c.number}`, verdict: e.verdict, sure: true, fixes: list(e.fixes), risks: list<string>(e.risks), summary: e.summary, why: e.why, public: null,
      reason: `carried from ${e.head_oid.slice(0, 7)}: the only change is our merge of the base branch, and the PR's own diff is unchanged`, conflicts: list(e.conflicts), claims: [], blocked_by: [],
    };
    return { review, from: e.head_oid, seen: e.seen_at ?? e.at, hash: e.disc_hash, baseRef };
  }
  // Exactly one commit, ours, a fix-up of the review's own fixes (not a pre-merge or carry-over fix-up).
  if (!path.complete || path.commits.length !== 1 || path.commits[0]!.kind !== "fix-up" || path.sources[0]) return null;
  const approved = db.prepare("SELECT verdict FROM patch_checks WHERE kind = 'fixup' AND repo = ? AND number = ? AND subject = ? ORDER BY id DESC LIMIT 1").get(c.repo, c.number, e.head_oid) as { verdict: string } | undefined;
  if (approved?.verdict !== "approve") return null;
  const review: OpusReview = {
    ref: `${c.repo}#${c.number}`, verdict: "take", sure: true, fixes: [], risks: list<string>(e.risks), summary: e.summary,
    // A take-fix review's reason names the fixes the fix-up has since made; the carried verdict's reason is the carry itself.
    why: e.verdict === "take-fix" ? null : e.why, public: null,
    reason: `carried from ${e.head_oid.slice(0, 7)}: the only change is our checked fix-up`, conflicts: list(e.conflicts), claims: [], blocked_by: [],
  };
  return { review, from: e.head_oid, seen: e.seen_at ?? e.at, hash: e.disc_hash, baseRef };
}
