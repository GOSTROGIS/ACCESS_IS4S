import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';
import { runtimeTree } from './runtime-state.mjs';
import { activeProductRuntime, installedAutomations, installedProductRuntimes, productPort, rollbackProductRuntime, resumeProductRuntime, selectProductRuntime, validateProductRuntime, verifyProductRuntime } from './product-runtimes.mjs';
import { portalInstallation, runtimeServer } from './intranet.mjs';

const hash = value => createHash('sha256').update(value).digest('hex');
async function fixture(t) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'product-runtime-test-')));
  t.after(async () => {
    assert.equal(dirname(root), await realpath(tmpdir()));
    assert.match(basename(root), /^product-runtime-test-/u);
    await rm(root, { recursive: true, force: true });
  });
  return root;
}
// Integrity/selection fixtures only; these payloads are never run as applications.
async function packageAt(root, product = 'access', revision = 'a') {
  const record = {
    product, application: 'wordcraft', kind: 'web', id: `${product}-wordcraft`,
    version: `v0.18.1-${product}-${revision.repeat(12)}`, label: `${product} Documents`, entry: 'index.html',
    artifactSha256: hash('archive fixture ' + product + revision), manifestSha256: '',
    source: { repository: `https://github.com/GOSTROGIS/${product === 'access' ? 'ACCESS_IS4S' : 'SLIPCURVE'}.git`,
      commit: revision.repeat(40), prefix: `${product === 'access' ? 'source' : 'vendor'}/storytold/apps/wordcraft`, tree: revision.repeat(40) },
  };
  const tree = runtimeTree(root, record);
  await mkdir(tree, { recursive: true });
  const html = Buffer.from('<html>Integrity fixture ' + revision + '</html>');
  const wasm = Buffer.of(0, 97, 115, 109);
  await writeFile(join(tree, 'index.html'), html);
  await writeFile(join(tree, 'engine.wasm'), wasm);
  const manifest = { schema: 1, product, application: record.application, kind: record.kind,
    version: record.version, entry: record.entry, source: record.source, dependencyLockSha256: hash('locked fixture'),
    files: { 'index.html': { bytes: html.length, sha256: hash(html) }, 'engine.wasm': { bytes: wasm.length, sha256: hash(wasm) } } };
  const text = JSON.stringify(manifest) + '\n';
  await writeFile(join(tree, 'build-manifest.json'), text);
  record.manifestSha256 = hash(text);
  return record;
}

test('products use separate fixed ports, identities and owned source pins', async t => {
  const root = await fixture(t), record = await packageAt(root);
  assert.equal(productPort('access', 'wordcraft'), 4307);
  assert.equal(productPort('slipcurve', 'wordcraft'), 4327);
  assert.deepEqual(validateProductRuntime(record), record);
  for (const patch of [{ product: 'other' }, { id: 'slipcurve-wordcraft' }, { entry: '../private.exe' },
    { version: 'v0.18.1-slipcurve-aaaaaaaaaaaa' }, { port: 80 },
    { source: { ...record.source, repository: 'https://example.invalid/app.git' } }]) {
    assert.throws(() => validateProductRuntime({ ...record, ...patch }));
  }
  assert.throws(() => productPort('access', 'autocraft'));
});

test('complete payload integrity detects changed, missing and unlisted files', async t => {
  const root = await fixture(t), record = await packageAt(root), tree = runtimeTree(root, record);
  await verifyProductRuntime(root, record);
  await writeFile(join(tree, 'unlisted.js'), 'unexpected');
  await assert.rejects(verifyProductRuntime(root, record), /Unlisted/u);
  await rm(join(tree, 'unlisted.js'));
  await writeFile(join(tree, 'engine.wasm'), Buffer.of(1, 2, 3, 4));
  await assert.rejects(verifyProductRuntime(root, record), /payload changed/u);
});

test('first install, update, rollback and held recovery keep independent product files', async t => {
  const root = await fixture(t), access = await packageAt(root), next = await packageAt(root, 'access', 'b'), slip = await packageAt(root, 'slipcurve');
  const data = join(root, 'private-documents.bin');
  await writeFile(data, 'retained user data');
  const calls = [];
  const gate = async (tree, record) => calls.push(record.version);
  await selectProductRuntime(root, access, gate);
  await selectProductRuntime(root, slip, gate);
  await selectProductRuntime(root, next, gate);
  assert.equal((await installedProductRuntimes(root)).length, 2);
  await rollbackProductRuntime(root, 'web', 'access-wordcraft');
  const held = (await installedProductRuntimes(root)).find(row => row.product === 'access');
  assert.equal(held.version, access.version);
  assert.equal(held.held, true);
  await assert.rejects(selectProductRuntime(root, next, gate), /held/u);
  await resumeProductRuntime(root, 'web', 'access-wordcraft');
  await selectProductRuntime(root, next, gate);
  assert.equal(await readFile(data, 'utf8'), 'retained user data');
  assert.equal(calls.length, 4);
  assert.equal((await installedProductRuntimes(root)).find(row => row.product === 'slipcurve').version, slip.version);
});

test('failed or mutating gates never select the new package', async t => {
  const root = await fixture(t), current = await packageAt(root), next = await packageAt(root, 'access', 'b');
  await selectProductRuntime(root, current, async () => {});
  await assert.rejects(selectProductRuntime(root, next, async () => { throw Error('workflow failed'); }), /workflow failed/u);
  await assert.rejects(selectProductRuntime(root, next, async tree => { await writeFile(join(tree, 'index.html'), 'changed'); }), /payload changed/u);
  assert.equal((await installedProductRuntimes(root)).at(0).version, current.version);
});

test('a concurrent selection cannot be overwritten by an older completed gate', async t => {
  const root = await fixture(t), first = await packageAt(root), concurrent = await packageAt(root, 'access', 'b');
  await assert.rejects(selectProductRuntime(root, first, async () => {
    await selectProductRuntime(root, concurrent, async () => {});
  }), /selection changed/u);
  assert.equal((await installedProductRuntimes(root)).at(0).version, concurrent.version);
});

test('rechecking an unchanged edition preserves its verified rollback target', async t => {
  const root = await fixture(t), first = await packageAt(root), next = await packageAt(root, 'access', 'b');
  await selectProductRuntime(root, first, async () => {});
  await selectProductRuntime(root, next, async () => {});
  await selectProductRuntime(root, next, async () => { assert.fail('Already selected editions do not rerun a mutation gate'); });
  const active = await activeProductRuntime(root, 'web', next.id);
  assert.deepEqual(active.record, next);
  assert.deepEqual(active.retained, [first.version]);
  await assert.rejects(selectProductRuntime(root, { ...next, label: 'different receipt' }, async () => {}), /different receipt/u);
});

test('owned browser hosting resolves its own payload and original bridge identity after update and rollback', async t => {
  const root = await fixture(t), first = await packageAt(root), next = await packageAt(root, 'access', 'b');
  await selectProductRuntime(root, first, async () => {});
  const app = runtimeServer(root, { ...first, port: 0, sourceApplication: 'wordcraft' });
  await new Promise(resolve => app.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${app.address().port}`;
  t.after(() => new Promise(resolve => app.close(resolve)));
  assert.match(await (await fetch(origin + '/')).text(), /fixture a/u);
  const editor = await (await fetch(origin + '/slipcurve-workspace/editor.json')).json();
  assert.equal(editor.id, 'wordcraft');
  assert.equal(editor.entry, `/_edition/${first.version}/`);
  await selectProductRuntime(root, next, async () => {});
  assert.match(await (await fetch(origin + '/')).text(), /fixture b/u);
  assert.match(await (await fetch(origin + `/_edition/${first.version}/`)).text(), /fixture a/u);
  await rollbackProductRuntime(root, 'web', first.id);
  assert.match(await (await fetch(origin + '/')).text(), /fixture a/u);
  assert.equal((await fetch(origin + '/_edition/v0.0.0-access-ccccccc/')).status, 404);
});

test('automation inventory publishes only approved product launch identities and public pins', async t => {
  const root = await fixture(t);
  assert.deepEqual(await installedAutomations(root), []);
  const path = join(root, 'installed-product-services.json');
  const row = { product: 'access', application: 'autocraft', kind: 'service', id: 'access-autocraft', version: 'v0.1.0-access-aaaaaaa', origin: 'http://127.0.0.2:8993',
    source: { repository: 'https://github.com/GOSTROGIS/ACCESS_IS4S.git', commit: 'a'.repeat(40), tree: 'b'.repeat(40), prefix: 'source/storytold/apps/autocraft' } };
  await writeFile(path, JSON.stringify({ schema: 1, services: [{ ...row, privateExtra: 'must never be published' }] }));
  assert.deepEqual(await installedAutomations(root), [{ id: row.id, product: 'access', kind: 'service', version: row.version, origin: row.origin, sourceApplication: 'autocraft' }]);
  for (const patch of [{ origin: 'https://attacker.invalid' }, { id: 'slipcurve-autocraft' }, { source: { ...row.source, commit: 'unknown' } }]) {
    await writeFile(path, JSON.stringify({ schema: 1, services: [{ ...row, ...patch }] }));
    await assert.rejects(installedAutomations(root), /Invalid installed automation/u);
  }
});

test('native selections and browser edition updates reuse the live portal while new browser routes change its topology', () => {
  const base = portalInstallation('fixture', [], [], []);
  const native = { id: 'access-wordcraft', product: 'access', application: 'wordcraft', kind: 'native', version: 'first' };
  assert.equal(portalInstallation('fixture', [], [], [native]), base);
  const browser = { ...native, kind: 'web', port: 4307 };
  const installed = portalInstallation('fixture', [], [], [browser, native]);
  assert.notEqual(installed, base);
  assert.equal(portalInstallation('fixture', [], [], [native, { ...browser, version: 'updated', held: true }]), installed);
  assert.notEqual(portalInstallation('fixture', [], [], [browser, { ...browser, id: 'slipcurve-wordcraft', product: 'slipcurve', port: 4327 }]), installed);
});
