// Per-repo approval for the pipeline to act on a red default branch: rerun the failed jobs, and open an issue
// when an operator answered a decision that asks for it. Set only from the dashboard by an operator (src/dash/api/admin.ts).
import type { DatabaseSync } from "node:sqlite";
import { audit } from "../dash/audit.ts";

export type MainFixApproval = { by: string; at: string };
const key = (repo: string) => `mainfix_approved:${repo}`;

export function mainFixApprovalOf(db: DatabaseSync, repo: string): MainFixApproval | null {
  const row = db.prepare("SELECT value FROM main.settings WHERE key = ?").get(key(repo)) as { value: string } | undefined;
  if (!row) return null;
  try {
    return JSON.parse(row.value) as MainFixApproval;
  } catch {
    return null;
  }
}

// Returns false when nothing changed.
export function setMainFixApproval(db: DatabaseSync, by: string, repo: string, approved: boolean): boolean {
  if (!db.prepare("SELECT 1 FROM main.tracked_repos WHERE name = ?").get(repo)) throw new Error(`${repo} is not tracked`);
  if ((mainFixApprovalOf(db, repo) !== null) === approved) return false;
  if (approved) db.prepare("INSERT INTO main.settings (key, value) VALUES (?, ?)").run(key(repo), JSON.stringify({ by, at: new Date().toISOString() }));
  else db.prepare("DELETE FROM main.settings WHERE key = ?").run(key(repo));
  audit(db, by, approved ? "mainfix-approve" : "mainfix-revoke", repo);
  return true;
}
