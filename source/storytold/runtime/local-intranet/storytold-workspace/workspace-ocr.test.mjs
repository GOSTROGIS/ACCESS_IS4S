import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { runInNewContext } from 'node:vm';

test('OCR waits for the fresh PDF to open and accepts commands only from the exact parent', async () => {
  const handlers = new Map();
  const messages = [], commands = [], opens = [];
  let state = { documents: [], pending_opens: [] };
  const inner = { pdfcraft: { docInspect: async () => state, execute: async command => commands.push(command) }, postMessage: message => opens.push(message) };
  const parent = { postMessage: message => messages.push(message) };
  const frame = { contentWindow: inner, addEventListener() {}, hidden: true, src: '' };
  const status = { hidden: false, textContent: '' };
  const window = { parent, addEventListener: (name, callback) => handlers.set(name, callback) };
  const source = await readFile(new URL('./workspace.mjs', import.meta.url), 'utf8');
  runInNewContext(source, { window, document: { getElementById: id => id === 'editor' ? frame : status },
    location: { search: '', origin: 'http://127.0.0.1:4198' }, URLSearchParams, ArrayBuffer, Uint8Array,
    fetch: async () => ({ ok: true, json: async () => ({ id: 'pdfcraft', label: 'PDF editor' }) }),
    crypto: { randomUUID }, setTimeout, Date });
  await new Promise(resolve => setImmediate(resolve));
  const receive = handlers.get('message');
  const parentMessage = (extra = {}) => ({ source: parent, origin: 'http://127.0.0.1:4184', data: { application: 'pdfcraft', ...extra } });
  const ready = () => receive({ source: inner, origin: 'http://127.0.0.1:4198', data: { type: 'pdfcraft:ready' } });
  ready();
  assert.equal(messages.filter(message => message.type.endsWith(':ready')).length, 1);
  const request = { type: 'slipcurve-editor:ocr' };
  receive({ ...parentMessage(request), source: {} });
  receive({ ...parentMessage(request), origin: 'http://untrusted.invalid' });
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(commands, []);
  receive(parentMessage({ type: 'slipcurve-editor:open', name: 'scan.pdf', bytes: Uint8Array.of(37, 80, 68, 70).buffer, recognize: true }));
  assert.match(frame.src, /^pdfcraft\.html\?control&open=/);
  ready();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(opens.length, 1);
  assert.deepEqual(commands, []);
  assert.equal(messages.filter(message => message.type.endsWith(':ready')).length, 1);
  state = { documents: [{ active: true, name: 'different.pdf' }], pending_opens: [] };
  await new Promise(resolve => setTimeout(resolve, 120));
  assert.deepEqual(commands, []);
  state = { documents: [{ active: true, name: 'scan.pdf' }], pending_opens: [] };
  await new Promise(resolve => setTimeout(resolve, 150));
  assert.deepEqual(commands, ['ocr.recognize']);
  assert.equal(messages.filter(message => message.type.endsWith(':ready')).length, 2);
  state = { documents: [], pending_opens: [] };
  receive(parentMessage(request));
  await new Promise(resolve => setImmediate(resolve));
  assert.match(messages.at(-1).error, /Open a PDF/);
  assert.deepEqual(commands, ['ocr.recognize']);
});
