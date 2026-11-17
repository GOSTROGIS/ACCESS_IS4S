// Merge holds: a held PR is reviewed and fixed as usual but does not merge, alone or in a batch, until released.
// Different from Backlog, which stops all work on the item. A hold of a closed or merged PR is ignored.
import type { DatabaseSync } from "node:sqlite";

/** Held PRs as `repo#number`, optionally of one repo. */
export function mergeHolds(db: DatabaseSync, repo?: string): Set<string> {
  const rows = db.prepare(`SELECT repo, number FROM main.merge_holds ${repo ? "WHERE repo = ?" : ""}`).all(...(repo ? [repo] : [])) as { repo: string; number: number }[];
  return new Set(rows.map((r) => `${r.repo}#${r.number}`));
}

export const mergeHeld = (db: DatabaseSync, repo: string, number: number): boolean =>
  db.prepare("SELECT 1 FROM main.merge_holds WHERE repo = ? AND number = ?").get(repo, number) !== undefined;
