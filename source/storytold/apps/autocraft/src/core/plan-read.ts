// Readers of the Plan cache (item_plans, written by the planner): what the dashboard shows of an item's state, next step, queue
// membership and place. They read the stored rows only; nothing here loads facts or decides.
import type { DatabaseSync } from "node:sqlite";
import type { PlanView, QueueView } from "./plan-cache.ts";
import { QUEUE_STATES, type Action, type ActionKind, type QueueState } from "./plan.ts";
import { filtered, hiddenJsonTest, type HiddenRepos } from "../hidden-sql.ts";

/** A PR in a queue state, as the merge queue lists it: the Plan's state, reasons and note, and the cached queue fields. */
export type CachedEntry = QueueView & {
  repo: string; number: number; title: string; state: QueueState; outsideRule: string[]; note: string | null;
  /** GitHub state as mirrored; a PR the pipeline merged counts as merged in `state` before the mirror says so. */
  gh: "OPEN" | "MERGED" | "CLOSED";
};

export type CachedQueueOptions = {
  repo?: string;
  /** Which PRs by GitHub state: open ones only, merged ones only, or both (default). */
  merged?: "exclude" | "only" | "all";
  /** Keyset page: entries after this PR in (repo, number) order, at most `limit` of them. */
  after?: { repo: string; number: number };
  limit?: number;
  /** Repos left out: a list from the dashboard's `hiddenRepos` allows only the repos it names as visible. */
  hidden?: HiddenRepos;
  /** Only these PRs, as "repo#number". */
  refs?: Iterable<string>;
};

const STATE_LIST = QUEUE_STATES.map((s) => `'${s}'`).join(",");

type QueueRow = { repo: string; number: number; title: string | null; state: string; reasons: string; note: string | null; view: string };

/** The queue entries of the cached Plans, in (repo, number) order; the same list buildQueue builds from facts. */
export function cachedQueue(db: DatabaseSync, opts: CachedQueueOptions = {}): CachedEntry[] {
  const which = opts.merged ?? "all";
  const params: Record<string, string | number> = {};
  const where = [`p.kind = 'pr'`, `p.state IN (${STATE_LIST})`, `json_extract(p.view, '$.queue') IS NOT NULL`];
  if (opts.repo) { where.push("p.repo = :repo"); params.repo = opts.repo; }
  if (opts.hidden && filtered(opts.hidden)) { const h = hiddenJsonTest("p.repo", opts.hidden, ":hidden"); where.push(`NOT (${h.sql})`); params.hidden = h.arg; }
  if (opts.refs) { where.push("p.repo || '#' || p.number IN (SELECT value FROM json_each(:refs))"); params.refs = JSON.stringify([...opts.refs]); }
  where.push(which === "exclude" ? "json_extract(p.view, '$.gh') = 'OPEN'" : which === "only" ? "json_extract(p.view, '$.gh') = 'MERGED'" : "json_extract(p.view, '$.gh') <> 'CLOSED'");
  if (opts.after) { where.push("(p.repo > :ar OR (p.repo = :ar AND p.number > :an))"); params.ar = opts.after.repo; params.an = opts.after.number; }
  const rows = db.prepare(`SELECT p.repo, p.number, i.title, p.state, p.reasons, p.note, p.view FROM main.item_plans p LEFT JOIN main.items i ON i.repo = p.repo AND i.number = p.number
    WHERE ${where.join(" AND ")} ORDER BY p.repo, p.number${opts.limit ? ` LIMIT ${Math.floor(opts.limit)}` : ""}`).all(params) as QueueRow[];
  return rows.map((r) => {
    const v = JSON.parse(r.view) as PlanView;
    return { ...v.queue!, repo: r.repo, number: r.number, title: r.title ?? "", state: r.state as QueueState, outsideRule: JSON.parse(r.reasons) as string[], note: r.note, gh: v.gh! };
  });
}

export function countStates(entries: { state: QueueState }[]): Record<QueueState, number> {
  const c = Object.fromEntries(QUEUE_STATES.map((s) => [s, 0])) as Record<QueueState, number>;
  for (const e of entries) c[e.state]++;
  return c;
}

/** How many merged PRs (GitHub says merged) have a Plan in a queue state, in the repo or all repos, without the hidden ones. */
export function countMergedPlans(db: DatabaseSync, repo?: string, hidden: HiddenRepos = []): number {
  const h = hiddenJsonTest("p.repo", hidden, ":hidden");
  return (db.prepare(`SELECT COUNT(*) AS n FROM main.item_plans p WHERE p.kind = 'pr' AND p.state IN (${STATE_LIST}) AND json_extract(p.view, '$.gh') = 'MERGED'
    ${repo ? "AND p.repo = :repo" : ""} AND NOT (${h.sql})`).get({ ...(repo ? { repo } : {}), hidden: h.arg }) as { n: number }).n;
}

export type DueOptions = { repo?: string; /** The action's `bucket` param, else its `source` param. */ bucket?: string };

/** The items whose cached Plan holds an action of `kind` (a PR's triage and review-to-merge actions are cached together), in (repo, number) order. */
export function dueActions(db: DatabaseSync, kind: ActionKind, opts: DueOptions = {}): { repo: string; number: number; action: Action }[] {
  const rows = db.prepare(`SELECT p.repo, p.number, a.value AS action FROM main.item_plans p, json_each(p.actions) a
    WHERE json_extract(a.value, '$.kind') = :kind ${opts.repo ? "AND p.repo = :repo" : ""} ORDER BY p.repo, p.number`).all({ kind, ...(opts.repo ? { repo: opts.repo } : {}) }) as { repo: string; number: number; action: string }[];
  const out = rows.map((r) => ({ repo: r.repo, number: r.number, action: JSON.parse(r.action) as Action }));
  if (opts.bucket === undefined) return out;
  return out.filter(({ action: a }) => (typeof a.params?.bucket === "string" ? a.params.bucket : typeof a.params?.source === "string" ? a.params.source : null) === opts.bucket);
}

/** `repo#number` of the items whose Plan holds an action of `kind`. */
export const dueRefs = (db: DatabaseSync, kind: ActionKind, opts: DueOptions = {}): Set<string> => new Set(dueActions(db, kind, opts).map((d) => `${d.repo}#${d.number}`));

/** The cached view of every open item with a Plan: `repo#number` to its PlanView. */
export function openViews(db: DatabaseSync): Map<string, PlanView> {
  const rows = db.prepare(`SELECT p.repo, p.number, p.view FROM main.item_plans p JOIN main.items i ON i.repo = p.repo AND i.number = p.number WHERE i.state = 'OPEN'`).all() as { repo: string; number: number; view: string }[];
  return new Map(rows.map((r) => [`${r.repo}#${r.number}`, JSON.parse(r.view) as PlanView]));
}
