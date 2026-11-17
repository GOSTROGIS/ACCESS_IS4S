// The post-merge review of a merged PR as the item page shows it.
import type { DatabaseSync } from "node:sqlite";
import type { ItemPostmerge, PostmergeEarlier, PostmergeFiling, PostmergeFinding } from "../../../web/src/api/types.ts";
import { followupsOf, heldReason, reviewOf, type Followup } from "../../postmerge/select.ts";
import { itemState } from "./decisions.ts";

/** `staff`: operators and maintainers, who also read which stage missed a finding and why. */
export function postmergeOf(db: DatabaseSync, repo: string, n: number, staff: boolean): ItemPostmerge | null {
  const r = reviewOf(db, repo, n);
  if (!r) return null;
  const all = followupsOf(db, repo, n);
  const follow = all.filter((f) => f.review_at === r.at);
  const issueOf = db.prepare("SELECT state, title FROM items WHERE repo = ? AND number = ?");
  const filedIssue = (row: Followup) => {
    const it = issueOf.get(repo, row.issue_number) as { state: string; title: string | null } | undefined;
    return { number: row.issue_number!, url: row.url, state: it ? itemState(it.state) : null, title: it?.title ?? row.title };
  };
  const held = heldReason(db, repo, n, r.at);
  const findings = r.findings.map((f, i): PostmergeFinding => {
    const row = follow.find((x) => x.finding === i);
    let filing: PostmergeFiling;
    if (row?.state === "filed" && row.issue_number !== null) filing = { state: "filed", issue: filedIssue(row) };
    else if (row?.state === "filing") filing = { state: "unknown" };
    else if (f.severity === "minor") filing = { state: "minor" };
    else if (row?.state === "skipped-duplicate" || f.duplicate_of !== null) filing = { state: "duplicate", duplicateOf: row?.duplicate_of ?? f.duplicate_of! };
    else if (row?.state === "skipped-stale") filing = { state: "stale" };
    else if (row?.state === "skipped-text") filing = { state: "refused" };
    else if (row?.state === "failed") filing = { state: "failed", attempts: row.attempts };
    else if (held) filing = { state: "held", reason: held };
    else filing = row?.state === "skipped-limit" ? { state: "limit" } : { state: "pending" };
    return {
      severity: f.severity, title: f.title, body: f.body, file: f.file, line: f.line, filing,
      ...(staff ? { missedBy: f.missed_by || null, missedWhy: f.missed_why || null } : {}),
    };
  });
  // Follow-ups of earlier reviews of the PR (`--again` replaces the review): a filed issue never shows as not filed.
  const earlier = all.filter((f) => f.review_at !== r.at && (f.state === "filed" || f.state === "filing")).map((f): PostmergeEarlier =>
    f.state === "filed" && f.issue_number !== null ? { state: "filed", title: f.title, issue: filedIssue(f) } : { state: "unknown", title: f.title });
  return { at: r.at, model: r.model, mergeSha: r.merge_sha, error: r.error ? r.error.replace(/^(retry|held):\s*/, "") : null, findings, earlier };
}
