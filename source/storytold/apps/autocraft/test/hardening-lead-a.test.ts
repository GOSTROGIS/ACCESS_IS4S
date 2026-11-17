import assert from "node:assert/strict";
import { createCipheriv, hkdfSync, randomBytes } from "node:crypto";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { connect } from "../src/db.ts";
import { TokenBox } from "../src/dash/server/crypto.ts";
import { resealLegacyValues } from "../src/dash/server/reseal.ts";
import { addLogin, checkGithubId } from "../src/access.ts";
import { setGithubIdentity } from "../src/github/identity.ts";
import { parseWorkerConfig } from "../src/worker/config.ts";
import { SCRATCH } from "./scratch.ts";

const KEY = "hardening-session-key-hardening-0";

function sealLegacy(plain: string, aad: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", Buffer.from(hkdfSync("sha256", KEY, "craft-automation", "github-token", 32)), iv);
  c.setAAD(Buffer.from(aad));
  const body = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), body]).toString("base64url");
}

test("legacy-sealed values are re-sealed at startup, then open; open alone refuses them", () => {
  mkdirSync(SCRATCH, { recursive: true });
  const db = connect(join(SCRATCH, `hardening-a-${process.pid}.db`));
  const box = new TokenBox(KEY);
  const legacy = sealLegacy("{}", "user_tokens:alice");
  assert.equal(box.open(legacy, "user_tokens:alice"), null);
  db.prepare("INSERT INTO user_tokens (login, github_id, token_enc, version, updated_at, status) VALUES ('Alice', 1, ?, 1, 'x', 'ok')").run(legacy);
  assert.deepEqual(resealLegacyValues(db, box), { user_tokens: 1 });
  const now = (db.prepare("SELECT token_enc FROM user_tokens").get() as { token_enc: string }).token_enc;
  assert.equal(box.open(now, "user_tokens:alice"), "{}");
  assert.deepEqual(resealLegacyValues(db, box), {});
  db.close();
});

test("switching the identity queues revocation of stored user tokens", () => {
  mkdirSync(SCRATCH, { recursive: true });
  const db = connect(join(SCRATCH, `hardening-b-${process.pid}.db`));
  db.prepare("INSERT INTO user_tokens (login, github_id, token_enc, version, updated_at, status) VALUES ('bob', 2, 'enc', 1, 'x', 'ok')").run();
  assert.equal(setGithubIdentity(db, "op", "app"), true);
  assert.equal((db.prepare("SELECT COUNT(*) AS n FROM user_tokens").get() as { n: number }).n, 0);
  assert.equal((db.prepare("SELECT COUNT(*) AS n FROM user_token_revocations WHERE login = 'bob'").get() as { n: number }).n, 1);
  db.close();
});

test("an access entry added with a GitHub id rejects another id at sign-in", () => {
  mkdirSync(SCRATCH, { recursive: true });
  const db = connect(join(SCRATCH, `hardening-c-${process.pid}.db`));
  addLogin(db, "op", "carol", "viewer", null, 7);
  assert.equal(checkGithubId(db, "carol", 8), "mismatch");
  assert.equal(checkGithubId(db, "carol", 7), "ok");
  db.close();
});

test("coordinatorUrl: plain http only for loopback, private and cluster-internal hosts", () => {
  const cfg = (coordinatorUrl: string) => parseWorkerConfig({ coordinatorUrl, keyFile: "/k", workDir: "/w" });
  for (const u of ["http://127.0.0.1:8981", "http://localhost:1", "http://[::1]:1", "http://10.1.2.3", "http://172.20.0.1", "http://192.168.1.5", "http://100.64.0.9", "http://runner.svc", "http://a.b.cluster.local", "http://x.internal", "https://example.com"]) {
    assert.doesNotThrow(() => cfg(u), u);
  }
  for (const u of ["http://example.com", "http://8.8.8.8", "http://172.32.0.1", "http://100.128.0.1", "http://coordinator.invalid", "http://coord"]) {
    assert.throws(() => cfg(u), /plain http/, u);
  }
});
