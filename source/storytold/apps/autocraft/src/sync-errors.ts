// Per-repo sync failures: one repo that cannot be read is skipped for the run and recorded here; the health checks read the table.
import type { DatabaseSync } from "node:sqlite";

export type RepoErrorKind = "not-found" | "forbidden" | "transient" | "error";

/** Reads of a repo's error row, newest streak first. */
export type RepoError = { repo: string; kind: RepoErrorKind; message: string; movedTo: string | null; since: string; at: string };

/** The kind of a failed read: GraphQL type or HTTP status for GitHub errors, the class for a transient one. */
export function classifyFailure(e: unknown): RepoErrorKind {
  const err = e as { type?: string | null; status?: number; name?: string; constructor?: { name?: string } };
  if (err?.type === "NOT_FOUND" || err?.status === 404) return "not-found";
  if (err?.type === "FORBIDDEN" || err?.status === 403) return "forbidden";
  if (err?.constructor?.name === "Transient") return "transient";
  return "error";
}

const iso = (d: Date): string => d.toISOString().replace(/\.\d+Z$/, "Z");

/** Records that `repo` failed; the streak's `since` stays from the first failure of the same kind. */
export function recordRepoFailure(db: DatabaseSync, repo: string, e: unknown, movedTo: string | null = null, now: Date = new Date()): RepoErrorKind {
  const kind = classifyFailure(e);
  const message = String((e as Error)?.message ?? e).slice(0, 300);
  const at = iso(now);
  db.prepare(`INSERT INTO sync_repo_errors (repo, kind, message, moved_to, since, at) VALUES (?,?,?,?,?,?)
    ON CONFLICT(repo) DO UPDATE SET kind = excluded.kind, message = excluded.message, moved_to = excluded.moved_to, at = excluded.at,
      since = CASE WHEN sync_repo_errors.kind = excluded.kind THEN sync_repo_errors.since ELSE excluded.since END`).run(repo, kind, message, movedTo, at, at);
  return kind;
}

export function clearRepoFailure(db: DatabaseSync, repo: string): void {
  db.prepare("DELETE FROM sync_repo_errors WHERE repo = ?").run(repo);
}

/** Errors of repos that are still tracked. */
export function repoErrors(db: DatabaseSync): RepoError[] {
  return (db.prepare(`SELECT e.repo, e.kind, e.message, e.moved_to AS movedTo, e.since, e.at FROM sync_repo_errors e
    JOIN tracked_repos t ON t.name = e.repo ORDER BY e.since, e.repo`).all()) as RepoError[];
}
