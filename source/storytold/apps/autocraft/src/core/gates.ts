// The gates on writes: the repo approvals each action needs and the global pipeline switch. Pure. The planner and the
// guard (guard.ts) both use it; decide() does not (it shows what would run, approved or not).
import type { ActionKind, ItemFacts, PrFacts } from "./plan.ts";
import { tripStageOf } from "./push-outcome.ts";

/** Who asks for a write: the pipeline itself (the autopilot), or an operator (a job they requested, or a command they ran). */
export type By = "pipeline" | { operator: string };

/** An action as the gates and the guard see it: its kind, and the bucket where the kind has several (fix-up: fix | ask, ...). */
export type Want<K extends ActionKind = ActionKind> = { kind: K; bucket?: string };

/** The repo approvals a write can need. */
export type Approval = "merge" | "push" | "comment" | "ci" | "labels" | "fix-issue" | "main-fix";

const WHAT: Record<Approval, string> = { merge: "Merges", push: "Pushes", comment: "Comments", ci: "CI run approvals", labels: "Labels", "fix-issue": "Issue fixes", "main-fix": "Main CI fixes" };

/** A repo's approvals and the global switch, as the repo-level guard loads them. */
export type RepoApprovals = Record<Approval, boolean> & { pipelineOn: boolean };

/** Why a write needing `need` is refused, or null. A write with no approval need (`need` null) is gated by the switch only. */
/** What a repo-level write needs: a repo approval, `security` for a security fix's writes (approved per finding, no repo approval), or null for none. */
export type RepoNeed = Approval | "security" | null;

export function gateRepo(a: RepoApprovals, need: RepoNeed, by: By, repo: string): string | null {
  if (by === "pipeline" && !a.pipelineOn) return "The pipeline is off";
  return need === null || need === "security" || a[need] ? null : `${WHAT[need]} in ${repo} are not approved`;
}

/** The approval an action's GitHub write needs, or null for an action that writes nothing there. */
export function approvalOf(f: { pushable?: boolean }, a: Want): Approval | null {
  switch (a.kind) {
    // Item actions. Closing and commenting need the comment approval: an answered close always comments first (a
    // security-scan question is in scope for it whatever the pilot says; decideItem already covers that).
    case "label": return "labels";
    case "act": return "comment";
    case "fixissue":
    case "fixissue-collect": return "fix-issue";
    case "merge": return "merge";
    case "post-review": return "comment";
    case "approve-ci": return "ci";
    case "fixup":
    case "conflict":
      return a.bucket === "fix" || a.bucket === "merge" ? "push" : a.bucket === "ask" ? "comment" : null;
    case "cifix":
      if (a.bucket === "rerun") return "ci";
      // A closed branch gets the patch as a comment instead of a push.
      if (a.bucket === "ask") return "comment";
      return a.bucket === "work" || a.bucket === "collect" ? (f.pushable ? "push" : "comment") : null;
    // The collect step of a stored model patch: its push (bucket fixup or cifix), or the patch as a comment where the branch is closed to us.
    case "lint": return a.bucket === "cifix" && !f.pushable ? "comment" : "push";
    default: return null;
  }
}

/** Why the write is refused, or null. */
export function gates(f: PrFacts | ItemFacts, a: Want, by: By): string | null {
  if (by === "pipeline" && !f.pipelineOn) return "The pipeline is off";
  // A stage that stopped itself (circuit breaker) writes nothing until an operator resumes it, whoever asks.
  const stage = tripStageOf(a);
  const trips = (f as { tripped?: Partial<Record<string, string>> }).tripped;
  const tripped = stage && (trips?.[stage] ?? trips?.[`${stage}:${f.repo}`]);
  if (tripped) return `${stage[0]!.toUpperCase()}${stage.slice(1)} is paused: ${tripped}`;
  const need = approvalOf(f as { pushable?: boolean }, a);
  if (!need) return null;
  const r = f.repoFacts as Record<string, boolean | undefined>;
  const ok = { merge: r.mergeApproved, push: r.pushApproved, comment: r.commentApproved, ci: r.ciApproved, labels: r.labelsApproved, "fix-issue": r.fixIssueApproved, "main-fix": undefined }[need];
  return ok ? null : `${WHAT[need]} in ${f.repo} are not approved`;
}

/** Writes from the command line are an operator's. */
export const CLI_BY: By = { operator: "cli" };

/** The writer behind a job: the autopilot's own jobs are the pipeline's, every other requester is an operator. */
export const byOfJob = (requestedBy: string): By => (requestedBy === "pipeline" ? "pipeline" : { operator: requestedBy });
