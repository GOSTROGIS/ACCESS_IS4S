import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const JSZip = require('jszip');
const browser = await chromium.launch({ ...(process.env.CHROME_BINARY ? { executablePath: process.env.CHROME_BINARY } : {}), headless: true, args: ['--enable-unsafe-webgpu'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 }, acceptDownloads: true });
page.on('dialog', dialog => dialog.accept());
const errors = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => { if (message.type() === 'error') errors.push(message.text().slice(0, 350)); });
const evidence = process.env.ACCESS_EVIDENCE_DIR || 'work/access-parent-evidence';
await mkdir(evidence, { recursive: true });
const proof = [];
const workspace = process.env.ACCESS_WORKSPACE_URL || 'http://127.0.0.1:4180/workspace/';
async function activeEditor() {
  const host = await (await page.locator('#editor').elementHandle()).contentFrame();
  return host.childFrames()[0];
}
const target = process.env.APP || 'deckcraft';
async function until(frame, predicate) {
 const deadline = Date.now() + 30_000;
 while (Date.now() < deadline) {
  if (await frame.evaluate(predicate)) return;
  await page.waitForTimeout(100);
 }
 throw Error('The actual engine did not reach the expected document state.');
}
async function start(id) {
  await page.goto(new URL(`?app=${id}`, workspace).href);
  await page.waitForFunction(() => !document.getElementById('new').disabled, null, { timeout: 90_000 });
  return activeEditor();
}
async function saveDownload(name) {
  await page.locator('#save').click();
  await page.waitForFunction(() => document.getElementById('status').textContent.startsWith('Saved '), null, { timeout: 45_000 });
  const saved = await page.evaluate(async () => {
    const store = await (await import(new URL('store.mjs', location.href).href)).openProjects();
    try { const record = await store.load(document.getElementById('documents').value); return { id: record.id, sha256: record.sha256, size: record.size, name: record.name }; } finally { store.close(); }
  });
  const downloading = page.waitForEvent('download');
  await page.locator('#download').click();
  await (await downloading).saveAs(`${evidence}/${name}`);
  const bytes = await readFile(`${evidence}/${name}`);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), saved.sha256);
  assert.equal(bytes.length, saved.size);
  return { saved, bytes };
}
try {
 if (target === 'deckcraft') {
 const deck = await start('deckcraft');
 await deck.evaluate(() => window.deckcraft.execute('insert.textBox', { rect: [100, 150, 600, 100], text: 'Discard seed' }));
 await page.locator('#new').click();
 await until(deck, async () => (await window.deckcraft.docInspect()).slides[0].shapes === 2);
 await deck.evaluate(async () => { await window.deckcraft.execute('insert.textBox', { rect: [100, 150, 600, 100], text: 'ACCESS communication project' }); await window.deckcraft.execute('slide.notes', { text: 'Explain the three next steps.' }); });
 const { saved, bytes } = await saveDownload('presentation.pptx');
 const zip = await JSZip.loadAsync(bytes);
 const slide = await zip.file('ppt/slides/slide1.xml').async('string');
 const notes = await zip.file('ppt/notesSlides/notesSlide1.xml').async('string');
 assert.match(slide, /ACCESS communication project/);
 assert.match(notes, /Explain the three next steps\./);
 await writeFile(`${evidence}/presentation-slide.xml`, slide);
 await page.locator('#new').click();
 await until(deck, async () => (await window.deckcraft.docInspect()).slides[0].shapes === 2);
 await page.locator('#documents').selectOption(saved.id);
 await page.locator('#reopen').click();
 await until(deck, async () => (await window.deckcraft.docInspect()).slides[0].shapes === 3);
 const reopened = await deck.evaluate(() => window.deckcraft.execute('file.saveBytes', { format: 'pptx' }));
 const reopenedZip = await JSZip.loadAsync(Buffer.from(reopened.data, 'base64'));
 assert.match(await reopenedZip.file('ppt/slides/slide1.xml').async('string'), /ACCESS communication project/);
 proof.push({ application: 'ACCESS Presentations', ...saved, independentPptxXML: true, reopened: true });
 }
 if (target === 'figcraft') {
  const fig = await start('figcraft');
  await fig.waitForFunction(() => Boolean(window.figcraft?.execute));
  await page.locator('#new').click();
  await until(fig, async () => { try { return Boolean(await window.figcraft.docInspect()); } catch { return false; } });
  const before = await fig.evaluate(() => window.figcraft.docInspect());
  const inserted = await fig.evaluate(() => window.figcraft.execute('node.create', { type: 'frame', name: 'ACCESS interface project', x: 40, y: 50, width: 320, height: 200 }));
  console.log(JSON.stringify({ stage: 'fig-edited', before, inserted, after: await fig.evaluate(() => window.figcraft.docInspect()) }));
  const { saved, bytes } = await saveDownload('interface.figcraft');
  const archive = await JSZip.loadAsync(bytes);
  const jsonFiles = Object.keys(archive.files).filter(name => name.endsWith('.json'));
  assert.ok(jsonFiles.length, 'A native design project must contain its editable document JSON.');
  const jsonDocuments = await Promise.all(jsonFiles.map(async name => JSON.parse(await archive.file(name).async('string'))));
  assert.match(JSON.stringify(jsonDocuments), /ACCESS interface project/);
  await page.locator('#new').click();
  await until(fig, async () => !JSON.stringify(await window.figcraft.docInspect()).includes('ACCESS interface project'));
  await page.locator('#documents').selectOption(saved.id);
  await page.locator('#reopen').click();
  await until(fig, async () => JSON.stringify(await window.figcraft.docInspect()).includes('ACCESS interface project'));
  const reopenedFig = await fig.evaluate(() => window.figcraft.docInspect());
  const createdFrame = reopenedFig.pages[0].children.find(node => node.name === 'ACCESS interface project');
  assert.equal(createdFrame.width, 320);
  assert.equal(createdFrame.height, 200);
  proof.push({ application: 'ACCESS Interface Design', ...saved, independentZipJson: true, reopened: true });
 }
 if (target === 'cadcraft') {
  const cad = await start('cadcraft');
  await page.locator('#new').click();
  await until(cad, async () => { try { return Boolean(await window.cadcraft.docInspect()); } catch { return false; } });
  await cad.evaluate(async () => {
    await window.cadcraft.execute('line', { points: [[10, 20], [110, 20]] });
    await window.cadcraft.execute('circle', { center: [50, 60], radius: 12 });
  });
  const before = await cad.evaluate(() => window.cadcraft.docInspect());
  console.log(JSON.stringify({ stage: 'cad-edited', before }));
  const { saved, bytes } = await saveDownload('drawing.dxf');
  const dxf = bytes.toString('utf8');
  assert.match(dxf, /\bLINE\b/);
  assert.match(dxf, /\bCIRCLE\b/);
  await page.locator('#new').click();
  await until(cad, async () => (await window.cadcraft.docInspect()).entityCount === 0);
  await page.locator('#documents').selectOption(saved.id);
  await page.locator('#reopen').click();
  await until(cad, async () => (await window.cadcraft.docInspect()).entityCount === 2);
  const reopenedCad = await cad.evaluate(() => window.cadcraft.docInspect());
  assert.equal(reopenedCad.entityCount, 2);
  assert.deepEqual(reopenedCad.counts, { Circle: 1, Line: 1 });
  assert.deepEqual(reopenedCad.entities.find(entity => entity.type === 'Circle').geometry.center, { x: 50, y: 60, z: 0 });
  proof.push({ application: 'ACCESS Technical Drawing', ...saved, independentDxf: true, reopened: true });
 }
 if (target === 'pdfcraft') {
  const pdf = await start('pdfcraft');
  await pdf.waitForFunction(() => Boolean(window.pdfcraft?.execute));
  await page.locator('#new').click();
  await until(pdf, async () => Boolean((await window.pdfcraft.docInspect()).active));
  const blank = await pdf.evaluate(() => window.pdfcraft.docInspect());
  console.log(JSON.stringify({ stage: 'pdf-created', blank }));
  await pdf.evaluate(() => window.pdfcraft.execute('page.rotate'));
  console.log(JSON.stringify({ stage: 'pdf-rotated', state: await pdf.evaluate(() => window.pdfcraft.docInspect()) }));
  const { saved } = await saveDownload('reading.pdf');
  await page.locator('#new').click();
  await until(pdf, async () => (await window.pdfcraft.docInspect()).documents.length >= 2);
  const sameNameBeforeOpen = await pdf.evaluate(() => window.pdfcraft.docInspect());
  assert.equal(sameNameBeforeOpen.documents.filter(document => document.name === 'Untitled.pdf').length, 2);
  await page.locator('#documents').selectOption(saved.id);
  await page.locator('#reopen').click();
  await page.waitForFunction(() => !document.getElementById('new').disabled);
  const reopenedPdf = await activeEditor();
  await until(reopenedPdf, async () => Boolean((await window.pdfcraft.docInspect()).active));
  const reopened = await reopenedPdf.evaluate(() => window.pdfcraft.docInspect());
  assert.equal(reopened.documents.length, 1);
  assert.equal(reopened.documents[0].active, true);
  assert.equal(reopened.documents[0].pages, 1);
  const rect = reopened.active.pages_on_screen[0].rect;
  assert.ok(rect[2] - rect[0] > rect[3] - rect[1], 'The reopened rotated page must render in landscape.');
  console.log(JSON.stringify({ stage: 'pdf-reopened', reopened }));
  proof.push({ application: 'ACCESS PDF Editor', ...saved, editedPageRotation: true, sameNameUnsavedBlankReopen: true, reopened });
 }
 await writeFile(`${evidence}/${target}-report.json`, JSON.stringify({ proof, errors }, null, 2) + '\n');
 console.log(JSON.stringify({ stage: 'passed', proof, errors }));
} catch (error) { console.log(JSON.stringify({ stage: 'failed', error: error.message, status: await page.locator('#status').innerText().catch(() => ''), frames: page.frames().map(frame => frame.url()), errors })); process.exitCode = 1; }
finally { await browser.close(); }
