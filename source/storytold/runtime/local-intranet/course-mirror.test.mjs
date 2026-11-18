import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { test } from 'node:test';
import { courseServer } from './intranet.mjs';

test('the portal follows the inbound main and streams only public committed course files', async t => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'is4s-course-')));
  const installation = join(root, 'Applications');
  const mirror = join(root, 'GitHub repositories', 'ACCESS_IS4S');
  const git = execFileSync(process.platform === 'win32' ? 'where.exe' : 'which', ['git'], {encoding:'utf8'}).trim().split(/\r?\n/)[0];
  const run = (...command) => execFileSync(git, ['-c', 'core.autocrlf=false', '-C', mirror, ...command], {encoding:'utf8', windowsHide:true});
  const save = async (base, name, bytes) => {
    const file = join(base, name);
    await mkdir(dirname(file), {recursive:true});
    await writeFile(file, bytes);
  };
  const publish = () => {
    run('add', '.');
    run('-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-qm', 'Course release');
    run('update-ref', 'refs/remotes/origin/main', run('rev-parse', 'HEAD').trim());
  };
  const server = courseServer(installation);
  t.after(async () => {
    server.closeAllConnections();
    await new Promise(done => server.close(done));
    await rm(root, {recursive:true, force:true, maxRetries:3});
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = 'http://127.0.0.1:' + server.address().port;
  const get = (path, options) => fetch(base + path, {redirect:'manual', ...options});
  await save(installation, 'ACCESS_IS4S/index.html', 'Installed fallback');
  await save(installation, 'ACCESS_IS4S/README.md', 'Internal');
  assert.equal(await (await get('/')).text(), 'Installed fallback');
  assert.equal((await get('/README.md')).status, 404);

  await mkdir(mirror, {recursive:true});
  run('init', '-q', '-b', 'main');
  run('remote', 'add', 'origin', 'https://github.com/GOSTROGIS/ACCESS_IS4S.git');
  await save(installation, 'tools/runtime-update/settings.json', JSON.stringify({git}));
  await save(mirror, 'index.html', 'Skills / Processing Tools / AI assistant');
  await save(mirror, 'assistant/public/index.html', 'Ask a question');
  await save(mirror, 'assistant/public/vendor/model.gguf', 'GGUF12345678');
  await save(mirror, 'processing-tools/apps/sample/engine.wasm.gz.bin', 'packaged runtime');
  await save(mirror, 'assistant/student/profile.json', '{"internal":true}');
  await save(mirror, 'tools/installer.ps1', 'private tool');
  await save(mirror, 'source/course.md', 'internal source');
  publish();
  await save(mirror, 'brand/private.txt', 'untracked local file');
  await save(mirror, 'index.html', 'unpublished local edits');
  await delay(1100);
  assert.equal(await (await get('/?skill=writing')).text(), 'Skills / Processing Tools / AI assistant');
  const redirect = await get('/assistant/public?lesson=sample');
  assert.equal(redirect.status, 308);
  assert.equal(redirect.headers.get('location'), '/assistant/public/?lesson=sample');
  assert.equal(await (await get('/assistant/public/')).text(), 'Ask a question');
  assert.equal(await (await get('/processing-tools/apps/sample/engine.wasm.gz.bin')).text(), 'packaged runtime');
  const model = '/assistant/public/vendor/model.gguf';
  const headers = await get(model, {method:'HEAD'});
  assert.equal(headers.status, 200);
  assert.equal(headers.headers.get('content-length'), '12');
  assert.equal(await headers.text(), '');
  const part = await get(model, {headers:{range:'bytes=2-6'}});
  assert.equal(part.status, 206);
  assert.equal(part.headers.get('content-range'), 'bytes 2-6/12');
  assert.equal(await part.text(), 'UF123');
  assert.equal((await get(model, {headers:{range:'bytes=99-'}})).status, 416);
  for (const path of ['/source/course.md', '/brand/private.txt', '/assistant/student/profile.json', '/tools/installer.ps1', '/.git/config']) {
    assert.ok([400, 404].includes((await get(path)).status), path);
  }
  await save(mirror, 'index.html', 'Next GitHub release');
  await rm(join(mirror, 'brand/private.txt'));
  publish();
  await delay(1100);
  assert.equal(await (await get('/')).text(), 'Next GitHub release');
  run('remote', 'set-url', 'origin', 'https://example.invalid/other.git');
  await delay(1100);
  assert.equal((await get('/')).status, 503);
});
