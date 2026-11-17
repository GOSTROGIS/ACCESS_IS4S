// Issues that need a person are asked or listed, and an issue waiting on a PR names it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { decideItem } from "../src/core/decide-item.ts";
import { issuesWithOpenPr } from "../src/fixissue/candidates.ts";
import { itemFacts } from "./world.ts";

const needsDecision = { classification: { flags: ["needs decision"] }, labels: { existing: ["bugfix", "needs decision"] } };
const attempt = (state: string) => ({ state, textChanged: false, headDone: false, baseDone: true });

test("a labelled issue with the needs-decision flag and no scope decision is asked", () => {
  const p = decideItem(itemFacts({ ...needsDecision, labels: { existing: ["bugfix", "needs decision"], labeledNote: "added: bugfix" } }));
  assert.equal(p.state, "scope-due");
  assert.deepEqual(p.actions.map((a) => a.kind), ["decide"]);
});

test("a draft waits for its scope question and says so", () => {
  const p = decideItem(itemFacts({ ...needsDecision, draft: true }));
  assert.equal(p.wait, "the scope question to be asked");
});

test("a skipped or failed fix attempt waits on a person", () => {
  for (const s of ["skipped", "failed"]) {
    const p = decideItem(itemFacts({ fix: { impact: "P2", attempt: attempt(s) } }));
    assert.equal(p.wait, `a person to retry the ${s} fix`);
    assert.equal(p.waitKind, "person");
  }
});

test("a skipped attempt whose text changed is tried again, not waited on", () => {
  const p = decideItem(itemFacts({ fix: { impact: "P2", attempt: { ...attempt("skipped"), textChanged: true } } }));
  assert.deepEqual(p.actions.map((a) => a.kind), ["fixissue"]);
  assert.equal(p.wait, null);
});

test("an issue whose fix PR is open waits on that PR (system)", () => {
  const p = decideItem(itemFacts({ fix: { impact: "P2", openPr: { number: 84, closes: true } } }));
  assert.equal(p.wait, "open PR #84");
  assert.equal(p.waitKind, "system");
});

test("an open PR waits the issue whatever its fix attempt state, and a mention says so", () => {
  const stopped = decideItem(itemFacts({ fix: { impact: "P2", attempt: attempt("failed"), openPr: { number: 9, closes: true } } }));
  assert.equal(stopped.wait, "open PR #9");
  const mention = decideItem(itemFacts({ fix: { impact: "P2", openPr: { number: 9, closes: false } } }));
  assert.equal(mention.wait, "open PR #9 mentions it");
});

test("only closing references, and a person's bare mention, hold an issue; links and bot mentions do not", () => {
  const db = new DatabaseSync(":memory:");
  db.exec("CREATE TABLE items (repo TEXT, number INTEGER, kind TEXT, state TEXT, author TEXT, title TEXT, body TEXT, closing_issues TEXT)");
  const add = db.prepare("INSERT INTO items VALUES ('app', ?, 'pr', 'OPEN', ?, ?, ?, ?)");
  add.run(10, "dev", "Rework (#1)", "See also #2. Fixes #3", null);
  add.run(11, "dev", "Other", "Addresses item 3/5 of #6. Resolves: #4", "[5]");
  add.run(12, "dependabot[bot]", "Bump x", 'Notes: <a href="https://github.com/o/r/issues/710">#710</a> and #711 and [#712](https://x/y)', null);
  add.run(13, "dev", "Link", "https://github.com/o/r/issues/20 and [#21](https://x/21)", null);
  const m = issuesWithOpenPr(db, "app");
  assert.deepEqual([...m].sort((a, b) => a[0] - b[0]).map(([n, p]) => [n, p.number, p.closes]),
    [[1, 10, false], [2, 10, false], [3, 10, true], [4, 11, true], [5, 11, true], [6, 11, false]]);
});

test("stopped fixes are one group row per repo, listed 25 per page with priority first", async () => {
  const { connect } = await import("../src/db.ts");
  const { needs, fixes, FIXES_PAGE } = await import("../src/dash/api/needs.ts");
  const { fixStoppedWait } = await import("../src/core/decide-item.ts");
  const db = connect(":memory:");
  db.prepare("INSERT INTO settings (key, value) VALUES ('pipeline_login', 'bot')").run();
  db.prepare("INSERT OR IGNORE INTO tracked_repos (name) VALUES ('app')").run();
  db.prepare("INSERT INTO repos (name, visibility) VALUES ('app', 'public') ON CONFLICT (name) DO UPDATE SET visibility = 'public'").run();
  const t = new Date().toISOString();
  for (let n = 1; n <= 30; n++) {
    db.prepare("INSERT INTO items (repo, number, kind, state, title) VALUES ('app', ?, 'issue', 'OPEN', ?)").run(n, `Issue ${n}`);
    db.prepare("INSERT INTO item_plans (repo, number, kind, head, state, item_state, actions, wait, reasons, note, view, planned_at) VALUES ('app', ?, 'issue', NULL, 'x', 'classified', '[]', ?, '[]', NULL, '{}', ?)").run(n, fixStoppedWait("skipped"), t);
  }
  db.prepare("INSERT INTO item_priority (repo, number, text_hash, impact, score, model, at) VALUES ('app', 7, 'h', 'P1', 90, 'm', ?)").run(t);
  const req = (query: Record<string, string> = {}) => ({
    method: "GET", path: "", params: { repo: "app" }, query: new URLSearchParams(query), form: new URLSearchParams(),
    user: { login: "u", role: "operator", canWrite: async () => true, canRead: async () => true }, csrf: "", nonce: "",
  }) as never;
  const page = await needs(db, req());
  assert.deepEqual(page.stopped.map((s) => [s.id, s.count]), [["fixes:app", 30]]);
  assert.equal(page.counts.stopped, 1);
  const p1 = await fixes(db, req());
  assert.equal(p1.rows.length, FIXES_PAGE);
  assert.equal(p1.rows[0]!.number, 7);
  const p2 = await fixes(db, req({ cursor: p1.nextCursor! }));
  assert.equal(p2.rows.length, 5);
  assert.equal(p2.nextCursor, null);
});

test("a lapsed maintainer scope answer is set aside and asked once; an open duplicate group covers its members", async () => {
  const { connect } = await import("../src/db.ts");
  const { ask } = await import("../src/decisions.ts");
  const { setAsideLapsedScope } = await import("../src/merge/withdraw.ts");
  const { loadItemFact } = await import("../src/core/issue-facts.ts");
  const db = connect(":memory:");
  const t = new Date().toISOString();
  db.prepare("INSERT INTO repos (name, visibility, default_branch) VALUES ('app', 'public', 'main')").run();
  db.prepare("INSERT INTO tracked_repos (name, added_by, added_at, pipeline) VALUES ('app', 'op', ?, 1)").run(t);
  db.prepare("INSERT INTO access (login, role) VALUES ('maint', 'maintainer')").run();
  for (const n of [5, 6]) db.prepare("INSERT INTO items (repo, number, kind, state, title, body, author, created_at, updated_at) VALUES ('app', ?, 'issue', 'OPEN', 'T', '', 'a', ?, ?)").run(n, t, t);
  const q = (id: string, number: number) => ({ id, kind: "scope", repo: "app", number, question: "Scope?", facts: [], options: [{ key: "take", label: "Take" }, { key: "close", label: "Close" }], asked_at: t, asked_by: "decide" });
  ask(db, [q("app#5:scope", 5)]);
  db.prepare("UPDATE decisions SET answer = 'take', answered_by = 'maint', answered_at = ?, applied_at = ? WHERE id = 'app#5:scope'").run(t, t);
  assert.equal(loadItemFact(db, "app", 5)?.scope.covered, false, "a lapsed answer covers nothing");
  assert.equal(setAsideLapsedScope(db, "app#5:scope", t), true);
  ask(db, [q("app#5:scope", 5)]);
  const open = db.prepare("SELECT id FROM decisions WHERE repo = 'app' AND number = 5 AND answer IS NULL").all();
  assert.equal(open.length, 1);
  assert.equal(loadItemFact(db, "app", 5)?.scope.covered, true, "the next Decide run asks nothing");
  assert.equal(setAsideLapsedScope(db, "app#5:scope", t), false, "an open question is not set aside");

  ask(db, [{ id: "app#6:dupegroup:g", kind: "duplicate", question: "Duplicates?", facts: [], options: [{ key: "a", label: "A" }, { key: "b", label: "B" }], asked_at: t, asked_by: "dupes", items: [{ repo: "app", number: 6 }, { repo: "app", number: 7 }] }]);
  assert.equal(loadItemFact(db, "app", 6)?.scope.covered, true);
});

test("Close and Backlog on a stopped fix are scope answers by the operator, once", async () => {
  const { connect } = await import("../src/db.ts");
  const { stopFixItem } = await import("../src/dash/api/operator.ts");
  const db = connect(":memory:");
  const t = new Date().toISOString();
  db.prepare("INSERT INTO repos (name, visibility) VALUES ('app', 'public')").run();
  db.prepare("INSERT INTO tracked_repos (name, added_by, added_at, pipeline) VALUES ('app', 'op', ?, 1)").run(t);
  db.prepare("INSERT INTO items (repo, number, kind, state, title) VALUES ('app', 5, 'issue', 'OPEN', 'T')").run();
  db.prepare("INSERT INTO fix_attempts (repo, number, main_sha, text_hash, state, created_at, updated_at) VALUES ('app', 5, 'm', 'h', 'skipped', ?, ?)").run(t, t);
  const req = (answer: string) => ({
    method: "POST", path: "", params: { repo: "app", n: "5" }, query: new URLSearchParams(), form: new URLSearchParams(), json: { answer },
    user: { login: "op", role: "operator", canWrite: async () => true, canRead: async () => true }, csrf: "", nonce: "",
  }) as never;
  await stopFixItem(db, req("close"));
  const d = db.prepare("SELECT kind, answer, answered_by FROM decisions WHERE repo = 'app' AND number = 5").get();
  assert.deepEqual({ ...d }, { kind: "scope", answer: "close", answered_by: "op" });
  await assert.rejects(() => stopFixItem(db, req("backlog")), /already decided/);
});
