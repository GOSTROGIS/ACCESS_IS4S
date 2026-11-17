import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { lstat, open, readFile, readdir, realpath, rename, rm } from 'node:fs/promises';
import { isAbsolute, join, relative } from 'node:path';
import { runtimeTree, withRuntimeLease } from './runtime-state.mjs';

export const productApplications = Object.freeze([
  'vectorcraft', 'filmcraft', 'effectcraft', 'photocraft', 'lightcraft', 'cadcraft',
  'gridcraft', 'wordcraft', 'pdfcraft', 'designcraft', 'deckcraft', 'soundcraft',
  'figcraft', 'texturecraft', 'materialcraft', 'craft-anything', 'craft-launcher',
  'artcraft', 'artcraftx', 'anicraft', 'autocraft',
]);
export const products = Object.freeze({
  access: { repository: 'https://github.com/GOSTROGIS/ACCESS_IS4S.git', sourcePrefix: 'source/storytold/apps', webPort: 4300 },
  slipcurve: { repository: 'https://github.com/GOSTROGIS/SLIPCURVE.git', sourcePrefix: 'vendor/storytold/apps', webPort: 4320 },
});
const registryName = 'installed-product-runtimes.json';
const receiptName = 'build-manifest.json';
const sha = /^[a-f0-9]{64}$/u;
const commit = /^[a-f0-9]{40}$/u;
const fields = ['application', 'artifactSha256', 'entry', 'id', 'kind', 'label', 'manifestSha256', 'product', 'source', 'version'];

export function productPort(product, application) {
  const index = productApplications.indexOf(application);
  if (!Object.hasOwn(products, product) || index < 0 || index >= 17) throw Error('No browser runtime for this product application');
  return products[product].webPort + index;
}

export function safeRuntimeName(name) {
  return typeof name === 'string' && name.length > 0 && !isAbsolute(name) &&
    !/[\\:<>"|?*\u0000-\u001f\u007f]/u.test(name) && name.split('/').every(part =>
      part && part !== '.' && part !== '..' && !/[. ]$/u.test(part) &&
      !/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/iu.test(part));
}

export function validateProductRuntime(record) {
  if (!record || typeof record !== 'object' || Array.isArray(record) ||
      JSON.stringify(Object.keys(record).sort()) !== JSON.stringify([...fields].sort()) ||
      !Object.hasOwn(products, record.product) || !productApplications.includes(record.application) ||
      record.application === 'autocraft' || !['web', 'native'].includes(record.kind) ||
      record.id !== `${record.product}-${record.application}` ||
      typeof record.version !== 'string' || !/^v?\d{1,6}\.\d{1,6}\.\d{1,6}-(?:access|slipcurve)-[a-f0-9]{7,40}$/u.test(record.version) ||
      !record.version.includes(`-${record.product}-`) || !sha.test(record.artifactSha256) || !sha.test(record.manifestSha256) ||
      typeof record.label !== 'string' || !record.label.trim() || record.label.length > 100 ||
      !safeRuntimeName(record.entry)) throw Error('Invalid product runtime');
  const source = record.source;
  if (!source || Object.keys(source).sort().join(',') !== 'commit,prefix,repository,tree' ||
      source.repository !== products[record.product].repository || !commit.test(source.commit) || !commit.test(source.tree) ||
      source.prefix !== `${products[record.product].sourcePrefix}/${record.application}`) throw Error('Invalid product source pin');
  if (record.kind === 'web') {
    productPort(record.product, record.application);
    if (record.entry !== 'index.html') throw Error('Invalid browser entry');
  } else if (!record.entry.toLowerCase().endsWith('.exe')) throw Error('Invalid native entry');
  return record;
}

async function canonical(path) {
  if (relative(path, await realpath(path)) !== '') throw Error('Redirected product runtime path');
  return path;
}
async function digest(path) {
  const result = createHash('sha256');
  for await (const chunk of createReadStream(path)) result.update(chunk);
  return result.digest('hex');
}

export async function verifyProductRuntime(root, record) {
  validateProductRuntime(record);
  const tree = await canonical(runtimeTree(root, record));
  const manifestPath = await canonical(join(tree, receiptName));
  if (await digest(manifestPath) !== record.manifestSha256) throw Error('Product build receipt changed');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  if (manifest.schema !== 1 || manifest.product !== record.product || manifest.application !== record.application ||
      manifest.kind !== record.kind || manifest.version !== record.version || manifest.entry !== record.entry ||
      !manifest.source || Object.keys(record.source).some(key => manifest.source[key] !== record.source[key]) || !sha.test(manifest.dependencyLockSha256) ||
      !manifest.files || Array.isArray(manifest.files) || !Object.hasOwn(manifest.files, record.entry)) throw Error('Invalid product build receipt');
  const names = Object.keys(manifest.files).sort();
  if (!names.length || names.includes(receiptName)) throw Error('Invalid product payload list');
  for (const name of names) {
    const pin = manifest.files[name];
    if (!safeRuntimeName(name) || !pin || !Number.isSafeInteger(pin.bytes) || pin.bytes < 0 || !sha.test(pin.sha256)) throw Error('Invalid product payload entry');
    const file = await canonical(join(tree, ...name.split('/')));
    const info = await lstat(file);
    if (!info.isFile() || info.size !== pin.bytes || await digest(file) !== pin.sha256) throw Error('Product payload changed');
  }
  const actual = [];
  async function walk(folder, prefix = '') {
    for (const item of await readdir(folder, { withFileTypes: true })) {
      const name = prefix + item.name;
      if (item.isDirectory()) { await canonical(join(folder, item.name)); await walk(join(folder, item.name), name + '/'); }
      else if (item.isFile()) actual.push(name);
      else throw Error('Product runtime contains a link or special file');
    }
  }
  await walk(tree);
  if (JSON.stringify(actual.sort()) !== JSON.stringify([...names, receiptName].sort())) throw Error('Unlisted product runtime files');
  if (record.kind === 'web' && !names.some(name => name.endsWith('.wasm'))) throw Error('Browser runtime has no WebAssembly payload');
  return { tree, manifest };
}

async function readRegistry(root) {
  const path = join(root, registryName);
  const body = await readFile(path, 'utf8').catch(error => { if (error.code === 'ENOENT') return '{"schema":1,"runtimes":{}}'; throw error; });
  if (await lstat(path).catch(() => null)) await canonical(path);
  const state = JSON.parse(body);
  if (state.schema !== 1 || !state.runtimes || typeof state.runtimes !== 'object' || Array.isArray(state.runtimes)) throw Error('Invalid product runtime registry');
  for (const [key, row] of Object.entries(state.runtimes)) {
    validateProductRuntime(row.current);
    if (key !== `${row.current.kind}/${row.current.id}`) throw Error('Mismatched product runtime registry key');
    if (row.previous) validateProductRuntime(row.previous);
    if (row.previous && (row.previous.id !== row.current.id || row.previous.kind !== row.current.kind)) throw Error('Cross-product rollback refused');
    if (row.hold && typeof row.hold !== 'string') throw Error('Invalid product update hold');
  }
  return state;
}

async function writeRegistry(root, state) {
  const pending = join(root, `.product-runtimes-${randomUUID()}.tmp`);
  try {
    const file = await open(pending, 'wx');
    try { await file.writeFile(JSON.stringify(state, null, 2) + '\n'); await file.sync(); } finally { await file.close(); }
    await rename(pending, join(root, registryName));
  } finally { await rm(pending, { force: true }); }
}

export async function installedProductRuntimes(root, { verify = true } = {}) {
  const rows = Object.values((await readRegistry(root)).runtimes);
  if (verify) for (const row of rows) await verifyProductRuntime(root, row.current);
  return rows.map(({ current, hold }) => ({ ...current, ...(current.kind === 'web' ? { port: productPort(current.product, current.application) } : {}), held: !!hold }));
}

export async function selectProductRuntime(root, record, gate) {
  await canonical(root);
  const key = `${record.kind}/${record.id}`;
  const observed = (await readRegistry(root)).runtimes[key];
  if (observed?.hold) throw Error('Product update is held after rollback');
  const { tree } = await verifyProductRuntime(root, record);
  if (observed) await verifyProductRuntime(root, observed.current);
  await gate(tree, record);
  await verifyProductRuntime(root, record);
  return withRuntimeLease(root, async () => {
    const state = await readRegistry(root);
    if (JSON.stringify(state.runtimes[key]) !== JSON.stringify(observed)) throw Error('Product selection changed during verification');
    state.runtimes[key] = { current: record, ...(observed ? { previous: observed.current } : {}) };
    await writeRegistry(root, state);
    return record;
  });
}

export async function rollbackProductRuntime(root, kind, id) {
  return withRuntimeLease(root, async () => {
    const state = await readRegistry(root), key = `${kind}/${id}`, row = state.runtimes[key];
    if (!row?.previous) throw Error('No previous product runtime');
    await verifyProductRuntime(root, row.previous);
    state.runtimes[key] = { current: row.previous, previous: row.current, hold: row.current.version };
    await writeRegistry(root, state);
    return row.previous;
  });
}

export async function resumeProductRuntime(root, kind, id) {
  return withRuntimeLease(root, async () => {
    const state = await readRegistry(root), row = state.runtimes[`${kind}/${id}`];
    if (row) { delete row.hold; await writeRegistry(root, state); }
  });
}
