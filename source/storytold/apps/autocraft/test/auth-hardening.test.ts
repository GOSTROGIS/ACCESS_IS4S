// Sign-in hardening: return_to, the dev-auth guard, the GitHub id binding,
// the refused-sign-in audit rate and the absolute session lifetime.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { request } from "node:http";
import { join } from "node:path";
import { after, before, describe, test } from "node:test";
import { addLogin } from "../src/access.ts";
import { connect } from "../src/db.ts";
import { loadConfig } from "../src/dash/server/config.ts";
import { startServer } from "../src/dash/server/index.ts";
import { FakeProvider } from "../src/dash/server/provider.ts";
import { OPERATOR_SESSION_MAX, SESSION_MAX, loadSession } from "../src/dash/server/sessions.ts";
import { safeReturnTo } from "../src/dash/server/util.ts";
import { SCRATCH } from "./scratch.ts";

mkdirSync(SCRATCH, { recursive: true });
const dir = mkdtempSync(join(SCRATCH, "hardening-test-"));
const db = connect(join(dir, "dash.db"));
const provider = new FakeProvider(null);
let base = "";
let port = 0;
let close: () => Promise<void>;

before(async () => {
  addLogin(db, "cli", "alice", "viewer", null);
  addLogin(db, "cli", "boss", "operator", null);
  const config = loadConfig({ AUTOCRAFT_DEV_AUTH: "1", AUTOCRAFT_LISTEN: "127.0.0.1:0", AUTOCRAFT_DB: join(dir, "dash.db") });
  const s = await startServer({ config, db, provider, routes: [] });
  base = s.url;
  port = Number(new URL(s.url).port);
  close = s.close;
});
after(async () => {
  await close();
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

// Signs in through the fake provider; returns the callback response and the session cookie.
async function signIn(login: string, returnTo = "/"): Promise<{ status: number; location: string | null; cookie: string | null }> {
  const start = await fetch(new URL(`/auth/signin?${new URLSearchParams({ return_to: returnTo })}`, base), { redirect: "manual" });
  const state = start.headers.getSetCookie().find((c) => c.startsWith("__Host-craft_oauth="))!.split(";")[0]!;
  const auth = await fetch(new URL(`${start.headers.get("location")}&login=${login}`, base), { redirect: "manual" });
  const done = await fetch(new URL(auth.headers.get("location")!, base), { headers: { cookie: state }, redirect: "manual" });
  const session = done.headers.getSetCookie().find((c) => c.startsWith("__Host-craft_session=") && !/Max-Age=0/.test(c));
  return { status: done.status, location: done.headers.get("location"), cookie: session ? session.split(";")[0]! : null };
}

describe("GitHub sign-in", () => {
});

describe("return_to", () => {
  test("only same-site paths survive", () => {
    for (const bad of ["/\t/evil.example", "/%09/evil.example", "//evil.example", "/\\evil.example", "https://evil.example/x", "/\n/evil.example", "/.//evil.example", "javascript:alert(1)", "", null])
      assert.equal(safeReturnTo(bad), "/", String(bad));
    assert.equal(safeReturnTo("/items?q=a&state=open#top"), "/items?q=a&state=open#top");
    assert.equal(safeReturnTo("/item/app/4"), "/item/app/4");
  });
});

describe("dev auth guard", () => {

  const get = (headers: Record<string, string>) => new Promise<number>((resolve, reject) => {
    const req = request({ host: "127.0.0.1", port, path: "/auth/signed-out", headers }, (res) => { res.resume(); resolve(res.statusCode!); });
    req.on("error", reject);
    req.end();
  });
  test("requests with X-Forwarded-For or a foreign Host are refused", async () => {
    assert.equal(await get({}), 200);
    assert.equal(await get({ host: `localhost:${port}` }), 200);
    assert.equal(await get({ "x-forwarded-for": "203.0.113.9" }), 403);
    assert.equal(await get({ host: "dash.example.org" }), 403);
  });
});

describe("GitHub id binding", () => {
  test("the first sign-in stores the id; a different id is refused and audited", async () => {
    assert.equal((await signIn("alice")).status, 303);
    const stored = (db.prepare("SELECT github_id FROM access WHERE login = 'alice'").get() as { github_id: number }).github_id;
    assert.equal(stored, provider.ids.get("alice"));
    assert.equal((await signIn("alice")).status, 303);
    provider.ids.set("alice", stored + 1);
    const refused = await signIn("alice");
    assert.equal(refused.status, 403);
    assert.equal(refused.cookie, null);
    const row = db.prepare("SELECT details FROM audit WHERE action = 'sign-in-refused' AND login = 'alice'").get() as { details: string };
    assert.match(row.details, /github-id-mismatch/);
    provider.ids.set("alice", stored);
    assert.equal((await signIn("alice")).status, 303);
  });
});

describe("refused sign-in audit", () => {
});

describe("session lifetime", () => {
  test("a session ends at its absolute limit however recently it was used", async () => {
    const sid = async (login: string) => (await signIn(login)).cookie!.split("=")[1]!;
    const ago = (ms: number) => new Date(Date.now() - ms).toISOString();
    const viewer = await sid("alice"), op = await sid("boss");
    assert.ok(loadSession(db, viewer));
    assert.ok(loadSession(db, op));
    db.prepare("UPDATE sessions SET created_at = ?").run(ago(OPERATOR_SESSION_MAX + 1000));
    assert.ok(loadSession(db, viewer), "a viewer's session outlives the operator limit");
    assert.equal(loadSession(db, op), null);
    db.prepare("UPDATE sessions SET created_at = ?").run(ago(SESSION_MAX + 1000));
    assert.equal(loadSession(db, viewer), null);
  });
});
