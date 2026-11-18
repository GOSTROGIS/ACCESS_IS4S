import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { join } from 'node:path';
import test from 'node:test';
import { boundNativeTokens, ghEnvironment, validateGhArguments } from './linux-gh.mjs';
import { TokenBox, sha256hex } from '../../apps/autocraft/src/dash/server/crypto.ts';
import { createSession, openTokens, sessionEndsAt } from '../../apps/autocraft/src/dash/server/sessions.ts';

const credential = 'native-gh-fixture-not-a-real-credential';
const core = { TokenBox, openTokens, sessionEndsAt };
function fixture(t) {
  const db = new DatabaseSync(':memory:'); t.after(() => db.close());
  db.exec(`CREATE TABLE settings(key TEXT PRIMARY KEY,value TEXT);
    CREATE TABLE access(login TEXT PRIMARY KEY,role TEXT,github_id INTEGER);
    CREATE TABLE sessions(id_hash TEXT PRIMARY KEY,login TEXT,csrf TEXT,token_enc TEXT,created_at TEXT,last_seen TEXT,expires_at TEXT,user_agent TEXT);
    INSERT INTO access VALUES('FixtureOwner','operator',42)`);
  const config = { secrets: { sessionKey: 's'.repeat(48), nativeOwner: { product: 'access', login: 'FixtureOwner', githubId: 42 } } };
  const tokens = { access: credential, expiresAt: null, refresh: null, refreshExpiresAt: null };
  const id = createSession(db, new TokenBox(config.secrets.sessionKey), 'FixtureOwner', tokens, 'fixture browser');
  const hash = sha256hex(id);
  db.prepare('INSERT INTO settings VALUES(?,?)').run('native_cli_session.access', hash);
  return { db, config, tokens, id, hash };
}

test('native GitHub credential adapter opens only the exact bound current production session and keeps plaintext out of settings', t => {
  const f = fixture(t);
  assert.equal(boundNativeTokens(f.db, f.config, 'access', core).access, credential);
  assert.ok(!JSON.stringify(f.db.prepare('SELECT * FROM settings').all()).includes(credential));
  assert.ok(!JSON.stringify(f.db.prepare('SELECT * FROM sessions').all()).includes(credential));
});

test('logout of the bound session refuses even when another older owner session remains', t => {
  const f = fixture(t);
  createSession(f.db, new TokenBox(f.config.secrets.sessionKey), 'FixtureOwner', f.tokens, 'older independent browser');
  f.db.prepare('DELETE FROM sessions WHERE id_hash=?').run(f.hash);
  assert.equal(f.db.prepare('SELECT count(*) AS n FROM sessions').get().n, 1);
  assert.throws(() => boundNativeTokens(f.db, f.config, 'access', core), /unavailable/);
});

test('role removal, immutable-ID mismatch, expired session and maximum operator age fail closed', t => {
  for (const sql of ["UPDATE access SET role='reader'", 'UPDATE access SET github_id=43', 'DELETE FROM access',
    "UPDATE sessions SET expires_at='2000-01-01T00:00:00.000Z'", "UPDATE sessions SET created_at='2000-01-01T00:00:00.000Z'"]) {
    const f = fixture(t); f.db.exec(sql);
    assert.throws(() => boundNativeTokens(f.db, f.config, 'access', core), /unavailable/);
  }
});

test('cross-product bindings, corrupted sealed tokens, expiry and invalid token headers cannot authenticate', t => {
  const f = fixture(t);
  assert.throws(() => boundNativeTokens(f.db, f.config, 'slipcurve', core), /unavailable/);
  f.db.prepare('UPDATE sessions SET token_enc=?').run('corrupt');
  assert.throws(() => boundNativeTokens(f.db, f.config, 'access', core), /unavailable/);
  for (const tokens of [{ ...f.tokens, expiresAt: 1 }, { ...f.tokens, access: credential + '\r\n' }]) {
    f.db.prepare('UPDATE sessions SET token_enc=?').run(new TokenBox(f.config.secrets.sessionKey).seal(JSON.stringify(tokens), f.hash));
    assert.throws(() => boundNativeTokens(f.db, f.config, 'access', core), /unavailable/);
  }
});

test('upstream explicit GH_TOKEN keeps priority only after session proof; unrelated Git and credential injections are scrubbed', t => {
  const f = fixture(t);
  const tokens = boundNativeTokens(f.db, f.config, 'access', core);
  const explicit = 'explicit-installation-fixture-credential';
  const inherited = { PATH: '/untrusted/bin', LANG: 'C.UTF-8', GH_TOKEN: explicit, GITHUB_TOKEN: 'must-not-copy',
    GH_ENTERPRISE_TOKEN: 'must-not-copy', GH_HOST: 'untrusted.invalid', GIT_SSH_COMMAND: 'must-not-execute', GIT_CONFIG_VALUE_0: 'secret',
    NODE_OPTIONS: '--require /untrusted/file', CLAUDE_CODE_OAUTH_TOKEN: 'must-not-copy' };
  const env = ghEnvironment(inherited, '/private/access', tokens);
  assert.equal(env.GH_TOKEN, explicit); assert.equal(env.GH_HOST, 'github.com');
  assert.equal(env.GH_CONFIG_DIR, join('/private/access', 'gh-native')); assert.equal(env.PATH, '/opt/node/bin:/usr/bin:/bin');
  for (const name of ['GITHUB_TOKEN', 'GH_ENTERPRISE_TOKEN', 'GIT_SSH_COMMAND', 'GIT_CONFIG_VALUE_0', 'NODE_OPTIONS', 'CLAUDE_CODE_OAUTH_TOKEN']) assert.equal(env[name], undefined);
  assert.equal(ghEnvironment({}, '/private/access', tokens).GH_TOKEN, credential);
  assert.throws(() => ghEnvironment({ GH_TOKEN: explicit + '\n' }, '/private/access', tokens), /unavailable/);
  assert.equal(ghEnvironment({ GH_REPO: 'github.com/FixtureOwner/project' }, '/private/access', tokens).GH_REPO, 'github.com/FixtureOwner/project');
  assert.throws(() => ghEnvironment({ GH_REPO: 'other.ghe.com/FixtureOwner/project' }, '/private/access', tokens), /context/);
});

test('adapter never starts external credential registration, refresh or grant erasure', () => {
  for (const command of ['login', 'refresh', 'logout', 'switch', 'setup-git']) assert.throws(() => validateGhArguments(['auth', command]), /native sign-in/);
  assert.deepEqual(validateGhArguments(['api', 'user', '--jq', '.login']), ['api', 'user', '--jq', '.login']);
  for (const args of [['api', 'user', '--hostname', 'other.ghe.com'], ['api', 'https://other.ghe.com/api'],
    ['repo', 'view', '--repo', 'other.ghe.com/FixtureOwner/project'], ['api', '--hostname=other.ghe.com', 'user']]) assert.throws(() => validateGhArguments(args));
  assert.deepEqual(validateGhArguments(['api', 'https://api.github.com/user']), ['api', 'https://api.github.com/user']);
});
