'use strict';
// Plays every practice set in every skill bank and expects three stars.
// Run: node source/practice/test-practice-browser.cjs [skill ...]
// Needs Playwright with Chromium (CHROMIUM_PATH overrides the browser).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '../..');
const only = process.argv.slice(2);
const HEAD = 'IS4SPractice.register(', TAIL = ');';

// The same reading rule as practice_bank() in source/site/build_pages.py.
function bank(slug) {
  const file = path.join(ROOT, 'skills', slug, 'practice', 'bank.js');
  if (!fs.existsSync(file)) return null;
  const text = fs.readFileSync(file, 'utf8');
  return JSON.parse(text.slice(text.indexOf(HEAD) + HEAD.length, text.lastIndexOf(TAIL)));
}

// Installed in every page: answers one built question, right or wrong, through the engine's own handles.
function installAnswer() {
  window.__pxAnswer = (cur, type, right = true) => {
    const change = el => el.dispatchEvent(new Event(el.tagName === 'INPUT' ? 'input' : 'change', { bubbles: true }));
    if (type === 'choose') cur.buttons.find(b => b._opt.ok === right).click();
    else if (type === 'numeric') { cur.input.value = String(right ? cur.answer : cur.answer + 1000); change(cur.input); }
    else if (type === 'fill') cur.selects.forEach(s => { s.value = right ? s._answer : [...s.options].map(o => o.value).find(v => v && v !== s._answer); change(s); });
    else if (type === 'spot') cur.chips.filter(c => c._target).forEach(c => c.click());
    else if (type === 'sort') cur.rows.forEach(r => r.buttons.find(b => b._bin === r.it.bin).click());
    else if (type === 'match') cur.rows.forEach(r => { r.sel.value = r.p.b; change(r.sel); });
    else if (type === 'hotspot') cur.buttons.find(b => b._id === cur.region).click();
    else if (type === 'order') {
      for (let pass = 0; pass < 50; pass++) {
        const o = cur.order(), k = o.findIndex((v, n) => n < o.length - 1 && v > o[n + 1]);
        if (k < 0) break;
        cur.move(k, 1);
      }
    }
  };
}

// Runs inside the page: answers a lesson or arcade set correctly until the result card shows.
async function solveHost(host) {
  const tick = () => new Promise(r => setTimeout(r, 0));
  for (let guard = 0; guard < 80; guard++) {
    await tick();
    const px = host._px;
    if (!px) throw new Error('practice did not start');
    if (px.finished) return px.stars;
    const type = host.getAttribute('data-px-type');
    window.__pxAnswer(px.current, type);
    await tick();
    const check = host.querySelector('.px-check');
    if (!check || check.disabled) throw new Error('Check button not ready for a ' + type + ' set');
    check.click();
    host.querySelector('.px-next').click();
  }
  throw new Error('set never finished');
}

async function playSkill(browser, slug, b, errors) {
  let played = 0, pages = 0;
  const ids = new Set(b.sets.map(s => s.id));
  const context = await browser.newContext({ reducedMotion: 'reduce' });
  await context.addInitScript(installAnswer);
  const page = await context.newPage();
  page.on('pageerror', e => errors.push(`${slug}: ${e.message}`));
  page.on('console', m => { if (m.type() === 'error') errors.push(`${slug}: ${m.text()}`); });

  // Every lesson that embeds a set: each set must mount and be solvable.
  const lessonsDir = path.join(ROOT, 'skills', slug, 'lessons');
  for (const folder of fs.readdirSync(lessonsDir).sort()) {
    const file = path.join(lessonsDir, folder, 'learner.html');
    if (!fs.existsSync(file) || !fs.readFileSync(file, 'utf8').includes('data-px="')) continue;
    for (const seed of [1, 2]) {
      await page.goto(pathToFileURL(file).href + '?pxseed=' + seed);
      const blocks = await page.$$eval('.px[data-px]', els => els.map(e => [e.getAttribute('data-px'), e.classList.contains('px-ready')]));
      for (const [id, ready] of blocks) {
        assert.ok(ids.has(id), `${slug}/${folder}: unknown practice set ${id}`);
        assert.ok(ready, `${slug}/${folder}: ${id} did not mount`);
      }
      const hosts = await page.$$('.px.px-ready');
      for (const [n, host] of hosts.entries()) assert.equal(await host.evaluate(solveHost), 3, `${slug}/${folder} ${blocks[n][0]} seed ${seed}: expected 3 stars`);
      played += hosts.length;
    }
    pages++;
  }

  // The arcade: every set has a tile, every tile plays to three stars, quick-fire works.
  const arcade = pathToFileURL(path.join(ROOT, 'skills', slug, 'practice', 'index.html')).href;
  for (const seed of [3, 4]) {
    await page.goto(arcade + '?pxseed=' + seed);
    const tiles = await page.$$eval('.px-tile', els => els.map(e => e.getAttribute('data-set')));
    assert.deepEqual([...tiles].sort(), [...ids].sort(), `${slug}: arcade tiles must match the bank`);
    for (const id of tiles) {
      await page.click(`.px-tile[data-set="${id}"]`);
      assert.equal(await page.$eval('#px-player .px', solveHost), 3, `${slug} arcade ${id} seed ${seed}: expected 3 stars`);
      played++;
      await page.click('.px-back');
    }
    await page.reload();
    assert.equal(await page.$eval('.px-passport-stars strong', e => +e.textContent), ids.size * 3, `${slug}: arcade passport should show every star`);
    // Three strikes: answer 4 right, then 3 wrong.
    await page.click('.px-mode-flame');
    const result = await page.evaluate(async () => {
      const tick = () => new Promise(r => setTimeout(r, 0));
      const player = document.getElementById('px-player');
      for (let n = 0; n < 7; n++) {
        await tick();
        const b = player._px.built;
        window.__pxAnswer(b, b.buttons ? 'choose' : b.input ? 'numeric' : 'fill', n < 4);
        await tick();
        player.querySelector('.px-check').click();
        player.querySelector('.px-next').click();
      }
      return player._px;
    });
    assert.ok(result.finished, `${slug}: three strikes should end after three misses`);
    assert.equal(result.score, 4, `${slug}: three strikes score`);
    await page.click('.px-back');
  }
  await context.close();
  return { played, pages };
}

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox'] });
  const errors = [];
  let played = 0, pages = 0;
  try {
    const banks = fs.readdirSync(path.join(ROOT, 'skills')).map(slug => [slug, bank(slug)]).filter(([, b]) => b);
    const queue = banks.filter(([slug]) => !only.length || only.includes(slug));
    // Three skills at a time. Each has its own browser context, so saved progress stays separate.
    await Promise.all(Array.from({ length: 3 }, async () => {
      for (let job = queue.shift(); job; job = queue.shift()) {
        const r = await playSkill(browser, job[0], job[1], errors);
        played += r.played;
        pages += r.pages;
      }
    }));
    // The home page passport lists every skill with a bank (full runs only: it needs a full build).
    if (!only.length) {
      const page = await browser.newPage();
      page.on('pageerror', e => errors.push(`home: ${e.message}`));
      await page.goto(pathToFileURL(path.join(ROOT, 'index.html')).href);
      assert.equal(await page.$$eval('.stamp', els => els.length), banks.length, 'home passport stamps');
    }
  } finally {
    await browser.close();
  }
  assert.deepEqual(errors, [], 'no page errors');
  console.log(`practice browser test passed: ${played} plays on ${pages} lesson pages and the arcades`);
})().catch(e => { console.error(e); process.exit(1); });
