import assert from "node:assert/strict";
import { test } from "node:test";
import { connect } from "../src/db.ts";
import { saveUsage } from "../src/classify/run.ts";
import { cost } from "../src/dash/api/insight.ts";
import { itemPage } from "../src/dash/api/item-page.ts";
import { finishRun, insertRun } from "../src/agents/runs.ts";
import type { Req } from "../src/dash/types.ts";

const req = (): Req => ({ method: "GET", path: "", params: { repo: "photocraft", n: "7" }, query: new URLSearchParams(),
  form: new URLSearchParams(), user: { login: "op", role: "operator", canRead: async () => true, canWrite: async () => true }, csrf: "", nonce: "" });

test("mixed priced and unpriced calls never become a complete dollar total in Cost or its chart", async () => {
  const db = connect(":memory:");
  const at = new Date().toISOString();
  try {
    saveUsage(db, "fixture", "priced", "review", "opus", 1, { input: 10, output: 3, cacheRead: 0, cacheWrite: 0, cost: 0.25 }, at, at);
    const priced = await cost(db, req());
    assert.equal(priced.total.usd, 0.25);
    saveUsage(db, "fixture", "unpriced", "review", "gpt-actual", 1, { provider: "codex", model: "gpt-actual", input: 20, output: 5, cacheRead: 4, cacheWrite: 0, cost: null }, at, at);
    const mixed = await cost(db, req());
    assert.equal(mixed.total.usd, null); assert.equal(mixed.series[0]!.usd, null);
    assert.equal(mixed.total.input, 30); assert.equal(mixed.total.output, 8); assert.equal(mixed.total.cacheRead, 4);
    assert.equal(mixed.stages.find(x => x.model === "opus")!.usd, 0.25);
    assert.equal(mixed.stages.find(x => x.model === "gpt-actual")!.usd, null);
  } finally { db.close(); }
});

test("an item's priced history plus an unpriced Codex run keeps total price unknown", async () => {
  const db = connect(":memory:");
  try {
    db.prepare("INSERT INTO items(repo,number,kind,state,title,created_at) VALUES ('photocraft',7,'pr','OPEN','fixture','2026-01-01T00:00:00Z')").run();
    const input = { jobId: null, step: "opus-review", stage: 5, promptId: "review.opus", promptVersion: "fixture", accountId: null,
      items: [{ repo: "photocraft", number: 7 }], prompt: "fixture" };
    finishRun(db, insertRun(db, { ...input, provider: "claude", model: "opus" }), { state: "done", costUsd: 0.5 });
    assert.equal((await itemPage(db, req()) as { costUsd: number | null }).costUsd, 0.5);
    finishRun(db, insertRun(db, { ...input, provider: "codex", model: "gpt-actual" }), { state: "done", costUsd: null });
    assert.equal((await itemPage(db, req()) as { costUsd: number | null }).costUsd, null);
  } finally { db.close(); }
});
