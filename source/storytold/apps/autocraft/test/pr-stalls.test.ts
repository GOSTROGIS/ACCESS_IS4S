// PR stalls: every PR that needs a person is asked (a decision) or shows a typed wait with the reason; nothing waits silently.
import { test } from "node:test";
import assert from "node:assert/strict";
import { decidePr } from "../src/core/decide.ts";
import { NOW, prFacts } from "./world.ts";

const kinds = (f: Parameters<typeof prFacts>[0]) => decidePr(prFacts(f)).actions.filter((a) => a.kind !== "unassign").map((a) => `${a.kind}${a.params?.hold ? ":hold" : ""}${a.params?.withdraw ? ":withdraw" : ""}${typeof a.params?.bucket === "string" ? `:${a.params.bucket}` : ""}`);
const cifix = (o: Record<string, unknown> = {}) => ({ states: [] as string[], tries: 0, rerunAt: null, infraRuns: null, formattingTask: null, formatterEnded: true, totalPushes: 0, totalTries: 0, checksAt: null, skipReason: null, ...o });
const HOLD = { review: { verdict: "hold" } } as const;

test("a hold review asks the Hold question once, waits on the person, then on the author after Wait", () => {
  assert.deepEqual(kinds(HOLD), ["ask-merge:hold"]);
  const open = decidePr(prFacts({ ...HOLD, decision: { hold: { asked: true, open: true, answer: null, otherOpen: false } } }));
  assert.deepEqual(open.actions.filter((a) => a.kind !== "unassign"), []);
  assert.equal(open.waitKind, "person");
  const waiting = decidePr(prFacts({ ...HOLD, decision: { hold: { asked: true, open: false, answer: "wait", otherOpen: false } } }));
  assert.equal(waiting.waitKind, "contributor");
});

test("a Hold question left open for a head that is no longer held is set aside", () => {
  assert.deepEqual(kinds({ review: { verdict: "take", stale: true }, decision: { hold: { asked: true, open: true, answer: null, otherOpen: false } } }).filter((k) => k.startsWith("ask-merge")), ["ask-merge:hold:withdraw"]);
});

test("red CI that holds the review with no take review at the head asks the contributor", () => {
  const f = { review: { verdict: "hold", head: "h0" }, ci: "failure", cifix: cifix(), reviewHold: { kind: "ci", wait: "CI on the latest commit to pass", red: true } } as const;
  assert.deepEqual(kinds(f), ["cifix:ask"]);
  const asked = decidePr(prFacts({ ...f, cifix: cifix({ states: ["asked"] }) }));
  assert.equal(asked.waitKind, "contributor");
  const skipped = decidePr(prFacts({ ...f, cifix: cifix({ states: ["skipped"], skipReason: "nothing to fix" }) }));
  assert.equal(skipped.waitKind, "person");
});

test("a CI fix whose comment failed, or did not reach GitHub after the last retry, waits on a person", () => {
  for (const c of [cifix({ states: ["comment-failed"] }), cifix({ states: ["comment-unsent", "comment-unsent", "comment-unsent"], unsent: "final" })]) {
    const p = decidePr(prFacts({ ci: "failure", cifix: c }));
    assert.deepEqual([p.actions.filter((a) => a.kind !== "unassign"), p.wait, p.waitKind], [[], "a person: the CI fix comment failed", "person"]);
  }
});

test("a failed or errored verification asks Merge? with the failure, and the answer stands", () => {
  for (const state of ["failed", "error"]) {
    const p = decidePr(prFacts({ verification: { state, kind: "tests", summary: "2 tests fail", note: null } }));
    assert.equal(p.state, "needs-decision");
    assert.ok(p.actions.some((a) => a.kind === "ask-merge"));
    assert.ok(p.reasons.some((r) => r.startsWith("verification") && r.includes("2 tests fail")));
    const merged = decidePr(prFacts({ verification: { state, kind: "tests", summary: "2 tests fail", note: null }, decision: { asked: true, answer: "merge", mergeAnswerAfterReview: true }, verifyOverride: true }));
    assert.equal(merged.path, "operator");
    const merge = merged.actions.find((a) => a.kind === "merge");
    assert.equal(merge?.params?.singleOnly, true);
    // An answer given before the verification result does not override it.
    const before = decidePr(prFacts({ verification: { state, kind: "tests", summary: "2 tests fail", note: null }, decision: { asked: true, answer: "merge", mergeAnswerAfterReview: true }, verifyOverride: false }));
    assert.ok(!before.actions.some((a) => a.kind === "merge"));
  }
});

test("a mergeable state still unknown after GitHub was asked to compute it asks Merge?; before that the wait says how often it was asked", () => {
  const since = new Date(NOW - 10 * 3600_000).toISOString();
  const reading = decidePr(prFacts({ mergeable: "UNKNOWN", unknown: { since, reads: 3, rereads: 0, stuck: false } }));
  assert.equal(reading.state, "waiting-ci");
  assert.match(reading.wait ?? "", /3 checks reads/);
  const stuck = decidePr(prFacts({ mergeable: "UNKNOWN", unknown: { since, reads: 6, rereads: 1, stuck: true } }));
  assert.equal(stuck.state, "needs-decision");
  assert.ok(stuck.actions.some((a) => a.kind === "ask-merge"));
  assert.ok(stuck.reasons.some((r) => r.includes("unknown")));
});

test("an idle CI fix asks the Hold question with the reason; a refusal from GitHub is retried once first", () => {
  const idle = decidePr(prFacts({ ci: "failure", cifix: cifix({ states: ["skipped"], skipReason: "only an optional check failed" }) }));
  const ask = idle.actions.find((a) => a.kind === "ask-merge");
  assert.equal(ask?.params?.hold, true);
  assert.match(String(ask?.params?.ci), /nothing to fix/);
  const flaky = (refusals: number) => decidePr(prFacts({ lastMerge: { outcome: "refused", reason: "gh: HTTP 502 Bad Gateway", ci: "success", mergeable: "MERGEABLE", refusals } }));
  assert.ok(flaky(1).actions.some((a) => a.kind === "merge"));
  assert.equal(flaky(2).state, "needs-decision");
});

test("a Hold question settled without a pending action is never a silent wait", () => {
  const p = decidePr(prFacts({ ...HOLD, decision: { hold: { asked: true, open: false, answer: "handled", otherOpen: false } } }));
  assert.equal(p.waitKind, "person");
  const grouped = decidePr(prFacts({ ...HOLD, decision: { inOpenGroup: true } }));
  assert.deepEqual(grouped.actions.filter((a) => a.kind === "ask-merge"), []);
  assert.equal(grouped.waitKind, "person");
});

test("a PR whose label gets no review names what it waits on", () => {
  const p = decidePr(prFacts({ review: null, label: "documentation" }));
  assert.equal(p.state, "label-not-reviewed");
  assert.equal(p.waitKind, "person");
});

test("a merge refused for a reason other than CI or mergeable asks Merge?; a state refusal waits for the change", () => {
  const refused = (reason: string) => ({ lastMerge: { outcome: "refused", reason, ci: "success", mergeable: "MERGEABLE" } });
  const other = decidePr(prFacts(refused("REFUSED app#1: the PR touches a protected file")));
  assert.equal(other.state, "needs-decision");
  assert.ok(other.reasons.some((r) => r.includes("protected file")));
  const state = decidePr(prFacts(refused("not ready at merge time: CI pending, mergeable unknown")));
  assert.equal(state.state, "refused");
  // An operator who already answered Merge and was refused is shown a person wait with the reason.
  const answered = decidePr(prFacts({ ...refused("REFUSED app#1: the PR touches a protected file"), decision: { asked: true, answer: "merge", mergeAnswerAfterReview: true } }));
  assert.equal(answered.waitKind, "person");
  assert.match(answered.wait ?? "", /protected file/);
});

test("the Hold question is written once per head, prepared like other questions, and set aside by a new review", async () => {
  const { world } = await import("./world-db.ts");
  const { askHoldDecisions } = await import("../src/act/index.ts");
  const { saveOpus } = await import("../src/review/opus.ts");
  const w = world().repo().pr(1).review(1, { verdict: "hold", reason: "needs a design call" });
  try {
    assert.equal(w.prPlan(1).state, "opus-hold");
    const ids = askHoldDecisions(w.db, new Date().toISOString());
    assert.deepEqual(ids, ["app#1:hold@" + (w.prPlan(1).head ?? "")]);
    const d = w.rows("SELECT kind, question, options, facts FROM decisions WHERE id = ?", ids[0]!)[0]!;
    assert.equal(d.kind, "hold");
    assert.deepEqual((JSON.parse(String(d.options)) as { key: string }[]).map((o) => o.key), ["wait", "close"]);
    assert.ok(String(d.facts).includes("needs a design call"));
    // Asked: the plan waits on a person and does not ask again.
    assert.deepEqual(w.prPlan(1).actions.filter((a) => a.kind === "ask-merge"), []);
    assert.equal(w.prPlan(1).waitKind, "person");
    assert.deepEqual(askHoldDecisions(w.db, new Date().toISOString()), []);
    // A new review at the same head sets the question aside; a hold again asks it anew.
    saveOpus(w.db, "rv2", { repo: "app", number: 1, head_oid: w.prPlan(1).head! }, { mode: "full", base: null, model: "m", review: { ref: "app#1", verdict: "hold", sure: true, reason: "still open", fixes: [], risks: [], summary: null, why: null, public: null, conflicts: [], claims: [], blocked_by: [] } });
    // A review made again that still says hold keeps the open question (its prepare is redone from the newer review time).
    assert.equal(w.rows("SELECT 1 FROM decisions WHERE id LIKE '%:hold@%~replaced-%'").length, 0);
    assert.deepEqual(askHoldDecisions(w.db, new Date().toISOString()), []);
    // A changed verdict sets it aside.
    saveOpus(w.db, "rv3", { repo: "app", number: 1, head_oid: w.prPlan(1).head! }, { mode: "full", base: null, model: "m", review: { ref: "app#1", verdict: "take", sure: true, reason: "fine now", fixes: [], risks: [], summary: null, why: null, public: null, conflicts: [], claims: [], blocked_by: [] } });
    assert.equal(w.rows("SELECT 1 FROM decisions WHERE id LIKE '%:hold@%~replaced-%'").length, 1);
  } finally { w.close(); }
});

test("a hold review whose item has another open question waits for it instead of replacing it", () => {
  const p = decidePr(prFacts({ ...HOLD, decision: { hold: { asked: false, open: false, answer: null, otherOpen: true } } }));
  assert.deepEqual(p.actions.filter((a) => a.kind !== "unassign"), []);
  assert.equal(p.waitKind, "person");
});

test("from database rows: red CI at a new head with an earlier non-take review asks the contributor once", async () => {
  const { world } = await import("./world-db.ts");
  const w = world().repo().pr(1, { ci: "failure" }).review(1, { verdict: "close", head: "oldhead" });
  try {
    const p = w.prPlan(1);
    assert.deepEqual(p.actions.filter((a) => a.kind === "cifix").map((a) => a.params?.bucket), ["ask"]);
  } finally { w.close(); }
});

test("from database rows: a Merge answer given while verification ran does not cover its failure; the question is asked again", async () => {
  const { world } = await import("./world-db.ts");
  const { setAsideAnswerBeforeFailure, verifyOverride } = await import("../src/merge/verify-override.ts");
  const w = world().repo().pr(1, { ci: "success" }).review(1, { verdict: "take" }).verified(1, "running").answer(1, "merge");
  try {
    const head = w.prPlan(1).head!;
    // The verification fails after the answer.
    w.db.prepare("UPDATE verifications SET state = 'failed', summary = 'tests fail', finished_at = '2999-01-01T00:00:00.000Z' WHERE repo = 'app' AND number = 1").run();
    assert.equal(verifyOverride(w.db, "app", 1, head), false);
    assert.ok(!w.prPlan(1).actions.some((a) => a.kind === "merge"));
    assert.equal(setAsideAnswerBeforeFailure(w.db, "app", 1, head, new Date().toISOString()), true);
    const p = w.prPlan(1);
    assert.equal(p.state, "needs-decision");
    assert.ok(p.actions.some((a) => a.kind === "ask-merge"));
    // An answer given after the result stands.
    w.db.prepare("UPDATE verifications SET finished_at = '2000-01-01T00:00:00.000Z' WHERE repo = 'app' AND number = 1").run();
    w.answer(1, "merge");
    assert.equal(verifyOverride(w.db, "app", 1, head), true);
  } finally { w.close(); }
});
