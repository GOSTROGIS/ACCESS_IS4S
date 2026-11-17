import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { APPLICATIONS, SKILLS, acceptedMessage, byId, documentRecord, editorUrl, nativeUrl, safeName, verifyDocument } from './model.mjs';

test('all21 applications and17 browser routes use fixed approved identifiers and ports', () => {
  assert.equal(APPLICATIONS.length, 21);
  assert.equal(byId.size, 21);
  assert.equal(APPLICATIONS.filter(app => app.extension).length, 6);
  assert.equal(APPLICATIONS.filter(app => app.port).length, 17);
  for (const app of APPLICATIONS) {
    assert.equal(nativeUrl(app.id), `slipcurve-app://open/${app.id}`);
    assert.match(app.label, /^ACCESS /);
    if (!app.port) continue;
    assert.equal(editorUrl(app, { id: app.id, port: app.port }), `http://127.0.0.1:${app.port}/slipcurve-workspace/?parent=access`);
    assert.throws(() => editorUrl(app, { id: app.id, port: 80 }));
    assert.throws(() => editorUrl(app, { id: 'unknown', port: app.port }));
  }
  assert.throws(() => nativeUrl('../private'));
  for (const context of Object.values(SKILLS)) for (const id of context.apps) assert.ok(byId.has(id));
});

test('only the active iframe, exact loopback origin, application and bridge message are accepted', () => {
  const source = {};
  const app = byId.get('cadcraft');
  const event = { source, origin: 'http://127.0.0.1:4195', data: { application: 'cadcraft', type: 'slipcurve-editor:save' } };
  assert.equal(acceptedMessage(event, source, app), true);
  for (const patch of [{ source: {} }, { origin: 'http://localhost:4195' }, { origin: 'https://example.com' },
    { origin: 'http://127.0.0.1:4196' }, { data: { ...event.data, application: 'gridcraft' } },
    { data: { ...event.data, type: 'slipcurve-editor:open' } }, { data: null }]) {
    assert.equal(acceptedMessage({ ...event, ...patch }, source, app), false);
  }
});

test('project bytes are copied and independently match their SHA-256; corruption and size mismatches fail closed', async () => {
  const original = new TextEncoder().encode('Real editable project bytes\n');
  const record = await documentRecord({ projectId: 'project-1', application: 'cadcraft', name: '../../CON.dxf', bytes: original.buffer });
  assert.equal(record.name, '_CON.dxf');
  assert.equal(record.size, original.byteLength);
  assert.equal(record.sha256, createHash('sha256').update(original).digest('hex'));
  original[0] ^= 1;
  assert.notEqual(original[0], new Uint8Array(record.bytes)[0]);
  assert.equal(await verifyDocument(record), record);
  await assert.rejects(verifyDocument({ ...record, size: record.size + 1 }));
  await assert.rejects(verifyDocument({ ...record, sha256: '0'.repeat(64) }));
  await assert.rejects(verifyDocument({ ...record, bytes: new ArrayBuffer(0) }));
  await assert.rejects(verifyDocument({ ...record, application: 'unknown' }));
  await assert.rejects(documentRecord({ projectId: 'project-1', application: 'cadcraft', name: 'empty.dxf', bytes: new ArrayBuffer(0) }));
});

test('untrusted file names cannot retain paths, controls, bidi formatting or reserved device names', () => {
  assert.equal(safeName('C:\\Users\\private\\report.docx'), 'report.docx');
  assert.equal(safeName(' ../../ .. '), 'Document');
  assert.equal(safeName('Résumé\u202e.exe\u0000.pdf'), 'Résumé_.exe_.pdf');
  assert.equal(safeName('LPT1.txt'), '_LPT1.txt');
  assert.equal(safeName('<script>.txt'), '_script_.txt');
  assert.equal([...safeName('a'.repeat(220))].length, 180);
});
