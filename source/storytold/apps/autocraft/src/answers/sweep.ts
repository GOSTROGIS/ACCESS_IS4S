// Answers that can no longer be applied are closed out, so they neither linger as "waiting" nor block the question.
import type { DatabaseSync } from "node:sqlite";
import { BACKLOG, factsOf, type DecisionRow } from "../decisions.ts";
import { HEAD_FACT } from "../core/rules.ts";
import { audit } from "../dash/audit.ts";

const ACTOR = "pipeline";

/** Why the answer can no longer be applied (the item is gone from open, or a Merge/Close answer was given for another head), or null. */
function staleReason(db: DatabaseSync, d: DecisionRow): string | null {
  const it = db.prepare("SELECT state, head_oid FROM main.items WHERE repo = ? AND number = ?").get(d.repo, d.number) as { state: string; head_oid: string | null } | undefined;
  if (!it) return null;
  if (it.state === "MERGED") return "the PR merged";
  if (it.state === "CLOSED") return "the item is closed";
  if (d.kind === "merge" || d.kind === "close" || d.kind === "hold") {
    const f = factsOf(d).find((x) => x.startsWith(HEAD_FACT));
    const head = f ? f.slice(HEAD_FACT.length).trim() : null;
    if (head && it.head_oid && head !== it.head_oid) return "the PR changed after the answer";
  }
  return null;
}

/** The PR merged at the head the answer was given for, alone or inside a merged batch: the answer was carried out, only its row was not closed. */
function mergedAtHead(db: DatabaseSync, d: DecisionRow): boolean {
  if (d.kind !== "merge") return false;
  const f = factsOf(d).find((x) => x.startsWith(HEAD_FACT));
  const head = f ? f.slice(HEAD_FACT.length).trim() : null;
  if (!head || !d.repo || d.number === null) return false;
  return !!db.prepare("SELECT 1 FROM main.merges WHERE repo = ? AND number = ? AND head_oid = ? AND outcome = 'merged'").get(d.repo, d.number, head)
    || !!db.prepare("SELECT 1 FROM main.merge_batch_prs x JOIN main.merge_batches b ON b.id = x.batch_id WHERE b.repo = ? AND x.number = ? AND x.head_oid = ? AND b.state = 'merged'").get(d.repo, d.number, head);
}

/** Marks answered, unapplied single-item decisions of `repo` (all repos when omitted) that can no longer apply as applied, with a note. Returns how many. */
export function sweepStaleAnswers(db: DatabaseSync, at: string, repo?: string): number {
  const rows = db.prepare(`SELECT * FROM main.decisions WHERE answer IS NOT NULL AND applied_at IS NULL AND answer <> ? AND answered_by <> ? AND repo IS NOT NULL AND number IS NOT NULL
    AND id NOT LIKE '%:dupegroup:%' AND id NOT LIKE '%~replaced-%' ${repo ? "AND repo = ?" : ""}`).all(BACKLOG.key, ACTOR, ...(repo ? [repo] : [])) as DecisionRow[];
  let n = 0;
  for (const d of rows) {
    const done = mergedAtHead(db, d);
    const why = done ? "the PR merged at the answered head" : staleReason(db, d);
    if (!why) continue;
    const note = done ? "" : `not applied: ${why}`;
    const r = db.prepare(`UPDATE main.decisions SET applied_at = ?, exec_state = 'done', exec_reason = NULL, dispute_by = NULL, dispute_reason = NULL, dispute_at = NULL,
      answer_note = CASE WHEN ? = '' THEN answer_note WHEN answer_note IS NULL OR answer_note = '' THEN ? ELSE answer_note || ' (' || ? || ')' END
      WHERE id = ? AND answer IS NOT NULL AND applied_at IS NULL`).run(at, note, note, note, d.id);
    if (r.changes === 1) { audit(db, ACTOR, "answer-sweep", d.id, { answer: d.answer, why }); n++; }
  }
  return n;
}
