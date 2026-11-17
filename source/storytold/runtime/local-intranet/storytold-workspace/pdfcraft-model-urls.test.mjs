import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import * as vm from 'node:vm';
import test from 'node:test';

test('the embedded PDF model resolver preserves requests and only rewrites its two installed model URLs', async () => {
  if (!vm.SourceTextModule) {
    await promisify(execFile)(process.execPath, ['--experimental-vm-modules', '--test', fileURLToPath(import.meta.url)]);
    return;
  }
  const calls = [];
  const config = { loader: '/_edition/v1.2.3/pdfcraft-web-abcdef.js', wasm: '/runtime.wasm', worker: '/worker.js' };
  const context = vm.createContext({ URL, Request,
    location: { href: 'http://127.0.0.1:4198/slipcurve-workspace/pdfcraft.html?control', origin: 'http://127.0.0.1:4198' },
    document: { getElementById: () => ({ addEventListener() {} }), createElement: () => ({}), head: { append() {} } },
    addEventListener() {},
    fetch: async (input, options) => {
      if (input === 'editor.json') return { json: async () => config };
      calls.push({ input, options });
      return { ok: true };
    },
  });
  context.window = context;
  const source = await readFile(new URL('./pdfcraft-page.mjs', import.meta.url), 'utf8');
  const module = new vm.SourceTextModule(source, { context, importModuleDynamically: async specifier => {
    assert.equal(specifier, config.loader);
    const loader = new vm.SyntheticModule(['default'], function () { this.setExport('default', async () => {}); }, { context });
    await loader.link(() => {}); await loader.evaluate();
    return loader;
  } });
  await module.link(() => {}); await module.evaluate();
  const options = { headers: { 'x-model-test': 'preserved' }, cache: 'no-store' };
  await context.fetch('models/text-detection.onnx', options);
  assert.equal(calls.at(-1).input, 'http://127.0.0.1:4198/_edition/v1.2.3/models/text-detection.onnx');
  assert.equal(calls.at(-1).options, options);
  const request = new Request('http://127.0.0.1:4198/slipcurve-workspace/models/text-recognition.onnx', {
    headers: { 'x-original': 'retained' }, cache: 'no-store', credentials: 'omit', redirect: 'error',
  });
  await context.fetch(request, options);
  const changed = calls.at(-1).input;
  assert.ok(changed instanceof Request);
  assert.equal(changed.url, 'http://127.0.0.1:4198/_edition/v1.2.3/models/text-recognition.onnx');
  assert.equal(changed.headers.get('x-original'), 'retained');
  for (const key of ['method', 'cache', 'credentials', 'redirect', 'mode', 'referrer', 'integrity']) assert.equal(changed[key], request[key]);
  assert.equal(calls.at(-1).options, options);
  for (const input of ['models/private.json', 'models/text-detection.onnx?other=1',
    'http://different.invalid/slipcurve-workspace/models/text-detection.onnx', '/models/text-detection.onnx',
    new Request('http://127.0.0.1:4198/other')]) {
    await context.fetch(input, options);
    assert.equal(calls.at(-1).input, input);
    assert.equal(calls.at(-1).options, options);
  }
});
