import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import test from 'node:test';
import { runtimeServer } from './intranet.mjs';

test('the embedded genuine PDF runtime resolves its two OCR models under its page URL', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'intranet-pdfcraft-test-')));
  const reservation = createServer();
  await new Promise(resolve => reservation.listen(0, '127.0.0.1', resolve));
  const port = reservation.address().port;
  await new Promise(resolve => reservation.close(resolve));
  const models = join(root, 'Storytold/web/pdfcraft/v1.0.0/models');
  await mkdir(models, { recursive: true });
  const detection = Buffer.from('detection artifact bytes');
  const recognition = Buffer.from('recognition artifact bytes');
  await writeFile(join(models, 'text-detection.onnx'), detection);
  await writeFile(join(models, 'text-recognition.onnx'), recognition);
  const app = runtimeServer(root, { id: 'pdfcraft', version: 'v1.0.0', port, label: 'PdfCraft' });
  await new Promise(resolve => app.listen(port, '127.0.0.1', resolve));
  try {
    for (const [filename, expected] of [['text-detection.onnx', detection], ['text-recognition.onnx', recognition]]) {
      const response = await fetch(`http://127.0.0.1:${port}/slipcurve-workspace/models/${filename}`);
      assert.equal(response.status, 200);
      assert.deepEqual(Buffer.from(await response.arrayBuffer()), expected);
      const policy = response.headers.get('content-security-policy');
      assert.match(policy, /'wasm-unsafe-eval'/);
      assert.doesNotMatch(policy, /'unsafe-eval'/);
    }
    assert.equal((await fetch(`http://127.0.0.1:${port}/slipcurve-workspace/models/private.json`)).status, 404);
    assert.deepEqual(await readFile(join(models, 'text-detection.onnx')), detection);
  } finally {
    await new Promise(resolve => app.close(resolve));
    const actual = await realpath(root);
    assert.equal(dirname(actual), await realpath(tmpdir()));
    assert.match(basename(actual), /^intranet-pdfcraft-test-/);
    await rm(actual, { recursive: true, force: true });
  }
});
