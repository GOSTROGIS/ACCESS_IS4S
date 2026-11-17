import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { askJev, runJev, saveUsage, setRunner } from "../src/classify/run.ts";
import { connect } from "../src/db.ts";
import { SCRATCH } from "./scratch.ts";

const answers = {
  type: { choice: "performance", confidence: 0.8, probabilities: { performance: 0.8, bugfix: 0.2 } },
  security: { noul: 0.7 }, needs_decision: { noul: 0.1 },
};
const fresh = () => connect(join(mkdtempSync(join(SCRATCH, "jevcost-")), "t.db"));
const cost = (db: ReturnType<typeof fresh>, agent: string) =>
  (db.prepare("SELECT cost_usd AS c FROM token_usage WHERE agent = ?").get(agent) as { c: number | null }).c;

test("a Jev call is priced by its input tokens", async () => {
  const db = fresh();
  const restore = setRunner(async () => ({ code: 0, stderr: "", stdout: JSON.stringify({ answers, usage: { input_tokens: 1_000_000, output_tokens: 500 } }) }));
  try {
    const item = { repo: "a", number: 1, kind: "pr" as const, title: "t", body: "b", lines_changed: 1, files_changed: 1, author_association: null };
    await runJev(db, "run1", [item], 1);
  } finally { restore(); }
  assert.ok(Math.abs(cost(db, "jev-a#1")! - 0.042) < 1e-9);
});

test("the migration prices unpriced Jev rows and leaves other models alone", () => {
  const dir = mkdtempSync(join(SCRATCH, "jevcost-"));
  const path = join(dir, "t.db");
  const db = connect(path);
  const u = { input: 2_000_000, output: 5, cacheRead: 0, cacheWrite: 0, cost: null };
  saveUsage(db, "r", "jev-x", "classify", "jev-latest", 1, u, "s", "e");
  saveUsage(db, "r", "haiku-x", "classify", "haiku", 1, u, "s", "e");
  db.close();
  const again = connect(path);
  assert.ok(Math.abs(cost(again, "jev-x")! - 0.084) < 1e-9);
  assert.equal(cost(again, "haiku-x"), null);
});

test("priority and dupes Jev calls are saved under their own stage", async () => {
  const db = fresh();
  const restore = setRunner(async () => ({ code: 0, stderr: "", stdout: JSON.stringify({ answers: {}, usage: { input_tokens: 500_000, output_tokens: 3 } }) }));
  try {
    const item = { repo: "a", number: 1, kind: "pr" as const, title: "t", body: "b", lines_changed: 1, files_changed: 1, author_association: null };
    await askJev("priority.jev", item, db);
  } finally { restore(); }
  const row = db.prepare("SELECT stage, model, cost_usd AS c FROM token_usage").get() as { stage: string; model: string; c: number };
  assert.equal(row.stage, "priority");
  assert.equal(row.model, "jev-latest");
  assert.ok(Math.abs(row.c - 0.021) < 1e-9);
});
