// Contributors, tracked repos and access over the JSON API, through HTTP with
// the fake OAuth provider: who may write, what non-operators see, and that
// each write takes effect and leaves one audit row.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { after, before, describe, test } from "node:test";
import type { AccessOverview, AuditPage, Contributor, ContributorList, RulePreview, TrackedRepo } from "../web/src/api/types.ts";
import { addLogin } from "../src/access.ts";
import { connect } from "../src/db.ts";
import { scopeToTracked } from "../src/repos.ts";
import { apiRoutes } from "../src/dash/api/index.ts";
import { loadConfig } from "../src/dash/server/config.ts";
import { startServer } from "../src/dash/server/index.ts";
import { FakeProvider } from "../src/dash/server/provider.ts";
import { SCRATCH } from "./scratch.ts";

const NOTE = "OVERRIDE-NOTE-m4x";
mkdirSync(SCRATCH, { recursive: true });
const dir = mkdtempSync(join(SCRATCH, "admin-test-"));
const dbFile = join(dir, "dash.db");
const permsFile = join(dir, "perms.json");
writeFileSync(permsFile, "{}");

const db = connect(dbFile);
let base = "";
let close: () => Promise<void>;

before(async () => {
  const ins = db.prepare("INSERT INTO items (repo, number, kind, state, title, author, created_at, updated_at, merged_at) VALUES (?,?,?,?,?,?,?,?,?)");
  let n = 0;
  const prs = (author: string, merged: number, closed: number, open = 0) => {
    for (const [state, k] of [["MERGED", merged], ["CLOSED", closed], ["OPEN", open]] as const) {
      for (let i = 0; i < k; i++) ins.run("photocraft", ++n, "pr", state, "t", author, "2026-10-01T00:00:00Z", "2026-10-01T00:00:00Z", state === "MERGED" ? "2026-10-02T00:00:00Z" : null);
    }
  };
  prs("veteran", 10, 1);
  prs("steady", 4, 1, 2);
  prs("newbie", 1, 3);
  // Each login's history is bound to the account the lookup below gives it.
  for (const l of ["veteran", "steady", "newbie"]) db.prepare("INSERT INTO author_ids (login, id) VALUES (?, ?)").run(l, 5000 + l.length);
  db.prepare("INSERT INTO repos (name, visibility, open_prs, open_issues) VALUES ('photocraft', 'public', 2, 0), ('not-yet', 'public', 5, 7)").run();
  addLogin(db, "cli", "boss", "operator", null);
  addLogin(db, "cli", "viewer1", "viewer", null);
  addLogin(db, "cli", "maint", "maintainer", null);
  scopeToTracked(db);
  const config = loadConfig({ AUTOCRAFT_DEV_AUTH: "1", AUTOCRAFT_LISTEN: "127.0.0.1:0", AUTOCRAFT_DB: dbFile, AUTOCRAFT_DEV_PERMS: permsFile });
  const provider = new FakeProvider(permsFile);
  // The id GitHub would give a login: the one the fake provider signs it in with.
  const githubUserId = async (l: string): Promise<number | null> => {
    if (l === "ghost") return null;
    const id = 5000 + l.length;
    provider.ids.set(l.toLowerCase(), id);
    return id;
  };
  const s = await startServer({ config, db, provider, routes: apiRoutes({ githubUserId }) });
  base = s.url;
  close = s.close;
});
after(async () => {
  await close();
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

class Client {
  jar = new Map<string, string>();
  csrf = "";
  async req(method: string, path: string, body?: unknown): Promise<Response> {
    const headers: Record<string, string> = { cookie: [...this.jar].map(([k, v]) => `${k}=${v}`).join("; "), accept: "application/json" };
    if (method === "POST") headers["x-csrf-token"] = this.csrf;
    if (body !== undefined) headers["content-type"] = "application/json";
    const r = await fetch(new URL(path, base), { method, headers, body: body === undefined ? undefined : JSON.stringify(body), redirect: "manual" });
    for (const c of r.headers.getSetCookie()) {
      const [kv] = c.split(";");
      const k = kv!.slice(0, kv!.indexOf("=")), v = kv!.slice(kv!.indexOf("=") + 1);
      if (/Max-Age=0/.test(c)) this.jar.delete(k);
      else this.jar.set(k, v);
    }
    return r;
  }
  async json<T>(method: string, path: string, body?: unknown, status = 200): Promise<T> {
    const r = await this.req(method, path, body);
    const text = await r.text();
    assert.equal(r.status, status, `${method} ${path}: ${text}`);
    return (text ? JSON.parse(text) : undefined) as T;
  }
  get = <T>(path: string, status = 200) => this.json<T>("GET", path, undefined, status);
  post = <T>(path: string, body?: unknown, status = 200) => this.json<T>("POST", path, body, status);
}

async function signedIn(login: string): Promise<Client> {
  const c = new Client();
  const start = await c.req("GET", "/auth/signin?return_to=/");
  const auth = await c.req("GET", `${start.headers.get("location")}&login=${login}`);
  const done = await c.req("GET", auth.headers.get("location")!);
  assert.equal(done.status, 303, `sign-in of ${login}`);
  c.csrf = (await c.req("GET", "/api/me")).headers.get("x-csrf-token") ?? "";
  return c;
}

const auditRows = () => (db.prepare("SELECT COUNT(*) AS n FROM audit WHERE action NOT IN ('sign-in')").get() as { n: number }).n;
const lastAudit = () => db.prepare("SELECT login, action, target FROM audit ORDER BY rowid DESC LIMIT 1").get() as { login: string; action: string; target: string };
const row = (l: ContributorList, login: string) => l.contributors.find((c) => c.login === login)!;

const WRITES: [string, unknown][] = [
  ["/api/contributors/rule", { minMerged: 1, minRate: 0 }],
  ["/api/contributors/newbie/override", { status: "allow", note: "x" }],
  ["/api/repos/track", { name: "not-yet" }],
  ["/api/repos/untrack", { name: "photocraft" }],
  ["/api/access/add", { login: "someone", role: "operator" }],
  ["/api/access/remove", { login: "boss" }],
  ["/api/access/role", { login: "viewer1", role: "operator" }],
  ["/api/access/sessions/revoke", { id: 1 }],
];

describe("admin api", () => {
  test("a non-operator gets 403 on every write and operator read, and only operators and maintainers see override notes", async () => {
    const boss = await signedIn("boss");
    await boss.post("/api/contributors/steady/override", { status: "deny", note: NOTE });
    for (const login of ["viewer1", "maint"]) {
      const c = await signedIn(login);
      const before = auditRows();
      for (const [path, body] of WRITES) await c.post(path, body, 403);
      for (const path of ["/api/contributors/rule-preview?minMerged=1&minRate=0", "/api/access"]) await c.get(path, 403);
      assert.equal(auditRows(), before, login);
      const list = await c.get<ContributorList>("/api/contributors");
      assert.equal(row(list, "steady").override, "deny");
      assert.equal(JSON.stringify(list).includes(NOTE), login === "maint", login);
    }
    assert.equal(row(await boss.get<ContributorList>("/api/contributors"), "steady").overrideNote, NOTE);
    await boss.post("/api/contributors/steady/override", { status: null });
  });

  test("an override changes the effective status and is audited without its note", async () => {
    const boss = await signedIn("boss");
    let c = row(await boss.get<ContributorList>("/api/contributors"), "veteran");
    assert.deepEqual([c.tier, c.autoTier, c.override], ["whitelisted", "whitelisted", null]);
    const before = auditRows();
    c = await boss.post<Contributor>("/api/contributors/veteran/override", { status: "deny", note: NOTE });
    assert.deepEqual([c.tier, c.autoTier, c.override, c.overrideBy], ["override-deny", "whitelisted", "deny", "boss"]);
    assert.equal(auditRows(), before + 1);
    assert.deepEqual({ ...lastAudit() }, { login: "boss", action: "override", target: "veteran" });
    const details = (db.prepare("SELECT details FROM audit ORDER BY rowid DESC LIMIT 1").get() as { details: string }).details;
    assert.ok(!details.includes(NOTE));
    const denied = await boss.get<ContributorList>("/api/contributors?tier=override-deny");
    assert.deepEqual(denied.contributors.map((x) => x.login), ["veteran"]);
    // Without a note field the note stays.
    c = await boss.post<Contributor>("/api/contributors/veteran/override", { status: "allow" });
    assert.equal(c.overrideNote, NOTE);
    c = await boss.post<Contributor>("/api/contributors/veteran/override", { status: null });
    assert.deepEqual([c.tier, c.override], ["whitelisted", null]);
    await boss.post("/api/contributors/not%20a%20login/override", { status: "allow" }, 400);
  });

  test("the rule preview counts the change, and the saved rule takes effect", async () => {
    const boss = await signedIn("boss");
    const now = await boss.get<ContributorList>("/api/contributors");
    assert.deepEqual(now.rule, { minMerged: 5, minRate: 0.6 });
    assert.equal(now.byTier.whitelisted, 1);
    const quiet = auditRows();
    const p = await boss.get<RulePreview>("/api/contributors/rule-preview?minMerged=3&minRate=0.7");
    assert.deepEqual([p.authors, p.allowedNow, p.allowedAfter], [3, 1, 2]);
    assert.deepEqual(p.gained, { count: 1, logins: ["steady"] });
    assert.deepEqual(p.lost, { count: 0, logins: [] });
    assert.equal(auditRows(), quiet, "a preview writes nothing");
    await boss.get("/api/contributors/rule-preview?minMerged=-1&minRate=0.7", 400);
    await boss.post("/api/contributors/rule", { minMerged: 3, minRate: 1.5 }, 400);
    const before = auditRows();
    assert.deepEqual(await boss.post("/api/contributors/rule", { minMerged: 3, minRate: 0.7 }), { minMerged: 3, minRate: 0.7 });
    assert.equal(auditRows(), before + 1);
    assert.equal(lastAudit().action, "rule");
    const after = await boss.get<ContributorList>("/api/contributors?sort=login&desc=0");
    assert.deepEqual(after.contributors.map((c) => [c.login, c.tier]), [["newbie", "not"], ["steady", "whitelisted"], ["veteran", "whitelisted"]]);
    assert.equal((await boss.get<ContributorList>("/api/contributors?q=STEA")).total, 1);
    await boss.post("/api/contributors/rule", { minMerged: 5, minRate: 0.6 });
  });

  test("operators track and untrack repos, each audited", async () => {
    const boss = await signedIn("boss");
    const repos = await boss.get<TrackedRepo[]>("/api/repos/all");
    const nyet = repos.find((r) => r.name === "not-yet")!;
    assert.deepEqual([nyet.tracked, nyet.openPrs, nyet.mirrored], [false, 5, 0]);
    const before = auditRows();
    const after = await boss.post<TrackedRepo[]>("/api/repos/track", { name: "not-yet" });
    assert.equal(after.find((r) => r.name === "not-yet")!.tracked, true);
    await boss.post("/api/repos/track", { name: "not-yet" }, 409);
    await boss.post("/api/repos/track", { name: "bad name" }, 400);
    await boss.post("/api/repos/untrack", { name: "not-yet" });
    assert.equal(auditRows(), before + 2);
    assert.equal(lastAudit().action, "repo-untrack");
  });


  test("access: add, change role, revoke a session; the last operator can't be removed or demoted", async () => {
    const boss = await signedIn("boss");
    const before = auditRows();
    await boss.post("/api/access/remove", { login: "boss" }, 400);
    await boss.post("/api/access/role", { login: "boss", role: "viewer" }, 400);
    assert.equal(auditRows(), before);
    let a = await boss.post<AccessOverview>("/api/access/add", { login: "second", role: "operator", note: "backup" });
    assert.equal(a.entries.find((e) => e.login === "second")!.role, "operator");
    await boss.post("/api/access/add", { login: "second", role: "viewer" }, 400);
    await boss.post("/api/access/add", { login: "x", role: "owner" }, 400);
    await boss.post("/api/access/add", { login: "ghost", role: "viewer" }, 400);

    const victim = await signedIn("second");
    a = await boss.get<AccessOverview>("/api/access");
    assert.equal(a.entries.find((e) => e.login === "second")!.sessions, 1);
    assert.ok(a.sessions.some((s) => s.login === "boss" && s.current));
    const sid = a.sessions.find((s) => s.login === "second")!.id;
    await boss.post("/api/access/sessions/revoke", { id: sid });
    assert.equal((await victim.req("GET", "/api/me")).status, 401);
    await boss.post("/api/access/sessions/revoke", { id: sid }, 404);

    // With two operators, one can step down; then the other is the last one.
    await boss.post("/api/access/role", { login: "second", role: "viewer" });
    await boss.post("/api/access/role", { login: "second", role: "viewer" }, 409);
    await boss.post("/api/access/role", { login: "boss", role: "maintainer" }, 400);
    await boss.post("/api/access/remove", { login: "second" });
    assert.equal(auditRows(), before + 4);

    const log = await boss.get<AuditPage>("/api/audit?action=access-role");
    assert.equal(log.total, 1);
    assert.deepEqual(log.entries[0]!.details, { from: "operator", to: "viewer", sessions: 0 });
    const bySecond = await boss.get<AuditPage>("/api/audit?login=second");
    assert.deepEqual(bySecond.entries.map((e) => e.action), ["access-remove", "access-role", "session-revoke", "sign-in", "access-add"]);
    await boss.get("/api/audit?action=nope", 400);
  });
});
