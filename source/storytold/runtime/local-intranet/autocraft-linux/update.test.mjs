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
    treeSha256: 'f'.repeat(64), archiveSha256: digest(bytes),
    sourceRepository: manifest().source.repository, sourcePrefix: manifest().source.prefix };
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
      const action = ['status', 'match-source', 'stage', 'qualify', 'activate', 'verify', 'check', 'rollback', 'resume-updates'].find(item => command.includes(`'${item}'`));
      calls.push({ action, command, input });
      if (!action) return '';
      const custom = await overrides.guest?.(action, { current, qualified, calls, command });
      if (custom !== undefined) return JSON.stringify(custom);
      if (action === 'status') return JSON.stringify({ current, previous: overrides.previous ?? null, verified: true, updatesHeld: held });
      if (action === 'match-source') return JSON.stringify({ matched: false, checkedSourceRef: commit });
      if (action === 'stage' || action === 'qualify') return JSON.stringify(qualified);
      if (action === 'verify') return JSON.stringify(command.includes(`'${edition}'`) ? qualified :
        { ...qualified, edition: current, sourceRef: 'd'.repeat(40), sourceTree: 'e'.repeat(40) });
      if (action === 'activate') { current = command.match(/'--edition'\s+'([^']+)'/)?.[1] ?? edition; return JSON.stringify({ current }); }
      if (action === 'rollback') { current = 'prior-version'; held = true; return JSON.stringify({ current, updatesHeld: true }); }
      if (action === 'resume-updates') { held = false; return JSON.stringify({ current, updatesHeld: false }); }
      if (action === 'check') return JSON.stringify({ edition: command.match(/'--edition'\s+'([^']+)'/)?.[1], coreVerified: true, functionalGate: 'passed' });
      throw Error('Unexpected manager action');
    },
  };
  return { root, config, services, calls, published, document, privateRoot };
}

test('updater orchestration pins owned source, uploads only source stdin and activates only a matching qualified edition', async t => {
  const f = await fixture(t);
  const [result] = await updateAutomations(f.root, { only: 'access-autocraft' }, f.services);
  assert.equal(result.status, 'updated'); assert.equal(result.sourceRef, commit);
  assert.deepEqual(f.calls.filter(call => call.action).map(call => call.action), ['status', 'match-source', 'stage', 'activate', 'status', 'status', 'verify', 'status']);
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
  assert.deepEqual(f.calls.filter(call => call.action).map(call => call.action), ['status', 'match-source', 'stage', 'verify', 'qualify', 'activate', 'status', 'status', 'verify', 'status']);
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

const retained = { edition: 'owned-' + 'c'.repeat(12), qualified: true, sourceRef: 'c'.repeat(40), sourceTree: 'b'.repeat(40),
  sourceRepository: manifest().source.repository, sourcePrefix: manifest().source.prefix,
  treeSha256: 'f'.repeat(64), archiveSha256: digest('different archive metadata for identical source files') };
function retainedGuest(action, { command }) {
  if (action === 'match-source') return { matched: true, checkedSourceRef: commit, qualified: retained };
  if (action === 'verify' && command.includes(`'${retained.edition}'`)) return retained;
}

test('matching retained current runtime delegates complete source comparison, regates and reports original pin separately from fresh main', async t => {
  const f = await fixture(t, { current: retained.edition, guest: retainedGuest });
  const [result] = await updateAutomations(f.root, { only: 'access-autocraft' }, f.services);
  assert.equal(result.status, 'current'); assert.equal(result.sourceRef, retained.sourceRef); assert.equal(result.checkedSourceRef, commit);
  assert.equal(result.artifact, retained.archiveSha256);
  assert.equal(f.calls.some(call => ['stage', 'qualify', 'activate'].includes(call.action)), false);
  assert.equal(f.calls.filter(call => call.action === 'check').length, 1);
  assert.ok(f.calls.find(call => call.action === 'match-source').command.includes("'--source-receipt'"));
  const registry = JSON.parse(await readFile(join(f.root, 'installed-product-services.json'), 'utf8'));
  assert.equal(registry.services[0].source.commit, retained.sourceRef); assert.equal(registry.services[0].artifact, retained.archiveSha256);
  assert.equal(await readFile(f.document, 'utf8'), 'existing user data must survive');
});

test('matching retained previous runtime must pass fresh full functional check before atomic reactivation without rebuild or relabel', async t => {
  const f = await fixture(t, { previous: retained.edition, guest: retainedGuest });
  const [result] = await updateAutomations(f.root, { only: 'access-autocraft' }, f.services);
  assert.equal(result.status, 'reused'); assert.equal(result.current, retained.edition); assert.equal(result.sourceRef, retained.sourceRef);
  assert.equal(result.checkedSourceRef, commit);
  assert.equal(f.calls.some(call => ['stage', 'qualify'].includes(call.action)), false);
  const check = f.calls.findIndex(call => call.action === 'check'), activate = f.calls.findIndex(call => call.action === 'activate');
  assert(check >= 0 && activate > check); assert(f.calls[check].command.includes(`'${retained.edition}'`));
  assert.equal(await readFile(f.document, 'utf8'), 'existing user data must survive');
});

test('a content match cannot hide a failed regression, incomplete gate acknowledgement or unrelated retained pin', async t => {
  for (const scenario of ['gate-failed', 'gate-incomplete', 'foreign-repo', 'foreign-prefix', 'different-tree', 'not-retained', 'wrong-fresh-ref']) {
    const f = await fixture(t, { previous: retained.edition, guest(action, context) {
      if (action === 'match-source') {
        const candidate = { ...retained };
        if (scenario === 'foreign-repo') candidate.sourceRepository = manifest('slipcurve').source.repository;
        if (scenario === 'foreign-prefix') candidate.sourcePrefix = manifest('slipcurve').source.prefix;
        if (scenario === 'different-tree') candidate.sourceTree = 'd'.repeat(40);
        if (scenario === 'not-retained') candidate.edition = 'unrelated-edition';
        return { matched: true, checkedSourceRef: scenario === 'wrong-fresh-ref' ? 'd'.repeat(40) : commit, qualified: candidate };
      }
      if (action === 'check' && scenario === 'gate-failed') throw Error('actual retained regression refused');
      if (action === 'check' && scenario === 'gate-incomplete') return { edition: retained.edition, coreVerified: true };
      return retainedGuest(action, context);
    } });
    await assert.rejects(updateAutomations(f.root, { only: 'access-autocraft' }, f.services));
    assert.equal(f.calls.some(call => ['stage', 'activate'].includes(call.action)), false);
    assert.equal(await readFile(f.document, 'utf8'), 'existing user data must survive');
  }
});

test('source comparison or checked-reference failures never fall through to a build; changed source quarantines only an unqualified candidate', async t => {
  for (const invalid of [null, { matched: false, checkedSourceRef: 'd'.repeat(40) }, { matched: 'false', checkedSourceRef: commit }]) {
    const f = await fixture(t, { guest(action) { if (action === 'match-source') { if (invalid === null) throw Error('source integrity refusal'); return invalid; } } });
    await assert.rejects(updateAutomations(f.root, { only: 'access-autocraft' }, f.services));
    assert.equal(f.calls.some(call => ['stage', 'activate'].includes(call.action)), false);
  }
  const f = await fixture(t);
  assert.equal((await updateAutomations(f.root, { only: 'access-autocraft' }, f.services))[0].status, 'updated');
  assert.ok(f.calls.find(call => call.action === 'stage').command.includes("'--replace-unqualified'"));
});

test('selection changes or a changed final qualified core cannot publish a stale service ledger', async t => {
  for (const scenario of ['selection', 'core']) {
    let statusCalls = 0;
    const f = await fixture(t, { previous: retained.edition, guest(action, context) {
      if (action === 'status' && ++statusCalls > 1 && scenario === 'selection') return { current: 'changed-externally', previous: retained.edition, verified: true, updatesHeld: false };
      if (action === 'verify' && scenario === 'core') return { ...retained, treeSha256: 'd'.repeat(64) };
      return retainedGuest(action, context);
    } });
    const ledger = JSON.stringify({ schema: 1, services: [], marker: 'existing ledger preserved' });
    await writeFile(join(f.root, 'installed-product-services.json'), ledger);
    await assert.rejects(updateAutomations(f.root, { only: 'access-autocraft' }, f.services), scenario === 'selection' ? /selection changed/ : /immutable pin/);
    assert.equal(await readFile(join(f.root, 'installed-product-services.json'), 'utf8'), ledger);
    if (scenario === 'selection') assert.equal(f.calls.some(call => call.action === 'activate'), false);
    assert.equal(await readFile(f.document, 'utf8'), 'existing user data must survive');
  }
});

test('failed source match for the exact retained edition and non-string pins cannot bypass full source comparison', async t => {
  const f = await fixture(t, { current: edition });
  await assert.rejects(updateAutomations(f.root, { only: 'access-autocraft' }, f.services), /failed comparison/);
  assert.equal(f.calls.some(call => ['stage', 'activate'].includes(call.action)), false);
  const bad = manifest(); bad.source.commit = [commit];
  assert.throws(() => validateSourceReceipt('access', bad, bytes), /receipt or archive/);
});

test('a qualified candidate recovered from an interrupted attempt regates before activation', async t => {
  const f = await fixture(t, { guest(action) { if (action === 'stage') throw Error('already qualified before interrupted activation'); } });
  assert.equal((await updateAutomations(f.root, { only: 'access-autocraft' }, f.services))[0].status, 'updated');
  const checked = f.calls.findIndex(call => call.action === 'check'), activated = f.calls.findIndex(call => call.action === 'activate');
  assert(checked > 0 && activated > checked);
  assert.equal(f.calls.some(call => call.action === 'qualify'), false);
});

test('final selection, hold or rollback-target changes during verification refuse stale ledger publication', async t => {
  for (const scenario of ['current', 'held', 'previous']) {
    let finalVerified = false;
    const f = await fixture(t, { current: retained.edition, guest(action, context) {
      if (action === 'status' && finalVerified) return { current: scenario === 'current' ? 'changed-after-final-verify' : retained.edition,
        previous: scenario === 'previous' ? 'changed-rollback-target' : null, verified: true, updatesHeld: scenario === 'held' };
      if (action === 'verify') { finalVerified = true; return retained; }
      return retainedGuest(action, context);
    } });
    const ledger = JSON.stringify({ schema: 1, services: [], marker: 'existing ledger preserved' });
    await writeFile(join(f.root, 'installed-product-services.json'), ledger);
    await assert.rejects(updateAutomations(f.root, { only: 'access-autocraft' }, f.services), /selection changed during final/);
    assert.equal(await readFile(join(f.root, 'installed-product-services.json'), 'utf8'), ledger);
    assert.equal(await readFile(f.document, 'utf8'), 'existing user data must survive');
  }
});
