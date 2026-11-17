// Journeys: a PR or issue goes through the real planner pass, the real executors and the real guard, with GitHub and the
// models faked (test/world-db.ts). Each test asserts outcomes: rows in the database and the writes that reached GitHub.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, test } from "node:test";
import { CLI_BY } from "../src/core/gates.ts";
import { guard, liveOf } from "../src/core/guard.ts";
import { exec, type Exec, type ExecResult } from "../src/fixup/git.ts";
import { runCifix, type CifixDeps } from "../src/cifix/index.ts";
import { runFixup, type FixupDeps } from "../src/fixup/index.ts";
import type { Querier } from "../src/mirror.ts";
import { storeArtifact, tempPath } from "../src/build/artifacts.ts";
import { getTask } from "../src/build/tasks.ts";
import { runDecide } from "../src/decide/index.ts";
import { fillReviewSummaries } from "../src/review/summary.ts";
import { prepareIds } from "../src/decide/prepare.ts";
import { preparing } from "../src/decide/prepared.ts";
import { ask, getDecision } from "../src/decisions.ts";
import { attemptOf, runFixIssue, runFixIssueCollect, type CollectDeps } from "../src/fixissue/index.ts";
import { runAct } from "../src/act/index.ts";
import { applyDuplicateAnswers } from "../src/dupes/decide.ts";
import { runBatches } from "../src/merge/batch.ts";
import { runMerge } from "../src/merge/index.ts";
import { prepareOpusInput, type OpusDeps } from "../src/review/opus.ts";
import { runPremerge, type PremergeDeps } from "../src/premerge/review.ts";
import { CHECK, T1, tmpdir, world, type World } from "./world-db.ts";

process.env.AUTOCRAFT_DIFF_CACHE = join(tmpdir("diffs"), "cache");

const quiet = () => {};
let current: World | null = null;
const fresh = (): World => (current = world().repo());
afterEach(() => current?.close());

const DIFF = "diff --git a/src/lib.rs b/src/lib.rs\n--- a/src/lib.rs\n+++ b/src/lib.rs\n@@ -1,1 +1,1 @@\n-let a = 1;\n+let a = 2;\n";
const premergeDeps: PremergeDeps = { fetchDiff: async () => ({ ok: true, text: DIFF }), model: "opus", maxChars: 120_000 };
const premergeReply = (n: number) => JSON.stringify({ ref: `app#${n}`, findings: [], searched: "callers" });
const merged = (w: World) => w.rows("SELECT number, head_oid, outcome FROM merges ORDER BY number");

describe("PR journeys", () => {
  test("a whitelisted bugfix PR goes from review to merge, and the merge gets the reviewed head", async () => {
    const w = fresh().pr(1).review(1).verified(1).models(() => premergeReply(1));
    assert.equal(w.prPlan(1).state, "waiting-premerge");
    const s = await runPremerge(w.db, { repo: "app" }, quiet, premergeDeps);
    assert.equal(s.reviewed, 1);
    assert.equal(w.prPlan(1).state, "ready");

    const m = await runMerge(w.db, { repo: "app", dryRun: false }, quiet, w.gh.mergeDeps());
    assert.deepEqual(m.merged, ["app#1"]);
    assert.deepEqual(w.gh.writesOf("merge").map((x) => [x.number, x.head]), [[1, "sha1"]]);
    assert.deepEqual(merged(w), [{ number: 1, head_oid: "sha1", outcome: "merged" }]);
    assert.equal(w.prPlan(1).state, "merged");
  });

  test("both Opus inputs carry the open items that mention the PR's files; the pre-merge input also carries the first review", async () => {
    const w = fresh().pr(1).review(1).issue(9, { title: "Dropping a file still replaces the frame", body: "Seen in src/lib.rs" });
    const deps: OpusDeps = { fetchDiff: async () => ({ ok: true, text: DIFF }), fetchDelta: async () => ({ ok: false, tooLarge: false, error: "unused" }), model: "opus", maxChars: 120_000 };
    const c = { repo: "app", number: 1, title: "PR 1", body: "b", author_association: null, head_oid: "sha1", lines_changed: 20, size: "S" as const, score: null };
    for (const independent of [false, true]) {
      const p = await prepareOpusInput(w.db, "app", c, deps, quiet, { independent });
      assert.equal(p.kind, "ready");
      if (p.kind !== "ready") continue;
      assert.deepEqual(p.input.related_open?.map((r) => [r.number, r.state]), [[9, "open"]]);
      assert.equal(p.input.review_history !== undefined, independent);
    }
  });

  test("a Hold answer stops a PR the rule would merge", async () => {
    const w = fresh().pr(1).review(1).verified(1).premerge(1, "clean").answer(1, "hold");
    assert.equal(w.prPlan(1).state, "declined");
    const m = await runMerge(w.db, { repo: "app", dryRun: false }, quiet, w.gh.mergeDeps());
    assert.deepEqual(m.merged, []);
    assert.deepEqual(w.gh.writes, []);
  });

  test("an unsure review asks Merge? and merges after a Merge answer", async () => {
    const w = fresh().pr(1).review(1, { sure: false }).verified(1).premerge(1, "clean");
    assert.equal(w.prPlan(1).state, "needs-decision");
    const first = await runMerge(w.db, { repo: "app", dryRun: false }, quiet, w.gh.mergeDeps());
    assert.deepEqual(first.merged, []);
    assert.equal(first.asked.length, 1);
    assert.deepEqual(w.gh.writes, []);

    w.answerDecision(first.asked[0]!, "merge");
    assert.equal(w.prPlan(1).state, "decision-answered-merge");
    const second = await runMerge(w.db, { repo: "app", dryRun: false }, quiet, w.gh.mergeDeps());
    assert.deepEqual(second.merged, ["app#1"]);
    assert.deepEqual(w.gh.writesOf("merge").map((x) => [x.number, x.head]), [[1, "sha1"]]);
  });

  test("a head that moves after the plan is refused, by the merge step and by the guard", async () => {
    const w = fresh().pr(1).review(1).verified(1).premerge(1, "clean");
    assert.equal(w.prPlan(1).actions[0]!.kind, "merge");
    w.gh.live(1, { head: "sha1-moved" });

    const m = await runMerge(w.db, { repo: "app", dryRun: false }, quiet, w.gh.mergeDeps());
    assert.deepEqual(m.merged, []);
    assert.equal(w.gh.writesOf("merge").length, 0);

    const g = await guard(w.db, { repo: "app", number: 1 }, { kind: "merge", head: "sha1" }, CLI_BY, liveOf(w.db, w.gh.querier));
    assert.ok("refused" in g && /head moved/.test(g.refused), JSON.stringify(g));
    assert.equal(w.gh.writesOf("merge").length, 0);
  });

  test("with the pipeline switched off the pipeline's own run writes nothing", async () => {
    const w = fresh().pr(1).review(1).verified(1).premerge(1, "clean").pipeline(false);
    const m = await runMerge(w.db, { repo: "app", dryRun: false, by: "pipeline" }, quiet, w.gh.mergeDeps());
    assert.deepEqual(m.merged, []);
    assert.deepEqual(w.gh.writes, []);
    assert.deepEqual(merged(w), []);
    // An operator's own run is not stopped by the switch.
    assert.deepEqual((await runMerge(w.db, { repo: "app", dryRun: false }, quiet, w.gh.mergeDeps())).merged, ["app#1"]);
  });

  test("a batch of two PRs is built, published as one PR and lands together", async () => {
    const w = fresh().pr(1).review(1).verified(1).premerge(1, "clean").pr(2).review(2).verified(2).premerge(2, "clean");
    const deps = w.gh.batchDeps();
    const built = await runBatches(w.db, { repo: "app" }, quiet, deps);
    assert.equal(built.published.length, 1);
    assert.deepEqual(w.gh.writesOf("pr").map((x) => x.number), [900]);
    assert.deepEqual(w.prPlan(1).state, "in-batch");
    assert.deepEqual(w.prPlan(2).state, "in-batch");
    assert.ok(!w.prPlan(1).actions.some((a) => a.kind === "merge" && a.params?.singleOnly), "a member is not merged alone");

    const done = await runBatches(w.db, { repo: "app" }, quiet, deps);
    assert.deepEqual(done.merged, [1, 2]);
    // Only the batch PR was merged, at the tip that was pushed; the members got merge records.
    assert.deepEqual(w.gh.writesOf("merge").map((x) => x.number), [900]);
    assert.equal(w.gh.writesOf("merge")[0]!.head, w.gh.writesOf("push")[0]!.head);
    assert.deepEqual(merged(w).map((r) => [r.number, r.head_oid, r.outcome]), [[1, "sha1", "merged"], [2, "sha2", "merged"]]);
  });

  test("the batch PR's runs are approved at the batch tip when its members are fast-tracked in a repo whose pipeline is off", async () => {
    const w = fresh().pr(1).review(1).verified(1).premerge(1, "clean").pr(2).review(2).verified(2).premerge(2, "clean");
    await runBatches(w.db, { repo: "app" }, quiet, w.gh.batchDeps());
    const tip = (w.db.prepare("SELECT commit_sha AS c FROM merge_batches WHERE pr_number = 900").get() as { c: string }).c;
    w.db.prepare("INSERT INTO ci_run_approvals (repo, number, head_oid, runs, approved, reread, failed, checked_at) VALUES ('app', 900, ?, '[]', '[]', 1, '{}', ?)").run(tip, "2026-01-02T00:00:00Z");
    w.db.prepare("INSERT INTO settings (key, value) VALUES ('pipeline_login', 'bot') ON CONFLICT (key) DO UPDATE SET value = excluded.value").run();
    w.db.prepare(`INSERT INTO items (repo, number, kind, state, title, author, additions, deletions, head_oid, head_ref, created_at, updated_at)
      VALUES ('app', 900, 'pr', 'OPEN', 'batch', 'bot', 1, 0, 'mirror-lag', 'batch', ?, ?)`).run("2026-01-01T00:00:00Z", "2026-01-01T00:00:00Z");
    const plan = () => w.prPlan(900);
    assert.deepEqual(plan().actions.map((a) => [a.kind, a.head]), [["approve-ci", tip]]);
    w.db.prepare("UPDATE tracked_repos SET pipeline = 0 WHERE name = 'app'").run();
    assert.equal(plan().state, "out-of-scope");
    for (const n of [1, 2]) w.db.prepare("INSERT INTO fast_track (repo, number, added_by, added_at) VALUES ('app', ?, 'op', ?)").run(n, "2026-01-02T00:00:00Z");
    assert.deepEqual(plan().actions.map((a) => [a.kind, a.head]), [["approve-ci", tip]]);
  });

  test("a take-fix patch is linted before the push: clippy findings go back to the model, the clean patch is pushed with the format changes folded in", async () => {
    const git = gitWorld(1);
    const w = fresh().pr(1, { head: git.head }).review(1, { verdict: "take-fix" });
    assert.deepEqual(w.prPlan(1).actions.map((a) => [a.kind, a.params?.bucket, a.head]), [["fixup", "fix", git.head]]);
    const edit = (to: string) => `diff --git a/src/lib.rs b/src/lib.rs\n--- a/src/lib.rs\n+++ b/src/lib.rs\n@@ -1,2 +1,2 @@\n-fn a() {}\n-fn main() { a(); }\n${to}`;
    const asked: { previous?: { findings: string[] } }[] = [];
    const deps = git.deps(w);
    deps.ask = async (_db, input) => {
      asked.push(input[0] as (typeof asked)[number]);
      return asked.length === 1 ? git.patch : edit("+fn b() {  }\n+fn main() { b(); }\n");
    };

    // Round 1: the patch is stored, not pushed.
    const first = await runFixup(w.db, { repo: "app", dryRun: false }, quiet, deps);
    assert.deepEqual(first.pushed, []);
    assert.deepEqual(git.pushes, []);
    assert.deepEqual(w.rows("SELECT state, lint_round, lint_state FROM fixups"), [{ state: "linting", lint_round: 1, lint_state: "pending" }]);
    assert.deepEqual(w.prPlan(1).actions, []);
    const t1 = w.rows("SELECT id, state FROM build_tasks")[0] as { id: number; state: string };
    assert.equal(t1.state, "queued");

    // Clippy finds something on a line the patch changed: the model is asked again with the finding.
    endLint(w, t1.id, { diagnostics: [{ line: 1 }] });
    assert.deepEqual(w.prPlan(1).actions.map((a) => [a.kind, a.params?.bucket]), [["lint", "fixup"]]);
    const second = await runFixup(w.db, { repo: "app", dryRun: false }, quiet, deps);
    assert.deepEqual(second.pushed, []);
    assert.equal(asked.length, 2);
    assert.match(asked[1]!.previous!.findings[0]!, /needless at line 1/);
    assert.deepEqual(w.rows("SELECT state, lint_round FROM fixups"), [{ state: "linting", lint_round: 2 }]);

    // Round 2 is clean; rustfmt wants `{}`: one push whose commit has the format change.
    const t2 = (w.rows("SELECT id FROM build_tasks ORDER BY id DESC LIMIT 1")[0] as { id: number }).id;
    assert.notEqual(t2, t1.id);
    endLint(w, t2, { format: "diff -uN a/src/lib.rs b/src/lib.rs\n--- a/src/lib.rs\t2026-01-01\n+++ b/src/lib.rs\t2026-01-01\n@@ -1,2 +1,2 @@\n-fn b() {  }\n+fn b() {}\n fn main() { b(); }\n" });
    const third = await runFixup(w.db, { repo: "app", dryRun: false }, quiet, deps);
    assert.deepEqual(third.pushed, ["app#1"]);
    const pushed = git.branchHead();
    assert.deepEqual(git.pushes, [{ lease: git.head, to: pushed }]);
    assert.equal(sh(git.fork, "show", `${pushed}:src/lib.rs`), "fn b() {}\nfn main() { b(); }");
    assert.deepEqual(w.rows("SELECT state, from_head, to_head FROM fixups"), [{ state: "pushed", from_head: git.head, to_head: pushed }]);
    assert.equal(w.gh.writesOf("comment").length, 1);

    // Sync sees the new head; it is reviewed, verified and pre-merge reviewed like any head.
    w.synced(1, pushed);
    assert.equal(w.prPlan(1).actions.some((a) => a.kind === "merge"), false);
    w.review(1, { head: pushed }).verified(1).premerge(1, "clean");
    const m = await runMerge(w.db, { repo: "app", dryRun: false }, quiet, w.gh.mergeDeps());
    assert.deepEqual(m.merged, ["app#1"]);
    assert.deepEqual(w.gh.writesOf("merge").map((x) => x.head), [pushed]);
  });
});

describe("lint findings resume the patch session", () => {
  const edit = "diff --git a/src/lib.rs b/src/lib.rs\n--- a/src/lib.rs\n+++ b/src/lib.rs\n@@ -1,2 +1,2 @@\n-fn a() {}\n-fn main() { a(); }\n+fn b() {}\n+fn main() { b(); }\n";
  /** Round 1 stores the patch and its session; clippy finds something; round 2 runs `minutes` later. */
  const second = async (minutes: number) => {
    const git = gitWorld(1);
    const w = fresh().pr(1, { head: git.head }).review(1, { verdict: "take-fix" });
    const deps = git.deps(w);
    let clock = Date.parse(T1);
    deps.now = () => new Date(clock);
    const stores = [tmpdir("session-a"), tmpdir("session-b")];
    const asked: { previous?: unknown; resume?: { session: { id: string }; message: string } }[] = [];
    deps.ask = async (_db, input, _checkout, _tool, session) => {
      const n = asked.push({ previous: (input[0] as { previous?: unknown }).previous, resume: session?.resume });
      session!.kept = { id: `s${n}`, dir: stores[session?.resume ? 0 : n - 1]!, account: "a", checkout: "/c" };
      return n === 1 ? git.patch : edit;
    };
    await runFixup(w.db, { repo: "app", dryRun: false }, quiet, deps);
    const stored = () => JSON.parse((w.rows("SELECT session FROM fixups")[0] as { session: string }).session) as Record<string, { id: string; dir: string }>;
    assert.equal(stored()[""]!.id, "s1");
    endLint(w, (w.rows("SELECT id FROM build_tasks")[0] as { id: number }).id, { diagnostics: [{ line: 1 }] });
    clock += minutes * 60_000;
    await runFixup(w.db, { repo: "app", dryRun: false }, quiet, deps);
    return { asked, stored, stores };
  };

  test("findings within 60 minutes continue the stored session with the findings", async () => {
    const { asked, stored, stores } = await second(59);
    assert.equal(asked[1]!.resume!.session.id, "s1");
    assert.match(asked[1]!.resume!.message, /needless at line 1/);
    assert.equal(stored()[""]!.dir, stores[0]);
    assert.equal(existsSync(stores[0]!), true);
  });

  test("findings after 60 minutes start a new call with the earlier patch, and the old session is removed", async () => {
    const { asked, stored, stores } = await second(61);
    assert.equal(asked[1]!.resume, undefined);
    assert.match(JSON.stringify(asked[1]!.previous), /needless at line 1/);
    assert.equal(stored()[""]!.id, "s2");
    assert.equal(existsSync(stores[0]!), false);
    assert.equal(existsSync(stores[1]!), true);
  });
});

describe("conflict resolution lint", () => {
  const resolved = (line: string) => JSON.stringify({ sections: [{ id: 1, content: line }] });
  const setup = () => {
    const git = gitWorld(1, undefined, true);
    const w = fresh().pr(1, { head: git.head, mergeable: "CONFLICTING" }).review(1, { verdict: "take" }).verified(1);
    w.db.prepare("UPDATE items SET base_ref = 'main' WHERE repo = 'app' AND number = 1").run();
    const deps = git.deps(w);
    const asked: { previous?: { findings: string[] } }[] = [];
    const answers = ["// both\nfn main() { a(); b(); }\n", "// both\nfn main() { a(); a(); }\n"];
    deps.resolve = async (_db, input) => { asked.push(input[0] as (typeof asked)[number]); return resolved(answers[asked.length - 1]!); };
    return { git, w, deps, asked };
  };
  const run = (w: World, deps: FixupDeps) => runFixup(w.db, { repo: "app", dryRun: false }, process.env.DBG ? console.log : quiet, deps);
  const lastTask = (w: World) => (w.rows("SELECT id FROM build_tasks ORDER BY id DESC LIMIT 1")[0] as { id: number }).id;

  test("clippy findings on a resolution go back to the model; the clean second resolution is merged in", async () => {
    const { git, w, deps, asked } = setup();
    assert.deepEqual(w.prPlan(1).actions.map((a) => [a.kind, a.params?.bucket]), [["conflict", "merge"]]);
    assert.deepEqual((await run(w, deps)).pushed, []);
    assert.deepEqual(w.rows("SELECT state, lint_round FROM conflict_merges"), [{ state: "linting", lint_round: 1 }]);
    endLint(w, lastTask(w), { diagnostics: [{ line: 2 }] });
    assert.deepEqual(w.prPlan(1).actions.map((a) => [a.kind, a.params?.bucket]), [["lint", "conflict"]]);

    assert.deepEqual((await run(w, deps)).pushed, []);
    assert.equal(asked.length, 2);
    assert.match(asked[1]!.previous!.findings[0]!, /needless at line 2/);
    assert.deepEqual(w.rows("SELECT state, lint_round FROM conflict_merges"), [{ state: "linting", lint_round: 2 }]);

    endLint(w, lastTask(w));
    assert.deepEqual((await run(w, deps)).pushed, ["app#1"]);
    const pushed = git.branchHead();
    assert.equal(sh(git.fork, "show", `${pushed}:src/lib.rs`), "fn a() {}\n// both\nfn main() { a(); a(); }");
    assert.deepEqual(w.rows("SELECT state, to_head FROM conflict_merges"), [{ state: "merged", to_head: pushed }]);
  });

  test("findings after the second lint round fail the try with the reason", async () => {
    const { git, w, deps, asked } = setup();
    await run(w, deps);
    endLint(w, lastTask(w), { diagnostics: [{ line: 2 }] });
    await run(w, deps);
    endLint(w, lastTask(w), { diagnostics: [{ line: 2 }] });
    const s = await run(w, deps);
    assert.deepEqual(s.pushed, []);
    assert.equal(asked.length, 2);
    assert.deepEqual(git.pushes, []);
    const row = w.rows("SELECT state, reason FROM conflict_merges")[0] as { state: string; reason: string };
    assert.equal(row.state, "rejected");
    assert.match(row.reason, /clippy findings remain after 2 rounds: needless/);
  });
});

describe("patch model build tool", () => {
  test("the model checks its patch with clippy, fixes the finding and re-checks; the harness's lint then passes on the first round", async () => {
    const git = gitWorld(1);
    const w = fresh().pr(1, { head: git.head }).review(1, { verdict: "take-fix" });
    const dirty = git.patch.replace("+fn b() {}\n", "+fn b() { return; }\n");
    assert.notEqual(dirty, git.patch);
    const deps = git.deps(w);
    const outcomes: string[] = [];
    let asked = 0;
    // The fake worker: a queued task of a patch with `return;` has a clippy finding on line 1, any other is clean.
    const worker = setInterval(() => {
      for (const t of w.rows("SELECT id, patch FROM build_tasks WHERE state = 'queued'") as { id: number; patch: string }[]) endLint(w, t.id, { diagnostics: t.patch.includes("return;") ? [{ line: 1 }] : [] });
    }, 5);
    deps.ask = async (_db, _input, _checkout, tool) => {
      asked++;
      tool!.pollMs = 5;
      const first = await tool!.run({ patch: dirty, command: "clippy" }, null);
      outcomes.push(first.text);
      const second = await tool!.run({ patch: git.patch, command: "clippy" }, null);
      outcomes.push(second.text);
      clearInterval(worker);
      return git.patch;
    };
    const first = await runFixup(w.db, { repo: "app", dryRun: false }, quiet, deps).finally(() => clearInterval(worker));
    assert.equal(asked, 1);
    assert.match(outcomes[0]!, /clippy: 1 finding/);
    assert.match(outcomes[1]!, /clippy: 0 findings/);
    assert.deepEqual(w.rows("SELECT step, command, outcome FROM model_checks ORDER BY id"), [
      { step: "fixup", command: "clippy", outcome: "1 finding" }, { step: "fixup", command: "clippy", outcome: "0 findings" },
    ]);

    // The harness's own lint task is the third task; it is clean, so the first round pushes.
    assert.deepEqual(first.pushed, []);
    const lint = (w.rows("SELECT id FROM build_tasks ORDER BY id DESC LIMIT 1")[0] as { id: number }).id;
    assert.equal((w.rows("SELECT COUNT(*) AS n FROM build_tasks")[0] as { n: number }).n, 3);
    endLint(w, lint);
    const second = await runFixup(w.db, { repo: "app", dryRun: false }, quiet, deps);
    assert.deepEqual(second.pushed, ["app#1"]);
    assert.equal(asked, 1);
    assert.deepEqual(w.rows("SELECT state, lint_round FROM fixups"), [{ state: "pushed", lint_round: 1 }]);
  });
});

describe("close journey", () => {
  test("a PR the final review says to close is asked about, and an answered Close closes it at the reviewed head", async () => {
    const w = fresh().pr(1).review(1, { verdict: "close", reason: "Does not match the reference app" });
    assert.equal(w.prPlan(1).state, "opus-close");

    const asked = await runAct(w.db, { repo: "app", dryRun: false }, quiet, w.gh.actDeps());
    assert.equal(asked.asked.length, 1);
    assert.equal(w.gh.writes.length, 0, "asking writes nothing to GitHub");

    // Nobody but an operator counts, and the answer is for the head the question was asked at.
    w.answerDecision(asked.asked[0]!, "close");
    const done = await runAct(w.db, { repo: "app", dryRun: false }, quiet, w.gh.actDeps());
    assert.deepEqual(done.done, ["app#1"]);
    assert.deepEqual(w.gh.writes.map((x) => x.kind), ["comment", "close"]);
    assert.deepEqual(w.rows("SELECT state, repo, number FROM actions"), [{ state: "done", repo: "app", number: 1 }]);
    assert.equal(w.rows("SELECT 1 FROM stages WHERE stage = 'closed' AND number = 1").length, 1);
    assert.equal((await runAct(w.db, { repo: "app", dryRun: false }, quiet, w.gh.actDeps())).done.length, 0);
    assert.deepEqual(w.gh.writesOf("close").map((x) => [x.number, x.head]), [[1, "sha1"]]);
  });
});

describe("issue journey", () => {
  const summaryText = "The issue asks for a small export option, which the reference app has, so it fits the project and can be taken as it is.";
  const choices = (o: unknown) => `\n\`\`\`choices\n${JSON.stringify(o)}\n\`\`\``;

  test("a prepare reply whose choices were all dropped is asked again with the reasons, and the repeat's choices are kept", async () => {
    const w = fresh().issue(7);
    ask(w.db, [{ id: "app:scope:7", kind: "scope", repo: "app", number: 7, question: "Take #7?", options: [{ key: "take", label: "Take" }, { key: "close", label: "Close" }] }]);
    const inputs: string[] = [];
    w.models((input) => {
      inputs.push(input);
      const core = inputs.length === 1 ? "o:bogus" : "o:take";
      return summaryText + choices({ pick: { core, reason: "fits." }, cores: [{ core, extras: [] }] });
    });
    assert.equal((await runDecide(w.db, {}, quiet)).prepared, 1);
    assert.equal(inputs.length, 2);
    assert.ok(!inputs[0]!.includes("<previous>") && inputs[1]!.includes("<previous>") && inputs[1]!.includes("is not one of the offered choices"));
    assert.deepEqual(w.rows("SELECT state, json_extract(pick, '$.core') AS core FROM decision_choices"), [{ state: "current", core: "o:take" }]);
    assert.equal(w.rows("SELECT 1 FROM decisions WHERE id = 'app:scope:7' AND recommended = 'take'").length, 1);
  });

  test("a pick whose core was dropped is asked again once; a pick still without a core is stored as no pick", async () => {
    const w = fresh().issue(7);
    ask(w.db, [{ id: "app:scope:7", kind: "scope", repo: "app", number: 7, question: "Take #7?", options: [{ key: "take", label: "Take" }, { key: "close", label: "Close" }] }]);
    const inputs: string[] = [];
    // A review core cannot apply to an issue, so the added core and the pick on it are dropped both times; the drafted close core survives.
    w.models((input) => {
      inputs.push(input);
      return summaryText + choices({ pick: { core: "x:review", reason: "fits." }, cores: [{ core: "o:close", reason: "Not planned.", extras: [] }], add: [{ end: { review: true }, extras: [] }] });
    });
    assert.equal((await runDecide(w.db, {}, quiet)).prepared, 1);
    assert.equal(inputs.length, 2);
    assert.ok(inputs[1]!.includes('your pick "x:review"'));
    assert.equal(w.rows("SELECT 1 FROM decisions WHERE id = 'app:scope:7' AND recommended IS NULL").length, 1);
    assert.deepEqual(w.rows("SELECT json_extract(pick, '$.core') AS core FROM decision_choices WHERE state = 'current'"), [{ core: null }]);
  });

  test("a duplicate group whose kept item is closed is prepared while a member it would close is open", async () => {
    const w = fresh().issue(7).issue(8);
    ask(w.db, [{ id: "app:dupegroup:7", kind: "duplicate", repo: "app", number: 7, question: "Keep #7 and close #8?", options: [{ key: "accept", label: "Use this answer" }, { key: "distinct", label: "Not duplicates" }] }]);
    w.db.prepare("INSERT INTO dupe_group_items (decision_id, repo, number, kind, role, target, base_role, base_target) VALUES ('app:dupegroup:7', 'app', 8, 'issue', 'close', 7, 'close', 7)").run();
    w.db.prepare("UPDATE items SET state = 'CLOSED' WHERE number = 7").run();
    assert.deepEqual(prepareIds(w.db), ["app:dupegroup:7"]);
    assert.equal(preparing(w.db, getDecision(w.db, "app:dupegroup:7")!), true);
    w.models(() => `Both issues report the same crash when opening an empty file, and #7 already has the fix, so #8 can be closed as its duplicate.${choices({ pick: { core: "o:accept", reason: "same report." } })}`);
    assert.equal((await runDecide(w.db, {}, quiet)).prepared, 1);
    assert.deepEqual(prepareIds(w.db), []);
    w.db.prepare("UPDATE decisions SET prepared_at = NULL").run();
    w.db.prepare("UPDATE items SET state = 'CLOSED' WHERE number = 8").run();
    assert.deepEqual(prepareIds(w.db), []);
  });

  test("an accepted duplicate group lists an act action for the member it closes until the Act step has closed it", async () => {
    const w = fresh().issue(7).issue(8);
    ask(w.db, [{ id: "app:dupegroup:7", kind: "duplicate", repo: "app", number: 7, question: "Keep #7 and close #8?", options: [{ key: "accept", label: "Use this answer" }, { key: "distinct", label: "Not duplicates" }] }]);
    w.db.prepare("INSERT INTO dupe_groups (decision_id, repo, source) VALUES ('app:dupegroup:7', 'app', 'model')").run();
    for (const [n, role, target] of [[7, "keep", null], [8, "close", 7]] as const)
      w.db.prepare("INSERT INTO dupe_group_items (decision_id, repo, number, kind, role, target, base_role, base_target) VALUES ('app:dupegroup:7', 'app', ?, 'issue', ?, ?, ?, ?)").run(n, role, target, role, target);
    w.db.prepare("INSERT INTO dupe_group_texts (decision_id, option, number, step, text) VALUES ('app:dupegroup:7', 'accept', 8, 'close', 'Duplicate of #7.')").run();
    w.answerDecision("app:dupegroup:7", "accept");
    const acts = () => w.plan().items.filter((i) => i.plan.actions.some((a) => a.kind === "act")).map((i) => i.facts.number);
    assert.deepEqual(acts(), []);
    applyDuplicateAnswers(w.db, T1);
    assert.deepEqual(acts(), [8]);
    assert.deepEqual((await runAct(w.db, { repo: "app", dryRun: false }, quiet, w.gh.actDeps())).done, ["app#8"]);
    assert.deepEqual(acts(), []);
  });

  test("a reply without a valid summary leaves the decision preparing; the retry after the backoff stores summary, pick and an Opus turn", async () => {
    const w = fresh().issue(5, { flags: ["needs decision"] });
    w.models(() => `too short${choices({ pick: { core: "o:take", reason: "wanted" } })}`);
    const r = await runDecide(w.db, {}, quiet);
    assert.equal(r.asked, 1);
    assert.equal(r.prepared, 0);
    const [d] = w.rows("SELECT id, prepared_at, recommend_failures FROM decisions WHERE kind = 'scope'");
    assert.equal(d!.prepared_at, null);
    assert.equal(d!.recommend_failures, 1);
    // Within the hour nothing is due; after it the prepare runs again.
    assert.equal(prepareIds(w.db).length, 0);
    // A repo with its pipeline off is neither due nor shown as preparing.
    w.db.prepare("UPDATE decisions SET recommend_failures = NULL, recommend_failed_at = NULL").run();
    assert.equal(prepareIds(w.db).length, 1);
    assert.equal(preparing(w.db, getDecision(w.db, String(d!.id))!), true);
    w.db.prepare("UPDATE tracked_repos SET pipeline = 0").run();
    assert.equal(prepareIds(w.db).length, 0);
    assert.equal(preparing(w.db, getDecision(w.db, String(d!.id))!), false);
    w.db.prepare("UPDATE tracked_repos SET pipeline = 1").run();
    w.db.prepare("UPDATE decisions SET recommend_failures = 1").run();
    w.db.prepare("UPDATE decisions SET recommend_failed_at = ?").run(new Date(Date.now() - 2 * 3_600_000).toISOString());
    w.models(() => `It reports a panic on an empty slice. The reference app has no such case, so a fix is wanted.${choices({ pick: { core: "o:take", reason: "The reference app has this case." }, cores: [{ core: "o:take", extras: [] }] })}`);
    assert.equal((await runDecide(w.db, {}, quiet)).prepared, 1);
    const [p] = w.rows("SELECT recommended, recommended_reason, recommended_by, summary, prepared_at FROM decisions WHERE kind = 'scope'");
    assert.equal(p!.recommended, "take");
    assert.match(String(p!.summary), /panic on an empty slice/);
    assert.ok(p!.prepared_at);
    assert.equal(w.rows("SELECT 1 FROM conversation_turns WHERE number = 5 AND kind = 'opus'").length, 1);
    // The review-text refresh leaves a prepared decision alone.
    w.db.prepare("INSERT INTO opus_reviews (repo, number, head_oid, mode, verdict, sure, reason, summary, model, at) VALUES ('app', 5, 'h', 'final', 'take', 1, 'r', 'review text', 'opus', ?)").run(new Date().toISOString());
    w.db.prepare("UPDATE decisions SET kind = 'merge', facts = ? WHERE kind = 'scope'").run(JSON.stringify(["head: h"]));
    fillReviewSummaries(w.db, new Date().toISOString());
    const [q] = w.rows("SELECT summary, recommended FROM decisions WHERE number = 5");
    assert.match(String(q!.summary), /panic on an empty slice/);
    assert.equal(q!.recommended, "take");
    // An older open decision of the same item is prepared with summary and pick only: no second turn replaces the first one's cards.
    w.db.prepare("INSERT INTO decisions (id, kind, repo, number, question, options, asked_at, asked_by) SELECT 'older', 'other', repo, number, 'Older?', options, '2000-01-01T00:00:00Z', asked_by FROM decisions WHERE number = 5").run();
    w.models(() => `The older question concerns the same panic on an empty slice and the answer is the same.${choices({ pick: { core: "o:take", reason: "still wanted." } })}`);
    assert.equal((await runDecide(w.db, {}, quiet)).prepared, 1);
    assert.equal(w.rows("SELECT 1 FROM conversation_turns WHERE number = 5 AND kind = 'opus'").length, 1);
    assert.equal(w.rows("SELECT 1 FROM decisions WHERE id = 'older' AND prepared_at IS NOT NULL AND recommended = 'take'").length, 1);
  });

  test("a classified issue gets a scope decision; once an operator says take, a fix is built, checked and opened as a PR", async () => {
    const lib = "crates/app/src/lib.rs", test = "crates/app/tests/autocraft_regression_5.rs";
    const fix = `diff --git a/${lib} b/${lib}\n--- a/${lib}\n+++ b/${lib}\n@@ -1,3 +1,3 @@\n pub fn first(v: &[u8]) -> u8 {\n-    v[0]\n+    v.first().copied().unwrap_or(0)\n }\n`;
    const newTest = `diff --git a/${test} b/${test}\nnew file mode 100644\nindex 0000000..e69de29\n--- /dev/null\n+++ b/${test}\n@@ -0,0 +1,4 @@\n+#[test]\n+fn empty_slice_does_not_panic() {\n+    assert_eq!(app::first(&[]), 0);\n+}\n`;
    const w = fresh().issue(5, { flags: ["needs decision"] }).models((input) => {
      if (input.includes("<decision>")) return `It reports a panic on an empty slice. The reference app has no such case.${choices({ pick: { core: null, reason: null } })}`;
    });
    // Classified and flagged: the planner wants a scope decision and holds the fix back until it is answered.
    const item = () => w.plan().items.find((i) => i.facts.number === 5)!.plan;
    assert.deepEqual(item().actions.map((a) => a.kind).filter((k) => k === "decide" || k === "fixissue"), ["decide"]);
    await runDecide(w.db, {}, quiet);
    const [decision] = w.rows("SELECT id, answer FROM decisions WHERE kind = 'scope'");
    assert.equal(decision!.answer, null);
    assert.equal(item().state, "scope-open");
    assert.equal(item().actions.some((a) => a.kind === "fixissue"), false);

    w.answerDecision(String(decision!.id), "take");
    assert.deepEqual(item().actions.map((a) => a.kind).filter((k) => k === "fixissue"), ["fixissue"]);

    const g = issueWorld(w, { lib, fix: fix + newTest });
    const started = await runFixIssue(w.db, { repo: "app", dryRun: false }, quiet, g.deps);
    assert.deepEqual(started.started, ["app#5"]);
    const a = attemptOf(w.db, "app", 5)!;
    // The fix must fail on the base and pass on the head; the sandbox's results are recorded on its tasks.
    // Round 1 passes the tests but clippy finds something on a line the patch changed: the round fails and round 2 sees the finding.
    endTask(w, a.head_task_id!, "pass");
    putLint(w, a.head_task_id!, { diagnostics: [{ line: 2 }], file: lib });
    endTask(w, a.base_task_id!, "fail-test");
    assert.equal((await runFixIssueCollect(w.db, {}, quiet, g.deps)).failedRounds, 1);
    assert.match(attemptOf(w.db, "app", 5)!.summary!, /needless at line 2/);
    const seen: string[] = [];
    const ask0 = g.deps.ask;
    g.deps.ask = async (db, id, input, ...rest) => { if (id === "fixissue.patch") seen.push(JSON.stringify(input)); return ask0(db, id, input, ...rest); };
    await runFixIssue(w.db, { repo: "app", dryRun: false }, quiet, g.deps);
    assert.match(seen[0]!, /"previous"[^]*needless at line 2/);
    const b = attemptOf(w.db, "app", 5)!;
    endTask(w, b.head_task_id!, "pass");
    putLint(w, b.head_task_id!, { file: lib });
    endTask(w, b.base_task_id!, "fail-test");
    const collected = await runFixIssueCollect(w.db, {}, quiet, g.deps);
    assert.equal(collected.opened, 1);
    assert.equal(attemptOf(w.db, "app", 5)!.state, "pr-opened");
    assert.deepEqual(g.prs.map((x) => x.head), ["pipeline-bot:autocraft/fix-5-panic-when-the-slice-is-empty"]);
    assert.deepEqual(g.comments, ["A PR for this is in progress: https://github.com/storytold/app/pull/12."]);
  });
});

describe("CI fix journey", () => {
  test("a PR whose CI fails gets a fix pushed to its branch for the reviewed head", async () => {
    const git = gitWorld(1, "fn a() {}\nfn main() { b(); }\n");
    const w = fresh().pr(1, { head: git.head, ci: "failure" }).review(1);
    assert.equal(w.prPlan(1).state, "ci-failed");
    assert.deepEqual(w.prPlan(1).actions.map((a) => [a.kind, a.params?.bucket, a.head]), [["cifix", "work", git.head]]);

    const s0 = await runCifix(w.db, { repo: "app", dryRun: false }, quiet, git.cifixDeps(w));
    assert.deepEqual(s0.pushed, []);
    assert.deepEqual(w.rows("SELECT state FROM ci_fixes"), [{ state: "linting" }]);
    endLint(w, (w.rows("SELECT id FROM build_tasks")[0] as { id: number }).id);
    const s = await runCifix(w.db, { repo: "app", dryRun: false }, quiet, git.cifixDeps(w));
    assert.deepEqual(s.pushed, ["app#1"]);
    const pushed = git.branchHead();
    assert.notEqual(pushed, git.head);
    assert.deepEqual(git.pushes, [{ lease: git.head, to: pushed }]);
    assert.deepEqual(w.rows("SELECT kind, state, head, to_head FROM ci_fixes"), [{ kind: "code", state: "pushed", head: git.head, to_head: pushed }]);
    assert.equal(w.gh.writesOf("merge").length, 0);
  });
});

/** An upstream repo and an empty fork on disk; git runs for real, gh is faked. Records the PRs opened and the issue comments. */
function issueWorld(w: World, o: { lib: string; fix: string }) {
  const root = tmpdir("issue");
  const work = join(root, "work");
  mkdirSync(join(work, "crates/app/src"), { recursive: true });
  sh(work, "init", "-q", "-b", "main");
  writeFileSync(join(work, o.lib), "pub fn first(v: &[u8]) -> u8 {\n    v[0]\n}\n");
  sh(work, "add", "-A");
  sh(work, "commit", "-q", "-m", "init");
  const sha = sh(work, "rev-parse", "HEAD");
  const upstream = join(root, "upstream.git"), fork = join(root, "fork.git");
  sh(root, "clone", "-q", "--bare", work, upstream);
  sh(root, "init", "-q", "--bare", fork);
  const prs: { head: string }[] = [], comments: string[] = [];
  let forked = false;
  const out = (stdout: string, code = 0): ExecResult => ({ code, stdout, stderr: "" });
  const run: Exec = async (cmd, args, opt = {}) => {
    if (cmd === "gh") {
      if (args[0] === "api" && args[1] === "user") return out(JSON.stringify({ login: "pipeline-bot", id: 42, node_id: "U42" }));
      if (args[0] === "api" && args[1]!.startsWith("repos/pipeline-bot/")) return out("", forked ? 0 : 1);
      if (args[0] === "api" && args[1]!.includes("/forks")) return out(forked ? "pipeline-bot/app\n" : "");
      if (args[0] === "repo") { forked = true; return out(""); }
      if (args[0] === "pr" && args[1] === "list") return out("");
      if (args[0] === "pr") { prs.push({ head: args[args.indexOf("--head") + 1]! }); w.gh.writes.push({ kind: "pr", number: 12 }); return out("https://github.com/storytold/app/pull/12\n"); }
      if (args[0] === "issue") { comments.push((opt.input ?? "").split("\n\n").at(-1)!); w.gh.writes.push({ kind: "comment", number: 5 }); return out(""); }
      return out("", 1);
    }
    const urlAt = args.findIndex((a) => a.startsWith("https://github.com/"));
    if (urlAt < 0) return exec("git", args, opt);
    const target = args[urlAt]!.includes("/storytold/") ? upstream : fork;
    if (args.includes("push")) w.gh.writes.push({ kind: "push", number: 5 });
    const local = args.map((a, i) => (i === urlAt ? target : a)).filter((a, i, all) => a !== "protocol.file.allow=never" && !(a === "-c" && all[i + 1] === "protocol.file.allow=never"));
    return exec("git", local, opt);
  };
  const deps: CollectDeps = {
    exec: run, now: () => new Date(T1), root: join(root, "cache"), mainHead: async () => sha,
    fetchCrates: async () => ({ ok: true, rust: true, crates: [{ name: "app", dir: "crates/app" }] }),
    fetchPaths: async () => [o.lib, "README.md"],
    ask: async (_db, id) => id === "fixissue.triage"
      ? JSON.stringify([{ ref: "app#5", fixable: true, reason: "panics on an empty slice", crate: "app", files: [o.lib] }])
      : id === "fixissue.check" ? JSON.stringify({ verdict: "approve", reasons: "fixes the cause", problems: [] }) : o.fix,
    summarise: async () => "failed",
  };
  return { deps, prs, comments };
}

/** The sandbox finished a lint task: the formatter's diff (if it changed anything) and clippy's JSON lines come back as artifacts. */
function putLint(w: World, id: number, o: { format?: string; diagnostics?: { line: number }[]; file?: string } = {}): void {
  const put = (name: string, text: string) => { const tmp = tempPath(id); writeFileSync(tmp, text); storeArtifact(w.db, id, name, tmp); };
  const diag = (line: number) => JSON.stringify({ reason: "compiler-message", message: { level: "warning", message: "needless", code: { code: "clippy::needless_return" }, spans: [{ file_name: o.file ?? "src/lib.rs", line_start: line, line_end: line, is_primary: true }], rendered: `warning: needless at line ${line}\n` } });
  put("clippy.txt", [...(o.diagnostics ?? []).map((d) => diag(d.line)), JSON.stringify({ reason: "build-finished", success: !o.diagnostics?.length })].join("\n") + "\n");
  if (o.format) put("format.txt", o.format);
}

function endLint(w: World, id: number, o: Parameters<typeof putLint>[2] = {}): void {
  putLint(w, id, o);
  w.db.prepare("UPDATE build_tasks SET state = 'done', results = '[]', ended_at = ? WHERE id = ?").run(T1, id);
}

/** The sandbox finished a build task: every step passed, or the test step failed. */
function endTask(w: World, id: number, end: "pass" | "fail-test"): void {
  const t = getTask(w.db, id)!;
  const results = [];
  for (const s of t.plan) {
    const bad = end === "fail-test" && s.name === "test";
    results.push({ step: s.name, exitCode: bad ? 101 : 0, durationMs: 1, timedOut: false });
    if (bad) break;
  }
  w.db.prepare("UPDATE build_tasks SET state = ?, results = ?, ended_at = ? WHERE id = ?").run(end === "pass" ? "done" : "failed", JSON.stringify(results), T1, id);
}

const sh = (cwd: string, ...args: string[]): string => {
  const r = spawnSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", ...args], { cwd, encoding: "utf8" });
  if (r.status !== 0) throw new Error(`git ${args.join(" ")}: ${r.stderr}`);
  return r.stdout.trim();
};

/** A contributor's fork on disk (branch fix-<n>) that stands in for both GitHub URLs; git runs for real, gh is faked. */
function gitWorld(n: number, lib = "fn a() {}\nfn main() { a(); }\n", conflict = false) {
  const root = tmpdir("git");
  const work = join(root, "work");
  mkdirSync(join(work, "src"), { recursive: true });
  sh(work, "init", "-q", "-b", conflict ? "main" : `fix-${n}`);
  writeFileSync(join(work, "src/lib.rs"), lib);
  sh(work, "add", "-A");
  sh(work, "commit", "-q", "-m", "contributor");
  if (conflict) {
    // The PR and the default branch both change line 2 of the file.
    sh(work, "checkout", "-q", "-b", `fix-${n}`);
    writeFileSync(join(work, "src/lib.rs"), lib.replace("main() { a(); }", "main() { a(); a(); }"));
    sh(work, "commit", "-q", "-am", "contributor change");
    sh(work, "checkout", "-q", "main");
    writeFileSync(join(work, "src/lib.rs"), lib.replace("main() { a(); }", "main() { a(); b(); }"));
    sh(work, "commit", "-q", "-am", "base change");
    sh(work, "checkout", "-q", `fix-${n}`);
  }
  const head = sh(work, "rev-parse", "HEAD");
  const fork = join(root, "fork.git");
  sh(root, "clone", "-q", "--bare", work, fork);
  sh(fork, "update-ref", `refs/pull/${n}/head`, head);
  const pushes: { lease: string; to: string }[] = [];
  const edit = (from: string, to: string) => `diff --git a/src/lib.rs b/src/lib.rs\n--- a/src/lib.rs\n+++ b/src/lib.rs\n@@ -1,2 +1,2 @@\n${from}${to}`;
  const patch = lib.includes("main() { a(); }")
    ? edit("-fn a() {}\n-fn main() { a(); }\n", "+fn b() {}\n+fn main() { b(); }\n")
    : edit("-fn a() {}\n-fn main() { b(); }\n", "+fn b() {}\n+fn main() { b(); }\n");
  return {
    head, pushes, fork, patch,
    branchHead: () => sh(fork, "rev-parse", `refs/heads/fix-${n}`),
    deps(w: World): FixupDeps {
      const querier: Querier = {
        ...w.gh.querier,
        query: async (query: string, vars: object) => query.includes("headRefName")
          ? { repository: { pullRequest: { id: `P${n}`, state: "OPEN", isDraft: false, headRefOid: head, headRefName: `fix-${n}`, maintainerCanModify: true, mergeable: conflict ? "CONFLICTING" : "MERGEABLE", headRepository: { nameWithOwner: "contrib/app" }, assignees: { nodes: [] } } } }
          : w.gh.querier.query(query, vars),
      } as Querier;
      const run: Exec = async (cmd, args, o = {}): Promise<ExecResult> => {
        if (cmd === "gh") {
          if (args[0] === "api") return { code: 0, stdout: JSON.stringify({ login: "pipeline-bot", id: 42, node_id: "U42" }), stderr: "" };
          w.gh.writes.push({ kind: "comment", number: n, detail: o.input });
          return { code: 0, stdout: "", stderr: "" };
        }
        // GitHub's URLs point at the fork on disk, which needs the file protocol.
        const toFork = args.map((a) => (a.startsWith("https://github.com/") ? fork : a));
        const local = toFork.filter((a, i) => a !== "protocol.file.allow=never" && !(a === "-c" && toFork[i + 1] === "protocol.file.allow=never"));
        if (args.includes("push")) {
          const lease = args.find((a) => a.startsWith("--force-with-lease="))!.split(":")[1]!;
          const to = args.find((a) => /^[0-9a-f]{40}:/.test(a))!.split(":")[0]!;
          pushes.push({ lease, to });
          w.gh.writes.push({ kind: "push", number: n, head: to });
        }
        return exec("git", local, { ...o });
      };
      return {
        querier, exec: run, now: () => new Date(T1), root: join(root, "cache"),
        fetchDiff: async () => ({ ok: true, text: "diff --git a/src/lib.rs b/src/lib.rs\n--- a/src/lib.rs\n+++ b/src/lib.rs\n@@ -1 +1 @@\n-x\n+fn a() {}\n" }),
        ask: async () => patch,
        check: async () => JSON.stringify({ verdict: "approve", reasons: "matches the listed fix", problems: [] }),
      };
    },
    /** The CI fix step's deps: the failed check's log names src/lib.rs. */
    cifixDeps(w: World): CifixDeps {
      const base = this.deps(w);
      const log = "test\tcargo test\t2026-01-01T00:00:00Z error[E0425]: cannot find value `b` in this scope\ntest\tcargo test\t2026-01-01T00:00:01Z  --> src/lib.rs:2:20\n";
      return {
        ...base,
        ask: base.ask as unknown as CifixDeps["ask"],
        gh: async (args) => {
          if (args[0] === "api" && args[1]!.includes("/pulls/")) return `${"b".repeat(40)}\n`;
          if (args[0] === "api") return JSON.stringify({ check_runs: [{ name: CHECK, status: "completed", conclusion: "failure", completed_at: "2026-01-03T12:00:00Z", details_url: "https://github.com/storytold/app/actions/runs/11/job/5" }] });
          return log;
        },
        check: async () => JSON.stringify({ verdict: "approve", reasons: "fixes the compile error only", problems: [] }),
      };
    },
  };
}
