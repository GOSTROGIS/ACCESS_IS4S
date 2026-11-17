import assert from "node:assert/strict";
import { test } from "node:test";
import { finishRun, getRun, insertRun, pruneRuns, RUN_KEEP_MS, runTools } from "../src/agents/runs.ts";
import { saveTools } from "../src/agents/tools.ts";
import { connect } from "../src/db.ts";

const start = (db: ReturnType<typeof connect>) => insertRun(db, { jobId: null, step: "fixup", stage: 1, promptId: "p", promptVersion: "1", provider: "claude", model: "m", accountId: null, items: [{ repo: "app", number: 1 }], prompt: "the prompt" });
const use = (id: string, name: string, input: unknown) => ({ type: "assistant", message: { content: [{ type: "tool_use", id, name, input }] } });
const result = (id: string, content: unknown, is_error = false) => ({ type: "user", message: { content: [{ type: "tool_result", tool_use_id: id, content, is_error }] } });

test("tool uses of a call are stored with result sizes, scrubbed arguments and the check row they ran", () => {
  const db = connect(":memory:");
  const run = start(db);
  const check = Number(db.prepare("INSERT INTO model_checks (run_id, step, repo, number, head, command, started_at) VALUES (?, 'fixup', 'app', 1, 'h', 'clippy', 't')").run(run).lastInsertRowid);
  saveTools(db, run, [
    use("a", "Read", { file_path: "/repo/x.rs" }), result("a", "héllo"),
    use("b", "mcp__build__check", { command: "fmt", patch: "p" }), result("b", [{ type: "text", text: "refused" }], true),
    use("c", "mcp__build__check", { command: "clippy", patch: "x".repeat(10_000) }), result("c", "0 findings"),
  ]);
  const tools = runTools(db, run);
  assert.deepEqual(tools.map((t) => [t.seq, t.tool, t.resultBytes, t.isError, t.check?.id ?? null]), [[1, "Read", 6, false, null], [2, "mcp__build__check", 7, true, null], [3, "mcp__build__check", 10, false, check]]);
  assert.ok(tools[2]!.args!.length <= 4000);
  assert.equal(tools[2]!.check?.command, "clippy");
});

test("texts past 14 days are kept compressed and read back; old plain rows still read", () => {
  const db = connect(":memory:");
  const run = start(db);
  finishRun(db, run, { state: "done", output: "the output", costUsd: 0.25 });
  const old = start(db);
  db.prepare("UPDATE agent_run_texts SET prompt = 'plain prompt' WHERE run_id = ?").run(old);
  const ago = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();
  db.prepare("UPDATE agent_runs SET started_at = ?").run(ago(20));
  pruneRuns(db);
  const d = getRun(db, run);
  assert.equal(d.prompt, "the prompt");
  assert.equal(d.output, "the output");
  assert.equal(d.costUsd, 0.25);
  assert.equal(getRun(db, old).prompt, "plain prompt");
  db.prepare("UPDATE agent_runs SET started_at = ?").run(ago(RUN_KEEP_MS / 86_400_000 + 1));
  pruneRuns(db);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM agent_run_texts").get()!.n, 0);
});

test("a check use that wrote no row does not take the row of a later use of the same command", () => {
  const db = connect(":memory:");
  const run = start(db);
  const check = Number(db.prepare("INSERT INTO model_checks (run_id, step, repo, number, head, command, started_at) VALUES (?, 'fixup', 'app', 1, 'h', 'fmt', 't')").run(run).lastInsertRowid);
  saveTools(db, run, [
    use("a", "mcp__build__check", { command: "fmt", patch: "p" }), result("a", "rustfmt: the patch changes no .rs file; nothing to format"),
    use("b", "mcp__build__check", { command: "fmt", patch: "q" }), result("b", "ok"),
  ]);
  assert.deepEqual(runTools(db, run).map((t) => t.check?.id ?? null), [null, check]);
});

test("viewers without text access get tools without arguments", () => {
  const db = connect(":memory:");
  const run = start(db);
  saveTools(db, run, [use("a", "Read", { file_path: "/repo/secret.rs" }), result("a", "x")]);
  const t = getRun(db, run, { texts: false }).tools;
  assert.deepEqual([t[0]!.tool, t[0]!.args, t[0]!.resultBytes], ["Read", null, 1]);
  assert.match(getRun(db, run).tools[0]!.args!, /secret/);
});
