// Per-repo approval to write labels to GitHub. Set only from the dashboard by an
// operator (src/dash/api/admin.ts); the CLI reads it and has no way to set it.
import type { DatabaseSync } from "node:sqlite";
import { audit } from "../dash/audit.ts";

export type Approval = { by: string; at: string };
const key = (repo: string) => `labels_approved:${repo}`;

export function approvalOf(db: DatabaseSync, repo: string): Approval | null {
  const row = db.prepare("SELECT value FROM main.settings WHERE key = ?").get(key(repo)) as { value: string } | undefined;
  if (!row) return null;
  try {
    return JSON.parse(row.value) as Approval;
  } catch {
    return null;
  }
}

// Returns false when nothing changed.
export function setApproval(db: DatabaseSync, by: string, repo: string, approved: boolean): boolean {
  if (!db.prepare("SELECT 1 FROM main.tracked_repos WHERE name = ?").get(repo)) throw new Error(`${repo} is not tracked`);
  const had = approvalOf(db, repo) !== null;
  if (had === approved) return false;
  if (approved) {
    db.prepare("INSERT INTO main.settings (key, value) VALUES (?, ?)").run(key(repo), JSON.stringify({ by, at: new Date().toISOString() }));
  } else {
    db.prepare("DELETE FROM main.settings WHERE key = ?").run(key(repo));
  }
  audit(db, by, approved ? "labels-approve" : "labels-revoke", repo);
  return true;
}
