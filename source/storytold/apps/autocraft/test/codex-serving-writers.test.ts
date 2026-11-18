// Synthetic reported receipts exercise the actual parse/result/persistence paths.
// These tests never enable a model or substitute for genuine runtime qualification.
import assert from "node:assert/strict";
import { test } from "node:test";
import { connect } from "../src/db.ts";
import { runModelStep, type ClaudeStep } from "../src/agents/step.ts";
import type { LintedReply } from "../src/classify/run.ts";
import { parseServingMetadata, serializeServingMetadata, type ServingMetadata } from "../src/agents/provenance.ts";
import { saveVerdict } from "../src/classify/run.ts";
import { saveOpus } from "../src/review/opus.ts";
import { savePremerge } from "../src/premerge/store.ts";
import { saveReview } from "../src/postmerge/review.ts";
import { saveVerification } from "../src/verify/index.ts";
import { recordCheck } from "../src/patchcheck/index.ts";
import { ask } from "../src/decisions.ts";
import { writeChoices, mergeChoices } from "../src/decide/choices.ts";
import { coreKey } from "../src/decide/choices-types.ts";
import { insertTurn, claimPending, storeReply } from "../src/conversations/store.ts";
import { acceptFix } from "../src/security/store.ts";
import { runScan, type Ask } from "../src/security/scan.ts";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { attemptOf, recordAttemptContribution, type FixIssueDeps } from "../src/fixissue/index.ts";
import { workflowServingLabel } from "../web/src/lib/serving.ts";
import { parseVerdicts } from "../src/mainfix/index.ts";
import { codexReplyUsage } from "../src/agents/codex/run.ts";
import { saveUsage } from "../src/classify/run.ts";
import type { CodexReply } from "../src/agents/codex/client.ts";
import { runDupeCompare, type CompareDeps } from "../src/dupes/compare.ts";
import type { ComparePrs, CompareIssues } from "../src/dupes/group.ts";
import { runFix, type FixDeps } from "../src/security/fix.ts";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";

const serving = (run: number, model = "gpt-actual"): ServingMetadata => ({ schema: 1, provider: "codex", runs: [run], models: [{ model, reasoningEfforts: ["high"] }] });
const answer = (text: string, receipt?: ServingMetadata): LintedReply => ({ text, serving: receipt, usage: { input: 8, output: 2, cacheRead: 0, cacheWrite: 0, cost: null } });

test("accepted batch values keep their exact call receipts and exclude invalid attempts", async () => {
  const db = connect(":memory:");
  try {
    const replies = [answer("invalid", serving(1)), answer("first", serving(2)), answer("second", serving(3, "gpt-other"))];
    const step: ClaudeStep<number, string[]> = { provider: "claude", id: "classify.haiku", attempts: 3, parse: (text, remaining) => text === "invalid" ? null : { value: [text], ...(remaining > 1 && { rest: remaining - 1 }) } };
    const result = await runModelStep(db, step, 2, { ask: async () => replies.shift()! });
    assert.ok(result.ok);
    assert.deepEqual(result.values, [["first"], ["second"]]);
    assert.deepEqual(result.servingValues, [serving(2), serving(3, "gpt-other")]);
    assert.deepEqual(result.serving?.runs, [2, 3]);
  } finally { db.close(); }
});

test("a retained fallback keeps its originating reply receipt rather than a later rejected attempt", async () => {
  const db = connect(":memory:");
  try {
    const replies = [answer("usable fallback", serving(7)), answer("later invalid", serving(8))];
    const step: ClaudeStep<number, string> = { provider: "claude", id: "classify.haiku", attempts: 2, parse: () => null, fallback: text => text === "usable fallback" ? text : null };
    const result = await runModelStep(db, step, 1, { ask: async () => replies.shift()! });
    assert.ok(result.ok);
    assert.equal(result.value, "usable fallback");
    assert.deepEqual(result.servingValues, [serving(7)]);
    assert.deepEqual(result.serving?.runs, [7]);
  } finally { db.close(); }
});

test("mixed legacy and reported accepted values never become a falsely complete single-provider attribution", async () => {
  const db = connect(":memory:");
  try {
    const replies = [answer("legacy"), answer("reported", serving(9))];
    const step: ClaudeStep<number, string> = { provider: "claude", id: "classify.haiku", attempts: 2, parse: (text, remaining) => ({ value: text, ...(remaining > 1 && { rest: remaining - 1 }) }) };
    const result = await runModelStep(db, step, 2, { ask: async () => replies.shift()! });
    assert.ok(result.ok);
    assert.deepEqual(result.servingValues, [undefined, serving(9)]);
    assert.equal(result.serving?.provider, "unknown");
    assert.equal(parseServingMetadata(null), undefined);
  } finally { db.close(); }
});

test("actual classification, review, verification and patch-check stores retain accepted receipts without changing logical keys or old history", () => {
  const db = connect(":memory:");
  try {
    const receipt = serving(31), raw = serializeServingMetadata(receipt);
    const item = { repo: "app", number: 1, head_oid: "head" };
    db.exec("INSERT INTO items(repo,number,kind,state) VALUES ('app',1,'pr','OPEN')");
    const verdict = { ref: "app#1", type_label: "bugfix", security: false, needs_decision: false, reason: "Accepted.", probs: null } as const;
    saveVerdict(db, "haiku", "fixture", verdict, receipt);
    saveOpus(db, "fixture", item, { mode: "full", base: null, model: "opus", servingMetadata: raw,
      review: { ref: "app#1", verdict: "take", sure: true, fixes: [], risks: [], reason: "Accepted.", summary: "Accepted.", why: null, public: null, conflicts: [], claims: [], blocked_by: [] } });
    savePremerge(db, { repo: "app", number: 1, head: "head", at: "2026-01-01", model: "opus", findings: [], servingMetadata: raw });
    saveReview(db, item, { sha: "head", runId: "fixture", model: "opus", findings: [], error: null, servingMetadata: raw });
    saveVerification(db, item, { kind: "ci-enough", reason: "Accepted.", plan: null, model: "haiku", headTask: null, baseTask: null, baseSha: null, state: "ci-enough", summary: "Accepted.", servingMetadata: raw });
    recordCheck(db, { kind: "fixup", repo: "app", number: 1, subject: "head", patch: "synthetic fixture diff", round: 1, model: "opus", check: { verdict: "approve", reasons: "Accepted.", problems: [] }, at: "2026-01-01", serving: receipt });
    for (const table of ["classifications", "opus_reviews", "opus_review_history", "premerge_reviews", "postmerge_reviews", "verifications", "patch_checks"]) {
      assert.deepEqual(parseServingMetadata(db.prepare(`SELECT serving_metadata FROM ${table}`).get()!.serving_metadata), receipt, table);
    }
    assert.equal(db.prepare("SELECT classifier FROM classifications").get()!.classifier, "haiku");
    assert.equal(db.prepare("SELECT model FROM opus_reviews").get()!.model, "opus");
    saveReview(db, item, { sha: "head", runId: "failed-fixture", model: "opus", findings: null, error: "retry: invalid later answer" });
    assert.equal(db.prepare("SELECT serving_metadata FROM postmerge_reviews").get()!.serving_metadata, raw);
    saveVerdict(db, "haiku", "fixture", { ...verdict, reason: "New legacy result." });
    assert.equal(db.prepare("SELECT serving_metadata FROM classifications").get()!.serving_metadata, null);
    assert.equal(db.prepare("SELECT serving_metadata FROM opus_review_history").get()!.serving_metadata, raw);
  } finally { db.close(); }
});

test("partial choices retain exact current contributors, complete replacement drops historical-only authors, and a legacy mix is unknown", () => {
  const db = connect(":memory:");
  try {
    db.exec("INSERT INTO items(repo,number,kind,state,title) VALUES ('app',1,'issue','OPEN','Synthetic choice fixture')");
    const id = "app#1:scope", take = coreKey.option("take"), close = coreKey.option("close");
    ask(db, [{ id, kind: "scope", repo: "app", number: 1, question: "Synthetic scope?", options: [{ key: "take", label: "Take" }, { key: "close", label: "Close" }] }]);
    const row = writeChoices(db, { decisionId: id, repo: "app", number: 1, turnId: null, stamp: "fixture", seen: { head: null, lastComment: null }, source: "prepare", drafts: { [take]: { extras: [] }, [close]: { extras: [{ id: "retained", kind: "comment", on: true, text: "Retained synthetic comment." }] } }, added: [], pick: { core: take, reason: "Synthetic initial choice." } }, { by: "opus", serving: serving(41) });
    const updated = mergeChoices(db, id, { turnId: null, stamp: "fixture", seen: row.seen, cores: { [take]: { extras: [] } }, pick: { core: take, reason: "Synthetic new pick." } }, { by: "opus", serving: serving(42) });
    assert.deepEqual(parseServingMetadata(db.prepare("SELECT serving_metadata FROM decision_choices WHERE id=?").get(updated.row.id)!.serving_metadata)?.runs, [41, 42]);
    const replaced = mergeChoices(db, id, { turnId: null, stamp: "fixture", seen: row.seen, cores: { [take]: { extras: [] }, [close]: { extras: [{ kind: "comment", on: true, text: "Current synthetic replacement comment." }] } }, pick: { core: take, reason: "Synthetic full replacement." } }, { by: "opus", serving: serving(43) });
    assert.deepEqual(parseServingMetadata(db.prepare("SELECT serving_metadata FROM decision_choices WHERE id=?").get(replaced.row.id)!.serving_metadata)?.runs, [43]);
    const legacy = mergeChoices(db, id, { turnId: null, stamp: "fixture", seen: row.seen, cores: { [take]: { extras: [] } }, pick: { core: take, reason: "Synthetic legacy update." } }, { by: "opus" });
    assert.equal(parseServingMetadata(db.prepare("SELECT serving_metadata FROM decision_choices WHERE id=?").get(legacy.row.id)!.serving_metadata)?.provider, "unknown");
    assert.deepEqual(parseServingMetadata(db.prepare("SELECT serving_metadata FROM decision_choices WHERE id=?").get(row.id)!.serving_metadata), serving(41));
  } finally { db.close(); }
});

test("the actual conversation receipt is atomic with its claimed reply and preserves original logical turn kinds", () => {
  const db = connect(":memory:");
  try {
    db.exec("INSERT INTO items(repo,number,kind,state,title) VALUES ('app',1,'issue','OPEN','Synthetic conversation fixture')");
    db.exec("INSERT INTO conversations(repo,number,item_block,item_sig,created_at,created_by) VALUES ('app',1,'synthetic','fixture','2026-01-01','operator')");
    const operator = insertTurn(db, "app", 1, { kind: "operator", login: "operator", body: "Synthetic question.", block: "synthetic", status: "pending" });
    const claim = claimPending(db, "app", 1)!;
    assert.equal(storeReply(db, "app", 1, "wrong-claim", "Rejected synthetic response.", [], [], undefined, undefined, undefined, serving(51)), null);
    const turn = storeReply(db, "app", 1, claim.claim, "Accepted synthetic response.", [], [], undefined, undefined, undefined, serving(52));
    const saved = db.prepare("SELECT kind,login,serving_metadata FROM conversation_turns WHERE id=?").get(turn!);
    assert.equal(saved!.kind, "opus"); assert.equal(saved!.login, "opus");
    assert.deepEqual(parseServingMetadata(saved!.serving_metadata), serving(52));
    assert.equal(db.prepare("SELECT serving_metadata FROM conversation_turns WHERE id=?").get(operator)!.serving_metadata, null);
    assert.equal(db.prepare("SELECT status FROM conversation_turns WHERE id=?").get(operator)!.status, "answered");
    assert.equal(db.prepare("SELECT COUNT(*) n FROM conversation_turns").get()!.n, 2);
  } finally { db.close(); }
});

test("the accepted security patch and its receipt move atomically before exact round history is cleared", () => {
  const db = connect(":memory:");
  try {
    const raw = serializeServingMetadata(serving(61));
    db.exec("INSERT INTO security_findings(repo,number,scan_id,area,title,severity,state,refs,reach,impact,fingerprint,created_at,updated_at) VALUES ('app',1,1,'fixture','Synthetic result','low','fixing','[]','fixture','fixture','fixture','now','now')");
    db.prepare("INSERT INTO security_fix_rounds(repo,number,round,patch,test_patch,title,summary,head_task,base_task,state,created_at,serving_metadata) VALUES ('app',1,1,'fixture patch','fixture test','Synthetic result','Synthetic result',1,2,'building','now',?)").run(raw);
    db.exec("CREATE TRIGGER assert_atomic_patch BEFORE UPDATE OF state ON security_findings WHEN NEW.state='ready' AND (NEW.fix_commit IS NULL OR NEW.fix_serving_metadata IS NULL) BEGIN SELECT RAISE(ABORT,'missing exact accepted patch receipt'); END");
    assert.throws(() => acceptFix(db, "app", 1, { fix_commit: "a".repeat(40) }), /missing exact/);
    assert.equal(db.prepare("SELECT COUNT(*) n FROM security_fix_rounds").get()!.n, 1);
    assert.equal(db.prepare("SELECT COUNT(*) n FROM security_fix_log").get()!.n, 0);
    assert.ok(acceptFix(db, "app", 1, { fix_commit: "a".repeat(40), fix_serving_metadata: raw }));
    const f = db.prepare("SELECT state,fix_commit,fix_serving_metadata,serving_metadata FROM security_findings").get()!;
    assert.equal(f.state, "ready"); assert.equal(f.fix_commit, "a".repeat(40));
    assert.equal(f.fix_serving_metadata, raw); assert.equal(f.serving_metadata, null, "patch does not overwrite discovery attribution");
    assert.equal(db.prepare("SELECT COUNT(*) n FROM security_fix_rounds").get()!.n, 0);
    assert.equal(db.prepare("SELECT serving_metadata FROM security_fix_log").get()!.serving_metadata, raw);
    db.prepare("INSERT INTO security_fix_rounds(repo,number,round,patch,test_patch,title,summary,head_task,base_task,state,created_at,serving_metadata) VALUES ('app',1,2,'other patch','other test','Other result','Other result',3,4,'building','now',?)").run(serializeServingMetadata(serving(62)));
    assert.equal(acceptFix(db, "app", 1, { fix_commit: "b".repeat(40), fix_serving_metadata: serializeServingMetadata(serving(62)) }), false);
    assert.equal(db.prepare("SELECT COUNT(*) n FROM security_fix_rounds").get()!.n, 1, "a concurrent state change does not clear an unaccepted patch");
    assert.equal(db.prepare("SELECT fix_serving_metadata FROM security_findings").get()!.fix_serving_metadata, raw);
  } finally { db.close(); }
});

for (const failAt of ["history insert", "round delete"] as const) test(`security acceptance rolls back a ${failAt} failure without disposing the session and retries completely`, () => {
  const db = connect(":memory:"), dir = mkdtempSync(join(tmpdir(), "autocraft-atomic-round-")), sessionDir = join(dir, "session");
  try {
    mkdirSync(sessionDir); writeFileSync(join(sessionDir, "retained.txt"), "Synthetic retained session.");
    const raw = serializeServingMetadata(serving(65));
    const session = JSON.stringify({ "": { id: "synthetic", account: "synthetic", checkout: dir, dir: sessionDir, at: "2026-01-01T00:00:00Z" } });
    db.exec("INSERT INTO security_findings(repo,number,scan_id,area,title,severity,state,refs,reach,impact,fingerprint,created_at,updated_at) VALUES ('app',1,1,'fixture','Synthetic result','low','fixing','[]','fixture','fixture','fixture','now','now')");
    db.prepare("INSERT INTO security_fix_rounds(repo,number,round,patch,test_patch,title,summary,head_task,base_task,state,created_at,serving_metadata,session) VALUES ('app',1,1,'fixture patch','fixture test','Synthetic result','Synthetic result',1,2,'building','now',?,?)").run(raw, session);
    const before = db.prepare("SELECT * FROM security_findings").get();
    const round = db.prepare("SELECT * FROM security_fix_rounds").get();
    db.exec(failAt === "history insert"
      ? "CREATE TRIGGER fail_archive BEFORE INSERT ON security_fix_log BEGIN SELECT RAISE(ABORT,'synthetic history insert failure'); END"
      : "CREATE TRIGGER fail_archive BEFORE DELETE ON security_fix_rounds BEGIN SELECT RAISE(ABORT,'synthetic round delete failure'); END");
    const fields = { fix_commit: "a".repeat(40), fix_serving_metadata: raw };
    assert.throws(() => acceptFix(db, "app", 1, fields), /synthetic/);
    assert.deepEqual(db.prepare("SELECT * FROM security_findings").get(), before);
    assert.deepEqual(db.prepare("SELECT * FROM security_fix_rounds").get(), round);
    assert.equal(db.prepare("SELECT COUNT(*) n FROM security_fix_log").get()!.n, 0);
    assert.ok(existsSync(join(sessionDir, "retained.txt")), "failed SQL must not dispose the genuine resumable-session directory");
    assert.equal(db.isTransaction, false);
    db.exec("DROP TRIGGER fail_archive");
    assert.ok(acceptFix(db, "app", 1, fields));
    assert.equal(db.prepare("SELECT state FROM security_findings").get()!.state, "ready");
    assert.equal(db.prepare("SELECT fix_serving_metadata FROM security_findings").get()!.fix_serving_metadata, raw);
    assert.equal(db.prepare("SELECT serving_metadata,state FROM security_fix_log").get()!.serving_metadata, raw);
    assert.equal(db.prepare("SELECT state FROM security_fix_log").get()!.state, "passed");
    assert.equal(db.prepare("SELECT COUNT(*) n FROM security_fix_rounds").get()!.n, 0);
    assert.equal(existsSync(sessionDir), false, "successful SQL may now dispose the no-longer-retained session directory");
  } finally { db.close(); rmSync(dir, { recursive: true, force: true }); }
});

test("a caller's outer rollback preserves the accepted round and session files until an actual commit", () => {
  const db = connect(":memory:"), dir = mkdtempSync(join(tmpdir(), "autocraft-nested-round-")), sessionDir = join(dir, "session");
  try {
    mkdirSync(sessionDir); writeFileSync(join(sessionDir, "retained.txt"), "Synthetic retained session.");
    const raw = serializeServingMetadata(serving(66));
    const session = JSON.stringify({ "": { id: "synthetic", account: "synthetic", checkout: dir, dir: sessionDir, at: "2026-01-01T00:00:00Z" } });
    db.exec("INSERT INTO security_findings(repo,number,scan_id,area,title,severity,state,refs,reach,impact,fingerprint,created_at,updated_at) VALUES ('app',1,1,'fixture','Synthetic result','low','fixing','[]','fixture','fixture','fixture','now','now')");
    db.prepare("INSERT INTO security_fix_rounds(repo,number,round,patch,test_patch,title,summary,head_task,base_task,state,created_at,serving_metadata,session) VALUES ('app',1,1,'fixture patch','fixture test','Synthetic result','Synthetic result',1,2,'building','now',?,?)").run(raw, session);
    const fields = { fix_commit: "a".repeat(40), fix_serving_metadata: raw };
    db.exec("BEGIN IMMEDIATE");
    assert.ok(acceptFix(db, "app", 1, fields));
    assert.ok(db.isTransaction); assert.ok(existsSync(sessionDir));
    db.exec("ROLLBACK");
    assert.equal(db.prepare("SELECT state FROM security_findings").get()!.state, "fixing");
    assert.equal(db.prepare("SELECT COUNT(*) n FROM security_fix_rounds").get()!.n, 1);
    assert.equal(db.prepare("SELECT COUNT(*) n FROM security_fix_log").get()!.n, 0);
    assert.ok(existsSync(join(sessionDir, "retained.txt")));
    assert.ok(acceptFix(db, "app", 1, fields));
    assert.equal(existsSync(sessionDir), false);
  } finally { db.close(); rmSync(dir, { recursive: true, force: true }); }
});

test("the actual runFix caller retains a resumable round on persistent archival failure and retries without altering queued work", async () => {
  const db = connect(":memory:"), dir = mkdtempSync(join(tmpdir(), "autocraft-finalize-caller-"));
  const work = join(dir, "work"), cache = join(dir, "cache"), sessionDir = join(dir, "session");
  const previousCache = process.env.AUTOCRAFT_DIFF_CACHE;
  process.env.AUTOCRAFT_DIFF_CACHE = join(dir, "diff-cache");
  try {
    mkdirSync(join(work, "crates/app/src"), { recursive: true }); mkdirSync(cache); mkdirSync(sessionDir);
    writeFileSync(join(sessionDir, "retained.txt"), "Synthetic retained session.");
    writeFileSync(join(work, "Cargo.toml"), '[workspace]\nmembers=["crates/app"]\n');
    writeFileSync(join(work, "crates/app/Cargo.toml"), '[package]\nname="app"\nversion="0.1.0"\n');
    writeFileSync(join(work, "crates/app/src/lib.rs"), "pub fn count() -> u8 {\n    1\n}\n");
    const git = (cwd: string, args: string[], env: Record<string, string> = {}, input?: string) => {
      assert.ok(!args.some(x => /^(?:fetch|push|ls-remote)$/.test(x)), "this fixture performs only local Git plumbing");
      const result = spawnSync("git", ["-c", "core.hooksPath=/dev/null", ...args], { cwd, encoding: "utf8", input, env: { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1", ...env } });
      if (result.error) throw result.error;
      return { code: result.status ?? 1, stdout: result.stdout, stderr: result.stderr };
    };
    const must = (cwd: string, ...args: string[]) => { const r = git(cwd, args); assert.equal(r.code, 0, r.stderr); return r.stdout.trim(); };
    must(work, "init", "-q", "-b", "main"); must(work, "add", "Cargo.toml", "crates/app/Cargo.toml", "crates/app/src/lib.rs");
    must(work, "-c", "user.name=fixture", "-c", "user.email=fixture@example.invalid", "commit", "-qm", "Synthetic fixture");
    const sha = must(work, "rev-parse", "HEAD"); must(dir, "clone", "--bare", "--no-hardlinks", work, join(cache, "fixture"));
    const name = `autocraft_regression_${createHash("sha256").update("fixture#1").digest("hex").slice(0, 10)}`;
    const path = `crates/app/tests/${name}.rs`;
    const testPatch = `diff --git a/${path} b/${path}\nnew file mode 100644\n--- /dev/null\n+++ b/${path}\n@@ -0,0 +1,4 @@\n+#[test]\n+fn updated_count() {\n+    assert_eq!(app::count(), 2);\n+}\n`;
    const patch = "diff --git a/crates/app/src/lib.rs b/crates/app/src/lib.rs\n--- a/crates/app/src/lib.rs\n+++ b/crates/app/src/lib.rs\n@@ -1,3 +1,3 @@\n pub fn count() -> u8 {\n-    1\n+    2\n }\n" + testPatch;
    const raw = serializeServingMetadata(serving(67));
    const session = JSON.stringify({ "": { id: "synthetic", account: "synthetic", checkout: work, dir: sessionDir, at: "2026-01-01T00:00:00Z" } });
    db.exec("INSERT INTO repos(name,default_branch) VALUES ('fixture','main'); INSERT INTO jobs(step,params,requested_by,requested_at,state) VALUES ('rank','{}','fixture','now','queued')");
    db.prepare("INSERT INTO security_scans(repo,state,started_by,started_at,commit_sha) VALUES ('fixture','done','fixture','now',?)").run(sha);
    db.exec("INSERT INTO security_findings(repo,number,scan_id,area,title,severity,state,refs,reach,impact,fingerprint,created_at,updated_at) VALUES ('fixture',1,1,'fixture','Synthetic result','low','fixing','[{\"path\":\"crates/app/src/lib.rs\",\"line\":1,\"claim\":\"Synthetic fixture.\"}]','fixture','fixture','fixture','now','now')");
    for (const id of [1, 2]) db.prepare("INSERT INTO build_tasks(id,step,repo,head_sha,requires,plan,state,queued_at,results) VALUES (?,'fix-check','fixture',?,'{}',?,?, 'now',?)").run(id, sha, JSON.stringify([{ name: "test", cmd: ["synthetic-finished-build-fixture"] }]), id === 1 ? "done" : "failed", JSON.stringify([{ step: "test", exitCode: id === 1 ? 0 : 1, timedOut: false }]));
    db.prepare("INSERT INTO security_fix_rounds(repo,number,round,patch,test_patch,title,summary,head_task,base_task,state,created_at,serving_metadata,session) VALUES ('fixture',1,1,?,?,'Return the updated count','The function returns two and its test checks that value.',1,2,'building','now',?,?)").run(patch, testPatch, raw, session);
    const jobs = db.prepare("SELECT * FROM jobs").all(), tasks = db.prepare("SELECT * FROM build_tasks").all();
    const deps: FixDeps = { root: cache, exec: async (cmd, args, options = {}) => { assert.equal(cmd, "git"); return git(options.cwd!, args, options.env, options.input); }, fetchCrates: async () => ({ ok: true, rust: true, crates: [{ name: "app", dir: "crates/app" }] }), checkout: async () => work, who: async () => ({ login: "fixture", email: "fixture@example.invalid" }), cancelled: () => false, log: () => {}, ask: async id => { assert.equal(id, "security.fixcheck", "retry uses the accepted patch, never generates a replacement"); return { text: '{"verdict":"approve","reasons":"Synthetic fixture accepted.","problems":[]}', cost: null }; } };
    db.exec("CREATE TRIGGER fail_caller_archive BEFORE INSERT ON security_fix_log BEGIN SELECT RAISE(ABORT,'persistent synthetic history failure'); END");
    await assert.rejects(runFix(db, "fixture", 1, deps), /persistent synthetic history failure/);
    assert.equal(db.prepare("SELECT state,fix_commit FROM security_findings").get()!.state, "fixing");
    assert.equal(db.prepare("SELECT fix_commit FROM security_findings").get()!.fix_commit, null);
    assert.equal(db.prepare("SELECT session FROM security_fix_rounds").get()!.session, session);
    assert.ok(existsSync(join(sessionDir, "retained.txt")));
    assert.deepEqual(db.prepare("SELECT * FROM jobs").all(), jobs); assert.deepEqual(db.prepare("SELECT * FROM build_tasks").all(), tasks);
    assert.equal(db.prepare("SELECT COUNT(*) n FROM security_fix_log").get()!.n, 0);
    db.exec("DROP TRIGGER fail_caller_archive");
    assert.match(await runFix(db, "fixture", 1, deps), /fix ready/);
    assert.equal(db.prepare("SELECT state FROM security_findings").get()!.state, "ready");
    assert.equal(db.prepare("SELECT fix_serving_metadata FROM security_findings").get()!.fix_serving_metadata, raw);
    assert.equal(db.prepare("SELECT serving_metadata FROM security_fix_log").get()!.serving_metadata, raw);
    assert.equal(db.prepare("SELECT COUNT(*) n FROM security_fix_rounds").get()!.n, 0); assert.equal(existsSync(sessionDir), false);
    assert.deepEqual(db.prepare("SELECT * FROM jobs").all(), jobs); assert.deepEqual(db.prepare("SELECT * FROM build_tasks").all(), tasks);
  } finally {
    if (previousCache === undefined) delete process.env.AUTOCRAFT_DIFF_CACHE; else process.env.AUTOCRAFT_DIFF_CACHE = previousCache;
    db.close(); rmSync(dir, { recursive: true, force: true });
  }
});

test("scan discovery and verification retain accepted contributors while rejecting invalid calls", async () => {
  const db = connect(":memory:"), dir = mkdtempSync(join(tmpdir(), "autocraft-serving-scan-"));
  try {
    writeFileSync(join(dir, "fixture.txt"), "Synthetic fixture.\n");
    db.exec("INSERT INTO security_scans(repo,state,started_by,started_at) VALUES ('app','modeling','fixture','now')");
    let attempts = 0;
    const ask: Ask = (async (id: string) => {
      if (id === "security.model") return { text: JSON.stringify({ summary: "Synthetic fixture.", entry_points: [], areas: [{ name: "fixture", paths: ["fixture.txt"], entry_points: [], risk: 1, why: "Synthetic result path." }] }), cost: null, serving: serving(71) };
      if (id === "security.area") return { text: JSON.stringify({ findings: [{ title: "Synthetic finding", severity: "low", confidence: 1, refs: [{ path: "fixture.txt", line: 1, claim: "Synthetic fixture." }], reach: "Synthetic reach.", impact: "Synthetic impact." }] }), cost: null, serving: serving(72) };
      if (++attempts === 1) return { text: "invalid", cost: null, serving: serving(73) };
      return { text: JSON.stringify({ verdict: "disproved", score: 1, result: "Synthetic fixture has no defect." }), cost: null, serving: serving(74) };
    }) as Ask;
    await runScan(db, 1, { ask, checkout: async () => ({ dir, sha: "a".repeat(40) }), cancelled: () => false, log: () => {} });
    const f = db.prepare("SELECT state,serving_metadata FROM security_findings").get()!;
    assert.equal(f.state, "disproved");
    assert.deepEqual(parseServingMetadata(f.serving_metadata)?.runs, [71, 72, 74]);
    assert.equal(db.prepare("SELECT COUNT(*) n FROM security_calls WHERE ok=0").get()!.n, 1);
  } finally { db.close(); rmSync(dir, { recursive: true, force: true }); }
});

test("attempt receipts describe accepted workflow contributors through replacement and review, while legacy mixes and fresh attempts stay honest", () => {
  const db = connect(":memory:");
  try {
    const d = { now: () => new Date("2026-01-01T00:00:00Z") } as FixIssueDeps;
    const reset = (receipt: ServingMetadata | undefined) => db.prepare("INSERT OR REPLACE INTO fix_attempts(repo,number,main_sha,text_hash,state,round,reason,created_at,updated_at,serving_metadata) VALUES ('app',1,'head','text','retry',0,'Synthetic triage.','now','now',?)").run(serializeServingMetadata(receipt));
    reset(serving(81, "gpt-triage"));
    const r = attemptOf(db, "app", 1)!;
    recordAttemptContribution(db, d, r, serving(82, "gpt-patch"), { patch: "first accepted synthetic patch", round: 1 });
    recordAttemptContribution(db, d, r, serving(83, "gpt-replacement"), { patch: "complete synthetic replacement", round: 2 });
    recordAttemptContribution(db, d, r, serving(84, "gpt-review"));
    const workflow = parseServingMetadata(attemptOf(db, "app", 1)!.serving_metadata)!;
    assert.deepEqual(workflow.runs, [81, 82, 83, 84]);
    assert.equal(attemptOf(db, "app", 1)!.patch, "complete synthetic replacement");
    const label = workflowServingLabel(workflow);
    assert.match(label, /^Workflow contributors:/);
    assert.match(label, /does not identify a sole patch author/);
    recordAttemptContribution(db, d, r, undefined, { summary: "Accepted legacy summary." });
    const mixed = parseServingMetadata(attemptOf(db, "app", 1)!.serving_metadata)!;
    assert.equal(mixed.provider, "unknown"); assert.match(workflowServingLabel(mixed), /Model unknown/);
    reset(serving(85, "gpt-new-attempt"));
    assert.deepEqual(parseServingMetadata(attemptOf(db, "app", 1)!.serving_metadata)?.runs, [85]);
    assert.equal(attemptOf(db, "app", 1)!.patch, null, "a reset does not carry a historical patch or its contributors");
    const sorted = parseVerdicts(JSON.stringify({ checks: [{ check: "test", verdict: "code", reason: "Synthetic result." }] }), ["test", "missing"], serving(86))!;
    assert.deepEqual(sorted[0]!.serving, serving(86));
    assert.equal(sorted[1]!.serving?.provider, "unknown", "a deterministic fallback is not falsely a complete model result");
  } finally { db.close(); }
});

test("a partial call with only actual child usage never fabricates a zero-token parent row", () => {
  const db = connect(":memory:");
  try {
    const zero = { inputTokens: 0, cachedInputTokens: 0, cacheWriteInputTokens: 0, outputTokens: 0, reasoningOutputTokens: 0, totalTokens: 0 };
    const child = { ...zero, inputTokens: 12, cachedInputTokens: 3, outputTokens: 4, totalTokens: 16 };
    const reply: CodexReply = { text: "", model: "unreported-parent", modelProvider: "openai", reasoningEffort: null, threadId: "fixture", turnId: "fixture", usage: zero, responses: 1, items: [], hasReportedUsage: true, primaryHasReportedUsage: false, extra: [{ model: "actual-child", usage: child }] };
    saveUsage(db, "fixture", "fixture", "fixture", "opus", 0, codexReplyUsage(reply), "now", "now");
    const rows = db.prepare("SELECT model,input_tokens,cache_read_tokens,output_tokens,cost_usd FROM token_usage").all();
    assert.equal(rows.length, 1); assert.equal(rows[0]!.model, "actual-child");
    assert.equal(rows[0]!.input_tokens, 9); assert.equal(rows[0]!.cache_read_tokens, 3); assert.equal(rows[0]!.output_tokens, 4);
    assert.equal(rows[0]!.cost_usd, null);
    assert.throws(() => codexReplyUsage({ ...reply, extra: [] }), /No reported/);
  } finally { db.close(); }
});

test("actual multi-round duplicate comparison persists only accepted call receipts with its original logical model key", async () => {
  const db = connect(":memory:");
  try {
    db.exec("INSERT INTO tracked_repos(name,added_by,added_at,pipeline) VALUES ('app','fixture','now',1)");
    const item = db.prepare("INSERT INTO items(repo,number,kind,state,title,body,embed_hash) VALUES ('app',?,'issue','OPEN','Synthetic comparison','Synthetic fixture.','fixture')");
    const edge = db.prepare("INSERT INTO duplicate_pairs(repo,a,b,a_hash,b_hash,similarity,verdict,created_at) VALUES ('app',1,?,'fixture','fixture',1,'duplicate','now')");
    for (let n = 1; n <= 11; n++) { item.run(n); if (n > 1) edge.run(n); }
    let calls = 0;
    const deps: CompareDeps = {
      now: () => new Date("2026-01-01T00:00:00Z"), fetchDiff: async () => { throw Error("issue comparison does not read diffs"); },
      ask: (async (_id: string, _model: string, input: ComparePrs | CompareIssues) => {
        if (!("issues" in input)) throw Error("this fixture compares only synthetic issues");
        const receipt = serving(90 + calls++);
        if (calls === 1) return answer("invalid", receipt);
        const numbers = input.issues.map(x => Number(x.ref.slice(1)));
        return answer(JSON.stringify({ keep: numbers[0], reason: "Synthetic comparison.", summary: "Synthetic comparison.", why: "Synthetic comparison.", others: numbers.slice(1).map(number => ({ number, adds: [] })) }), receipt);
      }) as CompareDeps["ask"],
    };
    const result = await runDupeCompare(db, { repo: "app" }, () => {}, deps);
    assert.equal(result.compared, 1);
    const saved = db.prepare("SELECT model,result,serving_metadata FROM dupe_comparisons").get()!;
    assert.equal(saved.model, "sonnet"); assert.equal(JSON.parse(saved.result as string).rounds, 2);
    assert.deepEqual(parseServingMetadata(saved.serving_metadata)?.runs, [91, 92, 93]);
    assert.equal(db.prepare("SELECT COUNT(*) n FROM agent_runs").get()!.n, 0);
  } finally { db.close(); }
});
