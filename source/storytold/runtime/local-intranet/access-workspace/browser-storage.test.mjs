import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import test from 'node:test';

// Install Playwright as a development dependency, or expose it through
// NODE_PATH. The test uses an actual browser's IndexedDB, never an in-memory
// substitute, and never loads or claims to validate a creative application.
const { chromium } = createRequire(import.meta.url)('playwright');

test('actual browser project storage commits, reopens, isolates profiles and rejects changed bytes', { timeout: 60_000 }, async () => {
  const server = createServer(async (request, response) => {
    if (request.url === '/') return response.writeHead(200, { 'Content-Type': 'text/html' }).end('<!doctype html><title>Project storage test</title>');
    if (!['/model.mjs', '/store.mjs'].includes(request.url)) return response.writeHead(404).end();
    response.writeHead(200, { 'Content-Type': 'text/javascript' }).end(await readFile(new URL(`.${request.url}`, import.meta.url)));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await chromium.launch({ headless: true, ...(process.env.CHROME_BINARY ? { executablePath: process.env.CHROME_BINARY } : {}) });
    const profile = await browser.newContext();
    const page = await profile.newPage();
    const url = `http://127.0.0.1:${server.address().port}/`;
    await page.goto(url);
    const first = await page.evaluate(async () => {
      const { openProjects } = await import('/store.mjs');
      const store = await openProjects();
      const one = await store.createProject('Writing practice', 'writing');
      const two = await store.createProject('Other project', 'numeracy');
      const bytes = new TextEncoder().encode('Synthetic learner document\nwith two lines.').buffer;
      const saved = await store.save({ projectId: one.id, application: 'wordcraft', name: '../../practice.docx', bytes });
      const other = await store.documents(two.id);
      store.close();
      return { projectId: one.id, id: saved.id, name: saved.name, sha256: saved.sha256, size: saved.size, other: other.length };
    });
    assert.equal(first.name, 'practice.docx');
    assert.equal(first.other, 0);
    assert.equal(first.sha256, createHash('sha256').update('Synthetic learner document\nwith two lines.').digest('hex'));
    await page.reload();
    const reopened = await page.evaluate(async ({ id, projectId }) => {
      const { openProjects } = await import('/store.mjs');
      const store = await openProjects();
      const record = await store.load(id);
      const list = await store.documents(projectId);
      const result = { text: new TextDecoder().decode(record.bytes), sha256: record.sha256, size: record.size, count: list.length };
      store.close();
      return result;
    }, first);
    assert.equal(reopened.text, 'Synthetic learner document\nwith two lines.');
    assert.equal(reopened.sha256, first.sha256);
    assert.equal(reopened.size, first.size);
    assert.equal(reopened.count, 1);
    const isolated = await browser.newContext();
    const otherPage = await isolated.newPage();
    await otherPage.goto(url);
    assert.equal(await otherPage.evaluate(async () => { const store = await (await import('/store.mjs')).openProjects(); const all = await store.projects(); store.close(); return all.length; }), 0);
    await isolated.close();
    const corruption = await page.evaluate(async ({ id }) => {
      const db = await new Promise((resolve, reject) => { const request = indexedDB.open('access-is4s-projects-v1', 1); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
      await new Promise((resolve, reject) => {
        const tx = db.transaction('documents', 'readwrite');
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
        const store = tx.objectStore('documents');
        const request = store.get(id);
        request.onsuccess = () => { const record = request.result; new Uint8Array(record.bytes)[0] ^= 1; store.put(record); };
      });
      db.close();
      const store = await (await import('/store.mjs')).openProjects();
      try { await store.load(id); return 'incorrectly accepted'; } catch (error) { return error.message; } finally { store.close(); }
    }, first);
    assert.match(corruption, /SHA-256 check/);
    await profile.close();
  } finally {
    await browser?.close();
    await new Promise(resolve => server.close(resolve));
  }
});
