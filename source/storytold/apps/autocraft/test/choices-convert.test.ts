// Proposed cards from before the choices format become drafts; the settling cards are replaced, an ask card stays proposed.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { useTestAccount } from "./accounts-fixture.ts";
import { SCRATCH } from "./scratch.ts";
import { currentChoices } from "../src/decide/choices.ts";
import { convertOpenDecisions } from "../src/decide/choices-convert.ts";
import { connect } from "../src/db.ts";
import { ask, getDecision } from "../src/decisions.ts";
import { decisionStamp } from "../src/conversations/cards.ts";

mkdirSync(SCRATCH, { recursive: true });
const T0 = "2026-01-01T00:00:00Z";

test("open decisions' proposed cards convert to choices", () => {
  const db: DatabaseSync = connect(join(mkdtempSync(join(SCRATCH, "choices-convert-")), "t.db"));
  db.prepare("INSERT OR IGNORE INTO tracked_repos (name, added_by, added_at, pipeline) VALUES ('app', 'op', ?, 1)").run(T0);
  db.prepare("INSERT INTO repos (name, visibility) VALUES ('app', 'public')").run();
  useTestAccount(db);
  db.prepare(`INSERT INTO items (repo, number, kind, state, title, body, author, created_at, updated_at, labels) VALUES ('app', 1, 'issue', 'OPEN', 'Issue 1', 'Body', 'someone', '${T0}', '${T0}', '[]')`).run();
  ask(db, [{ id: "app#1:scope", kind: "scope", repo: "app", number: 1, question: "Scope?", options: [{ key: "take", label: "Wanted" }, { key: "close", label: "Out of scope" }] }]);
  db.prepare("UPDATE decisions SET recommended = 'take', recommended_reason = 'fits' WHERE id = 'app#1:scope'").run();
  const turn = Number(db.prepare("INSERT INTO conversation_turns (repo, number, kind, login, at, body, block) VALUES ('app', 1, 'opus', 'opus', ?, '', '')").run(T0).lastInsertRowid);
  const card = db.prepare("INSERT INTO conversation_cards (turn_id, repo, number, kind, params, text, description) VALUES (?, 'app', 1, 'resolution', ?, ?, '')");
  const stamp = decisionStamp(db, getDecision(db, "app#1:scope")!);
  const take = { kind: "resolution", settle: { kind: "answer", decision: "app#1:scope", option: "take", stamp }, steps: [{ kind: "comment" }, { kind: "label", label: "accepted" }, { kind: "open_issue", repo: "app", title: "T", body: "B" }] };
  const close = { kind: "resolution", settle: { kind: "handled", decision: "app#1:scope", summary: "s", stamp, fromClose: true }, steps: [{ kind: "comment" }, { kind: "close", reason: "not_planned", pr: false }] };
  card.run(turn, JSON.stringify(take), "Thanks");
  card.run(turn, JSON.stringify(close), "Closing");
  card.run(turn, JSON.stringify({ kind: "resolution", settle: null, steps: [{ kind: "comment" }] }), "Which area?");

  // A card written for an earlier state of the decision is not converted.
  card.run(turn, JSON.stringify({ ...take, settle: { ...take.settle, stamp: "old|0" } }), "Stale");
  const r = convertOpenDecisions(db);
  assert.deepEqual([r.converted, r.skipped, r.stale, r.unconverted], [1, 0, 1, 0]);
  const row = currentChoices(db, "app#1:scope")!;
  assert.equal(row.source, "converted");
  assert.deepEqual(row.pick, { core: "o:take", reason: "fits" });
  assert.deepEqual(row.drafts["o:take"]!.extras.map((e) => [e.id, e.on]), [["comment", true], ["label:accepted", true], ["open_issue", true]]);
  assert.equal(row.drafts["o:take"]!.extras[0]!.text, "Thanks");
  assert.deepEqual(row.added, ["x:close:not_planned"]);
  assert.equal(row.drafts["x:close:not_planned"]!.extras[0]!.text, "Closing");
  const states = db.prepare("SELECT state FROM conversation_cards ORDER BY id").all().map((r) => (r as { state: string }).state);
  assert.deepEqual(states, ["replaced", "replaced", "proposed", "proposed"]);
  assert.equal(convertOpenDecisions(db).converted, 0);
});
