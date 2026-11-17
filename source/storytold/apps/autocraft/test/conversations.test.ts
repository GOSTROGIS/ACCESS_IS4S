// Opus conversations: the prompt keeps a stable start across turns, card validation, Do it runs once through fake writers,
// and viewers read but cannot write. Model calls go to a fake runner; GitHub to a fake querier.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { describe, test } from "node:test";
import { useTestAccount } from "./accounts-fixture.ts";
import { SCRATCH } from "./scratch.ts";
import { setCommentApproval } from "../src/act/approval.ts";
import { setApproval as setLabelApproval } from "../src/labels/approval.ts";
import { setRunner } from "../src/classify/run.ts";
import { applicableSteps, cleanComment, headline, parseReply } from "../src/conversations/cards.ts";
import { doCard } from "../src/conversations/act.ts";
import { addOperatorMessage, ensureConversation, insertTurn, staleOf, turnsOf } from "../src/conversations/store.ts";
import { answerPending } from "../src/conversations/run.ts";
import { connect } from "../src/db.ts";
import { ask, getDecision } from "../src/decisions.ts";
import { cleanReason } from "../src/act/templates.ts";
import { commentPreview } from "../src/act/index.ts";
import { apiRoutes } from "../src/dash/api/index.ts";
import * as conv from "../src/dash/api/conversations.ts";
import { HttpError } from "../src/dash/server/util.ts";
import type { Req } from "../src/dash/types.ts";

mkdirSync(SCRATCH, { recursive: true });
const quiet = () => {};
const T0 = "2026-01-01T00:00:00Z";

function fresh(): DatabaseSync {
  const db = connect(join(mkdtempSync(join(SCRATCH, "conv-test-")), "t.db"));
  db.prepare("INSERT OR IGNORE INTO tracked_repos (name, added_by, added_at, pipeline) VALUES ('app', 'op', ?, 1)").run(T0);
  db.prepare("INSERT INTO repos (name, visibility) VALUES ('app', 'public')").run();
  useTestAccount(db);
  const item = db.prepare(`INSERT INTO items (repo, number, kind, state, title, body, author, head_oid, created_at, updated_at, labels) VALUES ('app', ?, ?, 'OPEN', ?, 'Body text', 'someone', ?, '${T0}', '${T0}', '[]')`);
  item.run(1, "issue", "Issue 1", null);
  item.run(2, "pr", "PR 2", "sha2");
  item.run(3, "issue", "Issue 3", null);
  ask(db, [{ id: "app#1:scope", kind: "scope", repo: "app", number: 1, question: "Scope?", options: [{ key: "take", label: "Wanted" }, { key: "close", label: "Out of scope" }] }]);
  setCommentApproval(db, "op", "app", true);
  return db;
}

/** Answers every call with the next reply and records the prompts sent. */
function fakeModel(replies: string[], prompts: string[] = [], during?: () => Promise<void>) {
  let k = 0;
  const restore = setRunner(async (_cmd, _args, input) => {
    prompts.push(input);
    await during?.();
    return { code: 0, stdout: JSON.stringify({ type: "result", result: replies[Math.min(k++, replies.length - 1)], usage: { input_tokens: 10, output_tokens: 5 } }), stderr: "" };
  });
  return { prompts, restore };
}

const answerAll = (db: DatabaseSync) => answerPending(db, { checkout: async () => null, usageRun: "conv-test", log: quiet });

describe("conversation prompt", () => {

});

describe("turn order and claims", () => {



});

describe("cards", () => {
  test("comment text loses entities that hide mentions, HTML, images and links", () => {
    assert.equal(cleanComment("Thanks &#64;bob and &commat;amy and &amp;#x40;cy"), "Thanks bob and amy and cy");
    assert.equal(cleanComment("See [the docs](https://x.test/a) <b>now</b> ![img](https://x.test/i.png) https://y.test/z"), "See the docs now");
    assert.equal(cleanComment("Line one\n\n\n\nLine two @team"), "Line one\n\nLine two team");
  });






  test("invalid resolutions are dropped with a note and valid ones get lines from the parameters", () => {
    const db = fresh();
    const R = (steps: unknown[], settle: unknown, extra: Record<string, unknown> = {}) => ({ kind: "resolution", steps, settle, ...extra });
    const reply = `Text.\n\`\`\`actions\n${JSON.stringify([
      { kind: "delete-everything" },
      { kind: "comment", text: "an old kind" },
      R([], { kind: "answer", option: "nope" }),
      R([{ kind: "label", label: "my own label" }], { kind: "backlog" }),
      R([{ kind: "label", label: "Plugin Candidate" }], { kind: "answer", option: "take" }),
      R([{ kind: "duplicate", of: 1 }], null),
      R([{ kind: "duplicate", of: 3 }], null),
      R([{ kind: "duplicate", of: 99 }], null),
      R([{ kind: "close", reason: "completed" }, { kind: "comment" }], null, { text: "Done." }),
      R([{ kind: "comment" }, { kind: "comment" }], { kind: "backlog" }, { text: "Twice." }),
      R([{ kind: "comment" }], { kind: "answer", option: "close" }, { text: "Closing." }),
      R([{ kind: "comment" }], { kind: "backlog" }, { text: "Thanks @bob, see the pack." }),
      R([{ kind: "comment" }], { kind: "answer", option: "take" }, { text: "Same option again." }),
      R([{ kind: "comment" }], { kind: "backlog" }, { text: "" }),
      R([{ kind: "label", label: "bugfix" }], null),
      R([{ kind: "comment" }], null, { text: "Which version?" }),
      R([{ kind: "comment" }], null, { text: "Second question?" }),
    ])}\n\`\`\``;
    const p = parseReply(db, "app", 1, reply)!;
    const kinds = p.cards.map((c) => JSON.stringify(c.params.kind === "resolution" ? [c.params.steps.map((x) => x.kind), c.params.settle?.kind ?? null] : null));
    assert.deepEqual(kinds, [
      '[["label"],"answer"]', '[["duplicate"],"handled"]', '[["comment"],"backlog"]', '[["comment"],null]',
    ]);
    assert.equal(p.notes.length, 13);
    assert.equal(p.cards[0]!.description, 'On app#1: Add the label "plugin candidate"; Answers the scope question with "Wanted"');
    assert.equal(p.cards[2]!.text, "Thanks bob, see the pack.");
    assert.equal(parseReply(db, "app", 1, "```actions\n[]\n```"), null, "no text, no reply");
    assert.equal(parseReply(db, "app", 1, "Hi\n```actions\nnot json\n```")!.notes.length, 1);
    // No open decision: a settle is refused and steps alone are fine.
    const none = parseReply(db, "app", 3, `Hi\n\`\`\`actions\n${JSON.stringify([R([{ kind: "label", label: "bugfix" }], null), R([], { kind: "backlog" })])}\n\`\`\``)!;
    assert.equal(none.cards.length, 1);
    assert.equal(none.notes.length, 1);
  });

  test("a quiet pull request gets no card that posts model-written text", () => {
    const db = fresh();
    const R = (steps: unknown[], settle: unknown, extra: object = {}) => ({ kind: "resolution", steps, settle, ...extra });
    const reply = `Review found an unrelated defect.\n\`\`\`actions\n${JSON.stringify([
      R([{ kind: "label", label: "bugfix" }], null),
      R([{ kind: "open_issue", repo: "app", title: "Follow up", body: "details" }], null),
      R([{ kind: "comment" }], null, { text: "Which version?" }),
    ])}\n\`\`\``;
    assert.deepEqual(parseReply(db, "app", 2, reply)!.cards.map((c) => c.params.kind === "resolution" ? c.params.steps.map((x) => x.kind).join() : ""), ["label", "open_issue"]);
    db.prepare("INSERT INTO security_scans (id, repo, state, started_by, started_at) VALUES (900, 'app', 'done', 'op', ?)").run(T0);
    db.prepare(`INSERT INTO security_findings (repo, number, scan_id, area, title, severity, urgent, state, refs, reach, impact, fingerprint, fix_pr, created_at, updated_at)
      VALUES ('app', 900, 900, 'a', 't', 'high', 0, 'landing', '[]', 'r', 'i', 'fp900', 2, ?, ?)`).run(T0, T0);
    const p = parseReply(db, "app", 2, reply)!;
    assert.deepEqual(p.cards.map((c) => c.params.kind === "resolution" ? c.params.steps.map((x) => x.kind).join() : ""), ["label"]);
    assert.equal(p.notes.length, 2);
    assert.ok(!applicableSteps(db, "app", 2).some((k) => k === "comment" || k === "open_issue" || k === "transfer"));
  });
});

describe("new step kinds", () => {
  const R = (steps: unknown[], settle: unknown = null, extra: Record<string, unknown> = {}) => ({ kind: "resolution", steps, settle, ...extra });
  const issue = { kind: "open_issue", repo: "lib", title: "Follow up", body: "Check the edge case." };
  const run = (db: DatabaseSync, n: number, cards: unknown[]) => parseReply(db, "app", n, `Text.\n\`\`\`actions\n${JSON.stringify(cards)}\n\`\`\``)!;

  test("transfer is for issues and last, an answer that writes takes open_issue but not a comment, fixup that merges needs a merge or scope decision", async () => {
    const db = fresh();
    db.prepare("INSERT INTO tracked_repos (name, added_by, added_at, pipeline) VALUES ('lib', 'op', ?, 1)").run(T0);
    ask(db, [{ id: "app#2:merge", kind: "merge", repo: "app", number: 2, question: "Merge?", options: [{ key: "merge", label: "Merge" }, { key: "hold", label: "Hold" }] }]);
    const p1 = run(db, 3, [
      R([{ kind: "transfer", to: "lib" }]),
      R([{ kind: "transfer", to: "lib" }, { kind: "comment" }], null, { text: "Moved." }),
      R([{ kind: "transfer", to: "app" }]),
      R([{ kind: "comment" }, { kind: "transfer", to: "lib" }], null, { text: "Moving it." }),
      R([{ kind: "open_issue", repo: "nowhere", title: "x", body: "y" }]),
      R([{ kind: "review" }]),
    ]);
    assert.deepEqual(p1.cards.map((c) => c.params.kind === "resolution" ? c.params.steps.map((x) => x.kind).join("+") : ""), ["transfer", "comment+transfer"]);
    assert.equal(p1.notes.length, 4);
    // Issue 1 has the scope decision "close", which writes to GitHub.
    const p2 = run(db, 1, [
      R([issue], { kind: "answer", option: "close" }),
      R([{ kind: "comment" }, issue], { kind: "answer", option: "close" }, { text: "Closing." }),
    ]);
    assert.equal(p2.cards.length, 1);
    assert.equal(p2.cards[0]!.description.includes('Open an issue in lib: "Follow up"'), true);
    const fix = (merge: boolean) => ({ kind: "fixup", instructions: "Rename the helper.", merge });
    const p3 = run(db, 2, [R([fix(true)]), R([fix(false)], { kind: "answer", option: "hold" })]);
    assert.equal(p3.cards.length, 1, "the answer settle is refused with a fixup");
    assert.equal(p3.cards[0]!.params.kind === "resolution" && p3.cards[0]!.params.settle?.kind, "handled");
    assert.equal(run(db, 3, [R([fix(true)])]).cards.length, 0, "an issue has no fix-up");
    const st3 = applicableSteps(db, "app", 3), st2 = applicableSteps(db, "app", 2);
    assert.ok(st3.includes("transfer") && !st3.includes("fixup") && !st3.includes("request_reviewers"));
    assert.ok(st2.includes("fixup with merge") && !st2.includes("transfer") && !st3.includes("fixup with merge"));
    await ensureConversation(db, "app", 3, "op");
    db.prepare("UPDATE items SET state = 'CLOSED' WHERE repo = 'app' AND number = 3").run();
    await addOperatorMessage(db, "app", 3, "op", "Reopen it?", undefined, false);
    assert.ok(turnsOf(db, "app", 3).at(-1)!.block.includes("<steps>[") && applicableSteps(db, "app", 3).includes("reopen"));
    const none = run(db, 2, [R([{ kind: "fixup", instructions: "x", merge: true }, { kind: "request_reviewers", logins: ["someone"] }])]);
    assert.equal(none.cards.length, 0);
  });
});

describe("Do it", () => {
  test("a close card comments, closes with the state reason and answers the item's open decision as handled", async () => {
    const db = fresh();
    const sent: { q: string; v: Record<string, unknown> }[] = [];
    const querier = { query: async (q: string, v: Record<string, unknown> = {}) => {
      sent.push({ q, v });
      return q.includes("issueOrPullRequest") ? { repository: { issueOrPullRequest: { __typename: "Issue", id: "I_1", state: "OPEN" } } } : {};
    } };
    const params = JSON.stringify({ kind: "close", reason: "completed", pr: false });
    const id = Number(db.prepare("INSERT INTO conversation_cards (turn_id, repo, number, kind, params, text, description) VALUES (0, 'app', 1, 'close', ?, 'Done in an earlier PR.', 'x')").run(params).lastInsertRowid);
    const { card } = await doCard(db, id, "op", { querier: querier as never });
    assert.equal(card.state, "done", card.error ?? "");
    assert.ok(sent.some((x) => x.q.includes("closeIssue") && x.v.reason === "COMPLETED"));
    const d = db.prepare("SELECT answer, applied_at FROM decisions WHERE id = 'app#1:scope'").get() as { answer: string; applied_at: string | null };
    assert.equal(d.answer, "handled");
    assert.ok(d.applied_at);
  });

  const resolution = (db: DatabaseSync, steps: unknown[], settle: unknown, text: string | null) => {
    const p = parseReply(db, "app", 1, `Text.\n\`\`\`actions\n${JSON.stringify([{ kind: "resolution", steps, settle, ...(text && { text }) }])}\n\`\`\``)!;
    assert.equal(p.cards.length, 1, p.notes.join("; "));
    return Number(db.prepare("INSERT INTO conversation_cards (turn_id, repo, number, kind, params, text, description) VALUES (0, 'app', 1, 'resolution', ?, ?, ?)")
      .run(JSON.stringify(p.cards[0]!.params), p.cards[0]!.text, p.cards[0]!.description).lastInsertRowid);
  };
  const github = (failLabel: boolean) => {
    const sent: string[] = [];
    const querier = { query: async (q: string) => {
      sent.push(q.includes("addComment") ? "comment" : q.includes("addLabelsToLabelable") ? "label" : q.includes("issueOrPullRequest") ? "read" : "other");
      if (q.includes("issueOrPullRequest")) return { repository: { issueOrPullRequest: { __typename: "Issue", id: "I_1", state: "OPEN" } } };
      if (q.includes("addComment")) return { addComment: { commentEdge: { node: { url: "https://x.test/c" } } } };
      if (q.includes("repository(")) return { repository: { id: "R_1", l0: { id: "L_1", name: "bugfix" }, l1: null } };
      if (failLabel) throw new Error("label add failed");
      return { m0: { clientMutationId: null } };
    } };
    return { sent, querier };
  };

  test("a card answering Out of scope with a reason makes the close comment carry it", async () => {
    const db = fresh();
    const { querier } = github(false);
    const id = resolution(db, [], { kind: "answer", option: "close", reason: "The reference app does not do this, so it stays out. See https://x.test/a @bob" }, null);
    const card = await doCard(db, id, "op", { querier: querier as never });
    assert.equal(card.card.state, "done", card.card.error ?? "");
    const comment = commentPreview(getDecision(db, "app#1:scope")!)!;
    assert.match(comment, /out of scope/);
    assert.match(comment, /Reason: The reference app does not do this, so it stays out\. See bob\./);
    assert.doesNotMatch(comment, /@|https/);
  });

  test("a transfer needs the comment approval of the target repository too", async () => {
    const db = fresh();
    db.prepare("INSERT INTO tracked_repos (name, added_by, added_at, pipeline) VALUES ('lib', 'op', ?, 1)").run(T0);
    const sent: string[] = [];
    const querier = { query: async (q: string) => {
      if (q.includes("issueOrPullRequest")) return { repository: { issueOrPullRequest: { __typename: "Issue", id: "I_1", state: "OPEN" } } };
      sent.push(q.includes("transferIssue") ? "transfer" : "other");
      return q.includes("transferIssue") ? { transferIssue: { issue: { url: "https://x.test/lib/1" } } } : { repository: { id: "R_lib" } };
    } };
    const first = await doCard(db, resolution(db, [{ kind: "transfer", to: "storytold/lib" }], null, null), "op", { querier: querier as never });
    assert.equal(first.card.state, "failed");
    assert.match(first.card.error ?? "", /lib/);
    assert.equal(sent.includes("transfer"), false);
    setCommentApproval(db, "op", "lib", true);
    const second = await doCard(db, resolution(db, [{ kind: "transfer", to: "lib" }], null, null), "op", { querier: querier as never });
    assert.equal(second.card.state, "done", second.card.error ?? "");
    assert.ok(sent.includes("transfer"));
  });

  test("a resolution runs its steps in order, then answers the decision with the operator's login; a failing step leaves it open", async () => {
    const ok = fresh();
    setLabelApproval(ok, "op", "app", true);
    const g = github(false);
    const id = resolution(ok, [{ kind: "comment" }, { kind: "label", label: "bugfix" }], { kind: "answer", option: "take" }, "Thanks.");
    const { card } = await doCard(ok, id, "op", { querier: g.querier as never });
    assert.equal(card.state, "done", card.error ?? "");
    assert.deepEqual(g.sent.filter((x) => x === "comment" || x === "label"), ["comment", "label"]);
    const d = ok.prepare("SELECT answer, answered_by FROM decisions WHERE id = 'app#1:scope'").get() as { answer: string; answered_by: string };
    assert.deepEqual({ ...d }, { answer: "take", answered_by: "op" });

    const bad = fresh();
    setLabelApproval(bad, "op", "app", true);
    const b = github(true);
    const failed = (await doCard(bad, resolution(bad, [{ kind: "comment" }, { kind: "label", label: "bugfix" }], { kind: "answer", option: "take" }, "Thanks."), "op", { querier: b.querier as never })).card;
    assert.equal(failed.state, "failed");
    assert.match(failed.error ?? "", /Already done: Post the comment below/);
    assert.equal(bad.prepare("SELECT answer FROM decisions WHERE id = 'app#1:scope'").get()!.answer, null);
  });

  /** Stores an Opus turn with one proposed card (as a reply would) and returns the card's id. */
  const propose = async (db: DatabaseSync, n: number, steps: unknown[], settle: unknown, text: string | null) => {
    await ensureConversation(db, "app", n, "op");
    const p = parseReply(db, "app", n, `Text.\n\`\`\`actions\n${JSON.stringify([{ kind: "resolution", steps, settle, ...(text && { text }) }])}\n\`\`\``)!;
    assert.equal(p.cards.length, 1, p.notes.join("; "));
    const turn = insertTurn(db, "app", n, { kind: "opus", login: "opus", body: "Text.", block: "x", cards: p.cards });
    return Number(db.prepare("SELECT id FROM conversation_cards WHERE turn_id = ?").get(turn)!.id);
  };

  test("skipped steps do not run, a card with nothing left is refused, a later reply replaces drafts and a PR change blocks them", async () => {
    const db = fresh();
    setLabelApproval(db, "op", "app", true);
    const g = github(false);
    const a = await propose(db, 1, [{ kind: "comment" }, { kind: "label", label: "bugfix" }], { kind: "answer", option: "take" }, "Thanks.");
    const done = (await doCard(db, a, "op", { querier: g.querier as never, skip: [0], note: "Because of the pack" })).card;
    assert.equal(done.state, "done", done.error ?? "");
    assert.deepEqual(g.sent.filter((x) => x === "comment" || x === "label"), ["label"]);
    assert.match(done.result ?? "", /skipped: Post the comment below/);
    const dec = db.prepare("SELECT answer, answer_note FROM decisions WHERE id = 'app#1:scope'").get() as { answer: string; answer_note: string };
    assert.deepEqual({ ...dec }, { answer: "take", answer_note: "Because of the pack" });
    assert.ok((db.prepare("SELECT body FROM conversation_turns WHERE kind = 'system' AND number = 1 ORDER BY id DESC LIMIT 1").get() as { body: string }).body.endsWith("Note: Because of the pack"));

    const ask = await propose(db, 3, [{ kind: "comment" }], null, "Which version?");
    await assert.rejects(() => doCard(db, ask, "op", { skip: [0] }), /no steps left/);
    await assert.rejects(() => doCard(db, ask, "op", { skip: [5] }), /step positions/);
    // A later Opus turn replaces the proposed draft.
    await propose(db, 3, [{ kind: "comment" }], null, "Which OS?");
    await assert.rejects(() => doCard(db, ask, "op"), /replaced by a later reply/);
    assert.equal(db.prepare("SELECT state FROM conversation_cards WHERE id = ?").get(ask)!.state, "replaced");

    // After a push a card that does not rest on the code still runs; one with a drafted comment is refused.
    const light = await propose(db, 2, [{ kind: "label", label: "bugfix" }], null, null);
    db.prepare("UPDATE items SET head_oid = 'sha3' WHERE number = 2").run();
    assert.equal((await doCard(db, light, "op", { querier: g.querier as never })).card.state, "done");
    const pr = await propose(db, 2, [{ kind: "comment" }], null, "Thanks.");
    db.prepare("UPDATE items SET head_oid = 'sha4' WHERE number = 2").run();
    await assert.rejects(() => doCard(db, pr, "op", { querier: g.querier as never }), /PR changed since/);
    assert.equal(conv.cardView(db, db.prepare("SELECT * FROM conversation_cards WHERE id = ?").get(pr) as never).stale, "pr-changed");
  });

  test("a message with ask false is stored without a pending state and queues no Opus reply", async () => {
    const db = fresh();
    await conv.postMessage(db, req("operator", { repo: "app", n: "3" }, { text: "Note for later", ask: false }));
    const row = db.prepare("SELECT status, seq FROM conversation_turns WHERE repo = 'app' AND number = 3").get() as { status: string | null; seq: number | null };
    assert.equal(row.status, null);
    assert.ok(row.seq);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM conversation_turns WHERE status = 'pending'").get()!.n, 0);
    // A shared maintainer post rides in the next asked turn once.
    db.prepare("INSERT INTO decision_comments (id, decision_id, login, at, body) VALUES ('c1', 'app#1:scope', 'maint', ?, 'I think it is fine @x')").run(T0);
    await conv.postInclude(db, req("operator", { repo: "app", n: "1" }, { source: "decision-comment:c1", on: true }));
    await conv.postMessage(db, req("operator", { repo: "app", n: "1" }, { text: "Look at this" }));
    const blocks = db.prepare("SELECT block FROM conversation_turns WHERE repo = 'app' AND number = 1 AND kind = 'operator'").all() as { block: string }[];
    assert.equal(blocks.filter((b) => b.block.includes('<included from="maintainer" login="maint"') && b.block.includes("I think it is fine ")).length, 1);
    assert.ok(!blocks[0]!.block.includes("@x"));
    // A source from another item's decision is refused.
    db.prepare("INSERT INTO decisions (id, kind, repo, number, question, options, asked_at) VALUES ('app#3:scope', 'scope', 'app', 3, 'Scope?', '[]', ?)").run(T0);
    db.prepare("INSERT INTO decision_comments (id, decision_id, login, at, body) VALUES ('c3', 'app#3:scope', 'maint', ?, 'Other item')").run(T0);
    await assert.rejects(() => conv.postInclude(db, req("operator", { repo: "app", n: "1" }, { source: "decision-comment:c3", on: true })), (e) => e instanceof HttpError && e.status === 400);
    // The next asked message carries nothing again.
    db.prepare("UPDATE conversation_turns SET status = 'answered' WHERE repo = 'app' AND number = 1").run();
    await conv.postMessage(db, req("operator", { repo: "app", n: "1" }, { text: "And now?" }));
    const last = db.prepare("SELECT block FROM conversation_turns WHERE repo = 'app' AND number = 1 AND kind = 'operator' ORDER BY id DESC LIMIT 1").get() as { block: string };
    assert.ok(last.block.includes("And now?") && !last.block.includes("<included"));
    await assert.rejects(() => conv.postInclude(db, req("operator", { repo: "app", n: "1" }, { source: "decision-comment:c1", on: false })), (e) => e instanceof HttpError && e.status === 409);
    // A question can follow at once.
    await conv.postMessage(db, req("operator", { repo: "app", n: "3" }, { text: "What do you think?" }));
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM conversation_turns WHERE status = 'pending' AND number = 3").get()!.n, 1);
  });
});

function req(role: "operator" | "viewer", params: Record<string, string>, json?: unknown): Req {
  return { method: "POST", path: "", params, query: new URLSearchParams(), form: new URLSearchParams(), json, csrf: "", nonce: "",
    user: { login: role === "operator" ? "op" : "view", role, canWrite: async () => role === "operator", canRead: async () => true } };
}

describe("access", () => {
  test("a viewer reads the conversation and cannot write; chat routes are operator-only", async () => {
    const db = fresh();
    const { restore } = fakeModel(["Reply.\n```choices\n{\"pick\":{\"core\":null,\"reason\":null},\"ask\":{\"text\":\"Which version do you run?\"}}\n```"]);
    try {
      await conv.postMessage(db, req("operator", { repo: "app", n: "1" }, { text: "Hi" }));
      await answerAll(db);
    } finally {
      restore();
    }
    const view = await conv.getConversation(db, req("viewer", { repo: "app", n: "1" }));
    assert.equal(view.exists, true);
    assert.deepEqual(view.turns.map((t) => t.login), ["op", "opus"]);
    assert.equal(view.turns[1]!.actions[0]!.state, "proposed");
    const cardId = String(view.turns[1]!.actions[0]!.id);
    for (const f of [
      () => conv.postMessage(db, req("viewer", { repo: "app", n: "1" }, { text: "Hi" })),
      () => conv.doIt(db, req("viewer", { id: cardId })),
      () => conv.dismiss(db, req("viewer", { id: cardId })),
      () => conv.editCardText(db, req("viewer", { id: cardId }, { text: "x" })),
    ]) await assert.rejects(f, (e) => e instanceof HttpError && e.status === 403);
    assert.equal(db.prepare("SELECT state FROM conversation_cards").get()!.state, "proposed");
    const writes = apiRoutes().filter((r) => r.method === "POST" && /conversation/.test(r.pattern));
    assert.equal(writes.length, 7);
    // Chat is operator-only; the card routes check who may settle in the handler (refused for the viewer above).
    assert.deepEqual(writes.filter((r) => r.operator === true).map((r) => r.pattern).sort(), ["/api/conversations/:repo/:n/includes", "/api/conversations/:repo/:n/messages"]);
    // A second message while Opus has not answered the first is refused.
    await conv.postMessage(db, req("operator", { repo: "app", n: "1" }, { text: "More" }));
    await assert.rejects(() => conv.postMessage(db, req("operator", { repo: "app", n: "1" }, { text: "Again" })), (e) => e instanceof HttpError && e.status === 409);
  });
});

describe("Opus starts a conversation", () => {
});

describe("stale cards", () => {
  test("review bots and our own note-line posts do not make a card stale; a person's comment does", () => {
    const db = fresh();
    const add = (id: string, at: string, author: string, body: string) =>
      db.prepare("INSERT INTO comments (repo, number, id, kind, author, created_at, body) VALUES ('app', 1, ?, 'comment', ?, ?, ?)").run(id, author, at, body);
    add("c1", "2026-01-02T00:00:00Z", "alice", "first");
    const seen = JSON.stringify({ head: null, last_comment: "c1" });
    assert.equal(staleOf(db, "app", 1, seen), undefined);
    add("c2", "2026-01-02T01:00:00Z", "coderabbitai", "review summary");
    add("c3", "2026-01-02T02:00:00Z", "alice", "_AI-generated review (Opus). Not a maintainer decision._\n\nLooks fine");
    add("c4", "2026-01-02T03:00:00Z", "alice", "_Automated message. Not a maintainer decision._\n\nHello");
    assert.equal(staleOf(db, "app", 1, seen), undefined);
    add("c5", "2026-01-02T04:00:00Z", "bob", "what about X?");
    assert.equal(staleOf(db, "app", 1, seen), "new-comments");
  });
});

describe("cleanReason", () => {
  test("cuts at a sentence end or a word boundary, never inside a word", () => {
    const long = "The change reworks the fonts toast and a Save As filename field in ways nobody asked for. It also touches the layout of the panel and renames several unrelated helper functions across the code base without tests";
    const a = cleanReason(long)!;
    assert.equal(a, "The change reworks the fonts toast and a Save As filename field in ways nobody asked for.");
    const b = cleanReason(long.replace(/\. /, ", "))!;
    assert.ok(b.length <= 200 && b.endsWith("…"), b);
    assert.ok(long.replace(/\. /, ", ").includes(b.slice(0, -1)));
    assert.match(long, new RegExp(`${b.slice(0, -1).split(" ").pop()}\\b`));
    assert.equal(cleanReason("short one"), "short one.");
  });
});

describe("card headline", () => {
  test("names the action with its key parameter", () => {
    const db = connect(":memory:");
    const res = (steps: import("../src/conversations/cards.ts").Step[]) => ({ kind: "resolution" as const, steps, settle: null });
    assert.equal(headline(db, res([{ kind: "close", reason: "completed", pr: false }])), "Close issue as completed");
    assert.equal(headline(db, res([{ kind: "close", reason: "not_planned", pr: false }])), "Close issue as not planned");
    assert.equal(headline(db, res([{ kind: "close", reason: "completed", pr: true }])), "Close PR");
    assert.equal(headline(db, res([{ kind: "duplicate", of: 12 }])), "Close as duplicate of #12");
    assert.equal(headline(db, res([{ kind: "transfer", to: "storytold/x" }])), "Move issue to storytold/x");
  });
});
