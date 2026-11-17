// Step memory data: the finish API keeps peakMemBytes and oomKilled, drops junk, and the summary groups per repo and step.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { memorySummary, parseResults } from "../src/build/tasks.ts";
import { connect } from "../src/db.ts";
import { SCRATCH } from "./scratch.ts";

const R = { exitCode: 0, durationMs: 5, timedOut: false };

test("results keep valid memory fields and ignore invalid ones", () => {
  const [a, b, c] = parseResults([{ step: "build", ...R, peakMemBytes: 5.8e9, oomKilled: true }, { step: "test", ...R }, { step: "x", ...R, peakMemBytes: -1, oomKilled: "yes" }]);
  assert.deepEqual(a, { step: "build", ...R, peakMemBytes: 5.8e9, oomKilled: true });
  assert.deepEqual(b, { step: "test", ...R });
  assert.deepEqual(c, { step: "x", ...R });
});

test("memory summary: median, max and OOM count per repo and step; old results are skipped", () => {
  mkdirSync(SCRATCH, { recursive: true });
  const db = connect(join(mkdtempSync(join(SCRATCH, "build-mem-")), "m.db"));
  const add = (repo: string, results: unknown[]) =>
    db.prepare("INSERT INTO build_tasks (step, repo, head_sha, requires, plan, state, queued_at, ended_at, results) VALUES ('verify', ?, ?, '{}', '[]', 'done', ?, ?, ?)").run(repo, "a".repeat(40), new Date().toISOString(), new Date().toISOString(), JSON.stringify(results));
  add("app", [{ step: "build", ...R, peakMemBytes: 2e9 }, { step: "test", ...R }]);
  add("app", [{ step: "build", ...R, peakMemBytes: 6e9, oomKilled: true }]);
  add("app", [{ step: "build", ...R, peakMemBytes: 4e9 }]);
  assert.deepEqual(memorySummary(db, 30), [{ repo: "app", step: "build", steps: 3, medianBytes: 4e9, maxBytes: 6e9, oom: 1 }]);
});
