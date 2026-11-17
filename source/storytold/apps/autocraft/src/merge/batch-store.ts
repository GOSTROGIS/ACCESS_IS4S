// Tables and pure rules of the merge queue's integration batches (see batch.ts).
import type { DatabaseSync } from "node:sqlite";
import { filtered, hiddenJsonTest, type HiddenRepos } from "../hidden-sql.ts";
import { mergeApprovalOf as mergeApprovalOfSafe } from "./approval.ts";
import { TERMINAL, cancelTask, getTask } from "../build/tasks.ts";

export const BATCH_STATES = ["checking", "open", "merged", "failed", "split", "superseded"] as const;
export type BatchState = (typeof BATCH_STATES)[number];
/** States of a batch that is still being worked on. */
export const ACTIVE_BATCH: BatchState[] = ["checking", "open"];

/** Summary of a batch whose PR a person closed: its PRs stay out of batches until they change. */
/** Summary of a batch that failed because a maintainer requested changes on its PR: its members are held like those of a batch a person closed. */
export const BLOCKED_BY_REVIEW = "a maintainer requested changes on the batch PR";
export const CLOSED_BY_PERSON = "the batch PR was closed by a person";
/** Summary of a batch that failed because its branch could not be pushed or its PR opened 5 times: its PRs go back to the queue, not on hold. */
export const PUBLISH_FAILED = "could not open the batch PR";
export const MAX_PUBLISH_FAILURES = 5;
/** Wait before a batch whose push or PR creation failed is tried again: 1, 2, 4, 8 minutes, at most 30. */
export const publishDelayMs = (failures: number): number => (failures === 0 ? 0 : Math.min(60_000 * 2 ** (failures - 1), 30 * 60_000));
/** Wait before a batch's build task is queued again after a build-environment error: none for the first retry, then doubling from 5 minutes up to 30 minutes. */
export const retryDelayMs = (retries: number): number => (retries <= 0 ? 0 : Math.min(5 * 60_000 * 2 ** (retries - 1), 30 * 60_000));
/** Builds a batch's task may take, counting every try, before the batch PR opens without the build. */
export const MAX_BUILD_TRIES = 3;
/** How long a batch waits for its build task before the PR opens anyway. */
export const BUILD_MAX_MS = 3 * 3600_000;
/** Shown on a batch PR whose workflow runs wait for a maintainer's approval. */
export const RUNS_WAIT_NOTE = "batch PR runs wait for a maintainer's approval";

export const MAX_BATCH = 50;
/** A repo's batch size until its batches pass or fail. */
export const START_BATCH = 20;
/** Changed lines (additions plus deletions) a batch may carry, beyond its first PR. */
export const MAX_BATCH_LINES = 10_000;

export type BatchRow = {
  id: number; repo: string; branch: string; state: BatchState; base_sha: string; commit_sha: string; parent_id: number | null;
  task_id: number | null; retries: number; pr_number: number | null; pr_url: string | null; summary: string | null; created_at: string; updated_at: string;
  /** `<owner>/<repo>` the branch was pushed to; null before the push and on rows from before it was stored. */
  fork: string | null;
  /** The batch-build feature's state: null (never queued), pending, passed, failed or skipped. */
  build_state?: "pending" | "passed" | "failed" | "skipped" | null;
  /** Build tasks queued for the batch (the first, flake reruns and environment retries). */
  build_tries?: number;
  /** Merge commit of the batch PR; null until merged and on rows from before it was stored. */
  merge_sha?: string | null;
};
export type BatchMember = { number: number; head_oid: string };

const sizeKey = (repo: string) => `batch_size:${repo}`;

/** Most PRs the repo's next batch takes: grows by one after a passing batch, halves after a failed one. */
export function batchSizeOf(db: DatabaseSync, repo: string): number {
  const v = (db.prepare("SELECT value FROM main.settings WHERE key = ?").get(sizeKey(repo)) as { value: string } | undefined)?.value;
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 && n <= MAX_BATCH ? n : START_BATCH;
}
export function setBatchSize(db: DatabaseSync, repo: string, n: number): number {
  const size = Math.max(1, Math.min(MAX_BATCH, n));
  db.prepare("INSERT INTO main.settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value").run(sizeKey(repo), String(size));
  return size;
}
export const growBatchSize = (db: DatabaseSync, repo: string): number => setBatchSize(db, repo, batchSizeOf(db, repo) + 1);
export const shrinkBatchSize = (db: DatabaseSync, repo: string): number => setBatchSize(db, repo, Math.floor(batchSizeOf(db, repo) / 2));

export function membersOf(db: DatabaseSync, batchId: number): BatchMember[] {
  return db.prepare("SELECT number, head_oid FROM main.merge_batch_prs WHERE batch_id = ? ORDER BY position").all(batchId) as BatchMember[];
}

export function activeBatches(db: DatabaseSync, repo: string): BatchRow[] {
  return db.prepare(`SELECT * FROM main.merge_batches WHERE repo = ? AND state IN ('checking', 'open') ORDER BY id`).all(repo) as BatchRow[];
}

export function getBatch(db: DatabaseSync, id: number): BatchRow {
  return db.prepare("SELECT * FROM main.merge_batches WHERE id = ?").get(id) as BatchRow;
}

export function updateBatch(db: DatabaseSync, id: number, at: string, set: Partial<Pick<BatchRow, "state" | "task_id" | "retries" | "pr_number" | "pr_url" | "summary" | "fork" | "merge_sha" | "build_state" | "build_tries">>): void {
  const cols = Object.keys(set);
  db.prepare(`UPDATE main.merge_batches SET ${cols.map((c) => `${c} = ?`).join(", ")}${cols.length ? ", " : ""}updated_at = ? WHERE id = ?`)
    .run(...(Object.values(set) as (string | number | null)[]), at, id);
}

/** Cancels the build task of a batch that is ending before its build was read. */
export function cancelBuild(db: DatabaseSync, b: BatchRow, by: string): void {
  if (b.build_state !== "pending" || b.task_id === null) return;
  const t = getTask(db, b.task_id);
  if (t && !TERMINAL.includes(t.state)) cancelTask(db, t.id, by);
}

/** `integration-<repo>-<yyyymmdd>-<n>`, n counting the repo's batches of that day. */
export function nextBranch(db: DatabaseSync, repo: string, now: Date): string {
  const day = now.toISOString().slice(0, 10).replace(/-/g, "");
  const prefix = `integration-${repo}-${day}-`;
  const n = (db.prepare("SELECT COUNT(*) AS n FROM main.merge_batches WHERE repo = ? AND branch LIKE ?").get(repo, `${prefix}%`) as { n: number }).n;
  return `${prefix}${n + 1}`;
}

export function insertBatch(db: DatabaseSync, b: { repo: string; branch: string; baseSha: string; commitSha: string; parentId: number | null; taskId?: number | null; members: BatchMember[]; at: string }): number {
  const r = db.prepare("INSERT INTO main.merge_batches (repo, branch, state, base_sha, commit_sha, parent_id, task_id, created_at, updated_at) VALUES (?, ?, 'checking', ?, ?, ?, ?, ?, ?)")
    .run(b.repo, b.branch, b.baseSha, b.commitSha, b.parentId, b.taskId ?? null, b.at, b.at);
  const id = Number(r.lastInsertRowid);
  const ins = db.prepare("INSERT INTO main.merge_batch_prs (batch_id, number, head_oid, position) VALUES (?, ?, ?, ?)");
  b.members.forEach((m, i) => ins.run(id, m.number, m.head_oid, i));
  return id;
}

/** Whether the next candidate may join the PRs taken so far: up to `max` PRs and MAX_BATCH_LINES changed lines; an L-size PR goes alone. */
export function admits(taken: { size: string; lines: number }[], c: { size: string; lines: number }, max: number): boolean {
  if (taken.length === 0) return true;
  if (taken[0]!.size === "L" || taken.length >= max || c.size === "L") return false;
  return taken.reduce((a, t) => a + t.lines, 0) + c.lines <= MAX_BATCH_LINES;
}

/** Queue state each PR head in an active or failed batch is in: `repo#number@head` → batch-checking | in-batch | batch-failed. */
export function batchStates(db: DatabaseSync, repo?: string): Map<string, "batch-checking" | "in-batch" | "batch-failed"> {
  const rows = db.prepare(`SELECT b.repo, p.number, p.head_oid, b.state, b.summary, (SELECT COUNT(*) FROM main.merge_batch_prs q WHERE q.batch_id = b.id) AS n
    FROM main.merge_batch_prs p JOIN main.merge_batches b ON b.id = p.batch_id
    WHERE b.state IN ('checking', 'open', 'failed') ${repo ? "AND b.repo = ?" : ""} ORDER BY b.id`).all(...(repo ? [repo] : [])) as { repo: string; number: number; head_oid: string; state: string; summary: string | null; n: number }[];
  const out = new Map<string, "batch-checking" | "in-batch" | "batch-failed">();
  for (const r of rows) {
    if (r.state === "failed" && r.summary?.startsWith(PUBLISH_FAILED)) continue;
    if (r.state === "failed" && r.n !== 1 && r.summary !== CLOSED_BY_PERSON && r.summary !== BLOCKED_BY_REVIEW) continue;
    out.set(`${r.repo}#${r.number}@${r.head_oid}`, r.state === "checking" ? "batch-checking" : r.state === "open" ? "in-batch" : "batch-failed");
  }
  return out;
}

/** Repos with a batch that has something to do: a batch PR to watch, or a batch still to be pushed whose retry wait is over. */
export function batchesDue(db: DatabaseSync, now = new Date()): string[] {
  const rows = db.prepare(`SELECT repo, state, pr_number, retries, updated_at FROM main.merge_batches WHERE state IN ('open', 'checking')`).all() as
    { repo: string; state: string; pr_number: number | null; retries: number; updated_at: string }[];
  const due = new Set(rows.filter((b) => b.state === "open" || now.getTime() - Date.parse(b.updated_at) >= publishDelayMs(b.retries)).map((b) => b.repo));
  return [...due].filter((r) => mergeApprovalOfSafe(db, r));
}

/** One page of batches, newest first (ids below `before`), with their members in order: two queries, whatever the page size. */
export function pageBatches(db: DatabaseSync, o: { repo?: string; hidden?: HiddenRepos; before?: number; limit: number }): { batches: (BatchRow & { prs: BatchMember[] })[]; total: number; more: boolean } {
  const where: string[] = [];
  const params: (string | number)[] = [];
  if (o.repo) { where.push("repo = ?"); params.push(o.repo); }
  // A list from the dashboard's `hiddenRepos` allows only its visible repos, so batches of untracked repos stay out too.
  if (o.hidden && filtered(o.hidden)) { const h = hiddenJsonTest("repo", o.hidden); where.push(`NOT (${h.sql})`); params.push(h.arg); }
  const filter = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const total = (db.prepare(`SELECT COUNT(*) AS n FROM main.merge_batches ${filter}`).get(...params) as { n: number }).n;
  const paged = o.before === undefined ? filter : `${filter ? `${filter} AND` : "WHERE"} id < ?`;
  const rows = db.prepare(`SELECT * FROM main.merge_batches ${paged} ORDER BY id DESC LIMIT ?`).all(...params, ...(o.before === undefined ? [] : [o.before]), o.limit + 1) as BatchRow[];
  const page = rows.slice(0, o.limit);
  const members = new Map<number, BatchMember[]>();
  if (page.length) {
    const ms = db.prepare(`SELECT batch_id, number, head_oid FROM main.merge_batch_prs WHERE batch_id IN (SELECT value FROM json_each(?)) ORDER BY batch_id, position`)
      .all(JSON.stringify(page.map((b) => b.id))) as { batch_id: number; number: number; head_oid: string }[];
    for (const m of ms) (members.get(m.batch_id) ?? members.set(m.batch_id, []).get(m.batch_id)!).push({ number: m.number, head_oid: m.head_oid });
  }
  // Rows from before the fork was stored: the push is in the audit log.
  const unknown = page.filter((b) => !b.fork && b.state !== "checking");
  const forks = new Map<string, string>();
  if (unknown.length) {
    const as = db.prepare(`SELECT target, details FROM main.audit WHERE action = 'batch-push' AND target IN (SELECT value FROM json_each(?)) ORDER BY at, rowid`)
      .all(JSON.stringify(unknown.map((b) => `${b.repo}:${b.branch}`))) as { target: string; details: string | null }[];
    for (const a of as) {
      try { const f = (JSON.parse(a.details ?? "{}") as { fork?: unknown }).fork; if (typeof f === "string" && f) forks.set(a.target, f); } catch { /* not JSON */ }
    }
  }
  return {
    batches: page.map((b) => ({ ...b, fork: b.fork ?? forks.get(`${b.repo}:${b.branch}`) ?? null, prs: members.get(b.id) ?? [] })),
    total, more: rows.length > o.limit,
  };
}
