import assert from "node:assert/strict";
import { test } from "node:test";
import { insertRun, finishRun } from "../src/agents/runs.ts";
import { saveTools } from "../src/agents/tools.ts";
import { connect } from "../src/db.ts";
import { syncActivity } from "../src/activity.ts";
import { trace, traceDetail } from "../src/dash/api/trace.ts";
import type { Req } from "../src/dash/types.ts";
import type { ItemTrace } from "../web/src/api/types.ts";

const req = (n: number, query: Record<string, string> = {}, extra: Record<string, string> = {}): Req => ({
  method: "GET", path: "", params: { repo: "photocraft", n: String(n) }, query: new URLSearchParams({ ...query, ...extra }), form: new URLSearchParams(), user: { login: "op", role: "operator", canWrite: async () => true, canRead: async () => true },
  csrf: "", nonce: "",
});
const full = async (db: ReturnType<typeof connect>, q: Record<string, string> = {}) => (await trace(db, req(7, q))) as ItemTrace;

test("the trace lists every source of an item oldest first, with heads, a cursor and a since check", async () => {
  const db = connect(":memory:");
  const H1 = "a".repeat(40), H2 = "b".repeat(40);
  db.prepare("INSERT INTO items (repo, number, kind, state, author, created_at, head_oid, assignees) VALUES ('photocraft', 7, 'pr', 'OPEN', 'dev', '2026-01-01T00:00:00Z', ?, '[\"bot\"]')").run(H2);
  db.prepare("INSERT INTO settings (key, value) VALUES ('pipeline_login', 'bot')").run();
  db.prepare("INSERT INTO comments (repo, number, id, kind, author, created_at, body, commit_oid) VALUES ('photocraft', 7, 'c1', 'comment', 'dev', '2026-01-01T01:00:00Z', 'please look', NULL)").run();
  db.prepare("INSERT INTO plan_history (repo, number, head, old_state, new_state, wait, reasons, at) VALUES ('photocraft', 7, ?, 'reviewing', 'verifying', 'CI', '[]', '2026-01-01T02:00:00Z')").run(H1);
  const run = insertRun(db, { jobId: null, step: "opus-review", stage: 5, promptId: "p", promptVersion: "1", provider: "claude", model: "opus", accountId: null, items: [{ repo: "photocraft", number: 7 }], prompt: "secret prompt" });
  db.prepare("UPDATE agent_runs SET started_at = '2026-01-01T03:00:00Z'").run();
  saveTools(db, run, [{ type: "assistant", message: { content: [{ type: "tool_use", id: "a", name: "Read", input: { file_path: "x" } }] } }]);
  finishRun(db, run, { state: "done", output: "o", costUsd: 0.5 });
  db.prepare("INSERT INTO opus_review_history (repo, number, head_oid, at, model, mode, verdict, sure, reason) VALUES ('photocraft', 7, ?, '2026-01-01T04:00:00Z', 'opus', 'full', 'hold', 1, 'why')").run(H1);
  db.prepare("INSERT INTO opus_review_history (repo, number, head_oid, at, model, mode, verdict, sure, reason) VALUES ('photocraft', 7, ?, '2026-01-01T05:00:00Z', 'opus', 'delta', 'take', 1, 'fine')").run(H2);
  db.prepare("INSERT INTO audit (at, login, action, target, details) VALUES ('2026-01-01T06:00:00Z', 'bot', 'review-post', 'photocraft#7', ?)").run(JSON.stringify({ head: H2, state: "done", text: "long posted text" }));

  const asked: unknown[] = [];
  const client = {
    spent: 0, remaining: 4000,
    async query(_q: string, v: object) {
      asked.push(v);
      return { repository: { issueOrPullRequest: {
        __typename: "PullRequest", headRefOid: H2,
        files: { nodes: [{ path: "src/a.rs", additions: 3, deletions: 1, changeType: "MODIFIED" }] },
        commits: { nodes: [{ commit: { oid: H1, committedDate: "2026-01-01T00:30:00Z", author: { user: { login: "dev" } } } }] },
        prTimeline: { nodes: [{ __typename: "LabeledEvent", id: "L1", createdAt: "2026-01-01T00:45:00Z", actor: { login: "maint" }, label: { name: "bug" } }] },
      } } };
    },
  };
  assert.equal(await syncActivity(db, client), 1);
  assert.equal(await syncActivity(db, client), 0, "an item whose head and update time are unchanged is not read again");
  assert.deepEqual(asked, [{ owner: "storytold", name: "photocraft", number: 7 }]);

  const t = await full(db);
  assert.deepEqual(t.events.map((e) => e.id.replace(/:\d+$/, "")), ["gh:opened", `commit:${H1}`, "activity:L1", "comment:c1", "plan", "run", "review:opus", "review:opus", "audit"]);
  assert.deepEqual(t.events.filter((e) => e.id.startsWith("activity") || e.id.startsWith("commit")).map((e) => e.summary), ["Pushed commit aaaaaaa", "Added label bug"]);
  assert.deepEqual(db.prepare("SELECT path FROM pr_files WHERE repo = 'photocraft' AND number = 7 AND head = ?").all(H2).map((r) => r.path), ["src/a.rs"]);
  assert.deepEqual(t.events.slice(-5).map((e) => e.head), [H1, H1, H1, H2, H2], "a model call takes the head current at its time");
  const call = t.events.find((e) => e.kind === "model-call")!;
  assert.equal(call.call?.toolCalls, 1);
  assert.equal(call.call?.costUsd, 0.5);
  assert.equal(call.ref.runId, run);
  assert.ok(!JSON.stringify(t).includes("long posted text") && !JSON.stringify(t).includes("secret prompt"), "no bodies in the list");
  assert.equal(t.header.now.state, null);
  assert.deepEqual(t.header.who.assignees, ["bot"]);
  assert.equal(t.header.who.autocraftAssigned, true);

  const p1 = await full(db, { limit: "3" });
  assert.equal(p1.events.length, 3);
  const p2 = await full(db, { limit: "3", cursor: p1.nextCursor! });
  assert.deepEqual([...p1.events, ...p2.events.slice(0, 3)].map((e) => e.id), t.events.slice(0, 6).map((e) => e.id));
  assert.equal((await full(db, { limit: "3", cursor: (await full(db, { limit: "6" })).nextCursor! })).nextCursor, null);

  assert.deepEqual((await full(db, { kinds: "write,decision" })).events.map((e) => e.kind), ["write"]);
  assert.ok((await full(db, { autocraftOnly: "1" })).events.every((e) => e.actor.type !== "person"));
  assert.deepEqual(await trace(db, req(7, { since: t.stamp })), { unchanged: true, stamp: t.stamp });
  db.prepare("INSERT INTO comments (repo, number, id, kind, author, created_at, body) VALUES ('photocraft', 7, 'c2', 'comment', 'dev', '2026-01-02T00:00:00Z', 'x')").run();
  assert.notEqual((await trace(db, req(7, { since: t.stamp }))).stamp, t.stamp);

  const d = await traceDetail(db, req(7, { id: `review:opus:${(db.prepare("SELECT rowid FROM opus_review_history WHERE verdict = 'hold'").get() as { rowid: number }).rowid}` }));
  assert.equal(d.fields.reason, "why");
  const w = await traceDetail(db, req(7, { id: t.events[t.events.length - 1]!.id }));
  assert.equal(w.fields.textLength, 16);
});

test("a viewer gets no staff-only post-merge fields and only the GitHub writes of the audit", async () => {
  const db = connect(":memory:");
  db.prepare("INSERT INTO items (repo, number, kind, state, created_at) VALUES ('photocraft', 7, 'pr', 'MERGED', '2026-01-01T00:00:00Z')").run();
  db.prepare("INSERT INTO postmerge_reviews (repo, number, merge_sha, at, model, findings) VALUES ('photocraft', 7, ?, '2026-01-02T00:00:00Z', 'opus', ?)")
    .run("c".repeat(40), JSON.stringify([{ severity: "major", title: "t", body: "b", missed_by: "review", missed_why: "secret reason" }]));
  db.prepare("INSERT INTO audit (at, login, action, target, details) VALUES ('2026-01-02T01:00:00Z', 'bot', 'review-post', 'photocraft#7', '{\"state\":\"done\",\"text\":\"posted\"}')").run();
  db.prepare("INSERT INTO audit (at, login, action, target, details) VALUES ('2026-01-02T02:00:00Z', 'someone', 'answer', 'photocraft#7', '{}')").run();
  db.prepare("INSERT INTO audit (at, login, action, target, details) VALUES ('2026-01-02T03:00:00Z', 'admin', 'access-add', 'photocraft#7', '{}')").run();
  const as = (role: "viewer" | "maintainer" | "operator"): Req => ({ ...req(7, { id: `review:postmerge:${"c".repeat(40)}` }), user: { login: "u", role, canWrite: async () => true, canRead: async () => true } });
  const writesOf = async (role: "viewer" | "maintainer" | "operator") => ((await trace(db, { ...as(role), query: new URLSearchParams({ kinds: "write" }) })) as ItemTrace).events;
  assert.equal(((await traceDetail(db, as("viewer"))).fields.findings as Record<string, unknown>[])[0]!.missed_why, undefined);
  assert.equal(((await traceDetail(db, as("maintainer"))).fields.findings as Record<string, unknown>[])[0]!.missed_why, "secret reason");
  const v = await writesOf("viewer");
  assert.deepEqual(v.map((e) => [e.summary, e.actor.name]), [["Posted review", "AutoCraft"]]);
  assert.equal((await writesOf("maintainer")).length, 2, "a maintainer also sees the dashboard answer, not the operator-only access change");
  assert.equal((await writesOf("operator")).length, 3);
  db.prepare("INSERT INTO decisions (id, kind, repo, number, items, question, options, asked_at) VALUES ('b1', 'merge', NULL, NULL, ?, 'Merge the batch?', '[]', '2026-01-03T00:00:00Z')")
    .run(JSON.stringify([{ repo: "photocraft", number: 7 }]));
  assert.deepEqual(((await trace(db, req(7, { kinds: "decision" }))) as ItemTrace).events.map((e) => e.summary), ["Asked: Merge the batch?"], "a batch decision is found through decision_items");
  db.prepare("INSERT INTO decisions (id, kind, repo, number, items, question, options, asked_at) VALUES ('b2', 'merge', NULL, NULL, ?, 'Hidden batch?', '[]', '2026-01-04T00:00:00Z')")
    .run(JSON.stringify([{ repo: "photocraft", number: 7 }, { repo: "pdfcraft", number: 1 }]));
  const viewer = { ...req(7, { kinds: "decision" }), user: { login: "u", role: "viewer" as const, canWrite: async () => true, canRead: async (r: string) => r !== "pdfcraft" } };
  db.prepare("INSERT INTO repos (name, visibility) VALUES ('pdfcraft', 'private') ON CONFLICT (name) DO UPDATE SET visibility = 'private'").run();
  assert.deepEqual(((await trace(db, viewer)) as ItemTrace).events.map((e) => e.summary), ["Asked: Merge the batch?"], "a batch touching a repo hidden from the viewer is left out");
  assert.equal(((await trace(db, req(7, { kinds: "decision" }))) as ItemTrace).events.length, 2, "an operator sees both");
  const f = (await trace(db, { ...as("viewer"), query: new URLSearchParams({ kinds: "review" }) })) as ItemTrace;
  assert.equal(f.events[0]!.head, "c".repeat(40));
});

test("the activity pass skips a missing item, retries a failed one later and goes on to the others", async () => {
  const db = connect(":memory:");
  for (const n of [1, 2, 3])
    db.prepare("INSERT INTO items (repo, number, kind, state, author, created_at, updated_at, head_oid) VALUES ('photocraft', ?, 'issue', 'OPEN', 'dev', '2026-01-01T00:00:00Z', ?, NULL)").run(n, `2026-01-0${n}T00:00:00Z`);
  const asked: number[] = [];
  const client = { spent: 0, remaining: 5000, async query(_q: string, v: { number: number }) {
    asked.push(v.number);
    if (v.number === 3) return { repository: { issueOrPullRequest: null } };
    if (v.number === 2) throw new Error("boom");
    return { repository: { issueOrPullRequest: { __typename: "Issue", issueTimeline: { nodes: [] } } } };
  } };
  const now = new Date("2026-01-10T00:00:00Z");
  assert.equal(await syncActivity(db, client, now), 3, "the failure does not stop the older item");
  assert.deepEqual(asked, [3, 2, 1]);
  asked.length = 0;
  assert.equal(await syncActivity(db, client, now), 0, "a missing item and a failed one wait");
  assert.equal(await syncActivity(db, client, new Date(now.getTime() + 2 * 3_600_000)), 1);
  assert.deepEqual(asked, [2]);
});

test("decision_items follows a decision that changes or goes away", () => {
  const db = connect(":memory:");
  db.prepare("INSERT INTO decisions (id, kind, repo, number, items, question, options, asked_at) VALUES ('d', 'merge', 'photocraft', NULL, NULL, 'q', '[]', '2026-01-01T00:00:00Z')").run();
  const n = () => (db.prepare("SELECT COUNT(*) AS c FROM decision_items").get() as { c: number }).c;
  db.prepare("UPDATE decisions SET number = NULL, items = ? WHERE id = 'd'").run(JSON.stringify([{ repo: "photocraft", number: 1 }]));
  assert.equal(n(), 1);
  db.prepare("UPDATE decisions SET number = 5 WHERE id = 'd'").run();
  assert.equal(n(), 0, "a decision with its own number names no batch items");
  db.prepare("UPDATE decisions SET number = NULL WHERE id = 'd'").run();
  db.prepare("UPDATE decisions SET items = 'not json' WHERE id = 'd'").run();
  assert.equal(n(), 0);
  db.prepare("UPDATE decisions SET items = ? WHERE id = 'd'").run(JSON.stringify([{ repo: "photocraft", number: 2 }]));
  db.prepare("DELETE FROM decisions WHERE id = 'd'").run();
  assert.equal(n(), 0);
});
