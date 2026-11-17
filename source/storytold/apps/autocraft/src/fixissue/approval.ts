// Per-repo approval for the pipeline to open fix PRs for issues there (push to the pipeline fork, open a PR,
// comment on the issue). Set only from the dashboard by an operator (src/dash/api/admin.ts).
import type { DatabaseSync } from "node:sqlite";
import { audit } from "../dash/audit.ts";

export type FixIssueApproval = { by: string; at: string };
const key = (repo: string) => `fixissue_approved:${repo}`;

export function fixIssueApprovalOf(db: DatabaseSync, repo: string): FixIssueApproval | null {
  const row = db.prepare("SELECT value FROM main.settings WHERE key = ?").get(key(repo)) as { value: string } | undefined;
  if (!row) return null;
  try {
    return JSON.parse(row.value) as FixIssueApproval;
  } catch {
    return null;
  }
}

// Returns false when nothing changed.
export function setFixIssueApproval(db: DatabaseSync, by: string, repo: string, approved: boolean): boolean {
  if (!db.prepare("SELECT 1 FROM main.tracked_repos WHERE name = ?").get(repo)) throw new Error(`${repo} is not tracked`);
  if ((fixIssueApprovalOf(db, repo) !== null) === approved) return false;
  if (approved) db.prepare("INSERT INTO main.settings (key, value) VALUES (?, ?)").run(key(repo), JSON.stringify({ by, at: new Date().toISOString() }));
  else db.prepare("DELETE FROM main.settings WHERE key = ?").run(key(repo));
  audit(db, by, approved ? "fixissue-approve" : "fixissue-revoke", repo);
  return true;
}
