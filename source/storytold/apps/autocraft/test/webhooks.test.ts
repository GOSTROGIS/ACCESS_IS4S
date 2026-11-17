import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { connect } from "../src/db.ts";
import { safeEqual } from "../src/dash/server/crypto.ts";
import { drainSyncRequests, handleDelivery, signatureOf } from "../src/github/webhooks.ts";
import { validating } from "./gql.ts";
import { SCRATCH } from "./scratch.ts";

const SECRET = "hook-secret";
function scratch() {
  const db = connect(join(mkdtempSync(join(SCRATCH, "hook-")), "m.db"));
  db.exec("DELETE FROM tracked_repos");
  db.exec("INSERT INTO tracked_repos VALUES ('a','t','x', 1)");
  return db;
}
const deliver = (db: ReturnType<typeof scratch>, event: string, payload: unknown, sign = true) => {
  const raw = Buffer.from(JSON.stringify(payload));
  return handleDelivery(db, SECRET, { event, ...(sign ? { signature: signatureOf(SECRET, raw) } : {}) }, raw, safeEqual);
};
const queued = (db: ReturnType<typeof scratch>) => db.prepare("SELECT repo, number FROM sync_requests ORDER BY number").all().map((r) => ({ ...r }));

test("a signed delivery queues one row per item, a bad or missing signature and an untracked repo queue nothing", () => {
  const db = scratch();
  const body = (n: number, full = "storytold/a") => ({ repository: { full_name: full, name: full.split("/")[1] }, issue: { number: n } });
  assert.equal(deliver(db, "issues", body(7)).status, 202);
  assert.equal(deliver(db, "issue_comment", body(7)).status, 202);
  assert.equal(deliver(db, "issues", body(8)).status, 202);
  assert.deepEqual(queued(db), [{ repo: "a", number: 7 }, { repo: "a", number: 8 }], "a burst collapses to one row per item");
  assert.equal(deliver(db, "issues", body(9), false).status, 401);
  const raw = Buffer.from(JSON.stringify(body(9)));
  assert.equal(handleDelivery(db, SECRET, { event: "issues", signature: signatureOf("other", raw) }, raw, safeEqual).status, 401);
  assert.equal(handleDelivery(db, null, { event: "issues", signature: signatureOf("", raw) }, raw, safeEqual).status, 401, "no secret set: refused");
  assert.equal(deliver(db, "issues", body(10, "storytold/zzz")).status, 202);
  assert.equal(deliver(db, "issues", body(11, "someoneelse/a")).status, 202);
  assert.equal(deliver(db, "ping", {}).status, 200);
  const suite = (action: string, prs: unknown[], sha = "s1") => ({ action, repository: { full_name: "storytold/a", name: "a", id: 1 }, check_suite: { head_sha: sha, pull_requests: prs } });
  assert.equal(deliver(db, "check_suite", suite("requested", [{ number: 13, base: { repo: { id: 1 } } }])).status, 202);
  assert.equal(deliver(db, "check_suite", suite("completed", [{ number: 12, base: { repo: { id: 1 } } }, { number: 99, base: { repo: { id: 2 } } }])).status, 202);
  db.exec("INSERT INTO items (repo, number, kind, state, head_oid) VALUES ('a', 14, 'pr', 'OPEN', 'fork-sha')");
  assert.equal(deliver(db, "check_suite", suite("completed", [], "fork-sha")).status, 202);
  assert.deepEqual(queued(db), [{ repo: "a", number: 7 }, { repo: "a", number: 8 }, { repo: "a", number: 12 }, { repo: "a", number: 14 }]);
});

test("the drain re-reads a queued item, sets synced_at and clears the request", async () => {
  const db = scratch();
  deliver(db, "issues", { repository: { full_name: "storytold/a", name: "a" }, issue: { number: 5 } });
  const node = {
    __typename: "Issue", repository: { name: "a", owner: { login: "storytold" } }, number: 5, title: "t", body: "", url: "u", author: { login: "x" },
    authorAssociation: "NONE", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-11-02T10:00:00Z", closedAt: null, state: "OPEN",
    labels: { nodes: [] }, assignees: { nodes: [] }, commentCount: { totalCount: 0 }, stateReason: null, comments: { nodes: [] },
  };
  const calls: Record<string, unknown>[] = [];
  const c = validating({ spent: 0, remaining: 4000 as number | null, async query(_q: string, v: Record<string, unknown>) { calls.push(v); return { repository: { issueOrPullRequest: node } }; } });
  assert.equal(await drainSyncRequests(db, c), 1);
  assert.deepEqual(calls, [{ owner: "storytold", name: "a", number: 5 }]);
  const row = db.prepare("SELECT title, (SELECT synced_at FROM item_reads r WHERE r.repo = i.repo AND r.number = i.number) AS synced_at FROM items i WHERE repo = 'a' AND number = 5").get() as { title: string; synced_at: string };
  assert.equal(row.title, "t");
  assert.match(row.synced_at, /^\d{4}-\d\d-\d\dT/);
  assert.deepEqual(queued(db), []);
});

test("a request that fails for a reason other than a transient one is dropped so the queue moves on", async () => {
  const db = scratch();
  for (const n of [1, 2]) deliver(db, "issues", { repository: { full_name: "storytold/a", name: "a" }, issue: { number: n } });
  let calls = 0;
  const c = { spent: 0, remaining: 4000 as number | null, async query() { if (calls++ === 0) throw new Error("graphql error"); return { repository: { issueOrPullRequest: null } }; } };
  await drainSyncRequests(db, c);
  assert.equal(calls, 2);
  assert.deepEqual(queued(db), []);
});

test("re-reading an unchanged item bumps no items topic and keeps its newest comments", async () => {
  const db = scratch();
  const comment = (i: number) => ({ id: `c${i}`, author: { login: "x", __typename: "User" }, authorAssociation: "NONE", createdAt: "2026-01-02T00:00:00Z", body: `b${i}`, url: "u" });
  const node = {
    __typename: "Issue", repository: { name: "a", owner: { login: "storytold" } }, number: 5, title: "t", body: "", url: "u", author: { login: "x" },
    authorAssociation: "NONE", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-11-02T10:00:00Z", closedAt: null, state: "OPEN",
    labels: { nodes: [] }, assignees: { nodes: [] }, commentCount: { totalCount: 2 }, stateReason: null, comments: { nodes: [comment(1), comment(2)] },
  };
  const c = validating({ spent: 0, remaining: 4000 as number | null, async query() { return { repository: { issueOrPullRequest: node } }; } });
  const read = async () => { deliver(db, "issues", { repository: { full_name: "storytold/a", name: "a" }, issue: { number: 5 } }); await drainSyncRequests(db, c); };
  const seq = () => (db.prepare("SELECT seq FROM change_seq WHERE topic = 'items'").get() as { seq: number }).seq;
  await read();
  const before = seq();
  await read();
  assert.equal(seq(), before);
  node.comments = { nodes: [comment(2)] };
  await read();
  assert.deepEqual(db.prepare("SELECT id FROM comments WHERE repo = 'a' AND number = 5").all().map((r) => r.id), ["c2"]);
});
