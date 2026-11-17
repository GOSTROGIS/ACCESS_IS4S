// A review made again at the same head commit replaces the one a "Merge this PR?" decision was asked from.
import type { DatabaseSync } from "node:sqlite";
import { audit } from "../dash/audit.ts";
import { clearAskedStage } from "../decisions.ts";
import { holdDecisionId, mergeDecisionId, OPEN_GROUP_SQL, type QueueEntry } from "./queue.ts";

/** Answer value of a question the pipeline set aside; no operator wrote it, so no later step acts on it. */
export const WITHDRAWN = "withdrawn";

/** Renames a decision and what hangs on its id, freeing the id for a new question. */
function renameDecision(db: DatabaseSync, id: string, to: string): void {
  for (const t of ["decisions", "decision_opinions", "decision_comments", "decision_claims"]) {
    db.prepare(`UPDATE ${t} SET ${t === "decisions" ? "id" : "decision_id"} = ? WHERE ${t === "decisions" ? "id" : "decision_id"} = ?`).run(to, id);
  }
}

/**
 * Sets the head's merge decision aside, answered or not, by renaming it (and what hangs on its id) so it no longer
 * matches the PR: the question is asked again from the new review and an earlier "merge" answer does not count.
 * The old row stays for the record and is closed: an open one is answered "withdrawn" by the pipeline, an
 * answered one that was not acted on yet is marked applied with a note.
 */
export function withdrawMergeQuestion(db: DatabaseSync, repo: string, number: number, head: string, at: string, why = "superseded by a new review"): boolean {
  return setAside(db, mergeDecisionId(repo, number, head), repo, number, head, at, why, (a) => a !== "merge");
}

/** Sets the head's Hold question aside the same way. A close answer waiting for Act still stands. */
export function withdrawHoldQuestion(db: DatabaseSync, repo: string, number: number, head: string, at: string, why = "superseded by a new review"): boolean {
  return setAside(db, holdDecisionId(repo, number, head), repo, number, head, at, why, (a) => a === "close");
}

function setAside(db: DatabaseSync, id: string, repo: string, number: number, head: string, at: string, why: string, stands: (answer: string) => boolean): boolean {
  const row = db.prepare("SELECT answer, applied_at FROM decisions WHERE id = ?").get(id) as { answer: string | null; applied_at: string | null } | undefined;
  // An answer that waits for Act and does not depend on the review still stands: the new review doesn't change it.
  if (!row || (row.answer !== null && stands(row.answer) && !row.applied_at)) return false;
  const old = `${id}~replaced-${at}`;
  db.exec("BEGIN IMMEDIATE");
  try {
    renameDecision(db, id, old);
    if (row.answer === null) {
      db.prepare("UPDATE main.decisions SET answer = ?, answered_by = 'pipeline', answered_at = ?, applied_at = ?, answer_note = ? WHERE id = ?").run(WITHDRAWN, at, at, why, old);
      audit(db, "pipeline", "merge-question-withdrawn", old, { repo, number, head });
    } else if (!row.applied_at) {
      db.prepare("UPDATE main.decisions SET applied_at = ?, answer_note = COALESCE(answer_note || ' — ', '') || ? WHERE id = ?").run(at, `${why}; the answer was not applied`, old);
      audit(db, "pipeline", "merge-answer-superseded", old, { repo, number, head, answer: row.answer });
    }
    db.exec("COMMIT");
    return true;
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}

/**
 * Sets aside the Merge? decisions of PRs a maintainer's "changes requested" review blocks; they are asked again if the
 * block clears. Only an open question or an unapplied merge answer is touched: a hold or close answer stands.
 */
export function withdrawBlockedQuestions(db: DatabaseSync, queue: QueueEntry[], at: string): number {
  let n = 0;
  for (const e of queue) {
    // A block seen only in the mirror may be wrong (the association is relative to the viewer): wait for a live read.
    if (e.state !== "changes-requested" || !e.blockedLive || !e.decisionId) continue;
    const row = db.prepare("SELECT answer, applied_at FROM decisions WHERE id = ?").get(e.decisionId) as { answer: string | null; applied_at: string | null } | undefined;
    if (!row || (row.answer !== null && (row.answer !== "merge" || row.applied_at))) continue;
    if (withdrawMergeQuestion(db, e.repo, e.number, e.head, at)) n++;
  }
  return n;
}

/** Why a Merge? question is set aside while its PR is in an open duplicate group. */
export const IN_GROUP_NOTE = "set aside while the PR is in a duplicate group";

/**
 * Sets aside the open Merge? decision (or unapplied merge answer) of every PR that is a member of an open duplicate
 * group decision, so an item has one current decision. The PR that stays open is asked again after the group is answered.
 */
export function withdrawGroupedQuestions(db: DatabaseSync, at: string, repo?: string): number {
  const rows = db.prepare(`SELECT DISTINCT m.repo, m.number, m.id FROM decisions m
    JOIN dupe_group_items gi ON gi.repo = m.repo AND gi.number = m.number
    JOIN decisions g ON g.id = gi.decision_id AND gi.role <> 'stay'
    WHERE ${OPEN_GROUP_SQL} AND m.kind = 'merge' AND m.id NOT LIKE '%~replaced-%' AND (m.answer IS NULL OR (m.answer = 'merge' AND m.applied_at IS NULL))
    ${repo ? "AND m.repo = ?" : ""}`).all(...(repo ? [repo] : [])) as { repo: string; number: number; id: string }[];
  let n = 0;
  for (const r of rows) {
    const head = r.id.slice(r.id.indexOf(":merge@") + ":merge@".length);
    if (mergeDecisionId(r.repo, r.number, head) === r.id && withdrawMergeQuestion(db, r.repo, r.number, head, at, IN_GROUP_NOTE)) n++;
  }
  return n;
}

/** Closes the PR's open Merge? questions at every head once it merged, whatever path merged it. */
export function closeMergedQuestions(db: DatabaseSync, repo: string, number: number, at: string): void {
  db.prepare("UPDATE main.decisions SET answer = ?, answered_by = 'pipeline', answered_at = ?, applied_at = ?, answer_note = 'the PR merged' WHERE kind = 'merge' AND repo = ? AND number = ? AND answer IS NULL")
    .run(WITHDRAWN, at, at, repo, number);
}

/** Sets aside the PR's unanswered Merge? questions at heads other than the one just asked about. */
export function withdrawOtherHeadQuestions(db: DatabaseSync, repo: string, number: number, keepHead: string, at: string): void {
  const prefix = `${repo}#${number}:merge@`;
  const rows = db.prepare("SELECT id FROM decisions WHERE repo = ? AND number = ? AND kind = 'merge' AND answer IS NULL AND substr(id, 1, ?) = ? AND id NOT LIKE '%~replaced-%'").all(repo, number, prefix.length, prefix) as { id: string }[];
  for (const r of rows) {
    const head = r.id.slice(prefix.length);
    if (head !== keepHead) withdrawMergeQuestion(db, repo, number, head, at, "superseded by a question at a newer head");
  }
}

/** Why a scope answer by a maintainer is set aside once it no longer counts. */
const LAPSED_NOTE = "the maintainer's answer no longer counts";

/**
 * Sets aside the answered scope decision `id` whose maintainer answer no longer counts (src/settlers.ts): the row is renamed
 * (`<id>~lapsed-<at>`) with its answer, note and answerer kept and marked applied, so the id is free for a fresh question.
 * Returns false when there is no answered row.
 */
export function setAsideLapsedScope(db: DatabaseSync, id: string, at: string): boolean {
  const row = db.prepare("SELECT repo, number, answer FROM decisions WHERE id = ? AND kind = 'scope' AND answer IS NOT NULL").get(id) as { repo: string; number: number; answer: string } | undefined;
  if (!row) return false;
  const old = `${id}~lapsed-${at}`;
  db.exec("BEGIN IMMEDIATE");
  try {
    renameDecision(db, id, old);
    db.prepare("UPDATE main.decisions SET applied_at = COALESCE(applied_at, ?), answer_note = COALESCE(answer_note || ' — ', '') || ? WHERE id = ?").run(at, LAPSED_NOTE, old);
    audit(db, "pipeline", "scope-answer-lapsed", old, { repo: row.repo, number: row.number, answer: row.answer });
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
  return true;
}

/** Why a question is set aside for a newer one. */
const NEWER_NOTE = "superseded by a newer question about the item";

/** Why a Merge? or Close? question is set aside once its PR's head moved on. */
const HEAD_MOVED_NOTE = "the pull request changed since";

/**
 * Sets aside open Merge? and Close? questions asked at a head that is no longer the PR's head in the mirror: the merge queue
 * and Act read only the current head's id, so an answer to the old one has no effect. Answered decisions are not touched.
 */
function setAsideOldHeadQuestions(db: DatabaseSync, at: string, repo?: string): number {
  const rows = db.prepare(`SELECT d.id, d.kind, d.repo, d.number FROM decisions d JOIN items i ON i.repo = d.repo AND i.number = d.number
    WHERE d.answer IS NULL AND d.kind IN ('merge', 'close', 'hold') AND d.id NOT LIKE '%~replaced-%' AND i.kind = 'pr' AND i.head_oid IS NOT NULL
      AND d.id <> d.repo || '#' || d.number || ':' || d.kind || '@' || i.head_oid AND d.id LIKE d.repo || '#' || d.number || ':' || d.kind || '@%' ${repo ? "AND d.repo = ?" : ""}`)
    .all(...(repo ? [repo] : [])) as { id: string; kind: string; repo: string; number: number }[];
  if (!rows.length) return 0;
  const close = db.prepare("UPDATE main.decisions SET answer = ?, answered_by = 'pipeline', answered_at = ?, applied_at = ?, answer_note = ?, adopted_opinion = NULL WHERE id = ? AND answer IS NULL");
  db.exec("BEGIN IMMEDIATE");
  try {
    for (const r of rows) {
      const old = `${r.id}~replaced-${at}`;
      renameDecision(db, r.id, old);
      close.run(WITHDRAWN, at, at, HEAD_MOVED_NOTE, old);
      audit(db, "pipeline", "decision-withdrawn", old, { repo: r.repo, number: r.number, kind: r.kind, why: HEAD_MOVED_NOTE });
    }
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
  return rows.length;
}

/**
 * An item has at most one open single-item decision: of its open scope, merge and close questions the newest asked stays
 * and the others are set aside (renamed like a superseded Merge? question, so an answer to them never counts). A set-aside
 * scope question keeps its stages row, so Decide does not ask it again. Merge? and Close? questions at a head the PR has
 * moved past are set aside too. Returns how many were set aside. Idempotent.
 */
export function setAsideSupersededQuestions(db: DatabaseSync, at: string, repo?: string): number {
  const stale = setAsideOldHeadQuestions(db, at, repo);
  const rows = db.prepare(`SELECT id, kind, repo, number FROM decisions WHERE answer IS NULL AND number IS NOT NULL
    AND kind IN ('scope', 'merge', 'close', 'hold') AND id NOT LIKE '%:dupegroup:%' AND id NOT LIKE '%~replaced-%' ${repo ? "AND repo = ?" : ""}
    ORDER BY asked_at DESC, rowid DESC`).all(...(repo ? [repo] : [])) as { id: string; kind: string; repo: string; number: number }[];
  const seen = new Set<string>();
  const aside: { r: (typeof rows)[number]; why: string }[] = [];
  for (const r of rows) {
    const k = `${r.repo}#${r.number}`;
    if (seen.has(k)) aside.push({ r, why: NEWER_NOTE });
    else seen.add(k);
  }
  if (!aside.length) return stale;
  const close = db.prepare("UPDATE main.decisions SET answer = ?, answered_by = 'pipeline', answered_at = ?, applied_at = ?, answer_note = ?, adopted_opinion = NULL WHERE id = ? AND answer IS NULL");
  db.exec("BEGIN IMMEDIATE");
  try {
    for (const { r, why } of aside) {
      const old = `${r.id}~replaced-${at}`;
      renameDecision(db, r.id, old);
      close.run(WITHDRAWN, at, at, why, old);
      audit(db, "pipeline", "decision-withdrawn", old, { repo: r.repo, number: r.number, kind: r.kind, why });
    }
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
  return stale + aside.length;
}

type OpenRow = { id: string; kind: string; repo: string | null; number: number | null; state: string | null; itemKind: string | null };

const closedWhy = (r: OpenRow): string => r.state === "MERGED" ? "the pull request was merged" : `the ${r.itemKind === "pr" ? "pull request" : "issue"} was closed on GitHub`;

/**
 * Withdraws the open scope, merge, close and (single-item) duplicate questions of items that are closed or merged in the
 * mirror, and an open duplicate-group question with fewer than two open members. The row is answered "withdrawn" by the
 * pipeline with the reason as its note and audited; nothing is written to GitHub. A single-item question is renamed like
 * a superseded Merge? question, so an item that reopens is asked again under the same id; a scope question also loses
 * the stages row Decide wrote, so the item counts as never asked. Idempotent: it writes only when something is left to withdraw.
 */
export function withdrawClosedQuestions(db: DatabaseSync, at: string): number {
  const single = db.prepare(`SELECT d.id, d.kind, d.repo, d.number, i.state, i.kind AS itemKind FROM decisions d
    JOIN items i ON i.repo = d.repo AND i.number = d.number
    WHERE d.answer IS NULL AND d.number IS NOT NULL AND d.kind IN ('scope', 'close', 'merge', 'hold', 'duplicate') AND d.id NOT LIKE '%:dupegroup:%' AND d.id NOT LIKE '%~replaced-%'
      AND i.state IN ('CLOSED', 'MERGED')`).all() as OpenRow[];
  const groups = db.prepare(`SELECT d.id, d.kind, d.repo, d.number FROM decisions d
    WHERE d.answer IS NULL AND d.kind = 'duplicate' AND d.id LIKE '%:dupegroup:%' AND d.id NOT LIKE '%~replaced-%'
      AND (SELECT COUNT(*) FROM dupe_group_items gi JOIN items i ON i.repo = gi.repo AND i.number = gi.number WHERE gi.decision_id = d.id AND i.state = 'OPEN') < 2`).all() as OpenRow[];
  if (!single.length && !groups.length) return 0;
  const clear = clearAskedStage(db);
  const close = db.prepare("UPDATE main.decisions SET answer = ?, answered_by = 'pipeline', answered_at = ?, applied_at = ?, answer_note = ?, adopted_opinion = NULL WHERE id = ? AND answer IS NULL");
  db.exec("BEGIN IMMEDIATE");
  try {
    for (const r of single) {
      const old = `${r.id}~replaced-${at}`;
      renameDecision(db, r.id, old);
      const why = closedWhy(r);
      close.run(WITHDRAWN, at, at, why, old);
      if (r.kind === "scope") clear(r.repo!, r.number!, r.id);
      audit(db, "pipeline", "decision-withdrawn", old, { repo: r.repo, number: r.number, kind: r.kind, why });
    }
    for (const r of groups) {
      const why = "the duplicate group has one open item left";
      close.run(WITHDRAWN, at, at, why, r.id);
      audit(db, "pipeline", "decision-withdrawn", r.id, { kind: r.kind, why });
    }
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
  return single.length + groups.length;
}
