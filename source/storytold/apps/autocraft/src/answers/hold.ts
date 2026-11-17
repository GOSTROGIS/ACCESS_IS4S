// One answer per question. While a conversation card settles a decision, the decision is locked ("settling"); once it is answered
// and before the pipeline applies it, another person can dispute it ("disputed") instead of answering again. Both states live in
// decisions.exec_state; the pipeline reads a disputed answer as no answer (see settlers.ts).
import type { DatabaseSync } from "node:sqlite";
import { BACKLOG, getDecision, optionsOf, type DecisionRow } from "../decisions.ts";
import { audit } from "../dash/audit.ts";
import { settledBy, settledBySql } from "../settlers.ts";
import { writeEffect } from "../act/index.ts";
import { queuePlace } from "../conversations/queue.ts";

export const SETTLING = "settling";
export const DISPUTED = "disputed";

/** A card that has run longer than this is taken as crashed (conversations/act.ts marks it failed). */
export const RUNNING_STALE_MS = 10 * 60_000;

/**
 * SQL: the lock of `t` (a decisions table or alias) is live: its card is still running and not stale, or is queued for room under the
 * daily GitHub write limit. A lock whose card ended or died counts for nothing, so no path has to clear it for the decision to be answerable.
 */
export const lockLiveSql = (t = "decisions", now: Date = new Date()): string =>
  `(${t}.exec_state = '${SETTLING}' AND EXISTS (SELECT 1 FROM main.conversation_cards lc WHERE (lc.state = 'queued' OR (lc.state = 'running' AND lc.acted_at > '${new Date(now.getTime() - RUNNING_STALE_MS).toISOString()}')) AND ${t}.exec_reason LIKE lc.id || ':%'))`;

/** The login of the person whose card is settling an open decision right now, or null. */
export function settlingBy(db: DatabaseSync, d: Pick<DecisionRow, "id" | "answer" | "exec_state" | "exec_reason">): string | null {
  if (d.answer !== null || d.exec_state !== SETTLING) return null;
  if (!db.prepare(`SELECT 1 FROM main.decisions WHERE id = ? AND ${lockLiveSql("decisions")}`).get(d.id)) return null;
  const r = d.exec_reason ?? "";
  return r.slice(r.indexOf(":") + 1) || "someone";
}

export const settlingMessage = (by: string): string => `${by} is applying their answer`;

/** The queued card that holds the open decision's lock, if any. */
export function queuedLock(db: DatabaseSync, d: Pick<DecisionRow, "id" | "exec_state" | "exec_reason">): number | null {
  if (d.exec_state !== SETTLING) return null;
  const id = Number((d.exec_reason ?? "").split(":")[0]);
  if (!Number.isInteger(id)) return null;
  return db.prepare("SELECT 1 FROM main.conversation_cards WHERE id = ? AND state = 'queued'").get(id) ? id : null;
}

/** Why an answer to the locked decision is refused: a card is running, or the press waits for room (the place is read now). */
export function lockMessage(db: DatabaseSync, d: DecisionRow): string {
  const by = settlingBy(db, d) ?? "someone";
  const card = queuedLock(db, d);
  if (card === null) return settlingMessage(by);
  const place = queuePlace(db, card);
  return `${by}'s answer waits for the daily GitHub write limit${place ? ` (#${place})` : ""}`;
}

/**
 * Claims the open decision for the card inside the transaction that queues the card or starts its run. A lock the card already holds
 * (it was queued) is taken over. Throws when another live card holds it. A decision that is answered or missing is left alone: the run reports "the decision changed".
 */
export function claimSettling(db: DatabaseSync, decisionId: string, cardId: number, login: string): void {
  const r = db.prepare(`UPDATE main.decisions SET exec_state = ?, exec_reason = ? WHERE id = ? AND answer IS NULL AND (NOT ${lockLiveSql("decisions")} OR (exec_state = ? AND exec_reason LIKE ?))`)
    .run(SETTLING, `${cardId}:${login}`, decisionId, SETTLING, `${cardId}:%`);
  if (r.changes === 1) return;
  const d = getDecision(db, decisionId);
  if (d && settlingBy(db, d)) throw new Error(lockMessage(db, d));
}

/** Clears the lock of the card. The answer's own exec state replaces it when the card answered the decision. */
export function releaseSettling(db: DatabaseSync, decisionId: string, cardId: number): void {
  db.prepare("UPDATE main.decisions SET exec_state = NULL, exec_reason = NULL WHERE id = ? AND exec_state = ? AND exec_reason LIKE ?").run(decisionId, SETTLING, `${cardId}:%`);
}

/** Locks left by a card that no longer runs (a crashed process). A queued card keeps its lock. */
export function sweepSettling(db: DatabaseSync): number {
  return Number(db.prepare(`UPDATE main.decisions SET exec_state = NULL, exec_reason = NULL WHERE exec_state = ?
    AND NOT EXISTS (SELECT 1 FROM main.conversation_cards c WHERE c.state IN ('running', 'queued') AND decisions.exec_reason LIKE c.id || ':%')`).run(SETTLING).changes);
}

export const isDisputed = (d: Pick<DecisionRow, "exec_state" | "answer" | "applied_at">): boolean => d.exec_state === DISPUTED && d.answer !== null && !d.applied_at;

/**
 * The answered decision on the item whose GitHub write the pipeline has not made yet and still will: someone chose, GitHub does not show it yet.
 * Backlog only holds, an option without a write (take, small-extra, need-info) leaves nothing to race, and an answer whose answerer no longer
 * settles is not carried out.
 */
export function pendingAnswerOn(db: DatabaseSync, repo: string, number: number): DecisionRow | null {
  const rows = db.prepare(`SELECT * FROM main.decisions WHERE repo = ? AND number = ? AND answer IS NOT NULL AND applied_at IS NULL AND answer <> ? AND id NOT LIKE '%~replaced-%'
    ORDER BY answered_at DESC`).all(repo, number, BACKLOG.key) as DecisionRow[];
  return rows.find((d) => writeEffect(d.kind, d.answer!) !== null && (isDisputed(d) || settledBy(db, d))) ?? null;
}

/** The reason a card of `by` that writes to the item must not run, or null. */
export function pendingAnswerRefusal(db: DatabaseSync, repo: string, number: number, by: string): string | null {
  const d = pendingAnswerOn(db, repo, number);
  if (!d) return null;
  const label = optionsOf(d).find((o) => o.key === d.answer)?.label ?? d.answer;
  if (isDisputed(d)) return `${d.answered_by}'s answer "${label}" is disputed by ${d.dispute_by}; it has to be kept or undone first`;
  if (d.answered_by?.toLowerCase() === by.toLowerCase()) return `You already answered "${d.question}" with "${label}". Undo your answer first`;
  return `${d.answered_by} already answered "${d.question}" with "${label}"; dispute that answer to change it`;
}

/** True while any answer on the item is disputed: no pipeline write for the item goes ahead. */
export function disputeOn(db: DatabaseSync, repo: string, number: number): boolean {
  return !!db.prepare("SELECT 1 FROM main.decisions WHERE repo = ? AND number = ? AND exec_state = ? AND answer IS NOT NULL AND applied_at IS NULL LIMIT 1").get(repo, number, DISPUTED);
}

/** Records the dispute. False when the decision is no longer disputable (answered by the disputer, applied, running or already disputed). */
export function openDispute(db: DatabaseSync, id: string, by: string, reason: string, at: string): boolean {
  const r = db.prepare(`UPDATE main.decisions SET exec_state = ?, exec_reason = NULL, dispute_by = ?, dispute_reason = ?, dispute_at = ?
    WHERE id = ? AND answer IS NOT NULL AND applied_at IS NULL AND answer <> ? AND answered_by <> ? COLLATE NOCASE
      AND (exec_state IS NULL OR exec_state IN ('pending', 'waiting-token', 'waiting-permission', 'failed'))`).run(DISPUTED, by, reason, at, id, BACKLOG.key, by);
  if (r.changes !== 1) return false;
  audit(db, by, "dispute", id, { reason });
  return true;
}

export function clearDispute(db: DatabaseSync, id: string): void {
  db.prepare("UPDATE main.decisions SET exec_state = NULL, exec_reason = NULL, dispute_by = NULL, dispute_reason = NULL, dispute_at = NULL WHERE id = ? AND exec_state = ?").run(id, DISPUTED);
}

/**
 * SQL (decisions unaliased): an answered, unapplied decision the viewer has to look at: a disputed one (the answerer, or any operator), or one an
 * operator has to reassign because its answerer no longer settles and its option writes to GitHub.
 */
export function heldOpenSql(login: string, operator: boolean): string {
  const me = `'${login.replace(/'/g, "''")}'`;
  const writes = `((decisions.answer = 'close' AND decisions.kind IN ('scope', 'close', 'duplicate', 'merge', 'hold')) OR (decisions.answer = 'merge' AND decisions.kind = 'merge')
    OR (decisions.kind = 'duplicate' AND (decisions.answer = 'accept' OR decisions.answer LIKE 'keep:%')))`;
  // An open decision whose queued press someone disputed: the presser and operators look at it.
  const queuedDispute = `(decisions.answer IS NULL AND decisions.exec_state = '${SETTLING}' AND EXISTS (SELECT 1 FROM main.conversation_cards hc WHERE hc.state = 'queued' AND hc.dispute_by IS NOT NULL
    AND decisions.exec_reason LIKE hc.id || ':%' AND ${operator ? "1" : `hc.acted_by = ${me} COLLATE NOCASE`}))`;
  return `(${queuedDispute} OR decisions.answer IS NOT NULL AND decisions.applied_at IS NULL AND decisions.answer <> '${BACKLOG.key}' AND decisions.id NOT LIKE '%~replaced-%'
    AND ((decisions.exec_state = '${DISPUTED}' AND ${operator ? "1" : `decisions.answered_by = ${me} COLLATE NOCASE`})
      OR (${operator ? "1" : "0"} AND decisions.exec_state IS NOT '${DISPUTED}' AND decisions.answered_by IS NOT NULL AND decisions.answered_by <> 'pipeline' AND ${writes} AND NOT ${settledBySql("decisions")})))`;
}
