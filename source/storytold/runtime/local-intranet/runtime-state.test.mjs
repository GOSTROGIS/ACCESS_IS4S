import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { runtimeServer } from './intranet.mjs';
import { activeRuntime, newerVersion, promoteRuntime, rollbackRuntime, runtimeTree } from './runtime-state.mjs';

async function fixture(t) {
  const root = await mkdtemp(join(await realpath(tmpdir()), 'is4s-update-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const app = { kind: 'web', id: 'photocraft', version: 'v0.23.1-hosting-fix', entry: 'index.html' };
  const document = join(root, 'saved.psd');
  await writeFile(document, 'user document');
  for (const version of [app.version, 'v0.24.0', 'v0.25.0']) {
    const dir = runtimeTree(root, app, version);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, app.entry), version);
  }
  return { root, app, document };
}

test('rejects regression, promotes verified runtime, and rolls back without touching user data', async t => {
  const { root, app, document } = await fixture(t);
  const candidate = { version: 'v0.24.0', artifact: '1'.repeat(64) };
  assert.equal((await activeRuntime(root, app)).version, app.version);
  await assert.rejects(promoteRuntime(root, app, candidate, async () => { throw Error('file round trip failed'); }), /round trip failed/);
  assert.equal((await activeRuntime(root, app)).version, app.version);
  await promoteRuntime(root, app, candidate, async path => assert.equal(await readFile(join(path, app.entry), 'utf8'), candidate.version));
  assert.equal((await activeRuntime(root, app)).version, candidate.version);
  await rollbackRuntime(root, app);
  const current = await activeRuntime(root, app);
  assert.equal(current.version, app.version);
  assert.equal(current.hold, candidate.version);
  assert.equal(await readFile(document, 'utf8'), 'user document');
  assert.equal(await readFile(join(runtimeTree(root, app, candidate.version), app.entry), 'utf8'), candidate.version);
});

test('modified candidates and modified rollback targets cannot change the active pointer', async t => {
  const { root, app } = await fixture(t);
  const candidate = { version: 'v0.24.0', artifact: '2'.repeat(64) };
  await assert.rejects(promoteRuntime(root, app, candidate, async path => writeFile(join(path, app.entry), 'altered')), /changed/);
  await writeFile(join(runtimeTree(root, app, candidate.version), app.entry), candidate.version);
  await promoteRuntime(root, app, candidate, async () => {});
  await writeFile(join(runtimeTree(root, app), app.entry), 'altered baseline');
  await assert.rejects(rollbackRuntime(root, app), /changed/);
  assert.equal((await activeRuntime(root, app)).version, candidate.version);
});

test('release versions never downgrade the current runtime or reapply the held release', () => {
  assert.equal(newerVersion('v0.9.2', 'v0.10.0'), false);
  assert.equal(newerVersion('v0.20.1', 'v0.20.1-is4s'), false);
  assert.equal(newerVersion('v0.20.2', 'v0.20.1-is4s'), true);
  assert.equal(newerVersion('v0.20.2-preview', 'v0.20.1'), false);
});

test('an open browser edition keeps its assets across promotion and rollback', async t => {
  const { root, app } = await fixture(t);
  for (const version of [app.version, 'v0.24.0']) {
    await writeFile(join(runtimeTree(root, app, version), 'runtime.js'), version);
  }
  const endpoint = runtimeServer(root, { ...app, port: 0 });
  await new Promise((accept, reject) => { endpoint.once('error', reject); endpoint.listen(0, '127.0.0.1', accept); });
  t.after(() => new Promise(accept => endpoint.close(accept)));
  const url = `http://127.0.0.1:${endpoint.address().port}`;
  const before = await fetch(url + '/');
  assert.equal(await before.text(), app.version);
  assert.match(before.url, /\/_edition\//);
  await promoteRuntime(root, app, { version: 'v0.24.0', artifact: '3'.repeat(64) }, async () => {});
  const after = await fetch(url + '/');
  assert.equal(await after.text(), 'v0.24.0');
  assert.equal(await (await fetch(new URL('runtime.js', before.url))).text(), app.version);
  assert.equal(await (await fetch(url + '/runtime.js', { headers: { Referer: before.url } })).text(), app.version);
  assert.equal((await fetch(url + '/_edition/v0.25.0/')).status, 404);
  await rollbackRuntime(root, app);
  assert.equal(await (await fetch(url + '/')).text(), app.version);
  assert.equal(await (await fetch(new URL('runtime.js', after.url))).text(), 'v0.24.0');
});

test('simultaneous promotions have only one winner', async t => {
  const { root, app } = await fixture(t);
  const candidate = { version: 'v0.24.0', artifact: '4'.repeat(64) };
  const results = await Promise.allSettled([
    promoteRuntime(root, app, candidate, async () => {}),
    promoteRuntime(root, app, candidate, async () => {}),
  ]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal((await activeRuntime(root, app)).version, candidate.version);
});
