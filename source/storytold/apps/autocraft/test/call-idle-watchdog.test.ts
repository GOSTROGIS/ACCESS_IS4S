import { test } from "node:test";
import assert from "node:assert/strict";
import { callIdleMs, exec } from "../src/classify/run.ts";

// A fake CLI: one stream line, then silence (a shell that sleeps, with a child of its own).
const SILENT = `echo '{"type":"system"}'; sleep 30 & sleep 30; echo late`;

test("a call that goes silent is stopped and flagged", async () => {
  const t0 = Date.now();
  const r = await exec("sh", ["-c", SILENT], "", undefined, 60_000, undefined, undefined, false, { idleMs: 300 });
  assert.equal(r.idle, true);
  assert.ok(r.stdout.includes("system"));
  assert.ok(!r.stdout.includes("late"));
  assert.ok(Date.now() - t0 < 5000);
});

test("a call inside a long tool call is not stopped", async () => {
  let busy = true;
  // Silent for 1.2 s against a 0.8 s limit; busy until 1 s, so the earliest stop is near 1.8 s.
  setTimeout(() => { busy = false; }, 1000);
  const r = await exec("sh", ["-c", `sleep 1.2; echo '{"type":"result"}'`], "", undefined, 60_000, undefined, undefined, false, { idleMs: 800, busy: () => busy });
  assert.equal(r.idle, undefined);
  assert.equal(r.code, 0);
});

test("the idle limit comes from AUTOCRAFT_CALL_IDLE_MIN, default 15 min", () => {
  assert.equal(callIdleMs({}), 15 * 60_000);
  assert.equal(callIdleMs({ AUTOCRAFT_CALL_IDLE_MIN: "2" }), 120_000);
  assert.equal(callIdleMs({ AUTOCRAFT_CALL_IDLE_MIN: "x" }), 15 * 60_000);
});
