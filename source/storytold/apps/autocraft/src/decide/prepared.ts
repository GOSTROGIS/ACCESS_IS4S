// When an open decision counts as prepared. Only items in scope (pipeline on for the repo, not our own integration PR) are prepared.
import type { DatabaseSync } from "node:sqlite";
import { pilotSql } from "../pilot.ts";
import { notOwnIntegrationSql } from "../dupes/held.ts";
import { OWN_NOTE_PREFIXES } from "../conversations/store.ts";
import { RECOMMEND_MAX_FAILURES, RECOMMEND_RETRY_MS } from "../core/item-rules.ts";

/** The columns of a decision that say what its prepare step did. */
export type PrepareColumns = {
  prepared_at: string | null; prepared_head: string | null;
  recommend_failures: number | null; recommend_failed_at: string | null; prepare_failed_head: string | null;
  /** Without `kind` a prepare is tied to the head, as a Merge? decision's is. */
  kind?: string; id?: string;
  /** The newest counted comment now (`discussionKeySql`), and the one the prepare read ('' none; null: prepared before this was stored, taken as unchanged). */
  discussion_key?: string | null; prepared_discussion?: string | null;
  /** When the newest Opus review at the item's current head was stored (`reviewedAtSql`). */
  reviewed_at?: string | null;
  /** JSON {d: drafts, a: added cores} of the current choices when they were written for another head than the PR's current one (`staleChoicesSql`), else null. */
  stale_choices?: string | null;
  /** Set by an operator's Re-prepare; such a prepare is exempt from the daily cap. */
  prepare_requested_at?: string | null;
  /** Automatic prepares of this decision since UTC midnight (`preparesTodaySql`). */
  prepares_today?: number;
  /** 1 when the item's Plan holds a review or carry action at the PR's current head (`reviewQueuedSql`): a review is about to start. */
  review_queued?: number;
};

/** Automatic prepares per decision per UTC day; an operator's Re-prepare is exempt. */
export const PREPARE_DAILY_CAP = 3;

/** A new comment re-prepares a decision only while it has fewer automatic prepares than this today: a first prepare and one re-prepare for the discussion. Later comments wait for a new head, a new review or an operator's Re-prepare. */
export const DISCUSSION_PREPARES_PER_DAY = 2;

/** The item's Plan holds a review or carry action for the PR's current head, so a review starts soon. A review that is stale but held (daily cap, CI, a blocking item, paused) has no such action. Alias `d`: a decision row. */
export const reviewQueuedSql = (d: string): string => `EXISTS (SELECT 1 FROM item_plans qp JOIN items qi ON qi.repo = qp.repo AND qi.number = qp.number, json_each(CASE WHEN json_valid(qp.actions) THEN qp.actions ELSE '[]' END) qa
  WHERE qp.repo = ${d}.repo AND qp.number = ${d}.number AND json_extract(qa.value, '$.kind') IN ('review', 'carry') AND json_extract(qa.value, '$.head') IS qi.head_oid)`;

/** The newest comment the item's discussion counts (src/review/discussion.ts isCounted, stored as `comments.counted`), without our own posts (app accounts, note lines). Alias `d`: a decision row. */
export const discussionKeySql = (d: string): string => `(SELECT c.id FROM comments c WHERE c.repo = ${d}.repo AND c.number = ${d}.number AND c.counted = 1
  AND COALESCE(c.author, '') NOT IN (SELECT value FROM json_each(CASE WHEN json_valid((SELECT value FROM main.settings WHERE key = 'app_slugs')) THEN (SELECT value FROM main.settings WHERE key = 'app_slugs') ELSE '[]' END))
  AND NOT (${OWN_NOTE_PREFIXES.map((x) => `ltrim(COALESCE(c.body, '')) LIKE '${x.replace(/_/g, "\\_")}%' ESCAPE '\\'`).join(" OR ")})
  ORDER BY c.created_at DESC, c.id DESC LIMIT 1)`;

/** When the newest finished Opus review at the item's current head was stored. */
export const reviewedAtSql = (d: string): string => `(SELECT max(r.at) FROM opus_reviews r JOIN items ri ON ri.repo = r.repo AND ri.number = r.number AND ri.head_oid = r.head_oid
  WHERE r.repo = ${d}.repo AND r.number = ${d}.number AND r.verdict IS NOT NULL)`;

/** The current choices of decision alias `d` when they were written for another PR head than the item's current one. */
export const staleChoicesSql = (d: string): string => `(SELECT json_object('d', json(c.drafts), 'a', json(c.added)) FROM decision_choices c JOIN items si ON si.repo = c.repo AND si.number = c.number
  WHERE c.decision_id = ${d}.id AND c.state = 'current' AND si.kind = 'pr' AND json_extract(c.seen, '$.head') IS NOT si.head_oid LIMIT 1)`;

/** Whether choices (the `stale_choices` JSON) hold a core whose effect rests on the code: a push, a drafted comment or issue, or a model-written reason. */
export function choicesDependOnCode(json: string | null | undefined): boolean {
  if (!json) return false;
  let v: { d?: Record<string, { params?: { reason?: string; instructions?: string }; extras?: { kind?: string }[] }>; a?: string[] };
  try { v = JSON.parse(json); } catch { return false; }
  const keys = [...Object.keys(v.d ?? {}), ...(v.a ?? [])];
  if (keys.some((k) => k === "x:fixup" || k === "fixup-merge")) return true;
  return Object.values(v.d ?? {}).some((c) => !!c.params?.reason?.trim() || !!c.params?.instructions?.trim() || (c.extras ?? []).some((e) => e.kind === "comment" || e.kind === "open_issue"));
}

/** Automatic prepares of decision alias `d` since the UTC day start bound to `?`. */
export const preparesTodaySql = (d: string): string => `(SELECT count(*) FROM decision_prepares p WHERE p.decision_id = ${d}.id AND p.manual = 0 AND p.at >= ?)`;

/** The select list for the columns above, for open decisions only; binds one `?` (the UTC day start). */
export const prepareStateSql = (d: string): string => `CASE WHEN ${d}.answer IS NULL THEN ${discussionKeySql(d)} END AS discussion_key,
  CASE WHEN ${d}.answer IS NULL THEN ${reviewedAtSql(d)} END AS reviewed_at, CASE WHEN ${d}.answer IS NULL THEN ${preparesTodaySql(d)} END AS prepares_today,
  CASE WHEN ${d}.answer IS NULL THEN ${staleChoicesSql(d)} END AS stale_choices, ${reviewQueuedSql(d)} AS review_queued`;

export const utcDayStart = (nowMs: number): string => `${new Date(nowMs).toISOString().slice(0, 10)}T00:00:00.000Z`;

/** A Merge? or Close? decision is made for one head commit: its id ends in `@<sha>`. */
const idHead = (d: PrepareColumns): string | null => {
  const m = d.id === undefined || (d.kind !== "merge" && d.kind !== "close" && d.kind !== "hold") ? null : /:(?:merge|close|hold)@(.+)$/.exec(d.id);
  return m ? m[1]! : null;
};

/**
 * A prepare covers the decision's current state. A Merge? decision (or one of unknown kind) is tied to the PR head it was prepared for.
 * Any other kind stays prepared across head pushes until the discussion changes (a new counted comment), a new Opus review
 * is stored at the current head, or the decision itself changes or an operator asks again (both clear `prepared_at`).
 */
export const isPrepared = (d: PrepareColumns, head: string | null): boolean => {
  if (d.prepared_at === null) return false;
  if (d.kind === undefined || d.kind === "merge") return (d.prepared_head ?? null) === (head ?? null);
  // A Hold question is kept through a new hold review at its head: that review's time makes the prepare stale.
  if (d.kind === "hold") return (d.prepared_head ?? null) === (head ?? null) && !(d.reviewed_at && d.reviewed_at > d.prepared_at);
  if (d.prepared_discussion != null && (d.discussion_key ?? "") !== d.prepared_discussion && ((d.prepares_today ?? 0) < DISCUSSION_PREPARES_PER_DAY || !!d.prepare_requested_at)) return false;
  if (choicesDependOnCode(d.stale_choices)) return false;
  return !(d.reviewed_at && d.reviewed_at > d.prepared_at);
};

/** Why an automatic prepare is not due: the decision is for an older head or a review of its head is queued (the review's result withdraws a Merge? or Close? question and asks it again), or it used its prepares of the day. An operator's Re-prepare lifts the cap and the review hold. */
export const prepareHeld = (d: PrepareColumns, head: string | null): "old-head" | "review-queued" | "capped" | null => {
  const h = idHead(d);
  if (h !== null && h !== head) return "old-head";
  if (h !== null && d.review_queued && !d.prepare_requested_at) return "review-queued";
  if (!d.prepare_requested_at && (d.prepares_today ?? 0) >= PREPARE_DAILY_CAP) return "capped";
  return null;
};

/** Failed tries at the current head; a new head starts again. */
const triesAt = (d: PrepareColumns, head: string | null): number => ((d.prepare_failed_head ?? null) === (head ?? null) ? d.recommend_failures ?? 0 : 0);

/** The decision is open, has no prepare for its current state, has tries left and is not held. */
export const isPreparing = (d: PrepareColumns, head: string | null): boolean => !isPrepared(d, head) && triesAt(d, head) < RECOMMEND_MAX_FAILURES && prepareHeld(d, head) === null;

/** Preparing, and the wait after the last failed try is over. */
export const prepareDue = (d: PrepareColumns, head: string | null, nowMs: number): boolean =>
  isPreparing(d, head) && (triesAt(d, head) === 0 || d.recommend_failed_at === null || Date.parse(d.recommend_failed_at) < nowMs - RECOMMEND_RETRY_MS);

/** Whether the decision is open and waits for its prepare (the dashboard's `preparing`). */
/**
 * The decision is still about something open: its item, or for a duplicate group (whose item is the kept one, often
 * already closed or merged) any member it would close.
 */
export const openSubjectSql = (d: string, i: string): string => `(${i}.state = 'OPEN' OR (${d}.id LIKE '%:dupegroup:%' AND EXISTS (SELECT 1 FROM dupe_group_items gi
  JOIN items m ON m.repo = ${d}.repo AND m.number = gi.number WHERE gi.decision_id = ${d}.id AND gi.role = 'close' AND m.state = 'OPEN')))`;

type Subject = { dkind: string; kind: string; head_oid: string | null } & Pick<PrepareColumns, "discussion_key" | "reviewed_at" | "prepares_today" | "stale_choices" | "review_queued">;

type Open = Partial<PrepareColumns> & { id: string; answer: string | null; repo: string | null; number: number | null };

const subjectSql = (): string => `SELECT d.id AS did, i.kind, i.head_oid, d.kind AS dkind, ${prepareStateSql("d")} FROM decisions d JOIN items i ON i.repo = d.repo AND i.number = d.number
    WHERE ${openSubjectSql("d", "i")} AND ${pilotSql("i")} AND ${notOwnIntegrationSql("i")}`;

function columnsFrom(d: Open, it: Subject | undefined): { cols: PrepareColumns; head: string | null; open: true } | null {
  if (!it) return null;
  const cols: PrepareColumns = { id: d.id, kind: it.dkind, prepared_at: d.prepared_at ?? null, prepared_head: d.prepared_head ?? null, prepare_failed_head: d.prepare_failed_head ?? null, recommend_failures: d.recommend_failures ?? null, recommend_failed_at: d.recommend_failed_at ?? null,
    prepared_discussion: d.prepared_discussion ?? null, discussion_key: it.discussion_key ?? null, reviewed_at: it.reviewed_at ?? null, prepare_requested_at: d.prepare_requested_at ?? null, prepares_today: Number(it.prepares_today ?? 0), stale_choices: it.stale_choices ?? null, review_queued: Number(it.review_queued ?? 0) };
  return { cols, head: it.kind === "pr" ? it.head_oid : null, open: true };
}

function columnsOf(db: DatabaseSync, d: Open): { cols: PrepareColumns; head: string | null; open: true } | null {
  if (d.answer !== null || d.number === null) return null;
  return columnsFrom(d, db.prepare(`${subjectSql()} AND d.id = ?`).get(utcDayStart(Date.now()), d.id) as Subject | undefined);
}

export type PrepareState = { preparing: boolean; preparedEarlier: boolean };

/** `preparing` and `preparedEarlier` of every open single-item decision in `ds` from one statement, for a page of rows. */
export function prepareStates(db: DatabaseSync, ds: Open[]): Map<string, PrepareState> {
  const open = ds.filter((d) => d.answer === null && d.number !== null);
  const out = new Map<string, PrepareState>();
  if (!open.length) return out;
  const rows = db.prepare(`${subjectSql()} AND d.id IN (SELECT value FROM json_each(?))`).all(utcDayStart(Date.now()), JSON.stringify(open.map((d) => d.id))) as (Subject & { did: string })[];
  const by = new Map(rows.map((r) => [r.did, r]));
  for (const d of open) {
    const x = columnsFrom(d, by.get(d.id));
    out.set(d.id, x ? { preparing: isPreparing(x.cols, x.head), preparedEarlier: stateEarlier(x) } : { preparing: false, preparedEarlier: false });
  }
  return out;
}

const stateEarlier = (x: { cols: PrepareColumns; head: string | null }): boolean =>
  (x.cols.prepared_at !== null || x.cols.stale_choices != null) && !isPrepared(x.cols, x.head) && prepareHeld(x.cols, x.head) === "capped";

export function preparing(db: DatabaseSync, d: Open): boolean {
  const x = columnsOf(db, d);
  return !!x && isPreparing(x.cols, x.head);
}

/** The decision keeps choices from an earlier prepare because its prepares of the day are used up; an operator's Re-prepare updates them. */
export function preparedEarlier(db: DatabaseSync, d: Open): boolean {
  const x = columnsOf(db, d);
  return !!x && stateEarlier(x);
}
