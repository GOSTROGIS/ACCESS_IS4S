'use strict';
// Run with PLAYWRIGHT_MODULE and CHROMIUM_PATH when not installed locally.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH, args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto('file://' + path.resolve(__dirname, '../../tools/noc/index.html') + '?q=cook');
    assert.match(await page.locator('#results h3').first().textContent(), /Cooks/);
    await page.locator('#browse-all > summary').click();
    assert.equal(await page.locator('#occupation-directory .code-link').count(), 516);
    const codes = await page.locator('#occupation-directory .code-link').evaluateAll(es => es.map(e => e.dataset.code));
    assert.equal(new Set(codes).size, 516);
    assert.equal(await page.locator('#occupation-directory > details').count(), 10);
    await page.locator('#occupation-directory [data-code="72302"]').click();
    assert.equal(await page.locator('#q').inputValue(), '72302');
    assert.match(await page.locator('#results h3').first().textContent(), /Gas fitters/);
    for (const [query, code] of [['boilermaker','72103'], ['roofer','73110'], ['hairstylist','63210'], ['baker','63202'], ['landscape horticulturist','22114'], ['cabinetmaker','72311'], ['powerline technician','72203'], ['électricien','72200'], ['NOC 00010','00010']]) {
      await page.locator('#q').fill(query);
      await page.locator('#q').press('Enter');
      assert.ok(await page.locator('#results [data-copy="'+code+'"]').count(), query + ' should find ' + code);
    }
    await page.locator('#q').fill('7');
    await page.locator('#q').press('Enter');
    const count = await page.evaluate(() => window.NOC_DATA.units.filter(u => u[0][0] === '7').length);
    while (await page.locator('#more').isVisible()) await page.locator('#more').click();
    assert.equal(await page.locator('#results > li').count(), count);
    await page.locator('#clear').click();
    assert.equal(await page.locator('#results > li').count(), 0);
    assert.equal(await page.locator('#occupation-directory .code-link').count(), 516);
    await page.setViewportSize({width:375,height:812});
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'No mobile horizontal overflow');
    assert.deepEqual(errors, []);
    console.log('PASS: complete 516-group directory, 10 categories, trade searches, French, leading-zero codes, pagination, clear, mobile width, no runtime errors');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
