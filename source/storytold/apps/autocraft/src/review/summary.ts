// Text of Merge? and Close? decisions, taken from the review stored for the PR at the
// head the decision was asked at. No model call.
import type { DatabaseSync } from "node:sqlite";
import { HEAD_FACT } from "../merge/queue.ts";
import { factsOf, type DecisionRow } from "../decisions.ts";
import { inPilot } from "../pilot.ts";
import { firstSentence, WHY_MAX_WORDS, wordCount } from "../prose.ts";

type Row = { model: string | null; verdict: string; sure: number | null; reason: string | null; fixes: string | null; summary: string | null; why: string | null };

const squash = (s: string | null | undefined): string => (s ?? "").replace(/\s+/g, " ").trim();

/** The text as one short sentence, or null: a stored reason that is longer cannot stand for a one-line reason. */
export function oneSentence(s: string | null | undefined): string | null {
  const t = squash(s);
  return t && wordCount(t) <= WHY_MAX_WORDS && firstSentence(t) === t ? t : null;
}

export type ReviewText = {
  /** The model's summary; for a review stored without one, its reason whole. */
  summary: string;
  /** The model that wrote `summary`; empty when the text is the stored reason. */
  by: string;
  /** One sentence for the recommendation, or null. */
  why: string | null;
  verdict: string;
  sure: boolean;
  reason: string;
  fixes: number;
};

/** The review of one PR head as decision text; null when there is no review text. */
export function reviewText(db: DatabaseSync, repo: string, number: number, head: string): ReviewText | null {
  const o = db.prepare("SELECT model, verdict, sure, reason, fixes, summary, why FROM opus_reviews WHERE repo = ? AND number = ? AND head_oid = ? AND verdict IS NOT NULL").get(repo, number, head) as Row | undefined;
  if (!o) return null;
  const summary = squash(o.summary), reason = squash(o.reason);
  if (!summary && !reason) return null;
  let fixes = 0;
  try { fixes = (JSON.parse(o.fixes ?? "[]") as unknown[]).length; } catch { /* none */ }
  return { summary: summary || reason, by: o.model ?? "opus", why: oneSentence(o.why) ?? oneSentence(o.reason), verdict: o.verdict, sure: o.sure !== 0, reason, fixes };
}

/** The "review:" fact of a Merge? decision. */
export const reviewFact = (r: ReviewText): string => `review: ${r.verdict}: ${r.reason}${r.fixes ? `; ${r.fixes} fix${r.fixes === 1 ? "" : "es"} listed` : ""}`;

/**
 * Brings the text of open Merge? and Close? decisions in line with the review stored at their head: summary,
 * the Merge? review fact, and the reason of the recommendation (a recommendation without a reason is removed).
 * Skips decisions the prepare step has written or that have choices (their summary and pick are the judgement model's). Writes only what differs, so a second run changes nothing. Returns how many decisions it changed.
 */
export function fillReviewSummaries(db: DatabaseSync, at: string, repo?: string): number {
  const rows = db.prepare(`SELECT * FROM decisions WHERE kind IN ('merge', 'close', 'hold') AND answer IS NULL AND number IS NOT NULL AND prepared_at IS NULL
    AND NOT EXISTS (SELECT 1 FROM main.decision_choices c WHERE c.decision_id = decisions.id AND c.state = 'current')
    ${repo ? "AND repo = ?" : ""}`).all(...(repo ? [repo] : [])) as DecisionRow[];
  const upd = db.prepare(`UPDATE main.decisions SET summary = ?, summary_by = ?, summary_at = ?, facts = ?, recommended = ?, recommended_reason = ?, recommended_by = NULL
    WHERE id = ? AND answer IS NULL`);
  let n = 0;
  for (const d of rows) {
    if (!inPilot(db, d.repo!, d.number!)) continue;
    const head = factsOf(d).find((f) => f.startsWith(HEAD_FACT))?.slice(HEAD_FACT.length).trim();
    const r = head ? reviewText(db, d.repo!, d.number!, head) : null;
    if (!r) continue;
    const line = (f: string) => (d.kind === "merge" && f.startsWith("review: ") ? reviewFact(r) : (d.kind === "close" || d.kind === "hold") && f.startsWith("review reason: ") ? `review reason: ${r.reason.slice(0, 300)}` : f);
    const facts = JSON.stringify(factsOf(d).map(line));
    // The same rule as the ask: Merge? recommends unless Opus was unsure or the pre-merge review blocked the rule (its facts say so), Close? always; both only with a reason.
    const preMerge = factsOf(d).some((f) => f.startsWith("pre-merge defect: ") || f.startsWith("pre-merge review failed: "));
    const recommended = d.kind === "hold" ? null : r.why && (d.kind === "close" || (r.sure && !preMerge)) ? (d.kind === "close" ? "close" : "merge") : null;
    const same = d.summary === r.summary && (d.summary_by ?? "") === r.by && d.facts === facts && d.recommended === recommended && d.recommended_reason === (recommended ? r.why : null);
    if (same) continue;
    upd.run(r.summary, r.by || null, d.summary === r.summary ? (d.summary_at ?? at) : at, facts, recommended, recommended ? r.why : null, d.id);
    n++;
  }
  return n;
}
