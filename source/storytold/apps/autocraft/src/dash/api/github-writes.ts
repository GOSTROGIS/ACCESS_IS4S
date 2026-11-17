// AutoCraft's GitHub writes on one item, read from the audit table and joined to the comments and commits they made.
// Plain rows only: the item page API maps them to its own shapes.
import type { DatabaseSync } from "node:sqlite";
import { GITHUB_ACTIONS } from "../../github/actions.ts";
import { ownLogins } from "../../github/identity.ts";

/** A comment written before its URL was recorded matches by time within this window. */
export const MATCH_WINDOW_MS = 120_000;

export type WriteRow = {
  rowid: number;
  at: string;
  action: string;
  /** `started` (outcome unknown), `done` or `failed`. */
  state: string;
  identity: string | null;
  url: string | null;
  review: string | null;
  head: string | null;
  sha: string | null;
  labels: string[];
  jobId: number | null;
  error: string | null;
  /** The mirrored comment or review this write made, when one is found. */
  comment: { id: string; kind: string; url: string | null; created_at: string; author: string | null } | null;
};

type AuditRow = { rowid: number; at: string; action: string; details: string | null };
type CommentRow = { id: string; kind: string; url: string | null; created_at: string; author: string | null };

const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);

/** The writes AutoCraft made on `repo#number`, oldest first. */
export function writesOf(db: DatabaseSync, repo: string, number: number): WriteRow[] {
  const actions = Object.keys(GITHUB_ACTIONS);
  const audit = db.prepare(`SELECT rowid, at, action, details FROM audit WHERE target = ? AND action IN (${actions.map(() => "?").join(",")}) ORDER BY at, rowid`)
    .all(`${repo}#${number}`, ...actions) as AuditRow[];
  const comments = db.prepare("SELECT id, kind, url, created_at, author FROM comments WHERE repo = ? AND number = ?").all(repo, number) as CommentRow[];
  const taken = new Set<string>();
  const byUrl = new Map(comments.filter((c) => c.url).map((c) => [c.url!, c]));
  const byId = new Map(comments.map((c) => [c.id, c]));
  const out: WriteRow[] = audit.map((a) => {
    const d = JSON.parse(a.details ?? "{}") as Record<string, unknown>;
    const url = str(d.url);
    const review = str(d.review);
    const row: WriteRow = {
      rowid: a.rowid, at: a.at, action: a.action, state: str(d.state) ?? "started", identity: str(d.identity), url, review,
      head: str(d.head), sha: str(d.commit) ?? str(d.sha), labels: Array.isArray(d.labels) ? d.labels.filter((x): x is string => typeof x === "string") : [],
      jobId: typeof d.jobId === "number" ? d.jobId : null, error: str(d.error), comment: null,
    };
    const hit = (url ? byUrl.get(url) : undefined) ?? (review ? byId.get(review) : undefined);
    if (hit) { row.comment = hit; taken.add(hit.id); }
    return row;
  });
  // Fallback for rows without a URL (crash-time rows, rows from before URLs were recorded): the nearest comment of the same kind
  // inside the window that no write of this item claimed and that the account the write used wrote.
  const ours = ownLogins(db, repo);
  for (const row of out) {
    if (row.comment || row.state === "failed" || row.action.endsWith("-edit") || !/comment|review-post/.test(row.action)) continue;
    const by = row.identity?.startsWith("user:") ? new Set([row.identity.slice(5)]) : ours;
    const kind = row.action === "review-post" ? "review" : "comment";
    const t = Date.parse(row.at);
    let best: CommentRow | null = null;
    for (const c of comments) {
      if (taken.has(c.id) || c.kind !== kind || !c.author || !by.has(c.author)) continue;
      const dt = Math.abs(Date.parse(c.created_at) - t);
      if (dt <= MATCH_WINDOW_MS && (!best || dt < Math.abs(Date.parse(best.created_at) - t))) best = c;
    }
    if (best) { row.comment = best; taken.add(best.id); }
  }
  return out;
}

/** Whether AutoCraft pushed this commit to the item: an audit push row on it recorded the oid as its `commit`. */
export function pushedByAutoCraft(db: DatabaseSync, repo: string, number: number, oid: string): boolean {
  return db.prepare("SELECT 1 FROM audit WHERE target = ?2 AND action LIKE '%-push' AND json_extract(details, '$.state') = 'done' AND (json_extract(details, '$.commit') = ?1 OR json_extract(details, '$.sha') = ?1) LIMIT 1").get(oid, `${repo}#${number}`) !== undefined;
}
