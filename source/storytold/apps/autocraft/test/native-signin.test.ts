import assert from "node:assert/strict";
import { createServer, request as httpRequest } from "node:http";
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { after, test } from "node:test";
import { addLogin, removeLogin } from "../src/access.ts";
import { connect } from "../src/db.ts";
import type { Config } from "../src/dash/server/config.ts";
import { NATIVE_ORIGINS } from "../src/dash/server/config.ts";
import { sha256hex, TokenBox } from "../src/dash/server/crypto.ts";
import { createApp } from "../src/dash/server/index.ts";
import { consumeNativeHandoff, issueNativeHandoff, nativeSessionCookie } from "../src/dash/server/native-signin.ts";
import { NativeGitHubProvider, type Provider } from "../src/dash/server/provider.ts";
import { deleteSession, loadSession, openTokens } from "../src/dash/server/sessions.ts";

const base = resolve(".native-signin-tests");
mkdirSync(base, { recursive: true });
const scratch = mkdtempSync(join(base, "case-"));
after(() => { assert.equal(dirname(realpathSync(scratch)), realpathSync(base)); assert.ok(basename(scratch).startsWith("case-")); rmSync(scratch, { recursive: true, force: true }); });
const credential = "native-test-fixture-credential-not-a-real-token";
const owner = { login: "FixtureOwner", id: 42 };
const verified = { identity: async () => owner };
let count = 0;
function fixture(product: "access" | "slipcurve" = "access") {
  const db = connect(join(scratch, `db-${count++}.sqlite`));
  addLogin(db, "native-install", owner.login, "operator", null, owner.id);
  const config: Config = { host: "127.0.0.1", port: product === "access" ? 8993 : 8994, baseUrl: NATIVE_ORIGINS[product], dbPath: "unused",
    webDist: scratch, devAuth: false, devPermsFile: null, devTokenTtlMs: null, trustProxy: false, imageCacheDir: null, secretsFile: null,
    secrets: { githubClientId: null, githubClientSecret: null, sessionKey: `separate-${product}-${count}-` + "s".repeat(40), app: null,
      nativeOwner: { product, login: owner.login, githubId: owner.id } } };
  return { db, config };
}
const codeOf = (url: string) => new URL(url).hash.slice(1);
function call(url: string, options: { method?: string; headers?: Record<string, string>; body?: string | URLSearchParams; redirect?: string }) {
  return new Promise<{ status: number; headers: Headers; text(): Promise<string>; json(): Promise<unknown> }>((resolve, reject) => {
    const req = httpRequest(url, { method: options.method, headers: options.headers }, res => {
      const chunks: Buffer[] = []; res.on("data", chunk => chunks.push(chunk));
      res.on("end", () => {
        const body = Buffer.concat(chunks).toString("utf8"), headers = new Headers();
        for (const [key, value] of Object.entries(res.headers)) for (const entry of Array.isArray(value) ? value : value ? [value] : []) headers.append(key, entry);
        resolve({ status: res.statusCode!, headers, text: async () => body, json: async () => JSON.parse(body) });
      });
    });
    req.on("error", reject); req.end(options.body?.toString());
  });
}

test("native CLI identity proof creates only a hashed, sealed one-use handoff and a normal production session", async () => {
  const { db, config } = fixture();
  try {
    const issued = await issueNativeHandoff(config, db, credential, verified);
    assert.match(codeOf(issued.url), /^[A-Za-z0-9_-]{43}$/);
    const held = JSON.stringify(db.prepare("SELECT * FROM native_signin_handoffs").all());
    assert.ok(!held.includes(credential) && !held.includes(codeOf(issued.url)));
    const id = consumeNativeHandoff(config, db, codeOf(issued.url), "fixture browser");
    assert.ok(id);
    const session = loadSession(db, id)!;
    assert.equal(session.login, owner.login); assert.equal(session.role, "operator");
    assert.equal(openTokens(new TokenBox(config.secrets.sessionKey), session.tokenEnc, session.idHash)?.access, credential);
    assert.equal(consumeNativeHandoff(config, db, codeOf(issued.url)), null);
    assert.equal((db.prepare("SELECT count(*) AS n FROM sessions").get() as { n: number }).n, 1);
  } finally { db.close(); }
});

test("owner, immutable GitHub ID, access membership and header-safe credential checks fail closed", async () => {
  const { db, config } = fixture();
  try {
    for (const identity of [null, { login: "SomeoneElse", id: 42 }, { login: owner.login, id: 43 }]) {
      await assert.rejects(issueNativeHandoff(config, db, credential, { identity: async () => identity }));
    }
    await assert.rejects(issueNativeHandoff(config, db, credential + "\r\n", verified));
    db.prepare("UPDATE access SET github_id = 43").run();
    await assert.rejects(issueNativeHandoff(config, db, credential, verified));
    removeLogin(db, "native-install", owner.login);
    await assert.rejects(issueNativeHandoff(config, db, credential, verified));
  } finally { db.close(); }
});

test("native CLI binding names only the newest consumed session hash and cannot fall back after local logout", async () => {
  const { db, config } = fixture();
  try {
    const issue = async () => consumeNativeHandoff(config, db, codeOf((await issueNativeHandoff(config, db, credential, verified)).url))!;
    const first = await issue(), second = await issue();
    const binding = () => (db.prepare("SELECT value FROM settings WHERE key='native_cli_session.access'").get() as { value: string }).value;
    assert.equal(binding(), sha256hex(second)); assert.notEqual(binding(), first); assert.notEqual(binding(), second);
    assert.ok(loadSession(db, first) && loadSession(db, second));
    const stored = JSON.stringify(db.prepare("SELECT * FROM settings").all());
    assert.ok(!stored.includes(credential) && !stored.includes(first) && !stored.includes(second));
    deleteSession(db, second);
    assert.equal(db.prepare("SELECT 1 FROM sessions WHERE id_hash=?").get(binding()), undefined);
    assert.ok(loadSession(db, first), "An older browser session still exists; a native CLI must never choose it as a fallback");
    const pending = await issueNativeHandoff(config, db, credential, verified);
    db.exec("CREATE TRIGGER native_audit_refusal BEFORE INSERT ON audit BEGIN SELECT RAISE(ABORT,'fixture failure'); END");
    assert.throws(() => consumeNativeHandoff(config, db, codeOf(pending.url)), /fixture failure/);
    assert.equal(binding(), sha256hex(second), "The binding and session creation commit atomically with handoff consumption");
    assert.equal((db.prepare("SELECT count(*) AS n FROM sessions").get() as { n: number }).n, 1);
  } finally { db.close(); }
});

test("expired, removed-access and cross-product handoffs never mint sessions", async () => {
  const a = fixture(), b = fixture("slipcurve");
  try {
    const time = Date.now();
    const expired = await issueNativeHandoff(a.config, a.db, credential, verified, time);
    assert.equal(consumeNativeHandoff(a.config, a.db, codeOf(expired.url), undefined, time + 60_001), null);
    const issued = await issueNativeHandoff(a.config, a.db, credential, verified);
    assert.equal(consumeNativeHandoff(b.config, b.db, codeOf(issued.url)), null);
    const id = consumeNativeHandoff(a.config, a.db, codeOf(issued.url))!;
    assert.equal(loadSession(b.db, id), null);
    assert.notEqual(nativeSessionCookie(a.config), nativeSessionCookie(b.config));
    const pending = await issueNativeHandoff(a.config, a.db, credential, verified);
    removeLogin(a.db, "native-install", owner.login);
    assert.equal(consumeNativeHandoff(a.config, a.db, codeOf(pending.url)), null);
  } finally { a.db.close(); b.db.close(); }
});

test("non-product origins, proxy trust and development authentication cannot enable native issuance", async () => {
  const { db, config } = fixture();
  try {
    for (const changed of [{ baseUrl: "http://127.0.0.1:8993" }, { host: "0.0.0.0" }, { trustProxy: true }, { devAuth: true }, { port: 8994 }]) {
      await assert.rejects(issueNativeHandoff({ ...config, ...changed }, db, credential, verified));
    }
  } finally { db.close(); }
});

test("borrowed native credentials can never revoke the external credential-manager authorization", async () => {
  const provider: Provider = new NativeGitHubProvider();
  await assert.rejects(provider.revoke(credential), /credential manager/);
  await assert.rejects(provider.revokeGrant(credential), /cannot be revoked/);
  assert.equal(await provider.refresh("not a native refresh token"), null);
});

test("production HTTP handoff preserves host/origin, cookies, identity, permissions, CSRF, replay and local-only signout", async () => {
  const { db, config } = fixture();
  let permissions = 0, writes = 0;
  const provider: Provider = new NativeGitHubProvider();
  provider.permission = async access => { assert.equal(access, credential); permissions++; return "admin"; };
  const app = createApp({ config, db, provider, routes: [
    { method: "GET", pattern: "/api/test/me", handler: async (_db, req) => ({ json: { login: req.user.login, role: req.user.role, canRead: await req.user.canRead("fixture-repo") } }) },
    { method: "POST", pattern: "/api/test/write", handler: async (_db, req) => { writes++; return { json: { ok: await req.user.canWrite("fixture-repo") } }; } },
  ] });
  const server = createServer((req, res) => void app.handle(req, res));
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as { port: number };
  const url = `http://127.0.0.1:${address.port}`;
  const headers = { host: new URL(config.baseUrl!).host, origin: config.baseUrl!, "content-type": "application/x-www-form-urlencoded" };
  try {
    const page = await call(url + "/auth/native", { headers });
    assert.equal(page.status, 200); assert.equal(page.headers.get("referrer-policy"), "no-referrer");
    assert.match(page.headers.get("content-security-policy")!, /script-src 'nonce-/);
    assert.match(await page.text(), /history.replaceState/);
    assert.equal(page.headers.get("set-cookie"), null);
    assert.equal((await call(url + "/api/test/me", { headers })).status, 401);
    const issued = await issueNativeHandoff(config, db, credential, verified);
    const body = new URLSearchParams({ code: codeOf(issued.url) });
    assert.equal((await call(url + "/auth/native/finish", { method: "POST", headers: { ...headers, host: "attacker.invalid" }, body })).status, 403);
    assert.equal((await call(url + "/auth/native/finish", { method: "POST", headers: { ...headers, origin: "https://attacker.invalid" }, body })).status, 403);
    const finish = await call(url + "/auth/native/finish", { method: "POST", headers, body, redirect: "manual" });
    assert.equal(finish.status, 303); assert.equal(finish.headers.get("location"), "/");
    const setCookie = finish.headers.get("set-cookie")!;
    assert.match(setCookie, /^__Host-access_autocraft_session=/);
    assert.match(setCookie, /HttpOnly; Secure; SameSite=Lax/);
    assert.ok(!setCookie.includes(credential));
    const cookie = setCookie.split(";")[0]!;
    assert.equal((await call(url + "/auth/native/finish", { method: "POST", headers, body })).status, 400);
    const me = await call(url + "/api/test/me", { headers: { ...headers, cookie } });
    assert.deepEqual(await me.json(), { login: owner.login, role: "operator", canRead: true });
    assert.equal(permissions, 1);
    assert.equal((await call(url + "/api/test/write", { method: "POST", headers: { ...headers, "content-type": "application/json", cookie }, body: "{}" })).status, 403);
    const csrf = me.headers.get("x-csrf-token")!;
    assert.equal((await call(url + "/api/test/write", { method: "POST", headers: { ...headers, "content-type": "application/json", "x-csrf-token": csrf, cookie }, body: "{}" })).status, 200);
    assert.equal(writes, 1);
    const pending = await issueNativeHandoff(config, db, credential, verified);
    const signout = await call(url + "/api/signout", { method: "POST", headers: { ...headers, "content-type": "application/json", "x-csrf-token": csrf, cookie }, body: "{}" });
    assert.equal(signout.status, 204);
    assert.equal((await call(url + "/api/test/me", { headers: { ...headers, cookie } })).status, 401);
    assert.equal(consumeNativeHandoff(config, db, codeOf(pending.url)), null);
  } finally { app.close(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); db.close(); }
});
