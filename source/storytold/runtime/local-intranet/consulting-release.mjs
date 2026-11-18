import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { cp, lstat, mkdir, mkdtemp, open, readFile, realpath, rename, rm, writeFile } from 'node:fs/promises';
import { devNull, tmpdir } from 'node:os';
import { delimiter, dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs, promisify } from 'node:util';
import { consultingEdition, consultingPaths, consultingRegistry, consultingRevision, consultingState } from './consulting-edition.mjs';
import { treeDigest, withRuntimeLease } from './runtime-state.mjs';
import { serveCandidate } from './intranet.mjs';

const run = promisify(execFile);
const tooling = dirname(fileURLToPath(import.meta.url));
const remote = 'https://github.com/GOSTROGIS/CONSULTING.git';
const pathsToExclude = new Set(['private-data', 'local-work', 'registry-archive', 'delivery', '.git', '.github']);
const tests = [
  'publication-gates.test.mjs', 'workbench-pipeline.test.mjs', 'workbench-local-json.test.mjs',
  'mcp-local-transport.test.mjs', 'mcp-stdio.test.mjs',
].map(file => `tests/${file}`);
const systemVariables = new Set(['PATH', 'PATHEXT', 'SYSTEMROOT', 'SYSTEMDRIVE', 'WINDIR', 'COMSPEC',
  'TEMP', 'TMP', 'TMPDIR', 'OS', 'PROCESSOR_ARCHITECTURE', 'NUMBER_OF_PROCESSORS']);

export function executionEnvironment(overrides = {}, extra = []) {
  const system = Object.fromEntries(Object.entries(process.env)
    .filter(([key]) => systemVariables.has(key.toUpperCase()) || extra.includes(key.toUpperCase()))
    .map(([key, value]) => [key.toUpperCase(), value]));
  const environment = { ...system, ...overrides };
  // Publication validators start Node children by name; the scheduled owner
  // environment need not have this approved bundled runtime on its PATH.
  environment.PATH = [dirname(process.execPath), environment.PATH || ''].filter(Boolean).join(delimiter);
  return environment;
}

// Only Git receives the profile paths needed by the owner's configured credential helper.
const gitEnvironment = () => executionEnvironment({ GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'Never' },
  ['APPDATA', 'LOCALAPPDATA', 'USERPROFILE', 'HOME', 'HOMEDRIVE', 'HOMEPATH']);

async function revision(git) {
  const { stdout } = await run(git, ['ls-remote', '--exit-code', remote, 'refs/heads/main'],
    { timeout: 45_000, windowsHide: true, env: gitEnvironment() });
  const commit = stdout.match(/^([a-f0-9]{40})\s+refs\/heads\/main\s*$/)?.[1];
  if (!commit) throw Error('CONSULTING remote did not identify one main revision');
  return commit;
}

async function digests(edition) {
  const [site, mcp] = await Promise.all(['site', 'mcp'].map(folder => treeDigest(join(edition, folder), { prefetch: true })));
  return { site, mcp };
}

function equalDigests(expected, actual) {
  return expected?.site === actual.site && expected?.mcp === actual.mcp;
}

async function verifyRelease(root, commit, expected) {
  const edition = consultingEdition(root, commit);
  const current = await digests(edition);
  if (expected && !equalDigests(expected, current)) throw Error('CONSULTING runtime fingerprint changed');
  return current;
}

async function writeRegistry(root, state) {
  const path = join(root, `.consulting-${randomUUID()}.tmp`);
  try {
    const file = await open(path, 'wx');
    try {
      await file.writeFile(JSON.stringify({ schema: 1, ...state }, null, 2) + '\n');
      await file.sync();
    } finally {
      await file.close();
    }
    await rename(path, join(root, consultingRegistry));
  } finally {
    await rm(path, { force: true });
  }
}

async function copyTree(source, destination, publicAssets) {
  if (relative(source, await realpath(source))) throw Error('Redirected CONSULTING source directory');
  await cp(source, destination, {
    recursive: true, force: false, errorOnExist: true,
    filter: async path => {
      const item = await lstat(path);
      if (!(item.isDirectory() || item.isFile())) throw Error('Linked or special file in CONSULTING candidate');
      const name = relative(source, path).toLowerCase();
      if (publicAssets && (name.split(sep).some(part => pathsToExclude.has(part) || /^(\.env|\.npmrc)/.test(part)) ||
            /\.(pem|key|pfx|p12)$/.test(name))) throw Error('Private material appeared in the CONSULTING publication');
      return true;
    },
  });
}

async function browserAndMcp(root, edition, config) {
  const { python, dependencies, chromium } = config;
  const shim = 'import runpy,sys;sys.path.insert(0,sys.argv.pop(1));script=sys.argv.pop(1);sys.argv[0]=script;runpy.run_path(script,run_name="__main__")';
  const endpoint = await serveCandidate(join(edition, 'site'), { id: 'consulting', version: 'v1.0.0' });
  try {
    const browser = await run(python, ['-I', '-B', '-c', shim, dependencies, join(tooling, '../verify-consulting-browser.py'),
      '--url', endpoint.url, '--chromium-executable', chromium], { cwd: root, windowsHide: true, timeout: 150_000, env: executionEnvironment() });
    console.log(browser.stdout.trim());
  } finally {
    await endpoint.close();
  }
  const mcp = await run(process.execPath, [join(tooling, '../verify-consulting-mcp.mjs'), edition],
    { cwd: root, windowsHide: true, timeout: 90_000, env: executionEnvironment() });
  console.log(mcp.stdout.trim());
}

export async function installConsultingBuild(root, checkout, commit, config) {
  if (!consultingRevision.test(commit)) throw Error('Invalid CONSULTING build revision');
  const releases = join(root, 'releases');
  await mkdir(releases, { recursive: true });
  if (relative(releases, await realpath(releases))) throw Error('Redirected CONSULTING releases directory');
  return withRuntimeLease(root, async () => {
    const state = await consultingState(root);
    if (state.hold) throw Error('CONSULTING updates are held after rollback');
    if (state.active === commit) return `CONSULTING already serves ${commit}`;
    const edition = consultingEdition(root, commit);
    const receiptPath = join(edition, 'edition.json');
    const stagingMarker = join(edition, '.installing');
    let receipt;
    let exists = await lstat(edition).catch(error => {
      if (error.code === 'ENOENT') return null;
      throw error;
    });
    if (exists) {
      if (!exists.isDirectory() || relative(edition, await realpath(edition))) throw Error('Redirected CONSULTING edition');
      const receiptItem = await lstat(receiptPath).catch(error => {
        if (error.code === 'ENOENT') return null;
        throw error;
      });
      if (receiptItem && !receiptItem.isFile()) throw Error('Redirected CONSULTING edition receipt');
      if (receiptItem) receipt = await readFile(receiptPath, 'utf8').then(JSON.parse).catch(error => {
        if (error instanceof SyntaxError) return null;
        throw error;
      });
      if (receipt && receipt.revision !== commit) throw Error('Unexpected CONSULTING edition receipt');
      if (!receipt) {
        if (state.previous === commit || (await readFile(stagingMarker, 'utf8').catch(() => '')) !== commit) {
          throw Error('Existing CONSULTING directory has no complete edition receipt');
        }
        // Only an inactive directory created by this updater can be recovered after interruption.
        await rm(edition, { recursive: true, force: true });
        exists = null;
      }
    }
    if (!exists) {
      await mkdir(edition);
      await writeFile(stagingMarker, commit, { flag: 'wx' });
      await copyTree(join(checkout, 'dist'), join(edition, 'site'), true);
      const source = join(checkout, 'mcp');
      const target = join(edition, 'mcp');
      await mkdir(target);
      for (const file of ['server.mjs', 'package.json', 'package-lock.json', 'lib', 'node_modules']) {
        await copyTree(join(source, file), join(target, file), false);
      }
    }
    const before = await verifyRelease(root, commit, receipt);
    await browserAndMcp(root, edition, config);
    await verifyRelease(root, commit, before);
    if (!receipt) {
      await writeFile(receiptPath, JSON.stringify({ revision: commit, ...before }) + '\n', { flag: 'wx' });
      await rm(stagingMarker);
    }
    const previous = await verifyRelease(root, state.active, state.activeDigest);
    if (config.git && commit !== await revision(config.git)) throw Error('CONSULTING source changed while staging');
    await writeRegistry(root, { active: commit, activeDigest: before, previous: state.active, previousDigest: previous });
    return `CONSULTING selected ${commit}; previous edition ${state.active} retained`;
  });
}

export async function rollbackConsulting(root) {
  return withRuntimeLease(root, async () => {
    const state = await consultingState(root);
    if (!state.previous || !state.previousDigest) throw Error('CONSULTING has no prior edition to restore');
    const digest = await verifyRelease(root, state.previous, state.previousDigest);
    await writeRegistry(root, { active: state.previous, activeDigest: digest, hold: state.active });
    return `CONSULTING restored ${state.previous}; automatic updates held`;
  });
}

async function update(root, config) {
  const { git, npm, python } = config;
  const state = await consultingState(root);
  if (state.hold) return 'CONSULTING automatic updates held after rollback';
  const commit = await revision(git);
  if (state.active === commit) return `CONSULTING current at ${commit}`;
  const scratch = await mkdtemp(join(await realpath(tmpdir()), 'consulting-update-'));
  try {
    const checkout = join(scratch, 'source');
    const gitExec = args => run(git, args, { timeout: 1_800_000, windowsHide: true, env: gitEnvironment() });
    await gitExec(['clone', '--config', 'core.longpaths=true', '--config', 'core.autocrlf=false', '--depth', '1',
      '--filter=blob:none', '--single-branch', '--branch', 'main', '--no-checkout', '--', remote, checkout]);
    await gitExec(['-C', checkout, 'checkout', '--detach', commit]);
    const status = await gitExec(['-C', checkout, 'status', '--porcelain']);
    if (status.stdout.trim() || commit !== await revision(git)) throw Error('CONSULTING source changed during candidate checkout');
    const args = { cwd: checkout, timeout: 1_200_000, windowsHide: true, maxBuffer: 4 * 1024 * 1024,
      env: executionEnvironment({ PATH: [dirname(python), process.env.PATH || ''].filter(Boolean).join(delimiter) }) };
    await run(python, ['-I', '-B', 'scripts/validate-publications.py', '--root', checkout], args);
    await run(process.execPath, ['scripts/build.mjs'], args);
    const npmConfig = join(scratch, 'npmrc');
    await writeFile(npmConfig, 'registry=https://registry.npmjs.org/\nignore-scripts=true\n', { flag: 'wx' });
    const npmEnvironment = executionEnvironment({ NPM_CONFIG_GLOBALCONFIG: devNull, NPM_CONFIG_USERCONFIG: npmConfig,
      NPM_CONFIG_CACHE: join(scratch, 'npm-cache') });
    await run(process.execPath, [npm, 'ci', '--prefix', 'mcp', '--ignore-scripts', '--no-audit', '--no-fund'], { ...args, env: npmEnvironment });
    const gates = await run(process.execPath, ['--test', ...tests], { ...args, env: {
      ...npmEnvironment, npm_execpath: npm, PATH: [dirname(python), npmEnvironment.PATH].join(process.platform === 'win32' ? ';' : ':'),
    } });
    if (!/\bskipped 0\b/.test(gates.stdout)) throw Error('CONSULTING candidate skipped a required regression');
    if (commit !== await revision(git)) throw Error('A newer CONSULTING main arrived during candidate verification');
    return await installConsultingBuild(root, checkout, commit, config);
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
}

async function main() {
  const { positionals, values } = parseArgs({ allowPositionals: true, options: { root: { type: 'string' } } });
  const [mode = 'update'] = positionals;
  if (positionals.length > 1 || !values.root || !['update', 'verify', 'rollback', 'resume'].includes(mode)) {
    throw Error('Use update, verify, rollback or resume with --root pointing to the intranet folder');
  }
  const intranet = await realpath(resolve(values.root));
  const root = join(intranet, 'CONSULTING');
  if (relative(root, await realpath(root))) throw Error('Redirected CONSULTING directory');
  if (mode === 'rollback') return rollbackConsulting(root);
  if (mode === 'resume') return withRuntimeLease(root, async () => {
    const state = await consultingState(root);
    if (state.hold) {
      delete state.hold;
      await writeRegistry(root, state);
    }
    return 'CONSULTING automatic updates resumed';
  });
  const runner = join(intranet, 'tools', 'runtime-update');
  const settings = JSON.parse(await readFile(join(runner, 'settings.json'), 'utf8'));
  const config = { git: settings.git, chromium: settings.chrome, npm: join(runner, 'npm', 'bin', 'npm-cli.js'),
    python: join(intranet, 'SLIPCURVE', 'runtime', 'python.exe'), dependencies: join(runner, 'python-deps') };
  if (mode === 'update') return update(root, config);

  const state = await consultingState(root);
  const { revision: active } = await consultingPaths(root);
  await verifyRelease(root, active, state.activeDigest);
  await browserAndMcp(root, consultingEdition(root, active), config);
  return `CONSULTING functional verification passed for ${active}`;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { console.log(await main()); }
  catch (error) { console.error(error.stderr?.trim() || error.message); process.exitCode = 1; }
}
