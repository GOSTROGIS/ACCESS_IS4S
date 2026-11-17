// Issues closed by the Act step carry GitHub's close reason: a duplicate group member is closed as DUPLICATE of the
// kept issue; a scope close is NOT_PLANNED. A rejected DUPLICATE is retried as NOT_PLANNED.
import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { runAct } from "../src/act/index.ts";
import { ask } from "../src/decisions.ts";
import { applyDuplicateAnswers } from "../src/dupes/decide.ts";
import { T1, world, type World } from "./world-db.ts";

let current: World | null = null;
afterEach(() => current?.close());

const closes = (w: World, fail?: (v: Record<string, unknown>) => boolean) => {
  const sent: Record<string, unknown>[] = [];
  const base = w.gh.actDeps();
  return { sent, deps: { ...base, querier: { ...base.querier, query: async (q: string, v: object) => {
    if (q.includes("closeIssue")) { sent.push(v as Record<string, unknown>); if (fail?.(v as Record<string, unknown>)) throw new Error("Variable $reason: argument validation failed"); }
    const r = await base.querier.query(q, v) as { repository?: { issueOrPullRequest?: Record<string, unknown> } };
    // The fake reports every item it tracks as a PR; these are issues.
    const x = r.repository?.issueOrPullRequest;
    if (x) { x.__typename = "Issue"; delete x.headRefOid; }
    return r;
  } } } };
};
const dupGroup = (w: World) => {
  ask(w.db, [{ id: "app:dupegroup:7", kind: "duplicate", repo: "app", number: 7, question: "Keep #7 and close #8?", options: [{ key: "accept", label: "Use this answer" }, { key: "distinct", label: "Not duplicates" }] }]);
  w.db.prepare("INSERT INTO dupe_groups (decision_id, repo, source) VALUES ('app:dupegroup:7', 'app', 'model')").run();
  for (const [n, role, target] of [[7, "keep", null], [8, "close", 7]] as const)
    w.db.prepare("INSERT INTO dupe_group_items (decision_id, repo, number, kind, role, target, base_role, base_target) VALUES ('app:dupegroup:7', 'app', ?, 'issue', ?, ?, ?, ?)").run(n, role, target, role, target);
  w.db.prepare("INSERT INTO dupe_group_texts (decision_id, option, number, step, text) VALUES ('app:dupegroup:7', 'accept', 8, 'close', 'Duplicate of #7.')").run();
  w.answerDecision("app:dupegroup:7", "accept");
  applyDuplicateAnswers(w.db, T1);
};

test("a group member closes as DUPLICATE of the kept issue; a rejected DUPLICATE falls back to NOT_PLANNED", async () => {
  current = world().repo().issue(7).issue(8);
  dupGroup(current);
  const { sent, deps } = closes(current, (v) => v.reason === "DUPLICATE");
  const r = await runAct(current.db, { repo: "app", dryRun: false }, () => {}, deps);
  assert.deepEqual(r.done, ["app#8"]);
  assert.deepEqual(sent.map((v) => [v.id, v.reason, v.dup]), [["P8", "DUPLICATE", "P7"], ["P8", "NOT_PLANNED", undefined]]);
  const [a] = current.rows("SELECT details FROM audit WHERE action = 'act-close'") as { details: string }[];
  assert.match(a!.details, /"requestedReason":"DUPLICATE"/);
});

test("a group member closes with the kept issue's id when GitHub accepts it", async () => {
  current = world().repo().issue(7).issue(8);
  dupGroup(current);
  const { sent, deps } = closes(current);
  await runAct(current.db, { repo: "app", dryRun: false }, () => {}, deps);
  assert.deepEqual(sent.map((v) => [v.id, v.reason, v.dup]), [["P8", "DUPLICATE", "P7"]]);
});

test("an answered out-of-scope issue closes as NOT_PLANNED", async () => {
  current = world().repo().issue(5);
  ask(current.db, [{ id: "app#5:scope", kind: "scope", repo: "app", number: 5, question: "Out of scope?", options: [{ key: "close", label: "Close" }, { key: "take", label: "Take" }] }]);
  current.answerDecision("app#5:scope", "close");
  const { sent, deps } = closes(current);
  await runAct(current.db, { repo: "app", dryRun: false }, () => {}, deps);
  assert.deepEqual(sent.map((v) => [v.id, v.reason]), [["P5", "NOT_PLANNED"]]);
});
