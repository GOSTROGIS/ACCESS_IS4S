import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { lstat, mkdir, mkdtemp, open, readFile, realpath, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { PRODUCTS, ensureReady, guestCommand, hostEnvironment, loadConfiguration, posixQuote } from './controller.mjs';

const sources = Object.freeze({
  access: { repository: 'https://github.com/GOSTROGIS/ACCESS_IS4S.git', prefix: 'source/storytold/apps/autocraft' },
  slipcurve: { repository: 'https://github.com/GOSTROGIS/SLIPCURVE.git', prefix: 'vendor/storytold/apps/autocraft' },
});
const sha = /^[a-f0-9]{40}$/, hash = /^[a-f0-9]{64}$/;
const selections = Object.freeze({ 'access-autocraft': 'access', 'slipcurve-autocraft': 'slipcurve' });

const contained = (parent, path) => {
  const value = relative(parent, path);
  return value && value !== '..' && !value.startsWith('..' + sep) && !isAbsolute(value);
};

async function regular(path) {
  if (typeof path !== 'string' || !isAbsolute(path) || /[\r\n\0]/.test(path) || !(await lstat(path)).isFile() || await realpath(path) !== resolve(path)) {
    throw Error('The configured automation update executable or source helper is unavailable.');
  }
  return path;
}

async function run(executable, args, timeout = 1_000_000) {
  await new Promise((accept, reject) => {
    const child = spawn(executable, args, { windowsHide: true, env: hostEnvironment(), stdio: ['ignore', 'pipe', 'pipe'] });
    // Child output can contain private installation paths. Keep it bounded and never publish it.
    let bytes = 0, exceeded = false;
    const drain = part => { bytes += part.length; if (bytes > 2 * 1024 * 1024) { exceeded = true; child.kill(); } };
    child.stdout.on('data', drain); child.stderr.on('data', drain);
    const timer = setTimeout(() => child.kill(), timeout);
    child.once('error', () => { clearTimeout(timer); reject(Error('The owned source publisher could not start.')); });
    child.once('close', code => { clearTimeout(timer); code === 0 && !exceeded ? accept() : reject(Error('The owned source publisher did not verify the candidate.')); });
  });
}

export function validateSourceReceipt(product, receipt, archive) {
  const source = sources[product];
  if (!source || receipt?.schema !== 1 || receipt.application !== 'autocraft' || receipt.product !== product ||
      receipt.source?.repository !== source.repository || receipt.source?.prefix !== source.prefix ||
      !sha.test(receipt.source?.commit || '') || !sha.test(receipt.source?.tree || '') ||
      !hash.test(receipt.archiveSha256 || '') || createHash('sha256').update(archive).digest('hex') !== receipt.archiveSha256) {
    throw Error('The owned automation source receipt or archive does not match the fixed product.');
  }
  for (const lock of ['package.json', 'pnpm-lock.yaml']) {
    if (!hash.test(receipt.locks?.[lock] || '') || receipt.files?.[lock]?.sha256 !== receipt.locks[lock]) {
      throw Error('The owned automation source is missing its frozen package manifest.');
    }
  }
  for (const [name, pin] of Object.entries(receipt.files || {})) {
    if (!name || name.startsWith('/') || /[\\:\x00-\x1f\x7f]/.test(name) || name.split('/').some(part => !part || part === '.' || part === '..') ||
        !hash.test(pin.sha256 || '') || !Number.isSafeInteger(pin.bytes) || pin.bytes < 0 || !['100644', '100755'].includes(pin.mode)) {
      throw Error('The owned automation source manifest has an unsafe entry.');
    }
  }
  if (!receipt.files?.['src/cli.ts'] || !Object.keys(receipt.files).some(name => name.startsWith('web/src/'))) {
    throw Error('The genuine automation CLI and dashboard sources are required.');
  }
  return receipt;
}

export function managerCommand(config, product, action, args = []) {
  if (!PRODUCTS[product] || !['status', 'stage', 'qualify', 'activate', 'verify', 'check', 'rollback', 'resume-updates'].includes(action) ||
      !/^\/[a-zA-Z0-9._/-]+$/.test(config.root) || /\/\.\.?(\/|$)/.test(config.root)) throw Error('Invalid fixed automation manager action.');
  const r = config.root;
  return ['python3', `${r}.runtime/tools/linux-runtime.py`, '--runtime-root', `${r}.runtime/${product}`,
    '--data-root', `${r}.data/${product}`, '--gate', `${r}.runtime/tools/linux-runtime-gate.mjs`,
    '--instance', product, '--worker-port', String(PRODUCTS[product].worker), action, ...args].map(posixQuote).join(' ');
}

function response(output) {
  const line = String(output).trim().split(/\r?\n/).at(-1);
  try { return JSON.parse(line); } catch { throw Error('The authenticated automation manager returned no valid receipt.'); }
}

async function state(config, product, guest) {
  const value = response(await guest(config, managerCommand(config, product, 'status'), undefined, 300_000));
  if (value.verified !== true || typeof value.current !== 'string' || !/^[a-z0-9][a-z0-9._-]{0,95}$/.test(value.current)) {
    throw Error('The active automation runtime has no verified version.');
  }
  return value;
}

async function refreshService(root, config, product, guest) {
  const active = await state(config, product, guest);
  const pin = response(await guest(config, managerCommand(config, product, 'verify', ['--edition', active.current]), undefined, 300_000));
  if (pin.qualified !== true || pin.edition !== active.current || !sha.test(pin.sourceRef || '') ||
      !sha.test(pin.sourceTree || '') || !hash.test(pin.archiveSha256 || '') || !hash.test(pin.treeSha256 || '')) {
    throw Error('The installed automation has no complete verified source and runtime receipt.');
  }
  const path = join(root, 'installed-product-services.json');
  const item = await lstat(path).catch(error => { if (error.code !== 'ENOENT') throw error; return null; });
  if (item) await regular(path);
  const registry = item ? JSON.parse(await readFile(path, 'utf8')) : { schema: 1, services: [] };
  const seen = new Set();
  if (registry.schema !== 1 || !Array.isArray(registry.services)) {
    throw Error('The installed automation service registry is invalid.');
  }
  for (const existing of registry.services) {
    const fixed = sources[existing?.product], target = PRODUCTS[existing?.product];
    if (!fixed || seen.has(existing.product) || existing.application !== 'autocraft' || existing.kind !== 'service' ||
        existing.id !== existing.product + '-autocraft' || existing.origin !== `http://${target.host}:${target.port}` ||
        !/^[a-z0-9][a-z0-9._-]{0,95}$/.test(existing.version || '') || existing.source?.repository !== fixed.repository ||
        existing.source?.prefix !== fixed.prefix || !sha.test(existing.source?.commit || '') || !sha.test(existing.source?.tree || '')) {
      throw Error('The installed automation service registry is invalid.');
    }
    seen.add(existing.product);
  }
  const row = { id: `${product}-autocraft`, product, application: 'autocraft', kind: 'service',
    version: active.current, origin: `http://${PRODUCTS[product].host}:${PRODUCTS[product].port}`,
    source: { ...sources[product], commit: pin.sourceRef, tree: pin.sourceTree },
    artifact: pin.archiveSha256, treeSha256: pin.treeSha256, held: active.updatesHeld === true };
  registry.services = [...registry.services.filter(existing => existing.product !== product), row].sort((a, b) => a.product.localeCompare(b.product));
  const pending = join(root, `.product-services-${randomUUID()}.tmp`);
  try {
    const handle = await open(pending, 'wx');
    try { await handle.writeFile(JSON.stringify(registry, null, 2) + '\n'); await handle.sync(); } finally { await handle.close(); }
    await rename(pending, path);
  } finally {
    await rm(pending, { force: true });
  }
  return { active, pin };
}

async function updateOne(root, config, paths, product, mode, staging, services) {
  const guest = services.guest ?? guestCommand;
  const current = await state(config, product, guest);
  if (mode === 'rollback' || mode === 'resume') {
    const result = response(await guest(config, managerCommand(config, product, mode === 'rollback' ? 'rollback' : 'resume-updates'), undefined, 300_000));
    const { active, pin } = await refreshService(root, config, product, guest);
    if (result.current !== active.current || (mode === 'rollback') !== active.updatesHeld) throw Error('The automation hold state did not match the verified activation.');
    return { product, status: mode === 'rollback' ? 'rolled-back' : 'resumed', current: active.current,
      sourceRef: pin.sourceRef, updatesHeld: active.updatesHeld === true };
  }
  if (mode === 'verify') {
    await guest(config, managerCommand(config, product, 'check', ['--edition', current.current]), undefined, 600_000);
    return { product, status: 'verified', current: current.current, updatesHeld: current.updatesHeld === true };
  }
  if (current.updatesHeld) {
    await refreshService(root, config, product, guest);
    return { product, status: 'held', current: current.current, updatesHeld: true };
  }
  const candidate = join(staging, product + '-source');
  await (services.publish ?? run)(paths.python, ['-I', '-B', paths.publisher, '--product', product,
    '--git', config.git, '--source-cache', paths.sourceCaches[product], '--output', candidate]);
  if (await realpath(candidate) !== candidate) throw Error('The private automation staging directory was redirected.');
  await regular(join(candidate, 'source-receipt.json'));
  await regular(join(candidate, 'source.tar'));
  const receipt = JSON.parse(await readFile(join(candidate, 'source-receipt.json'), 'utf8'));
  const archive = await readFile(join(candidate, 'source.tar'));
  validateSourceReceipt(product, receipt, archive);
  const edition = 'owned-' + receipt.source.commit.slice(0, 12);
  if (current.current === edition) {
    const deployed = response(await guest(config, managerCommand(config, product, 'verify', ['--edition', edition]), undefined, 300_000));
    if (deployed.qualified !== true || deployed.sourceRef !== receipt.source.commit || deployed.sourceTree !== receipt.source.tree || deployed.archiveSha256 !== receipt.archiveSha256) {
      throw Error('The deployed automation edition does not match the full owned source pin.');
    }
    // Check the full pin, never just the display edition's abbreviated commit.
    await refreshService(root, config, product, guest);
    return { product, status: 'current', current: edition, sourceRef: receipt.source.commit };
  }
  const incoming = `${config.root}.runtime/incoming`;
  const remote = `${incoming}/${product}-${edition}-${randomUUID()}.tar`;
  // Upload source bytes and receipt only through the already authenticated, host-key-pinned SSH stdin.
  await guest(config, `umask 077; mkdir -p ${posixQuote(incoming)}; cat > ${posixQuote(remote)}`, archive, 120_000);
  await guest(config, `umask 077; cat > ${posixQuote(remote + '.receipt.json')}`, JSON.stringify(receipt), 30_000);
  let qualified;
  try {
    qualified = response(await guest(config, managerCommand(config, product, 'stage', ['--edition', edition,
      '--archive', remote, '--sha256', receipt.archiveSha256, '--source-ref', receipt.source.commit,
      '--source-receipt', remote + '.receipt.json']), undefined, 1_800_000));
  } catch {
    // A prior interrupted attempt may have a qualified receipt or a frozen-build checkpoint.
    // Neither path skips a byte check or an unpassed functional gate.
    try {
      qualified = response(await guest(config, managerCommand(config, product, 'verify', ['--edition', edition]), undefined, 300_000));
    } catch {
      qualified = response(await guest(config, managerCommand(config, product, 'qualify', ['--edition', edition]), undefined, 600_000));
    }
  }
  if (qualified.qualified !== true || qualified.edition !== edition || qualified.sourceRef !== receipt.source.commit ||
      qualified.sourceTree !== receipt.source.tree || qualified.archiveSha256 !== receipt.archiveSha256) throw Error('The Linux qualification receipt does not match the verified owned source.');
  const activation = response(await guest(config, managerCommand(config, product, 'activate', ['--edition', edition]), undefined, 300_000));
  if (activation.current !== edition) throw Error('The qualified automation runtime was not selected.');
  const after = await state(config, product, guest);
  if (after.current !== edition || after.updatesHeld) throw Error('The new automation runtime did not verify after activation.');
  const { pin } = await refreshService(root, config, product, guest);
  if (pin.sourceRef !== receipt.source.commit || pin.sourceTree !== receipt.source.tree || pin.archiveSha256 !== receipt.archiveSha256) {
    throw Error('The selected automation source changed before registry publication.');
  }
  return { product, status: 'updated', current: edition, sourceRef: receipt.source.commit, artifact: receipt.archiveSha256 };
}

/** Installed daily updater entry: fixed products only, private staging, no GitHub writes or user-data copying. */
export async function updateAutomations(root, { only, mode = 'update' } = {}, services = {}) {
  if (!['update', 'verify', 'rollback', 'resume'].includes(mode)) throw Error('Unknown automation runtime update mode.');
  const product = selections[only];
  if (only && !Object.hasOwn(selections, only)) throw Error('Unknown automation runtime product.');
  if (['rollback', 'resume'].includes(mode) && !only) throw Error('Select one automation product for rollback or resume.');
  root = await realpath(resolve(root));
  const config = await (services.configuration ?? loadConfiguration)();
  const parent = dirname(config.configurationFile);
  if (await realpath(parent) !== parent || contained(root, parent) || parent === root) throw Error('Automation update state must remain outside the synced application installation.');
  const directory = join(parent, 'updates');
  await mkdir(directory, { recursive: true, mode: 0o700 });
  if (await realpath(directory) !== directory) throw Error('Private automation update state was redirected.');
  const sourceLease = fileURLToPath(new URL('../runtime-state.mjs', import.meta.url));
  const leaseModule = await lstat(sourceLease).then(item => item.isFile() ? sourceLease : null).catch(error => { if (error.code !== 'ENOENT') throw error; return null; })
    ?? join(root, 'tools/runtime-update/local-intranet/runtime-state.mjs');
  const { withRuntimeLease } = await import(pathToFileURL(await regular(leaseModule)));
  return withRuntimeLease(directory, async () => {
    let staging;
    try {
    const paths = config.automationUpdates;
    if (mode === 'update') {
      if (!paths?.sourceCaches) throw Error('The protected owned-source update references are not configured.');
      for (const key of ['python', 'publisher']) await regular(paths[key]);
      await regular(config.git);
      for (const key of product ? [product] : Object.keys(PRODUCTS)) {
        if (!isAbsolute(paths.sourceCaches[key] || '') || !(await lstat(paths.sourceCaches[key])).isDirectory()) throw Error('The configured owned-source object cache is unavailable.');
      }
    }
    staging = await mkdtemp(join(directory, 'candidate-'));
    const results = [];
    for (const key of product ? [product] : Object.keys(PRODUCTS)) {
      await (services.ready ?? ensureReady)(config, key);
      results.push(await updateOne(root, config, paths, key, mode, staging, services));
    }
    await writeFile(join(directory, 'last-result.json'), JSON.stringify({ at: new Date().toISOString(), results }) + '\n');
    return results;
    } finally {
      if (staging) {
        const actual = await realpath(staging);
        if (!contained(directory, actual) || actual !== staging) throw Error('Private update staging changed; all copies were preserved.');
        await rm(actual, { recursive: true, force: true });
      }
    }
  });
}
