// The pre-approved merge: a fix-up pushed, a take review, green CI and the hand-over to the merge queue; and a foreign push that cancels it.
import assert from "node:assert/strict";
import { afterEach, describe, test } from "node:test";
import { actionable } from "../src/decisions.ts";
import { mergeDecisionId } from "../src/core/rules.ts";
import { reviewHolds } from "../src/review/gate.ts";
import { advancePreapprovals, cancelPreapproval, preapprovalOf, preapproveMerge, runPipelineStep } from "../src/preapproval/index.ts";
import { addFastTrack, fastScoreOf, fastTrackList, setFastTrackWeight, workScores } from "../src/fasttrack.ts";
import { operatorEditable, splitChanges } from "../src/fixup/patch.ts";
import { operatorCommentText } from "../src/fixup/template.ts";
import { scopeToTracked } from "../src/repos.ts";
import { OPERATOR, T0, world, type World } from "./world-db.ts";
import { queueAdd, queueOrigins } from "../src/dash/api/queue-page.ts";
import type { Req } from "../src/dash/types.ts";
import type { CachedEntry } from "../src/core/plan-read.ts";

let current: World | null = null;
const fresh = (): World => (current = world().repo());
afterEach(() => current?.close());

const start = (w: World, n: number, merge = true) =>
  runPipelineStep(w.db, { repo: "app", number: n, step: { kind: "fixup", instructions: "rename a to b", merge }, by: OPERATOR });
const fixId = (w: World, n: number): number => (w.rows("SELECT id FROM operator_fixups WHERE number = ? ORDER BY id DESC", n)[0]!.id as number);
const fixRow = (w: World, n: number, state: string, to: string | null = null) =>
  w.db.prepare("INSERT INTO fixups (repo, number, from_head, to_head, state, attempt, created_at, source, operator_fix) VALUES ('app', ?, ?, ?, ?, 1, ?, 'operator', ?)").run(n, `sha${n}`, to, state, T0, fixId(w, n));
const pushed = (w: World, n: number, to: string) => fixRow(w, n, "pushed", to);
const kindsOf = (w: World, n: number) => w.prPlan(n).actions.map((a) => `${a.kind}:${String(a.params?.source ?? "")}`);
/** A pre-approved merge whose fix-up pushed `<n>b` and whose sure take review of it exists: it waits in ci for CI and the pre-merge review. */
const inCi = async (w: World, n: number) => {
  await start(w, n);
  pushed(w, n, `sha${n}b`);
  w.synced(n, `sha${n}b`).review(n, { head: `sha${n}b` });
  settle(w);
  assert.equal(preapprovalOf(w.db, "app", n)?.state, "ci");
};
const answerOf = (w: World, n: number, head: string) => w.rows("SELECT answer FROM decisions WHERE id = ?", mergeDecisionId("app", n, head));
const settle = (w: World) => { for (let i = 0; i < 5; i++) advancePreapprovals(w.db); };

describe("pre-approved merge", () => {
  test("fix-up pushed, review take, CI green: the Merge answer is written for the operator", async () => {
    const w = fresh().pr(1).review(1, { verdict: "take-fix" });
    await start(w, 1);
    assert.equal(preapprovalOf(w.db, "app", 1)?.state, "fixup");
    // The planner works the operator's fix-up and merges nothing meanwhile.
    const kinds = w.prPlan(1).actions.map((a) => `${a.kind}:${String(a.params?.source ?? "")}`);
    assert.ok(kinds.includes("fixup:operator"), kinds.join());
    assert.ok(!kinds.some((k) => k.startsWith("fixup:review") || k.startsWith("merge")), kinds.join());

    pushed(w, 1, "sha1b");
    w.synced(1, "sha1b");
    settle(w);
    assert.equal(preapprovalOf(w.db, "app", 1)?.state, "review");
    assert.equal(preapprovalOf(w.db, "app", 1)?.head, "sha1b");

    w.review(1, { head: "sha1b" });
    settle(w);
    // CI is green, but the pre-merge review of the pushed head comes first.
    assert.equal(preapprovalOf(w.db, "app", 1)?.state, "ci");
    assert.ok(kindsOf(w, 1).includes("premerge:"), kindsOf(w, 1).join());
    w.premerge(1, "clean");
    settle(w);
    const p = preapprovalOf(w.db, "app", 1)!;
    assert.equal(p.state, "queued");
    const id = mergeDecisionId("app", 1, "sha1b");
    assert.deepEqual(actionable(w.db).filter((a) => a.id === id).map((a) => [a.answer, a.kind]), [["merge", "merge"]]);
    assert.ok(w.rows("SELECT state FROM preapprovals").every((r) => r.state === "queued"));
    assert.ok(w.rows("SELECT action FROM audit WHERE target = 'app#1' AND action = 'preapproval'").length >= 4);
  });

  test("a push by someone else cancels it, and a red CI asks a Merge question instead", async () => {
    const w = fresh().pr(2).review(2, { verdict: "take-fix" }).pr(3).review(3, { verdict: "take-fix" });
    await start(w, 2);
    w.synced(2, "foreign");
    settle(w);
    assert.equal(preapprovalOf(w.db, "app", 2)?.state, "cancelled");
    assert.equal(w.rows("SELECT state FROM operator_fixups WHERE number = 2")[0]!.state, "ended");

    await start(w, 3);
    pushed(w, 3, "sha3b");
    w.synced(3, "sha3b").review(3, { head: "sha3b" });
    w.db.prepare("UPDATE pr_checks SET overall = 'failure' WHERE number = 3").run();
    // The CI fix step may still repair the red head: the pre-approval waits for it, and asks once it has given up.
    settle(w);
    assert.equal(preapprovalOf(w.db, "app", 3)?.state, "ci");
    w.db.prepare("INSERT INTO ci_fixes (repo, number, head, kind, state, attempt, created_at) VALUES ('app', 3, 'sha3b', 'code', 'capped', 1, ?)").run(T0);
    settle(w);
    assert.equal(preapprovalOf(w.db, "app", 3)?.state, "asked");
    const q = w.rows("SELECT answer FROM decisions WHERE id = ?", mergeDecisionId("app", 3, "sha3b"));
    assert.deepEqual(q, [{ answer: null }]);
  });

  test("a sure take review does not let the queue merge or ask while the pre-approval waits", async () => {
    const w = fresh().pr(8).review(8).verified(8).premerge(8, "clean");
    assert.ok(kindsOf(w, 8).some((k) => k.startsWith("merge")), kindsOf(w, 8).join());
    await start(w, 8);
    assert.ok(!kindsOf(w, 8).some((k) => k.startsWith("merge") || k.startsWith("ask-merge")), kindsOf(w, 8).join());
  });

  test("an unsure or non-take review of the push asks a Merge question", async () => {
    const w = fresh().pr(4).review(4, { verdict: "take-fix" });
    await start(w, 4);
    pushed(w, 4, "sha4b");
    w.synced(4, "sha4b").review(4, { head: "sha4b", sure: false });
    settle(w);
    assert.equal(preapprovalOf(w.db, "app", 4)?.state, "asked");
    assert.deepEqual(answerOf(w, 4, "sha4b"), [{ answer: null }]);
  });

  test("a re-review that turns unsure during ci hands nothing over", async () => {
    const w = fresh().pr(5).review(5, { verdict: "take-fix" });
    await inCi(w, 5);
    w.premerge(5, "clean");
    w.db.prepare("UPDATE opus_reviews SET sure = 0 WHERE number = 5 AND head_oid = 'sha5b'").run();
    settle(w);
    assert.equal(preapprovalOf(w.db, "app", 5)?.state, "asked");
    assert.deepEqual(answerOf(w, 5, "sha5b"), [{ answer: null }]);
  });

  test("the pre-merge review gates the hand-over: no review waits, a defect asks", async () => {
    const w = fresh().pr(9).review(9, { verdict: "take-fix" }).pr(10).review(10, { verdict: "take-fix" });
    await inCi(w, 9);
    assert.equal(w.rows("SELECT 1 FROM decisions WHERE id = ?", mergeDecisionId("app", 9, "sha9b")).length, 0);
    await inCi(w, 10);
    w.premerge(10, "defect", false);
    settle(w);
    assert.equal(preapprovalOf(w.db, "app", 10)?.state, "asked");
    assert.deepEqual(answerOf(w, 10, "sha10b"), [{ answer: null }]);
  });

  test("cancelling after the hand-over takes the Merge answer back, and the cancelled row stays cancelled", async () => {
    const w = fresh().pr(6).review(6, { verdict: "take-fix" });
    await inCi(w, 6);
    w.premerge(6, "clean");
    settle(w);
    assert.equal(preapprovalOf(w.db, "app", 6)?.state, "queued");
    assert.deepEqual(answerOf(w, 6, "sha6b"), [{ answer: "merge" }]);
    assert.equal((await cancelPreapproval(w.db, OPERATOR, "app", 6)).state, "cancelled");
    assert.deepEqual(answerOf(w, 6, "sha6b"), [{ answer: null }]);
    settle(w);
    assert.equal(preapprovalOf(w.db, "app", 6)?.state, "cancelled");
    assert.deepEqual(actionable(w.db).filter((a) => a.id === mergeDecisionId("app", 6, "sha6b")), []);
  });

  test("an operator fix-up stored for linting is planned for its lint check, and a dropped one ends the request instead of looping", async () => {
    const w = fresh().pr(11).pr(12);
    await start(w, 11);
    fixRow(w, 11, "linting");
    const kinds = kindsOf(w, 11);
    assert.ok(!kinds.includes("fixup:operator"), kinds.join());
    assert.ok(kinds.includes("lint:operator"), kinds.join());

    await start(w, 12);
    fixRow(w, 12, "superseded");
    assert.ok(!kindsOf(w, 12).includes("fixup:operator"), kindsOf(w, 12).join());
    settle(w);
    assert.equal(preapprovalOf(w.db, "app", 12)?.state, "failed");
  });

  test("a fix-up request without merge ends when the head moves, and a pre-approval whose fix-up cannot run asks", async () => {
    const w = fresh().pr(13).pr(14).review(14, { verdict: "take-fix" });
    await start(w, 13, false);
    w.synced(13, "moved13");
    settle(w);
    assert.equal(w.rows("SELECT state FROM operator_fixups WHERE number = 13")[0]!.state, "ended");

    await start(w, 14);
    w.db.prepare("UPDATE pr_checks SET mergeable = 'CONFLICTING' WHERE number = 14").run();
    settle(w);
    assert.equal(preapprovalOf(w.db, "app", 14)?.state, "asked");
  });

  test("a cancel is refused while a merge job runs, and a merge that lands after a cancel turns the row into merged", async () => {
    const w = fresh().pr(15).review(15, { verdict: "take-fix" });
    await inCi(w, 15);
    w.premerge(15, "clean");
    settle(w);
    assert.equal(preapprovalOf(w.db, "app", 15)?.state, "queued");
    const job = w.db.prepare("INSERT INTO jobs (step, params, requested_by, requested_at, state, repo) VALUES ('merge', '{}', 'pipeline', ?, 'running', 'app')").run(T0);
    await assert.rejects(cancelPreapproval(w.db, OPERATOR, "app", 15), /merge of the repo is running/);
    assert.equal(preapprovalOf(w.db, "app", 15)?.state, "queued");
    w.db.prepare("UPDATE jobs SET state = 'done' WHERE id = ?").run(Number(job.lastInsertRowid));
    await cancelPreapproval(w.db, OPERATOR, "app", 15);
    w.db.prepare("INSERT INTO merges (repo, number, head_oid, run_id, at, path, method, outcome) VALUES ('app', 15, 'sha15b', 'r', ?, 'operator', 'squash', 'merged')").run(new Date().toISOString());
    settle(w);
    assert.equal(preapprovalOf(w.db, "app", 15)?.state, "merged");
  });

  test("untracking the repo leaves an active row untouched on the scoped connection, and tracking again resumes it", async () => {
    const w = fresh().pr(40).review(40, { verdict: "take-fix" });
    await start(w, 40);
    pushed(w, 40, "sha40b");
    w.synced(40, "sha40b");
    scopeToTracked(w.db);
    w.db.prepare("DELETE FROM main.tracked_repos WHERE name = 'app'").run();
    settle(w);
    assert.equal(preapprovalOf(w.db, "app", 40)?.state, "fixup");
    assert.equal(w.rows("SELECT state FROM operator_fixups WHERE number = 40")[0]!.state, "queued");
    w.db.prepare("INSERT INTO main.tracked_repos (name, added_by, added_at, pipeline) VALUES ('app', ?, ?, 1)").run(OPERATOR, T0);
    settle(w);
    assert.equal(preapprovalOf(w.db, "app", 40)?.state, "review");
  });

  test("a Merge answer at H carries across the pipeline's own conflict merge to H2 as a row in review, once", () => {
    const w = fresh().pr(30).review(30, { verdict: "take" }).answer(30, "merge");
    w.db.prepare("INSERT INTO conflict_merges (repo, number, from_head, to_head, state, attempt, created_at, own_diff) VALUES ('app', 30, 'sha30', 'sha30m', 'merged', 1, ?, 'same')").run(T0);
    w.synced(30, "sha30m");
    advancePreapprovals(w.db);
    const p = preapprovalOf(w.db, "app", 30)!;
    assert.deepEqual([p.state, p.fromHead, p.head, p.by], ["review", "sha30", "sha30m", OPERATOR]);
    advancePreapprovals(w.db);
    assert.equal(w.rows("SELECT id FROM preapprovals WHERE number = 30").length, 1);
    // The question at the old head is not asked again at the new one while the row runs.
    assert.ok(!kindsOf(w, 30).some((k) => k.startsWith("ask-merge") || k.startsWith("merge")), kindsOf(w, 30).join());
  });

  test("the pipeline's own CI fix push ends the pre-approval like a foreign push", async () => {
    const w = fresh().pr(16).review(16, { verdict: "take-fix" }).pr(17).review(17, { verdict: "take-fix" });
    await inCi(w, 16);
    w.db.prepare("INSERT INTO ci_fixes (repo, number, head, to_head, kind, state, attempt, created_at) VALUES ('app', 16, 'sha16b', 'sha16c', 'format', 'pushed', 1, ?)").run(T0);
    w.synced(16, "sha16c");
    settle(w);
    assert.equal(preapprovalOf(w.db, "app", 16)?.state, "cancelled");

    await inCi(w, 17);
    w.synced(17, "foreign17");
    settle(w);
    assert.equal(preapprovalOf(w.db, "app", 17)?.state, "cancelled");
  });

  test("cancelling a queued PR that is in a batch removes it from the batch and takes the answer back", async () => {
    const w = fresh().pr(18).review(18, { verdict: "take-fix" });
    await inCi(w, 18);
    w.premerge(18, "clean");
    settle(w);
    assert.equal(preapprovalOf(w.db, "app", 18)?.state, "queued");
    w.db.prepare("INSERT INTO merge_batches (id, repo, branch, state, base_sha, commit_sha, created_at, updated_at) VALUES (5, 'app', 'integration-app-1', 'open', 'b', 't', ?, ?)").run(T0, T0);
    w.db.prepare("INSERT INTO merge_batch_prs (batch_id, number, head_oid, position) VALUES (5, 18, 'sha18b', 1)").run();
    assert.equal((await cancelPreapproval(w.db, OPERATOR, "app", 18)).state, "cancelled");
    assert.equal(w.rows("SELECT state FROM merge_batches WHERE id = 5")[0]!.state, "superseded");
    assert.deepEqual(answerOf(w, 18, "sha18b"), [{ answer: null }]);
    assert.equal(w.rows("SELECT 1 FROM merge_holds WHERE number = 18").length, 0);
  });

  test("an operator fix-up may edit any file but the protected ones, and its comment lists the model's changes", () => {
    assert.ok(operatorEditable("docs/guide.txt") && operatorEditable("src/a.rs"));
    for (const f of ["Cargo.toml", "crates/x/Cargo.toml", "Cargo.lock", "rust-toolchain.toml", "rust-toolchain", ".gitmodules", ".gitattributes", "CODEOWNERS", ".github/CODEOWNERS", "docs/CODEOWNERS", ".claude/settings.json", "sub/AGENTS.md"]) assert.ok(!operatorEditable(f), f);
    assert.ok(!operatorEditable(".github/workflows/ci.yml") && !operatorEditable("build.rs") && !operatorEditable("CLAUDE.md") && !operatorEditable("a/../b"));
    const r = splitChanges("diff --git a/x b/x\n--- a/x\n+++ b/x\n@@ -1 +1 @@\n-a\n+b\n\nCHANGES:\n1. Renamed a to b.\n2) Fixed the doc.\n");
    assert.deepEqual(r.changes, ["Renamed a to b.", "Fixed the doc."]);
    assert.ok(r.diff.endsWith("+b"));
    const quoted = "Keep the exported file names stable across every release of the tool please";
    const c = splitChanges(`d\n\nCHANGES:\n1. See [the docs](https://example.org/x) and @someone for details\n2. ${quoted} and more\n3. Renamed a to b\n`, quoted);
    assert.deepEqual(c.changes, ["See the docs and someone for details.", "Renamed a to b."]);
    assert.equal(operatorCommentText(["x"], r.changes), "Fixes included:\n1. Renamed a to b.\n2. Fixed the doc.");
  });

  test("a cancel whose batch removal fails leaves no hold the removal set", async () => {
    const w = fresh().pr(19).review(19, { verdict: "take-fix" });
    await inCi(w, 19);
    w.premerge(19, "clean");
    settle(w);
    w.db.prepare("INSERT INTO merge_batches (id, repo, branch, state, base_sha, commit_sha, pr_number, created_at, updated_at) VALUES (6, 'app', 'integration-app-2', 'open', 'b', 't', 77, ?, ?)").run(T0, T0);
    w.db.prepare("INSERT INTO merge_batch_prs (batch_id, number, head_oid, position) VALUES (6, 19, 'sha19b', 1)").run();
    const failing = async () => ({ code: 1, stdout: "", stderr: "boom" });
    await assert.rejects(cancelPreapproval(w.db, OPERATOR, "app", 19, failing));
    assert.equal(w.rows("SELECT 1 FROM merge_holds WHERE number = 19").length, 0);
    assert.equal(preapprovalOf(w.db, "app", 19)?.state, "queued");
  });
});

describe("add to merge queue (a pre-approved merge without a fix-up)", () => {
  test("a take review at the current head, a clean pre-merge review and green CI write the Merge answer", () => {
    const w = fresh().pr(11);
    preapproveMerge(w.db, { repo: "app", number: 11, by: OPERATOR });
    const p = preapprovalOf(w.db, "app", 11)!;
    assert.equal(p.state, "review");
    assert.equal(p.head, "sha11");
    // A second add while the first runs is refused.
    assert.throws(() => preapproveMerge(w.db, { repo: "app", number: 11, by: OPERATOR }), /already has a pre-approved merge/);
    w.review(11, { head: "sha11" });
    settle(w);
    assert.equal(preapprovalOf(w.db, "app", 11)?.state, "ci");
    w.premerge(11, "clean");
    settle(w);
    assert.equal(preapprovalOf(w.db, "app", 11)?.state, "queued");
    assert.deepEqual(answerOf(w, 11, "sha11").map((r) => r.answer), ["merge"]);
  });

  test("a take-fix review asks the Merge question instead: the add covers no model-written fixes", () => {
    const w = fresh().pr(12);
    preapproveMerge(w.db, { repo: "app", number: 12, by: OPERATOR });
    w.review(12, { head: "sha12", verdict: "take-fix" });
    settle(w);
    assert.equal(preapprovalOf(w.db, "app", 12)?.state, "asked");
    // The question talks about the PR's head, not a fix-up it never had.
    const [q] = w.rows("SELECT context, facts FROM decisions WHERE id = ?", mergeDecisionId("app", 12, "sha12")) as { context: string; facts: string }[];
    assert.doesNotMatch(`${q.context} ${q.facts}`, /fix-up/);
    assert.match(q.facts, /review of the PR's head: take-fix/);
  });

  test("the add asks for no review of its own: running CI still holds the review of the PR's head", () => {
    const w = fresh().pr(13);
    w.db.prepare("UPDATE pr_checks SET overall = 'pending' WHERE number = 13").run();
    preapproveMerge(w.db, { repo: "app", number: 13, by: OPERATOR });
    assert.equal(reviewHolds(w.db)("app", 13, "sha13")?.kind, "ci");
  });

  test("the queue row says who added the PR and how; viewers see no login", () => {
    const w = fresh().pr(14).pr(15);
    preapproveMerge(w.db, { repo: "app", number: 14, by: OPERATOR });
    const entry = (number: number) => ({ repo: "app", number, decisionId: null, reviewedAt: T0 }) as unknown as CachedEntry;
    const staff = queueOrigins(w.db, true);
    assert.deepEqual({ ...staff(entry(14)), at: null }, { how: "queued", by: OPERATOR, at: null });
    assert.equal(queueOrigins(w.db, false)(entry(14)).by, null);
    assert.deepEqual(staff(entry(15)), { how: "review", by: null, at: T0 });
  });
});

describe("queue items: an issue", () => {
  test("is fast-tracked without lowering its weight; its one closing PR is queued, several are only listed", async () => {
    const w = fresh().issue(31).pr(32).issue(33).pr(34).pr(35);
    w.db.prepare("UPDATE items SET closing_issues = '[31]' WHERE repo = 'app' AND number = 32").run();
    w.db.prepare("UPDATE items SET closing_issues = '[33]' WHERE repo = 'app' AND number IN (34, 35)").run();
    addFastTrack(w.db, OPERATOR, "app#31", 9);
    const req = (item: string) => ({ query: new URLSearchParams(), json: { item, weight: 7 }, user: { login: OPERATOR, role: "operator", canWrite: async () => true } }) as unknown as Req;
    assert.match((await queueAdd(w.db, req("app#31"))).label, /Fast-tracked the issue; queued #32/);
    assert.equal(preapprovalOf(w.db, "app", 32)?.state, "review");
    assert.deepEqual(fastTrackList(w.db).map((f) => [f.number, f.weight]), [[31, 9], [32, 7]]);
    assert.match((await queueAdd(w.db, req("app#33"))).label, /#34, #35 close it; queue one of them/);
    assert.equal(preapprovalOf(w.db, "app", 34), null);
    assert.equal(preapprovalOf(w.db, "app", 35), null);
  });
});

describe("fast track weights", () => {
  test("heavier items go first; equal weights keep the order added", () => {
    const w = fresh().pr(21).pr(22).pr(23);
    addFastTrack(w.db, OPERATOR, "app#21");
    addFastTrack(w.db, OPERATOR, "app#22", 9);
    addFastTrack(w.db, OPERATOR, "app#23");
    assert.deepEqual(fastTrackList(w.db).map((f) => [f.number, f.weight]), [[22, 9], [21, 5], [23, 5]]);
    const s = workScores(w.db, "app");
    assert.ok(s.get(22)! > s.get(21)! && s.get(21)! > s.get(23)!);
    setFastTrackWeight(w.db, OPERATOR, "app#23", 10);
    assert.deepEqual(fastTrackList(w.db).map((f) => f.number), [23, 22, 21]);
    assert.ok(fastScoreOf(w.db, "app", 23)! > fastScoreOf(w.db, "app", 22)!);
    assert.throws(() => setFastTrackWeight(w.db, OPERATOR, "app#21", 11), /from 1 to 10/);
  });
});
