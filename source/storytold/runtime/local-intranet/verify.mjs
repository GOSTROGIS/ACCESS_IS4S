import assert from 'node:assert/strict';
import { readdir } from 'node:fs/promises';
import { request } from 'node:http';
import { join, resolve } from 'node:path';

const folder = resolve(process.argv[2] || '.');

function read(port, path, options = {}) {
  return new Promise((success, failure) => {
    const req = request({ host: '127.0.0.1', port, path, timeout: 10000, ...options }, res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('error', failure);
      res.on('end', () => success({ code: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
    });
    req.on('timeout', () => req.destroy(new Error(`Timed out at ${port}${path}`)));
    req.on('error', failure);
    req.end();
  });
}

const inventory = await read(4180, '/applications.json');
assert.equal(inventory.code, 200);
const { apps } = JSON.parse(inventory.body);
assert.equal(apps.length, 17);
assert.equal(new Set(apps.map(app => app.port)).size, 17);
for (const app of apps) {
  const root = join(folder, 'Storytold', 'web', app.id, app.version);
  const entry = await read(app.port, '/');
  assert.equal(entry.code, 200, `${app.label} entry`);
  assert.match(entry.headers['content-type'], /^text\/html/);
  const wasm = (await readdir(root, { recursive: true })).find(file => file.endsWith('.wasm'));
  assert.ok(wasm, `${app.label} has a real WASM asset`);
  const url = '/' + wasm.split(/[\\/]/u).map(encodeURIComponent).join('/');
  const binary = await read(app.port, url, { headers: { Range: 'bytes=0-3' } });
  assert.equal(binary.code, 206, `${app.label} WASM byte-range response`);
  assert.equal(binary.headers['content-type'], 'application/wasm');
  assert.deepEqual(binary.body, Buffer.of(0, 97, 115, 109), `${app.label} WASM header`);
  console.log(`${app.label} ${app.version} served its installed HTML and WASM at 127.0.0.1:${app.port}`);
}

const hub = await read(4180, '/ACCESS_IS4S/skills/numeracy/');
assert.equal(hub.code, 200);
assert.match(hub.body.toString(), /Installed Storytold applications/);
assert.match(hub.body.toString(), />CADCraft<\/a>/);
for (const id of ['gridcraft', 'wordcraft']) {
  const app = apps.find(tool => tool.id === id);
  const workspace = await read(app.port, '/access-workspace/');
  const settings = await read(app.port, '/access-workspace/editor.json');
  assert.equal(workspace.code, 200, `${app.label} workspace`);
  assert.equal(settings.code, 200);
  assert.deepEqual(JSON.parse(settings.body), { application: id });
}
for (const [path, status] of [
  ['/Storytold/native/native-apps.json', 404],
  ['/SLIPCURVE/serve.py', 404],
  ['/tools/node.exe', 404],
  ['/CONSULTING/site/../.env', 400],
  ['/ACCESS_IS4S/%2e%2e/Storytold/native/native-apps.json', 400],
  ['/ACCESS_IS4S/assets%5C..%5Ctoken', 400],
]) assert.equal((await read(4180, path)).code, status, path);
assert.equal((await read(4180, '/', { headers: { Host: 'unrelated.invalid' } })).code, 421);
assert.equal((await read(4180, '/launch', { method: 'POST' })).code, 405);
console.log('ACCESS links, private path denials, exact Host check and read-only HTTP checks passed.');
