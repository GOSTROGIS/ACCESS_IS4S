// Scan tests (feature scan-tests): off by default and then invisible; on, a confirmed finding gets a build task for a test the
// model wrote, and the task's outcome marks the finding without deleting it or changing its severity.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { after, describe, test } from "node:test";
import { connect } from "../src/db.ts";
import { scopeToTracked } from "../src/repos.ts";
import { setFeature } from "../src/build/features.ts";
import { getTask } from "../src/build/tasks.ts";
import { autoFixConfirmed } from "../src/security/actions.ts";
import { runScan, type Ask, type ScanDeps } from "../src/security/scan.ts";
import { advanceScanTests, NOT_SHOWN_NOTE } from "../src/security/scantest.ts";
import { SCRATCH } from "./scratch.ts";

mkdirSync(SCRATCH, { recursive: true });
const dir = mkdtempSync(join(SCRATCH, "scan-tests-"));
const tree = join(dir, "tree");
mkdirSync(join(tree, "crates/psd/src"), { recursive: true });
writeFileSync(join(tree, "crates/psd/src/layer.rs"), Array.from({ length: 200 }, (_, i) => `// line ${i + 1}`).join("\n"));
const db = connect(join(dir, "dash.db"));
// A confidential build environment that has reported: private fixes and their builds can run.
db.prepare("INSERT INTO build_envs (id, label, kind, slots, key_hash, confidential, confidential_since, confidential_online_at, created_at) VALUES ('vault', 'vault', 'remote', 1, 'x', 1, '2020-01-01T00:00:00Z', '2020-01-01T00:00:00Z', '2020-01-01T00:00:00Z')").run();
after(() => { db.close(); rmSync(dir, { recursive: true, force: true }); });

for (const r of ["plain", "wired", "on"]) db.prepare("INSERT INTO repos (name, visibility, default_branch, open_prs, open_issues) VALUES (?, 'public', 'main', 0, 0)").run(r);
db.prepare("INSERT OR IGNORE INTO main.tracked_repos (name, added_by, added_at) VALUES ('plain', 'cli', 'x'), ('wired', 'cli', 'x'), ('on', 'cli', 'x')").run();
scopeToTracked(db);

const SHA = "a".repeat(40);
const LINES = [40, 80, 120, 160];
const TEST_FILE = "#[test]\nfn rejects_long_length() {\n    assert!(psd::read(&[255; 8]).is_err());\n}\n";

type Spy = { ids: string[]; tests: number; crates: number };
function deps(spy: Spy, withTests: boolean): ScanDeps {
  const ask = (async (id: string) => {
    spy.ids.push(id);
    if (id === "security.model") return { cost: 1, text: JSON.stringify({ summary: "x", entry_points: [], areas: [{ name: "PSD reader", paths: ["crates/psd/src"], entry_points: [], risk: 5, why: "parses files" }] }) };
    if (id === "security.area") return { cost: 1, text: JSON.stringify({ findings: LINES.map((line) => ({ title: `Finding at ${line}`, severity: "high", urgent: false, confidence: 0.9, category: `cat_${line}`, refs: [{ path: "crates/psd/src/layer.rs", line, claim: "shows it" }], reach: "open file", impact: "bad" })) }) };
    return { cost: 0.5, text: JSON.stringify({ verdict: "confirmed", score: 9, result: "Followed the path.", notes: "", proposed_test: "read a record with a long length" }) };
  }) as Ask;
  const base: ScanDeps = { ask, checkout: async () => ({ dir: tree, sha: SHA }), cancelled: () => false, log: () => {}, confirmed: undefined };
  if (!withTests) return base;
  return {
    ...base,
    writeTest: async () => { spy.tests++; return { text: TEST_FILE, cost: 0.4 }; },
    crates: async () => { spy.crates++; return { ok: true, rust: true, crates: [{ name: "psd", dir: "crates/psd" }] }; },
  };
}
const newScan = (repo: string): number => Number(db.prepare("INSERT INTO security_scans (repo, state, cap_usd, started_by, started_at) VALUES (?, 'modeling', NULL, 'boss', '2026-11-05T00:00:00Z')").run(repo).lastInsertRowid);
const findings = (repo: string) => db.prepare("SELECT number, title, severity, state, verification FROM security_findings WHERE repo = ? ORDER BY number").all(repo) as { number: number; title: string; severity: string; state: string; verification: string }[];
const testRow = (repo: string, n: number) => db.prepare("SELECT * FROM security_scan_tests WHERE repo = ? AND number = ?").get(repo, n) as { state: string; task_id: number; retried: number } | undefined;
const result = (step: string, exitCode: number | null, timedOut = false) => ({ step, exitCode, durationMs: 1, timedOut });

describe("scan tests", () => {
  test("with the switch off nothing is written, queued or asked, and the findings are the same as without the code", async () => {
    const plain: Spy = { ids: [], tests: 0, crates: 0 }, wired: Spy = { ids: [], tests: 0, crates: 0 };
    await runScan(db, newScan("plain"), deps(plain, false));
    await runScan(db, newScan("wired"), deps(wired, true));
    assert.deepEqual([wired.tests, wired.crates], [0, 0]);
    assert.ok(!wired.ids.includes("security.scantest"));
    assert.equal((db.prepare("SELECT COUNT(*) AS n FROM build_tasks").get() as { n: number }).n, 0);
    assert.equal((db.prepare("SELECT COUNT(*) AS n FROM security_scan_tests").get() as { n: number }).n, 0);
    assert.equal((db.prepare("SELECT COUNT(*) AS n FROM security_calls WHERE kind = 'test'").get() as { n: number }).n, 0);
    assert.deepEqual(wired.ids, plain.ids);
    const strip = (rows: ReturnType<typeof findings>) => rows.map(({ number: _n, ...r }) => r);
    assert.deepEqual(strip(findings("wired")), strip(findings("plain")));
    assert.deepEqual(advanceScanTests(db), []);
    assert.equal(await autoFixConfirmed(db, "wired"), 4, "every confirmed finding starts its fix as before");
    db.prepare("DELETE FROM jobs").run();
  });

  test("with the switch on, the test is queued before the fix and its outcome marks the finding", async () => {
    setFeature(db, "scan-tests", true, "boss");
    const spy: Spy = { ids: [], tests: 0, crates: 0 };
    const id = newScan("on");
    await runScan(db, id, { ...deps(spy, true), confirmed: (n) => autoFixConfirmed(db, "on", n) });
    assert.equal(spy.tests, 4);
    const rows = findings("on");
    assert.deepEqual(rows.map((r) => r.state), ["new", "new", "new", "new"], "no automatic fix starts while a test is building");
    assert.equal((db.prepare("SELECT COUNT(*) AS n FROM jobs WHERE step = 'security-fix'").get() as { n: number }).n, 0);
    const tasks = db.prepare("SELECT * FROM build_tasks ORDER BY id").all() as { step: string; patch: string; head_sha: string; priority: number; number: number | null }[];
    assert.equal(tasks.length, 4);
    for (const t of tasks) {
      assert.equal(t.step, "scan-test");
      assert.equal(t.head_sha, SHA);
      assert.equal(t.priority, -5);
      assert.equal(t.number, null);
      assert.match(t.patch, /^diff --git a\/crates\/psd\/tests\/autocraft_regression_[0-9a-f]{10}\.rs /);
    }
    const kinds = (db.prepare("SELECT kind FROM security_calls WHERE scan_id = ? AND finding_number = ?").all(id, rows[0]!.number) as { kind: string }[]).map((c) => c.kind);
    assert.deepEqual(kinds, ["verify", "test"]);
    const [a, b, c, d] = rows.map((r) => r.number) as [number, number, number, number];
    const plan = (n: number) => getTask(db, testRow("on", n)!.task_id)!.plan.map((s) => s.name);
    assert.deepEqual(plan(a), ["fetch deps", "build", "test"]);

    assert.deepEqual(advanceScanTests(db), [], "tasks still queued");
    const end = (n: number, state: string, results: unknown[]) => db.prepare("UPDATE build_tasks SET state = ?, results = ? WHERE id = ?").run(state, JSON.stringify(results), testRow("on", n)!.task_id);
    end(a, "failed", [result("fetch deps", 0), result("build", 0), result("test", 101)]);
    end(b, "done", [result("fetch deps", 0), result("build", 0), result("test", 0)]);
    end(c, "failed", [result("fetch deps", 0), result("build", 101)]);
    end(d, "lost", []);
    const ended = advanceScanTests(db);
    assert.deepEqual(ended.map((e) => e.state), ["confirmed", "not-shown", "could-not-build"]);
    assert.equal(testRow("on", a)!.state, "confirmed");
    assert.equal(testRow("on", b)!.state, "not-shown");
    assert.equal(testRow("on", c)!.state, "could-not-build");
    // An environment error queues the task once more; a second one ends it.
    const again = testRow("on", d)!;
    assert.equal(again.state, "building");
    assert.equal(again.retried, 1);
    end(d, "lost", []);
    assert.deepEqual(advanceScanTests(db).map((e) => e.state), ["could-not-build"]);

    // Findings are kept as they were; only the passing test leaves a note.
    const after = findings("on");
    assert.deepEqual(after.map((r) => [r.state, r.severity]), [["new", "high"], ["new", "high"], ["new", "high"], ["new", "high"]]);
    assert.equal((db.prepare("SELECT note FROM security_findings WHERE repo = 'on' AND number = ?").get(b) as { note: string }).note, NOT_SHOWN_NOTE);
    // The automatic fix skips the finding whose test passed and starts the others.
    assert.equal(await autoFixConfirmed(db, "on"), 3);
    const started = (db.prepare("SELECT json_extract(params, '$.number') AS n FROM jobs WHERE step = 'security-fix' ORDER BY n").all() as { n: number }[]).map((r) => r.n);
    assert.deepEqual(started, [a, c, d]);
  });

  test("a test that builds for over four hours is cancelled and read as could-not-build", () => {
    const n = findings("on")[0]!.number;
    db.prepare("INSERT OR REPLACE INTO security_scan_tests (repo, number, test_path, crate, test_patch, test_source, task_id, state, created_at) VALUES ('stuck', ?, 'p', 'psd', 'x', 'x', ?, 'building', ?)")
      .run(n, testRow("on", n)!.task_id, new Date(Date.now() - 5 * 3_600_000).toISOString());
    db.prepare("UPDATE build_tasks SET state = 'queued', results = '[]' WHERE id = ?").run(testRow("on", n)!.task_id);
    assert.deepEqual(advanceScanTests(db), [{ repo: "stuck", number: n, state: "could-not-build" }]);
    assert.equal(getTask(db, testRow("on", n)!.task_id)!.state, "cancelled");
  });
});
