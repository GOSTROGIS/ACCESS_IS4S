// Opening a database made before CI-first Verify and batches settles the `tests` verifications of repos with CI,
// cancels their tasks, raises stored batch sizes to the starting size, and does this once.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { after, test } from "node:test";
import { SCRATCH } from "./scratch.ts";

const { connect } = await import("../src/db.ts");
const { batchSizeOf } = await import("../src/merge/batch-store.ts");

mkdirSync(SCRATCH, { recursive: true });
const dir = mkdtempSync(join(SCRATCH, "ci-first-"));
after(() => rmSync(dir, { recursive: true, force: true }));

test("queued tests verifications become ci-enough where the repo has CI, and small batch sizes are raised", () => {
  const path = join(dir, "m.db");
  const db = connect(path);
  const at = "2026-01-01T00:00:00Z";
  const check = db.prepare("INSERT INTO pr_checks (repo, number, head_oid, state, is_draft, overall, checks, fetched_at) VALUES (?, 1, 'h', 'OPEN', 0, ?, '[]', ?)");
  check.run("withci", "success", at);
  check.run("noci", "none", at);
  const task = db.prepare("INSERT INTO build_tasks (step, repo, head_sha, requires, plan, state, queued_at) VALUES ('verify', ?, 'h', '{}', '[]', 'queued', ?)");
  const ver = db.prepare("INSERT INTO verifications (repo, number, head_sha, kind, reason, state, head_task_id, created_at) VALUES (?, ?, 'h', ?, 'r', ?, ?, ?)");
  const ids = new Map<string, number>();
  for (const repo of ["withci", "noci"]) ids.set(repo, Number(task.run(repo, at).lastInsertRowid));
  ver.run("withci", 1, "tests", "planned", ids.get("withci")!, at);
  ver.run("withci", 2, "regression", "planned", null, at);
  ver.run("noci", 1, "tests", "planned", ids.get("noci")!, at);
  db.prepare("INSERT INTO settings (key, value) VALUES ('batch_size:app', '3'), ('batch_size:big', '35')").run();
  db.prepare("DELETE FROM settings WHERE key = 'ci_first_done'").run();
  db.close();

  for (let i = 0; i < 2; i++) {
    const again = connect(path);
    const state = (repo: string, n: number) => (again.prepare("SELECT kind, state, head_task_id FROM verifications WHERE repo = ? AND number = ?").get(repo, n) as { kind: string; state: string; head_task_id: number | null });
    assert.deepEqual({ ...state("withci", 1) }, { kind: "ci-enough", state: "ci-enough", head_task_id: null });
    assert.equal(state("withci", 2).state, "planned");
    assert.equal(state("noci", 1).state, "planned");
    const taskState = (id: number) => (again.prepare("SELECT state FROM build_tasks WHERE id = ?").get(id) as { state: string }).state;
    assert.equal(taskState(ids.get("withci")!), "cancelled");
    assert.equal(taskState(ids.get("noci")!), "queued");
    // A size chosen after the migration (a failed batch halves it) stays.
    assert.deepEqual([batchSizeOf(again, "app"), batchSizeOf(again, "big"), batchSizeOf(again, "unset")], [i === 0 ? 20 : 4, 35, 20]);
    again.prepare("UPDATE settings SET value = '4' WHERE key = 'batch_size:app'").run();
    again.close();
  }
});
