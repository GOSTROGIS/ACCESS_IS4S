// A tracked repo that is not public is visible to operators and to users whose
// own GitHub permission on it is not "none"; to nobody else.
import { refreshPlanCache } from "../src/core/plan-cache.ts";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { after, before, describe, test } from "node:test";
import type { ItemPageData } from "../src/dash/api/item-page.ts";
import type { AgentRunDetail, BuildTaskDetail, Item, JobDetail, Decision as DecisionOne, AgentRunPage, DecisionList, Flow, ItemList, Progress, QueueList, SearchHit } from "../web/src/api/types.ts";
import { addLogin } from "../src/access.ts";
import { insertRun, finishRun } from "../src/agents/runs.ts";
import { connect } from "../src/db.ts";
import { ask } from "../src/decisions.ts";
import { scopeToTracked } from "../src/repos.ts";
import { blankIfHidden } from "../src/dash/api/visible.ts";
import { apiRoutes } from "../src/dash/api/index.ts";
import { loadConfig } from "../src/dash/server/config.ts";
import { startServer } from "../src/dash/server/index.ts";
import { ImageProxy } from "../src/dash/server/images.ts";
import { FakeProvider } from "../src/dash/server/provider.ts";
import { SCRATCH } from "./scratch.ts";

mkdirSync(SCRATCH, { recursive: true });
const dir = mkdtempSync(join(SCRATCH, "visibility-test-"));
const dbFile = join(dir, "dash.db");
const permsFile = join(dir, "perms.json");
// reader has read on the internal repo; outsider has none.
writeFileSync(permsFile, JSON.stringify({ reader: { vault: "read" }, maint: { vault: "read" } }));

const db = connect(dbFile);
let base = "";
let close: () => Promise<void>;
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32)]);
const VAULT_IMG = "https://github.com/user-attachments/assets/f3f8be53-b594-419f-b49d-a7dfec20b476";
const BOTH_IMG = "https://github.com/user-attachments/assets/aaaaaaaa-b594-419f-b49d-a7dfec20b476";
const fetched: string[] = [];
const fakeFetch = (async (input: string | URL | Request) => {
  fetched.push(String(input));
  return new Response(new Uint8Array(PNG), { status: 200, headers: { "content-type": "image/png" } });
}) as typeof fetch;
const OPTS = [{ key: "a", label: "A" }, { key: "b", label: "B" }];

before(async () => {
  const now = new Date().toISOString();
  db.exec("DELETE FROM tracked_repos; INSERT INTO tracked_repos (name, pipeline) VALUES ('open-app', 1), ('vault', 1)");
  db.exec("INSERT INTO repos (name, visibility) VALUES ('open-app', 'public'), ('vault', 'internal')");
  const item = db.prepare("INSERT INTO items (repo, number, kind, state, title, body, head_oid, author, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)");
  const review = db.prepare("INSERT INTO opus_reviews (repo, number, head_oid, run_id, at, verdict, reason, sure, mode) VALUES (?, ?, ?, 'r', ?, 'take', 'ok', 1, 'full')");
  for (const repo of ["open-app", "vault"]) {
    item.run(repo, 1, "pr", "OPEN", `Wave filter in ${repo}`, "body", `h-${repo}`, "alice", now, now);
    review.run(repo, 1, `h-${repo}`, now);
  }
  db.prepare("UPDATE items SET body = ? WHERE repo = 'vault'").run(`![a](${VAULT_IMG}) ![b](${BOTH_IMG})`);
  db.prepare("UPDATE items SET body = ? WHERE repo = 'open-app'").run(`![b](${BOTH_IMG})`);
  ask(db, ["open-app", "vault"].map((repo) => ({
    id: `${repo}#1:scope`, kind: "scope", repo, number: 1, question: "A or B?", options: OPTS, recommended: "a", summary: "s",
  })));
  ask(db, [{ id: "batch", kind: "scope", repo: null, number: null, items: [{ repo: "open-app", number: 1 }, { repo: "vault", number: 1 }], question: "Batch?", options: OPTS, recommended: "a", summary: "s" }] as never);
  for (const repo of ["open-app", "vault"]) {
    const id = insertRun(db, { jobId: null, step: "classify", stage: 1, promptId: "p", promptVersion: "1", provider: "claude", model: "m", accountId: null, items: [{ repo, number: 1 }], prompt: `prompt for ${repo}` });
    finishRun(db, id, { state: "done", output: `output for ${repo}` });
  }
  refreshPlanCache(db);
  addLogin(db, "cli", "boss", "operator", null);
  addLogin(db, "cli", "reader", "viewer", null);
  addLogin(db, "cli", "maint", "maintainer", null);
  addLogin(db, "cli", "maint2", "maintainer", null);
  addLogin(db, "cli", "outsider", "viewer", null);
  scopeToTracked(db);
  const config = loadConfig({ AUTOCRAFT_DEV_AUTH: "1", AUTOCRAFT_LISTEN: "127.0.0.1:0", AUTOCRAFT_DB: dbFile, AUTOCRAFT_DEV_PERMS: permsFile });
  const s = await startServer({ config, db, provider: new FakeProvider(permsFile), routes: apiRoutes(), images: new ImageProxy({ fetch: fakeFetch, token: async () => null, cacheDir: null, repos: () => ["any"] }) });
  base = s.url;
  close = s.close;
});
after(async () => {
  await close();
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

// One session per login: the sign-in rate limit counts every sign-in in this file.
const sessions = new Map<string, ReturnType<typeof signIn>>();
const signedIn = (login: string): ReturnType<typeof signIn> => {
  let s = sessions.get(login);
  if (!s) sessions.set(login, (s = signIn(login)));
  return s;
};

async function signIn(login: string) {
  const jar = new Map<string, string>();
  const send = async (path: string, extra: Record<string, string> = {}) => {
    const r = await fetch(new URL(path, base), { headers: { cookie: [...jar].map(([k, v]) => `${k}=${v}`).join("; "), accept: "application/json", ...extra }, redirect: "manual" });
    for (const c of r.headers.getSetCookie()) {
      const [kv] = c.split(";");
      const k = kv!.slice(0, kv!.indexOf("=")), v = kv!.slice(kv!.indexOf("=") + 1);
      if (/Max-Age=0/.test(c)) jar.delete(k);
      else jar.set(k, v);
    }
    return r;
  };
  const start = await send("/auth/signin?return_to=/");
  const auth = await send(`${start.headers.get("location")}&login=${login}`);
  assert.equal((await send(auth.headers.get("location")!)).status, 303);
  return {
    status: async (path: string, headers?: Record<string, string>) => (await send(path, headers)).status,
    get: async <T>(path: string, headers?: Record<string, string>): Promise<T> => {
      const r = await send(path, headers);
      assert.equal(r.status, 200, path);
      return (await r.json()) as T;
    },
  };
}

const refs = (rows: { repo: string; number: number }[]) => rows.map((r) => `${r.repo}#${r.number}`).sort();

describe("repo visibility", () => {
  test("a viewer without permission sees nothing of the internal repo", async () => {
    const c = await signedIn("outsider");
    assert.deepEqual(await c.get<string[]>("/api/repos"), ["open-app"]);
    assert.deepEqual(refs((await c.get<ItemList>("/api/items?state=all")).rows), ["open-app#1"]);
    assert.deepEqual(refs(await c.get<SearchHit[]>("/api/search?q=wave")), ["open-app#1"]);
    assert.deepEqual(refs(await c.get<SearchHit[]>("/api/search?q=vault%231")), []);
    assert.equal(await c.status("/api/items/vault/1"), 404);
    assert.equal(await c.status("/api/items/vault/1/page"), 404);
    assert.equal(await c.status("/api/similar/vault/1"), 404);
    const decisions = await c.get<DecisionList>("/api/decisions");
    assert.deepEqual(decisions.decisions.map((d) => d.id), ["open-app#1:scope"]);
    assert.equal(decisions.total, 1);
    assert.equal(await c.status(`/api/decisions/${encodeURIComponent("vault#1:scope")}`), 404);
    assert.equal(await c.status("/api/decisions/batch"), 404);
    assert.deepEqual((await c.get<QueueList>("/api/queue")).rows.map((r) => r.repo), ["open-app"]);
    assert.equal(await c.status("/api/queue?repo=vault"), 404);
    assert.equal(await c.status("/api/flow?repo=vault"), 404);
    const p = await c.get<Progress>("/api/progress");
    assert.deepEqual(p.repos.map((r) => r.repo), ["open-app"]);
    assert.equal(p.funnel.open, 1);
    assert.equal(p.decisionsOpen, 1);
    const runs = await c.get<AgentRunPage>("/api/agents");
    assert.equal(runs.runs.length, 1);
    assert.equal(runs.runs[0]!.items[0]!.repo, "open-app");
    assert.equal(await c.status("/api/agents/2"), 404);
  });

  test("the Security list and the finding page are staff only", async () => {
    db.prepare("INSERT INTO security_scans (id, repo, state, started_by, started_at) VALUES (900, 'open-app', 'done', 'boss', '2026-01-01T00:00:00Z')").run();
    db.prepare(`INSERT INTO security_findings (repo, number, scan_id, area, title, severity, urgent, state, refs, reach, impact, fingerprint, created_at, updated_at)
      VALUES ('open-app', 1, 900, 'a', 't', 'high', 0, 'new', '[]', 'r', 'i', 'fp1', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')`).run();
    for (const login of ["reader", "outsider"]) {
      const c = await signedIn(login);
      assert.equal(await c.status("/api/security/findings"), 404, login);
      assert.equal(await c.status("/api/security/findings/open-app/1/page"), 404, login);
    }
    const c = await signedIn("maint");
    assert.equal((await c.get<{ groups: { rows: unknown[] }[] }>("/api/security/findings")).groups[0]!.rows.length, 1);
    assert.equal(await c.status("/api/security/findings/open-app/1/page"), 200);
  });

  test("a viewer with read permission, and an operator, see it", async () => {
    for (const login of ["reader", "boss"]) {
      const c = await signedIn(login);
      assert.deepEqual(await c.get<string[]>("/api/repos"), ["open-app", "vault"], login);
      assert.deepEqual(refs((await c.get<ItemList>("/api/items?state=all")).rows), ["open-app#1", "vault#1"], login);
      assert.equal(await c.status("/api/items/vault/1"), 200, login);
      assert.equal((await c.get<DecisionList>("/api/decisions")).total, 3, login);
      assert.deepEqual((await c.get<QueueList>("/api/queue")).rows.map((r) => r.repo), ["open-app", "vault"], login);
      assert.equal((await c.get<Progress>("/api/progress")).funnel.open, 2, login);
      assert.equal(await c.status("/api/flow?repo=vault"), 200, login);
      assert.equal((await c.get<Flow>("/api/flow")).repo, null, login);
    }
  });


  test("operators and maintainers see prompts and answer notes; viewers do not; access stays operator-only", async () => {
    db.prepare("UPDATE main.decisions SET answer = 'a', answer_note = 'private note', answered_by = 'boss', answered_at = ? WHERE id = 'vault#1:scope'").run(new Date().toISOString());
    const note = async (login: string) => (await (await signedIn(login)).get<DecisionOne>("/api/decisions/vault%231%3Ascope")).answerNote;
    for (const login of ["reader", "maint", "boss"]) {
      const c = await signedIn(login);
      const run = await c.get<AgentRunDetail>("/api/agents/2");
      const staff = login !== "reader";
      assert.equal(run.prompt === null, !staff, login);
      assert.equal(run.output === null, !staff, login);
      if (staff) {
        assert.match(run.prompt ?? "", /prompt for vault/);
        assert.match(run.output ?? "", /output for vault/);
      }
      assert.equal(await note(login), staff ? "private note" : null, login);
      assert.equal(await c.status("/api/access"), login === "boss" ? 200 : 403, login);
    }
    db.prepare("INSERT INTO audit (at, login, action, target) VALUES (?, 'boss', 'access-add', 'someone'), (?, 'boss', 'repo-track', 'vault')").run(new Date().toISOString(), new Date().toISOString());
    const maint = await signedIn("maint");
    db.prepare("INSERT INTO audit (at, login, action, target) VALUES (?, 'boss', 'account-change', 'account:a')").run(new Date().toISOString());
    const all = await maint.get<{ total: number }>("/api/audit");
    const rows = await (await signedIn("boss")).get<{ total: number }>("/api/audit");
    const hiddenRows = (db.prepare("SELECT COUNT(*) AS n FROM audit WHERE action LIKE 'access-%' OR action LIKE 'account-%' OR action IN ('session-revoke', 'sign-in', 'sign-in-refused')").get() as { n: number }).n;
    assert.equal(rows.total - all.total, hiddenRows);
    assert.equal(await maint.status("/api/audit?action=account-change"), 400);
    assert.ok(!JSON.stringify(await maint.get("/api/audit?login=boss")).includes("account-change"));
    assert.ok((await maint.get<{ name: string }[]>("/api/repos/all")).length > 0);
    const audit = await maint.get<{ entries: { action: string }[]; actions: string[] }>("/api/audit");
    assert.ok(audit.entries.some((e) => e.action === "repo-track"));
    assert.ok(!audit.entries.some((e) => e.action === "access-add"));
    assert.ok(!audit.actions.includes("access-add"));
    assert.equal(await maint.status("/api/audit?action=access-add"), 400);
    const boss = await signedIn("boss");
    assert.ok((await boss.get<{ entries: { action: string }[] }>("/api/audit?action=access-add")).entries.length > 0);
    const reader = await signedIn("reader");
    for (const path of ["/api/repos/all", "/api/audit"]) assert.equal(await reader.status(path), 403, path);
    db.prepare("DELETE FROM audit WHERE target IN ('someone', 'vault', 'account:a') AND login = 'boss' AND action IN ('access-add', 'repo-track', 'account-change')").run();
    db.prepare("UPDATE main.decisions SET answer = NULL, answer_note = NULL, answered_by = NULL, answered_at = NULL WHERE id = 'vault#1:scope'").run();
  });

  test("the item page gives viewers verdicts without review text, and answers since with unchanged", async () => {
    const now = new Date().toISOString();
    db.prepare(`INSERT INTO opus_review_history (repo, number, head_oid, at, model, mode, verdict, sure, reason, summary, risks, fixes, claims, trigger)
      VALUES ('open-app', 1, 'h-open-app', ?, 'opus', 'full', 'take-fix', 1, 'quotes the patch', 'summary of the patch', '["a risk"]', '["fix one"]', '[{"claim":"it leaks","evidence":"src/a.ts:4"}]', 'operator')`).run(now);
    const page = async (login: string) => (await signedIn(login)).get<ItemPageData>("/api/items/open-app/1/page");
    for (const login of ["reader", "maint", "boss"]) {
      const latest = (await page(login)).reviews.latest!;
      const staff = login !== "reader";
      assert.equal(latest.verdict, "take-fix", login);
      assert.equal(latest.trigger, "operator", login);
      assert.equal(latest.summary, staff ? "summary of the patch" : "", login);
      assert.deepEqual(latest.fixes, staff ? ["fix one"] : [], login);
      assert.deepEqual(latest.risks, staff ? ["a risk"] : [], login);
      assert.deepEqual(latest.claims, staff ? [{ path: "src/a.ts", line: 4, text: "it leaks" }] : [], login);
    }
    const c = await signedIn("reader");
    const first = await page("reader");
    assert.deepEqual(await c.get(`/api/items/open-app/1/page?since=${first.stamp}`), { unchanged: true, stamp: first.stamp });
    db.prepare("DELETE FROM opus_review_history WHERE repo = 'open-app'").run();
  });

  test("viewers get build tasks, jobs and patch reviews without log and patch bodies", async () => {
    const now = new Date().toISOString();
    const logFile = join(dir, "job.log");
    writeFileSync(logFile, "job log line\n");
    const job = db.prepare("INSERT INTO jobs (step, params, requested_by, requested_at, state, log_path, repo) VALUES ('classify', '{}', 'cli', ?, 'done', ?, 'open-app')").run(now, logFile);
    const task = db.prepare("INSERT INTO build_tasks (step, repo, number, head_sha, requires, plan, state, queued_at, patch, log_bytes) VALUES ('verify', 'open-app', 1, 'h', '{}', '[]', 'done', ?, 'diff --git a/x b/x', 9)").run(now);
    db.prepare("INSERT INTO build_task_logs (task_id, seq, step, chunk) VALUES (?, 0, 'test', 'task log line')").run(task.lastInsertRowid);
    db.prepare("INSERT INTO patch_checks (kind, repo, number, subject, patch_hash, verdict, reasons, problems, model, created_at) VALUES ('fixup', 'open-app', 1, 's', 'p', 'reject', 'the patch drops the guard', '[\"drops the guard\"]', 'opus', ?)").run(now);
    for (const login of ["reader", "maint"]) {
      const c = await signedIn(login);
      const staff = login === "maint";
      const t = await c.get<BuildTaskDetail>(`/api/tasks/${task.lastInsertRowid}`);
      assert.equal(t.logTail, staff ? "task log line" : null, login);
      assert.equal(t.patch, staff ? "diff --git a/x b/x" : null, login);
      assert.equal((await c.get<JobDetail>(`/api/pipeline/jobs/${job.lastInsertRowid}`)).log, staff ? "job log line\n" : null, login);
      const [check] = (await c.get<Item>("/api/items/open-app/1")).patchChecks ?? [];
      assert.equal(check?.reasons, staff ? "the patch drops the guard" : "", login);
      assert.deepEqual(check?.problems, staff ? ["drops the guard"] : [], login);
      assert.equal(await c.status(`/api/tasks/${task.lastInsertRowid}/artifacts/none`), staff ? 404 : 403, login);
    }
    db.prepare("DELETE FROM patch_checks").run();
  });

  test("Home gives viewers counts and no named needs; staff get the oldest ones", async () => {
    const viewer = await (await signedIn("reader")).get<{ needs: { total: number; oldest: unknown[] } }>("/api/home");
    const maint = await (await signedIn("boss")).get<{ needs: { total: number; oldest: unknown[] } }>("/api/home");
    assert.deepEqual(viewer.needs.oldest, []);
    assert.ok(maint.needs.oldest.length > 0);
    assert.equal(viewer.needs.total, maint.needs.total);
  });

  test("the project scope narrows lists to one repo; pages reached by their own link show every repo; a scope the user cannot see is ignored", async () => {
    const scope = (repo: string) => ({ "x-autocraft-scope": repo });
    const boss = await signedIn("boss");
    const scoped = await boss.get<DecisionList>("/api/decisions", scope("open-app"));
    assert.ok(scoped.decisions.length > 0);
    assert.ok(scoped.decisions.every((d) => d.repo === "open-app"));
    const home = await boss.get<{ needs: { oldest: { repo: string }[] } }>("/api/home", scope("open-app"));
    assert.ok(home.needs.oldest.length > 0);
    assert.ok(home.needs.oldest.every((n) => n.repo === "open-app"));
    // Another repo's item page and decision open with their decision and reviews; the picker's list and counts name every repo.
    assert.equal((await boss.get<DecisionOne>(`/api/decisions/${encodeURIComponent("vault#1:scope")}`, scope("open-app"))).repo, "vault");
    assert.equal((await boss.get<DecisionOne | null>("/api/items/vault/1/decision", scope("open-app")))?.id, "vault#1:scope");
    assert.ok((await boss.get<ItemPageData>("/api/items/vault/1/page", scope("open-app"))).reviews.latest);
    assert.deepEqual((await boss.get<string[]>("/api/repos", scope("open-app"))).sort(), ["open-app", "vault"]);
    assert.ok((await boss.get<{ byRepo: Record<string, number> }>("/api/decisions/open-counts", scope("open-app"))).byRepo.vault! > 0);
    // A scope the user cannot see is ignored: the outsider gets the open-app list, never vault's.
    const outsider = await signedIn("outsider");
    const out = await outsider.get<DecisionList>("/api/decisions", scope("vault"));
    assert.ok(out.decisions.some((d) => d.repo === "open-app"));
    assert.ok(!out.decisions.some((d) => d.repo === "vault"));
    assert.equal(await outsider.status("/api/items/vault/1", scope("vault")), 404);
  });

  test("rows of an untracked repo and of a private repo the user cannot read are operator-only", async () => {
    const now = new Date().toISOString();
    const rows = (repo: string) => {
      const job = db.prepare("INSERT INTO jobs (step, params, requested_by, requested_at, state, repo) VALUES ('classify', '{}', 'cli', ?, 'done', ?)").run(now, repo);
      const task = db.prepare("INSERT INTO build_tasks (step, repo, number, head_sha, requires, plan, state, queued_at, patch, log_bytes) VALUES ('verify', ?, 7, 'h', '{}', '[]', 'done', ?, 'diff', 0)").run(repo, now);
      const run = insertRun(db, { jobId: null, step: "classify", stage: 1, promptId: "p", promptVersion: "1", provider: "claude", model: "m", accountId: null, items: [{ repo, number: 7 }], prompt: `prompt for ${repo}` });
      finishRun(db, run, { state: "done", output: `output for ${repo}` });
      return { job: Number(job.lastInsertRowid), task: Number(task.lastInsertRowid), run };
    };
    db.prepare("INSERT OR IGNORE INTO ever_tracked_repos (name) VALUES ('gone-app')").run();
    const gone = rows("gone-app"), vault = rows("vault");
    const paths = (r: { job: number; task: number; run: number }) => [`/api/pipeline/jobs/${r.job}`, `/api/tasks/${r.task}`, `/api/agents/${r.run}`];
    const boss = await signedIn("boss");
    for (const p of [...paths(gone), ...paths(vault)]) assert.equal(await boss.status(p), 200, p);
    const clients: Record<string, Awaited<ReturnType<typeof signedIn>>> = {};
    for (const login of ["reader", "maint", "outsider"]) {
      const c = (clients[login] = await signedIn(login));
      for (const p of paths(gone)) assert.equal(await c.status(p), 404, `${login} ${p}`);
      const list = await c.get<{ jobs: { repo: string }[] }>("/api/pipeline/jobs");
      assert.ok(!list.jobs.some((j) => j.repo === "gone-app"), login);
    }
    const { outsider, maint } = clients as Record<string, (typeof clients)[string]>;
    for (const p of paths(vault)) {
      assert.equal(await outsider.status(p), 404, p);
      assert.equal(await maint.status(p), 200, p);
    }
  });

  test("viewers read only the item page's fields of a trace event and no reasons in its list; staff read all", async () => {
    const now = new Date().toISOString();
    db.prepare(`INSERT INTO opus_review_history (repo, number, head_oid, at, model, mode, verdict, sure, reason, risks, fixes, claims)
      VALUES ('open-app', 1, 'h-open-app', ?, 'opus', 'full', 'take-fix', 1, 'secret reason', '["secret risk"]', '["secret fix"]', '[{"claim":"secret claim","evidence":"a.ts:1"}]')`).run(now);
    db.prepare("INSERT INTO fixups (repo, number, from_head, state, reason, files, attempt, created_at) VALUES ('open-app', 1, 'h-open-app', 'failed', 'secret fixup reason', '[\"a.ts\"]', 1, ?)").run(now);
    type Trace = { events: { id: string; kind: string; summary: string }[] };
    type Detail = { fields: Record<string, unknown> };
    for (const login of ["reader", "maint"]) {
      const c = await signedIn(login);
      const staff = login === "maint";
      const events = (await c.get<Trace>("/api/items/open-app/1/trace")).events;
      const review = events.find((e) => e.id.startsWith("review:opus") && e.summary.includes("take-fix"))!;
      const fields = (await c.get<Detail>(`/api/items/open-app/1/trace/event?id=${encodeURIComponent(review.id)}`)).fields;
      assert.equal(fields.verdict, "take-fix", login);
      for (const k of ["reason", "fixes", "risks", "claims"]) assert.equal(k in fields, staff, `${login} ${k}`);
      const fix = events.find((e) => e.id.startsWith("fixup:"))!;
      assert.equal(fix.summary.includes("secret fixup reason"), staff, login);
      assert.equal("reason" in (await c.get<Detail>(`/api/items/open-app/1/trace/event?id=${encodeURIComponent(fix.id)}`)).fields, staff, login);
    }
    db.prepare("DELETE FROM opus_review_history WHERE repo = 'open-app'").run();
    db.prepare("DELETE FROM fixups WHERE repo = 'open-app'").run();
  });

  test("a quiet pull request's conversation has no model text for viewers; an ordinary item's is unchanged", async () => {
    const now = new Date().toISOString();
    db.prepare("INSERT INTO main.items (repo, number, kind, state, title, body, head_oid, author, created_at, updated_at) VALUES ('open-app', 2, 'pr', 'OPEN', 'Fix', 'b', 'h2', 'autocraft', ?, ?)").run(now, now);
    db.prepare("INSERT INTO security_scans (id, repo, state, started_by, started_at) VALUES (901, 'open-app', 'done', 'boss', ?)").run(now);
    db.prepare(`INSERT INTO security_findings (repo, number, scan_id, area, title, severity, urgent, state, refs, reach, impact, fingerprint, fix_pr, created_at, updated_at)
      VALUES ('open-app', 901, 901, 'a', 't', 'high', 0, 'landing', '[]', 'r', 'i', 'fp901', 2, ?, ?)`).run(now, now);
    for (const n of [1, 2]) {
      db.prepare("INSERT INTO main.conversations (repo, number, item_block, item_sig, created_at, created_by) VALUES ('open-app', ?, 'b', 's', ?, 'boss')").run(n, now);
      db.prepare("INSERT INTO main.conversation_turns (repo, number, kind, login, at, body, block, status, seq) VALUES ('open-app', ?, 'opus', 'opus', ?, 'the Opus analysis', 'blk', NULL, 1)").run(n, now);
    }
    type Conv = { turns: { body: string }[]; choices: unknown };
    const reader = await signedIn("reader"), maint = await signedIn("maint");
    assert.equal((await reader.get<Conv>("/api/conversations/open-app/1")).turns[0]!.body, "the Opus analysis");
    const quiet = await reader.get<Conv>("/api/conversations/open-app/2");
    assert.equal(quiet.turns.length, 1);
    assert.equal(quiet.turns[0]!.body, "");
    assert.equal(quiet.choices, null);
    assert.equal((await maint.get<Conv>("/api/conversations/open-app/2")).turns[0]!.body, "the Opus analysis");
    db.exec("DELETE FROM main.conversation_turns; DELETE FROM main.conversations; DELETE FROM security_findings WHERE number = 901");
  });

  test("an ever-tracked repo stays hidden when only its work rows remain; hidden names match whole names in free text", async () => {
    db.prepare("INSERT OR IGNORE INTO ever_tracked_repos (name) VALUES ('ghost-app')").run();
    const run = insertRun(db, { jobId: null, step: "classify", stage: 1, promptId: "p", promptVersion: "1", provider: "claude", model: "m", accountId: null, items: [{ repo: "ghost-app", number: 3 }], prompt: "p" });
    finishRun(db, run, { state: "done", output: "o" });
    db.prepare("DELETE FROM main.repos WHERE name = 'ghost-app'").run();
    assert.equal(await (await signedIn("boss")).status(`/api/agents/${run}`), 200);
    assert.equal(await (await signedIn("reader")).status(`/api/agents/${run}`), 404);
    const hidden = ["vault", "(security):vault"];
    assert.equal(blankIfHidden("held by vault#3", hidden), "");
    assert.equal(blankIfHidden("held by vault.", hidden), "");
    assert.equal(blankIfHidden("held by vault-launcher#3 and my.vault", hidden), "held by vault-launcher#3 and my.vault");
    assert.equal(blankIfHidden("(security):vault scan failed", hidden), "");
  });

  test("stage notes, job outcomes and the activity feed carry no reason text for viewers, on ordinary and quiet items", async () => {
    const now = new Date().toISOString();
    db.prepare("INSERT INTO security_scans (id, repo, state, started_by, started_at) VALUES (902, 'open-app', 'done', 'boss', ?)").run(now);
    db.prepare(`INSERT INTO security_findings (repo, number, scan_id, area, title, severity, urgent, state, refs, reach, impact, fingerprint, fix_pr, created_at, updated_at)
      VALUES ('open-app', 902, 902, 'a', 't', 'high', 0, 'landing', '[]', 'r', 'i', 'fp902', 2, ?, ?)`).run(now, now);
    const job = db.prepare("INSERT INTO jobs (step, params, requested_by, requested_at, state, repo) VALUES ('classify', '{}', 'cli', ?, 'done', 'open-app')").run(now);
    for (const n of [1, 2]) {
      db.prepare("INSERT INTO main.stages (repo, number, stage, at, actor, note) VALUES ('open-app', ?, 'hold', ?, 'review', 'SECRET stage note')").run(n, now);
      db.prepare("INSERT INTO main.job_items (job_id, repo, number, outcome, at) VALUES (?, 'open-app', ?, 'failed: SECRET job reason', ?)").run(job.lastInsertRowid, n, now);
      db.prepare("INSERT INTO main.fixups (repo, number, from_head, state, reason, files, attempt, created_at) VALUES ('open-app', ?, 'h', 'failed', 'SECRET fixup reason', '[]', 1, ?)").run(n, now);
      db.prepare("INSERT INTO main.decisions (id, kind, repo, number, question, options, asked_at, asked_by, answer, answered_at, answer_note) VALUES (?, 'scope', 'open-app', ?, 'q', '[]', ?, 'decide', 'withdrawn', ?, 'SECRET withdrawal')").run(`wd${n}`, n, now, now);
    }
    for (const login of ["reader", "maint"]) {
      const c = await signedIn(login);
      const staff = login === "maint";
      for (const n of [1, 2]) {
        const stages = (await c.get<Item>(`/api/items/open-app/${n}`)).stages;
        assert.deepEqual(stages.map((x) => x.note === "SECRET stage note"), [staff], `${login} ${n} stage note`);
        const outcome = (await c.get<JobDetail>(`/api/pipeline/jobs/${job.lastInsertRowid}`)).items.find((i) => i.number === n)!.outcome;
        assert.equal(outcome, staff ? "failed: SECRET job reason" : n === 2 ? null : "failed", `${login} ${n} job outcome`);
      }
      const feed = JSON.stringify(await c.get<unknown>("/api/activity?limit=500&kinds=github,plan,job,model-call,check,review,decision,write,step,conversation"));
      const trace = JSON.stringify(await c.get<unknown>("/api/items/open-app/1/trace"));
      for (const text of ["SECRET stage note", "SECRET job reason", "SECRET fixup reason", "SECRET withdrawal"]) {
        assert.equal(feed.includes(text), staff, `${login} activity ${text}`);
        assert.equal(trace.includes(text), staff, `${login} trace ${text}`);
      }
    }
    db.exec("DELETE FROM main.stages; DELETE FROM main.job_items; DELETE FROM main.fixups; DELETE FROM main.decisions WHERE id LIKE 'wd%'; DELETE FROM main.security_findings WHERE number = 902");
  });

  test("a build task for a repo that was never tracked is hidden from viewers", async () => {
    const task = db.prepare("INSERT INTO main.build_tasks (step, repo, number, head_sha, requires, plan, state, queued_at) VALUES ('smoke', 'ghost-repo', NULL, 'h', '{}', '[]', 'done', ?)").run(new Date().toISOString());
    assert.equal(await (await signedIn("reader")).status(`/api/tasks/${task.lastInsertRowid}`), 404);
    assert.equal(await (await signedIn("boss")).status(`/api/tasks/${task.lastInsertRowid}`), 200);
  });

});
