// Safety invariants of the Plan, checked on random facts: whatever the facts, decide() and gates() never plan a write that
// the rules forbid. Set INVARIANT_SEED to replay a failing run.
import assert from "node:assert/strict";
import { test } from "node:test";
import { decideItem } from "../src/core/decide-item.ts";
import { decidePr } from "../src/core/decide.ts";
import { gates } from "../src/core/gates.ts";
import type { Action, ItemFacts, Plan, PrFacts } from "../src/core/plan.ts";
import { itemFacts, prFacts } from "./world.ts";

const CASES = 4000;

function prng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Rnd = { bool: (p?: number) => boolean; pick: <T>(xs: readonly T[]) => T; int: (n: number) => number };
const rnd = (r: () => number): Rnd => ({
  bool: (p = 0.5) => r() < p,
  pick: (xs) => xs[Math.floor(r() * xs.length)]!,
  int: (n) => Math.floor(r() * n),
});

const HEADS = ["h1", "h2", null] as const;

function randomPr(x: Rnd): PrFacts {
  const head = x.pick(["h1", "h1", "h1", "h2"]);
  const reviewHead = x.bool(0.85) ? head : "h0";
  const f = prFacts({
    ghState: x.pick(["OPEN", "OPEN", "OPEN", "MERGED", "CLOSED"] as const),
    head, draft: x.bool(0.1), tier: x.pick(["whitelisted", "whitelisted", "not", "allow", "deny"] as const),
    size: x.pick(["S", "S", "M", "L"] as const), label: x.pick(["bugfix", "bugfix", "infra", "performance", "plugin candidate", null]),
    needsDecisionFlag: x.bool(0.1), scopeAnswer: x.pick([null, null, null, "take", "small-extra", "close"]),
    inScope: x.bool(0.9), integration: x.bool(0.05), batchPr: x.bool(0.05), heldBacklog: x.bool(0.05), heldDuplicate: x.bool(0.05), mergeHeld: x.bool(0.1),
    authorIsPipeline: x.bool(0.1), pipelineOn: x.bool(0.9),
    repoFacts: { mergeApproved: x.bool(0.9), pushApproved: x.bool(0.8), commentApproved: x.bool(0.8), ciApproved: x.bool(0.8), noCi: x.bool(0.15), mainRed: x.bool(0.1) },
    ci: x.pick(["success", "success", "success", "failure", "pending", "none", "unknown"]),
    mergeable: x.pick(["MERGEABLE", "MERGEABLE", "MERGEABLE", "CONFLICTING", "UNKNOWN"]),
    checksHere: x.bool(0.9), checksOpen: x.bool(0.9), pushable: x.bool(0.7), inActiveBatch: x.bool(0.1), mainFix: x.bool(0.05), baseOffDefault: x.bool(0.05), stackedOn: x.bool(0.05) ? 1 : null,
    premergeFixUsed: x.bool(0.2), runsApprovedAfterMerge: x.bool(0.2),
    batch: x.pick([null, null, null, null, "batch-checking", "in-batch", "batch-failed"] as const),
    changesRequested: x.bool(0.08) ? { why: "ana asked for changes", live: x.bool() } : null,
    review: x.bool(0.05) ? null : {
      head: reviewHead, verdict: x.pick(["take", "take", "take", "take-fix", "hold", "close"]), unsure: x.bool(0.25),
      mode: x.pick(["full", "full", "skipped"]), stale: x.bool(0.1), staleActionable: x.bool(0.1), fixes: x.int(3),
    },
    verification: x.bool(0.1) ? null : { state: x.pick(["passed", "passed", "ci-enough", "failed", "error", "running", "planned", "stale", "unavailable"]) },
    decision: {
      asked: x.bool(0.3), openQuestion: x.bool(0.15), answer: x.pick([null, null, null, "merge", "merge", "hold", "close"]),
      mergeAnswerAfterReview: x.bool(0.6), inOpenGroup: x.bool(0.05), hold: { asked: x.bool(0.3), open: x.bool(0.1), answer: x.pick([null, null, "wait", "close"]), otherOpen: x.bool(0.1) },
    },
    premerge: x.bool(0.15) ? null : {
      tries: x.int(4), hasFindings: x.bool(0.85), unsure: false, defects: x.pick([0, 0, 0, 1, 2]), defectsAllFixable: x.bool(0.7), fixesSafe: x.bool(0.7), minor: x.int(2), error: null,
    },
    lastMerge: x.pick([null, null, null, { outcome: "refused", reason: "ci pending", ci: "pending", mergeable: "MERGEABLE" }, { outcome: "merged", reason: null, ci: null, mergeable: null }]),
    conflict: x.bool(0.3) ? { bucket: x.pick(["merge", "ask", "held"]), base: "main", baseOk: x.bool(0.9) } : null,
    fixup: x.bool(0.5) ? { fixes: x.int(3), attempts: x.int(3), recorded: x.bool(0.3) ? [x.pick(["asked", "pushed", "cannot-push", "too-large"])] : [] } : null,
    carry: x.bool(0.1) ? [{ attempts: x.int(3) }] : [],
    cifix: x.bool(0.3) ? {
      states: x.bool(0.2) ? [x.pick(["pushed", "failed", "capped"])] : [], tries: x.int(3), rerunAt: null, infraRuns: x.bool(0.2) ? [1] : null,
      formattingTask: null, formatterEnded: false, totalPushes: x.int(3), totalTries: x.int(5), checksAt: null,
    } : null,
    runs: x.bool(0.2) ? { waiting: x.int(3), reread: x.bool(), crossRepo: x.bool(), approvable: x.int(2), blocked: null } : null,
    postmerge: x.bool(0.05) ? { mergedAt: "2026-11-04T09:00:00.000Z", head: "h1", since: "2026-11-01T00:00:00.000Z", review: null } : null,
  } as Parameters<typeof prFacts>[0]);
  if (x.bool(0.1)) f.head = x.pick(HEADS);
  return f;
}

function randomItem(x: Rnd): ItemFacts {
  return itemFacts({
    kind: x.pick(["pr", "issue"] as const), open: x.bool(0.9), draft: x.bool(0.1), inScope: x.bool(0.7), integration: x.bool(0.05),
    held: x.pick([null, null, null, "backlog", "duplicate"] as const), pipelineOn: x.bool(0.85), run: x.pick(["run1", "run1", null]),
    repoFacts: { labelsApproved: x.bool(0.8), commentApproved: x.bool(0.8), fixIssueApproved: x.bool(0.8) },
    classification: {
      status: x.pick(["settled", "settled", "waiting", "disagree", "unclassified"] as const), label: x.pick(["bugfix", "bugfix", "plugin candidate", null]),
      flags: x.pick([[], [], ["needs decision"], ["security"]]), jevLabel: x.pick(["bugfix", "small extra", "plugin candidate"]), haikuLabel: x.pick([null, "bugfix", "small extra"]),
    },
    embeddedHash: x.pick(["e1", "e1", null]), priorityHash: x.pick(["e1", "e1", null]), scannedHash: x.pick(["e1", "e1", null]),
    pairsToCheck: x.int(2), inGroupToAsk: x.bool(0.1), dupeAnswers: x.bool(0.1) ? ["d1"] : [],
    scope: { open: x.bool(0.1), covered: x.bool(0.2), answer: null, recommend: x.bool(0.1) ? { failures: x.int(3), failedAt: null } : null },
    labels: { existing: x.pick([["bugfix"], []]), pluginAnswer: x.bool(0.1), labeledNote: null },
    answeredClose: x.bool(0.2) ? [{ decisionId: "d", kind: x.pick(["scope", "close", "duplicate", "merge"] as const), security: x.bool(0.2), action: x.pick([null, null, "failed", "done"]) }] : [],
    closeReview: x.bool(0.1) ? { head: "h1", atHead: x.bool(), asked: x.bool() } : null,
    fix: {
      attempt: x.bool(0.3) ? { state: x.pick(["retry", "testing", "passed", "skipped", "failed"]), textChanged: x.bool(), headDone: x.bool(), baseDone: x.bool() } : null,
      publicRepo: x.bool(0.9), notRust: x.bool(0.1), openPr: x.bool(0.1) ? { number: 7, closes: x.bool(0.5) } : null, impact: x.pick(["P0", "P2", "P4"]), scopeDecision: null,
    },
  } as Parameters<typeof itemFacts>[0]);
}

const asWant = (a: Action) => ({ kind: a.kind, ...(typeof a.params?.bucket === "string" ? { bucket: a.params.bucket } : {}) });
const has = (p: Plan, kind: string, pred: (a: Action) => boolean = () => true) => p.actions.filter((a) => a.kind === kind && pred(a));
const label = (a: Action) => a.kind + (a.params?.bucket ? `:${String(a.params.bucket)}` : "");

function checkPr(f: PrFacts): void {
  const p = decidePr(f);
  const merges = has(p, "merge");
  const answer = f.decision.answer;
  const declined = answer !== null && answer !== "merge";

  // 1. An unsure head merges only on an operator's Merge answer given after the latest review.
  if (f.review?.unsure && merges.length) assert.ok(answer === "merge" && f.decision.mergeAnswerAfterReview, "merge on an unsure head without a later Merge answer");
  // 2. After a Hold or Close answer nothing merges and no pre-merge fix-up runs.
  if (declined) {
    assert.equal(merges.length, 0, "merge after a Hold/Close answer");
    assert.deepEqual(p.actions.filter((a) => ["fixup", "conflict", "cifix"].includes(a.kind)).map(label), [], "push action after a Hold/Close answer");
  }
  if (merges.length) {
    assert.ok(f.review && (f.review.verdict === "take" || f.review.verdict === "take-fix"), "merge without a take review");
    // 3. A merge by rule has a clean pre-merge review.
    if (p.path === "rule") {
      assert.ok(f.premerge && f.premerge.hasFindings && f.premerge.defects === 0, "rule merge without a clean pre-merge review");
      // 5. Rule path: CI is green and verification ok.
      assert.equal(f.ci, "success", "rule merge with CI not green");
      assert.ok(["passed", "ci-enough"].includes(f.verification?.state ?? ""), "rule merge with verification not ok");
    } else assert.equal(p.path, "operator");
    // 4. Never while held, changes-requested, conflicting, not open, a draft, or on an unreviewed head.
    assert.equal(f.mergeHeld, false, "merge while held");
    assert.equal(f.changesRequested, null, "merge while changes are requested");
    assert.equal(f.mergeable, "MERGEABLE", "merge while not mergeable");
    assert.equal(f.ghState, "OPEN", "merge of a PR not open");
    assert.equal(f.heldBacklog || f.heldDuplicate, false, "merge of a held PR");
    assert.equal(f.review!.head, f.head, "merge at a head other than the reviewed head");
    // 9. A batch member is merged by its batch, not alone.
    assert.equal(f.batch, null, "single merge of a batch member");
    assert.ok(f.ci === "success" || (p.path === "operator" && f.ci === "none" && f.repoFacts.noCi), "merge with CI not green");
  }
  // 6. Out of scope: nothing at all.
  if (!f.inScope) assert.deepEqual(p.actions, [], "action for an out-of-scope PR");
  for (const a of p.actions) {
    // 7. A fix-up that pushes needs a pushable branch.
    if (a.kind === "fixup" && a.params?.bucket === "fix") assert.ok(f.pushable && f.repoFacts.pushApproved, "fixup:fix without a pushable, approved branch");
    // 8. Every action is for the plan's head (a post-merge review names the merged head).
    if (a.kind !== "postmerge") assert.equal(a.head, p.head, `${label(a)} at a head other than the plan's`);
    // 10. The pipeline switch off refuses every write; a missing approval refuses its write.
    if (!f.pipelineOn) assert.ok(gates(f, asWant(a), "pipeline"), `${label(a)} passes the gates with the pipeline off`);
  }
  if (merges.length && !f.repoFacts.mergeApproved) assert.ok(gates(f, { kind: "merge" }, "pipeline"), "merge passes the gates without merge approval");
}

function checkItem(f: ItemFacts): void {
  const p = decideItem(f);
  const writes = p.actions.filter((a) => ["label", "fixissue", "fixissue-collect", "act"].includes(a.kind));
  // 6. Out of scope: no write, except the answered close of a security-scan question.
  if (!f.inScope) for (const a of writes) assert.ok(a.kind === "act" && a.params?.security === true, `${label(a)} for an out-of-scope item`);
  // A Backlog hold stops labelling, closing and fixing.
  if (f.held === "backlog") assert.deepEqual(writes, [], "write for an item held by Backlog");
  // A closed item has only its answered close left.
  if (!f.open) assert.ok(p.actions.every((a) => a.kind === "act" && !a.params?.ask), "action for a closed item other than its close");
  if (!f.pipelineOn) for (const a of p.actions) assert.ok(gates(f, asWant(a), "pipeline"), `${label(a)} passes the gates with the pipeline off`);
  for (const a of writes) if (a.kind === "fixissue" || a.kind === "fixissue-collect") assert.equal(f.kind, "issue", "fix-issue for a PR");
}

test("safety invariants hold on random facts", () => {
  const seed = process.env.INVARIANT_SEED ? Number(process.env.INVARIANT_SEED) : (Date.now() & 0x7fffffff);
  const x = rnd(prng(seed));
  for (let i = 0; i < CASES; i++) {
    const pr = randomPr(x);
    try { checkPr(pr); } catch (e) {
      throw new Error(`INVARIANT_SEED=${seed} case ${i}: ${(e as Error).message}\n${JSON.stringify(pr)}`, { cause: e });
    }
    const item = randomItem(x);
    try { checkItem(item); } catch (e) {
      throw new Error(`INVARIANT_SEED=${seed} case ${i}: ${(e as Error).message}\n${JSON.stringify(item)}`, { cause: e });
    }
  }
});
