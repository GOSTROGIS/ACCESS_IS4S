import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { withRuntimeLease } from '../runtime-state.mjs';
import { managerCommand, updateAutomations, validateSourceReceipt } from './update.mjs';

const commit = 'a'.repeat(40), edition = 'owned-' + commit.slice(0, 12);
const bytes = Buffer.from('synthetic source archive for orchestration tests only');
const digest = value => createHash('sha256').update(value).digest('hex');
function manifest(product = 'access') {
  const pin = { sha256: digest('fixture'), bytes: 7, mode: '100644' };
  return { schema: 1, product, application: 'autocraft', archiveSha256: digest(bytes),
    source: { repository: `https://github.com/GOSTROGIS/${product === 'access' ? 'ACCESS_IS4S' : 'SLIPCURVE'}.git`,
      prefix: product === 'access' ? 'source/storytold/apps/autocraft' : 'vendor/storytold/apps/autocraft', commit, tree: 'b'.repeat(40) },
    locks: { 'package.json': pin.sha256, 'pnpm-lock.yaml': pin.sha256 },
    files: { 'package.json': pin, 'pnpm-lock.yaml': pin, 'src/cli.ts': pin, 'web/src/main.tsx': pin } };
}

async function fixture(t, overrides = {}) {
  const base = await realpath(await mkdtemp(join(await realpath(tmpdir()), 'autocraft-update-test-')));
  t.after(async () => { assert.equal(await realpath(base), base); await rm(base, { recursive: true, force: true }); });
  const root = join(base, 'installed'), privateRoot = join(base, 'private');
  await mkdir(root); await mkdir(privateRoot);
  const config = { root: '/home/fixture/automation', configurationFile: join(privateRoot, 'connection.json'),
    git: join(base, 'git.exe'), automationUpdates: { python: join(base, 'python.exe'), publisher: join(base, 'publisher.py'),
      sourceCaches: { access: join(base, 'cache'), slipcurve: join(base, 'cache') } } };
  await mkdir(config.automationUpdates.sourceCaches.access);
  for (const path of [config.configurationFile, config.git, config.automationUpdates.python, config.automationUpdates.publisher]) await writeFile(path, 'fixture');
  const document = join(privateRoot, 'user-document.db');
  await writeFile(document, 'existing user data must survive');
  const calls = [], published = [], qualified = { edition, qualified: true, sourceRef: commit, sourceTree: 'b'.repeat(40),
    treeSha256: 'f'.repeat(64), archiveSha256: digest(bytes) };
  let current = overrides.current ?? 'existing-version', held = overrides.held === true;
  const services = {
    configuration: async () => config, ready: async () => {},
    publish: async (_exe, args) => {
      published.push(args);
      const candidate = args[args.indexOf('--output') + 1], product = args[args.indexOf('--product') + 1];
      await mkdir(candidate);
      const receipt = overrides.receipt?.(product) ?? manifest(product);
      await writeFile(join(candidate, 'source-receipt.json'), JSON.stringify(receipt));
      await writeFile(join(candidate, 'source.tar'), overrides.archive ?? bytes);
    },
    guest: async (_config, command, input) => {
      const action = ['status', 'stage', 'qualify', 'activate', 'verify', 'check', 'rollback', 'resume-updates'].find(item => command.includes(`'${item}'`));
      calls.push({ action, command, input });
      if (!action) return '';
      const custom = await overrides.guest?.(action, { current, qualified, calls });
      if (custom !== undefined) return JSON.stringify(custom);
      if (action === 'status') return JSON.stringify({ current, verified: true, updatesHeld: held });
      if (action === 'stage' || action === 'qualify') return JSON.stringify(qualified);
      if (action === 'verify') return JSON.stringify(command.includes(`'${edition}'`) ? qualified :
        { ...qualified, edition: current, sourceRef: 'd'.repeat(40), sourceTree: 'e'.repeat(40) });
      if (action === 'activate') { current = edition; return JSON.stringify({ current }); }
      if (action === 'rollback') { current = 'prior-version'; held = true; return JSON.stringify({ current, updatesHeld: true }); }
      if (action === 'resume-updates') { held = false; return JSON.stringify({ current, updatesHeld: false }); }
      if (action === 'check') return JSON.stringify({ passed: true });
      throw Error('Unexpected manager action');
    },
  };
  return { root, config, services, calls, published, document, privateRoot };
}

test('updater orchestration pins owned source, uploads only source stdin and activates only a matching qualified edition', async t => {
  const f = await fixture(t);
  const [result] = await updateAutomations(f.root, { only: 'access-autocraft' }, f.services);
  assert.equal(result.status, 'updated'); assert.equal(result.sourceRef, commit);
  assert.deepEqual(f.calls.filter(call => call.action).map(call => call.action), ['status', 'stage', 'activate', 'status', 'status', 'verify']);
  assert.equal(f.calls.find(call => Buffer.isBuffer(call.input)).input.equals(bytes), true);
  assert.ok(f.calls.every(call => !call.command.includes('existing user data')));
  assert.ok(f.published[0].includes('--product'));
  assert.equal(await readFile(f.document, 'utf8'), 'existing user data must survive');
  const registry = JSON.parse(await readFile(join(f.root, 'installed-product-services.json'), 'utf8'));
  assert.equal(registry.services[0].version, edition);
  assert.equal(registry.services[0].source.commit, commit);
  assert.equal(registry.services[0].source.tree, 'b'.repeat(40));
  assert.deepEqual((await readdir(join(f.privateRoot, 'updates'))).sort(), ['last-result.json']);
});

test('rollback hold refuses source publication; explicit resume clears hold without importing or altering user documents', async t => {
  const f = await fixture(t, { held: true });
  assert.equal((await updateAutomations(f.root, { only: 'access-autocraft' }, f.services))[0].status, 'held');
  assert.equal(f.published.length, 0);
  assert.equal((await updateAutomations(f.root, { only: 'access-autocraft', mode: 'rollback' }, f.services))[0].updatesHeld, true);
  assert.equal((await updateAutomations(f.root, { only: 'access-autocraft', mode: 'resume' }, f.services))[0].status, 'resumed');
  assert.equal(f.published.length, 0);
  assert.equal(await readFile(f.document, 'utf8'), 'existing user data must survive');
});

test('failed real build or regression never reaches activation and preserves all user data', async t => {
  const f = await fixture(t, { guest(action) { if (['stage', 'verify', 'qualify'].includes(action)) throw Error('genuine gate refused'); } });
  await assert.rejects(updateAutomations(f.root, { only: 'access-autocraft' }, f.services), /gate refused/);
  assert.equal(f.calls.some(call => call.action === 'activate'), false);
  assert.equal(await readFile(f.document, 'utf8'), 'existing user data must survive');
});

test('interrupted frozen build retries exact checkpoint qualification before any activation', async t => {
  const f = await fixture(t, { guest(action, { calls }) {
    if (action === 'stage' || action === 'verify' && !calls.some(call => call.action === 'qualify')) throw Error('not yet qualified');
  } });
  assert.equal((await updateAutomations(f.root, { only: 'access-autocraft' }, f.services))[0].status, 'updated');
  assert.deepEqual(f.calls.filter(call => call.action).map(call => call.action), ['status', 'stage', 'verify', 'qualify', 'activate', 'status', 'status', 'verify']);
});

test('forged qualification pin and modified source archive both fail before activation', async t => {
  const f = await fixture(t, { guest(action, { qualified }) { if (action === 'stage') return { ...qualified, sourceRef: 'c'.repeat(40) }; } });
  await assert.rejects(updateAutomations(f.root, { only: 'access-autocraft' }, f.services), /qualification receipt/);
  assert.equal(f.calls.some(call => call.action === 'activate'), false);
  const g = await fixture(t, { archive: Buffer.from('tampered bytes') });
  await assert.rejects(updateAutomations(g.root, { only: 'access-autocraft' }, g.services), /receipt or archive/);
  assert.equal(g.calls.some(call => call.input !== undefined), false);
});

test('foreign products, unsafe source names, source-root private data and concurrent update locks are refused', async t => {
  assert.throws(() => validateSourceReceipt('access', manifest('slipcurve'), bytes));
  const bad = manifest(); bad.files['../private'] = bad.files['src/cli.ts'];
  assert.throws(() => validateSourceReceipt('access', bad, bytes), /unsafe/);
  assert.throws(() => managerCommand({ root: '/home/fixture/../private' }, 'access', 'status'));
  const f = await fixture(t);
  await mkdir(join(f.privateRoot, 'updates'));
  await withRuntimeLease(join(f.privateRoot, 'updates'), () =>
    assert.rejects(updateAutomations(f.root, { only: 'access-autocraft' }, f.services), /in progress|EADDRINUSE/));
  f.config.configurationFile = join(f.root, 'private/connection.json');
  await mkdir(join(f.root, 'private')); await writeFile(f.config.configurationFile, 'fixture');
  await assert.rejects(updateAutomations(f.root, { only: 'access-autocraft' }, f.services), /outside/);
  f.config.configurationFile = join(f.root, '..private/connection.json');
  await mkdir(join(f.root, '..private')); await writeFile(f.config.configurationFile, 'fixture');
  await assert.rejects(updateAutomations(f.root, { only: 'access-autocraft' }, f.services), /outside/);
  await assert.rejects(updateAutomations(f.root, { only: 'unknown' }, f.services), /Unknown/);
  await assert.rejects(updateAutomations(f.root, { only: 'access' }, f.services), /Unknown/);
});
