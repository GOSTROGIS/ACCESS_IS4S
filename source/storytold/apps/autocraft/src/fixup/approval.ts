// Per-repo approval for the pipeline to push fix-up commits to contributors'
// branches there. Set only from the dashboard by an operator
// (src/dash/api/admin.ts); pushing is opt-in per repo like merging.
import type { DatabaseSync } from "node:sqlite";
import { audit } from "../dash/audit.ts";

export type PushApproval = { by: string; at: string };
const key = (repo: string) => `push_approved:${repo}`;

export function pushApprovalOf(db: DatabaseSync, repo: string): PushApproval | null {
  const row = db.prepare("SELECT value FROM main.settings WHERE key = ?").get(key(repo)) as { value: string } | undefined;
  if (!row) return null;
  try {
    return JSON.parse(row.value) as PushApproval;
  } catch {
    return null;
  }
}

// Returns false when nothing changed.
export function setPushApproval(db: DatabaseSync, by: string, repo: string, approved: boolean): boolean {
  if (!db.prepare("SELECT 1 FROM main.tracked_repos WHERE name = ?").get(repo)) throw new Error(`${repo} is not tracked`);
  if ((pushApprovalOf(db, repo) !== null) === approved) return false;
  if (approved) db.prepare("INSERT INTO main.settings (key, value) VALUES (?, ?)").run(key(repo), JSON.stringify({ by, at: new Date().toISOString() }));
  else db.prepare("DELETE FROM main.settings WHERE key = ?").run(key(repo));
  audit(db, by, approved ? "push-approve" : "push-revoke", repo);
  return true;
}
