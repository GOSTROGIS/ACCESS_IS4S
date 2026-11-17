// A complete default PrFacts for decision tests: an open take PR on the rule path with everything green (state ready, due: merge).
import type { ItemFacts, PrFacts } from "../src/core/plan.ts";

export const NOW = Date.parse("2026-11-04T12:00:00Z");
export const HEAD = "h1";
export const REVIEW_AT = "2026-11-04T10:00:00.000Z";

type Override = { [K in keyof PrFacts]?: PrFacts[K] extends object | null ? Partial<NonNullable<PrFacts[K]>> | null : PrFacts[K] };

const base = (): PrFacts => ({
  repo: "app", number: 1, assignment: { login: "bot", assignees: ["dev"], ours: false }, now: NOW, pipelineOn: true, ghState: "OPEN", head: HEAD, draft: false,
  author: "dev", authorIsPipeline: false, tier: "whitelisted", lines: 20, size: "S", label: "bugfix", needsDecisionFlag: false, scopeAnswer: null,
  inScope: true, integration: false, batchPr: false, heldBacklog: false, heldDuplicate: false, mergeHeld: false, fast: false, score: 100,
  repoFacts: { mergeApproved: true, pushApproved: true, commentApproved: true, ciApproved: true, noCi: false, mainRed: false },
  review: { head: HEAD, at: REVIEW_AT, verdict: "take", unsure: false, mode: "full", reason: "ok", fixes: 0, stale: false, staleActionable: false },
  post: { postable: true, posted: { head: HEAD, at: "2026-11-04T10:01:00.000Z", opusAt: REVIEW_AT } },
  checksHere: true, checksOpen: true, ci: "success", mergeable: "MERGEABLE", unknown: null, runs: null,
  lastMerge: null, runsApprovedAfterMerge: false, verifyOverride: false,
  verification: { state: "passed", kind: "build", summary: null, note: null }, verifyUnavailable: null,
  decision: { asked: false, openQuestion: false, answer: null, mergeAnswerAfterReview: false, inOpenGroup: false, hold: { asked: false, open: false, answer: null, otherOpen: false } },
  premerge: { at: "2026-11-04T10:30:00.000Z", tries: 0, hasFindings: true, unsure: false, defects: 0, defectsAllFixable: true, fixesSafe: true, minor: 0, error: null },
  premergeFixUsed: false, sensitive: [], statementConflicts: [], pushable: true, pushChain: [HEAD], conflict: null, inActiveBatch: false, fixup: null, carry: [], lint: [], cifix: null, postmerge: null, batch: null, mainFix: false, baseOffDefault: false, stackedOn: null, changesRequested: null, gateFailureNote: null,
});

/** The default facts with the given fields replaced. Object fields (review, repoFacts, decision, ...) are merged one level deep; null replaces the whole object. */
export function prFacts(over: Override = {}): PrFacts {
  const f = base() as Record<string, unknown>;
  for (const [k, v] of Object.entries(over)) {
    const cur = f[k];
    f[k] = v !== null && typeof v === "object" && !Array.isArray(v) && cur !== null && typeof cur === "object" && !Array.isArray(cur) ? { ...cur, ...v } : v;
  }
  return f as PrFacts;
}

// ---- items (issues and PRs) in the triage steps

const itemBase = (): ItemFacts => ({
  repo: "app", number: 1, kind: "issue", open: true, assignment: { login: "bot", assignees: ["dev"], ours: false }, now: NOW, pipelineOn: true, draft: false, inScope: true, integration: false, held: null, fast: false, score: 100,
  repoFacts: { labelsApproved: true, commentApproved: true, fixIssueApproved: true }, run: "run1",
  classification: {
    status: "settled", label: "bugfix", flags: [], jevLabel: "bugfix", haikuLabel: null, referee: null,
    jev: { at: "2026-11-04T08:00:00.000Z", changed: false, unsure: false }, haiku: null,
  },
  embedHash: "e1", embeddedHash: "e1", priorityHash: "e1", scannedHash: "e1", pairsToCheck: 0, inGroupToAsk: false, inCompareSet: false, dupeAnswers: [],
  scope: { open: false, answer: null, covered: false, recommend: null },
  labels: { existing: ["bugfix"], pluginAnswer: false, labeledNote: null },
  answeredClose: [], closeReview: null,
  fix: { attempt: null, publicRepo: true, notRust: false, openPr: null, impact: "P4", scopeDecision: null },
});

/** The default facts of an open issue with nothing due (backlog priority, so no fix, classified bugfix, labelled, embedded, scanned, prioritized), with the given fields replaced. Object fields are merged one level deep; null replaces the whole object. */
export function itemFacts(over: { [K in keyof ItemFacts]?: ItemFacts[K] extends object | null ? Partial<NonNullable<ItemFacts[K]>> | null : ItemFacts[K] } = {}): ItemFacts {
  const f = itemBase() as Record<string, unknown>;
  for (const [k, v] of Object.entries(over)) {
    const cur = f[k];
    f[k] = v !== null && typeof v === "object" && !Array.isArray(v) && cur !== null && typeof cur === "object" && !Array.isArray(cur) ? { ...cur, ...v } : v;
  }
  return f as ItemFacts;
}
