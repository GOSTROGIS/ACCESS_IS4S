// The merge queue for the dashboard: read-only, anyone signed in, limited to the repos the requester may see; viewers get
// the queue rows without the review's reason, verification text and the plan's quoted reasons (src/dash/api/reader.ts).
import type { DatabaseSync } from "node:sqlite";
import type { BatchList, BatchState, Mergeable, QueueBatch, QueueList, QueueRow, QueueState, Tier, TypeLabel } from "../../../web/src/api/types.ts";
import { cachedQueue, countMergedPlans, countStates, type CachedEntry } from "../../core/plan-read.ts";
import { QUEUE_STATES } from "../../core/plan.ts";
import { pageBatches, type BatchRow } from "../../merge/batch-store.ts";
import { HttpError } from "../server/util.ts";
import type { Req } from "../types.ts";
import { flowMembers } from "./flow.ts";
import { queueTextFor, readerOf, type Reader } from "./reader.ts";
import { isHiddenRepo } from "../../hidden-sql.ts";

const TIER: Record<string, Tier> = { whitelisted: "whitelisted", not: "not", allow: "override-allow", deny: "override-deny" };
const MERGEABLE: Record<string, Mergeable> = { MERGEABLE: "clean", CONFLICTING: "conflicts" };
const CI = ["success", "failure", "pending", "none"];

export const toRow = (e: CachedEntry, r: Reader): QueueRow => queueTextFor(r, {
  repo: e.repo, number: e.number, title: e.title, author: e.author ?? "", tier: TIER[e.tier] ?? "not", head: e.head,
  size: (["S", "M", "L"].includes(e.size) ? e.size : "L") as QueueRow["size"], label: e.label as TypeLabel | null,
  verdict: e.verdict, reason: e.reason, fixes: e.fixes,
  ci: (CI.includes(e.ci) ? e.ci : "unknown") as QueueRow["ci"], mergeable: MERGEABLE[e.mergeable] ?? "unknown",
  state: e.state as QueueState, path: e.path, outsideRule: e.outsideRule, decisionId: e.decisionId, answer: e.answer,
  refusedReason: e.refusedReason, note: e.note, reviewedAt: e.reviewedAt, verify: e.verify,
});

/** `repo#number` cursor of the last row of a page. */
const cursorOf = (r: { repo: string; number: number }): string => `${r.repo}#${r.number}`;
function parseCursor(s: string | null): { repo: string; number: number } | undefined {
  if (!s) return undefined;
  const k = s.lastIndexOf("#");
  const number = Number(s.slice(k + 1));
  if (k < 1 || !Number.isInteger(number)) throw new HttpError(400, "after must be repo#number");
  return { repo: s.slice(0, k), number };
}

// The queue rows come from the Plan cache (src/core/plan-read.ts): open PRs are read whole (counts and the state filter need all of
// them) and cut into pages by (repo, number); merged PRs are read a page at a time and only when state=merged.
/** PRs (repo#number@head) in an integration batch in flight: without a state filter they are listed under their batch, not in the PR list. */
const inFlight = (db: DatabaseSync): Set<string> => new Set((db.prepare(`SELECT b.repo || '#' || p.number || '@' || p.head_oid AS k
  FROM main.merge_batch_prs p JOIN main.merge_batches b ON b.id = p.batch_id WHERE b.state IN ('checking', 'open')`).all() as { k: string }[]).map((r) => r.k));

export async function queue(db: DatabaseSync, req: Req): Promise<QueueList> {
  const repo = req.query.get("repo") || undefined;
  const state = req.query.get("state") || undefined;
  const limit = Math.min(Math.max(Number(req.query.get("limit")) || 100, 1), 500);
  const after = parseCursor(req.query.get("after"));
  const reader = await readerOf(db, req);
  const hidden = reader.hidden;
  if (repo && isHiddenRepo(hidden, repo)) throw new HttpError(404, `${repo} is not a tracked repo`);
  if (state && !(QUEUE_STATES as readonly string[]).includes(state)) throw new HttpError(400, `state must be one of ${QUEUE_STATES.join(", ")}`);
  // A flowchart branch lists exactly its own PRs, whatever their state.
  const flowKey = req.query.get("flow");
  if (flowKey) {
    const refs = /^merge\.[a-z-]+$/.test(flowKey) ? flowMembers(db, flowKey) : null;
    if (!refs) throw new HttpError(400, "flow must name a Merge queue branch");
    const entries = cachedQueue(db, { repo, merged: "all", hidden, refs });
    const from = after ? entries.findIndex((e) => e.repo > after.repo || (e.repo === after.repo && e.number > after.number)) : 0;
    const rest = from < 0 ? [] : entries.slice(from);
    const rows = rest.slice(0, limit);
    return {
      rows: rows.map((e) => toRow(e, reader)), counts: countStates(entries), total: entries.length,
      next: rest.length > limit ? cursorOf(rows[rows.length - 1]!) : null,
    };
  }
  const open = cachedQueue(db, { repo, merged: "exclude", hidden });
  const merged = countMergedPlans(db, repo, hidden);
  // An open PR that we merged and the mirror has not seen merged yet counts as merged.
  const counts = countStates(open);
  counts.merged += merged;
  let page: CachedEntry[];
  let more: boolean;
  let match: CachedEntry[] | undefined;
  if (state === "merged") {
    page = cachedQueue(db, { repo, merged: "only", after, limit: limit + 1, hidden });
    more = page.length > limit;
    page = page.slice(0, limit);
  } else {
    const batched = state ? null : inFlight(db);
    match = open.filter((e) => e.state !== "merged" && (state ? e.state === state : !batched!.has(`${e.repo}#${e.number}@${e.head}`)));
    const from = after ? match.findIndex((e) => e.repo > after.repo || (e.repo === after.repo && e.number > after.number)) : 0;
    const rest = from < 0 ? [] : match.slice(from);
    page = rest.slice(0, limit);
    more = rest.length > limit;
  }
  const total = state === "merged" ? counts.merged : state ? counts[state as keyof typeof counts] : match!.length;
  return { rows: page.map((e) => toRow(e, reader)), counts, total, next: more ? cursorOf(page[page.length - 1]!) : null };
}

/** One page of integration batches, newest first, each with its member PRs as queue rows. `after` is the id of the last batch of the previous page. */
export async function queueBatches(db: DatabaseSync, req: Req): Promise<BatchList> {
  const repo = req.query.get("repo") || undefined;
  const limit = Math.min(Math.max(Number(req.query.get("limit")) || 20, 1), 100);
  const afterRaw = req.query.get("after");
  const after = afterRaw ? Number(afterRaw) : undefined;
  if (after !== undefined && !Number.isInteger(after)) throw new HttpError(400, "after must be a batch id");
  const reader = await readerOf(db, req);
  const hidden = reader.hidden;
  if (repo && isHiddenRepo(hidden, repo)) throw new HttpError(404, `${repo} is not a tracked repo`);
  const { batches, total, more } = pageBatches(db, { repo, hidden, before: after, limit });
  const refs = batches.flatMap((b) => b.prs.map((p) => `${b.repo}#${p.number}`));
  const rows = new Map(refs.length ? cachedQueue(db, { merged: "all", refs, hidden }).map((e) => [`${e.repo}#${e.number}`, toRow(e, reader)]) : []);
  const out = batches.map((b) => toBatch(b, b.prs.flatMap((p) => rows.get(`${b.repo}#${p.number}`) ?? [])));
  return { batches: out, total, next: more ? String(out[out.length - 1]!.id) : null };
}

/** A batch row with its member PRs as queue rows. */
export function toBatch(b: BatchRow & { prs: unknown[] }, prs: QueueRow[]): QueueBatch {
  return {
    id: b.id, repo: b.repo, branch: b.branch, fork: b.fork, state: b.state as BatchState, baseSha: b.base_sha, size: b.prs.length, prs,
    prNumber: b.pr_number, prUrl: b.pr_url, summary: b.summary, createdAt: b.created_at, updatedAt: b.updated_at,
  };
}
