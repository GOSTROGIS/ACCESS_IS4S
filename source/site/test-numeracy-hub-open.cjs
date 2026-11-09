'use strict';
// Run with Playwright installed: NODE_PATH=<node_modules> node source/site/test-numeracy-hub-open.cjs [site URL]
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox'] });
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    const base = process.argv[2] || 'http://127.0.0.1:8777/';
    const hub = base + 'skills/numeracy/hub/';
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    async function examOpen() {
      await page.locator('#p-exam').waitFor({ state: 'visible' });
      assert.equal(await page.locator('.ig-host').count(), 0);
      assert.equal(await page.evaluate(() => typeof window.ACCESSInstructorGate), 'undefined');
      assert.equal(await page.evaluate(() => HubNav.current()), 'exam');
    }
    await page.goto(hub + '#shape');
    await page.locator('#g-instr').click();
    await examOpen();
    await page.locator('#eb-go').click();
    assert.ok(await page.evaluate(() => ExamUI.current()), 'Exam builds without a code');
    await page.reload();
    await examOpen();
    await page.goto(hub); // localStorage remembers Exam builder
    await examOpen();
    await context.clearCookies();
    await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
    await page.goto(hub + '#exam'); // fresh direct link
    await examOpen();
    await page.locator('#g-found').click();
    assert.equal(await page.evaluate(() => HubNav.current()), 'basics');
    await page.evaluate(() => { location.hash = 'exam'; });
    await examOpen();
    await page.locator('#g-trades').click();
    await page.locator('#t-cnc').click();
    await page.locator('#p-cnc iframe').waitFor({ state: 'visible' });
    assert.ok(await page.locator('#p-cnc iframe').getAttribute('src'));
    assert.deepEqual(errors, [], 'Hub must not raise JavaScript errors');
    for (const route of ['skills/communication/teaching.html', 'skills/numeracy/answers.html']) {
      await page.goto(base + route);
      await page.locator('.ig-host').waitFor({ state: 'visible' });
      assert.equal(await page.evaluate(() => ACCESSInstructorGate.isUnlocked()), false);
    }
    console.log('PASS: open Hub tabs, exam generation, reload, saved tab, fresh deep link, hash navigation, lazy CNC load, and preserved chapter gates');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
