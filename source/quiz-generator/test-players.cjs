'use strict';
// Run: node source/quiz-generator/test-players.cjs
// Add --browser for integration coverage (Playwright + Chromium required).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const root = path.resolve(__dirname, '../..');
const game = 'programs/carpentry/intake-142/Quizzes/';
const engine = require(path.join(root, game, 'jeopardy-engine.js'));
const settings = engine.normalizeSettings({ secret: false, pitfalls: false, events: false, steals: false, final: false });
for (let count = 1; count <= 16; count++) {
  assert.ok(engine.validTeamCount(count));
  assert.equal(engine.decodeCode(engine.encodeCode('SK-NUMERACY', count, settings, 'PLAYERS')).teams, count);
}
for (const count of [0, 17, -1, 1.5, NaN, Infinity, '16', null]) assert.equal(engine.validTeamCount(count), false);
for (const count of ['0', '17', '99', '-1', '1.5', '01']) assert.throws(() => engine.decodeCode(`J2-SKNUMERACY-T${count}-0-PLAYERS`));
const html = fs.readFileSync(path.join(root, game, 'index.html'), 'utf8');
const select = html.match(/<select id="team-count">([\s\S]*?)<\/select>/)[1];
assert.deepEqual([...select.matchAll(/value="(\d+)"/g)].map(m => Number(m[1])), Array.from({ length: 16 }, (_, i) => i + 1));
console.log('PASS: all 16 player counts, invalid count rejection, backward-compatible round codes and setup options.');
if (!process.argv.includes('--browser')) process.exit(0);
const { chromium } = require('playwright');
const server = http.createServer((req, res) => {
  const file = path.resolve(root, '.' + new URL(req.url, 'http://localhost').pathname);
  if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
  fs.readFile(file, (err, bytes) => {
    if (err) { res.writeHead(404).end(); return; }
    res.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : file.endsWith('.html') ? 'text/html' : 'application/octet-stream');
    res.end(bytes);
  });
});
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage();
    const errors = []; page.on('pageerror', err => errors.push(err.message));
    const url = `http://127.0.0.1:${server.address().port}/${game}index.html?board=SK-NUMERACY`;
    for (let count = 1; count <= 16; count++) {
      await page.goto(url + '&teams=' + count);
      await page.evaluate(() => window.JeopardyApp.ready);
      await page.evaluate(() => localStorage.clear());
      await page.reload();
      await page.evaluate(() => window.JeopardyApp.ready);
      assert.equal(await page.inputValue('#team-count'), String(count));
      assert.equal(await page.locator('#team-count option').count(), 16);
      // Exercise the actual setup control and start button.
      await page.selectOption('#team-count', String(count));
      await page.click('#start-game');
      assert.equal(await page.locator('#scores .score-card').count(), count);
      await page.waitForFunction(n => window.JeopardyApp.getRound()?.teams === n, count);
      await page.reload();
      await page.evaluate(() => window.JeopardyApp.ready);
      assert.equal(await page.locator('#scores .score-card').count(), count);
      assert.equal(await page.inputValue('#team-count'), String(count));
      // Replay a share code, preserving the count and deterministic board.
      const code = engine.encodeCode('SK-NUMERACY', count, settings, 'PLAYERS');
      await page.evaluate(code => window.JeopardyApp.startRound(code), code);
      assert.equal(await page.locator('#scores .score-card').count(), count);
      // Pass one full cycle. Solo stays solo, and team 16 wraps back to team 1.
      for (let turn = 0; turn < count; turn++) {
        await page.locator('#board .tile:not(.done)').first().click();
        await page.click('#skip-question');
        await page.click('#close-question');
      }
      assert.equal(await page.evaluate(() => window.JeopardyApp.getRound().turn), 0);
      assert.equal(await page.evaluate(() => window.JeopardyApp.getRound().turnNumber), count);
    }
    await page.setViewportSize({ width: 375, height: 812 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'mobile layout must not overflow horizontally');
    assert.deepEqual(errors, []);
    console.log('PASS: solo and every count through 16; setup, URL count, saved rounds, replay codes, turn wrapping and mobile layout.');
  } finally { await browser.close(); }
})().catch(err => { console.error(err); process.exitCode = 1; }).finally(() => server.close());
