// Fake pipeline steps for the runner and API tests (AUTOCRAFT_EXTRA_STEPS).
// They call no model and touch nothing outside the test database.
import { setTimeout as sleep } from "node:timers/promises";
import type { StepDef } from "../src/runner/steps.ts";

export const FAKE_TOKEN = "ghp_" + "a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6q7R8";

export const steps: StepDef[] = [
  {
    name: "test-echo",
    title: "Echo",
    description: "Test step: records one fake model call and echoes its number.",
    stage: 2,
    requires: "operator",
    exclusive: "test-a",
    params: [
      { name: "n", label: "Number", kind: "int", min: 0, max: 100, default: 1 },
      { name: "mode", label: "Mode", kind: "enum", options: ["ok", "fail"], default: "ok" },
      { name: "repo", label: "Repo", kind: "repo" },
      { name: "run", label: "Run", kind: "run-id" },
    ],
    run: async (ctx) => {
      ctx.log(`token in the log: ${FAKE_TOKEN}`);
      if (ctx.params.mode === "fail") throw new Error("echo failed on purpose");
      ctx.usageRun("test-run");
      const t = new Date().toISOString();
      ctx.db.prepare(`INSERT INTO token_usage (run_id, agent, stage, model, items, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, started_at, ended_at, cost_usd)
        VALUES ('test-run', ?, 'test', 'fake', 1, 100, 10, 0, 0, ?, ?, 0.01)`).run(`echo-${ctx.job.id}`, t, t);
      return `echo ${ctx.params.n}`;
    },
  },
  {
    name: "test-sleep",
    title: "Sleep",
    description: "Test step: sleeps, reporting progress.",
    stage: 2,
    requires: "operator",
    exclusive: "test-a",
    params: [{ name: "ms", label: "Milliseconds", kind: "int", min: 0, max: 600000, default: 200 }],
    run: async (ctx) => {
      const ms = Number(ctx.params.ms);
      for (let t = 0; t < ms; t += 50) {
        ctx.progress(`slept ${t} ms`);
        await sleep(50);
      }
      return `slept ${ms} ms`;
    },
  },
  {
    name: "test-other",
    title: "Other group",
    description: "Test step in a second concurrency group.",
    stage: 4,
    requires: "operator",
    params: [{ name: "ms", label: "Milliseconds", kind: "int", min: 0, max: 600000, default: 200 }],
    run: async (ctx) => {
      await sleep(Number(ctx.params.ms));
      return "other done";
    },
  },
  {
    name: "test-repo",
    title: "Repo work",
    description: "Test step: sleeps for one repo.",
    stage: 6,
    requires: "operator",
    params: [{ name: "repo", label: "Repo", kind: "repo", required: true }, { name: "ms", label: "Milliseconds", kind: "int", min: 0, max: 600000, default: 300 }],
    run: async (ctx) => { await sleep(Number(ctx.params.ms)); return "repo done"; },
  },
  {
    name: "test-urgent",
    title: "Urgent repo work",
    description: "Test step in the security class.",
    stage: 6,
    requires: "operator",
    priority: 2,
    params: [{ name: "repo", label: "Repo", kind: "repo", required: true }, { name: "ms", label: "Milliseconds", kind: "int", min: 0, max: 600000, default: 300 }],
    run: async (ctx) => { await sleep(Number(ctx.params.ms)); return "urgent done"; },
  },
];
