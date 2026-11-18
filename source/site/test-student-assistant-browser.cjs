'use strict';
const assert = require('node:assert/strict');
const {chromium} = require('playwright');

// Supply the same site entry point a learner uses, either an HTTP checkout or Pages.
const site = new URL(process.argv[2]);
const outside = [], errors = [], requests = [];
async function run() {
  const browser = await chromium.launch({headless:true, executablePath:process.env.CHROMIUM_PATH || undefined,
    args:['--disable-gpu']});
  try {
    const context = await browser.newContext({viewport:{width:390,height:844}});
    await context.route(/^https?:/, route => {
      const url = new URL(route.request().url());
      if (url.origin !== site.origin || route.request().method() !== 'GET') {
        outside.push(url.origin);
        return route.abort();
      }
      requests.push(url.pathname);
      return route.continue();
    });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(site.href);
    await page.getByRole('link', {name:'AI assistant',exact:true}).click();
    assert.equal(page.url(), new URL('assistant/public/', site).href);
    const input = page.getByLabel('Your question');
    const ask = page.getByRole('button', {name:'Ask',exact:true});
    const replies = page.locator('.turn.assistant .message');
    const submit = async question => {
      await input.fill(question);
      await ask.click();
      await page.waitForFunction(() => document.getElementById('status').textContent === 'Answer ready.' ||
        document.getElementById('status').textContent.includes('try again'), null, {timeout:240000});
      assert.equal(await page.getByRole('status').innerText(), 'Answer ready.', await replies.last().innerText());
      return replies.last().innerText();
    };
    const first = await submit('can you help me find the percentage of 1/5? im really confused. :(');
    assert.equal(first.split('\n')[0], '1/5 is 20%.');
    assert.match(first, /1 ÷ 5\) × 100 = 20/);
    assert.match(await submit('What about 3/8?'), /^3\/8 is 37\.5%\./);
    assert.equal(requests.some(path => path.endsWith('.gguf')), false);
    console.log('PASS exact learner question and follow-up, before downloading a language model');

    const answer = await submit('What is the difference between gross pay and net pay?');
    assert.match(answer, /gross pay is .*before .*taken off/i);
    assert.match(answer, /net pay is .*bank account/i);
    const link = page.locator('.turn.assistant').last().getByRole('link', {name:/pay stub/i}).first();
    await page.locator('.turn.assistant').last().locator('summary').click();
    assert.ok(await link.isVisible(), 'retrieved the pay stub learner lesson');
    const source = await link.getAttribute('href');
    assert.equal(new URL(source).origin, site.origin);
    const question = 'Our meeting is in Room 42 on Friday. Which room should I go to?';
    await input.fill(question);
    await ask.click();
    await page.getByRole('button', {name:'Stop'}).click();
    assert.equal(await input.inputValue(), question);
    const generated = await submit(question);
    assert.match(generated, /room 42\b/i);
    assert.ok(requests.some(path => path.endsWith('.gguf')), 'fetched the real model');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    assert.deepEqual(outside, []);
    assert.deepEqual(errors, []);
    console.log('PASS cancellation, real CPU model answer, learner source, mobile width and same-origin requests');
    console.log(JSON.stringify({answer,source,generated}));
  } finally { await browser.close(); }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
