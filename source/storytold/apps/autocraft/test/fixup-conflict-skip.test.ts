import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { connect } from "../src/db.ts";
import type { Querier } from "../src/mirror.ts";
import { setPushApproval } from "../src/fixup/approval.ts";
import { runFixup, type FixupDeps } from "../src/fixup/index.ts";
import { selectFixups } from "../src/fixup/select.ts";
import { SCRATCH } from "./scratch.ts";
import { validating } from "./gql.ts";

mkdirSync(SCRATCH, { recursive: true });
const dir = mkdtempSync(join(SCRATCH, "fixup-conflict-skip-"));
const T0 = "2026-01-01T00:00:00Z";
const FIXES = JSON.stringify([{ file: "src/lib.rs", change: "rename a to b" }]);

// Mirrored mergeable state is stale (UNKNOWN, no checks row) while GitHub reports the first three PRs as conflicting.
test("PRs found conflicting live go to the conflict merge and do not use up the fix-up limit", async () => {
  const db = connect(join(dir, "t.db"));
  db.prepare("INSERT INTO tracked_repos (name, added_by, added_at, pipeline) VALUES ('app', 'op', ?, 1)").run(T0);
  setPushApproval(db, "op", "app", true);
  const heads = new Map<number, string>();
  for (const n of [1, 2, 3, 4]) {
    const head = String(n).repeat(40);
    heads.set(n, head);
    db.prepare(`INSERT INTO items (repo, number, kind, state, title, author, additions, deletions, head_oid, head_ref, head_repo, base_ref, maintainer_can_modify, mergeable, created_at, updated_at)
      VALUES ('app', ?, 'pr', 'OPEN', 'Fix a thing', 'someone', 5, 0, ?, 'fix', 'contrib/app', 'main', 1, 'UNKNOWN', '${T0}', '${T0}')`).run(n, head);
    db.prepare(`INSERT INTO opus_reviews (repo, number, head_oid, run_id, at, model, verdict, reason, fixes, sure, mode) VALUES ('app', ?, ?, 'rv', '${T0}', 'm', 'take-fix', 'nearly right', ?, 1, 'full')`).run(n, head, FIXES);
  }
  const querier: Querier = validating({
    spent: 0, remaining: 5000,
    async query(_q: string, v: object) {
      const n = Number((v as { n?: number }).n);
      return { repository: { pullRequest: {
        id: `PR${n}`, number: n, state: "OPEN", isDraft: false, headRefOid: heads.get(n), headRefName: "fix", maintainerCanModify: false,
        mergeable: n === 4 ? "MERGEABLE" : "CONFLICTING", headRepository: { nameWithOwner: "contrib/app" }, assignees: { nodes: [] },
      } } };
    },
  });
  const deps = { querier, now: () => new Date(T0), root: join(dir, "cache"), exec: async () => ({ code: 0, stdout: JSON.stringify({ login: "pipeline-bot", id: 42, node_id: "U42" }), stderr: "" }) } as unknown as FixupDeps;
  const log: string[] = [];
  let handled = 0;
  await runFixup(db, { repo: "app", limit: 3, dryRun: false, onHandled: (n) => { handled = n; } }, (l) => log.push(l), deps);

  assert.equal(log.filter((l) => l.includes("conflicts with the base branch")).length, 3);
  assert.equal(handled, 1, "only the plain PR counts as handled");
  assert.ok(log.some((l) => l.includes("app#4")), "the PR behind the conflicted ones was reached");

  const sel = selectFixups(db, "app");
  assert.deepEqual(sel.conflictMerge.map((c) => c.number).sort(), [1, 2, 3]);
  assert.ok(sel.fix.every((c) => c.number === 4), "conflicted PRs are no fix-up candidates");
});
