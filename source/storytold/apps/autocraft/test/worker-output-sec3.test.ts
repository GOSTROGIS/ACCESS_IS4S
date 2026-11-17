// A build worker is untrusted: its formatter diff is folded into a pipeline commit only when the files git writes differ from the
// patched files by whitespace alone, and a security finding's private tasks go only to environments an operator marked confidential.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { exec, Git } from "../src/fixup/git.ts";
import { checkFormat, foldFormat } from "../src/prepush/index.ts";
import { connect } from "../src/db.ts";
import { claim, createTask, getTask, privateClockStart } from "../src/build/tasks.ts";
import { createEnv, hello, touch, updateEnv } from "../src/build/envs.ts";
import { computeChecks } from "../src/health-checks.ts";
import { runFix, type FixDeps } from "../src/security/fix.ts";
import { advanceSecurityFixes } from "../src/security/actions.ts";
import { rustPlan } from "../src/worker/rust.ts";

const HEAD = [
  "fn add(a: i32, b: i32) -> i32 { a + b }",
  "",
  "fn delete_account(user: &User, id: u32) -> Result<(), Error> {",
  "    if !user.is_admin() {",
  "        return Err(Error::Forbidden);",
  "    }",
  "",
  "    audit(user, id);",
  "    purge(id);",
  "    Ok(())",
  "}",
  "",
].join("\n");
const HDR = "diff --git a/src/lib.rs b/src/lib.rs\n--- a/src/lib.rs\n+++ b/src/lib.rs\n";
const PATCH = `${HDR}@@ -1,2 +1,2 @@\n-fn add(a: i32, b: i32) -> i32 { a + b }\n+fn add(a: i32, b: i32) -> i32 {  b + a }\n \n`;

test("a formatter diff folds in only when every file it writes is the patched file reformatted", async () => {
  const root = mkdtempSync(join(tmpdir(), "fold-"));
  try {
    const git = new Git(exec, root, "app");
    await git.init();
    const tree = await git.withFiles("4b825dc642cb6eb9a060e54bf8d69288fbee4904", [{ path: "src/lib.rs", mode: "100644", content: HEAD }], join(root, "index"));
    const head = (await git.must(["commit-tree", tree, "-m", "head"], { env: { GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@example.com", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@example.com" } })).trim();
    const fold = (fmt: string) => foldFormat(git, head, PATCH, fmt, join(root, "scratch"));

    const honest = await fold(`${HDR}@@ -1,3 +1,3 @@\n-fn add(a: i32, b: i32) -> i32 {  b + a }\n+fn add(a: i32, b: i32) -> i32 { b + a }\n \n fn delete_account(user: &User, id: u32) -> Result<(), Error> {\n`);
    assert.ok(honest.ok, honest.ok ? "" : honest.reason);
    assert.match(honest.patch, /^\+fn add\(a: i32, b: i32\) -> i32 \{ b \+ a \}$/m);

    // The admin check leaves one hunk and enters the next: the hunk bodies hold the same tokens, the file does not.
    const moved = `${HDR}@@ -3,5 +3,2 @@\n fn delete_account(user: &User, id: u32) -> Result<(), Error> {\n-    if !user.is_admin() {\n-        return Err(Error::Forbidden);\n-    }\n \n@@ -10,1 +7,4 @@\n+    if !user.is_admin() {\n+        return Err(Error::Forbidden);\n+    }\n     Ok(())\n`;
    assert.equal(checkFormat(PATCH, moved).ok, true);
    const r = await fold(moved);
    assert.deepEqual(r, { ok: false, reason: "the formatter changed more than whitespace in src/lib.rs" });

    // Lines git acts on outside a hunk: a section before the first header, a binary literal.
    assert.deepEqual(await fold(`--- a/src/lib.rs\n+++ b/src/lib.rs\n@@ -7,3 +7,3 @@\n \n-    audit(user, id);\n+    run(user, id);\n     purge(id);\n`), { ok: false, reason: "the formatter diff has text before its first file header" });
    const binary = await fold(`diff --git a/src/lib.rs b/src/lib.rs\nindex 1111111..2222222 100644\nGIT binary patch\nliteral 5\nMcmZ?b00001\n\nx\n`);
    assert.ok(!binary.ok && /a line outside a hunk in src\/lib\.rs: index/.test(binary.reason));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a security fix waits, with a warning, until a confidential environment has reported; that environment takes no PR code", async () => {
  const db = connect(":memory:");
  db.prepare("INSERT INTO repos (name, visibility) VALUES ('app', 'public')").run();
  db.prepare("INSERT INTO tracked_repos (name, pipeline) VALUES ('app', 1)").run();
  const caps = { os: "linux", arch: "x86_64", cpus: 8, memGb: 32, diskGb: 200, display: false, gpu: false, toolchains: ["rust-stable"] };
  for (const id of ["plain", "vault"]) {
    createEnv(db, { id, label: id, kind: "remote", slots: 4 }, "op");
    // What the worker says about itself never makes it confidential.
    hello(db, id, { version: "1", capabilities: { ...caps, confidential: true }, slots: 4 });
  }
  const t = { repo: "app", plan: rustPlan(), requires: { os: "linux" as const } };
  const fix = createTask(db, { ...t, step: "fix-check", headSha: "a".repeat(40), patch: "secret" });
  const pr = createTask(db, { ...t, step: "fixup", number: 7, headSha: "b".repeat(40) });
  const batch = createTask(db, { ...t, step: "merge-batch", headSha: "c".repeat(40) });
  assert.equal(getTask(db, fix)!.summary, "Waiting for a confidential build environment.");
  assert.deepEqual(claim(db, "vault", 4).tasks.map((x) => x.id), [pr, batch]);
  // The fix itself waits before its model call; the job ends at once.
  db.prepare(`INSERT INTO security_findings (repo, number, scan_id, area, title, severity, state, refs, reach, impact, fingerprint, created_at, updated_at)
    VALUES ('app', 1, 1, 'a', 't', 'high', 'fixing', '[]', 'r', 'i', 'f', '2026-01-01', '2026-01-01')`).run();
  assert.match(await runFix(db, "app", 1, { log: () => {} } as unknown as FixDeps), /waiting for a confidential build environment/);
  assert.equal((db.prepare("SELECT note FROM security_findings WHERE number = 1").get() as { note: string }).note, "Waiting for a confidential build environment.");
  const warn = () => computeChecks(db).find((c) => c.id === "confidential-env")!;
  assert.equal(warn().state, "warn");
  assert.equal(warn().text, "1 security fix and 1 security build task are waiting for a confidential build environment");
  // Flagged but not yet reported: still waiting. The build limit starts at its first call and an edit does not move it.
  updateEnv(db, "vault", { confidential: true }, "op");
  assert.equal(privateClockStart(db, "2026-01-01T00:00:00Z"), null);
  touch(db, "vault");
  const start = privateClockStart(db, "2026-01-01T00:00:00Z");
  updateEnv(db, "vault", { label: "renamed" }, "op");
  touch(db, "vault");
  assert.ok(start !== null && privateClockStart(db, "2026-01-01T00:00:00Z") === start);
  assert.equal(warn().state, "ok");
  assert.equal(await advanceSecurityFixes(db, false), 0, "a fix the pipeline started waits for the switch");
  db.prepare("UPDATE security_findings SET decided_by = 'boss'").run();
  assert.equal(await advanceSecurityFixes(db, false), 1);
  db.prepare("UPDATE build_tasks SET state = 'queued', env_id = NULL WHERE id IN (?, ?)").run(pr, batch);
  assert.equal(getTask(db, fix)!.summary, null);
  assert.deepEqual(claim(db, "plain", 4).tasks.map((x) => x.id), [pr, batch]);
  assert.deepEqual(claim(db, "vault", 4).tasks.map((x) => x.id), [fix]);
});
