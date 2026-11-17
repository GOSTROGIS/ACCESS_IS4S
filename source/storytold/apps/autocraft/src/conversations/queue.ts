// The queue of card presses that wait for room under the daily GitHub write limit. A press that finds no room is not refused:
// the card stays with the presser's note and skipped steps, holds the lock of the decision it settles, and the Act step runs
// queued cards in order (item priority level, then the time of the press) once room returns, which is 00:00 UTC or an operator's
// raise of the limit. Waiting for room is the registered "Daily limit" wait (src/stages/registry.ts); no timer runs.
// Card writes and Act's closes share one count (src/conversations/usage.ts), held to the Act limit.
import type { DatabaseSync } from "node:sqlite";
import { actLimit, actUsedToday } from "./usage.ts";
import type { CardParams } from "./cards.ts";
import { RUNNING_STALE_MS } from "../answers/hold.ts";
import { actBlockedReason } from "../runner/autopilot.ts";

/** What a queued card needs to run later as the press would have run: the presser's choices at the time. */
export type QueueArgs = { skip?: number[]; note?: string; noteStaysOut?: boolean; role?: string };

const WRITE_STEPS_ONE = new Set(["comment", "label", "close", "unlabel", "reopen", "open_issue", "transfer", "assign", "request_reviewers"]);

/** The GitHub writes a card makes: one per write step, two for a close that comes with a comment and for a duplicate close. Review and fix-up steps start pipeline work and write nothing here. */
export function cardWriteCount(params: CardParams, text: string | null): number {
  switch (params.kind) {
    case "comment": case "label": return 1;
    case "close": return text ? 2 : 1;
    case "duplicate": return 2;
    case "resolution": return params.steps.reduce((n, s) => n + (s.kind === "duplicate" ? 2 : WRITE_STEPS_ONE.has(s.kind) ? 1 : 0), 0);
    default: return 0;
  }
}

/** The writes of cards that run now and have not made them yet: counted as used, so two presses at once cannot both take the last room. */
function runningReserve(db: DatabaseSync, ms: number): number {
  const rows = db.prepare("SELECT id, params, text, acted_at FROM main.conversation_cards WHERE state = 'running' AND acted_at > ?").all(new Date(ms - RUNNING_STALE_MS).toISOString()) as { id: number; params: string; text: string | null; acted_at: string }[];
  let n = 0;
  for (const r of rows) {
    let need = 0;
    try { need = cardWriteCount(JSON.parse(r.params) as CardParams, r.text); } catch { continue; }
    const written = (db.prepare(`SELECT COUNT(*) AS n FROM main.audit WHERE json_valid(details) AND json_extract(details, '$.source') = 'conversation' AND json_extract(details, '$.card') = ? AND json_extract(details, '$.state') = 'done' AND at >= ?`).get(r.id, r.acted_at) as { n: number }).n;
    n += Math.max(0, need - written);
  }
  return n;
}

/**
 * Room under the daily limit for `need` more card writes. A card larger than the whole limit runs on an empty day instead of waiting for ever.
 * Call it inside the transaction that claims the card, so the check and the claim are one step.
 */
export function actRoom(db: DatabaseSync, need: number, ms: number = Date.now()): boolean {
  const limit = actLimit(db);
  if (limit === null || need === 0) return true;
  const used = actUsedToday(db, ms) + runningReserve(db, ms);
  return used + need <= limit || (used === 0 && need > limit && limit > 0);
}

export type QueuedRow = { id: number; repo: string; number: number; queued_at: string; acted_by: string | null; dispute_by: string | null; dispute_reason: string | null; dispute_at: string | null };

/**
 * Queued cards in the order they run: higher item priority level first (security raised), then the earlier press. One query.
 * Cards whose repo the pipeline cannot run Act for now are left out, so they hold no place and block nobody; the drain asks for them with `all`.
 */
export function queuedCards(db: DatabaseSync, o: { all?: boolean } = {}): QueuedRow[] {
  const rows = queuedRows(db);
  if (o.all) return rows;
  const blocked = new Map<string, boolean>();
  return rows.filter((r) => {
    if (!blocked.has(r.repo)) blocked.set(r.repo, actBlockedReason(db, r.repo) !== null);
    return !blocked.get(r.repo);
  });
}

function queuedRows(db: DatabaseSync): QueuedRow[] {
  return db.prepare(`SELECT c.id, c.repo, c.number, COALESCE(c.queued_at, '') AS queued_at, c.acted_by, c.dispute_by, c.dispute_reason, c.dispute_at
    FROM main.conversation_cards c LEFT JOIN main.item_rank r ON r.repo = c.repo AND r.number = c.number
    WHERE c.state = 'queued' ORDER BY COALESCE(CAST(r.score / 10000 AS INTEGER), 2) DESC, c.queued_at, c.id`).all() as QueuedRow[];
}

/** Places (from 1) of the queued cards that will run: a disputed press has none. Read once per request. */
export function queuePlaces(db: DatabaseSync, rows: QueuedRow[] = queuedCards(db)): Map<number, number> {
  const out = new Map<number, number>();
  for (const r of rows) if (!r.dispute_by) out.set(r.id, out.size + 1);
  return out;
}

/** 1-based place of the card in the queue, or null when it is not queued or is disputed. */
export const queuePlace = (db: DatabaseSync, cardId: number): number | null => queuePlaces(db).get(cardId) ?? null;

/** The shown reason of a queued press. The place is read when shown, never stored. */
export const queueReason = (place: number | null): string => (place === null ? "daily GitHub write limit" : `daily GitHub write limit, #${place} in line`);

/** Whether any card other than `except` waits in the queue (disputed ones are skipped by the drain and do not hold a place). */
export const queuedAhead = (db: DatabaseSync, except?: number): boolean =>
  queuedCards(db).some((r) => !r.dispute_by && r.id !== except);

/** Records a dispute of a queued press. False when the card is not queued, is the disputer's own, or is already disputed. */
export function disputeCard(db: DatabaseSync, id: number, by: string, reason: string, at: string): boolean {
  return Number(db.prepare(`UPDATE main.conversation_cards SET dispute_by = ?, dispute_reason = ?, dispute_at = ?
    WHERE id = ? AND state = 'queued' AND dispute_by IS NULL AND acted_by <> ? COLLATE NOCASE`).run(by, reason, at, id, by).changes) === 1;
}

export function keepCard(db: DatabaseSync, id: number): boolean {
  return Number(db.prepare("UPDATE main.conversation_cards SET dispute_by = NULL, dispute_reason = NULL, dispute_at = NULL WHERE id = ? AND state = 'queued' AND dispute_by IS NOT NULL").run(id).changes) === 1;
}

/** The first undisputed queued card and what it needs, for the planner: it proposes the drain only when the head fits. */
export function queueHead(db: DatabaseSync): { repo: string; fits: boolean } | null {
  const head = queuedCards(db).find((r) => !r.dispute_by);
  if (!head) return null;
  const c = db.prepare("SELECT params, text, queue_args FROM main.conversation_cards WHERE id = ?").get(head.id) as { params: string; text: string | null; queue_args: string | null };
  try { return { repo: head.repo, fits: actRoom(db, needOf(c)) }; } catch { return { repo: head.repo, fits: true }; }
}

/** Writes the queued card still makes: the card's writes minus the steps the presser removed. */
export function needOf(c: { params: string; text: string | null; queue_args?: string | null }): number {
  const params = JSON.parse(c.params) as CardParams;
  const args = JSON.parse(c.queue_args ?? "{}") as QueueArgs;
  const left = params.kind === "resolution" && args.skip?.length ? { ...params, steps: params.steps.filter((_, k) => !args.skip!.includes(k)) } : params;
  return cardWriteCount(left, c.text);
}
