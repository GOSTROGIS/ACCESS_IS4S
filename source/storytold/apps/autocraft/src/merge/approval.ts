// Per-repo approval for the pipeline to merge pull requests there. Set only
// from the dashboard by an operator (src/dash/api/admin.ts). Tracked repos
// include ones we do not maintain, so merging is opt-in per repo.
import type { DatabaseSync } from "node:sqlite";
import { audit } from "../dash/audit.ts";

export type MergeApproval = { by: string; at: string };
const key = (repo: string) => `merge_approved:${repo}`;

export function mergeApprovalOf(db: DatabaseSync, repo: string): MergeApproval | null {
  const row = db.prepare("SELECT value FROM main.settings WHERE key = ?").get(key(repo)) as { value: string } | undefined;
  if (!row) return null;
  try {
    return JSON.parse(row.value) as MergeApproval;
  } catch {
    return null;
  }
}

// Returns false when nothing changed.
export function setMergeApproval(db: DatabaseSync, by: string, repo: string, approved: boolean): boolean {
  if (!db.prepare("SELECT 1 FROM main.tracked_repos WHERE name = ?").get(repo)) throw new Error(`${repo} is not tracked`);
  if ((mergeApprovalOf(db, repo) !== null) === approved) return false;
  if (approved) db.prepare("INSERT INTO main.settings (key, value) VALUES (?, ?)").run(key(repo), JSON.stringify({ by, at: new Date().toISOString() }));
  else db.prepare("DELETE FROM main.settings WHERE key = ?").run(key(repo));
  audit(db, by, approved ? "merge-approve" : "merge-revoke", repo);
  return true;
}
