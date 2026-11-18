import { spawn } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { lstat, mkdir, realpath } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const products = new Set(['access', 'slipcurve']);
const secret = /^[\x21-\x7e]{20,4096}$/;
const inside = (root, path) => {
  const value = relative(root, path);
  return value && value !== '..' && !value.startsWith('..' + sep) && !isAbsolute(value);
};

export function boundNativeTokens(db, config, product, core, now = Date.now()) {
  const pin = config.secrets.nativeOwner;
  if (!products.has(product) || pin?.product !== product || !Number.isSafeInteger(pin.githubId) || pin.githubId <= 0) throw Error('Native owner session is unavailable.');
  const row = db.prepare(`SELECT s.id_hash,s.login,s.created_at,s.expires_at,s.token_enc,a.role,a.github_id
    FROM settings b JOIN sessions s ON s.id_hash=b.value JOIN access a ON a.login=s.login
    WHERE b.key=?`).get('native_cli_session.' + product);
  const binding = row?.id_hash;
  if (!/^[a-f0-9]{64}$/.test(binding || '')) throw Error('Native owner session is unavailable.');
  if (!row || row.login.toLowerCase() !== pin.login.toLowerCase() || row.github_id !== pin.githubId || row.role !== 'operator' ||
      !Number.isFinite(Date.parse(row.expires_at)) || now >= Date.parse(row.expires_at) ||
      !Number.isFinite(core.sessionEndsAt(row.created_at, row.role)) || now >= core.sessionEndsAt(row.created_at, row.role)) throw Error('Native owner session is unavailable.');
  const tokens = core.openTokens(new core.TokenBox(config.secrets.sessionKey), row.token_enc, binding);
  if (!tokens || !secret.test(tokens.access || '') || tokens.expiresAt !== null && (!Number.isFinite(tokens.expiresAt) || now >= tokens.expiresAt)) {
    throw Error('Native owner session is unavailable.');
  }
  return tokens;
}

export function ghEnvironment(inherited, data, tokens) {
  const allowed = new Set(['LANG', 'LC_ALL', 'LC_CTYPE', 'TZ', 'USER', 'LOGNAME', 'TERM', 'COLUMNS', 'LINES',
    'XDG_RUNTIME_DIR', 'DBUS_SESSION_BUS_ADDRESS']);
  const env = Object.fromEntries(Object.entries(inherited).filter(([name]) => allowed.has(name)));
  // Explicit upstream per-user / installation credentials keep their normal priority, after native owner-session validation.
  const access = inherited.GH_TOKEN || tokens.access;
  if (!secret.test(access)) throw Error('Native owner credential is unavailable.');
  if (inherited.GH_REPO) {
    if (!/^(?:github\.com\/)?[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/.test(inherited.GH_REPO)) throw Error('The native GitHub repository context is invalid.');
    env.GH_REPO = inherited.GH_REPO;
  }
  return { ...env, PATH: '/opt/node/bin:/usr/bin:/bin', GH_HOST: 'github.com', GH_TOKEN: access,
    GH_CONFIG_DIR: join(data, 'gh-native'), GH_PROMPT_DISABLED: '1', GH_NO_UPDATE_NOTIFIER: '1',
    GH_NO_EXTENSION_UPDATE_NOTIFIER: '1', GH_TELEMETRY: 'false', GIT_TERMINAL_PROMPT: '0' };
}

export function validateGhArguments(args) {
  if (!Array.isArray(args) || args.some(value => typeof value !== 'string' || value.includes('\0'))) throw Error('Invalid GitHub command.');
  // Credentials remain in the current native session. This adapter must never register, refresh or erase an external grant/store.
  if (args[0] === 'auth' && ['login', 'refresh', 'logout', 'switch', 'setup-git'].includes(args[1])) throw Error('Manage this credential through native sign-in.');
  for (let index = 0; index < args.length; index++) {
    const value = args[index];
    if (value === '--hostname' && args[index + 1] !== 'github.com' || value.startsWith('--hostname=') && value !== '--hostname=github.com') throw Error('The native GitHub host must remain github.com.');
    const repo = value === '--repo' || value === '-R' ? args[index + 1] : value.startsWith('--repo=') ? value.slice(7) : value.startsWith('-R') && value.length > 2 ? value.slice(2) : null;
    if (repo !== null && !/^(?:github\.com\/)?[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/.test(repo || '')) throw Error('The native GitHub repository context is invalid.');
    if (/^https?:\/\//i.test(value)) {
      const url = new URL(value);
      if (url.protocol !== 'https:' || !['github.com', 'api.github.com', 'uploads.github.com'].includes(url.hostname) || url.username || url.password) throw Error('The native GitHub endpoint is invalid.');
    }
  }
  return args;
}

async function privatePath(path, { directory = false } = {}) {
  if (typeof path !== 'string' || !isAbsolute(path) || /[\r\n\0]/.test(path)) throw Error('Private native runtime configuration is unavailable.');
  const entry = await lstat(path);
  const actual = await realpath(path);
  if (actual !== resolve(path) || entry.isSymbolicLink() || (directory ? !entry.isDirectory() : !entry.isFile()) ||
      entry.uid !== process.getuid() || entry.mode & 0o077) throw Error('Private native runtime configuration is unavailable.');
  return actual;
}

export async function nativeGhEnvironment({ product, runtimeRoot, dataRoot }, inherited = process.env) {
  if (process.platform !== 'linux' || !products.has(product) || !isAbsolute(runtimeRoot || '')) throw Error('Native Linux runtime is unavailable.');
  const runtime = await realpath(runtimeRoot);
  if (!(await lstat(runtime)).isDirectory()) throw Error('Native Linux runtime is unavailable.');
  const data = await privatePath(dataRoot, { directory: true });
  if (inside(runtime, data) || inside(data, runtime) || runtime === data || dirname(data) === data) throw Error('Native private data must remain separate from the runtime.');
  const database = await privatePath(inherited.AUTOCRAFT_DB);
  const secrets = await privatePath(inherited.AUTOCRAFT_SECRETS_FILE);
  if (!inside(data, database) || !inside(data, secrets)) throw Error('Native private data is outside its configured instance.');
  const configModule = await import(pathToFileURL(join(runtime, 'src/dash/server/config.ts')));
  const nativeModule = await import(pathToFileURL(join(runtime, 'src/dash/server/native-signin.ts')));
  const sessions = await import(pathToFileURL(join(runtime, 'src/dash/server/sessions.ts')));
  const crypto = await import(pathToFileURL(join(runtime, 'src/dash/server/crypto.ts')));
  const config = configModule.loadConfig(inherited);
  if (nativeModule.nativeOwner(config)?.product !== product) throw Error('Native owner session is unavailable.');
  if (resolve(config.dbPath) !== database || resolve(config.secretsFile) !== secrets) throw Error('Native private configuration changed.');
  const db = new DatabaseSync(database, { readOnly: true });
  try {
    const tokens = boundNativeTokens(db, config, product, { ...sessions, ...crypto });
    const environment = ghEnvironment(inherited, data, tokens);
    const ghConfig = join(data, 'gh-native');
    if (!await lstat(ghConfig).catch(error => { if (error.code !== 'ENOENT') throw error; return null; })) await mkdir(ghConfig, { mode: 0o700 });
    await privatePath(ghConfig, { directory: true });
    if (await lstat(join(ghConfig, 'hosts.yml')).catch(error => { if (error.code !== 'ENOENT') throw error; return null; })) throw Error('A native credential store must not contain a separate authorization file.');
    return environment;
  } finally {
    db.close();
  }
}

async function main() {
  const argv = process.argv.slice(2);
  const separator = argv.indexOf('--');
  const options = argv.slice(0, separator);
  if (separator !== 6 || options[0] !== '--product' || options[2] !== '--runtime-root' || options[4] !== '--data-root') throw Error('Invalid fixed native GitHub launcher.');
  const args = validateGhArguments(argv.slice(separator + 1));
  const env = await nativeGhEnvironment({ product: options[1], runtimeRoot: options[3], dataRoot: options[5] });
  const child = spawn('/usr/bin/gh', args, { env, stdio: 'inherit' });
  process.exitCode = await new Promise((accept, reject) => {
    child.once('error', () => reject(Error('The installed GitHub client could not start.')));
    child.once('close', (code, signal) => accept(signal ? 1 : code ?? 1));
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(() => {
  process.stderr.write('AutoCraft GitHub access requires the current verified native owner session. Sign in using the installed application.\n');
  process.exitCode = 1;
});
