// The write permission of a same-repo PR's author, from GitHub, cached per (repo, login) in author_permissions.
// Planning reads only the cache; the jobs that push refresh a missing or old entry first.
import type { DatabaseSync } from "node:sqlite";
import { PIPELINE_LOGIN_KEY } from "../core/rules.ts";
import { slugOf } from "../owners.ts";
import { gh } from "../review/diff.ts";
import { sameRepo } from "./pushable.ts";

export const AUTHOR_PERMISSION_TTL_MS = 24 * 3600_000;
const WRITE = new Set(["write", "maintain", "admin"]);
const KNOWN = new Set(["admin", "maintain", "write", "triage", "read", "none"]);

/** "yes" and "no" are known; "unknown" means the permission has not been read yet (a missing entry). */
export type AuthorWrite = "yes" | "no" | "unknown";

type Row = { author: string | null; author_type: string | null; author_id: number | null };
const authorOf = (db: DatabaseSync, repo: string, number: number): Row | undefined =>
  db.prepare("SELECT author, author_type, author_id FROM items WHERE repo = ? AND number = ?").get(repo, number) as Row | undefined;

/** The pipeline's own account and bots write to the repository by construction. */
function writesByRole(db: DatabaseSync, r: Row): boolean {
  if (r.author_type === "Bot") return true;
  const me = (db.prepare("SELECT value FROM main.settings WHERE key = ?").get(PIPELINE_LOGIN_KEY) as { value: string } | undefined)?.value;
  return !!me && !!r.author && me.toLowerCase() === r.author.toLowerCase();
}

type Cached = { permission: string | null; checked_at: string | null; failures: number; first_failure_at: string | null; author_id: number | null };
/** The cached entry of the PR's author; a permission read for another account under the login counts as never read. */
const cached = (db: DatabaseSync, repo: string, r: Row & { author: string }): Cached | undefined => {
  const c = db.prepare("SELECT permission, checked_at, failures, first_failure_at, author_id FROM main.author_permissions WHERE login = ? AND repo = ?").get(r.author, repo) as Cached | undefined;
  return c && c.permission && c.author_id !== null && r.author_id !== null && c.author_id !== r.author_id ? { ...c, permission: null, checked_at: null } : c;
};
const old = (at: string | null): boolean => !at || Date.now() - Date.parse(at) > AUTHOR_PERMISSION_TTL_MS;
/** The reads have failed too often or for too long. */
const gaveUp = (c: Cached): boolean => c.failures >= AUTHOR_READ_FAILURES || (!!c.first_failure_at && old(c.first_failure_at));

/** After this many failed reads, or this long since the first, an author never read counts as unable to write. */
export const AUTHOR_READ_FAILURES = 3;

/**
 * Database only: whether the PR's author can write to the repository, as last read. A stale entry still counts until it is refreshed,
 * but not once its refresh has failed too often or for too long.
 */
export function authorWrites(db: DatabaseSync, repo: string, number: number): AuthorWrite {
  const r = authorOf(db, repo, number);
  if (!r?.author) return "no";
  if (writesByRole(db, r)) return "yes";
  const c = cached(db, repo, { ...r, author: r.author });
  if (c?.permission) return old(c.checked_at) && gaveUp(c) ? "no" : WRITE.has(c.permission) ? "yes" : "no";
  // Never read: waiting, until the reads have failed too often or for too long; then the PR gets the normal cannot-push hold.
  return c && gaveUp(c) ? "no" : "unknown";
}

export type PermissionReader = (repo: string, login: string) => Promise<string | null>;

/** The login's permission on the repository from GitHub (a 404 is `none`); null when it cannot be told. */
export const ghPermission: PermissionReader = async (repo, login) => {
  const r = await gh(["api", `repos/${slugOf(repo)}/collaborators/${encodeURIComponent(login)}/permission`, "--jq", ".permission"]);
  if (r.code !== 0) return /HTTP 404|Not Found/i.test(r.err) ? "none" : null;
  const p = r.out.trim().toLowerCase();
  return KNOWN.has(p) ? p : null;
};

/**
 * For a job about to push: reads the author's permission from GitHub when it is missing or over a day old, stores it, and
 * answers like `authorWrites`. A PR whose head is in another repository needs no author permission. A failed read keeps an old
 * entry and is counted; without an entry the answer is "unknown" (the caller leaves the PR for a later run) until the reads
 * have failed three times or for a day.
 */
export async function ensureAuthorWrites(db: DatabaseSync, repo: string, number: number, headRepo: string | null | undefined, read: PermissionReader = ghPermission): Promise<AuthorWrite> {
  if (!sameRepo(headRepo, repo)) return "yes";
  const r = authorOf(db, repo, number);
  if (!r?.author) return "no";
  if (!writesByRole(db, r)) {
    const c = cached(db, repo, { ...r, author: r.author });
    if (!c?.permission || old(c.checked_at)) {
      const now = new Date().toISOString();
      const p = await read(repo, r.author).catch(() => null);
      if (p) db.prepare(`INSERT INTO main.author_permissions (login, repo, permission, checked_at, failures, first_failure_at, author_id) VALUES (?, ?, ?, ?, 0, NULL, ?)
        ON CONFLICT (login, repo) DO UPDATE SET permission = excluded.permission, checked_at = excluded.checked_at, failures = 0, first_failure_at = NULL, author_id = excluded.author_id`).run(r.author, repo, p, now, r.author_id);
      else db.prepare(`INSERT INTO main.author_permissions (login, repo, failures, first_failure_at) VALUES (?, ?, 1, ?)
        ON CONFLICT (login, repo) DO UPDATE SET failures = failures + 1, first_failure_at = COALESCE(first_failure_at, excluded.first_failure_at)`).run(r.author, repo, now);
    }
  }
  return authorWrites(db, repo, number);
}
