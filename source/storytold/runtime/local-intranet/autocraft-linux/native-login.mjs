import { spawn } from 'node:child_process';
import { mkdtemp, realpath, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, delimiter, dirname, isAbsolute, join, resolve } from 'node:path';

const origins = Object.freeze({ access: 'http://127.0.0.2:8993', slipcurve: 'http://127.0.0.3:8994' });
const loginPattern = /^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$/;

function environment() {
  const env = Object.fromEntries(Object.entries(process.env).filter(([name]) =>
    !/^(GIT_|GCM_TRACE|GCM_DEBUG|GH_TOKEN$|GITHUB_TOKEN$|INTRANET_GITHUB_CREDENTIAL$)/i.test(name)));
  return { ...env, GCM_INTERACTIVE: 'false', GCM_TRACE: 'false', GCM_TRACE_SECRETS: 'false', GCM_TRACE_MSAUTH: 'false', GCM_DEBUG: 'false', GIT_TERMINAL_PROMPT: '0' };
}

async function credentialManager(git) {
  if (typeof git !== 'string' || !isAbsolute(git) || !(await stat(git)).isFile()) throw Error('The approved native Git installation is unavailable.');
  const root = dirname(dirname(await realpath(git)));
  for (const architecture of ['ucrt64', 'mingw64']) {
    const candidate = join(root, architecture, 'bin', 'git-credential-manager.exe');
    if ((await stat(candidate).catch(() => null))?.isFile()) return await realpath(candidate);
  }
  throw Error('The approved Git Credential Manager is unavailable.');
}

async function withCredential(git, operation) {
  if (process.platform !== 'win32') throw Error('Native sign-in must run as the owning Windows user.');
  const executable = await credentialManager(git);
  const temporaryRoot = await realpath(tmpdir());
  const cwd = await realpath(await mkdtemp(join(temporaryRoot, 'autocraft-native-auth-')));
  let credential = '';
  try {
    credential = await new Promise((accept, reject) => {
      const env = environment();
      env.PATH = [dirname(git), dirname(executable), env.PATH || env.Path || ''].join(delimiter);
      const child = spawn(executable, ['get'], { cwd, env, windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'] });
      let output = '', settled = false;
      const timer = setTimeout(() => { child.kill(); finish(Error('Native credential lookup timed out.')); }, 30000);
      function finish(error, value) { if (settled) return; settled = true; clearTimeout(timer); output = ''; error ? reject(error) : accept(value); }
      child.on('error', () => finish(Error('Native credential lookup could not start.')));
      child.stdout.on('data', chunk => { output += chunk; if (Buffer.byteLength(output) > 32768) { child.kill(); finish(Error('Native credential response was invalid.')); } });
      child.on('close', code => {
        const values = new Map(output.split(/\r?\n/).filter(Boolean).map(line => { const i = line.indexOf('='); return [line.slice(0, i), line.slice(i + 1)]; }));
        const access = values.get('password');
        if (code || !access || !/^[\x21-\x7e]{20,4096}$/.test(access) || values.has('host') && values.get('host') !== 'github.com') finish(Error('The existing GitHub sign-in is unavailable.'));
        else finish(null, access);
      });
      child.stdin.on('error', () => {});
      child.stdin.end('protocol=https\nhost=github.com\n\n');
    });
    return await operation(credential);
  } finally {
    credential = '';
    const actual = await realpath(cwd);
    if (dirname(actual) !== temporaryRoot || !basename(actual).startsWith('autocraft-native-auth-')) throw Error('Native temporary directory changed.');
    await rm(actual, { recursive: true, force: true });
  }
}

async function github(path, access) {
  const response = await fetch(`https://api.github.com${path}`, { redirect: 'error', signal: AbortSignal.timeout(15000), headers: {
    authorization: `Bearer ${access}`, accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28', 'user-agent': 'ACCESS-AutoCraft-Native-SignIn',
  } });
  if (!response.ok) throw Error('GitHub could not verify the existing native identity.');
  return response.json();
}

function identity(value, expectedLogin, expectedId) {
  if (!loginPattern.test(expectedLogin || '') || !value || typeof value.login !== 'string' || value.login.toLowerCase() !== expectedLogin.toLowerCase() ||
      !Number.isSafeInteger(value.id) || value.id <= 0 || expectedId !== undefined && value.id !== expectedId) throw Error('The native GitHub identity does not match the protected owner.');
  return { login: value.login, githubId: value.id };
}

/** OS-native installation preflight: safe public identity metadata, never the credential. */
export async function verifyNativeIdentity({ git, expectedLogin }) {
  return withCredential(git, async access => {
    const owner = identity(await github('/user', access), expectedLogin);
    for (const repo of ['ACCESS_IS4S', 'SLIPCURVE']) {
      const project = await github(`/repos/${encodeURIComponent(owner.login)}/${repo}`, access);
      if (project.owner?.id !== owner.githubId || project.permissions?.admin !== true) throw Error('The native identity does not administer the approved owned repositories.');
    }
    return owner;
  });
}

export function validateNativeHandoff(product, handoff, now = Date.now()) {
  if (!Object.hasOwn(origins, product) || !handoff || typeof handoff.url !== 'string') throw Error('Invalid native product handoff.');
  const url = new URL(handoff.url);
  const expires = Date.parse(handoff.expiresAt);
  if (url.origin !== origins[product] || url.username || url.password || url.pathname !== '/auth/native' || url.search ||
      !/^#[A-Za-z0-9_-]{43}$/.test(url.hash) || !Number.isFinite(expires) || expires <= now || expires > now + 65000) throw Error('The native handoff is invalid or expired.');
  return url.href;
}

/** Native-only one-use handoff for the installed launcher or its isolated browser verification. Never log its result. */
export async function prepareNativeLogin({ product, configuration, issue }) {
  if (!Object.hasOwn(origins, product) || typeof issue !== 'function') throw Error('Unknown native product.');
  const pin = configuration?.nativeOwner;
  if (!pin || !loginPattern.test(pin.login || '') || !Number.isSafeInteger(pin.githubId) || pin.githubId <= 0) throw Error('A protected native owner pin is required.');
  return withCredential(configuration.git, async access => {
    const owner = identity(await github('/user', access), pin.login, pin.githubId);
    const handoff = await issue({ access });
    const url = validateNativeHandoff(product, handoff);
    return { product, login: owner.login, githubId: owner.githubId, url };
  });
}

/** Controller supplies a protected configuration and its authenticated strict-SSH issuer. */
export async function nativeLogin(options) {
  const handoff = await prepareNativeLogin(options);
  const opener = resolve(process.env.SystemRoot || 'C:/Windows', 'System32', 'rundll32.exe');
  await new Promise((accept, reject) => {
    const child = spawn(opener, ['url.dll,FileProtocolHandler', handoff.url], { windowsHide: true, stdio: 'ignore' });
    child.once('error', () => reject(Error('The browser could not open native sign-in.')));
    child.once('spawn', accept);
  });
  return { product: handoff.product, login: handoff.login, githubId: handoff.githubId };
}
