// decideItem: the triage rules of one open item (issue or PR) in one place: classify, referee, prioritize, embed, duplicates,
// scope decision, label. Pure: no database, no clock (facts carry `now`). The rules are ported from the step selectors named at each rule.
// decideAll adds a PR's review-to-merge Plan (decide.ts) and derives the Work page's next-step text.
import { levelWith, type Level } from "../priority/score.ts";
import { isWork, unassignActions } from "./assignment.ts";
import { decidePr } from "./decide.ts";
import { RECOMMEND_MAX_FAILURES, RECOMMEND_RETRY_MS, alreadyLabeled, isScope, labelsToAdd } from "./item-rules.ts";
import type { Action, ItemFacts, ItemPlan, ItemState, ItemView, PrFacts } from "./plan.ts";

const act = (kind: Action["kind"], head: string | null, params?: Record<string, unknown>): Action => ({ kind, head, ...(params ? { params } : {}) });

/** Why the item would become a scope decision, or null. */
export function scopeReason(f: ItemFacts): "needs-decision" | "scope-disagreement" | null {
  const c = f.classification;
  if (c.status === "settled" && c.flags.includes("needs decision")) return "needs-decision";
  if (c.status === "disagree" && isScope(c.jevLabel) && isScope(c.haikuLabel)) return "scope-disagreement";
  return null;
}

/** An issue the Fix stage may start on: settled bugfix, not backlog priority, no attempt (a skipped one returns when its text changed), a public Rust repo, no scope call against it, no open PR that closes or mentions it. */
function fixCandidate(f: ItemFacts): boolean {
  const c = f.classification, fix = f.fix, a = fix.attempt;
  if (!fix.publicRepo || fix.notRust || c.status !== "settled" || c.label !== "bugfix") return false;
  if (fix.impact && levelWith(fix.impact as Level, c.flags.includes("security")) === "P4") return false;
  if (a && !(a.state === "skipped" && a.textChanged)) return false;
  const d = fix.scopeDecision;
  if (d ? !(d.answer === "take" && d.byOperator) : c.flags.includes("needs decision")) return false;
  return fix.openPr === null;
}

/** Jev and Haiku chose different labels and it is not a scope call: a referee (Sonnet, then Opus when Sonnet was unsure) still has to settle it. An unsure Opus settles the label too and flags a scope decision. */
const labelDisagreement = (f: ItemFacts): boolean => f.classification.status === "disagree" && scopeReason(f) !== "scope-disagreement";

/** A scope decision should be asked: the reason holds and no open decision, scope decision or Backlog answer covers the item. Labelling or a later stage does not suppress it. */
const scopeNeeded = (f: ItemFacts): boolean => scopeReason(f) !== null && !f.scope.covered;

/** The wait of an issue whose fix attempt was skipped or failed: Fix again, Backlog or Close on the item page (and Needs you > Stopped) clears it. */
/** The wait of an open issue with nothing due and nothing to ask: it stays open as a request for anyone to pick up. */
export const TRIAGE_WAIT = "an open request for a person to pick up";
export const fixStoppedWait = (state: string): string => `a person to retry the ${state} fix`;

const PLUGIN_WAIT = "stays open as a plugin candidate";
/** A PR settled as a plugin candidate is not reviewed or merged: it stays open with its label (no question) unless a scope decision about it is open. */
const pluginPr = (f: ItemFacts): boolean => f.kind === "pr" && f.classification.status === "settled" && f.classification.label === "plugin candidate" && !f.scope.open;

export function itemState(f: ItemFacts): ItemState {
  if (f.held) return f.held === "backlog" ? "held-backlog" : "held-duplicate";
  const c = f.classification;
  if (labelDisagreement(f)) return "referee-due";
  if (c.status === "unclassified") return "unclassified";
  if (c.status === "waiting") return "waiting-haiku";
  if (f.scope.open) return "scope-open";
  return scopeNeeded(f) ? "scope-due" : "classified";
}

const WAITS: Partial<Record<ItemState, string>> = {
  "held-duplicate": "a Duplicate? answer", "held-backlog": "a Backlog hold", "referee-due": "the label referee",
  "waiting-haiku": "Haiku's second opinion", "scope-open": "a scope answer", "scope-due": "the scope question to be asked",
};

export function decideItem(f: ItemFacts): ItemPlan {
  const state = itemState(f);
  const c = f.classification;
  const live = f.inScope && !f.integration;
  const actions: Action[] = [];

  // classify-new: Jev for items without a verdict or whose classifier input changed (unless Haiku classified the item alone at this input);
  // Haiku for items Jev is unsure of that have no Haiku verdict as new as Jev's.
  const jevDue = !c.haiku?.aloneCurrent && (!c.jev || c.jev.changed);
  const haikuDue = !!c.jev && c.jev.unsure && (!c.haiku || c.haiku.at < c.jev.at);
  if (f.run && live && (jevDue || haikuDue)) actions.push(act("classify", null, { source: jevDue ? "jev" : "haiku" }));
  // referee: open, not a draft, not held, in scope.
  // A failed Opus call is asked again after a backoff; the third failure sends the item to Decide.
  const backoff = !!c.referee?.failedAt && Date.parse(c.referee.failedAt) > f.now - RECOMMEND_RETRY_MS;
  // Not while Jev or Haiku is due again: the referee would judge the verdicts they are about to replace.
  if (f.run && live && !f.draft && state === "referee-due" && !backoff && !jevDue && !haikuDue) actions.push(act("referee", null, { source: c.referee ? "opus" : "sonnet" }));
  // prioritize: no priority row at the current text hash.
  if (live && f.priorityHash !== f.embedHash) actions.push(act("prioritize", null));
  // embed: every open item, with no scope test.
  if (f.embeddedHash !== f.embedHash) actions.push(act("embed", null));
  // dupes: items to scan, pairs to check, groups to ask.
  const scan = live && f.embeddedHash === f.embedHash && f.scannedHash !== f.embedHash;
  if (scan || f.pairsToCheck > 0 || f.inGroupToAsk) actions.push(act("dupes", null, { scan, pairs: f.pairsToCheck, group: f.inGroupToAsk }));
  // dupe-answer: operator answers to duplicate decisions that change no GitHub state. The pilot test is in the loader.
  if (f.dupeAnswers.length) actions.push(act("dupe-answer", null, { decisions: f.dupeAnswers }));
  if (f.inCompareSet) actions.push(act("dupes-compare", null));
  // decide: a new scope decision, or the prepare step for an open decision of the item (any kind, held or not; in scope only) that has no prepare for its current state.
  if (f.run && live && !f.draft && state === "scope-due") actions.push(act("decide", null, { source: "new" }));
  else if (live && f.scope.recommend && f.scope.recommend.failures < RECOMMEND_MAX_FAILURES
    && (f.scope.recommend.failedAt === null || Date.parse(f.scope.recommend.failedAt) < f.now - RECOMMEND_RETRY_MS)) actions.push(act("decide", null, { source: "prepare" }));
  // label: the repo's labelling approval is applied by gates().
  if (f.run && live && f.held !== "backlog") {
    const settled = c.status === "settled" && c.label ? { type: c.label, security: c.flags.includes("security") && !f.labels.quietFix, needsDecision: c.flags.includes("needs decision") } : null;
    const add = labelsToAdd(settled, f.labels.pluginAnswer, f.labels.existing);
    if (add && add.length && !alreadyLabeled(f.labels.labeledNote, add)) actions.push(act("label", null, { add }));
  }

  const backlog = f.held === "backlog";
  // act: answers that close the item (in scope, or asked by a security scan; not held by Backlog; no final action row yet)
  // and Close? questions for PRs the final review says close (asked once per head). Selecting applies nothing; the repo's comment approval is applied by gates().
  for (const t of f.answeredClose) {
    if ((f.inScope || t.security || t.group) && !backlog && !t.waiting && (t.action === null || t.action === "failed")) actions.push(act("act", null, { bucket: t.kind, decisionId: t.decisionId, security: t.security, ...(t.group ? { group: true } : {}) }));
  }
  if (live && !backlog && f.kind === "pr" && f.closeReview && f.closeReview.atHead && !f.closeReview.asked) actions.push(act("act", f.closeReview.head, { bucket: "close", ask: true }));
  // fixissue: a retry round, or a new candidate; a Backlog hold stops both.
  // fixissue-collect: finished build tasks, or a passed fix to open.
  const fix = f.fix, a = fix.attempt;
  if (f.kind === "issue") {
    if (f.inScope && !backlog && a?.state === "retry") actions.push(act("fixissue", null, { source: "retry" }));
    else if (live && !f.held && fixCandidate(f)) actions.push(act("fixissue", null, { source: "new" }));
    if (f.inScope && !backlog && a && ((a.state === "testing" && a.headDone && a.baseDone) || a.state === "passed")) actions.push(act("fixissue-collect", null, { source: a.state }));
  }

  // unassign (issues; a PR's is decided with its review-to-merge plan): kept while a fix attempt runs or its PR is open, released
  // when the issue waits on a person, was given up or left the scope.
  if (f.kind === "issue") {
    const running = ["retry", "testing", "passed"].includes(a?.state ?? "") || (a?.state === "pr-opened" && fix.openPr !== null);
    actions.push(...unassignActions(f.assignment, f.open, !f.inScope || !!f.held || !running));
  }

  // A closed item is here for its unapplied answered close only.
  if (!f.open) actions.splice(0, actions.length, ...actions.filter((a) => a.kind === "act" && !a.params?.ask));
  const base = actions.some(isWork) ? null : !f.inScope ? "not in scope" : state === "classified" && pluginPr(f) ? PLUGIN_WAIT : WAITS[state] ?? null;
  // An issue with nothing else due waits on the PR that closes it, or on a person when its fix attempt was skipped or failed.
  let wait = base, waitKind: ItemPlan["waitKind"] = base === null ? null : f.inScope && (state === "held-duplicate" || state === "scope-open") ? "person" : "system";
  if (wait === null && f.kind === "issue" && f.open && f.inScope && !backlog && !f.held && actions.every((x) => !isWork(x))) {
    if (fix.openPr !== null) { wait = `open PR #${fix.openPr.number}${fix.openPr.closes ? "" : " mentions it"}`; waitKind = "system"; }
    else if (a?.state === "skipped" || a?.state === "failed") { wait = fixStoppedWait(a.state); waitKind = "person"; }
    else if (state === "classified" && f.fix.openPr === null) { wait = TRIAGE_WAIT; waitKind = "system"; }
  }
  return { repo: f.repo, number: f.number, kind: f.kind, state, actions, wait, waitKind };
}

/** The Work page's next-step text (rank/next.ts nextStepOf), from the item's state and, for a PR, the facts of its review-to-merge path. */
export function nextStep(item: ItemPlan, f: ItemFacts, pr: PrFacts | null): string {
  switch (item.state) {
    case "held-duplicate": case "held-backlog": return "Held: waiting for a Duplicate? answer";
    case "referee-due": return `Referee: waiting for ${f.classification.referee ? "Opus" : "Sonnet"}`;
    case "unclassified": case "waiting-haiku": return "Classify";
    case "scope-open": return "Decide: waiting for a scope answer";
    default:
  }
  const c = f.classification;
  if (item.state === "classified" && pluginPr(f)) return "Stays open as a plugin candidate";
  if (item.state === "scope-due" && c.status === "disagree") return "Decide";
  const needsDecision = c.flags.includes("needs decision");
  if (f.kind === "issue") {
    switch (f.fix.attempt?.state) {
      case "retry": case "testing": return "Fix: in progress";
      case "passed": case "pr-opened": return "Fix: pull request opened";
      case "skipped": case "failed": return "Needs a person";
      default: return c.label === "bugfix" && !needsDecision ? "Fix" : needsDecision ? "Decide" : "Triage by a person";
    }
  }
  const o = pr && !pr.inScope ? pr.outside ?? null : null;
  const r = o ? o.review : pr?.review && pr.review.head === pr.head && !pr.review.stale ? pr.review.verdict : null;
  if (needsDecision && !r) return "Decide";
  switch (r) {
    case null: return "Review";
    case "take-fix": return "Fix-up";
    case "hold": return pr?.decision.hold.answer === "wait" ? "Waiting for the author" : pr?.decision.hold.open ? "Hold? decision: waiting for an answer" : "Needs a person";
    case "close": return "Close";
    default: {
      const v = o ? o.verify : pr?.verification?.state ?? null;
      if (v === "unavailable") return "Merge? decision: not verified (Verify cannot build this repo)";
      if ((o ? o.ci : pr?.ci) === "none" && pr?.repoFacts.noCi) return "Merge? decision: the repo has no CI";
      if (v === "passed" || v === "ci-enough") return "Merge queue";
      if (v === "failed" || v === "error") return pr?.decision.openQuestion || pr?.decision.asked ? "Merge? decision: verification failed" : "Needs a person: verification failed";
      return v ? "Verify: running" : "Verify";
    }
  }
}

/** Every plan of an item together. A PR's triage actions (classify, label, ...) and its review-to-merge actions can both be due: triage actions come first. */
export function decideAll(item: ItemFacts, pr: PrFacts | null = null): ItemView {
  const plan = decideItem(item);
  const prPlan = pr ? decidePr(pr) : null;
  return {
    repo: item.repo, number: item.number, kind: item.kind, head: pr?.head ?? null, item: plan, pr: prPlan,
    actions: [...plan.actions, ...(prPlan?.actions ?? [])], next: nextStep(plan, item, pr),
  };
}
