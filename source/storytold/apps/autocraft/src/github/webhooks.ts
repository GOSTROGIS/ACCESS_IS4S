// GitHub App webhooks. A delivery is verified, reduced to the repo and item number it names, and queued; the
// runner re-reads those items from GitHub. Nothing else in the payload is stored or read, and none of it reaches a prompt.
import { createHmac } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { ONE_QUERY, Transient, writeItemNode, type Querier } from "../mirror.ts";
import { ownerOf } from "../owners.ts";

export const WEBHOOK_PATH = "/webhooks/github";
export const WEBHOOK_BODY_LIMIT = 1024 * 1024;

export function signatureOf(secret: string, raw: Buffer | string): string {
  return `sha256=${createHmac("sha256", secret).update(raw).digest("hex")}`;
}

export type ItemRefOnly = { repo: string; number: number };

const num = (v: unknown): number | null => (typeof v === "number" && Number.isInteger(v) && v > 0 ? v : null);
type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : {});

/** The tracked repo name for a payload's `owner/name`, or null when AutoCraft does not track it. */
function trackedName(db: DatabaseSync, payload: Obj): string | null {
  const full = obj(payload.repository).full_name;
  if (typeof full !== "string") return null;
  const i = full.indexOf("/");
  if (i < 1) return null;
  const owner = full.slice(0, i);
  const name = full.slice(i + 1);
  if (!db.prepare("SELECT 1 FROM main.tracked_repos WHERE name = ?").get(name)) return null;
  return ownerOf(name).toLowerCase() === owner.toLowerCase() ? name : null;
}

/**
 * The item numbers an event names. A completed check suite counts and names the pull requests of its head;
 * GitHub lists none for a fork's pull request, so the head commit is matched to this repository's open pull requests.
 */
export function itemNumbers(db: DatabaseSync, repo: string, event: string, payload: Obj): number[] {
  const one = (v: unknown): number[] => [num(v)].filter((n): n is number => n !== null);
  switch (event) {
    case "issues":
    case "issue_comment": return one(obj(payload.issue).number);
    case "pull_request":
    case "pull_request_review":
    case "pull_request_review_comment": return one(obj(payload.pull_request).number);
    case "check_suite": {
      const body = obj(payload.check_suite);
      if (payload.action !== "completed") return [];
      const repoId = obj(payload.repository).id;
      const listed = Array.isArray(body.pull_requests) ? body.pull_requests : [];
      const own = listed.filter((p) => repoId !== undefined && obj(obj(obj(p).base).repo).id === repoId).flatMap((p) => one(obj(p).number));
      if (own.length || listed.length) return own;
      const sha = body.head_sha;
      if (typeof sha !== "string" || !sha) return [];
      return (db.prepare("SELECT number FROM main.items WHERE repo = ? AND kind = 'pr' AND state = 'OPEN' AND head_oid = ?").all(repo, sha) as { number: number }[]).map((r) => r.number);
    }
    default: return [];
  }
}

/** Queues the items one delivery names, one row per item. Returns how many were queued. */
export function queueDelivery(db: DatabaseSync, event: string, payload: unknown, now: Date = new Date()): number {
  const p = obj(payload);
  const repo = trackedName(db, p);
  if (!repo) return 0;
  const numbers = itemNumbers(db, repo, event, p);
  if (!numbers.length) return 0;
  const at = now.toISOString().replace(/\.\d+Z$/, "Z");
  const ins = db.prepare(`INSERT INTO main.sync_requests (repo, number, event, requested_at) VALUES (?, ?, ?, ?)
    ON CONFLICT (repo, number) DO UPDATE SET event = excluded.event, requested_at = excluded.requested_at`);
  for (const n of numbers) ins.run(repo, n, event, at);
  return numbers.length;
}

export type Verdict = { status: number; queued?: number };

/** One delivery: verifies the signature over the raw body, then queues. Never throws on bad input. */
export function handleDelivery(db: DatabaseSync, secret: string | null, headers: { signature?: string; event?: string }, raw: Buffer, safeEqual: (a: string, b: string) => boolean): Verdict {
  if (!secret) return { status: 401 };
  if (!headers.signature || !safeEqual(headers.signature, signatureOf(secret, raw))) return { status: 401 };
  const event = headers.event ?? "";
  if (event === "ping") return { status: 200 };
  let payload: unknown;
  try {
    payload = JSON.parse(raw.toString("utf8"));
  } catch {
    return { status: 400 };
  }
  return { status: 202, queued: queueDelivery(db, event, payload) };
}

/** Requests older than this are dropped: the poll has read the item since. */
const ABANDON_MS = 6 * 3600_000;

/**
 * Re-reads the queued items from GitHub, oldest request first, with the writer the sync uses. A failed
 * read leaves the request for the next drain until it is old; the regular poll covers it either way.
 * Stops at the first rate-limit or transport failure.
 */
export async function drainSyncRequests(db: DatabaseSync, client: Querier, opts: { limit?: number; reserve?: number; now?: Date; log?: (l: string) => void } = {}): Promise<number> {
  const now = opts.now ?? new Date();
  const rows = db.prepare("SELECT repo, number, requested_at FROM main.sync_requests ORDER BY requested_at LIMIT ?").all(opts.limit ?? 20) as { repo: string; number: number; requested_at: string }[];
  let done = 0;
  for (const r of rows) {
    // Arrived after this row was read: left for the next drain.
    const gone = (): void => void db.prepare("DELETE FROM main.sync_requests WHERE repo = ? AND number = ? AND requested_at = ?").run(r.repo, r.number, r.requested_at);
    if (now.getTime() - Date.parse(r.requested_at) > ABANDON_MS) { gone(); continue; }
    // Never wait out a rate limit here; the poll has its own handling.
    if (client.remaining !== null && client.remaining < (opts.reserve ?? 1000)) break;
    try {
      const data = await client.query(ONE_QUERY, { owner: ownerOf(r.repo), name: r.repo, number: r.number });
      if (!writeItemNode(db, r.repo, data.repository?.issueOrPullRequest)) { gone(); continue; }
      gone();
      done++;
    } catch (e) {
      opts.log?.(`webhook re-read ${r.repo}#${r.number}: ${String((e as Error)?.message ?? e).slice(0, 120)}`);
      // A read that fails for another reason would stay first in line and starve the rest; the poll covers it.
      if (e instanceof Transient) break;
      gone();
    }
  }
  return done;
}
