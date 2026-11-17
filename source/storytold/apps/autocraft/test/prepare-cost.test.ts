// What makes a decision due for another prepare: head pushes, discussion, reviews and the daily cap.
import assert from "node:assert/strict";
import { test } from "node:test";
import { prepareIds } from "../src/decide/prepare.ts";
import { preparedEarlier, preparing } from "../src/decide/prepared.ts";
import { ask, getDecision } from "../src/decisions.ts";
import { dependsOnCode } from "../src/conversations/cards.ts";
import { world } from "./world-db.ts";

const DAY = Date.parse("2026-11-04T12:00:00.000Z");
const opts = [{ key: "take", label: "Take" }, { key: "close", label: "Close" }];

function setup() {
  const w = world().repo().pr(7);
  const head = w.db.prepare("SELECT head_oid FROM items WHERE number = 7").get()!.head_oid as string;
  ask(w.db, [
    { id: "app#7:scope", kind: "scope", repo: "app", number: 7, question: "In scope?", options: opts },
    { id: `app#7:merge@${head}`, kind: "merge", repo: "app", number: 7, question: "Merge?", options: [{ key: "merge", label: "Merge" }, { key: "no", label: "No" }] },
  ]);
  w.db.prepare("UPDATE decisions SET prepared_at = '2026-11-04T10:00:00.000Z', prepared_head = ?, prepared_discussion = ''").run(head);
  return { w, head };
}
const comment = (w: ReturnType<typeof setup>["w"], id: string, at: string, o: { counted?: number; author?: string; body?: string } = {}) =>
  w.db.prepare("INSERT INTO comments (repo, number, id, kind, author, created_at, body, counted) VALUES ('app', 7, ?, 'comment', ?, ?, ?, ?)").run(id, o.author ?? "maint", at, o.body ?? "b", o.counted ?? 1);

test("a scope decision stays prepared across a head push; a Merge? decision for an old head is not prepared", () => {
  const { w, head } = setup();
  assert.deepEqual(prepareIds(w.db, undefined, DAY), []);
  w.db.prepare("UPDATE items SET head_oid = 'newhead' WHERE number = 7").run();
  assert.deepEqual(prepareIds(w.db, undefined, DAY), []);
  w.db.prepare("UPDATE decisions SET prepared_at = NULL WHERE id LIKE '%merge@%'").run();
  assert.deepEqual(prepareIds(w.db, undefined, DAY), []);
  w.db.prepare("UPDATE items SET head_oid = ? WHERE number = 7").run(head);
  assert.deepEqual(prepareIds(w.db, undefined, DAY), [`app#7:merge@${head}`]);
});

test("a scope decision is prepared again after a counted person's comment, a review at the head or not after other posts", () => {
  const { w } = setup();
  comment(w, "bot", "2026-11-04T11:00:00.000Z", { counted: 0 });
  comment(w, "own", "2026-11-04T11:10:00.000Z", { body: "_AI-generated review of the PR_" });
  w.db.prepare("INSERT INTO conversation_turns (repo, number, kind, login, at, body, block) VALUES ('app', 7, 'operator', 'op', '2026-11-04T11:20:00.000Z', 'hi', 'hi')").run();
  assert.deepEqual(prepareIds(w.db, undefined, DAY), []);
  comment(w, "c2", "2026-11-04T11:30:00.000Z");
  assert.deepEqual(prepareIds(w.db, undefined, DAY), ["app#7:scope"]);
  // A prepare that read c2 covers it.
  w.db.prepare("UPDATE decisions SET prepared_discussion = 'c2' WHERE id = 'app#7:scope'").run();
  assert.deepEqual(prepareIds(w.db, undefined, DAY), []);
  w.db.prepare("INSERT INTO opus_reviews (repo, number, head_oid, at, mode, verdict) VALUES ('app', 7, (SELECT head_oid FROM items WHERE number = 7), '2026-11-04T11:40:00.000Z', 'full', 'take')").run();
  assert.deepEqual(prepareIds(w.db, undefined, DAY), ["app#7:scope"]);
});

test("the 4th automatic prepare in a UTC day is held and the decision is not preparing; Re-prepare runs", () => {
  const { w } = setup();
  w.db.prepare("UPDATE decisions SET prepared_at = NULL WHERE kind = 'scope'").run();
  const rec = (at: string) => w.db.prepare("INSERT INTO decision_prepares (decision_id, at, manual) VALUES ('app#7:scope', ?, 0)").run(at);
  rec("2026-11-03T23:00:00.000Z"); rec("2026-11-04T01:00:00.000Z"); rec("2026-11-04T02:00:00.000Z");
  assert.deepEqual(prepareIds(w.db, undefined, DAY), ["app#7:scope"]);
  rec("2026-11-04T03:00:00.000Z");
  assert.deepEqual(prepareIds(w.db, undefined, DAY), []);
  const today = new Date().toISOString().slice(0, 10);
  w.db.prepare("UPDATE decision_prepares SET at = ?").run(`${today}T00:00:01.000Z`);
  assert.equal(preparing(w.db, getDecision(w.db, "app#7:scope")!), false);
  // With earlier choices it shows them as prepared earlier.
  w.db.prepare("UPDATE decisions SET prepared_at = '2026-11-04T10:00:00.000Z', prepared_discussion = 'zzz' WHERE id = 'app#7:scope'").run();
  // Past the day's discussion re-prepares a new comment no longer makes the choices stale; a new review at the head does.
  assert.equal(preparedEarlier(w.db, getDecision(w.db, "app#7:scope")!), false);
  w.db.prepare("INSERT INTO opus_reviews (repo, number, head_oid, at, mode, verdict) VALUES ('app', 7, (SELECT head_oid FROM items WHERE number = 7), '2026-11-04T11:40:00.000Z', 'full', 'take')").run();
  assert.equal(preparedEarlier(w.db, getDecision(w.db, "app#7:scope")!), true);
  w.db.prepare("UPDATE decisions SET prepare_requested_at = ?, prepared_at = NULL WHERE id = 'app#7:scope'").run("2026-11-04T11:00:00.000Z");
  assert.deepEqual(prepareIds(w.db, undefined, DAY), ["app#7:scope"]);
});

test("cards that rest on the code are told apart from those that do not", () => {
  assert.equal(dependsOnCode({ kind: "resolution", steps: [{ kind: "comment" }, { kind: "label", label: "x" }], settle: null }, "Thanks"), true);
  assert.equal(dependsOnCode({ kind: "resolution", steps: [{ kind: "fixup", instructions: "do", merge: false }], settle: null }, null), true);
  assert.equal(dependsOnCode({ kind: "resolution", steps: [{ kind: "label", label: "x" }], settle: { kind: "backlog", decision: "d", stamp: "s" } }, null), false);
  assert.equal(dependsOnCode({ kind: "resolution", steps: [{ kind: "close", reason: "not_planned" as never, pr: true }], settle: null }, null), false);
});

test("after a push, a scope decision whose choices hold a code-dependent core is prepared again once per new head", () => {
  const { w, head } = setup();
  const put = (drafts: object, seenHead: string) => {
    w.db.prepare("DELETE FROM decision_choices").run();
    w.db.prepare(`INSERT INTO decision_choices (id, decision_id, repo, number, stamp, seen, source, drafts, added, pick, state, created_at)
      VALUES ('c1', 'app#7:scope', 'app', 7, 's', ?, 'prepare', ?, '[]', '{}', 'current', '2026-11-04T10:00:00.000Z')`).run(JSON.stringify({ head: seenHead }), JSON.stringify(drafts));
  };
  put({ "o:close": { extras: [] }, backlog: { extras: [] } }, head);
  w.db.prepare("UPDATE items SET head_oid = 'newhead' WHERE number = 7").run();
  // Only code-independent cores: left as they are.
  assert.deepEqual(prepareIds(w.db, undefined, DAY), []);
  put({ "o:take": { extras: [{ kind: "comment", on: true }] } }, head);
  assert.deepEqual(prepareIds(w.db, undefined, DAY), ["app#7:scope"]);
  // Prepared for the new head: not due again.
  put({ "o:take": { extras: [{ kind: "comment", on: true }] } }, "newhead");
  assert.deepEqual(prepareIds(w.db, undefined, DAY), []);
  // Capped: the existing choices stay, shown as prepared earlier.
  put({ "x:fixup": { params: { instructions: "do" }, extras: [] } }, head);
  for (const at of ["01", "02", "03"]) w.db.prepare("INSERT INTO decision_prepares (decision_id, at, manual) VALUES ('app#7:scope', ?, 0)").run(`${new Date().toISOString().slice(0, 10)}T00:00:${at}.000Z`);
  assert.equal(preparing(w.db, getDecision(w.db, "app#7:scope")!), false);
  assert.equal(preparedEarlier(w.db, getDecision(w.db, "app#7:scope")!), true);
});

test("a second comment in a day does not re-prepare; a Merge? question waits only while the Plan holds a review at its head, and Re-prepare lifts that", () => {
  const { w, head } = setup();
  const today = "2026-11-04";
  const rec = (at: string) => w.db.prepare("INSERT INTO decision_prepares (decision_id, at, manual) VALUES ('app#7:scope', ?, 0)").run(at);
  comment(w, "c2", "2026-11-04T11:30:00.000Z");
  assert.deepEqual(prepareIds(w.db, undefined, DAY), ["app#7:scope"], "the first comment of the day re-prepares");
  rec(`${today}T00:00:01.000Z`); rec(`${today}T00:00:02.000Z`);
  assert.deepEqual(prepareIds(w.db, undefined, DAY), [], "later comments wait for a new review, head or Re-prepare");
  w.db.prepare("UPDATE decisions SET prepared_at = NULL WHERE id LIKE '%merge@%'").run();
  const merge = `app#7:merge@${head}`;
  const plan = (actions: unknown[]) => w.db.prepare("INSERT OR REPLACE INTO item_plans (repo, number, kind, state, actions, reasons, view, planned_at) VALUES ('app', 7, 'pr', 'x', ?, '[]', ?, '2026-11-04T00:00:00.000Z')").run(JSON.stringify(actions), JSON.stringify({ next: "Review" }));
  plan([]);
  assert.deepEqual(prepareIds(w.db, undefined, DAY), [merge], "a stale review the Plan does not start (held by a cap or a blocker) does not hold the question");
  plan([{ kind: "review", head }]);
  assert.deepEqual(prepareIds(w.db, undefined, DAY), [], "a review that starts at this head withdraws and asks the question again");
  w.db.prepare("UPDATE decisions SET prepare_requested_at = '2026-11-04T11:00:00.000Z' WHERE id = ?").run(merge);
  assert.deepEqual(prepareIds(w.db, undefined, DAY), [merge], "an operator's Re-prepare runs");
});

test("prepares go round the repos, and a locked decision is not prepared", () => {
  const { w } = setup();
  w.db.prepare("UPDATE decisions SET prepared_at = NULL").run();
  assert.equal(prepareIds(w.db, undefined, DAY).length, 2);
  w.db.prepare("INSERT INTO conversation_cards (id, turn_id, repo, number, kind, params, description, state) VALUES (9, 0, 'app', 7, 'resolution', '{}', 'x', 'queued')").run();
  w.db.prepare("UPDATE decisions SET exec_state = 'settling', exec_reason = '9:op' WHERE id = 'app#7:scope'").run();
  assert.deepEqual(prepareIds(w.db, undefined, DAY).filter((id) => id.includes("scope")), [], "a queued press holds its decision");
});
