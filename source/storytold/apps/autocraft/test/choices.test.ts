// Decision choices: a core plus ticked extras composes into one resolution that runs through doCard; extras a core does
// not take are refused; a comment goes with the merge answer only.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { describe, test } from "node:test";
import { useTestAccount } from "./accounts-fixture.ts";
import { SCRATCH } from "./scratch.ts";
import { setCommentApproval } from "../src/act/approval.ts";
import { decisionStamp, validateCard } from "../src/conversations/cards.ts";
import { doCard } from "../src/conversations/act.ts";
import { applyDrafts, autocraftLine, compose, coresFor, currentChoices, mergeChoices, writeChoices } from "../src/decide/choices.ts";
import { coreKey, parseCoreKey } from "../src/decide/choices-types.ts";
import { SCOPE_OPTIONS } from "../src/decide/decision.ts";
import { CLOSE_OPTIONS } from "../src/act/index.ts";
import { MERGE_OPTIONS } from "../src/core/rules.ts";
import { GROUP_OPTIONS } from "../src/dupes/held.ts";
import { parseChoices } from "../src/decide/choices-parse.ts";
import { parsePrepareReply } from "../src/decide/prepare.ts";
import { insertTurn, opusBlock } from "../src/conversations/store.ts";
import { connect } from "../src/db.ts";
import { ask, getDecision } from "../src/decisions.ts";
import { choicesView, doChoice } from "../src/dash/api/conversations.ts";
import { HttpError } from "../src/dash/server/util.ts";
import type { Req } from "../src/dash/types.ts";
import { OPERATOR, world } from "./world-db.ts";

mkdirSync(SCRATCH, { recursive: true });
const T0 = "2026-01-01T00:00:00Z";

function fresh(): DatabaseSync {
  const db = connect(join(mkdtempSync(join(SCRATCH, "choices-test-")), "t.db"));
  db.prepare("INSERT OR IGNORE INTO tracked_repos (name, added_by, added_at, pipeline) VALUES ('app', 'op', ?, 1)").run(T0);
  db.prepare("INSERT INTO repos (name, visibility) VALUES ('app', 'public')").run();
  useTestAccount(db);
  const item = db.prepare(`INSERT INTO items (repo, number, kind, state, title, body, author, head_oid, created_at, updated_at, labels) VALUES ('app', ?, ?, 'OPEN', ?, 'Body', 'someone', ?, '${T0}', '${T0}', '[]')`);
  item.run(1, "issue", "Issue 1", null);
  item.run(2, "pr", "PR 2", "sha2");
  ask(db, [
    { id: "app#1:scope", kind: "scope", repo: "app", number: 1, question: "Scope?", options: [{ key: "take", label: "Wanted" }, { key: "close", label: "Out of scope" }] },
    { id: "app#2:merge", kind: "merge", repo: "app", number: 2, question: "Merge?", options: [{ key: "merge", label: "Merge" }, { key: "hold", label: "Hold" }] },
  ]);
  setCommentApproval(db, "op", "app", true);
  return db;
}

const choose = (db: DatabaseSync, decision: string, key: string, ticked: Parameters<typeof compose>[1], params = {}) => {
  const d = getDecision(db, decision)!;
  const core = applyDrafts(db, d, coresFor(db, d), currentChoices(db, decision)).find((c) => c.key === key)!;
  return { d, core, composed: compose(core, ticked, params) };
};

describe("decision choices", () => {
  test("a merge core with a ticked open_issue extra composes, validates and runs through doCard", async () => {
    const db = fresh();
    const d = getDecision(db, "app#2:merge")!;
    writeChoices(db, {
      decisionId: d.id, repo: "app", number: 2, turnId: null, stamp: decisionStamp(db, d), seen: { head: "sha2", lastComment: null }, source: "prepare",
      drafts: { [coreKey.option("merge")]: { extras: [{ id: "open_issue", kind: "open_issue", on: true, repo: "app", title: "Follow up", body: "Check the edge case." }] } },
      added: [], pick: { core: coreKey.option("merge"), reason: "Looks right." },
    });
    assert.equal((db.prepare("SELECT recommended FROM decisions WHERE id = ?").get(d.id) as { recommended: string }).recommended, "merge");
    const view = choicesView(db, "app", 2)!;
    const merge = view.cores.find((c) => c.key === "o:merge")!;
    assert.deepEqual(merge.writes, ["merge"]);
    assert.deepEqual(merge.extras.map((e) => [e.id, e.on]), [["open_issue", true], ["comment", false]]);

    const { composed } = choose(db, d.id, "o:merge", [{ id: "open_issue", kind: "open_issue", repo: "app", title: "Follow up", body: "Check the edge case." }]);
    assert.ok("card" in composed);
    const v = validateCard(db, "app", 2, composed.card);
    assert.ok("card" in v, "note" in v ? v.note : "");
    const id = Number(db.prepare("INSERT INTO conversation_cards (turn_id, repo, number, kind, params, text, description) VALUES (0, 'app', 2, 'resolution', ?, NULL, ?)")
      .run(JSON.stringify(v.card.params), v.card.description).lastInsertRowid);
    const querier = { query: async () => ({}) };
    const exec = async () => ({ code: 0, stdout: "https://github.com/storytold/app/issues/7\n", stderr: "" });
    const { card } = await doCard(db, id, "op", { querier: querier as never, exec: exec as never });
    assert.equal(card.state, "done", card.error ?? "");
    assert.equal(getDecision(db, d.id)!.answer, "merge");
    assert.equal(currentChoices(db, d.id), undefined, "settling replaces the choices");
  });

  test("every core says what AutoCraft does after the answer", () => {
    const db = fresh();
    const line = (id: string) => Object.fromEntries(coresFor(db, getDecision(db, id)!).map((c) => [c.key, c.autocraft]));
    assert.equal(line("app#1:scope")["o:take"], "keeps working: may try a fix");
    assert.equal(line("app#2:merge")["o:hold"], "holds the merge until someone answers again");
    for (const id of ["app#1:scope", "app#2:merge"]) for (const [k, v] of Object.entries(line(id))) assert.ok(v, `${id} ${k}`);
    // Every option key the decision kinds ask with, and the cores Opus may add, has a phrase.
    const options = [...Object.keys(SCOPE_OPTIONS), ...Object.keys(CLOSE_OPTIONS), ...Object.keys(MERGE_OPTIONS), ...Object.keys(GROUP_OPTIONS), "keep:7", "backlog"];
    for (const k of options) for (const kind of ["scope", "close", "merge", "duplicate"]) assert.ok(autocraftLine(parseCoreKey(k === "backlog" ? k : `o:${k}`)!, kind, "pr"), `${kind} ${k}`);
    for (const k of ["fixup-merge", "x:close:completed", "x:duplicate:3", "x:transfer:a/b", "x:fixup", "x:review"]) assert.ok(autocraftLine(parseCoreKey(k)!, "scope", "issue"), k);
  });

  test("an extra the core does not take is refused", () => {
    const db = fresh();
    // Hold takes no open_issue; the merge answer takes no request_reviewers; a backlog core takes no extras.
    assert.ok("note" in choose(db, "app#2:merge", "o:hold", [{ id: "open_issue", kind: "open_issue", repo: "app", title: "t", body: "b" }]).composed);
    assert.ok("note" in choose(db, "app#2:merge", "o:merge", [{ id: "request_reviewers", kind: "request_reviewers", logins: ["x"] }]).composed);
    assert.ok("note" in choose(db, "app#2:merge", "backlog", [{ id: "comment", kind: "comment", text: "t" }]).composed);
  });

  test("merge takes a comment before the answer; a closing option takes none", () => {
    const db = fresh();
    const check = (decision: string, n: number, key: string) => {
      const c = choose(db, decision, key, [{ id: "comment", kind: "comment", text: "Thanks, merging." }]).composed;
      assert.ok("card" in c, "note" in c ? c.note : "");
      return validateCard(db, "app", n, c.card);
    };
    assert.ok("card" in check("app#2:merge", 2, "o:merge"));
    // Out of scope closes: comment is not an extra there, and a hand-built card is refused too.
    assert.ok("note" in choose(db, "app#1:scope", "o:close", [{ id: "comment", kind: "comment", text: "x" }]).composed);
    const raw = { kind: "resolution", steps: [{ kind: "comment" }], settle: { kind: "answer", option: "close" }, text: "Closing." };
    assert.ok("note" in validateCard(db, "app", 1, raw));
  });

  test("merging a turn's block replaces the listed cores whole, keeps the rest and caps the added cores", () => {
    const db = fresh();
    const base = { turnId: 5, stamp: "s", seen: { head: null, lastComment: null }, pick: { core: coreKey.option("merge"), reason: "r" } };
    mergeChoices(db, "app#2:merge", { ...base, cores: { "o:merge": { extras: [{ kind: "comment", on: true, text: "A" }] }, "o:hold": { extras: [{ kind: "label", on: false, label: "bugfix" }] } } });
    const { row, notes } = mergeChoices(db, "app#2:merge", {
      ...base, cores: { "o:merge": { extras: [{ kind: "comment", on: false, text: "B" }] } },
      add: [coreKey.close("completed"), coreKey.close("not_planned"), coreKey.review, coreKey.fixup].map((key) => ({ key, draft: { extras: [] } })),
    });
    assert.equal(row.drafts["o:merge"]!.extras[0]!.text, "B");
    assert.ok(row.drafts["o:hold"]);
    assert.equal(row.added.length, 3);
    assert.equal(notes.length, 1);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM decision_choices WHERE state = 'current'").get()!.n, 1);
  });

  const block = (o: unknown) => `Summary text.\n\`\`\`choices\n${JSON.stringify(o)}\n\`\`\``;

  test("parseChoices keeps a valid core with its extras and drops an extra the core does not take, with a note", () => {
    const db = fresh();
    const d = getDecision(db, "app#2:merge")!;
    const r = parseChoices(db, "app", 2, d, block({
      pick: { core: "o:merge", reason: "Looks right." },
      cores: [{ core: "o:merge", extras: [
        { kind: "comment", on: true, text: "Thanks, merging." },
        { kind: "open_issue", on: true, repo: "app", title: "Follow up", body: "Check the edge case." },
        { kind: "request_reviewers", on: true, logins: ["x"] },
      ] }],
    }))!;
    assert.deepEqual(r.choices!.cores["o:merge"]!.extras.map((e) => e.kind), ["comment", "open_issue"]);
    assert.equal(r.notes.length, 1);
    assert.match(r.notes[0]!, /request_reviewers extra of o:merge/);
    assert.deepEqual(r.choices!.pick, { core: "o:merge", reason: "Looks right." });
    // A core that does not validate is dropped and a pick on it is lost; a fix-up core needs instructions.
    const bad = parseChoices(db, "app", 2, d, block({ pick: { core: "fixup-merge", reason: "x" }, cores: [{ core: "fixup-merge", instructions: "", extras: [] }] }))!;
    assert.equal(bad.pickLost, "fixup-merge");
    assert.deepEqual(bad.choices!.cores, {});
    assert.equal(parseChoices(db, "app", 2, d, "Only text.")!.choices, null);
  });

  test("a prepare reply with a choices block writes a choices row with the pick and the recommendation", () => {
    const db = fresh();
    const d = getDecision(db, "app#2:merge")!;
    const text = "The PR changes the export path and the reference app does the same, so it can be merged as it is after the follow-up is filed.";
    const got = parsePrepareReply(db, { repo: "app", n: 2, d, single: true }, `${text}\n\`\`\`choices\n${JSON.stringify({
      pick: { core: "o:merge", reason: "Same as the reference app." },
      cores: [{ core: "o:merge", extras: [{ kind: "open_issue", on: true, repo: "app", title: "Follow up", body: "Check the edge case." }] }],
      ask: { text: "Which version do you run?" },
    })}\n\`\`\``)!;
    assert.equal(got.pick, "merge");
    assert.ok(got.ask);
    insertTurn(db, "app", 2, { kind: "opus", login: "opus", body: got.text, block: opusBlock(got.text, [got.ask!], got.choices), cards: [got.ask!], choices: { decision: d, parsed: got.choices!, source: "prepare", by: "opus" } });
    const row = currentChoices(db, d.id)!;
    assert.equal(row.source, "prepare");
    assert.deepEqual(row.pick, { core: "o:merge", reason: "Same as the reference app." });
    assert.equal(row.drafts["o:merge"]!.extras[0]!.on, true);
    assert.ok(row.turnId);
    const rec = db.prepare("SELECT recommended, recommended_reason, recommended_by FROM decisions WHERE id = ?").get(d.id) as Record<string, string>;
    assert.deepEqual({ ...rec }, { recommended: "merge", recommended_reason: "Same as the reference app.", recommended_by: "opus" });
    // A single decision without a block is no valid reply; one that only takes a pick may come without.
    assert.equal(parsePrepareReply(db, { repo: "app", n: 2, d, single: true }, text), null);
    assert.equal(parsePrepareReply(db, { repo: "app", n: 2, d, single: false }, text)!.pick, null);
  });

  const who = (role: "operator" | "maintainer" | "viewer", id: string, json: unknown): Req => ({
    method: "POST", path: "", params: { id }, query: new URLSearchParams(), form: new URLSearchParams(), json, csrf: "", nonce: "",
    user: { login: role, role, canWrite: async () => role === "operator", canRead: async () => true },
  } as unknown as Req);
  const prepared = (db: DatabaseSync, stamp?: string) => {
    const d = getDecision(db, "app#2:merge")!;
    return writeChoices(db, {
      decisionId: d.id, repo: "app", number: 2, turnId: null, stamp: stamp ?? decisionStamp(db, d), seen: { head: "sha2", lastComment: null }, source: "prepare",
      drafts: { "fixup-merge": { params: { instructions: "Drop the data files." }, extras: [] } }, added: [], pick: { core: "o:hold", reason: "Wait." },
    });
  };
  const deps = { querier: { query: async () => ({}) } as never, exec: (async () => ({ code: 0, stdout: "", stderr: "" })) as never };

  test("doChoice: viewers and stale choices are refused, a maintainer cannot edit instructions, a double press runs once", async () => {
    const db = fresh();
    assert.equal(choicesView(db, "app", 2), null, "no choices written for the decision: the plain answer path");
    const row = prepared(db);
    const hold = { core: "o:hold", extras: [] };
    await assert.rejects(() => doChoice(db, who("viewer", row.id, hold), deps), (e) => e instanceof HttpError && e.status === 403);
    await assert.rejects(() => doChoice(db, who("maintainer", row.id, { core: "fixup-merge", params: { instructions: "Something else" }, extras: [] }), deps), (e) => e instanceof HttpError && e.status === 403);
    const other = fresh();
    const bad = prepared(other, "old|0");
    await assert.rejects(() => doChoice(other, who("operator", bad.id, hold), deps), (e) => e instanceof HttpError && e.status === 409);
    const [a, b] = await Promise.all([doChoice(db, who("operator", row.id, hold), deps), doChoice(db, who("operator", row.id, hold), deps)]);
    assert.equal(a.id, b.id);
    assert.equal(a.state, "done");
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM conversation_cards WHERE choice_id = ?").get(row.id)!.n, 1);
  });

  test("a scope question on a PR the classifier did not label for review: Fix up, then merge keeps the PR in core first and queues the fix-up", async () => {
    const w = world().repo().pr(5, { label: "plugin candidate" });
    try {
      const db = w.db;
      ask(db, [{ id: "app#5:scope", kind: "scope", repo: "app", number: 5, question: "Scope?", options: Object.values(SCOPE_OPTIONS).map((o) => ({ key: o.key, label: o.label })) }]);
      const keys = coresFor(db, getDecision(db, "app#5:scope")!).map((c) => c.key);
      assert.ok(keys.includes("fixup-merge"), keys.join());
      const settleOf = (extras: Parameters<typeof compose>[1]) => {
        const { composed } = choose(db, "app#5:scope", "fixup-merge", extras, { instructions: "Rename a to b." });
        assert.ok("card" in composed);
        const v = validateCard(db, "app", 5, composed.card);
        assert.ok("card" in v, "note" in v ? v.note : "");
        const p = v.card.params as { settle: { kind: string; option?: string }; steps: { kind: string; merge?: boolean }[] };
        return { v, kind: p.settle.kind, option: p.settle.option, steps: p.steps.map((x) => x.kind).join() };
      };
      // The "small extra" label extra makes the answer small-extra; the label step needs a live item, so only the plain run goes through doCard.
      assert.deepEqual({ ...settleOf([{ id: "label:small extra", kind: "label", label: "small extra" }]), v: 0 }, { v: 0, kind: "answer", option: "small-extra", steps: "label,fixup" });
      const plain = settleOf([]);
      assert.deepEqual([plain.kind, plain.option, plain.steps], ["answer", "take", "fixup"]);
      const id = Number(db.prepare("INSERT INTO conversation_cards (turn_id, repo, number, kind, params, text, description) VALUES (0, 'app', 5, 'resolution', ?, NULL, ?)")
        .run(JSON.stringify(plain.v.card.params), plain.v.card.description).lastInsertRowid);
      const { card } = await doCard(db, id, OPERATOR, { querier: { query: async () => ({}) } as never, exec: (async () => ({ code: 0, stdout: "", stderr: "" })) as never });
      assert.equal(card.state, "done", card.error ?? "");
      assert.equal(getDecision(db, "app#5:scope")!.answer, "take");
      assert.equal(w.rows("SELECT id FROM preapprovals WHERE number = 5").length, 1);
      assert.equal(w.rows("SELECT instructions FROM operator_fixups WHERE number = 5").length, 1);
    } finally { w.close(); }
  });
});
