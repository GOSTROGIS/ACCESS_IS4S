// Whether a repo has upstream CI at all; shared by the merge queue, Verify and the database migration.
import type { DatabaseSync } from "node:sqlite";

/** Checks of the repo's most recent PRs that were read; a repo has no CI when none of them ever reported a check. */
export const NO_CI_SAMPLE = 20;
/** Whether any checks of the repo were read yet; before that, whether it has CI is unknown. */
export const repoChecksKnown = (db: DatabaseSync, repo: string): boolean => !!db.prepare("SELECT 1 FROM pr_checks WHERE repo = ? LIMIT 1").get(repo);
/** True when the repo has checks fetched for some PRs and none of the latest NO_CI_SAMPLE reported any. */
export function repoHasNoCi(db: DatabaseSync, repo: string): boolean {
  const rows = db.prepare("SELECT overall FROM pr_checks WHERE repo = ? ORDER BY fetched_at DESC LIMIT ?").all(repo, NO_CI_SAMPLE) as { overall: string | null }[];
  return rows.length > 0 && rows.every((r) => !r.overall || r.overall === "none");
}
