import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const JSZip = require('jszip');
const browser = await chromium.launch({ ...(process.env.CHROME_BINARY ? { executablePath: process.env.CHROME_BINARY } : {}), headless: true, args: ['--enable-unsafe-webgpu'] });
const context = await browser.newContext({ viewport: { width: 1440, height: 1100 }, acceptDownloads: true });
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => { if (message.type() === 'error') errors.push(message.text().slice(0, 350)); });
page.on('dialog', dialog => dialog.accept());
const evidence = process.env.ACCESS_EVIDENCE_DIR || 'work/access-parent-evidence';
await mkdir(evidence, { recursive: true });
const proof = [];
const workspace = process.env.ACCESS_WORKSPACE_URL || 'http://127.0.0.1:4180/workspace/';
async function activeEditor() {
  const host = await (await page.locator('#editor').elementHandle()).contentFrame();
  return host.childFrames()[0];
}
async function until(frame, predicate) {
 const deadline = Date.now() + 30_000;
 while (Date.now() < deadline) {
  if (await frame.evaluate(predicate)) return;
  await page.waitForTimeout(100);
 }
 throw Error('The actual engine did not reach the expected document state.');
}
try {
  await page.goto(new URL('?skill=numeracy&app=gridcraft', workspace).href);
  await page.waitForFunction(() => !document.getElementById('new').disabled, null, { timeout: 120_000 });
  console.log(JSON.stringify({ stage: 'ready', title: await page.title(), status: await page.locator('#status').innerText(), frames: page.frames().map(frame => frame.url()) }));
  const editor = await activeEditor();
  await editor.evaluate(() => window.gridcraft.execute('cell.set', { cell: 'A1', input: 'Discard this seed' }));
  await page.locator('#new').click();
  await until(editor, async () => (await window.gridcraft.docInspect()).sheets[0].cells === 0);
  const values = await editor.evaluate(async () => {
    for (const [cell, input] of [['A1', 'ACCESS numeracy project'], ['B1', '7'], ['B2', '8'], ['B3', '=SUM(B1:B2)']]) await window.gridcraft.execute('cell.set', { cell, input });
    return { cell: await window.gridcraft.execute('cell.get', { cell: 'B3' }), doc: await window.gridcraft.docInspect() };
  });
  console.log(JSON.stringify({ stage: 'grid-edited', values }));
  await page.locator('#save').click();
  await page.waitForFunction(() => document.getElementById('status').textContent.startsWith('Saved '));
  const savedGrid = await page.evaluate(async () => {
    const store = await (await import(new URL('store.mjs', location.href).href)).openProjects();
    try { const record = await store.load(document.getElementById('documents').value); return { id: record.id, sha256: record.sha256, size: record.size, name: record.name }; } finally { store.close(); }
  });
  const downloadEvent = page.waitForEvent('download');
  await page.locator('#download').click();
  await (await downloadEvent).saveAs(`${evidence}/numeracy.xlsx`);
  const gridBytes = await readFile(`${evidence}/numeracy.xlsx`);
  assert.equal(createHash('sha256').update(gridBytes).digest('hex'), savedGrid.sha256);
  assert.equal(gridBytes.length, savedGrid.size);
  const xlsx = await JSZip.loadAsync(gridBytes);
  const sheet = await xlsx.file('xl/worksheets/sheet1.xml').async('string');
  const strings = xlsx.file('xl/sharedStrings.xml') ? await xlsx.file('xl/sharedStrings.xml').async('string') : '';
  assert.match(sheet + strings, /ACCESS numeracy project/);
  assert.match(sheet, /SUM\(B1:B2\)/);
  assert.match(sheet, /<v>15<\/v>/);
  await writeFile(`${evidence}/numeracy-sheet.xml`, sheet);
  await page.locator('#new').click();
  await until(editor, async () => (await window.gridcraft.docInspect()).sheets[0].cells === 0);
  await page.locator('#documents').selectOption(savedGrid.id);
  await page.locator('#reopen').click();
  await until(editor, async () => (await window.gridcraft.docInspect()).sheets[0].cells === 4);
  const reopenedGrid = await editor.evaluate(() => window.gridcraft.execute('cell.get', { cell: 'B3' }));
  proof.push({ application: 'ACCESS Spreadsheets', ...savedGrid, values, reopenedGrid, independentXlsxXML: true });
  await page.locator('#application').selectOption('wordcraft');
  await page.waitForFunction(() => !document.getElementById('new').disabled);
  const word = await activeEditor();
  await page.locator('#new').click();
  await until(word, async () => { try { await window.wordcraft.docInspect(); return true; } catch { return false; } });
  await word.evaluate(() => window.wordcraft.execute('text.insert', { text: 'Discard this seed' }));
  await page.locator('#new').click();
  await until(word, async () => JSON.stringify(await window.wordcraft.docInspect()).includes('Discard this seed') === false);
  const wordEdit = await word.evaluate(async () => { await window.wordcraft.execute('text.insert', { text: 'ACCESS writing project: a clear workplace report.' }); return window.wordcraft.docInspect(); });
  console.log(JSON.stringify({ stage: 'word-edited', wordEdit }));
  await page.locator('#save').click();
  await page.waitForFunction(() => document.getElementById('status').textContent.startsWith('Saved '));
  const savedWord = await page.evaluate(async () => {
    const store = await (await import(new URL('store.mjs', location.href).href)).openProjects();
    try { const record = await store.load(document.getElementById('documents').value); return { id: record.id, sha256: record.sha256, size: record.size, name: record.name }; } finally { store.close(); }
  });
  const wordDownload = page.waitForEvent('download');
  await page.locator('#download').click();
  await (await wordDownload).saveAs(`${evidence}/writing.docx`);
  const wordBytes = await readFile(`${evidence}/writing.docx`);
  assert.equal(createHash('sha256').update(wordBytes).digest('hex'), savedWord.sha256);
  assert.equal(wordBytes.length, savedWord.size);
  const docx = await JSZip.loadAsync(wordBytes);
  const documentXML = await docx.file('word/document.xml').async('string');
  assert.match(documentXML, /ACCESS writing project: a clear workplace report\./);
  await writeFile(`${evidence}/writing-document.xml`, documentXML);
  await page.locator('#new').click();
  await until(word, async () => JSON.stringify(await window.wordcraft.docInspect()).includes('ACCESS writing project') === false);
  await page.locator('#documents').selectOption(savedWord.id);
  await page.locator('#reopen').click();
  await until(word, async () => JSON.stringify(await window.wordcraft.docInspect()).includes('ACCESS writing project'));
  proof.push({ application: 'ACCESS Documents', ...savedWord, independentDocxXML: true, reopened: true });
  // A same-origin sender with the right type and application is still rejected
  // because it is not the active editor iframe from the approved origin.
  const beforeForgery = await page.locator('#documents option').count();
  await page.evaluate(() => window.postMessage({ type: 'slipcurve-editor:save', application: 'wordcraft', name: 'forged.docx', bytes: new Uint8Array([1, 2, 3]).buffer }, location.origin));
  await page.waitForTimeout(200);
  assert.equal(await page.locator('#documents option').count(), beforeForgery);
  await page.reload();
  await page.waitForFunction(() => !document.getElementById('new').disabled);
  assert.equal(await page.locator('#documents option').count(), 2);
  assert.equal(await page.locator('#application option').count(), 21);
  const contexts = await page.locator('#application option').evaluateAll(items => items.map(item => item.textContent));
  assert.ok(contexts.every(label => label.startsWith('ACCESS ')));
  await page.screenshot({ path: `${evidence}/workspace.png`, fullPage: true });
  await writeFile(`${evidence}/report.json`, JSON.stringify({ url: page.url(), proof, browserReloadPersistence: true, ignoredForgedSave: true, choices: contexts.length, errors }, null, 2) + '\n');
  console.log(JSON.stringify({ stage: 'passed', proof, browserReloadPersistence: true, ignoredForgedSave: true, errors }));
} catch (error) {
  console.log(JSON.stringify({ stage: 'failed', error: error.message, status: await page.locator('#status').innerText().catch(() => ''), frames: page.frames().map(frame => frame.url()), errors }));
  process.exitCode = 1;
} finally { await browser.close(); }
