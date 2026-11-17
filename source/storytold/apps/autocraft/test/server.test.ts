// Acceptance item 5: access checks, with the fake OAuth provider.
import assert from "node:assert/strict";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { after, before, describe, test } from "node:test";
import { setTimeout as sleep } from "node:timers/promises";
import { addLogin, removeLogin, setRole } from "../src/access.ts";
import { connect } from "../src/db.ts";
import type { Route } from "../src/dash/types.ts";
import { loadConfig } from "../src/dash/server/config.ts";
import { defaultRoutes, SESSION_COOKIE, startServer } from "../src/dash/server/index.ts";
import { FakeProvider } from "../src/dash/server/provider.ts";
import { SCRATCH } from "./scratch.ts";

mkdirSync(SCRATCH, { recursive: true });
const dir = mkdtempSync(join(SCRATCH, "server-test-"));
const permsFile = join(dir, "perms.json");
const setPerms = (p: Record<string, Record<string, string>>) => writeFileSync(permsFile, JSON.stringify(p));

// A stand-in for web/dist, with a file beside it that must never be served.
const APP_MARKER = "<!-- test app shell -->";
const SECRET_MARKER = "not-for-the-browser";
const webDist = join(dir, "web", "dist");
mkdirSync(join(webDist, "assets"), { recursive: true });
writeFileSync(join(webDist, "index.html"), `<!doctype html>${APP_MARKER}<div id="root"></div><script type="module" src="/assets/index-abc123.js"></script>`);
writeFileSync(join(webDist, "assets", "index-abc123.js"), "console.log('app')");
writeFileSync(join(dir, "web", "package.json"), JSON.stringify({ name: SECRET_MARKER }));
writeFileSync(join(dir, "secret.txt"), SECRET_MARKER);

let handlerRuns = 0;
// Stand-ins for the API's decision writes, which check permission the same way.
const testRoutes: Route[] = [
  { method: "GET", pattern: "/api/test/me", handler: (_db, req) => ({ json: { login: req.user.login, csrf: req.csrf } }) },
  { method: "GET", pattern: "/api/test/can/:repo", handler: async (_db, req) => ({ json: { can: await req.user.canWrite(req.params.repo!) } }) },
  {
    method: "POST", pattern: "/api/test/answer/:repo",
    handler: async (_db, req) => {
      handlerRuns++;
      return (await req.user.canWrite(req.params.repo!)) ? { json: { ok: true } } : { status: 403, json: { error: "no write" } };
    },
  },
  {
    method: "POST", pattern: "/api/test/batch",
    handler: async (_db, req) => {
      const repos = ((req.json as { repos?: string } | undefined)?.repos ?? "").split(",");
      const blocked = [];
      for (const r of repos) if (!(await req.user.canWrite(r))) blocked.push(r);
      return blocked.length ? { status: 403, json: { blocked } } : { json: { ok: true } };
    },
  },
];

const db = connect(join(dir, "dash.db"));
const provider = new FakeProvider(permsFile);
let base = "";
let close: () => Promise<void>;
let allRoutes: Route[];

before(async () => {
  setPerms({ maint: { photocraft: "write" }, boss: {} });
  addLogin(db, "cli", "boss", "operator", null);
  addLogin(db, "cli", "viewer1", "viewer", null);
  addLogin(db, "cli", "maint", "maintainer", null);
  const config = loadConfig({
    AUTOCRAFT_DEV_AUTH: "1", AUTOCRAFT_LISTEN: "127.0.0.1:0", AUTOCRAFT_DB: join(dir, "dash.db"), AUTOCRAFT_DEV_PERMS: permsFile,
    AUTOCRAFT_WEB_DIST: webDist,
  });
  allRoutes = [...(await defaultRoutes()), ...testRoutes];
  const s = await startServer({ config, db, provider, routes: allRoutes });
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
  async req(method: string, path: string, opts: { json?: Record<string, string>; html?: boolean; headers?: Record<string, string> } = {}): Promise<Response> {
    const headers: Record<string, string> = {
      ...opts.headers,
      cookie: [...this.jar].map(([k, v]) => `${k}=${v}`).join("; "),
      accept: opts.html === false ? "application/json" : "text/html",
    };
    let body: string | undefined;
    if (opts.json) {
      const { csrf, ...rest } = opts.json;
      headers["content-type"] = "application/json";
      if (csrf !== undefined) headers["x-csrf-token"] = csrf;
      body = JSON.stringify(rest);
    }
    const r = await fetch(new URL(path, base), { method, headers, body, redirect: "manual" });
    for (const c of r.headers.getSetCookie()) {
      const [kv] = c.split(";");
      const [k, v] = [kv!.slice(0, kv!.indexOf("=")), kv!.slice(kv!.indexOf("=") + 1)];
      if (/Max-Age=0/.test(c)) this.jar.delete(k);
      else this.jar.set(k, v);
    }
    return r;
  }
  get = (path: string, html = true) => this.req("GET", path, { html });
  post = (path: string, form: Record<string, string>) => this.req("POST", path, { json: form, html: false });
  async signIn(login: string): Promise<Response> {
    const start = await this.get("/auth/signin?return_to=/");
    assert.equal(start.status, 303);
    const auth = await this.get(`${start.headers.get("location")}&login=${login}`);
    assert.equal(auth.status, 303);
    return this.get(auth.headers.get("location")!);
  }
  async csrf(): Promise<string> {
    return ((await (await this.get("/api/test/me", false)).json()) as { csrf: string }).csrf;
  }
}

async function signedIn(login: string): Promise<Client> {
  const c = new Client();
  const r = await c.signIn(login);
  assert.equal(r.status, 303, `sign-in of ${login}`);
  return c;
}

const sample = (pattern: string) => pattern.replace(/:[a-z]+/gi, "x");
const audits = (action: string) => db.prepare("SELECT COUNT(*) AS n FROM audit WHERE action = ?").get(action) as { n: number };

describe("without a session", () => {
  test("every page leads to sign-in, everything else gets 401", async () => {
    const c = new Client();
    const paths = [...allRoutes.filter((r) => r.method === "GET").map((r) => sample(r.pattern)), "/assets/app.css", "/no-such-page"];
    for (const p of paths) {
      const page = await c.get(p);
      // A page with link-preview tags that moves on to sign-in, so preview crawlers never land on the identity provider.
      assert.equal(page.status, 200, p);
      const html = await page.text();
      assert.ok(html.includes(`<meta http-equiv="refresh" content="0;url=/auth/signin?${new URLSearchParams({ return_to: p }).toString().replaceAll("&", "&amp;")}">`), p);
      assert.match(html, /<meta property="og:image" content="[^"]*\/artcraft-mark\.png">/);
      assert.equal((await c.get(p, false)).status, 401, p);
    }
    for (const r of allRoutes.filter((r) => r.method === "POST")) {
      assert.equal((await c.post(sample(r.pattern), { csrf: "x" })).status, 401, r.pattern);
    }
    assert.equal(handlerRuns, 0);
  });
});

describe("sign-in", () => {
  test("a login not on the access list gets no session", async () => {
    const c = new Client();
    const r = await c.signIn("stranger");
    assert.equal(r.status, 403);
    assert.match(await r.text(), /Not authorised/);
    assert.equal(c.jar.has(SESSION_COOKIE), false);
    assert.equal((db.prepare("SELECT COUNT(*) AS n FROM sessions WHERE login = 'stranger'").get() as { n: number }).n, 0);
    assert.equal(audits("sign-in-refused").n, 1);
  });

  test("a session cookie is HttpOnly, Secure, SameSite=Lax; the token stays encrypted", async () => {
    const c = new Client();
    const r = await c.signIn("viewer1");
    const set = r.headers.getSetCookie().find((s) => s.startsWith(SESSION_COOKIE))!;
    assert.match(set, /HttpOnly/);
    assert.match(set, /Secure/);
    assert.match(set, /SameSite=Lax/);
    assert.match(set, /Path=\//);
    const page = await c.get("/api/access", false);
    assert.equal(page.status, 403);
    assert.match(page.headers.get("content-security-policy")!, /script-src 'self' 'nonce-[\w-]+'/);
    assert.equal(page.headers.get("x-frame-options"), "DENY");
    assert.equal(page.headers.get("referrer-policy"), "same-origin");
    const rows = db.prepare("SELECT token_enc FROM sessions").all() as { token_enc: string }[];
    for (const row of rows) assert.doesNotMatch(row.token_enc, /dev_/);
  });

  test("a sign-in callback with a forged state is refused", async () => {
    const c = new Client();
    const start = await c.get("/auth/signin");
    const auth = await c.get(`${start.headers.get("location")}&login=viewer1`);
    const cb = new URL(auth.headers.get("location")!, base);
    cb.searchParams.set("state", "forged");
    assert.equal((await c.get(cb.pathname + cb.search)).status, 400);
    assert.equal(c.jar.has(SESSION_COOKIE), false);
  });
});

// Writes that only touch the signed-in user's own record, open to every role.
const SELF_SERVICE = new Set(["/api/account/discord/unlink"])
// Open to every role too; refused with 503 here because no Discord key file is configured.
const SELF_SERVICE_NEEDS_DISCORD = "/api/account/discord/code";

describe("permissions", () => {
  test("a viewer can read, but every write returns 403", async () => {
    let c = await signedIn("viewer1");
    assert.equal((await c.get("/")).status, 200);
    assert.equal((await c.get("/api/access", false)).status, 403);
    let csrf = await c.csrf();
    const before = (db.prepare("SELECT COUNT(*) AS n FROM audit WHERE action <> 'sign-in'").get() as { n: number }).n;
    const posts = allRoutes.filter((r) => r.method === "POST");
    for (const [i, r] of posts.entries()) {
      // A new session every 50 routes stays under the per-session write limit.
      if (i && i % 50 === 0) { c = await signedIn("viewer1"); csrf = await c.csrf(); }
      const status = (await c.post(sample(r.pattern), { csrf, login: "viewer1", role: "operator", repos: "photocraft", id: "1" })).status;
      if (SELF_SERVICE.has(r.pattern)) assert.equal(status, 200, r.pattern);
      else if (r.pattern === SELF_SERVICE_NEEDS_DISCORD) assert.equal(status, 503, r.pattern);
      else if (r.operator) assert.equal(status, 403, r.pattern);
      else assert.ok(status >= 400, `${r.pattern}: ${status}`);
    }
    assert.equal((await c.post("/api/test/answer/photocraft", { csrf })).status, 403);
    assert.equal((db.prepare("SELECT COUNT(*) AS n FROM audit WHERE action <> 'sign-in'").get() as { n: number }).n, before);
  });

  test("a maintainer answers only in repos where they have write", async () => {
    const c = await signedIn("maint");
    const csrf = await c.csrf();
    assert.equal((await c.post("/api/test/answer/photocraft", { csrf })).status, 200);
    assert.equal((await c.post("/api/test/answer/filmcraft", { csrf })).status, 403);
  });

  test("a batch spanning a repo without write is refused", async () => {
    const c = await signedIn("maint");
    const csrf = await c.csrf();
    const r = await c.post("/api/test/batch", { csrf, repos: "photocraft,filmcraft" });
    assert.equal(r.status, 403);
    assert.deepEqual(await r.json(), { blocked: ["filmcraft"] });
    assert.equal((await c.post("/api/test/batch", { csrf, repos: "photocraft" })).status, 200);
  });


  test("a POST without the right CSRF token is refused before the handler runs", async () => {
    const c = await signedIn("maint");
    const runs = handlerRuns;
    assert.equal((await c.post("/api/test/answer/photocraft", {})).status, 403);
    assert.equal((await c.post("/api/test/answer/photocraft", { csrf: "wrong" })).status, 403);
    const other = await signedIn("viewer1");
    assert.equal((await c.post("/api/test/answer/photocraft", { csrf: await other.csrf() })).status, 403);
    assert.equal(handlerRuns, runs);
  });
});

// Sends the path exactly as written; fetch would resolve dot segments first.

describe("frontend", () => {



});

describe("tokens", () => {
  test("a permission check after the access token expires refreshes it", async () => {
    provider.tokenTtlMs = 300;
    const c = await signedIn("maint");
    provider.tokenTtlMs = 8 * 3_600_000;
    await sleep(350);
    db.prepare("DELETE FROM repo_permissions").run();
    const refreshes = provider.refreshes;
    assert.deepEqual(await (await c.get("/api/test/can/photocraft", false)).json(), { can: true });
    assert.equal(provider.refreshes, refreshes + 1);
  });

  test("a failed refresh ends the session", async () => {
    provider.tokenTtlMs = 300;
    const c = await signedIn("maint");
    provider.tokenTtlMs = 8 * 3_600_000;
    await sleep(350);
    db.prepare("DELETE FROM repo_permissions").run();
    provider.rejectRefresh = true;
    try {
      assert.deepEqual(await (await c.get("/api/test/can/photocraft", false)).json(), { can: false });
    } finally {
      provider.rejectRefresh = false;
    }
    assert.equal((await c.get("/")).status, 200);
  });
});

describe("access changes", () => {
  test("changing a role ends the login's sessions", async () => {
    addLogin(db, "cli", "promoted", "viewer", null);
    const c = await signedIn("promoted");
    setRole(db, "cli", "promoted", "operator");
    assert.match(await (await c.get("/")).text(), /http-equiv="refresh" content="0;url=\/auth\/signin/);
    removeLogin(db, "cli", "promoted");
  });
});

describe("roles", () => {
});

describe("startup refusals", () => {
  const secrets = (mode: number, body: object) => {
    const p = join(dir, `secrets-${mode.toString(8)}-${Object.keys(body).length}.json`);
    writeFileSync(p, JSON.stringify(body));
    chmodSync(p, mode);
    return p;
  };
  const full = { github_client_id: "id", github_client_secret: "secret", session_key: "k".repeat(43) };
  const env = (file: string) => ({ AUTOCRAFT_SECRETS_FILE: file, AUTOCRAFT_BASE_URL: "https://dash.example" });


  test("a world- or group-readable, missing or incomplete secrets file", () => {
    assert.throws(() => loadConfig(env(secrets(0o644, full))), /group or others/);
    assert.throws(() => loadConfig(env(secrets(0o640, full))), /group or others/);
    assert.throws(() => loadConfig(env(join(dir, "missing.json"))), /not found/);
    assert.throws(() => loadConfig(env(secrets(0o600, { github_client_id: "id" }))), /missing/);
    assert.throws(() => loadConfig({ AUTOCRAFT_SECRETS_FILE: secrets(0o600, full) }), /BASE_URL/);
    assert.equal(loadConfig(env(secrets(0o600, full))).baseUrl, "https://dash.example");
  });
});
