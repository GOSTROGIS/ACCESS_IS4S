// The user-token vault: a refresh race between two processes, a final refresh failure, and removal.
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { addLogin, removeLogin } from "../src/access.ts";
import { connect } from "../src/db.ts";
import { pkceChallenge, TokenBox } from "../src/dash/server/crypto.ts";
import { FakeProvider, type Tokens } from "../src/dash/server/provider.ts";
import { createSession, openTokens } from "../src/dash/server/sessions.ts";
import { dropSessionTokens, saveUserTokens } from "../src/dash/server/user-tokens.ts";
import { Vault } from "../src/github/vault.ts";
import { SCRATCH } from "./scratch.ts";

const REDIRECT = "http://localhost/cb";

function setup(name: string) {
  mkdirSync(SCRATCH, { recursive: true });
  const db = connect(join(SCRATCH, `${name}-${process.pid}.db`));
  const box = new TokenBox("test-session-key-test-session-key-0");
  const provider = new FakeProvider(null);
  const signIn = async (login: string, ttlMs: number): Promise<Tokens> => {
    provider.tokenTtlMs = ttlMs;
    const t = (await provider.exchange(provider.issueCode(login, pkceChallenge("v"), REDIRECT), "v", REDIRECT))!;
    provider.tokenTtlMs = 8 * 3_600_000;
    saveUserTokens(db, box, login, 1, t);
    return t;
  };
  return { db, box, provider, signIn };
}

test("two vaults refreshing one expired token end with one refresh and the same pair, and the session keeps running", async () => {
  const { db, box, provider, signIn } = setup("vault-race");
  const old = await signIn("example-user", -1000);
  const sid = createSession(db, box, "example-user", old, undefined);
  const a = new Vault(db, box, provider);
  const b = new Vault(db, box, provider);
  a.waitMs = b.waitMs = 0;
  const [ra, rb] = await Promise.all([a.userToken("example-user"), b.userToken("example-user")]);
  assert.ok(ra.ok && rb.ok);
  assert.equal(provider.refreshes, 1);
  assert.equal(ra.access, rb.access);
  assert.notEqual(ra.access, old.access);
  // The session held the same refresh token, so it took the new pair instead of being left with a dead one.
  const s = db.prepare("SELECT id_hash, token_enc FROM sessions").get() as { id_hash: string; token_enc: string };
  assert.equal(openTokens(box, s.token_enc, s.id_hash)?.access, ra.access);
  assert.ok(sid);
});

test("a refresh GitHub rejects marks the row and answers needs-sign-in, never another identity", async () => {
  const { db, box, provider, signIn } = setup("vault-fail");
  await signIn("example-user", -1000);
  provider.rejectRefresh = true;
  const v = new Vault(db, box, provider);
  v.waitMs = 0;
  assert.deepEqual(await v.userToken("example-user"), { ok: false, needsSignIn: true, why: "refresh-failed" });
  assert.equal((db.prepare("SELECT status FROM user_tokens").get() as { status: string }).status, "refresh-failed");
  provider.rejectRefresh = false;
  assert.equal((await v.userToken("example-user")).ok, false);
  assert.equal(provider.refreshes, 0);
  assert.deepEqual(await v.userToken("nobody"), { ok: false, needsSignIn: true, why: "no-token" });
  // Signing in again makes the token usable.
  await signIn("example-user", 8 * 3_600_000);
  assert.equal((await v.userToken("example-user")).ok, true);
});

test("removing a login deletes its token row and the sweep revokes the grant at the provider", async () => {
  const { db, box, provider, signIn } = setup("vault-remove");
  addLogin(db, "op", "example-user", "viewer", null);
  const t = await signIn("example-user", 8 * 3_600_000);
  removeLogin(db, "op", "example-user");
  assert.equal(db.prepare("SELECT 1 FROM user_tokens").get(), undefined);
  const v = new Vault(db, box, provider);
  assert.equal(await v.sweepRevocations(), 1);
  assert.deepEqual(provider.revokedGrants, [t.access]);
  assert.equal(db.prepare("SELECT 1 FROM user_token_revocations").get(), undefined);
});

test("revoking one session revokes only its token and keeps the login's newer sign-in", async () => {
  const { db, box, provider, signIn } = setup("vault-session");
  addLogin(db, "op", "example-user", "viewer", null);
  // The older session's token set expired; the sweep refreshes it once before revoking.
  const a = await signIn("example-user", -1000);
  createSession(db, box, "example-user", a, undefined);
  const s = db.prepare("SELECT id_hash, token_enc FROM sessions").get() as { id_hash: string; token_enc: string };
  const b = await signIn("example-user", 8 * 3_600_000);
  assert.ok(dropSessionTokens(db, "example-user", s.id_hash, s.token_enc));
  const v = new Vault(db, box, provider);
  assert.equal(await v.sweepRevocations(), 1);
  assert.deepEqual(provider.revokedGrants, []);
  assert.equal(provider.revoked.length, 1);
  assert.notEqual(provider.revoked[0], a.access);
  assert.equal((await v.userToken("example-user")).ok, true);
  assert.equal(openTokens(box, (db.prepare("SELECT token_enc FROM user_tokens").get() as { token_enc: string }).token_enc, "user_tokens:example-user")?.access, b.access);
  assert.equal(db.prepare("SELECT 1 FROM user_token_revocations").get(), undefined);
});
