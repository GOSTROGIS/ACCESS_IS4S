import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { lstat, open, readFile, readdir, realpath, rename, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { join, relative } from 'node:path';

const idPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const versionPattern = /^v?\d{1,6}\.\d{1,6}\.\d{1,6}(?:-[a-z0-9]+(?:-[a-z0-9]+)*)?$/;
const hash = /^[a-f0-9]{64}$/;
const stateFile = 'runtime-editions.json';
export const versionedWebApps = new Set(['gridcraft', 'photocraft', 'wordcraft']);

function appKey(app) {
  if (!['web', 'native'].includes(app.kind) || !idPattern.test(app.id)) throw Error('Invalid runtime identity');
  return `${app.kind}/${app.id}`;
}

export function runtimeTree(root, app, version = app.version) {
  appKey(app);
  if (typeof version !== 'string' || !versionPattern.test(version)) throw Error('Invalid runtime version');
  return app.kind === 'web' ? join(root, 'Storytold', 'web', app.id, version)
    : join(root, 'Storytold', 'native', 'apps', app.id, version);
}

export function newerVersion(candidate, current) {
  if (!/^v?\d{1,6}\.\d{1,6}\.\d{1,6}$/.test(candidate) || !versionPattern.test(current)) return false;
  const numbers = version => version.replace(/^v/, '').split('-')[0].split('.').map(Number);
  const present = numbers(current);
  return (numbers(candidate).map((number, index) => number - present[index]).find(delta => delta !== 0) ?? 0) > 0;
}

async function readState(root) {
  const body = await readFile(join(root, stateFile), 'utf8').catch(error => {
    if (error.code === 'ENOENT') return '{"schema":1,"apps":{}}';
    throw error;
  });
  const state = JSON.parse(body);
  if (state.schema !== 1 || !state.apps || Array.isArray(state.apps) || typeof state.apps !== 'object') {
    throw Error('Invalid runtime registry');
  }
  return state;
}

function checkRecord(root, app, record) {
  runtimeTree(root, app, record.version);
  if (!hash.test(record.treeSha256) || (record.artifact !== null && !hash.test(record.artifact))) {
    throw Error('Invalid runtime integrity record');
  }
}

export async function activeRuntime(root, app) {
  const row = (await readState(root)).apps[appKey(app)];
  if (!row) return { version: app.version, retained: [] };
  checkRecord(root, app, row.current);
  const retained = row.retained ?? [row.previous?.version, row.hold].filter(Boolean);
  for (const version of retained) runtimeTree(root, app, version);
  return { ...row.current, hold: row.hold, retained };
}

export async function treeDigest(root, { prefetch = false } = {}) {
  if (relative(root, await realpath(root)) !== '') throw Error('Linked runtime directory');
  const result = createHash('sha256');
  const append = (name, size) => result.update(JSON.stringify([name, size]) + '\n');
  if (prefetch) {
    const files = [];
    async function collect(directory, prefix) {
      const entries = await readdir(directory, { withFileTypes: true });
      entries.sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
      for (const entry of entries) {
        const path = join(directory, entry.name);
        if (entry.isDirectory()) await collect(path, `${prefix}${entry.name}/`);
        else if (entry.isFile()) files.push({ path, name: `${prefix}${entry.name}` });
        else throw Error('Runtime contains a link or special file');
      }
    }
    await collect(root, '');
    for (let offset = 0; offset < files.length; offset += 8) {
      const batch = await Promise.all(files.slice(offset, offset + 8).map(async file => {
        const item = await lstat(file.path);
        if (!item.isFile()) throw Error('Runtime contains a link or special file');
        if (item.size > 16 * 1024 * 1024) return { ...file, size: item.size };
        const data = await readFile(file.path);
        if (data.length !== item.size) throw Error('Runtime file changed while hashing');
        return { ...file, size: item.size, data };
      }));
      for (const { name, path, size, data } of batch) {
        append(name, size);
        if (data) result.update(data);
        else for await (const chunk of createReadStream(path)) result.update(chunk);
      }
    }
    return result.digest('hex');
  }
  async function walk(directory, prefix) {
    for (const name of (await readdir(directory)).sort()) {
      const path = join(directory, name);
      const item = await lstat(path);
      if (item.isDirectory()) {
        await walk(path, `${prefix}${name}/`);
      } else if (item.isFile()) {
        append(prefix + name, item.size);
        for await (const chunk of createReadStream(path)) result.update(chunk);
      } else {
        throw Error('Runtime contains a link or special file');
      }
    }
  }
  await walk(root, '');
  return result.digest('hex');
}

async function writeState(root, state) {
  const candidate = join(root, `.runtime-editions-${randomUUID()}.tmp`);
  try {
    const file = await open(candidate, 'wx');
    try {
      await file.writeFile(JSON.stringify(state, null, 2) + '\n');
      await file.sync();
    } finally {
      await file.close();
    }
    await rename(candidate, join(root, stateFile));
  } finally {
    await rm(candidate, { force: true });
  }
}

export async function withRuntimeLease(root, action) {
  if (process.platform === 'win32') {
    // Windows closes the pipe even if Task Scheduler terminates the process.
    const key = createHash('sha256').update((await realpath(root)).toLowerCase()).digest('hex');
    const lease = createServer(client => client.destroy());
    await new Promise((accept, reject) => {
      lease.once('error', reject);
      lease.listen(`\\\\.\\pipe\\access-is4s-update-${key}`, accept);
    });
    try {
      return await action();
    } finally {
      await new Promise(accept => lease.close(accept));
    }
  }
  const path = join(root, '.runtime-update.lock');
  const file = await open(path, 'wx').catch(error => {
    if (error.code === 'EEXIST') throw Error('A runtime change is already in progress');
    throw error;
  });
  try {
    await file.writeFile(String(process.pid));
    return await action();
  } finally {
    await file.close();
    await rm(path);
  }
}

function locked(root, action) {
  return withRuntimeLease(root, async () => action(await readState(root)));
}

async function verifyRecord(root, app, record) {
  checkRecord(root, app, record);
  if (await treeDigest(runtimeTree(root, app, record.version)) !== record.treeSha256) {
    throw Error(`Runtime ${record.version} changed on disk`);
  }
}

export async function promoteRuntime(root, app, candidate, gate) {
  const path = runtimeTree(root, app, candidate.version);
  if (!hash.test(candidate.artifact) || !(await lstat(join(path, app.entry))).isFile()) throw Error('Invalid release candidate');
  const next = { ...candidate, treeSha256: await treeDigest(path) };
  await gate(path);
  await verifyRecord(root, app, next);
  return locked(root, async state => {
    const key = appKey(app);
    const row = state.apps[key];
    const current = row?.current ?? { version: app.version, artifact: null, treeSha256: await treeDigest(runtimeTree(root, app)) };
    if (row?.hold || !newerVersion(candidate.version, current.version)) throw Error('Runtime update is held or would downgrade the active version');
    await verifyRecord(root, app, current);
    state.apps[key] = { current: next, previous: current, retained: [...new Set([...(row?.retained ?? []), current.version])] };
    await writeState(root, state);
    return next;
  });
}

export async function rollbackRuntime(root, app) {
  return locked(root, async state => {
    const row = state.apps[appKey(app)];
    if (!row?.previous) throw Error('No previous runtime is recorded');
    await verifyRecord(root, app, row.previous);
    state.apps[appKey(app)] = { current: row.previous, hold: row.current.version,
      retained: [...new Set([...(row.retained ?? []), row.current.version])] };
    await writeState(root, state);
    return row.previous;
  });
}

export async function resumeRuntime(root, app) {
  return locked(root, async state => {
    const row = state.apps[appKey(app)];
    if (!row?.hold) return;
    delete row.hold;
    await writeState(root, state);
  });
}
