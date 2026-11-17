// Per-item GitHub detail for the item trace and the item page: a PR's changed files and commits, and the label and
// force-push events of issues and PRs. One query per item, read when the item's head or update time differs from
// the last read; the item list sync and the checks poll do not carry it.
import type { DatabaseSync } from "node:sqlite";
import type { Querier } from "./mirror.ts";
import { ownerOf } from "./owners.ts";
// Local, as in mirror.ts: importing it from review/checks.ts closes an import cycle through mirror.ts.

/** Items read per sync pass; a backlog drains over several passes. */
export const ACTIVITY_PER_PASS = 20;
/** Each read is a blocking call under the sync lock, so a pass stops starting reads after this long. */
export const ACTIVITY_PASS_MS = 15_000;
/** An item whose read failed is not read again before this long. */
const RETRY_AFTER_MS = 3_600_000;
/** Closed and merged items older than this are not read. */
export const ACTIVITY_WINDOW_MS = 14 * 86_400_000;
/** The sync leaves this many points for its other work. */
const ACTIVITY_MIN_REMAINING = 2000;
/** Files and commits per query; the same cap the other per-PR reads use. */
const CAP = 100;

export const ACTIVITY_QUERY = `
query($owner: String!, $name: String!, $number: Int!) {
  rateLimit { cost remaining resetAt }
  repository(owner: $owner, name: $name) {
    issueOrPullRequest(number: $number) {
      __typename
      ... on Issue {
        issueTimeline: timelineItems(last: 100, itemTypes: [LABELED_EVENT, UNLABELED_EVENT]) { nodes { __typename ... on LabeledEvent { id createdAt actor { login } label { name } } ... on UnlabeledEvent { id createdAt actor { login } label { name } } } }
      }
      ... on PullRequest {
        headRefOid
        files(first: 100) { nodes { path additions deletions changeType } }
        commits(last: 100) { nodes { commit { oid messageHeadline committedDate author { user { login } } } } }
        prTimeline: timelineItems(last: 100, itemTypes: [LABELED_EVENT, UNLABELED_EVENT, HEAD_REF_FORCE_PUSHED_EVENT]) {
          nodes { __typename ... on LabeledEvent { id createdAt actor { login } label { name } } ... on UnlabeledEvent { id createdAt actor { login } label { name } } ... on HeadRefForcePushedEvent { id createdAt actor { login } beforeCommit { oid } afterCommit { oid } } }
        }
      }
    }
  }
}`;

type Node = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export function saveActivity(db: DatabaseSync, repo: string, number: number, node: Node, item: { head: string | null; updated_at: string | null }, at: string): void {
  db.exec("BEGIN IMMEDIATE");
  try {
    const events: Node[] = (node.prTimeline ?? node.issueTimeline)?.nodes ?? [];
    const insEvent = db.prepare("INSERT OR REPLACE INTO item_activity (repo, number, id, kind, at, actor, label, before_oid, after_oid) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)");
    for (const e of events) {
      if (!e?.id) continue;
      const kind = e.__typename === "LabeledEvent" ? "labeled" : e.__typename === "UnlabeledEvent" ? "unlabeled" : e.__typename === "HeadRefForcePushedEvent" ? "force-push" : null;
      if (kind) insEvent.run(repo, number, e.id, kind, e.createdAt, e.actor?.login ?? null, e.label?.name ?? null, e.beforeCommit?.oid ?? null, e.afterCommit?.oid ?? null);
    }
    if (node.__typename === "PullRequest") {
      const head = node.headRefOid as string;
      db.prepare("DELETE FROM pr_files WHERE repo = ? AND number = ?").run(repo, number);
      const insFile = db.prepare("INSERT OR REPLACE INTO pr_files (repo, number, head, path, additions, deletions, change_type) VALUES (?, ?, ?, ?, ?, ?, ?)");
      for (const f of node.files?.nodes ?? []) if (f?.path) insFile.run(repo, number, head, f.path, f.additions ?? 0, f.deletions ?? 0, f.changeType ?? "CHANGED");
      const insCommit = db.prepare(`INSERT INTO pr_commits (repo, number, oid, committed_at, author, first_seen_at, message) VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT (repo, number, oid) DO UPDATE SET committed_at = excluded.committed_at, author = excluded.author, message = COALESCE(excluded.message, message)`);
      for (const c of node.commits?.nodes ?? []) if (c?.commit?.oid) insCommit.run(repo, number, c.commit.oid, c.commit.committedDate, c.commit.author?.user?.login ?? null, at, c.commit.messageHeadline ?? null);
    }
    db.prepare("INSERT OR REPLACE INTO activity_sync (repo, number, head, updated_at, read_at) VALUES (?, ?, ?, ?, ?)").run(repo, number, item.head, item.updated_at, at);
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}

/** Records the attempt, so the item waits for its next change or the retry time instead of heading every pass. */
function saveSyncState(db: DatabaseSync, it: { repo: string; number: number; head: string | null; updated_at: string | null }, at: string, error: string | null, retryAt: string | null): void {
  db.prepare("INSERT OR REPLACE INTO activity_sync (repo, number, head, updated_at, read_at, error, retry_at) VALUES (?, ?, ?, ?, ?, ?, ?)").run(it.repo, it.number, it.head, it.updated_at, at, error, retryAt);
}

/**
 * Reads the items whose head or update time moved since their last read, newest update first, and the ones whose read failed once their
 * retry time passed. A failed or missing item does not stop the pass. Returns how many it read.
 */
export async function syncActivity(db: DatabaseSync, client: Querier, now: Date = new Date()): Promise<number> {
  const since = new Date(now.getTime() - ACTIVITY_WINDOW_MS).toISOString();
  const due = db.prepare(`SELECT i.repo, i.number, i.head_oid AS head, i.updated_at FROM items i
    JOIN tracked_repos t ON t.name = i.repo LEFT JOIN activity_sync s ON s.repo = i.repo AND s.number = i.number
    WHERE (i.state = 'OPEN' OR i.updated_at >= ?)
      AND (s.repo IS NULL OR s.head IS NOT i.head_oid OR s.updated_at IS NOT i.updated_at OR (s.retry_at IS NOT NULL AND s.retry_at <= ?))
    ORDER BY i.updated_at DESC LIMIT ?`).all(since, now.toISOString(), ACTIVITY_PER_PASS) as { repo: string; number: number; head: string | null; updated_at: string | null }[];
  const started = Date.now();
  let read = 0;
  for (const it of due) {
    if (client.remaining !== null && client.remaining < ACTIVITY_MIN_REMAINING) break;
    if (read > 0 && Date.now() - started > ACTIVITY_PASS_MS) break;
    try {
      const node = ((await client.query(ACTIVITY_QUERY, { owner: ownerOf(it.repo), name: it.repo, number: it.number })) as Node).repository?.issueOrPullRequest;
      // A deleted or transferred item has no node; the attempt is still recorded.
      if (node) saveActivity(db, it.repo, it.number, node, it, now.toISOString());
      else saveSyncState(db, it, now.toISOString(), null, null);
    } catch (e) {
      const msg = String((e as Error)?.message ?? e);
      // The limit applies to every item; the caller logs it and the next pass starts again.
      if (/rate limit/i.test(msg)) throw e;
      saveSyncState(db, it, now.toISOString(), msg.slice(0, 200), new Date(now.getTime() + RETRY_AFTER_MS).toISOString());
    }
    read++;
  }
  return read;
}
