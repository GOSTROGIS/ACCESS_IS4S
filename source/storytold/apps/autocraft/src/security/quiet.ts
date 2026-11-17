// The quiet pull request of a security fix: opened by the Land step, in the pipeline's name, and kept free of anything that
// names the problem from the moment it opens until the advisory is published. One definition for every place that asks.
import { prep } from "../sql-cache.ts";
import type { DatabaseSync } from "node:sqlite";

/** SQL condition: the findings whose pull request is quiet (the quiet route has no fork). */
export const QUIET_FINDING_SQL = "state IN ('landing', 'landed') AND fork IS NULL AND fix_pr IS NOT NULL";

/** SQL condition on item expressions `repo` and `number`: the item is a quiet pull request. */
export const quietSqlFor = (repo: string, number: string): string =>
  `(EXISTS (SELECT 1 FROM main.security_findings qf WHERE qf.repo = ${repo} AND qf.fix_pr = ${number} AND qf.state IN ('landing', 'landed') AND qf.fork IS NULL)
    OR EXISTS (SELECT 1 FROM main.security_quiet_prs qp JOIN main.security_findings qg ON qg.repo = qp.repo AND qg.number = qp.finding WHERE qp.repo = ${repo} AND qp.pr = ${number} AND ${FORMER_OPEN_SQL}))`;

/** A closed quiet pull request stays quiet while its finding is neither published nor dismissed. */
const FORMER_OPEN_SQL = "qg.state NOT IN ('published', 'dismissed')";

/** Remembers that `pr` was the quiet pull request of a finding; call before the finding's fix_pr is cleared. */
export function rememberQuietPr(db: DatabaseSync, repo: string, finding: number, pr: number): void {
  db.prepare("INSERT OR IGNORE INTO main.security_quiet_prs (repo, pr, finding) VALUES (?, ?, ?)").run(repo, pr, finding);
}

/** Quiet pull requests as `repo#number`. */
export function quietFixPrs(db: DatabaseSync, repo?: string): Set<string> {
  const rows = db.prepare(`SELECT repo, fix_pr AS n FROM main.security_findings WHERE ${QUIET_FINDING_SQL}${repo ? " AND repo = ?" : ""}`).all(...(repo ? [repo] : [])) as { repo: string; n: number }[];
  const former = db.prepare(`SELECT qp.repo, qp.pr AS n FROM main.security_quiet_prs qp JOIN main.security_findings qg ON qg.repo = qp.repo AND qg.number = qp.finding WHERE ${FORMER_OPEN_SQL}${repo ? " AND qp.repo = ?" : ""}`).all(...(repo ? [repo] : [])) as { repo: string; n: number }[];
  return new Set([...rows, ...former].map((r) => `${r.repo}#${r.n}`));
}

/** True when `repo#number` is a quiet pull request. */
export const isQuiet = (db: DatabaseSync, repo: string, number: number): boolean =>
  !!prep(db, `SELECT 1 FROM main.security_findings WHERE repo = ? AND fix_pr = ? AND ${QUIET_FINDING_SQL} LIMIT 1`).get(repo, number) ||
  !!prep(db, `SELECT 1 FROM main.security_quiet_prs qp JOIN main.security_findings qg ON qg.repo = qp.repo AND qg.number = qp.finding WHERE qp.repo = ? AND qp.pr = ? AND ${FORMER_OPEN_SQL} LIMIT 1`).get(repo, number);
