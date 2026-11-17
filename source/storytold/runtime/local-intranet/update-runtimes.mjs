import { execFile, spawn } from 'node:child_process';
import { appendFile, lstat, mkdtemp, readFile, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs, promisify } from 'node:util';
import { download, signedChecksum, verifyArchive } from '../acquire-web-releases.mjs';
import { serveCandidate } from './intranet.mjs';
import { activeRuntime, newerVersion, promoteRuntime, resumeRuntime, rollbackRuntime, runtimeTree } from './runtime-state.mjs';

const run = promisify(execFile);
const source = dirname(fileURLToPath(import.meta.url));
const managed = [
  { key: 'cadcraft-native', id: 'cadcraft', kind: 'native', entry: 'cadcraft.exe', gate: 'verify-cadcraft-native.py' },
  { key: 'effectcraft-native', id: 'effectcraft', kind: 'native', entry: 'effectcraft.exe', gate: 'verify-creative-native.mjs' },
  { key: 'lightcraft-native', id: 'lightcraft', kind: 'native', entry: 'lightcraft.exe', gate: 'verify-creative-native.mjs' },
  { key: 'vectorcraft-native', id: 'vectorcraft', kind: 'native', entry: 'vectorcraft.exe', gate: 'verify-vectorcraft-native.py' },
  { key: 'photocraft-web', id: 'photocraft', kind: 'web', entry: 'index.html', gate: 'verify-photocraft-browser.py' },
  { key: 'gridcraft-web', id: 'gridcraft', kind: 'web', entry: 'index.html', gate: 'verify-office-browser.py', arguments: ['gridcraft'] },
  { key: 'wordcraft-web', id: 'wordcraft', kind: 'web', entry: 'index.html', gate: 'verify-office-browser.py', arguments: ['wordcraft'] },
];
const checks = ['SHA256SUMS.txt', 'SHA256SUMS.txt.asc', 'release-signing-key.asc'];
const maxAssetBytes = 512 * 1024 * 1024;
const tagPattern = /^v\d{1,6}\.\d{1,6}\.\d{1,6}$/;

async function readJson(file) {
  return JSON.parse(await readFile(file, 'utf8'));
}

async function updateLog(report, text) {
  const directory = dirname(report);
  const existing = await lstat(report).catch(error => { if (error.code !== 'ENOENT') throw error; });
  if ((existing && !existing.isFile()) || relative(directory, await realpath(directory)) !== '') {
    throw Error('Runtime update log may not be a redirected file');
  }
  await appendFile(report, `${new Date().toISOString()} ${text}\n`);
}

async function gate(root, app, path) {
  const runner = join(root, 'tools', 'runtime-update');
  const python = join(root, 'SLIPCURVE', 'runtime', 'python.exe');
  const target = join(source, '..', app.gate);
  if (app.gate.endsWith('.mjs')) {
    const candidate = join(path, `${app.id}-cli.exe`);
    const result = await run(process.execPath, [target, app.id, candidate], { cwd: runner, timeout: 240_000, windowsHide: true });
    console.log(result.stdout.trim());
    return;
  }
  const shim = 'import os,runpy,sys; sys.path.insert(0,sys.argv.pop(1)); script=sys.argv.pop(1); sys.path.insert(0,os.path.dirname(script)); sys.argv[0]=script; runpy.run_path(script,run_name="__main__")';
  const test = args => run(python, ['-I', '-B', '-c', shim, join(runner, 'python-deps'), target, ...args], {
    cwd: runner, timeout: 240_000, windowsHide: true,
  });
  if (app.kind === 'native') {
    const result = await test([join(path, `${app.id}-cli.exe`)]);
    console.log(result.stdout.trim());
    return;
  }
  const endpoint = await serveCandidate(path, { ...app, version: basename(path) });
  try {
    const chrome = (await readJson(join(runner, 'settings.json'))).chrome;
    const result = await test([...(app.arguments ?? []), '--url', endpoint.url, '--chromium-executable', chrome]);
    console.log(result.stdout.trim());
  } finally {
    await endpoint.close();
  }
}

async function release(app, tag) {
  const route = tag ? `tags/${tag}` : 'latest';
  const response = await fetch(`https://api.github.com/repos/storytold/${app.id}/releases/${route}`, {
    redirect: 'error', signal: AbortSignal.timeout(25_000),
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'ACCESS-IS4S-Intranet' },
  });
  if (!response.ok) throw Error(`GitHub release lookup returned HTTP ${response.status}`);
  const data = await response.json();
  if (data.draft || data.prerelease || !tagPattern.test(data.tag_name) || (tag && tag !== data.tag_name)) {
    throw Error('Upstream did not return the expected stable release');
  }
  return data;
}

async function stage(root, app, upstream, directory) {
  const tag = upstream.tag_name;
  const version = tag.slice(1);
  const asset = app.kind === 'web' ? `${app.id}-web-${version}.zip` : `${app.id}-${version}-windows-x64-portable.zip`;
  const base = `https://github.com/storytold/${app.id}/releases/download/${tag}/`;
  const files = [...checks, asset];
  const assets = files.map(name => upstream.assets.find(item => item.name === name && item.browser_download_url === base + name));
  if (assets.some((item, index) => !item || !Number.isSafeInteger(item.size) || item.size < 1 ||
      item.size > (index === 3 ? maxAssetBytes : 1024 * 1024))) {
    throw Error('Release omits a required artifact or supplies unexpected metadata');
  }
  for (const item of assets.slice(0, 3)) await download(item.browser_download_url, join(directory, item.name), item.size);
  const checksum = await signedChecksum(directory, files, asset, app.signer);
  const archive = assets[3];
  if (archive.digest && archive.digest !== `sha256:${checksum}`) throw Error('GitHub digest differs from signed checksum');
  await download(archive.browser_download_url, join(directory, asset), archive.size);
  await verifyArchive(directory, files, asset, { signingKeyFingerprint: app.signer, sha256Expected: checksum, bytes: archive.size });
  const candidate = { version: app.kind === 'web' ? tag : version, artifact: checksum };
  await run(join(root, 'SLIPCURVE', 'runtime', 'python.exe'), ['-B', join(source, 'stage-runtime.py'),
    join(directory, asset), join(directory, 'unpacked'), root, app.kind, app.id, candidate.version, checksum, app.entry],
  { timeout: 180_000, windowsHide: true });
  return candidate;
}

async function update(root, app, tag) {
  const current = await activeRuntime(root, app);
  if (current.hold) return `${app.key} held after rollback from ${current.hold}`;
  const upstream = await release(app, tag);
  if (!newerVersion(upstream.tag_name, current.version)) return `${app.key} current at ${current.version} (upstream ${upstream.tag_name})`;
  const directory = await mkdtemp(join(await realpath(tmpdir()), 'is4s-release-'));
  try {
    const candidate = await stage(root, app, upstream, directory);
    const activated = await promoteRuntime(root, app, candidate, path => gate(root, app, path));
    return `${app.key} activated ${activated.version}, verified artifact ${activated.artifact}`;
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function main() {
  const { positionals, values } = parseArgs({ allowPositionals: true, options: {
    root: { type: 'string' }, only: { type: 'string' }, tag: { type: 'string' },
  } });
  const [mode = 'update'] = positionals;
  if (positionals.length > 1 || !['update', 'verify', 'rollback', 'resume', 'launch'].includes(mode) ||
      (values.tag && (!tagPattern.test(values.tag) || mode !== 'update' || !values.only)) ||
      (['rollback', 'resume', 'launch'].includes(mode) && !values.only)) throw Error('Use update, verify, rollback, resume or launch. Specify --only for one application.');
  const root = await realpath(resolve(values.root || join(source, '../../..')));
  const selected = values.only ? managed.filter(app => app.key === values.only) : managed;
  if (!selected.length) throw Error('No functional update gate for that application');
  const { targets } = await readJson(join(source, '../app-targets.json'));
  const web = await readJson(join(root, 'installed-web.json'));
  const native = await readJson(join(root, 'Storytold/native/native-apps.json'));
  const report = join(root, 'tools/runtime-update/update.log');
  for (const app of selected) {
    try {
      const inventory = app.kind === 'web' ? web.apps : native.apps;
      app.version = inventory.find(item => item.id === app.id).version;
      app.signer = targets.find(item => item.id === app.id).releaseArtifact.signingKeyFingerprint;
      if (mode === 'launch') {
        const { version } = await activeRuntime(root, app);
        const cwd = runtimeTree(root, app, version);
        const child = spawn(join(cwd, basename(app.entry)), [], { cwd, detached: true, stdio: 'ignore' });
        await new Promise((success, failure) => { child.once('spawn', success); child.once('error', failure); });
        child.unref();
        continue;
      }
      let outcome;
      if (mode === 'update') outcome = await update(root, app, values.tag);
      if (mode === 'rollback') outcome = `${app.key} restored ${(await rollbackRuntime(root, app)).version} and held automatic updates`;
      if (mode === 'resume') {
        await resumeRuntime(root, app);
        outcome = `${app.key} resumed automatic updates`;
      }
      if (mode === 'verify') {
        const { version } = await activeRuntime(root, app);
        await gate(root, app, runtimeTree(root, app, version));
        outcome = `${app.key} ${version} functional regression passed`;
      }
      console.log(outcome);
      await updateLog(report, outcome);
    } catch (error) {
      const outcome = `${app.key} ${mode} failed: ${error.stderr?.trim() || error.message}`;
      console.error(outcome);
      await updateLog(report, outcome);
      process.exitCode = 1;
    }
  }
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
