import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { connect } from "../src/db.ts";
import { gates } from "../src/core/gates.ts";
import { execOf } from "../src/dash/api/decisions.ts";
import { getDecision } from "../src/decisions.ts";
import { SCRATCH } from "./scratch.ts";

mkdirSync(SCRATCH, { recursive: true });

test("an answered decision whose act a gate refuses shows the reason, with the repo link for operators only", () => {
  const db = connect(join(mkdtempSync(join(SCRATCH, "gate-hold-")), "t.db"));
  const f = { repo: "sandbox", pipelineOn: true, repoFacts: { commentApproved: false } } as never;
  const why = gates(f, { kind: "act", bucket: "scope" }, "pipeline");
  assert.equal(why, "Comments in sandbox are not approved");
  const items = [{ repo: "sandbox", number: 1, kind: "issue", action: "act", bucket: "scope", fast: false, rank: null, inFlight: false, next: false, blocked: why }];
  db.prepare("INSERT INTO lane_next (lane, total, items, at) VALUES ('act', 1, ?, 't')").run(JSON.stringify(items));
  db.prepare("INSERT INTO decisions (id, kind, repo, number, question, options, asked_at, answer, answered_by, answered_at, exec_state) VALUES ('sandbox#1:scope', 'scope', 'sandbox', 1, 'q', '[]', 't', 'close', 'op', 't', 'pending')").run();
  const d = getDecision(db, "sandbox#1:scope")!;
  const viewer = (operator: boolean) => ({ login: "x", role: operator ? "operator" : "viewer", operator, staff: operator });
  assert.deepEqual(execOf(db, d, "sandbox", viewer(true)), { state: "pending", reason: "Comments in sandbox are not approved", approvalsRepo: "sandbox" });
  assert.deepEqual(execOf(db, d, "sandbox", viewer(false)), { state: "pending", reason: "Comments in sandbox are not approved" });
});
