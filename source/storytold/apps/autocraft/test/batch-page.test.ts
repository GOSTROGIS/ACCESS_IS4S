// The batch page: member states and the timeline come from the batch tables and the audit log; who acted is staff-only.
import assert from "node:assert/strict";
import { test } from "node:test";
import { batchDetail } from "../src/dash/api/batch-page.ts";
import { world } from "./world-db.ts";

const T = (m: number) => `2026-01-02T00:${String(m).padStart(2, "0")}:00Z`;

test("a removed PR shows as removed with its reason in the batch history, and the actor only to staff", () => {
  const db = world().repo(["comment"]).pr(1).pr(2).db;
  db.prepare("INSERT INTO merge_batches (id, repo, branch, state, base_sha, commit_sha, pr_number, summary, created_at, updated_at) VALUES (7, 'app', 'integration-app-1', 'superseded', 'basesha1', 'tip', 900, 'app#2 was removed by an operator', ?, ?)").run(T(0), T(9));
  const ins = db.prepare("INSERT INTO merge_batch_prs (batch_id, number, head_oid, position) VALUES (7, ?, ?, ?)");
  ins.run(1, "sha1", 0); ins.run(2, "sha2", 1);
  const audit = db.prepare("INSERT INTO audit (at, login, action, target, details) VALUES (?, ?, ?, ?, ?)");
  audit.run(T(2), "bot", "batch-pr", "app:integration-app-1", "{}");
  audit.run(T(8), "op", "batch-remove", "app#2", JSON.stringify({ batch: "integration-app-1" }));
  const staff = batchDetail(db, 7, true);
  assert.deepEqual(staff.members.map((m) => [m.number, m.state]), [[1, "in"], [2, "removed"]]);
  assert.equal(staff.members[1]!.reason, "removed by an operator");
  assert.deepEqual(staff.events.map((e) => e.kind), ["opened", "pr", "removed", "superseded"]);
  assert.equal(staff.events[2]!.by, "op");
  assert.equal(batchDetail(db, 7, false).events[2]!.by, null);
});
