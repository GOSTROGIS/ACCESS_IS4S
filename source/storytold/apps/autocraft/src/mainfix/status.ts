// What AutoCraft is doing about a red default branch, in words for the Main CI page. Read-only.
import type { DatabaseSync } from "node:sqlite";
import { mainFixApprovalOf } from "./approval.ts";

/** Shown first when a head has rows in several states: what needs a person comes before what is running. */
const ORDER = ["fix-failed", "needs-fix", "linting", "asked", "pr-opened", "rerun-requested", "issue-opened", "declined", "nothing-to-do", "rerun-passed"] as const;

const TEXT: Record<(typeof ORDER)[number], string> = {
  "fix-failed": "needs a person",
  "pr-opened": "opened fix PR",
  "needs-fix": "needs a fix",
  linting: "checking a fix",
  asked: "asked an operator",
  "rerun-requested": "rerunning failed jobs",
  "issue-opened": "opened an issue",
  declined: "nothing to do: infra",
  "nothing-to-do": "nothing to do",
  "rerun-passed": "rerun passed",
};

/** Null when the repo has no approval and nothing was done at this head. */
export function autocraftText(db: DatabaseSync, repo: string, headSha: string, state: string): string | null {
  const states = new Set((db.prepare("SELECT state FROM main_fixes WHERE repo = ? AND head_sha = ?").all(repo, headSha) as { state: string }[]).map((r) => r.state));
  const first = ORDER.find((s) => states.has(s));
  if (first === "pr-opened") {
    const n = (db.prepare("SELECT pr_number AS n FROM main_fixes WHERE repo = ? AND head_sha = ? AND state = 'pr-opened' AND pr_number IS NOT NULL ORDER BY pr_number LIMIT 1").get(repo, headSha) as { n: number } | undefined)?.n;
    return n ? `${TEXT[first]} #${n}` : TEXT[first];
  }
  if (first) return TEXT[first];
  return state === "red" && mainFixApprovalOf(db, repo) ? "reading the failure" : null;
}
