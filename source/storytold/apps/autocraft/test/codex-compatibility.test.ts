import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { dirname, join, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { connect, HISTORY_COPY_SQL, SERVING_METADATA_TABLES } from "../src/db.ts";
import { parseServingMetadata, publicServingMetadata, mergeServingMetadata } from "../src/agents/provenance.ts";
import { DEFAULT_MODEL_POLICY, setModelPolicy } from "../src/agents/codex/config.ts";
import { askClaude } from "../src/classify/run.ts";
import { startCodexRun } from "../src/agents/codex/capacity.ts";
import { CODEX_EXECUTION_READY, CODEX_UNAVAILABLE } from "../src/agents/codex/capabilities.ts";
import { Runner } from "../src/runner/runner.ts";
import type { StepDef } from "../src/runner/steps.ts";

const known = { schema: 1, provider: "codex", runs: [4], models: [{ model: "gpt-actual", reasoningEfforts: ["medium", null] }] };
test("reported serving metadata, legacy absence and explicit unknown remain distinguishable without leaked payloads", () => {
  assert.equal(parseServingMetadata(null), undefined);
  assert.deepEqual(parseServingMetadata(JSON.stringify(known)), known);
  for (const raw of ["{}", "null", "bad-json", JSON.stringify({ ...known, schema: 9 }), JSON.stringify({ ...known, accessToken: "must-not-echo" })]) {
    assert.deepEqual(parseServingMetadata(raw), { schema: 0, provider: "unknown", runs: [], models: [] });
  }
  const reported = parseServingMetadata(known)!;
  assert.deepEqual(publicServingMetadata(reported, false), { ...known, runs: [] });
  assert.deepEqual(publicServingMetadata(reported, true), known);
  assert.deepEqual(mergeServingMetadata(reported, parseServingMetadata({ ...known, runs: [7] }))?.runs, [4, 7]);
});

test("compatibility schema and history copy retain future serving bytes and preserve embedding model meaning", () => {
  const db = connect(":memory:");
  try {
    for (const table of SERVING_METADATA_TABLES) assert.ok(db.prepare("SELECT name FROM pragma_table_info(?)").all(table).some(column => column.name === "serving_metadata"), table);
    assert.ok(!db.prepare("SELECT name FROM pragma_table_info('owner_statements')").all().some(column => column.name === "serving_metadata"));
    assert.ok(db.prepare("SELECT name FROM pragma_table_info('security_findings')").all().some(column => column.name === "fix_serving_metadata"), "accepted patch attribution remains separate from finding discovery");
    const raw = JSON.stringify({ ...known, schema: 9 });
    db.prepare("INSERT INTO opus_reviews(repo,number,head_oid,run_id,at,model,mode,verdict,serving_metadata) VALUES ('photocraft',7,'head','fixture','2026-01-01','opus','full','hold',?)").run(raw);
    db.exec(HISTORY_COPY_SQL); db.exec(HISTORY_COPY_SQL);
    assert.equal(db.prepare("SELECT COUNT(*) n FROM opus_review_history").get()!.n, 1);
    assert.equal(db.prepare("SELECT serving_metadata FROM opus_review_history").get()!.serving_metadata, raw);
    assert.equal(db.prepare("SELECT model FROM final_reviews").get()!.model, "opus");
    assert.equal(db.prepare("SELECT serving_metadata FROM final_reviews").get()!.serving_metadata, raw);
  } finally { db.close(); }
});

test("reader-only edition refuses direct dispatch and preserves a queued Codex job before the actual atomic claim", async () => {
  assert.equal(CODEX_EXECUTION_READY, false);
  const db = connect(":memory:");
  const root = join(dirname(fileURLToPath(import.meta.url)), ".scratch");
  mkdirSync(root, { recursive: true });
  const logs = mkdtempSync(join(root, "codex-guard-"));
  const runner = new Runner({ db, dbFile: ":memory:", logs, log: () => {} });
  try {
    setModelPolicy(db, { ...DEFAULT_MODEL_POLICY, provider: "codex" }, "fixture");
    await assert.rejects(askClaude("classify.haiku", "haiku", [], db), new RegExp("not available"));
    await assert.rejects(startCodexRun(db, { promptId: "classify.haiku", promptVersion: "fixture", provider: "codex", model: "gpt-actual", items: [], prompt: "fixture" }), /not available/);
    const id = Number(db.prepare("INSERT INTO jobs(step,params,repo,state,requested_by,requested_at) VALUES ('fixture-model','{\"repo\":\"photocraft\"}','photocraft','queued','fixture','2026-01-01')").run().lastInsertRowid);
    const step: StepDef = { name: "fixture-model", title: "fixture", description: "Synthetic preclaim boundary fixture.", stage: 2, requires: "operator", params: [], models: ["opus"], run: async () => { throw Error("must not execute"); } };
    const steps = new Map([[step.name, step]]), before = db.prepare("SELECT * FROM jobs WHERE id=?").get(id);
    const start = Reflect.get(runner, "start") as (id: number, name: string, steps: Map<string, StepDef>) => boolean;
    assert.equal(start.call(runner, id, step.name, steps), false, CODEX_UNAVAILABLE);
    assert.deepEqual(db.prepare("SELECT * FROM jobs WHERE id=?").get(id), before);
    assert.equal(db.prepare("SELECT COUNT(*) n FROM agent_runs").get()!.n, 0);
    assert.equal(db.prepare("SELECT COUNT(*) n FROM model_waits").get()!.n, 0);
  } finally {
    await runner.stop(); db.close();
    assert.ok(realpathSync(logs).startsWith(realpathSync(root) + sep));
    rmSync(logs, { recursive: true, force: true });
  }
});
