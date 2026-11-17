// The decision table for the triage steps of open items (issues and PRs): facts overrides in, state and due actions out.
import { test } from "node:test";
import assert from "node:assert/strict";
import { decideAll, decideItem } from "../src/core/decide-item.ts";
import { SCOPE_LABELS, TYPE_LABEL_NAMES, PLUGIN_LABEL } from "../src/core/item-rules.ts";
import type { ItemPlan } from "../src/core/plan.ts";
import { SCOPE_LABELS as OLD_SCOPE } from "../src/decide/select.ts";
import { TYPE_LABELS } from "../src/labels/set.ts";
import { PLUGIN_LABEL as OLD_PLUGIN } from "../src/labels/plan.ts";
import { NOW, itemFacts, prFacts } from "./world.ts";

type Over = Parameters<typeof itemFacts>[0];
type Row = { name: string; facts: Over; expect: { state: string; actions?: string[]; next?: string; wait?: string | null } };

const tokens = (p: ItemPlan): string[] => p.actions.map((a) => a.kind).sort();
const T = "2026-11-04";
const jev = (o: Partial<{ at: string; changed: boolean; unsure: boolean }> = {}) => ({ at: `${T}T08:00:00.000Z`, changed: false, unsure: false, ...o });
const disagree = (o: Over = {}): Over => ({ classification: { status: "disagree", label: null, jevLabel: "bugfix", haikuLabel: "infra", jev: jev({ unsure: true }), haiku: { at: `${T}T09:00:00.000Z`, aloneCurrent: false }, ...(o?.classification ?? {}) } });
const scopeDisagree: Over = { classification: { status: "disagree", label: null, jevLabel: "missing feature", haikuLabel: "small extra", jev: jev({ unsure: true }), haiku: { at: `${T}T09:00:00.000Z`, aloneCurrent: false } } };
const needsDecision: Over = { classification: { flags: ["needs decision"] }, labels: { existing: ["bugfix", "needs decision"] } };
const att = (state: string, o: Partial<{ textChanged: boolean; headDone: boolean; baseDone: boolean }> = {}) => ({ state, textChanged: false, headDone: false, baseDone: true, ...o });
const fixable = (o: Over = {}): Over => ({ ...o, fix: { impact: "P2", ...(o?.fix ?? {}) } });
const closed = (o: Partial<{ decisionId: string; kind: "scope" | "close" | "duplicate" | "merge"; security: boolean; action: string | null }> = {}) => ({ decisionId: "d1", kind: "close" as const, security: false, action: null, ...o });
const hoursAgo = (h: number) => new Date(NOW - h * 3600_000).toISOString();

const rows: Row[] = [
  { name: "a classified, labelled, embedded issue has nothing due", facts: {}, expect: { state: "classified", actions: [], next: "Fix", wait: "an open request for a person to pick up" } },

  // ---- classify
  { name: "no verdict in the run: Jev is due", facts: { classification: { status: "unclassified", label: null, jevLabel: null, jev: null } }, expect: { state: "unclassified", actions: ["classify"], next: "Classify" } },
  { name: "no classification run yet: nothing to classify", facts: { run: null, classification: { status: "unclassified", label: null, jevLabel: null, jev: null } }, expect: { state: "unclassified", actions: [] } },
  { name: "the item's text changed since Jev's verdict", facts: { classification: { jev: jev({ changed: true }) } }, expect: { state: "classified", actions: ["classify"] } },
  { name: "Haiku classified it alone at the current text: not due for Jev", facts: { classification: { status: "settled", jev: null, haiku: { at: `${T}T08:00:00.000Z`, aloneCurrent: true } } }, expect: { state: "classified", actions: [] } },
  { name: "Jev unsure, no Haiku verdict: Haiku is due", facts: { classification: { status: "waiting", label: null, jev: jev({ unsure: true }) } }, expect: { state: "waiting-haiku", actions: ["classify"], next: "Classify" } },
  { name: "Haiku older than Jev: Haiku is due again", facts: { classification: { status: "waiting", label: null, jev: jev({ unsure: true }), haiku: { at: `${T}T07:00:00.000Z`, aloneCurrent: false } } }, expect: { state: "waiting-haiku", actions: ["classify"] } },
  { name: "Haiku as new as Jev's verdict: not due", facts: { classification: { status: "settled", jev: jev({ unsure: true }), haiku: { at: `${T}T09:00:00.000Z`, aloneCurrent: false } } }, expect: { state: "classified", actions: [] } },
  { name: "an item out of scope is not classified", facts: { inScope: false, classification: { status: "unclassified", label: null, jev: null } }, expect: { state: "unclassified", wait: "not in scope" } },
  { name: "our own integration PR is not classified", facts: { kind: "pr", integration: true, classification: { status: "unclassified", label: null, jev: null } }, expect: { state: "unclassified", actions: [] } },
  { name: "a held item is still classified", facts: { held: "duplicate", classification: { status: "unclassified", label: null, jev: null } }, expect: { state: "held-duplicate", actions: ["classify"], next: "Held: waiting for a Duplicate? answer" } },

  // ---- referee and disagreement
  { name: "labels disagree, Sonnet has not answered", facts: disagree(), expect: { state: "referee-due", actions: ["referee"], next: "Referee: waiting for Sonnet" } },
  { name: "labels disagree, Sonnet was unsure: Opus is due", facts: disagree({ classification: { referee: { sure: false, final: false } } }), expect: { state: "referee-due", actions: ["referee"], next: "Referee: waiting for Opus" } },
  { name: "Sonnet sure: settled with its label", facts: { classification: { status: "settled", label: "infra", referee: { sure: true, final: false }, jevLabel: "bugfix", haikuLabel: "infra", jev: jev({ unsure: true }), haiku: { at: `${T}T09:00:00.000Z`, aloneCurrent: false } }, labels: { existing: ["infra"] } }, expect: { state: "classified", actions: [] } },
  { name: "a draft is not refereed", facts: { ...disagree(), draft: true }, expect: { state: "referee-due", actions: [], wait: "the label referee" } },
  { name: "a held item is not refereed", facts: { ...disagree(), held: "backlog" }, expect: { state: "held-backlog", actions: [] } },
  { name: "scope-vs-scope disagreement goes to Decide, not to the referee", facts: scopeDisagree, expect: { state: "scope-due", actions: ["decide"], next: "Decide" } },

  // ---- prioritize, embed
  { name: "no priority row", facts: { priorityHash: null }, expect: { state: "classified", actions: ["prioritize"] } },
  { name: "priority made at older text", facts: { priorityHash: "old" }, expect: { state: "classified", actions: ["prioritize"] } },
  { name: "no vector for the current model", facts: { embeddedHash: null }, expect: { state: "classified", actions: ["embed"] } },
  { name: "vector of older text: embed again, no scan until it is current", facts: { embeddedHash: "old", scannedHash: null }, expect: { state: "classified", actions: ["embed"] } },
  { name: "embed does not depend on scope", facts: { inScope: false, embeddedHash: null }, expect: { state: "classified", actions: ["embed"] } },
  { name: "out of scope: priority waits", facts: { inScope: false, priorityHash: null }, expect: { state: "classified", actions: [] } },

  // ---- duplicates
  { name: "embedded and not scanned yet", facts: { scannedHash: null }, expect: { state: "classified", actions: ["dupes"] } },
  { name: "scanned at older text", facts: { scannedHash: "old" }, expect: { state: "classified", actions: ["dupes"] } },
  { name: "in an unchecked pair", facts: { pairsToCheck: 2 }, expect: { state: "classified", actions: ["dupes"] } },
  { name: "an out-of-scope item whose partner is in scope is still in the pair check", facts: { inScope: false, pairsToCheck: 1 }, expect: { state: "classified", actions: ["dupes"] } },
  { name: "member of a group to ask about", facts: { inGroupToAsk: true }, expect: { state: "classified", actions: ["dupes"] } },
  { name: "an operator's duplicate answer waits to be applied", facts: { dupeAnswers: ["app#1:duplicate@2"] }, expect: { state: "classified", actions: ["dupe-answer"] } },
  { name: "member of a set to compare", facts: { inCompareSet: true }, expect: { state: "classified", actions: ["dupes-compare"] } },
  { name: "pair check and compare together", facts: { pairsToCheck: 1, inCompareSet: true }, expect: { state: "classified", actions: ["dupes", "dupes-compare"] } },

  // ---- scope decision
  { name: "needs-decision flag, nobody asked", facts: needsDecision, expect: { state: "scope-due", actions: ["decide"], next: "Decide" } },
  { name: "a scope decision is open", facts: { ...needsDecision, scope: { open: true, covered: true } }, expect: { state: "scope-open", actions: [], next: "Decide: waiting for a scope answer", wait: "a scope answer" } },
  { name: "a scope decision was answered: covered", facts: { ...needsDecision, scope: { covered: true, answer: "take" } }, expect: { state: "classified", actions: [] } },
  { name: "a PR settled as plugin candidate stays open with its label", facts: { kind: "pr", classification: { label: "plugin candidate" }, labels: { existing: ["plugin candidate"] } }, expect: { state: "classified", actions: [], wait: "stays open as a plugin candidate", next: "Stays open as a plugin candidate" } },
  { name: "a scope disagreement on a labelled item is asked", facts: scopeDisagree, expect: { state: "scope-due", actions: ["decide"] } },
  { name: "a failed Opus call is not repeated within the backoff", facts: disagree({ classification: { referee: { sure: false, final: false, failedAt: new Date(NOW - 60_000).toISOString() } } }), expect: { state: "referee-due", actions: [], wait: "the label referee" } },
  { name: "a decision covers the item", facts: { ...needsDecision, scope: { covered: true } }, expect: { state: "classified", actions: [] } },
  { name: "a draft is not asked about", facts: { ...needsDecision, draft: true }, expect: { state: "scope-due", actions: [] } },
  { name: "out of scope is not asked about", facts: { ...needsDecision, inScope: false }, expect: { state: "scope-due", actions: [] } },
  { name: "held items are not asked about", facts: { ...needsDecision, held: "duplicate" }, expect: { state: "held-duplicate", actions: [] } },
  { name: "open decision without Opus's recommendation", facts: { ...needsDecision, scope: { open: true, covered: true, recommend: { failures: 0, failedAt: null } } }, expect: { state: "scope-open", actions: ["decide"] } },
  { name: "recommendation failed an hour ago: retry", facts: { scope: { open: true, covered: true, recommend: { failures: 1, failedAt: hoursAgo(1.1) } } }, expect: { state: "scope-open", actions: ["decide"] } },
  { name: "recommendation failed minutes ago: wait", facts: { scope: { open: true, covered: true, recommend: { failures: 1, failedAt: hoursAgo(0.2) } } }, expect: { state: "scope-open", actions: [] } },
  { name: "recommendation failed three times: stop", facts: { scope: { open: true, covered: true, recommend: { failures: 3, failedAt: hoursAgo(5) } } }, expect: { state: "scope-open", actions: [] } },

  // ---- labels
  { name: "a settled type label is missing on GitHub", facts: { labels: { existing: [] } }, expect: { state: "classified", actions: ["label"] } },
  { name: "flags are added next to the type", facts: { classification: { flags: ["security"] }, labels: { existing: ["bugfix"] } }, expect: { state: "classified", actions: ["label", "fixissue"] } },
  { name: "another type label is on the item: conflict, nothing added", facts: { labels: { existing: ["infra"] } }, expect: { state: "classified", actions: [] } },
  { name: "label match ignores case", facts: { labels: { existing: ["Bugfix"] } }, expect: { state: "classified", actions: [] } },
  { name: "an operator's plugin answer decides the type", facts: { labels: { existing: [], pluginAnswer: true } }, expect: { state: "classified", actions: ["label"] } },
  { name: "the previous pass already added them", facts: { labels: { existing: [], labeledNote: "added: bugfix" } }, expect: { state: "classified", actions: [] } },
  { name: "labelling approval is a fact: gates() applies it, not decideItem", facts: { labels: { existing: [] }, repoFacts: { labelsApproved: false } }, expect: { state: "classified", actions: ["label"] } },
  { name: "a Backlog hold stops labelling", facts: { labels: { existing: [] }, held: "backlog" }, expect: { state: "held-backlog", actions: [] } },
  { name: "a duplicate hold does not stop labelling", facts: { labels: { existing: [] }, held: "duplicate" }, expect: { state: "held-duplicate", actions: ["label"] } },
  { name: "an unsettled item is not labelled", facts: { classification: { status: "waiting", label: null, jev: jev({ unsure: true }), haiku: { at: `${T}T09:00:00.000Z`, aloneCurrent: false } }, labels: { existing: [] } }, expect: { state: "waiting-haiku", actions: [] } },

  // ---- act
  { name: "an answered close decision is acted on", facts: { answeredClose: [closed()] }, expect: { state: "classified", actions: ["act"] } },
  { name: "scope, duplicate and merge closes are acted on too", facts: { answeredClose: [closed({ kind: "scope" }), closed({ decisionId: "d2", kind: "duplicate" })] }, expect: { state: "classified", actions: ["act", "act"] } },
  { name: "a done action row is final", facts: { answeredClose: [closed({ action: "done" })] }, expect: { state: "classified", actions: [] } },
  { name: "a skipped action row is final", facts: { answeredClose: [closed({ action: "skipped" })] }, expect: { state: "classified", actions: [] } },
  { name: "an item already closed on GitHub keeps its unapplied answered close (the Act step records it as already closed)", facts: { open: false, answeredClose: [closed()] }, expect: { state: "classified", actions: ["act"] } },
  { name: "a closed item gets nothing else: no classify, embed, prioritize or label", facts: { open: false, priorityHash: null, embeddedHash: null, classification: { status: "unclassified", label: null, jev: null }, answeredClose: [closed()] }, expect: { state: "unclassified", actions: ["act"] } },
  { name: "a closed item whose answered close is final has nothing due", facts: { open: false, embeddedHash: null, answeredClose: [closed({ action: "skipped" })] }, expect: { state: "classified", actions: [] } },
  { name: "a failed action row is tried again", facts: { answeredClose: [closed({ action: "failed" })] }, expect: { state: "classified", actions: ["act"] } },
  { name: "an out-of-scope item is not acted on", facts: { inScope: false, answeredClose: [closed()] }, expect: { state: "classified", actions: [] } },
  { name: "a security scan's close applies outside the pilot", facts: { inScope: false, answeredClose: [closed({ security: true })] }, expect: { state: "classified", actions: ["act"] } },
  { name: "a Backlog hold stops the close", facts: { held: "backlog", answeredClose: [closed({ security: true })] }, expect: { state: "held-backlog", actions: [] } },
  { name: "comment approval is a fact: gates() applies it, not decideItem", facts: { repoFacts: { commentApproved: false }, answeredClose: [closed()] }, expect: { state: "classified", actions: ["act"] } },
  { name: "a PR the final review says close is asked about", facts: { kind: "pr", closeReview: { head: "h1", atHead: true, asked: false } }, expect: { state: "classified", actions: ["act"] } },
  { name: "the Close? decision exists: not asked again", facts: { kind: "pr", closeReview: { head: "h1", atHead: true, asked: true } }, expect: { state: "classified", actions: [] } },
  { name: "the review is of an older head: not asked", facts: { kind: "pr", closeReview: { head: "h0", atHead: false, asked: false } }, expect: { state: "classified", actions: [] } },

  // ---- fix issue
  { name: "a settled bugfix issue is a fix candidate", facts: fixable(), expect: { state: "classified", actions: ["fixissue"], next: "Fix" } },
  { name: "approval is a fact: gates() applies it", facts: fixable({ repoFacts: { fixIssueApproved: false } }), expect: { state: "classified", actions: ["fixissue"] } },
  { name: "P4 priority is backlog", facts: fixable({ fix: { impact: "P4" } }), expect: { state: "classified", actions: [] } },
  { name: "a security flag lifts P4 to P3", facts: fixable({ fix: { impact: "P4" }, classification: { flags: ["security"] }, labels: { existing: ["bugfix", "security"] } }), expect: { state: "classified", actions: ["fixissue"] } },
  { name: "no priority row yet: a candidate", facts: fixable({ fix: { impact: null } }), expect: { state: "classified", actions: ["fixissue"] } },
  { name: "a PR is never a fix candidate", facts: fixable({ kind: "pr" }), expect: { state: "classified", actions: [] } },
  { name: "not a bugfix", facts: fixable({ classification: { label: "infra" }, labels: { existing: ["infra"] } }), expect: { state: "classified", actions: [] } },
  { name: "private repo", facts: fixable({ fix: { publicRepo: false } }), expect: { state: "classified", actions: [] } },
  { name: "repo without a Rust workspace", facts: fixable({ fix: { notRust: true } }), expect: { state: "classified", actions: [] } },
  { name: "an open PR closes the issue", facts: fixable({ fix: { openPr: { number: 7, closes: true } } }), expect: { state: "classified", actions: [], wait: "open PR #7" } },
  { name: "needs-decision flag without a scope decision", facts: fixable({ ...needsDecision, scope: { covered: true } }), expect: { state: "classified", actions: [] } },
  { name: "scope decision answered take by an operator", facts: fixable({ ...needsDecision, scope: { covered: true }, fix: { scopeDecision: { answer: "take", byOperator: true } } }), expect: { state: "classified", actions: ["fixissue"] } },
  { name: "scope decision answered take by someone else", facts: fixable({ fix: { scopeDecision: { answer: "take", byOperator: false } } }), expect: { state: "classified", actions: [] } },
  { name: "scope decision answered otherwise", facts: fixable({ fix: { scopeDecision: { answer: "backlog", byOperator: true } } }), expect: { state: "classified", actions: [] } },
  { name: "an attempt exists", facts: fixable({ fix: { attempt: att("pr-opened") } }), expect: { state: "classified", actions: [] } },
  { name: "a skipped attempt returns when the text changed", facts: fixable({ fix: { attempt: att("skipped", { textChanged: true }) } }), expect: { state: "classified", actions: ["fixissue"] } },
  { name: "a skipped attempt stays skipped when the text is the same", facts: fixable({ fix: { attempt: att("skipped") } }), expect: { state: "classified", actions: [] } },
  { name: "a duplicate hold keeps a new candidate out", facts: fixable({ held: "duplicate" }), expect: { state: "held-duplicate", actions: [] } },
  { name: "a retry round is due", facts: fixable({ fix: { attempt: att("retry") } }), expect: { state: "classified", actions: ["fixissue"], next: "Fix: in progress" } },
  { name: "a retry round is held by a Backlog answer", facts: fixable({ held: "backlog", fix: { attempt: att("retry") } }), expect: { state: "held-backlog", actions: [] } },
  { name: "a retry round of an out-of-scope issue", facts: fixable({ inScope: false, fix: { attempt: att("retry") } }), expect: { state: "classified", actions: [] } },

  // ---- fix issue collect
  { name: "build tasks finished: collect", facts: { fix: { attempt: att("testing", { headDone: true }) } }, expect: { state: "classified", actions: ["fixissue-collect"], next: "Fix: in progress" } },
  { name: "head task still running", facts: { fix: { attempt: att("testing") } }, expect: { state: "classified", actions: [] } },
  { name: "base task still running", facts: { fix: { attempt: att("testing", { headDone: true, baseDone: false }) } }, expect: { state: "classified", actions: [] } },
  { name: "a passed fix is opened as a PR", facts: { fix: { attempt: att("passed") } }, expect: { state: "classified", actions: ["fixissue-collect"] } },
  { name: "collect is held by a Backlog answer", facts: { held: "backlog", fix: { attempt: att("passed") } }, expect: { state: "held-backlog", actions: [] } },
  { name: "collect: a duplicate hold does not stop it", facts: { held: "duplicate", fix: { attempt: att("passed") } }, expect: { state: "held-duplicate", actions: ["fixissue-collect"] } },
  { name: "collect: out of scope", facts: { inScope: false, fix: { attempt: att("passed") } }, expect: { state: "classified", actions: [] } },

  // ---- next-step text of issues
  { name: "issue with a passed fix attempt", facts: { fix: { attempt: att("passed") } }, expect: { state: "classified", next: "Fix: pull request opened" } },
  { name: "issue with a failed fix attempt", facts: { fix: { attempt: att("failed") } }, expect: { state: "classified", next: "Needs a person" } },
  { name: "issue that is not a bugfix", facts: { classification: { label: "infra" }, labels: { existing: ["infra"] } }, expect: { state: "classified", next: "Triage by a person" } },
];

for (const r of rows) {
  test(r.name, () => {
    const f = itemFacts(r.facts);
    const p = decideItem(f);
    assert.equal(p.state, r.expect.state, "state");
    if (r.expect.actions) assert.deepEqual(tokens(p), [...r.expect.actions].sort(), "actions");
    if (r.expect.wait !== undefined) assert.equal(p.wait, r.expect.wait, "wait");
    if (r.expect.next) assert.equal(decideAll(f).next, r.expect.next, "next");
  });
}

test("a PR's triage actions and its review-to-merge actions are both due", () => {
  const v = decideAll(itemFacts({ kind: "pr", labels: { existing: [] } }), prFacts());
  assert.deepEqual(v.actions.map((a) => a.kind), ["label", "merge"]);
  assert.equal(v.pr?.state, "ready");
  assert.equal(v.next, "Merge queue");
  assert.equal(v.head, "h1");
});

test("a PR without a review is next to be reviewed; with a take-fix review, fix-up", () => {
  assert.equal(decideAll(itemFacts({ kind: "pr" }), prFacts({ review: null })).next, "Review");
  assert.equal(decideAll(itemFacts({ kind: "pr" }), prFacts({ review: { verdict: "take-fix" } })).next, "Fix-up");
  assert.equal(decideAll(itemFacts({ kind: "pr" }), prFacts({ review: { stale: true } })).next, "Review");
});

test("the constants copied into core equal the old modules'", () => {
  assert.deepEqual(SCOPE_LABELS, [...OLD_SCOPE]);
  assert.deepEqual(TYPE_LABEL_NAMES, TYPE_LABELS.map((l) => l.name));
  assert.equal(PLUGIN_LABEL, OLD_PLUGIN);
});
