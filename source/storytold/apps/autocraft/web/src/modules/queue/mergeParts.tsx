// Parts of the merge queue: state labels and chips, Verify labels, why a PR waits, its decision link, and the batch header facts.
import { Link } from "react-router-dom";
import type { BatchState, QueueBatch, QueueRow, QueueState, Tier } from "../../api/types";
import { Badge, type Tone } from "../../ui/atoms/Badge";
import { ItemRef } from "../../ui/molecules/ItemRef";
import { cn } from "../../ui/cn";
import { when } from "../../lib/format";
import { TimeAgo } from "../../ui/atoms/TimeAgo";
import { useNow } from "../../lib/useNow";
import { batchPath, decisionPath, repoSlug } from "../../lib/links";

export const STATE: Record<QueueState, [string, Tone, string]> = {
  ready: ["Ready", "ok", "Covered by the merge rule; merges on the next run"],
  "decision-answered-merge": ["Merge approved", "ok", "The operator answered merge at this head; merges on the next run"],
  refused: ["Refused", "bad", "The merge command or a pre-merge check said no; tried again next run"],
  "waiting-ci": ["Waiting for CI", "neutral", "CI is pending or hasn't run, or GitHub is still checking mergeability"],
  "waiting-main-ci": ["Waiting: main CI red", "neutral", "The repo's default branch fails CI; ready PRs wait until main is green"],
  "ci-failed": ["CI failed", "bad", "CI fails at this head"],
  conflict: ["Conflict", "bad", "Conflicts with the base branch"],
  "needs-fix-up": ["Needs fix-up", "warn", "The review lists small fixes; a later step makes them"],
  "waiting-premerge": ["Waiting for the pre-merge review", "neutral", "The merge rule covers it; an adversarial review of the head commit runs before it merges"],
  "waiting-verify": ["Waiting for Verify", "neutral", "No passed verification at this head yet: the build tasks are planned or running"],
  "verify-failed": ["Verify failed", "bad", "The build or tests failed at this head"],
  "verify-error": ["Verify error", "warn", "Verification could not run; it is retried once, then held"],
  "needs-decision": ["Needs a decision", "warn", "Outside the merge rule (size, label, author, not verified or no CI): waits for the operator's Merge? answer"],
  declined: ["Declined", "neutral", "The operator answered hold or close"],
  merged: ["Merged", "merged", "Merged"],
  "batch-checking": ["In batch: checking", "neutral", "Part of an integration batch whose combined tree is being built and tested in the sandbox"],
  "in-batch": ["In batch", "ok", "Part of an integration batch with an open PR; lands when upstream CI is green"],
  "batch-failed": ["Batch failed", "bad", "Failed alone in a batch: on hold until the PR has a new head"],
  "held-duplicate": ["Held: Duplicate?", "warn", "An open Duplicate? decision keeps it out of every later stage; answer it in Decisions"],
  "held-backlog": ["Backlog", "neutral", "Answered Backlog; reopen the decision to take it up again"],
  "ci-approval": ["CI: waiting for run approval", "warn", "GitHub holds the workflow runs for a maintainer's approval; the pipeline approves them when the repo allows it"],
  "changes-requested": ["Changes requested", "bad", "A maintainer's changes-requested review stands; it waits for that reviewer to approve or for a maintainer to dismiss it"],
};
export const TIER: Record<Tier, string> = { whitelisted: "whitelisted", not: "not whitelisted", "override-allow": "override allow", "override-deny": "override deny" };
export const CI_TONE: Record<QueueRow["ci"], Tone> = { success: "ok", failure: "bad", pending: "warn", none: "neutral", unknown: "neutral" };
export const MERGEABLE: Record<QueueRow["mergeable"], [string, Tone]> = { clean: ["clean", "ok"], conflicts: ["conflicts", "bad"], unknown: ["unknown", "neutral"] };

export const gh = (path: string) => `https://github.com/${path}`;
export const extLink = "text-accent-ink hover:underline";

export const BATCH_STATE: Record<BatchState, [string, Tone]> = {
  checking: ["Checking", "neutral"], open: ["PR open", "ok"], merged: ["Merged", "merged"], failed: ["Failed", "bad"], split: ["Split", "warn"], superseded: ["Rebuilt", "neutral"],
};

/** The batch's facts in one run: used by the table header row and the phone card. */
export function BatchFacts({ b }: { b: QueueBatch }) {
  useNow();
  const branch = b.fork ? (
    <a href={gh(`${b.fork}/tree/${b.branch}`)} target="_blank" rel="noopener noreferrer" title="Open the branch on GitHub" className={cn("font-mono text-xs [overflow-wrap:anywhere]", extLink)}>
      {b.branch}
    </a>
  ) : (
    <span className="font-mono text-xs text-ink/70 [overflow-wrap:anywhere]">{b.branch}</span>
  );
  return (
    <>
      <Link to={batchPath(b.id)} title="Open the batch" className="relative z-10 inline-flex">
        <Badge tone={BATCH_STATE[b.state][1]}>{BATCH_STATE[b.state][0]}</Badge>
      </Link>
      <Link to={batchPath(b.id)} className="relative z-10 text-xs font-medium text-accent-ink hover:underline">
        Batch #{b.id}
      </Link>
      {branch}
      <span className="text-xs text-ink/60">{b.repo}</span>
      <span className="num text-xs text-ink/60">
        {b.size} PR{b.size === 1 ? "" : "s"}
      </span>
      {b.prNumber !== null && <ItemRef repo={b.repo} number={b.prNumber} kind="pr" state={b.state === "merged" ? "merged" : b.state === "open" || b.state === "checking" ? "open" : "closed"} title={null} size="sm" className="flex-none" />}
      <a href={gh(`${repoSlug(b.repo)}/commit/${b.baseSha}`)} target="_blank" rel="noopener noreferrer" title="Base commit on GitHub" className={cn("code text-xs", extLink)}>
        {b.baseSha.slice(0, 7)}
      </a>
      <span className="num text-2xs text-ink/50" title={`created ${when(b.createdAt)}, updated ${when(b.updatedAt)}`}>
        <TimeAgo iso={b.updatedAt} />
      </span>
    </>
  );
}

export function StateChip({ row }: { row: QueueRow }) {
  const [text, tone, hint] = STATE[row.state];
  const title = row.state === "refused" && row.refusedReason ? row.refusedReason : row.state === "declined" && row.answer ? `The operator answered ${row.answer}` : hint;
  return (
    <span title={title} className="relative z-10">
      <Badge tone={tone}>{text}</Badge>
      {row.conflictNote && <span className="ml-1.5 text-2xs text-ink/55">{row.conflictNote}</span>}
    </span>
  );
}

export function DecisionLink({ row }: { row: QueueRow }) {
  if (!row.decisionId) return row.state === "needs-decision" ? <span className="text-2xs text-ink/45">asked on the next run</span> : <span className="text-ink/30">–</span>;
  return (
    <Link to={decisionPath({ id: row.decisionId, repo: row.repo, number: row.number })} className="relative z-10 text-xs text-accent-ink hover:underline">
      {row.answer ? `Answered ${row.answer}` : "Open decision"}
    </Link>
  );
}

/** Why it waits, in one line: refusal reason, or what keeps it outside the rule. */
export function Why({ row }: { row: QueueRow }) {
  if (row.state === "refused" && row.refusedReason) return <span className="text-2xs text-bad">{row.refusedReason}</span>;
  if (row.note) return <span className="text-2xs text-bad">{row.note}</span>;
  if (row.outsideRule.length) return <span className="text-2xs text-ink/50">outside the rule: {row.outsideRule.join(", ")}</span>;
  return null;
}

export const V_TONE: Record<string, Tone> = { unavailable: "warn", passed: "ok", "ci-enough": "ok", failed: "bad", error: "warn", running: "accent", planned: "neutral", stale: "neutral" };
export const V_LABEL: Record<string, string> = { unavailable: "Not verified", passed: "Passed", "ci-enough": "CI is enough", failed: "Failed", error: "Error", running: "Running", planned: "Planned", stale: "Stale" };
