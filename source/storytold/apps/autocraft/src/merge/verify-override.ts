// An operator's Merge answer to a Merge? question that named a failed or errored verification stands only when it was given after that
// verification result at the same head. A pre-approved merge's hand-over never answers over a failed verification (src/preapproval).
import type { DatabaseSync } from "node:sqlite";
import { settledBySql } from "../settlers.ts";
import { mergeDecisionId } from "../core/rules.ts";
import { withdrawMergeQuestion } from "./withdraw.ts";

export function verifyOverride(db: DatabaseSync, repo: string, number: number, head: string): boolean {
  // The result time is finished_at: created_at is the plan time, and a retry plans the same row again.
  const v = db.prepare("SELECT finished_at FROM verifications WHERE repo = ? AND number = ? AND head_sha = ? AND state IN ('failed', 'error') AND finished_at IS NOT NULL").get(repo, number, head) as { finished_at: string } | undefined;
  if (!v) return false;
  const id = mergeDecisionId(repo, number, head);
  if (db.prepare("SELECT 1 FROM audit WHERE target = ? AND action = 'answer' AND json_extract(details, '$.source') = 'preapproval' LIMIT 1").get(id)) return false;
  return !!db.prepare(`SELECT 1 FROM decisions WHERE id = ? AND kind = 'merge' AND answer = 'merge' AND answered_at > ? AND ${settledBySql("decisions")}`).get(id, v.finished_at);
}

/** A Merge answer given before the verification failed does not cover the failure: it is set aside so the Merge? question is asked again with the failure as a reason. */
export function setAsideAnswerBeforeFailure(db: DatabaseSync, repo: string, number: number, head: string, at: string): boolean {
  const d = db.prepare("SELECT answer FROM decisions WHERE id = ?").get(mergeDecisionId(repo, number, head)) as { answer: string | null } | undefined;
  return d?.answer === "merge" && withdrawMergeQuestion(db, repo, number, head, at, "verification failed after the Merge answer");
}
