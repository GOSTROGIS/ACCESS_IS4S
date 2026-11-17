// The user lane: an answered close in a repo on the app's identity is written as the answering operator with their
// token; without a token it waits and writes nothing. Under the default (legacy) setting nothing changes.
import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { runAct } from "../src/act/index.ts";
import { setGithubIdentity } from "../src/github/identity.ts";
import { plannedItems } from "../src/core/select-items.ts";
import { authFailure, retryWaiting, type LaneDeps } from "../src/github/user-lane.ts";
import { OPERATOR, world, type World } from "./world-db.ts";

const quiet = () => {};
let current: World | null = null;
const fresh = (): World => (current = world().repo());
afterEach(() => current?.close());

const askedAndAnswered = async (w: World) => {
  const asked = await runAct(w.db, { repo: "app", dryRun: false }, quiet, w.gh.actDeps());
  w.answerDecision(asked.asked[0]!, "close");
  return asked.asked[0]!;
};
const execOf = (w: World, id: string) => w.rows("SELECT exec_state AS s, exec_reason AS r FROM decisions WHERE id = ?", id)[0] as { s: string | null; r: string | null };

test("legacy repos close as before; an app repo without the operator's token waits and writes nothing, then closes as the operator after a sign-in", async () => {
  // legacy: the box transports close it and no state is recorded
  const a = fresh().pr(1).review(1, { verdict: "close", reason: "Does not match the reference app" });
  const idA = await askedAndAnswered(a);
  assert.deepEqual((await runAct(a.db, { repo: "app", dryRun: false }, quiet, a.gh.actDeps())).done, ["app#1"]);
  assert.deepEqual(a.gh.writes.map((x) => x.kind), ["comment", "close"]);
  assert.deepEqual(execOf(a, idA), { s: null, r: null });
  a.close();

  // app: no token for the answering operator
  const w = fresh().pr(1).review(1, { verdict: "close", reason: "Does not match the reference app" });
  setGithubIdentity(w.db, "op", "app");
  const id = await askedAndAnswered(w);
  const userQuerier = { query: async (_q: string, _v?: object): Promise<Record<string, unknown>> => ({}), spent: 0, remaining: null as number | null };
  let token: string | null = null;
  const lane: LaneDeps = {
    vault: { userToken: async () => (token ? { ok: true, access: token } : { ok: false, needsSignIn: true, why: "no-token" }) },
    permission: async () => "write",
    transports: () => ({ querier: userQuerier, exec: async () => ({ code: 0, stdout: "", stderr: "" }) }),
  };
  const appQueries: string[] = [];
  const app = { mint: async () => "app-token", appClient: () => ({ query: async (q: string): Promise<Record<string, unknown>> => { appQueries.push(q.includes("addComment") ? "comment" : "other"); return {}; } }) };
  const deps = { ...w.gh.actDeps(), lane, app };
  const waiting = await runAct(w.db, { repo: "app", dryRun: false }, quiet, deps);
  assert.deepEqual(waiting.done, []);
  assert.equal(w.gh.writes.length, 0, "the box account writes nothing in a repo on the app's identity");
  assert.deepEqual(execOf(w, id), { s: "waiting-token", r: "Sign in to let AutoCraft finish this as you" });

  // The operator authorizes: the decision is pending again and the next run uses their lane (its own querier, not the box's).
  token = "user-token";
  assert.equal(retryWaiting(w.db, OPERATOR), 1);
  assert.deepEqual(execOf(w, id), { s: "pending", r: null });
  const queries: string[] = [];
  userQuerier.query = async (q: string) => { queries.push(q.includes("closeIssue") || q.includes("closePullRequest") ? "close" : q.includes("addComment") ? "comment" : "read"); return q.includes("issueOrPullRequest") ? { repository: { issueOrPullRequest: { __typename: "PullRequest", id: "PR_1", state: "OPEN", headRefOid: (w.rows("SELECT head_oid FROM items WHERE number = 1")[0] as { head_oid: string }).head_oid } } } : {}; };
  await runAct(w.db, { repo: "app", dryRun: false }, quiet, deps);
  assert.equal(w.gh.writes.length, 0, "still nothing through the box's transports");
  assert.ok(queries.includes("close") && !queries.includes("comment"), `the person's transports made the close only: ${queries.join(",")}`);
  assert.deepEqual(appQueries, ["comment"], "the comment before the close is the app's");
  const row = w.rows("SELECT details FROM audit WHERE action = 'act-close'")[0] as { details: string };
  assert.equal((JSON.parse(row.details) as { identity: string }).identity, `user:${OPERATOR}`);
  const crow = w.rows("SELECT details FROM audit WHERE action = 'act-comment'")[0] as { details: string };
  assert.equal((JSON.parse(crow.details) as { identity: string }).identity, "app");
});

test("a waiting decision is no act work: the run counts nothing and the planner plans no act for it", async () => {
  const w = fresh().pr(1).review(1, { verdict: "close", reason: "Does not match the reference app" });
  setGithubIdentity(w.db, "op", "app");
  const id = await askedAndAnswered(w);
  const lane: LaneDeps = { vault: { userToken: async () => ({ ok: false, needsSignIn: true, why: "no-token" }) } };
  const deps = { ...w.gh.actDeps(), lane };
  let handled = 0;
  await runAct(w.db, { repo: "app", dryRun: false, onHandled: (n) => { handled = n; } }, quiet, deps);
  assert.equal(handled, 0);
  assert.equal(execOf(w, id).s, "waiting-token");
  assert.equal(plannedItems(w.db, "act", { repo: "app" }).length, 0);
});

test("a rate limit is transient and a 403 or 404 status is no access; words and numbers in the text decide nothing", () => {
  assert.equal(authFailure(new Error("gh failed: You have exceeded a secondary rate limit (HTTP 403)")), "transient");
  assert.equal(authFailure(new Error("gh failed: Resource not accessible by integration (HTTP 403)")), "waiting-permission");
  assert.equal(authFailure(new Error("gh failed: Bad credentials (HTTP 401)")), "waiting-token");
  assert.equal(authFailure(new Error("refused: app#403 not found, bad credentials in the title")), null);
});
