// GitHub writes are paced per (identity, repo owner): over the minute budget a write waits for the window, a wait past the bound refuses the write without a row, and operator presses are exempt.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { SCRATCH } from "./scratch.ts";
import { connect } from "../src/db.ts";
import { closeItem, commentOn, PACE_PER_MINUTE, WritePacedError, type Writer } from "../src/github/write.ts";
import type { Grant } from "../src/core/guard.ts";
import type { Querier } from "../src/mirror.ts";

mkdirSync(SCRATCH, { recursive: true });

function setup(as: string, repoIdentity = "app", failing = false) {
  const db = connect(join(mkdtempSync(join(SCRATCH, "write-pacing-")), "t.db"));
  if (repoIdentity === "app") db.prepare("INSERT INTO main.settings (key, value) VALUES ('github_identity', 'app')").run();
  let t = Date.parse("2026-01-01T00:00:00Z");
  const sleeps: number[] = [];
  const w: Writer = { db, login: "t", mint: async () => "tok", appClient: () => q, now: () => t, sleep: async (ms) => { sleeps.push(ms); t += ms; } };
  const q = { query: async () => { if (failing) throw new Error("You have exceeded a secondary rate limit"); return { addComment: { commentEdge: { node: { url: "u" } } } }; } } as unknown as Querier;
  const g = { scope: "item", repo: "app1", number: 1, as } as unknown as Grant;
  const post = () => commentOn(w, g, q, "act-comment", { repo: "app1", number: 1, id: "x" }, { kind: "none" } as never, "hi");
  const closeIt = () => closeItem(w, g as never, q, { repo: "app1", number: 1, id: "x", pr: false });
  const rows = () => (db.prepare("SELECT COUNT(*) AS n FROM audit WHERE action IN ('act-comment', 'act-close')").get() as { n: number }).n;
  return { w, post, closeIt, rows, sleeps, advance: (ms: number) => { t += ms; } };
}

test("a write over the minute budget waits for the window and is recorded once", async () => {
  const s = setup("app");
  for (let i = 0; i < PACE_PER_MINUTE; i++) await s.post();
  s.advance(50_000);
  await s.post();
  assert.deepEqual(s.sleeps, [10_000]);
  assert.equal(s.rows(), PACE_PER_MINUTE + 1);
});

test("a write that would wait past the bound is refused and records nothing", async () => {
  const s = setup("app");
  for (let i = 0; i < PACE_PER_MINUTE; i++) await s.post(); // the window frees in 60 s, past the 15 s bound
  await assert.rejects(s.post(), WritePacedError);
  assert.equal(s.rows(), PACE_PER_MINUTE);
  assert.equal(s.sleeps.length, 0);
});

test("operator identities are not paced", async () => {
  const s = setup("user:alice");
  for (let i = 0; i < PACE_PER_MINUTE + 5; i++) await s.closeIt();
  assert.equal(s.sleeps.length, 0);
  assert.equal(s.rows(), PACE_PER_MINUTE + 5);
});

test("after a secondary-limit failure the key waits until 60 s after it", async () => {
  const s = setup("app", "app", true);
  await assert.rejects(s.post(), /secondary rate limit/);
  s.advance(50_000);
  await assert.rejects(s.post(), /secondary rate limit/); // waited 10 s, then wrote (and failed again)
  assert.deepEqual(s.sleeps, [10_000]);
  assert.equal(s.rows(), 2);
});
