// CI fix: candidates, the log triage, the formatter, the rerun, the model patch and its check, the push and the comment fallback.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, mock, test } from "node:test";
import type { DatabaseSync } from "node:sqlite";
import { spawnSync } from "node:child_process";
import { setCommentApproval } from "../src/act/approval.ts";
import { storeArtifact, tempPath } from "../src/build/artifacts.ts";
import { connect } from "../src/db.ts";
import { FORMAT_ARTIFACT, gitFormatDiff, runCifix, type CifixDeps } from "../src/cifix/index.ts";
import { formattingOnly, guardPatch } from "../src/cifix/guard.ts";
import { parseFailedLog } from "../src/cifix/logs.ts";
import { triage } from "../src/cifix/triage.ts";
import type { CifixPr, CiFailure } from "../src/cifix/types.ts";
import { REPO_PATH } from "../src/sandbox/command.ts";
import { setPushApproval } from "../src/fixup/approval.ts";
import { exec, type Exec, type ExecResult } from "../src/fixup/git.ts";
import { setCiApproval } from "../src/merge/ci-approval.ts";
import { CLIPPY_ARTIFACT } from "../src/prepush/index.ts";
import type { Querier } from "../src/mirror.ts";
import { saveOpus } from "../src/review/opus.ts";
import { validating } from "./gql.ts";
import { SCRATCH } from "./scratch.ts";

mkdirSync(SCRATCH, { recursive: true });
const dir = mkdtempSync(join(SCRATCH, "cifix-test-"));
process.env.AUTOCRAFT_DIFF_CACHE = join(dir, "diffs");
process.env.AUTOCRAFT_ARTIFACT_DIR = join(dir, "artifacts");
const T0 = "2026-01-01T00:00:00Z";
const T1 = "2026-01-02T00:00:00Z";
const T2 = "2026-01-03T00:00:00Z";

function git(cwd: string, ...args: string[]): string {
  const r = spawnSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", ...args], { cwd, encoding: "utf8" });
  if (r.status !== 0) throw new Error(`git ${args.join(" ")}: ${r.stderr}`);
  return r.stdout.trim();
}

type Opts = { canModify?: boolean; push?: boolean; comment?: boolean; ci?: boolean; verdict?: string; overall?: string; head?: string };

/** One PR (#7) at `head` whose gate check failed. */
function fresh(head: string, o: Opts = {}): DatabaseSync {
  const db = connect(join(mkdtempSync(join(dir, "db-")), "t.db"));
  db.prepare(`INSERT INTO items (repo, number, kind, state, title, author, additions, deletions, head_oid, created_at, updated_at)
    VALUES ('app', 7, 'pr', 'OPEN', 'Rename a to b', 'someone', 5, 0, ?, '${T0}', '${T0}')`).run(head);
  db.prepare(`INSERT INTO opus_reviews (repo, number, head_oid, run_id, at, model, verdict, reason, fixes, sure, mode) VALUES ('app', 7, ?, 'rv', '${T0}', 'm', ?, 'looks right', '[]', 1, 'full')`)
    .run(head, o.verdict ?? "take");
  db.prepare(`INSERT INTO pr_checks (repo, number, head_oid, state, is_draft, overall, checks, mergeable, maintainer_can_modify, fetched_at)
    VALUES ('app', 7, ?, 'OPEN', 0, ?, '[{"name":"gate / test","state":"failure"}]', 'MERGEABLE', ?, '${T1}')`).run(head, o.overall ?? "failure", o.canModify === false ? 0 : 1);
  db.prepare("INSERT INTO tracked_repos (name, added_by, added_at, pipeline) VALUES ('app', 'op', ?, 1) ON CONFLICT DO NOTHING").run(T0);
  if (o.push !== false) setPushApproval(db, "op", "app", true);
  if (o.comment) setCommentApproval(db, "op", "app", true);
  if (o.ci) setCiApproval(db, "op", "app", true);
  return db;
}

describe("candidates", () => {







});

const step = (job: string, name: string, tail: string) => ({ job, step: name, tail });
const failure = (conclusion: string, steps: ReturnType<typeof step>[]): CiFailure => ({ head: "h", checks: [{ name: "gate / test", conclusion, runId: 11, steps }] });

describe("triage", () => {
  test("formatter-only output is format; any compiler or test error makes it code", () => {
    assert.equal(triage(failure("failure", [step("fmt", "Check formatting", "Diff in /w/src/lib.rs:1:\n-fn a() {}\n+fn a() { }\n")])).kind, "format");
    assert.equal(triage(failure("failure", [step("fmt", "Check formatting", "Diff in /w/src/lib.rs:1:\n"), step("test", "cargo test", "error[E0425]: cannot find value\n")])).kind, "code");
    assert.equal(triage(failure("failure", [step("test", "cargo test", "test result: FAILED. 1 passed; 1 failed\n")])).kind, "code");
    assert.equal(triage(failure("failure", [step("lint", "cargo clippy", "error: this could be `x` (clippy::needless)\n")])).kind, "code");
  });

  test("the gate runner's `error: ci failed at` line is not a compiler error", () => {
    const log = "Diff in /w/src/lib.rs:1:\n-fn a() {}\n+fn a() { }\nerror: ci failed at `fmt`\n";
    assert.equal(triage(failure("failure", [step("gate", "Run cargo xtask ci", log)])).kind, "format");
    assert.equal(triage(failure("failure", [step("gate", "Run cargo xtask ci", "error: ci failed at `clippy`\n")])).kind, "code");
  });


  test("a timed out run, or a network error without a code error, is infra; infra is tested before format", () => {
    assert.equal(triage(failure("failure", [step("fmt", "Check formatting", "Diff in /w/src/lib.rs:1:\nCould not resolve host: x\n")])).kind, "infra");
    assert.equal(triage(failure("timed_out", [step("test", "cargo test", "")])).kind, "infra");
    assert.equal(triage(failure("failure", [step("build", "cargo fetch", "warning: spurious network error (2 tries remaining): Could not resolve host: index.crates.io\n")])).kind, "infra");
    // A network word next to a real error is the PR's failure.
    assert.equal(triage(failure("failure", [step("test", "cargo test", "Could not resolve host: x\nerror[E0308]: mismatched types\n")])).kind, "code");
  });


  test("the failed-step log is grouped per job and step and cut to its tail", () => {
    const text = `test\tcargo test\t2026-01-01T00:00:01.0000000Z \u001b[31merror\u001b[0m: boom\ntest\tcargo test\t2026-01-01T00:00:02.0000000Z more\nfmt\tcheck\t2026-01-01T00:00:03.0000000Z Diff in x:1:\n`;
    const steps = parseFailedLog(text);
    assert.deepEqual(steps.map((s) => [s.job, s.step, s.tail]), [["test", "cargo test", "error: boom\nmore\n"], ["fmt", "check", "Diff in x:1:\n"]]);
    assert.equal(parseFailedLog(`j\ts\t${"x".repeat(9000)}\n`)[0]!.tail.length, 4000);
  });
});

describe("guard", () => {
  /** A one-hunk git diff of `before` to `after`, at the lines that really change, and the guard's verdict on it. */
  const judge = (before: string, after: string, file = "src/lib.rs", sides = new Map([[file, { before, after }]])) => {
    const a = before.split("\n"), b = after.split("\n");
    let p = 0;
    while (p < a.length && p < b.length && a[p] === b[p]) p++;
    let q = 0;
    while (q < a.length - p && q < b.length - p && a[a.length - 1 - q] === b[b.length - 1 - q]) q++;
    const old = a.slice(p, a.length - q), now = b.slice(p, b.length - q);
    const diff = `diff --git a/${file} b/${file}\n--- a/${file}\n+++ b/${file}\n@@ -${p + (old.length ? 1 : 0)},${old.length} +${p + (now.length ? 1 : 0)},${now.length} @@\n${[...old.map((l) => `-${l}`), ...now.map((l) => `+${l}`)].join("\n")}\n`;
    return guardPatch(diff, sides);
  };
  test("a patch that edits tests, disables lints or drops assertions is refused", () => {
    assert.match(judge("a\n", "b\n", "tests/png.rs")!, /test file/);
    assert.match(judge("a\n", "b\n", "src/png/tests.rs")!, /test file/);
    assert.match(judge("fn a() {}\n", "#[allow(dead_code)] fn a() {}\n")!, /disables/);
    assert.match(judge("fn a() {\n    assert_eq!(a(), 1);\n}\n", "fn a() {\n    let _ = a();\n}\n")!, /assertion/);
    assert.equal(judge("fn a() {}\n", "fn b() {}\n"), null);
    assert.match(judge("fn a() {}\n", "#[cfg(feature = \"x\")] fn a() {}\n")!, /disables/);
    assert.match(judge("fn a() {}\n", "#[should_panic] fn a() {}\n")!, /disables/);
  });

  const SRC = "fn a() {}\n\n#[cfg(test)]\nmod tests {\n    fn helper() {\n        let x = \"}\";\n    }\n\n    #[test]\n    fn t() {\n        check();\n    }\n}\n\nfn last() {}\n";

  test("a change inside a #[cfg(test)] module is refused; one outside is allowed", () => {
    assert.match(judge(SRC, SRC.replace('let x = "}";', 'let x = "{";'))!, /test code/);
    assert.equal(judge(SRC, SRC.replace("fn a() {}", "fn b() {}")), null);
    assert.equal(judge(SRC, SRC.replace("fn last() {}", "fn end() {}")), null);
    assert.match(judge(SRC, SRC.replace("fn a() {}", "fn b() {}"), "src/lib.rs", new Map())!, /could not be read/);
    assert.match(judge("#[test]\nfn a() {\n", "#[test]\nfn b() {\n")!, /could not be checked/);
  });

  test("an early return added to a #[test] function is refused", () => {
    assert.match(judge("#[test]\nfn t() {\n    check();\n}\n", "#[test]\nfn t() {\n    return;\n    check();\n}\n")!, /early return/);
  });
});

// ---- the whole step against real git, with the network replaced ------------

type World = { fork: string; head: string; log: string[]; deps: CifixDeps };

const APPROVE = JSON.stringify({ verdict: "approve", reasons: "fixes the compile error only", problems: [] });
const CODE_LOG = "test\tcargo test\t2026-01-01T00:00:00Z error[E0425]: cannot find value `b` in this scope\ntest\tcargo test\t2026-01-01T00:00:01Z  --> src/lib.rs:2:20\n";
const FMT_LOG = "fmt\tCheck formatting\t2026-01-01T00:00:00Z Diff in /home/runner/work/app/app/src/lib.rs:1:\n";
const BASE = "b".repeat(40);
const GOOD = "diff --git a/src/lib.rs b/src/lib.rs\n--- a/src/lib.rs\n+++ b/src/lib.rs\n@@ -1,2 +1,2 @@\n-fn a() {}\n-fn main() { b(); }\n+fn b() {}\n+fn main() { b(); }\n";

function world(opts: { log?: string; reply?: string | null; check?: string | null; canModify?: boolean; pushError?: string; conclusion?: string; completedAt?: string; checkRuns?: unknown[]; commentFails?: boolean; /** The comment fails before its request goes out. */ commentUnsent?: boolean; closedAfter?: number; decision?: string; lib?: string } = {}): World {
  const root = mkdtempSync(join(dir, "w-"));
  const work = join(root, "work");
  mkdirSync(work);
  git(work, "init", "-q", "-b", "fix");
  mkdirSync(join(work, "src"));
  writeFileSync(join(work, "src/lib.rs"), opts.lib ?? "fn a() {}\nfn main() { b(); }\n");
  git(work, "add", "-A");
  git(work, "commit", "-q", "-m", "contributor");
  const head = git(work, "rev-parse", "HEAD");
  const fork = join(root, "fork.git");
  git(root, "clone", "-q", "--bare", work, fork);
  git(fork, "update-ref", "refs/pull/7/head", head);
  const log: string[] = [];
  let reads = 0;
  const querier: Querier = validating({
    spent: 0, remaining: 5000,
    async query() {
      return { repository: { pullRequest: {
        id: "PR7", number: 7, commits: { nodes: [{ commit: { oid: head, statusCheckRollup: { contexts: { nodes: [{ __typename: "CheckRun", name: "gate / test", status: "COMPLETED", conclusion: "FAILURE" }] } } } }] }, state: opts.closedAfter !== undefined && ++reads > opts.closedAfter ? "CLOSED" : "OPEN", isDraft: false, headRefOid: head, headRefName: "fix", maintainerCanModify: opts.canModify !== false, mergeable: "MERGEABLE",
        headRepository: { nameWithOwner: "contrib/app" }, assignees: { nodes: [] }, reviewDecision: opts.decision ?? null,
      } } };
    },
  });
  const run: Exec = async (cmd, args, o = {}): Promise<ExecResult> => {
    if (cmd === "gh") {
      if (args[0] === "api") return { code: 0, stdout: JSON.stringify({ login: "pipeline-bot", id: 42, node_id: "U42" }), stderr: "" };
      if (args[0] === "run") { log.push(`rerun ${args[2]}`); return { code: 0, stdout: "", stderr: "" }; }
      log.push(`comment: ${o.input}`);
      if (opts.commentUnsent) return { code: 1, stdout: "", stderr: "app identity: no installation token for storytold/app: HTTP 500", sent: false };
      return opts.commentFails ? { code: 1, stdout: "", stderr: "HTTP 403" } : { code: 0, stdout: "", stderr: "" };
    }
    const net = args.findIndex((a) => a.startsWith("https://github.com/"));
    const sub = net >= 0 ? args.map((a) => (a.startsWith("https://github.com/") ? fork : a)) : args;
    const sub2 = sub.filter((a, i) => !(a === "-c" && sub[i + 1] === "protocol.file.allow=never") && a !== "protocol.file.allow=never");
    if (args.includes("push")) {
      log.push("push");
      if (opts.pushError) return { code: 1, stdout: "", stderr: opts.pushError };
    }
    return exec("git", net >= 0 ? sub2 : args, { ...o });
  };
  const deps: CifixDeps = {
    querier, exec: run, now: () => new Date(T2), root: join(root, "cache"),
    fetchDiff: async () => ({ ok: true, text: "diff --git a/src/lib.rs b/src/lib.rs\n--- a/src/lib.rs\n+++ b/src/lib.rs\n@@ -1 +1 @@\n-x\n+fn a() {}\n" }),
    gh: async (args) => {
      if (args[0] === "api" && args[1]!.includes("/pulls/")) return `${BASE}\n`;
      if (args[0] === "api") return JSON.stringify({ check_runs: opts.checkRuns ?? [
        { name: "gate / test", status: "completed", conclusion: opts.conclusion ?? "failure", completed_at: opts.completedAt ?? "2026-01-03T12:00:00Z", details_url: "https://github.com/storytold/app/actions/runs/11/job/5" },
        { name: "optional / lint", status: "completed", conclusion: "success", details_url: "https://github.com/storytold/app/actions/runs/12/job/6" },
      ] });
      log.push("read-log");
      return opts.log ?? CODE_LOG;
    },
    ask: async () => { log.push("model"); return opts.reply === undefined ? GOOD : opts.reply; },
    check: async (_db, input) => {
      log.push("check");
      assert.deepEqual(input[0]!.fixes, []);
      assert.deepEqual(input[0]!.ci_failure!.checks, ["gate / test"]);
      return opts.check === undefined ? APPROVE : opts.check;
    },
  };
  return { fork, head, log, deps };
}

const spreadDiff = (path: string) => `diff --git a/${path} b/${path}\n--- a/${path}\n+++ b/${path}\n` + Array.from({ length: 24 }, (_, i) => 1 + i * 250).map((n) => `@@ -${n} +${n} @@\n-x\n+fn f${n}() {}\n`).join("");
const rows = (db: DatabaseSync, sql: string) => (db.prepare(sql).all() as Record<string, unknown>[]).map((r) => ({ ...r }));

describe("code failure", () => {
  test("a file over the size limit fails without a checkout and is listed by path alone with one", async () => {
    const lib = "fn a() {}\nfn main() { b(); }\n" + Array.from({ length: 6000 }, (_, i) => `fn f${i}() {}`).join("\n") + "\n";
    const held = world({ lib });
    const asked: CifixPr[] = [];
    held.deps.fetchDiff = async () => ({ ok: true, text: spreadDiff("src/lib.rs") });
    held.deps.ask = async (_db, input) => { asked.push(...input); return GOOD; };
    await runCifix(fresh(held.head), { repo: "app", dryRun: false }, () => {}, held.deps);
    assert.equal(asked.length, 0);

    const w = world({ lib });
    w.deps.fetchDiff = async () => ({ ok: true, text: spreadDiff("src/lib.rs") });
    w.deps.ask = async (_db, input) => { asked.push(...input); return GOOD; };
    w.deps.checkout = async () => "/checkout";
    await runCifix(fresh(w.head), { repo: "app", dryRun: false }, () => {}, w.deps);
    assert.equal(asked.length, 1);
    assert.deepEqual(asked[0]!.files, [{ path: "src/lib.rs" }]);
    assert.equal(asked[0]!.repo_dir, REPO_PATH);
  });





});

describe("format failure", () => {
  const hdr = "diff -uN a/src/lib.rs b/src/lib.rs\n--- a/src/lib.rs\t2026-01-01 00:00:00.000000000 +0000\n+++ b/src/lib.rs\t2026-01-01 00:00:01.000000000 +0000\n@@ -1,2 +1,2 @@\n";
  // Spacing only.
  const diffText = `${hdr}-fn a() {}\n+fn a() { }\n fn main() { b(); }\n`;
  // What a PR that aliases the formatter, or prints fake `Diff in` lines, can make it produce: a code change.
  const forced = `${hdr}-fn a() {}\n-fn main() { b(); }\n+fn b() {}\n+fn main() { b(); }\n`;

  /** Runs the step to the queued formatter task, gives the task `diff` as its result and applies it. */
  async function formatRun(w: World, diff: string | null, db = fresh(w.head)) {
    await runCifix(db, { repo: "app", dryRun: false }, () => {}, w.deps);
    const task = rows(db, "SELECT id FROM build_tasks")[0]!;
    db.prepare("UPDATE build_tasks SET state = 'done', ended_at = ? WHERE id = ?").run(T2, Number(task.id));
    if (diff !== null) {
      const tmp = tempPath(Number(task.id));
      writeFileSync(tmp, diff);
      storeArtifact(db, Number(task.id), FORMAT_ARTIFACT, tmp);
    }
    return { db, summary: await runCifix(db, { repo: "app", dryRun: false }, () => {}, w.deps) };
  }


  test("formatting is checked by tokens: spacing passes, anything else is refused", () => {
    const fmt = (a: string, b: string) => formattingOnly("x.rs", a, b);
    assert.equal(fmt("fn a(x:i32){ }\nfn b(){}\n", "fn a(x: i32) {}\nfn b() {}\n"), null);
    assert.equal(fmt("f(a, b)\n", "f(a,\n  b)\n"), null);
    // Reordered, trailing comma, moved line.
    assert.notEqual(fmt("use b;\nuse a;\n", "use a;\nuse b;\n"), null);
    assert.notEqual(fmt("f(a, b)\n", "f(a, b,)\n"), null);
    assert.notEqual(fmt("let a = 1;\nlet b = 2;\n", "let b = 2;\nlet a = 1;\n"), null);
    // Whitespace inside a string literal or a comment is content.
    assert.notEqual(fmt('let s = "a b";\n', 'let s = "ab";\n'), null);
    assert.notEqual(fmt('let s = r#"a  b"#;\n', 'let s = r#"a b"#;\n'), null);
    assert.notEqual(fmt("// a  b\nfn f() {}\n", "// a b\nfn f() {}\n"), null);
    assert.equal(fmt("// a b  \nfn f() {}\n", "// a b\nfn f() {}\n"), null);
    // `/ *` and `/*` differ: the second opens a comment that may run to a planted `*/`.
    assert.notEqual(fmt("let y = x / *p; // done */\n", "let y = x /*p; // done */\n"), null);
    assert.notEqual(fmt("a - > b\n", "a -> b\n"), null);
    // Lifetimes and chars are not strings.
    assert.equal(fmt("fn f<'a>(x:&'a u8)->char{'}'}\n", "fn f<'a>(x: &'a u8) -> char { '}' }\n"), null);
  });




  test("a string-literal whitespace change or a `/ *` turned into a comment opener in a formatter result is refused", async () => {
    const mk = (from: string, to: string) => `diff -uN a/src/lib.rs b/src/lib.rs\n--- a/src/lib.rs\n+++ b/src/lib.rs\n@@ -1,2 +1,2 @@\n-${from}\n+${to}\n fn main() { b(); }\n`;
    for (const [from, to] of [["fn a() {}", 'fn a() { let s = "a b"; }'], ["fn a() {}", "fn a() { x / *p; }"]]) {
      const w = world({ log: FMT_LOG });
      const db = fresh(w.head);
      // The head holds the spaced version; the "formatter" result drops the space.
      git(w.fork, "update-ref", "refs/heads/unused", w.head);
      const spaced = mk(from!, to!);
      const { summary } = await formatRun(w, spaced, db);
      assert.deepEqual(summary.pushed, []);
      assert.ok(!w.log.includes("push"));
    }
  });





  test("diff -ruN output becomes a git-format diff", () => {
    assert.match(gitFormatDiff(diffText), /^diff --git a\/src\/lib\.rs b\/src\/lib\.rs\n--- a\/src\/lib\.rs\n\+\+\+ b\/src\/lib\.rs\n@@/);
  });
});

describe("infrastructure failure", () => {



});

describe("unsure carries across the pushed head", () => {
  const review = (sure: boolean) => ({ ref: "x", verdict: "take" as const, sure, reason: sure ? "sure" : "unsure", fixes: [], risks: ["r"], summary: null, why: null, public: null, conflicts: [], claims: [], blocked_by: [] });
  const save = (db: DatabaseSync, head: string, sure: boolean) => saveOpus(db, null, { repo: "app", number: 1, head_oid: head }, { mode: "full", base: null, model: "m", review: review(sure) });

});

describe("exits record their state", () => {





});

describe("pushes are recorded before they happen", () => {

});


test("a stored patch whose comment did not reach GitHub is posted again after the backoff, with no new model or lint run", async () => {
  const at = Date.parse(T2);
  mock.timers.enable({ apis: ["Date"], now: at });
  try {
    const opts = { canModify: false, commentUnsent: true };
    const w = world(opts);
    w.deps.now = () => new Date();
    const db = fresh(w.head, { canModify: false, comment: true });
    const out: string[] = [];
    const run = () => runCifix(db, { repo: "app", dryRun: false }, (l) => out.push(l), w.deps);
    const states = () => rows(db, "SELECT state FROM ci_fixes ORDER BY rowid").map((r) => r.state);
    const comments = () => w.log.filter((l) => l.startsWith("comment:")).length;
    await run();
    assert.deepEqual(states(), ["linting"], out.join("\n"));
    const task = Number(rows(db, "SELECT id FROM build_tasks")[0]!.id);
    db.prepare("UPDATE build_tasks SET state = 'done', ended_at = ? WHERE id = ?").run(new Date().toISOString(), task);
    const tmp = tempPath(task);
    writeFileSync(tmp, '{"reason":"build-finished","success":true}\n');
    storeArtifact(db, task, CLIPPY_ARTIFACT, tmp);

    await run();
    assert.equal(comments(), 1);
    assert.deepEqual(states(), ["linting", "comment-unsent"], "the stored patch keeps its row, a try");

    mock.timers.setTime(at + 5 * 60_000);
    await run();
    assert.equal(comments(), 1, "not before the backoff ends");
    assert.deepEqual(states(), ["linting", "comment-unsent"]);

    mock.timers.setTime(at + 11 * 60_000);
    opts.commentUnsent = false;
    await run();
    assert.equal(comments(), 2);
    assert.deepEqual(states(), ["asked", "comment-unsent"]);
    assert.equal(w.log.filter((l) => l === "model").length, 1);
    assert.equal(rows(db, "SELECT id FROM build_tasks").length, 1);
  } finally {
    mock.timers.reset();
  }
});
