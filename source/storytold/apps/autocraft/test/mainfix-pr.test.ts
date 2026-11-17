// Fix PR of a red default branch: the patch is stored with its lint task and the step ends; a later run collects the result.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import type { DatabaseSync } from "node:sqlite";
import { storeArtifact, tempPath } from "../src/build/artifacts.ts";
import { connect } from "../src/db.ts";
import { HARDENING, type Exec } from "../src/fixup/git.ts";
import { mainFixDue, onCodeVerdict, runMainFix, setMainFixApproval, type FixRow, type MainFixDeps } from "../src/mainfix/index.ts";
import { CLIPPY_ARTIFACT } from "../src/prepush/index.ts";
import { SCRATCH } from "./scratch.ts";

mkdirSync(SCRATCH, { recursive: true });
const dir = mkdtempSync(join(SCRATCH, "mainfix-pr-"));
const T0 = "2026-01-01T00:00:00Z";
const PR_URL = "https://github.com/storytold/app/pull/9";

function git(cwd: string, ...args: string[]): string {
  const r = spawnSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", ...args], { cwd, encoding: "utf8" });
  if (r.status !== 0) throw new Error(`git ${args.join(" ")}: ${r.stderr}`);
  return r.stdout.trim();
}

const BROKEN = "fn a() -> i32 {\n    1\n}\nfn main() {\n    let x: i32 = b();\n}\n";

/** A repo whose head has a compile error, the patch that fixes it, and the fork the PR branch is pushed to. */
function world() {
  const work = mkdtempSync(join(dir, "work-"));
  git(work, "init", "-q", "-b", "main");
  mkdirSync(join(work, "src"));
  writeFileSync(join(work, "src/lib.rs"), BROKEN);
  git(work, "add", "-A");
  git(work, "commit", "-qm", "break");
  const head = git(work, "rev-parse", "HEAD");
  writeFileSync(join(work, "src/lib.rs"), BROKEN.replace("b()", "a()"));
  const patch = `${git(work, "diff")}\n`;
  git(work, "checkout", "-q", "src/lib.rs");
  const fork = mkdtempSync(join(dir, "fork-"));
  git(fork, "init", "-q", "--bare");

  const db = connect(join(mkdtempSync(join(dir, "db-")), "t.db"));
  db.prepare("INSERT INTO tracked_repos (name, added_by, added_at, pipeline) VALUES ('app', 'op', ?, 1)").run(T0);
  setMainFixApproval(db, "op", "app", true);
  db.prepare("INSERT INTO main_ci (repo, head_sha, branch, state, failing, checks, first_seen_at, state_changed_at, updated_at) VALUES ('app', ?, 'main', 'red', '[]', '[]', ?, ?, ?)").run(head, T0, T0, T0);
  const row: FixRow = { repo: "app", head_sha: head, check: "gate / test", verdict: "code", state: "needs-fix", reason: null, run_id: 11, run_url: null, excerpt: null, decision_id: null, issue_number: null, pr_number: null, pr_url: null, patch: null, files: null, lint_task: null, lint_round: null, lint_state: null, session: null, created_at: T0, updated_at: T0 };
  onCodeVerdict(db, row, "a compile error", T0);

  const asked: { previous?: { patch: string; findings: string[] }; files: unknown }[] = [];
  const log = { pushed: 0, opened: 0 };
  // git talks to local directories in place of github.com; gh answers from fixed data.
  const exec: Exec = async (cmd, args, opts = {}) => {
    const ok = (stdout = "") => ({ code: 0, stdout, stderr: "" });
    if (cmd === "git") {
      const url = args.find((a) => a.startsWith("https://github.com/"));
      const mapped = args.map((a) => (a === url ? (a.includes("/bot/") ? fork : work) : a));
      if (args.includes("push")) log.pushed++;
      const r = spawnSync("git", [...mapped.slice(0, HARDENING.length), "-c", "protocol.file.allow=always", ...mapped.slice(HARDENING.length)], { cwd: opts.cwd, env: { ...process.env, ...opts.env }, input: opts.input, encoding: "utf8" });
      return { code: r.status ?? 1, stdout: r.stdout, stderr: r.stderr };
    }
    const joined = args.join(" ");
    if (joined === "api user") return ok(JSON.stringify({ login: "bot", id: 5, node_id: "N" }));
    if (joined.startsWith("api repos/bot/app")) return ok("storytold/app");
    if (args[0] === "pr" && args[1] === "list") return ok("");
    if (args[0] === "pr" && args[1] === "create") { log.opened++; return ok(`${PR_URL}\n`); }
    return { code: 1, stdout: "", stderr: `unexpected gh call: ${joined}` };
  };
  const gh = async (args: string[]): Promise<string> => {
    if (args[1]?.includes("check-runs")) return JSON.stringify({ check_runs: [{ name: "gate / test", status: "completed", conclusion: "failure", details_url: "https://github.com/storytold/app/actions/runs/11/job/1" }] });
    if (args[0] === "run") return "test\tcargo test\terror[E0425]: cannot find function `b`\ntest\tcargo test\t --> src/lib.rs:5:18\n";
    throw new Error(`unexpected call: ${args.join(" ")}`);
  };
  const deps: MainFixDeps = {
    gh, exec, now: () => new Date(T0), classify: async () => null,
    fix: {
      root: join(dir, "fixups"),
      ask: async (_db, input) => { const i = (input as { previous?: { patch: string; findings: string[] }; files: unknown }[])[0]!; asked.push({ previous: i.previous, files: i.files }); return patch; },
      check: async () => '{"verdict":"approve","reasons":"fixes the call","problems":[]}',
      checkout: async () => join(dir, "checkout"),
    },
  };
  const step = () => runMainFix(db, { repo: "app" }, () => {}, deps);
  return { db, head, step, asked, log };
}

/** Ends the repo's newest lint task with these clippy diagnostics (NDJSON). */
function finishLint(db: DatabaseSync, clippy: string): number {
  const id = Number((db.prepare("SELECT id FROM build_tasks ORDER BY id DESC LIMIT 1").get() as { id: number }).id);
  db.prepare("UPDATE build_tasks SET state = 'done', ended_at = ? WHERE id = ?").run(T0, id);
  const tmp = tempPath(id);
  writeFileSync(tmp, clippy);
  storeArtifact(db, id, CLIPPY_ARTIFACT, tmp);
  return id;
}
const CLEAN = '{"reason":"build-finished","success":true}\n';
const FINDING = JSON.stringify({ reason: "compiler-message", message: { level: "warning", message: "redundant", code: { code: "clippy::redundant_clone" }, spans: [{ file_name: "src/lib.rs", line_start: 5, line_end: 5, is_primary: true }], rendered: "warning: redundant\n" } });
const stateOf = (db: DatabaseSync) => (db.prepare("SELECT state, lint_round AS round, pr_number AS pr, reason FROM main_fixes").get() as { state: string; round: number | null; pr: number | null; reason: string | null });

test("the step stores the patch and ends; the next run opens the PR once lint is clean", async () => {
  const w = world();
  assert.equal((await w.step()).prs, 0);
  assert.equal(stateOf(w.db).state, "linting");
  assert.equal(w.log.opened, 0);
  assert.deepEqual(w.asked[0]!.files, [{ path: "src/lib.rs" }], "with a checkout the model gets paths, not file contents");
  assert.equal(mainFixDue(w.db, "app"), false, "the lint task is still running");
  await w.step();
  assert.equal(stateOf(w.db).state, "linting");
  finishLint(w.db, CLEAN);
  assert.equal(mainFixDue(w.db, "app"), true);
  assert.equal((await w.step()).prs, 1);
  assert.deepEqual([stateOf(w.db).state, stateOf(w.db).pr, w.log.pushed, w.log.opened, w.asked.length], ["pr-opened", 9, 1, 1, 1]);
});

test("findings go back to the model with the earlier patch; the second clean patch opens the PR; a second round with findings ends the attempt", async () => {
  const w = world();
  await w.step();
  const first = finishLint(w.db, `${FINDING}\n`);
  await w.step();
  assert.equal(w.asked.length, 2);
  assert.match(w.asked[1]!.previous!.findings[0]!, /redundant/);
  assert.match(w.asked[1]!.previous!.patch, /src\/lib\.rs/);
  assert.deepEqual([stateOf(w.db).state, stateOf(w.db).round], ["linting", 2]);
  assert.equal(w.log.opened, 0);
  const second = finishLint(w.db, CLEAN);
  assert.notEqual(first, second);
  await w.step();
  assert.deepEqual([stateOf(w.db).state, w.log.opened], ["pr-opened", 1]);

  const l = world();
  await l.step();
  finishLint(l.db, `${FINDING}\n`);
  await l.step();
  finishLint(l.db, `${FINDING}\n`);
  await l.step();
  assert.equal(stateOf(l.db).state, "fix-failed");
  assert.match(stateOf(l.db).reason!, /clippy findings remain after 2 rounds/);
  assert.equal(l.asked.length, 2);
});
