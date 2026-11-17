// The decision table for open PRs, review to merge: facts overrides in, state, path and due actions out.
import { test } from "node:test";
import assert from "node:assert/strict";
import { decidePr } from "../src/core/decide.ts";
import { PREMERGE_DEFECT_REASON, PREMERGE_FAILED_REASON, PREMERGE_UNSURE_REASON, UNSURE_REASON } from "../src/core/rules.ts";
import { QUEUE_STATES, type Plan, type PrFacts } from "../src/core/plan.ts";
import { NOW, REVIEW_AT, prFacts } from "./world.ts";

type Over = Parameters<typeof prFacts>[0];
type Row = { name: string; facts: Over; expect: { state?: string; path?: "rule" | "operator" | null; actions?: string[]; reasons?: string[]; eligible?: boolean; note?: string | null; conflictNote?: string | null; wait?: string | null } };

const tokens = (p: Plan): string[] => p.actions.map((a) => {
  const bucket = typeof a.params?.bucket === "string" ? a.params.bucket : null;
  if (a.kind === "fixup") return a.params?.source === "premerge" ? "fixup:premerge" : a.params?.source === "carry" ? `fixup:carry-${bucket}` : `fixup:${bucket}`;
  return bucket ? `${a.kind}:${bucket}` : a.kind;
}).sort();
const SIZE_L = { size: "L", lines: 900 } as const;
const answered = (answer: string, after = true) => ({ asked: true, answer, mergeAnswerAfterReview: after });
const premerge = (o: Partial<NonNullable<PrFacts["premerge"]>>) => ({ at: "2026-11-04T10:30:00.000Z", tries: 0, hasFindings: true, unsure: false, defects: 0, defectsAllFixable: true, minor: 0, error: null, ...o });
const TAKE_FIX = { review: { verdict: "take-fix" } } as const;
const fixup = (o: Partial<NonNullable<PrFacts["fixup"]>> = {}) => ({ fixes: 2, attempts: 0, recorded: [] as string[], ...o });
const conflicting = (o: Partial<NonNullable<PrFacts["conflict"]>> = {}) => ({ mergeable: "CONFLICTING", conflict: { bucket: "merge", base: "main", baseOk: true, ...o } });
const CI_FAIL = { ci: "failure" } as const;
const cifix = (o: Partial<NonNullable<PrFacts["cifix"]>> = {}) => ({ states: [] as string[], tries: 0, rerunAt: null, infraRuns: null, formattingTask: null, formatterEnded: true, totalPushes: 0, totalTries: 0, checksAt: "2026-11-04T11:00:00.000Z", ...o });
const merged = (o: Partial<NonNullable<PrFacts["postmerge"]>> = {}) => ({ mergedAt: "2026-11-04T09:00:00.000Z", head: "h1", since: "2026-11-01T00:00:00.000Z", review: null, ...o });
const runs = (o: Partial<NonNullable<PrFacts["runs"]>> = {}) => ({ waiting: 1, reread: false, crossRepo: true, approvable: 1, ...o });

const rows: Row[] = [
  // ---- the rule path
  { name: "clean rule PR is ready and merges", facts: {}, expect: { state: "ready", path: "rule", actions: ["merge"], reasons: [], eligible: true } },
  { name: "take-fix goes to fix-up, outside the rule", facts: { review: { verdict: "take-fix" } }, expect: { state: "needs-fix-up", path: null, actions: [], reasons: ["review asks for fixes"] } },
  { name: "size L is outside the rule and asked about", facts: SIZE_L, expect: { state: "needs-decision", path: null, actions: ["ask-merge"], reasons: ["size L"] } },
  { name: "a conflict with an owner statement keeps a clean PR off the rule and asks", facts: { statementConflicts: [{ id: 3, where: "designcraft#1484", text: "Hyphenation and dictionaries belong in craft-libs", reason: "adds a hyphenation table" }] }, expect: { state: "needs-decision", path: null, actions: ["ask-merge"], reasons: ["conflicts with designcraft#1484: \"Hyphenation and dictionaries belong in craft-libs\" (adds a hyphenation table)"] } },
  { name: "a conflict does not stop an operator's Merge answer", facts: { statementConflicts: [{ id: 3, where: "app#2", text: "t", reason: "r" }], decision: answered("merge") }, expect: { state: "decision-answered-merge", path: "operator", actions: ["merge"] } },
  { name: "no conflict leaves the rule path alone", facts: { statementConflicts: [] }, expect: { state: "ready", path: "rule", actions: ["merge"], reasons: [] } },
  { name: "a README or brand change keeps a clean PR off the rule and asks", facts: { sensitive: ["changes the README"] }, expect: { state: "needs-decision", path: null, actions: ["ask-merge"], reasons: ["changes the README"] } },
  { name: "an uncached diff keeps a clean PR off the rule", facts: { sensitive: null }, expect: { state: "needs-decision", path: null, actions: ["ask-merge"], reasons: ["diff not checked for README or third-party links"] } },
  { name: "other label", facts: { label: "performance" }, expect: { state: "needs-decision", reasons: ["label performance"], actions: ["ask-merge"] } },
  { name: "no settled label", facts: { label: null }, expect: { state: "needs-decision", reasons: ["no settled label"], actions: ["ask-merge"] } },
  { name: "tier not on the whitelist", facts: { tier: "not" }, expect: { state: "needs-decision", reasons: ["author not on the whitelist"] } },
  { name: "unknown author", facts: { tier: "not", author: null }, expect: { state: "needs-decision", reasons: ["author unknown"] } },
  { name: "allow tier counts as whitelisted", facts: { tier: "allow" }, expect: { state: "ready", path: "rule" } },
  { name: "review mode skipped never merges by rule", facts: { review: { mode: "skipped" } }, expect: { state: "needs-decision", reasons: ["the review was skipped"], actions: ["ask-merge"] } },
  { name: "an open Merge? question counts against the rule", facts: { decision: { openQuestion: true } }, expect: { state: "needs-decision", reasons: ["a Merge? question is still open"] } },
  { name: "verification unavailable puts it outside the rule", facts: { verification: { state: "unavailable", summary: "the repo is private" } }, expect: { state: "needs-decision", reasons: ["not verified: the repo is private"], actions: ["ask-merge"] } },
  { name: "no CI in the repo puts it outside the rule", facts: { ci: "none", repoFacts: { noCi: true } }, expect: { state: "needs-decision", reasons: ["the repo has no CI checks"] } },
  { name: "several reasons keep the queue's order", facts: { ...SIZE_L, label: "infra", tier: "not", review: { verdict: "take-fix" } }, expect: { state: "needs-fix-up", reasons: ["review asks for fixes", "size L", "author not on the whitelist"] } },

  // ---- unsure heads and operator answers
  { name: "unsure head does not merge by rule", facts: { review: { unsure: true } }, expect: { state: "needs-decision", path: null, actions: ["ask-merge"], reasons: [UNSURE_REASON] } },
  { name: "unsure head, Merge answer given before the review, does not merge", facts: { review: { unsure: true }, decision: answered("merge", false) }, expect: { state: "needs-decision", path: null, actions: [] } },
  { name: "unsure head, Merge answer after the review, merges as operator", facts: { review: { unsure: true }, decision: answered("merge", true) }, expect: { state: "decision-answered-merge", path: "operator", actions: ["merge"], reasons: [UNSURE_REASON] } },
  { name: "unsure head, Hold answer is declined and does not merge", facts: { review: { unsure: true }, decision: answered("hold") }, expect: { state: "declined", actions: [] } },
  { name: "Hold answer on a PR outside the rule: no merge", facts: { ...SIZE_L, decision: answered("hold") }, expect: { state: "declined", path: null, actions: [] } },
  { name: "Hold answer blocks the pre-merge fix-up", facts: { ...SIZE_L, decision: answered("hold") , premerge: premerge({ defects: 1 }) }, expect: { state: "declined", actions: [] } },
  { name: "Merge answer on a large PR merges as operator", facts: { ...SIZE_L, decision: answered("merge") }, expect: { state: "decision-answered-merge", path: "operator", actions: ["merge"], eligible: true } },
  { name: "asked and unanswered: waits, no second question", facts: { ...SIZE_L, decision: { asked: true } }, expect: { state: "needs-decision", actions: [] } },
  { name: "member of an open duplicate group is asked later", facts: { ...SIZE_L, decision: { inOpenGroup: true } }, expect: { state: "needs-decision", actions: [] } },
  { name: "operator Merge answer accepts a repo without CI", facts: { ...SIZE_L, ci: "none", repoFacts: { noCi: true }, decision: answered("merge") }, expect: { state: "decision-answered-merge", actions: ["merge"], eligible: true } },
  { name: "operator Merge answer on an unverifiable repo merges", facts: { verification: { state: "unavailable", summary: "x" }, decision: answered("merge") }, expect: { state: "decision-answered-merge", actions: ["merge"] } },

  // ---- order of the state rules
  { name: "conflicting PR", facts: { mergeable: "CONFLICTING", conflict: { bucket: "merge", base: "main", baseOk: true } }, expect: { state: "conflict", path: "rule", actions: ["conflict:merge"], note: null, conflictNote: "conflict: merging main" } },
  { name: "failed CI", facts: { ci: "failure" }, expect: { state: "ci-failed", actions: [] } },
  { name: "conflict outranks failed CI", facts: { ci: "failure", mergeable: "CONFLICTING" }, expect: { state: "conflict" } },
  { name: "failed CI on a PR outside the rule", facts: { ...SIZE_L, ci: "failure" }, expect: { state: "ci-failed", actions: [] } },
  { name: "runs waiting for approval", facts: { runs: runs({ waiting: 2 }) }, expect: { state: "ci-approval", actions: ["approve-ci"] } },
  { name: "CI pending", facts: { ci: "pending" }, expect: { state: "waiting-ci", actions: [] } },
  { name: "mergeable not computed yet", facts: { mergeable: "UNKNOWN" }, expect: { state: "waiting-ci", actions: [] } },
  { name: "checks of another head: CI unknown", facts: { ci: "unknown", checksHere: false }, expect: { state: "waiting-ci" } },
  { name: "no verification yet", facts: { verification: null }, expect: { state: "waiting-verify", path: "rule", actions: ["verify:plan"] } },
  { name: "stale verification is verified again", facts: { verification: { state: "stale" } }, expect: { state: "waiting-verify", actions: ["verify:plan"] } },
  { name: "failed verification", facts: { verification: { state: "failed", summary: "tests fail" } }, expect: { state: "needs-decision", actions: ["ask-merge"] } },
  { name: "verification error", facts: { verification: { state: "error", summary: "no build" } }, expect: { state: "needs-decision", actions: ["ask-merge"] } },
  { name: "CI is enough counts as verified", facts: { verification: { state: "ci-enough" } }, expect: { state: "ready", actions: ["merge"] } },
  { name: "outside the rule, not verified yet: no question before the result", facts: { ...SIZE_L, verification: null }, expect: { state: "waiting-verify", actions: ["verify:plan"] } },
  { name: "unavailable repo is Verify's second bucket", facts: { verification: null, verifyUnavailable: "the repo is private" }, expect: { state: "waiting-verify", actions: ["verify:unavailable"] } },

  // ---- pre-merge review
  { name: "no pre-merge review yet", facts: { premerge: null }, expect: { state: "waiting-premerge", path: "rule", actions: ["premerge"] } },
  { name: "no pre-merge review, merging not approved in the repo", facts: { premerge: null, repoFacts: { mergeApproved: false } }, expect: { state: "waiting-premerge", actions: [] } },
  { name: "pre-merge review with an unverified claim goes to a person, not the rule", facts: { premerge: premerge({ unsure: true }) }, expect: { state: "needs-decision", reasons: [PREMERGE_UNSURE_REASON], actions: ["ask-merge"] } },
  { name: "failed try waits for its backoff", facts: { premerge: premerge({ hasFindings: false, tries: 1, at: new Date(NOW - 600_000).toISOString() }) }, expect: { state: "waiting-premerge", actions: [] } },
  { name: "failed try is due after the backoff", facts: { premerge: premerge({ hasFindings: false, tries: 1, at: new Date(NOW - 3_700_000).toISOString() }) }, expect: { state: "waiting-premerge", actions: ["premerge"] } },
  { name: "three failed tries: outside the rule", facts: { premerge: premerge({ hasFindings: false, tries: 3 }) }, expect: { state: "needs-decision", reasons: [PREMERGE_FAILED_REASON], actions: ["ask-merge"] } },
  { name: "defect without a fix is asked about", facts: { premerge: premerge({ defects: 1, defectsAllFixable: false }) }, expect: { state: "needs-decision", reasons: [PREMERGE_DEFECT_REASON], actions: ["ask-merge"] } },
  { name: "fixable defects go to fix-up", facts: { premerge: premerge({ defects: 2 }) }, expect: { state: "needs-fix-up", path: "rule", actions: ["fixup:premerge"], note: "pre-merge review: 2 defects to fix" } },
  { name: "one fixable defect is singular", facts: { premerge: premerge({ defects: 1 }) }, expect: { state: "needs-fix-up", note: "pre-merge review: 1 defect to fix" } },
  { name: "fix-up already used: defect", facts: { premerge: premerge({ defects: 1 }), premergeFixUsed: true }, expect: { state: "needs-decision", reasons: [PREMERGE_DEFECT_REASON] } },
  { name: "no push approval: defect", facts: { premerge: premerge({ defects: 1 }), repoFacts: { pushApproved: false } }, expect: { state: "needs-decision", reasons: [PREMERGE_DEFECT_REASON] } },
  { name: "branch not pushable: defect", facts: { premerge: premerge({ defects: 1 }), pushable: false }, expect: { state: "needs-decision", reasons: [PREMERGE_DEFECT_REASON] } },
  { name: "a Merge? decision at the head blocks the fix-up", facts: { premerge: premerge({ defects: 1 }), decision: { asked: true } }, expect: { state: "needs-decision", reasons: [PREMERGE_DEFECT_REASON], actions: [] } },
  { name: "minor findings do not block", facts: { premerge: premerge({ minor: 3 }) }, expect: { state: "ready", actions: ["merge"] } },
  { name: "a PR outside the rule skips the pre-merge review", facts: { ...SIZE_L, premerge: null }, expect: { state: "needs-decision", actions: ["ask-merge"] } },

  // ---- merge, refusal, holds, batches, main CI
  { name: "refused PR with changed CI is retried", facts: { lastMerge: { outcome: "refused", reason: "x", ci: "pending", mergeable: "MERGEABLE" } }, expect: { state: "refused", path: "rule", actions: ["merge"], eligible: true } },
  { name: "refused PR in the same state waits, on every path", facts: { lastMerge: { outcome: "refused", reason: "not ready at merge time: CI pending", ci: "success", mergeable: "MERGEABLE" } }, expect: { state: "refused", actions: [], eligible: true } },
  { name: "refused PR waits also when it merges alone", facts: { verification: { state: "unavailable", summary: "s" }, decision: answered("merge"), lastMerge: { outcome: "refused", reason: "x", ci: "success", mergeable: "MERGEABLE" } }, expect: { state: "refused", actions: [] } },
  { name: "refusal without a recorded CI state waits", facts: { lastMerge: { outcome: "refused", reason: "not ready at merge time: CI pending", ci: null, mergeable: null } }, expect: { state: "refused", actions: [] } },
  { name: "approved runs after a refusal release it", facts: { lastMerge: { outcome: "refused", reason: "x", ci: "success", mergeable: "MERGEABLE" }, runsApprovedAfterMerge: true }, expect: { state: "refused", actions: ["merge"] } },
  { name: "held PR keeps its state and never merges", facts: { mergeHeld: true }, expect: { state: "ready", path: "rule", actions: [], eligible: false } },
  { name: "held PR with an operator answer never merges", facts: { ...SIZE_L, decision: answered("merge"), mergeHeld: true }, expect: { state: "decision-answered-merge", actions: [], eligible: false } },
  { name: "batch state replaces ready", facts: { batch: "in-batch" }, expect: { state: "in-batch", actions: [] } },
  { name: "batch state replaces waiting-ci", facts: { batch: "batch-checking", ci: "pending" }, expect: { state: "batch-checking" } },
  { name: "failed batch state", facts: { batch: "batch-failed" }, expect: { state: "batch-failed", actions: [] } },
  { name: "batch does not take a rule PR without a clean pre-merge review", facts: { batch: "in-batch", premerge: null }, expect: { state: "waiting-premerge" } },
  { name: "batch takes an operator-approved PR", facts: { ...SIZE_L, decision: answered("merge"), batch: "in-batch", premerge: null }, expect: { state: "in-batch" } },
  { name: "red main holds a ready PR", facts: { repoFacts: { mainRed: true } }, expect: { state: "waiting-main-ci", actions: [] } },
  { name: "red main does not hold the PR that fixes it", facts: { repoFacts: { mainRed: true }, mainFix: true }, expect: { state: "ready", actions: ["merge"] } },
  { name: "batch members keep the batch state while main is red", facts: { repoFacts: { mainRed: true }, batch: "in-batch" }, expect: { state: "in-batch" } },
  { name: "main fix merges alone", facts: { mainFix: true }, expect: { state: "ready", actions: ["merge"] } },

  // ---- changes requested, held, merged
  { name: "changes requested blocks a ready PR", facts: { changesRequested: { why: "changes requested by a maintainer (ana)", live: true } }, expect: { state: "changes-requested", path: null, actions: [], note: "changes requested by a maintainer (ana)" } },
  { name: "changes requested blocks an operator Merge answer", facts: { ...SIZE_L, decision: answered("merge"), changesRequested: { why: "w", live: false } }, expect: { state: "changes-requested", actions: [] } },
  { name: "changes requested blocks the question", facts: { ...SIZE_L, changesRequested: { why: "w", live: false } }, expect: { state: "changes-requested", actions: [] } },
  { name: "failed review reads give a note", facts: { gateFailureNote: "reviews could not be read from GitHub 3 times in a row", ...SIZE_L }, expect: { state: "needs-decision", note: "reviews could not be read from GitHub 3 times in a row" } },
  { name: "backlog hold wins over the rule", facts: { heldBacklog: true }, expect: { state: "held-backlog", actions: [] } },
  { name: "duplicate hold", facts: { heldDuplicate: true }, expect: { state: "held-duplicate", actions: [] } },
  { name: "merged PR", facts: { ghState: "MERGED" }, expect: { state: "merged", actions: [] } },
  { name: "PR merged by us before the mirror noticed", facts: { lastMerge: { outcome: "merged", reason: null, ci: "success", mergeable: "MERGEABLE" } }, expect: { state: "merged", actions: [] } },

  // ---- open PRs outside the queue
  { name: "not reviewed yet", facts: { review: null }, expect: { state: "not-reviewed", path: null, actions: ["review"] } },
  { name: "review at an older head", facts: { head: "h2" }, expect: { state: "review-stale", actions: ["review"] } },
  { name: "review made stale by the discussion", facts: { review: { stale: true, staleActionable: true } }, expect: { state: "review-stale", actions: ["review"] } },
  { name: "stale review at the daily re-review cap waits", facts: { review: { stale: true, staleActionable: false } }, expect: { state: "review-stale", actions: [] } },
  { name: "a stale take is never verified or merged", facts: { review: { stale: true, staleActionable: true }, verification: null }, expect: { state: "review-stale", actions: ["review"] } },
  { name: "label that gets no code review", facts: { review: null, label: "plugin candidate" }, expect: { state: "label-not-reviewed", actions: [] } },
  { name: "unclassified PR", facts: { review: null, label: null }, expect: { state: "label-not-reviewed", actions: [] } },
  { name: "needs-decision flag waits for a scope answer", facts: { review: null, needsDecisionFlag: true }, expect: { state: "scope", actions: [] } },
  { name: "scope answer take lets it be reviewed", facts: { review: null, needsDecisionFlag: true, scopeAnswer: "take" }, expect: { state: "not-reviewed", actions: ["review"] } },
  { name: "scope answer plugin keeps it out", facts: { review: null, scopeAnswer: "plugin" }, expect: { state: "scope", actions: [] } },
  { name: "draft without a review", facts: { review: null, draft: true }, expect: { state: "draft", actions: [] } },
  { name: "draft with a take review stays in the queue", facts: { draft: true, verification: null }, expect: { state: "waiting-verify", actions: [] } },
  { name: "Opus said hold", facts: { review: { verdict: "hold" } }, expect: { state: "opus-hold", actions: ["ask-merge"] } },
  { name: "Opus said close", facts: { review: { verdict: "close" } }, expect: { state: "opus-close", actions: [] } },
  { name: "backlog without a review", facts: { review: null, heldBacklog: true }, expect: { state: "backlog", actions: [] } },
  { name: "duplicate hold without a review", facts: { review: null, heldDuplicate: true }, expect: { state: "duplicate", actions: [] } },
  { name: "outside the pilot", facts: { inScope: false }, expect: { state: "out-of-scope", actions: [] } },
  { name: "integration PR with runs to read", facts: { integration: true, runs: runs({ reread: true }) }, expect: { state: "integration", actions: ["approve-ci"] } },
  { name: "integration PR of a repo out of scope", facts: { integration: true, inScope: false, runs: runs({ reread: true }) }, expect: { state: "out-of-scope", actions: [] } },
  { name: "runs wait at the reviewed head but the PR moved on: not approved", facts: { head: "h2", runs: runs() }, expect: { actions: ["review"] } },
  { name: "a Hold answer stops the fix-up of a take-fix review", facts: { ...TAKE_FIX, fixup: fixup(), decision: answered("hold") }, expect: { actions: [] } },
  { name: "a Hold answer stops the CI fix", facts: { ...CI_FAIL, cifix: cifix(), decision: answered("hold") }, expect: { actions: [] } },
  { name: "a Hold answer stops the conflict merge", facts: { ...conflicting(), decision: answered("hold") }, expect: { actions: [] } },
  { name: "a Close answer stops a carry-over fix-up", facts: { carry: [{ attempts: 0 }], decision: answered("close") }, expect: { actions: [] } },
  { name: "integration PR without runs", facts: { integration: true }, expect: { state: "integration", actions: [] } },

  // ---- other actions
  { name: "review not posted yet", facts: { post: { posted: null } }, expect: { state: "ready", actions: ["merge", "post-review"] } },
  { name: "newer review than the post is posted again", facts: { post: { posted: { head: "h1", at: "2026-11-04T09:00:00.000Z", opusAt: "2026-11-04T09:00:00.000Z" } } }, expect: { state: "ready", actions: ["merge", "post-review"] } },
  { name: "no public text, nothing posted", facts: { post: { postable: false, posted: null } }, expect: { state: "ready", actions: ["merge"] } },
  { name: "the pipeline's own PR gets no posted review", facts: { post: { posted: null }, authorIsPipeline: true }, expect: { state: "ready", actions: ["merge"] } },
  { name: "waiting runs of a fork PR are approved", facts: { runs: runs(), ci: "pending" }, expect: { state: "ci-approval", actions: ["approve-ci"] } },
  { name: "runs that failed twice are left to a person", facts: { runs: runs({ approvable: 0 }) }, expect: { state: "ci-approval", actions: [] } },
  { name: "runs of a same-repo PR are not approved", facts: { runs: runs({ crossRepo: false }) }, expect: { state: "ci-approval", actions: [] } },
  { name: "no approval of runs after an answer that is not Merge", facts: { ...SIZE_L, decision: answered("hold"), runs: runs() }, expect: { state: "declined", actions: [] } },
  { name: "no approval of runs for a held merge", facts: { runs: runs(), mergeHeld: true }, expect: { state: "ci-approval", actions: [] } },
  { name: "checks of another head: nothing to approve", facts: { runs: runs(), checksHere: false, ci: "unknown" }, expect: { state: "ci-approval", actions: [] } },
  { name: "failing CI is not verified", facts: { ci: "failure", verification: null }, expect: { state: "ci-failed", actions: [] } },
  // ---- operator Hold and Close decline on the rule path too
  { name: "Hold answer declines a PR the rule would merge", facts: { decision: answered("hold") }, expect: { state: "declined", actions: [] } },
  { name: "Close answer declines a PR the rule would merge", facts: { decision: answered("close") }, expect: { state: "declined", actions: [] } },
  { name: "Merge answer on a rule PR still merges by the rule", facts: { decision: answered("merge") }, expect: { state: "ready", path: "rule", actions: ["merge"] } },

  // ---- fix-up of a take-fix review
  { name: "fix-up: pushable branch with approval", facts: { ...TAKE_FIX, fixup: fixup() }, expect: { state: "needs-fix-up", actions: ["fixup:fix"] } },
  { name: "fix-up: no push approval waits", facts: { ...TAKE_FIX, fixup: fixup(), repoFacts: { pushApproved: false } }, expect: { state: "needs-fix-up", actions: [] } },
  { name: "fix-up: branch not pushable, comments approved: ask", facts: { ...TAKE_FIX, fixup: fixup(), pushable: false }, expect: { state: "needs-fix-up", actions: ["fixup:ask"] } },
  { name: "fix-up: branch not pushable, no comment approval: cannot-push row due", facts: { ...TAKE_FIX, fixup: fixup(), pushable: false, repoFacts: { commentApproved: false } }, expect: { state: "needs-fix-up", actions: ["fixup:cannot-push"] } },
  { name: "fix-up: already asked at this head", facts: { ...TAKE_FIX, fixup: fixup({ recorded: ["asked"] }), pushable: false }, expect: { actions: [] } },
  { name: "fix-up: asked earlier but now pushable: pushed instead", facts: { ...TAKE_FIX, fixup: fixup({ recorded: ["asked"] }) }, expect: { actions: ["fixup:fix"] } },
  { name: "fix-up: pushed head is held", facts: { ...TAKE_FIX, fixup: fixup({ recorded: ["pushed"] }) }, expect: { actions: [] } },
  { name: "fix-up: recorded cannot-push becomes an ask once comments are approved", facts: { ...TAKE_FIX, fixup: fixup({ recorded: ["cannot-push"] }), pushable: false }, expect: { actions: ["fixup:ask"] } },
  { name: "fix-up: recorded cannot-push without comment approval is final", facts: { ...TAKE_FIX, fixup: fixup({ recorded: ["cannot-push"] }), pushable: false, repoFacts: { commentApproved: false } }, expect: { actions: [] } },
  { name: "fix-up: too-large becomes an ask once comments are approved", facts: { ...TAKE_FIX, fixup: fixup({ recorded: ["too-large"] }) }, expect: { actions: ["fixup:ask"] } },
  { name: "fix-up: too-large and asked is final", facts: { ...TAKE_FIX, fixup: fixup({ recorded: ["too-large", "asked"] }) }, expect: { actions: [] } },
  { name: "fix-up: too-large without comment approval is final", facts: { ...TAKE_FIX, fixup: fixup({ recorded: ["too-large"] }), repoFacts: { commentApproved: false } }, expect: { actions: [] } },
  { name: "a label settled by an unsure referee keeps a clean PR off the rule and asks", facts: { labelUnsure: true }, expect: { state: "needs-decision", path: null, actions: ["ask-merge"], reasons: ["label settled by an unsure referee"] } },
  { name: "fix-up: an operator merge hold stops the too-large ask", facts: { ...TAKE_FIX, fixup: fixup({ recorded: ["too-large"] }), mergeHeld: true }, expect: { actions: [] } },
  { name: "fix-up: two tries used are followed by an ask", facts: { ...TAKE_FIX, fixup: fixup({ attempts: 2 }) }, expect: { actions: ["fixup:ask"] } },
  { name: "fix-up: two tries used and asked is final", facts: { ...TAKE_FIX, fixup: fixup({ attempts: 2, recorded: ["asked"] }) }, expect: { actions: [] } },
  { name: "fix-up: one try used, one left", facts: { ...TAKE_FIX, fixup: fixup({ attempts: 1 }) }, expect: { actions: ["fixup:fix"] } },
  { name: "fix-up: a review with no usable fixes", facts: { ...TAKE_FIX, fixup: fixup({ fixes: 0 }) }, expect: { actions: [] } },
  { name: "fix-up: conflicting PRs are not fixed up", facts: { ...TAKE_FIX, fixup: fixup(), mergeable: "CONFLICTING" }, expect: { actions: [] } },
  { name: "fix-up: a draft is not fixed up", facts: { ...TAKE_FIX, fixup: fixup(), draft: true }, expect: { actions: [] } },
  { name: "fix-up: a held duplicate is not fixed up", facts: { ...TAKE_FIX, fixup: fixup(), heldDuplicate: true }, expect: { state: "held-duplicate", actions: [] } },
  { name: "fix-up: review made stale waits for the new review", facts: { ...TAKE_FIX, fixup: fixup(), review: { stale: true, staleActionable: true } }, expect: { state: "review-stale", actions: ["review"] } },
  { name: "lint: a stored fix-up patch whose task ended is collected, and holds the fix-up meanwhile", facts: { ...TAKE_FIX, fixup: fixup({ recorded: ["linting"] }), lint: [{ step: "fixup", source: "review", ended: true }] }, expect: { actions: ["lint:fixup"] } },
  { name: "lint: a task still running is waited for", facts: { ...TAKE_FIX, fixup: fixup({ recorded: ["linting"] }), lint: [{ step: "fixup", source: "review", ended: false }] }, expect: { actions: [] } },
  { name: "lint: a Hold answer drops the stored patch's push", facts: { ...TAKE_FIX, fixup: fixup({ recorded: ["linting"] }), lint: [{ step: "fixup", source: "review", ended: true }], decision: answered("hold") }, expect: { actions: [] } },
  { name: "lint: revoked push approval drops the stored patch's push", facts: { ...TAKE_FIX, fixup: fixup({ recorded: ["linting"] }), lint: [{ step: "fixup", source: "review", ended: true }], repoFacts: { pushApproved: false } }, expect: { actions: [] } },
  { name: "lint: a stored CI fix patch whose task ended is collected", facts: { ...CI_FAIL, cifix: cifix({ states: ["linting"] }), lint: [{ step: "cifix", source: "review", ended: true }] }, expect: { actions: ["lint:cifix"] } },
  { name: "lint: a stored CI fix patch of our own breakage is collected at the pushed head", facts: { head: "pushed1", ci: "unknown", brokeByUs: true, cifix: cifix({ states: ["linting"] }), lint: [{ step: "cifix", source: "review", ended: true }] }, expect: { actions: ["lint:cifix", "review"] } },
  { name: "lint: a stored pre-merge patch is collected and the pre-merge fix-up waits", facts: { premerge: premerge({ defects: 1 }), lint: [{ step: "fixup", source: "premerge", ended: true }] }, expect: { state: "needs-fix-up", actions: ["lint:fixup"] } },
  { name: "lint: a carry-over waits while its patch is linted", facts: { carry: [{ attempts: 0 }], lint: [{ step: "fixup", source: "carry", ended: false }] }, expect: { actions: ["merge"] } },
  { name: "pre-merge fix-up of a rule PR", facts: { premerge: premerge({ defects: 1 }) }, expect: { state: "needs-fix-up", actions: ["fixup:premerge"] } },
  { name: "pre-merge fix-up needs safe fix paths", facts: { premerge: premerge({ defects: 1, fixesSafe: false }) }, expect: { state: "needs-fix-up", actions: [] } },
  { name: "pre-merge fix-up not for a conflicting PR", facts: { premerge: premerge({ defects: 1 }), mergeable: "CONFLICTING" }, expect: { state: "conflict", actions: [] } },
  { name: "pre-merge fix-up not for a held merge", facts: { premerge: premerge({ defects: 1 }), mergeHeld: true }, expect: { state: "needs-fix-up", actions: [] } },

  // ---- carry-over of closed duplicates
  { name: "carry: push when allowed", facts: { carry: [{ attempts: 0 }] }, expect: { state: "ready", actions: ["merge", "fixup:carry-fix"] } },
  { name: "carry: ask when the branch cannot be pushed", facts: { carry: [{ attempts: 0 }], pushable: false }, expect: { actions: ["merge", "fixup:carry-ask"] } },
  { name: "carry: ask after two tries", facts: { carry: [{ attempts: 2 }] }, expect: { actions: ["merge", "fixup:carry-ask"] } },
  { name: "carry: nothing without comment approval when it cannot push", facts: { carry: [{ attempts: 0 }], pushable: false, repoFacts: { commentApproved: false } }, expect: { actions: ["merge"] } },
  { name: "carry: not for a conflicting PR", facts: { carry: [{ attempts: 0 }], mergeable: "CONFLICTING" }, expect: { state: "conflict", actions: [] } },
  { name: "carry: also for a PR without a review", facts: { review: null, carry: [{ attempts: 0 }] }, expect: { state: "not-reviewed", actions: ["review", "fixup:carry-fix"] } },
  { name: "carry: not under a Backlog hold", facts: { review: null, heldBacklog: true, carry: [{ attempts: 0 }] }, expect: { state: "backlog", actions: [] } },

  // ---- conflicts
  { name: "conflict: merge the base branch", facts: conflicting(), expect: { state: "conflict", actions: ["conflict:merge"] } },
  { name: "conflict: ask the contributor", facts: conflicting({ bucket: "ask" }), expect: { state: "conflict", actions: ["conflict:ask"] } },
  { name: "conflict: a stored resolution is collected while the PR still conflicts, and waits for its lint task", facts: { ...conflicting({ bucket: "linting" }), lint: [{ step: "conflict", source: "review", ended: true }] }, expect: { state: "conflict", actions: ["lint:conflict"] } },
  { name: "conflict: a resolution whose lint task still runs is waited for", facts: { ...conflicting({ bucket: "linting" }), lint: [{ step: "conflict", source: "review", ended: false }] }, expect: { actions: [] } },
  { name: "conflict: already asked, held or unapproved", facts: conflicting({ bucket: "asked" }), expect: { actions: [] } },
  { name: "conflict: held bucket", facts: { ...conflicting({ bucket: "held" }), repoFacts: { commentApproved: false } }, expect: { actions: [], wait: "comment approval for the repo" } },
  { name: "conflict: asked waits on the contributor", facts: conflicting({ bucket: "asked" }), expect: { wait: "the contributor to resolve the conflict" } },
  { name: "conflict: unapproved bucket", facts: conflicting({ bucket: "unapproved" }), expect: { actions: [] } },
  { name: "conflict: base branch name not allowed", facts: conflicting({ baseOk: false }), expect: { actions: [] } },
  { name: "conflict: merge held", facts: { ...conflicting(), mergeHeld: true }, expect: { state: "conflict", actions: [] } },
  { name: "conflict: member of an active batch", facts: { ...conflicting(), inActiveBatch: true }, expect: { actions: [] } },
  { name: "conflict: stale review", facts: { ...conflicting(), review: { stale: true, staleActionable: true } }, expect: { state: "review-stale", actions: ["review"] } },
  { name: "conflict: take-fix PR also merges the base", facts: { ...conflicting(), ...TAKE_FIX, fixup: fixup() }, expect: { state: "needs-fix-up", actions: ["conflict:merge"] } },
  { name: "conflict: a draft is left alone", facts: { ...conflicting(), draft: true }, expect: { actions: [] } },
  { name: "conflict note is kept apart from the queue note", facts: conflicting(), expect: { state: "conflict", note: null } },

  // ---- CI fixes
  { name: "cifix: failing CI is worked on", facts: { ...CI_FAIL, cifix: cifix() }, expect: { state: "ci-failed", actions: ["cifix:work"] } },
  { name: "cifix: no push approval", facts: { ...CI_FAIL, cifix: cifix(), repoFacts: { pushApproved: false } }, expect: { actions: [] } },
  { name: "cifix: not pushable, comments approved: work (comment route)", facts: { ...CI_FAIL, cifix: cifix(), pushable: false }, expect: { actions: ["cifix:work"] } },
  { name: "cifix: not pushable, no comment approval", facts: { ...CI_FAIL, cifix: cifix(), pushable: false, repoFacts: { commentApproved: false } }, expect: { actions: [] } },
  { name: "cifix: formatter task running", facts: { ...CI_FAIL, cifix: cifix({ states: ["formatting"], formattingTask: 7, formatterEnded: false, tries: 1 }) }, expect: { actions: [] } },
  { name: "cifix: formatter task ended is collected", facts: { ...CI_FAIL, cifix: cifix({ states: ["formatting"], formattingTask: 7, formatterEnded: true, tries: 1 }) }, expect: { actions: ["cifix:collect"] } },
  { name: "cifix: PR at its push limit asks the contributor", facts: { ...CI_FAIL, cifix: cifix({ totalPushes: 2 }) }, expect: { actions: ["cifix:ask"], wait: "the contributor to fix CI" } },
  { name: "cifix: PR at its push limit, no comment approval: a capped note", facts: { ...CI_FAIL, cifix: cifix({ totalPushes: 2 }), repoFacts: { commentApproved: false } }, expect: { actions: ["cifix:capped"] } },
  { name: "cifix: PR at its try limit", facts: { ...CI_FAIL, cifix: cifix({ totalTries: 4 }) }, expect: { actions: ["cifix:ask"] } },
  { name: "cifix: two tries at this head", facts: { ...CI_FAIL, cifix: cifix({ tries: 2, states: ["failed", "failed"] }) }, expect: { actions: ["cifix:ask"] } },
  { name: "cifix: two tries at this head, no comment approval: waits on approval", facts: { ...CI_FAIL, cifix: cifix({ tries: 2, states: ["failed", "failed"] }), repoFacts: { commentApproved: false } }, expect: { actions: [], wait: "comment approval for the repo" } },
  { name: "cifix: our own breakage is not asked", facts: { ...CI_FAIL, brokeByUs: true, cifix: cifix({ totalTries: 4 }) }, expect: { actions: ["cifix:capped"] } },
  { name: "cifix: asked at this head: waits on the contributor", facts: { ...CI_FAIL, cifix: cifix({ tries: 2, states: ["failed", "failed", "asked"] }) }, expect: { actions: [], wait: "the contributor to fix CI" } },
  { name: "cifix: infra failure is rerun once", facts: { ...CI_FAIL, cifix: cifix({ states: ["infra"], infraRuns: [11] }) }, expect: { actions: ["cifix:rerun"] } },
  { name: "cifix: rerun needs CI run approval in the repo", facts: { ...CI_FAIL, cifix: cifix({ states: ["infra"], infraRuns: [11] }), repoFacts: { ciApproved: false } }, expect: { actions: [] } },
  { name: "cifix: rerun done, checks not read since", facts: { ...CI_FAIL, cifix: cifix({ states: ["infra", "rerun"], infraRuns: [11], rerunAt: "2026-11-04T11:30:00.000Z" }) }, expect: { actions: [] } },
  { name: "cifix: rerun done, checks read after it: fix", facts: { ...CI_FAIL, cifix: cifix({ states: ["infra", "rerun"], infraRuns: [11], rerunAt: "2026-11-04T10:30:00.000Z" }) }, expect: { actions: ["cifix:work"] } },
  { name: "cifix: a push or comment at this head ends the work", facts: { ...CI_FAIL, cifix: cifix({ states: ["pushed"], tries: 1 }) }, expect: { actions: [] } },
  { name: "cifix: not while a maintainer requested changes", facts: { ...CI_FAIL, cifix: cifix(), changesRequested: { why: "w", live: false } }, expect: { state: "changes-requested", actions: [] } },
  { name: "cifix: not for a held merge", facts: { ...CI_FAIL, cifix: cifix(), mergeHeld: true }, expect: { actions: [] } },
  { name: "cifix: a take-fix PR goes through the fix-up first", facts: { ...CI_FAIL, ...TAKE_FIX, fixup: fixup(), cifix: cifix() }, expect: { actions: ["fixup:fix"] } },
  { name: "cifix: a take-fix PR with its fix-up done is fixed", facts: { ...CI_FAIL, ...TAKE_FIX, fixup: fixup({ recorded: ["pushed"] }), cifix: cifix() }, expect: { actions: ["cifix:work"] } },
  { name: "cifix: not when CI passes", facts: { cifix: cifix() }, expect: { state: "ready", actions: ["merge"] } },

  // ---- our push broke the checks: the head is the pushed one, reviewed only at the head before
  { name: "broke: the CI fix works on the pushed head without a review of it", facts: { head: "pushed1", ci: "unknown", brokeByUs: true, cifix: cifix() }, expect: { actions: ["cifix:work", "review"] } },
  { name: "broke: a formatter result is collected the same way", facts: { head: "pushed1", ci: "unknown", brokeByUs: true, cifix: cifix({ states: ["formatting"], formattingTask: 7, formatterEnded: true, tries: 1 }) }, expect: { actions: ["cifix:collect", "review"] } },
  { name: "broke: without it, a pushed head waits for its review", facts: { head: "pushed1", ci: "unknown", cifix: cifix() }, expect: { actions: ["review"] } },

  // ---- a verdict carried over our own checked fix-up
  { name: "carried: a review recorded as carried at the head needs no review and the merge path continues", facts: { review: { mode: "carried", verdict: "take" } }, expect: { state: "ready", path: "rule", actions: ["merge"] } },
  { name: "carried: a contributor commit after our fix-up leaves the reviewed head behind: review again", facts: { head: "contributor1", review: { mode: "carried", verdict: "take" } }, expect: { actions: ["review"] } },

  // ---- post-merge review
  { name: "postmerge: merged by the pipeline, no review stored", facts: { ghState: "MERGED", postmerge: merged() }, expect: { state: "merged", actions: ["postmerge"] } },
  { name: "postmerge: merged before the cut-off", facts: { ghState: "MERGED", postmerge: merged({ since: "2026-11-04T10:00:00.000Z" }) }, expect: { state: "merged", actions: [] } },
  { name: "postmerge: review stored", facts: { ghState: "MERGED", postmerge: merged({ review: { at: "2026-11-04T09:30:00.000Z", error: null } }) }, expect: { actions: [] } },
  { name: "postmerge: failed review waits an hour", facts: { ghState: "MERGED", postmerge: merged({ review: { at: new Date(NOW - 600_000).toISOString(), error: "retry: no diff" } }) }, expect: { actions: [] } },
  { name: "postmerge: failed review is due after an hour", facts: { ghState: "MERGED", postmerge: merged({ review: { at: new Date(NOW - 3_700_000).toISOString(), error: "retry: no diff" } }) }, expect: { actions: ["postmerge"] } },
  { name: "postmerge: final error is not retried", facts: { ghState: "MERGED", postmerge: merged({ review: { at: new Date(NOW - 7_200_000).toISOString(), error: "too large" } }) }, expect: { actions: [] } },
  { name: "postmerge: outside the queue", facts: { ghState: "CLOSED", review: null, postmerge: merged() }, expect: { state: "closed", actions: ["postmerge"] } },
  { name: "postmerge: nothing for a closed PR the pipeline did not merge", facts: { ghState: "CLOSED", review: null }, expect: { state: "closed", actions: [] } },
];

test("broke: the CI fix comes first among the PR's actions", () => {
  const p = decidePr(prFacts({ head: "pushed1", ci: "unknown", brokeByUs: true, cifix: cifix() }));
  assert.equal(p.actions[0]?.kind, "cifix");
});

for (const row of rows) {
  test(row.name, () => {
    const p = decidePr(prFacts(row.facts));
    if (row.expect.state !== undefined) assert.equal(p.state, row.expect.state);
    if (row.expect.path !== undefined) assert.equal(p.path, row.expect.path);
    if (row.expect.actions) assert.deepEqual(tokens(p), [...row.expect.actions].sort());
    if (row.expect.reasons) assert.deepEqual(p.reasons, row.expect.reasons);
    if (row.expect.eligible !== undefined) assert.equal(p.eligible, row.expect.eligible);
    if (row.expect.note !== undefined) assert.equal(p.note, row.expect.note);
    if (row.expect.wait !== undefined) assert.equal(p.wait, row.expect.wait);
    if (row.expect.conflictNote !== undefined) assert.equal(p.conflictNote, row.expect.conflictNote);
  });
}

// ---- safety rules, checked over many fact sets

const merges = (f: PrFacts): boolean => decidePr(f).actions.some((a) => a.kind === "merge");

test("a rule PR without a clean pre-merge review never gets merge", () => {
  for (const pm of [null, premerge({ hasFindings: false, tries: 1 }), premerge({ hasFindings: false, tries: 3 }), premerge({ defects: 1 }), premerge({ defects: 1, defectsAllFixable: false })]) {
    assert.equal(merges(prFacts({ premerge: pm })), false, JSON.stringify(pm));
  }
  assert.equal(merges(prFacts({ premerge: premerge({}) })), true);
});

test("an unsure head merges only on an operator Merge answer given after its latest review", () => {
  for (const decision of [{}, answered("merge", false), answered("hold"), answered("close")]) {
    assert.equal(merges(prFacts({ review: { unsure: true }, decision })), false, JSON.stringify(decision));
  }
  assert.equal(merges(prFacts({ review: { unsure: true }, decision: answered("merge", true) })), true);
});

test("a held PR never merges, whatever its path", () => {
  for (const over of [{}, { ...SIZE_L, decision: answered("merge") }, { review: { unsure: true }, decision: answered("merge") }]) {
    assert.equal(merges(prFacts({ ...over, mergeHeld: true })), false);
  }
});

test("a Hold answer means no merge and no pre-merge fix-up", () => {
  for (const over of [{ ...SIZE_L }, { review: { unsure: true } }, { premerge: premerge({ defects: 1 }) }]) {
    const p = decidePr(prFacts({ ...over, decision: answered("hold") }));
    assert.notEqual(p.state, "needs-fix-up");
    assert.equal(p.actions.some((a) => a.kind === "merge"), false);
  }
});

test("changes requested blocks every action that moves the PR toward a merge", () => {
  for (const over of [{}, { ...SIZE_L, decision: answered("merge") }, { ...SIZE_L }, { premerge: null }, { verification: null }, { runs: runs() }]) {
    const p = decidePr(prFacts({ ...over, changesRequested: { why: "w", live: false } }));
    assert.equal(p.state, "changes-requested");
    assert.deepEqual(p.actions.filter((a) => ["merge", "ask-merge", "premerge"].includes(a.kind)), []);
  }
});

test("a PR in a batch keeps the batch state", () => {
  for (const batch of ["batch-checking", "in-batch", "batch-failed"] as const) {
    assert.equal(decidePr(prFacts({ batch })).state, batch);
    assert.equal(decidePr(prFacts({ batch, ci: "pending" })).state, batch);
    assert.equal(decidePr(prFacts({ batch, repoFacts: { mainRed: true } })).state, batch);
    assert.equal(merges(prFacts({ batch })), false);
  }
});

test("a PR in needs-fix-up with no action due names who it waits on", () => {
  const cases: Over[] = [
    { ...TAKE_FIX, fixup: fixup({ recorded: ["too-large", "asked"] }) },
    { ...TAKE_FIX, fixup: fixup({ recorded: ["too-large"] }), repoFacts: { commentApproved: false } },
    { ...TAKE_FIX, fixup: fixup({ attempts: 2, recorded: ["asked"] }) },
    { ...TAKE_FIX, fixup: fixup({ attempts: 2 }), repoFacts: { commentApproved: false } },
    { ...TAKE_FIX, fixup: fixup({ recorded: ["pushed"] }) },
    { ...TAKE_FIX, fixup: fixup(), repoFacts: { pushApproved: false } },
    { ...TAKE_FIX, fixup: fixup(), mergeable: "CONFLICTING", conflict: { bucket: "held", base: "main", baseOk: true } },
  ];
  for (const over of cases) {
    const p = decidePr(prFacts(over));
    assert.equal(p.state, "needs-fix-up");
    assert.deepEqual(p.actions.filter((a) => a.kind !== "unassign"), []);
    assert.ok(p.wait, JSON.stringify(over));
  }
});

test("a PR our push moved off its mirrored head is left alone and stays assigned", () => {
  const stale = { ...TAKE_FIX, pushedOff: true } as const;
  const p = decidePr(prFacts(stale));
  assert.equal(p.state, "pushed");
  assert.deepEqual(p.actions, []);
  assert.ok(p.wait);
  assert.equal(decidePr(prFacts({ ...stale, pushedOff: false })).state, "needs-fix-up");
});

test("every plan state is one of the declared states", () => {
  const all = new Set<string>([...QUEUE_STATES, "out-of-scope", "integration", "pushed", "backlog", "duplicate", "draft", "opus-hold", "opus-close", "review-stale", "label-not-reviewed", "scope", "not-reviewed", "closed"]);
  for (const row of rows) assert.ok(all.has(decidePr(prFacts(row.facts)).state), row.name);
  assert.equal(REVIEW_AT.length > 0, true);
});
