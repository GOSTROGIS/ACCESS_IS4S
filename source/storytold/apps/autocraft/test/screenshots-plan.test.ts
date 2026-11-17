import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";
import type { DatabaseSync } from "node:sqlite";
import { setFeature } from "../src/build/features.ts";
import { connect } from "../src/db.ts";
import { parseScreenshotReply } from "../src/verify/plan.ts";
import { putConfig, type ScreenshotConfigBody } from "../src/verify/screenshot-config.ts";
import { queueScreenshotTasks, screenshotTasks } from "../src/verify/tasks.ts";
import { runVerify, type VerifyDeps } from "../src/verify/index.ts";
import { SCRATCH } from "./scratch.ts";

mkdirSync(SCRATCH, { recursive: true });
const dir = mkdtempSync(join(SCRATCH, "shots-plan-"));
process.env.AUTOCRAFT_ARTIFACT_DIR = join(dir, "artifacts");
const T0 = "2026-01-01T00:00:00Z";
const HEAD = "a".repeat(40);
const BASE = "b".repeat(40);

const ARGS: ScreenshotConfigBody = {
  package: "app-ui", example: "snapshot", driver: "args", ui_paths: ["crates/ui*/**"],
  commands: {
    snap: { doc: "Render the main window.", params: { size: { enum: ["1440x900", "1024x768"] } }, argv: ["--out", "{out}", "--size", "{size}"], capture: true },
    open: { doc: "Open a page.", params: { n: { int: [1, 9] } }, argv: ["--page", "{n}"] },
  },
};
const JSONL: ScreenshotConfigBody = {
  package: "app-ui", example: "ui_shot", driver: "jsonl", ui_paths: ["crates/ui*/**"],
  commands: {
    open: { doc: "Open a page.", params: { n: { int: [1, 9] }, name: { chars: "A-Za-z0-9 ", min: 1, max: 20 } }, line: { open: "{name}", page: "{n}" } },
    shot: { doc: "Save an image.", params: {}, line: { shot: "{out}" }, capture: true },
  },
};
const reply = (o: unknown) => `Here: ${JSON.stringify([o])}`;
const ok = (steps: unknown) => reply({ ref: "app#7", screenshot: true, reason: "The dialog changes.", steps });

describe("parseScreenshotReply", () => {
  test("accepts a valid script and a no-screenshot answer; rejects each kind of bad script", () => {
    const good = parseScreenshotReply(ok([{ cmd: "open", args: { n: 2 } }, { cmd: "snap", args: { size: "1024x768" } }]), "app#7", ARGS);
    assert.ok(good.ok && good.plan.screenshot && good.plan.steps.length === 2);
    const none = parseScreenshotReply(reply({ ref: "app#7", screenshot: false, reason: "Backend only" }), "app#7", ARGS);
    assert.deepEqual(none, { ok: true, plan: { screenshot: false, reason: "Backend only" } });
    const bad = (steps: unknown, why: RegExp) => { const r = parseScreenshotReply(ok(steps), "app#7", ARGS); assert.ok(!r.ok && why.test(r.error), JSON.stringify(r)); };
    bad([{ cmd: "rm", args: {} }], /not one of the listed/);
    bad([{ cmd: "snap", args: { size: "1x1" } }], /must be one of/);
    bad([{ cmd: "snap", args: { size: "1440x900", extra: "x" } }], /unknown argument/);
    bad([{ cmd: "open", args: { n: "2" } }], /integer/);
    bad([{ cmd: "open", args: { n: 2 } }], /at least one capture/);
    bad(Array.from({ length: 9 }, () => ({ cmd: "snap", args: { size: "1440x900" } })), /1 to 8 steps/);
    bad(Array.from({ length: 4 }, () => ({ cmd: "snap", args: { size: "1440x900" } })), /at most 3 capture/);
    assert.ok(!parseScreenshotReply(ok([{ cmd: "snap", args: { size: "1440x900" } }]), "app#8", ARGS).ok);
  });
});

describe("screenshotTasks", () => {
  const c = { repo: "app", number: 7, head: HEAD, base: BASE };
  test("a head task and a base task with the same requires and warm, display on; the base task runs at the base for both commits", () => {
    const [h, b] = screenshotTasks([{ cmd: "open", args: { n: 2 } }, { cmd: "snap", args: { size: "1440x900" } }], ARGS, c);
    assert.deepEqual(h!.requires, { os: "linux", toolchains: ["rust-stable"], display: true });
    assert.deepEqual(b!.requires, h!.requires);
    assert.deepEqual(b!.warm, h!.warm);
    assert.deepEqual([h!.headSha, h!.baseSha, b!.headSha, b!.baseSha], [HEAD, BASE, BASE, BASE]);
    assert.deepEqual(h!.plan.map((s) => s.name), ["fetch deps", "build", "run 1", "render s2"]);
    assert.ok(h!.plan[1]!.cmd.includes("--example") && !h!.plan[1]!.cmd.includes("--all-targets"));
    assert.deepEqual(h!.plan[3]!.cmd.slice(-5), ["--", "--out", "/out/s2.png", "--size", "1440x900"]);
    assert.deepEqual(h!.plan[3]!.artifacts, ["s2.png"]);
    assert.equal(h!.plan[2]!.artifacts, undefined);
  });
  test("jsonl driver: one render step, the script only as $1, an integer param stays a number", () => {
    const [h] = screenshotTasks([{ cmd: "open", args: { n: 3, name: "My $(rm) doc" } }, { cmd: "shot", args: {} }], JSONL, c);
    const render = h!.plan.at(-1)!;
    assert.equal(render.cmd[0], "sh");
    assert.ok(!render.cmd[2]!.includes("rm"), "model text is not in the shell text");
    assert.equal(render.cmd[4], '{"open":"My $(rm) doc","page":3}\n{"shot":"/out/s2.png"}');
    assert.deepEqual(render.artifacts, ["s2.png"]);
  });
});

let planCalls = 0;
/** One open PR (#7) with a take review and green CI, touching a UI file. */
function fresh(): DatabaseSync {
  const db = connect(join(mkdtempSync(join(dir, "db-")), "t.db"));
  process.env.AUTOCRAFT_DIFF_CACHE = mkdtempSync(join(dir, "diffs-"));   // the diff cache is keyed by head, so each case has its own
  planCalls = 0;
  db.prepare(`INSERT INTO items (repo, number, kind, state, title, author, additions, deletions, head_oid, created_at, updated_at)
    VALUES ('app', 7, 'pr', 'OPEN', 'Show size', 'someone', 5, 0, ?, '${T0}', '${T0}')`).run(HEAD);
  db.prepare(`INSERT INTO opus_reviews (repo, number, head_oid, run_id, at, model, verdict, reason, fixes, sure, mode) VALUES ('app', 7, ?, 'rv', '${T0}', 'm', 'take', 'ok', '[]', 1, 'full')`).run(HEAD);
  db.prepare(`INSERT INTO pr_checks (repo, number, head_oid, state, is_draft, overall, checks, mergeable, maintainer_can_modify, fetched_at)
    VALUES ('app', 7, ?, 'OPEN', 0, 'success', '[]', 'MERGEABLE', 1, '${T0}')`).run(HEAD);
  db.prepare("INSERT INTO tracked_repos (name, added_by, added_at, pipeline) VALUES ('app', 'op', ?, 1)").run(T0);
  db.prepare("INSERT INTO repos (name, visibility) VALUES ('app', 'public')").run();
  putConfig(db, "op", "app", ARGS);
  return db;
}
const UI_DIFF = "diff --git a/crates/ui/src/dialog.rs b/crates/ui/src/dialog.rs\n--- a/crates/ui/src/dialog.rs\n+++ b/crates/ui/src/dialog.rs\n@@ -1,1 +1,2 @@\n fn a() {}\n+fn b() {}\n";
const deps = (diff: string): VerifyDeps => ({
  fetchDiff: async () => ({ ok: true, text: diff }), fetchCrates: async () => ({ ok: true, rust: true, crates: [] }),
  baseOf: async () => BASE, mainHead: async () => null, model: "sonnet",
  screenshots: { plan: async () => { planCalls++; return parseScreenshotReply(ok([{ cmd: "snap", args: { size: "1440x900" } }]), "app#7", ARGS); } },
});
const rows = (db: DatabaseSync, sql: string) => db.prepare(sql).all();

describe("runVerify with screenshots", () => {
  test("switch off (also global on, repo off): no task, no run row, no planner call, verification saved as today", async () => {
    const db = fresh();
    for (const on of [false, true]) {
      if (on) setFeature(db, "screenshots", true, "op");
      const s = await runVerify(db, { repo: "app" }, () => {}, deps(UI_DIFF));
      assert.equal(s.candidates, 1);
      assert.equal(rows(db, "SELECT 1 FROM build_tasks").length, 0);
      assert.equal(rows(db, "SELECT 1 FROM screenshot_runs").length, 0);
      assert.equal(planCalls, 0);
      assert.equal(rows(db, "SELECT 1 FROM stages WHERE stage LIKE 'screenshot%'").length, 0);
      db.prepare("DELETE FROM verifications").run();
    }
    assert.deepEqual(queueScreenshotTasks(db, [{ cmd: "snap", args: { size: "1440x900" } }], ARGS, { repo: "app", number: 7, head: HEAD, base: BASE }), []);
    const v = await runVerify(db, { repo: "app" }, () => {}, deps(UI_DIFF));
    assert.equal(v.kinds["ci-enough"], 1);
  });

  test("switch on: a UI diff queues the pair and records a planned run; a non-UI diff does not call the planner; the ci-enough row is unchanged", async () => {
    const db = fresh();
    setFeature(db, "screenshots", true, "op");
    setFeature(db, "screenshots", true, "op", "app");
    const other = "diff --git a/docs/readme.md b/docs/readme.md\n--- a/docs/readme.md\n+++ b/docs/readme.md\n@@ -1,1 +1,2 @@\n a\n+b\n";
    await runVerify(db, { repo: "app" }, () => {}, deps(other));
    assert.equal(planCalls, 0);
    assert.equal(rows(db, "SELECT 1 FROM screenshot_runs").length, 0);
    db.prepare("DELETE FROM verifications").run();
    process.env.AUTOCRAFT_DIFF_CACHE = mkdtempSync(join(dir, "diffs-"));
    await runVerify(db, { repo: "app" }, () => {}, deps(UI_DIFF));
    assert.equal(planCalls, 1);
    const run = db.prepare("SELECT state, head_task_id, base_task_id FROM screenshot_runs WHERE repo = 'app' AND number = 7 AND head_sha = ?").get(HEAD) as { state: string; head_task_id: number; base_task_id: number };
    assert.equal(run.state, "planned");
    assert.equal(rows(db, "SELECT 1 FROM build_tasks WHERE requires LIKE '%\"display\":true%'").length, 2);
    const v = db.prepare("SELECT kind, state FROM verifications WHERE repo = 'app' AND number = 7").all();
    assert.deepEqual(v.map((r) => ({ ...r })), [{ kind: "ci-enough", state: "ci-enough" }]);
    assert.equal(rows(db, "SELECT 1 FROM stages WHERE stage LIKE 'screenshot%'").length, 0);
  });
});
