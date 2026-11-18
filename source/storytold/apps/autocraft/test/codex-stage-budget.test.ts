import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { connect } from "../src/db.ts";
import { DEFAULT_MODEL_POLICY } from "../src/agents/codex/config.ts";
import { CodexBudgetError } from "../src/agents/codex/budget.ts";
import { startScanAs } from "../src/security/actions.ts";
import { runScan, type ScanDeps } from "../src/security/scan.ts";
import { scanRow, toScan } from "../src/security/store.ts";
import { sumReportedCosts } from "../src/security/costs.ts";
import { dailyReportedUsd } from "../src/discord/budget.ts";
import { runFix, type FixDeps } from "../src/security/fix.ts";
import { SCRATCH } from "./scratch.ts";
import { Search, DAILY_CAP_KEY } from "../src/discord/search.ts";
import { VectorIndex } from "../src/embed/vectors.ts";
import { toBlob } from "../src/embed/store.ts";
import type { Embedder } from "../src/embed/model.ts";
import { saveScanUsage, usageRunId } from "../src/security/real.ts";

function fixture() {
  const dir = mkdtempSync(join(SCRATCH, "codex-stage-budget-"));
  const db = connect(join(dir, "db.sqlite"));
  const tree = join(dir, "tree");
  mkdirSync(join(tree, "src"), { recursive: true });
  writeFileSync(join(tree, "src/a.rs"), "// synthetic fixture\n");
  const policy = (unknownCostPolicy: "require-priced" | "bounded-tokens") => db.prepare("INSERT OR REPLACE INTO settings(key,value) VALUES('model_provider_policy',?)")
    .run(JSON.stringify({ ...DEFAULT_MODEL_POLICY, provider: "codex", unknownCostPolicy }));
  const scan = () => Number(db.prepare("INSERT INTO security_scans(repo,state,started_by,started_at,budget_mode) VALUES('fixture','modeling','operator',?,'tokens')")
    .run(new Date().toISOString()).lastInsertRowid);
  const deps = (ask: ScanDeps["ask"]): ScanDeps => ({ ask, checkout: async () => ({ dir: tree, sha: "a".repeat(40) }), cancelled: () => false, log: () => {} });
  return { db, policy, scan, deps, close() { db.close(); rmSync(dir, { recursive: true, force: true }); } };
}
const model = JSON.stringify({ summary: "Synthetic application", entry_points: [], areas: [{ name: "Code", paths: ["src"], entry_points: [], risk: 2, why: "input" }] });

test("priced-policy refusal and explicit dollar caps stop Codex before any queue or model work", async () => {
  const f = fixture();
  try {
    f.policy("require-priced");
    await assert.rejects(startScanAs(f.db, "fixture", "operator", null), /requires dollar pricing/);
    f.policy("bounded-tokens");
    await assert.rejects(startScanAs(f.db, "fixture", "operator", 1), /does not report dollar prices/);
    assert.equal((f.db.prepare("SELECT COUNT(*) n FROM jobs").get() as { n: number }).n, 0);
    assert.equal((f.db.prepare("SELECT COUNT(*) n FROM security_scans").get() as { n: number }).n, 0);
  } finally { f.close(); }
});

test("bounded-token scans retain unpriced calls and historical mode without invented dollar estimates", async () => {
  const f = fixture();
  try {
    f.policy("bounded-tokens");
    const id = f.scan();
    let calls = 0;
    const result = await runScan(f.db, id, f.deps(async (prompt) => { calls++; return { cost: null, text: prompt === "security.model" ? model : '{"findings":[]}' }; }));
    assert.equal(calls, 2);
    assert.match(result, /USD unreported/);
    assert.equal(scanRow(f.db, id)!.state, "done");
    assert.equal(scanRow(f.db, id)!.estimate_usd, null);
    assert.deepEqual((f.db.prepare("SELECT cost_usd FROM security_calls WHERE scan_id=?").all(id) as { cost_usd: number | null }[]).map(row => row.cost_usd), [null, null]);
    f.db.prepare("DELETE FROM settings WHERE key='model_provider_policy'").run();
    const view = toScan(f.db, scanRow(f.db, id)!);
    assert.equal(view.budgetMode, "tokens");
    assert.equal(view.costUsd, null);
    assert.equal(view.estimateUsd, null);
  } finally { f.close(); }
});

test("a token stop preserves the pinned threat model and pending area, then resumes that work", async () => {
  const f = fixture();
  try {
    f.policy("bounded-tokens");
    const id = f.scan();
    await runScan(f.db, id, f.deps(async (prompt) => {
      if (prompt === "security.model") return { cost: null, text: model };
      throw new CodexBudgetError();
    }));
    const paused = scanRow(f.db, id)!;
    assert.equal(paused.state, "capped");
    assert.equal(paused.commit_sha, "a".repeat(40));
    assert.ok(paused.threat_model);
    assert.equal((f.db.prepare("SELECT state FROM security_areas WHERE scan_id=?").get(id) as { state: string }).state, "pending");
    // The operator's existing continue action selects this preserved engine state.
    f.db.prepare("UPDATE security_scans SET state='scanning',ended_at=NULL WHERE id=?").run(id);
    const calls: string[] = [];
    await runScan(f.db, id, f.deps(async (prompt) => { calls.push(prompt); return { cost: null, text: '{"findings":[]}' }; }));
    assert.deepEqual(calls, ["security.area"]);
    assert.equal(scanRow(f.db, id)!.state, "done");
    assert.equal(scanRow(f.db, id)!.threat_model, paused.threat_model);
  } finally { f.close(); }
});

test("unpriced USD totals are unknown, while a truly empty set and genuine zero retain zero", () => {
  assert.equal(sumReportedCosts([]), 0);
  assert.equal(sumReportedCosts([0, 0]), 0);
  assert.equal(sumReportedCosts([1, 2]), 3);
  assert.equal(sumReportedCosts([1, null, 2]), null);
});

test("resuming a scan phase appends exact observed model usage without overwriting partial or extra-model counters", () => {
  const f = fixture();
  try {
    const at = new Date().toISOString();
    saveScanUsage(f.db, 1, "security.area", { model: "reported-primary", input: 11, output: 3, cacheRead: 2, cacheWrite: 0, cost: null,
      extra: [{ model: "reported-worker", usage: { input: 7, output: 2, cacheRead: 0, cacheWrite: 0, cost: null } }] }, at, at);
    saveScanUsage(f.db, 1, "security.area", { model: "reported-primary", input: 5, output: 4, cacheRead: 1, cacheWrite: 0, cost: null }, at, at);
    const rows = f.db.prepare("SELECT model,input_tokens,output_tokens,cost_usd FROM token_usage WHERE run_id=? ORDER BY agent").all(usageRunId(1));
    assert.deepEqual(rows.map(r => ({ ...r })), [
      { model: "reported-primary", input_tokens: 11, output_tokens: 3, cost_usd: null },
      { model: "reported-worker", input_tokens: 7, output_tokens: 2, cost_usd: null },
      { model: "reported-primary", input_tokens: 5, output_tokens: 4, cost_usd: null },
    ]);
  } finally { f.close(); }
});

test("a provider-mode change between scan phases pauses before another model call without relabeling saved work", async () => {
  const f = fixture();
  try {
    f.policy("bounded-tokens");
    const id = f.scan();
    let calls = 0;
    await runScan(f.db, id, f.deps(async () => {
      calls++;
      f.db.prepare("DELETE FROM settings WHERE key='model_provider_policy'").run();
      return { cost: null, text: model };
    }));
    assert.equal(calls, 1);
    const paused = scanRow(f.db, id)!;
    assert.equal(paused.state, "capped");
    assert.equal(paused.budget_mode, "tokens");
    assert.ok(paused.threat_model);
    assert.match(paused.error!, /budget mode changed/);
    assert.equal(toScan(f.db, paused).costUsd, null);
  } finally { f.close(); }
});

test("real Discord search retains embedding results on pricing or token stops and only judges under the explicit bounded policy", async () => {
  const f = fixture();
  try {
    const now = Date.now();
    const embedder: Embedder = { id: "synthetic-budget", dim: 1, embed: async texts => texts.map(() => new Float32Array([1])) };
    f.db.prepare("INSERT OR IGNORE INTO tracked_repos(name) VALUES('fixture')").run();
    f.db.prepare("INSERT INTO repos(name,owner,visibility) VALUES('fixture','synthetic','public') ON CONFLICT(name) DO UPDATE SET visibility='public'").run();
    f.db.prepare("INSERT INTO items(repo,number,kind,state,title,body) VALUES('fixture',1,'issue','OPEN','Synthetic search fixture','Synthetic description')").run();
    f.db.prepare("INSERT INTO item_embeddings(repo,number,model,hash,vec,at) VALUES('fixture',1,?,'synthetic',?,?)").run(embedder.id, toBlob(new Float32Array([1])), new Date(now).toISOString());
    f.db.prepare("INSERT OR REPLACE INTO settings(key,value) VALUES(?, '0')").run(DAILY_CAP_KEY);
    let calls = 0, stop = false;
    const search = new Search({ db: f.db, embedder, index: new VectorIndex(embedder), log: () => {}, now: () => now,
      ask: async () => { calls++; if (stop) throw new CodexBudgetError(); return '{"picks":[{"ref":"fixture#1","reason":"Matches the synthetic issue"}]}'; } });
    f.policy("require-priced");
    const priced = await search.find("Synthetic search");
    assert.equal(calls, 0);
    assert.equal(priced.judged, false);
    assert.deepEqual(priced.matches.map(m => m.number), [1]);
    assert.match(priced.budgetError!, /requires dollar pricing/);
    f.policy("bounded-tokens");
    const bounded = await search.find("Synthetic search");
    assert.equal(calls, 1);
    assert.equal(bounded.judged, true);
    stop = true;
    const paused = await search.find("Synthetic search");
    assert.equal(calls, 2);
    assert.equal(paused.judged, false);
    assert.deepEqual(paused.matches.map(m => m.number), [1]);
    assert.match(paused.budgetError!, /partial work/);
  } finally { f.close(); }
});

test("a priced-policy stop preserves existing private fix rounds before any checkout or model call", async () => {
  const f = fixture();
  try {
    f.policy("require-priced");
    const id = f.scan(), at = new Date().toISOString();
    f.db.prepare("INSERT INTO security_findings(repo,number,scan_id,area,title,severity,state,refs,reach,impact,fingerprint,created_at,updated_at) VALUES('fixture',1,?,'Code','Synthetic finding','high','fixing','[]','local','synthetic','fixture',?,?)").run(id, at, at);
    f.db.prepare("INSERT INTO security_fix_rounds(repo,number,round,patch,test_patch,title,summary,head_task,base_task,session,created_at) VALUES('fixture',1,1,'retained patch','retained test','retained title','retained summary',1,2,'{}',?)").run(at);
    const before = f.db.prepare("SELECT * FROM security_fix_rounds").all();
    const untouched = () => { throw new Error("priced-policy refusal must happen before work"); };
    const deps: FixDeps = { exec: untouched, root: SCRATCH, checkout: untouched, ask: untouched, who: untouched, fetchCrates: untouched, cancelled: () => false, log: () => {} };
    const summary = await runFix(f.db, "fixture", 1, deps);
    assert.match(summary, /Model budget pause:.*requires dollar pricing/);
    assert.deepEqual(f.db.prepare("SELECT * FROM security_fix_rounds").all(), before);
    const row = f.db.prepare("SELECT state,last_failure FROM security_findings WHERE repo='fixture' AND number=1").get() as { state: string; last_failure: string };
    assert.equal(row.state, "new");
    assert.match(row.last_failure, /Model budget pause:/);
  } finally { f.close(); }
});

test("daily USD accounting never turns an unpriced Codex call into free spend or erases Jev prices", () => {
  const f = fixture();
  try {
    const insert = f.db.prepare("INSERT INTO agent_runs(step,stage,prompt_id,prompt_version,provider,model,items,item_count,state,started_at,cost_usd) VALUES('discord-signal',3,'fixture','1',?,?,'[]',0,'done',?,?)");
    const now = Date.now(), date = new Date(now).toISOString();
    assert.equal(dailyReportedUsd(f.db, "discord-signal", now), 0);
    insert.run("jev", "jev", date, 0.25);
    insert.run("unknown", "legacy-priced", date, 0.5);
    insert.run("codex", "gpt-6.2-sol", date, null);
    assert.equal(dailyReportedUsd(f.db, "discord-signal", now), null);
    assert.equal(dailyReportedUsd(f.db, "discord-signal", now, true), 0.75);
  } finally { f.close(); }
});
