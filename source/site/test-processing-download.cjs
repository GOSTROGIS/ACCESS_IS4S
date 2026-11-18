const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { readFile } = require('node:fs/promises');
const { chromium } = require('playwright');

// Use the layout editor's own save command, then retrieve the project copy
// after reloading the workspace. Each save originates in a nested iframe.
async function run() {
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || undefined,
    args: ['--enable-unsafe-swiftshader']
  });
  try {
    const page = await browser.newPage({viewport:{width:1850,height:1100}, acceptDownloads:true});
    await page.goto(new URL('?app=designcraft', process.argv[2]).href);
    await page.waitForFunction(() => document.querySelector('#editor').src.includes('/designcraft/host/'));
    const wrapper = await (await page.locator('#editor').elementHandle()).contentFrame();
    await wrapper.waitForFunction(() => document.querySelector('#editor')?.src.includes('index.html'));
    const engine = await (await wrapper.locator('#editor').elementHandle()).contentFrame();
    const canvas = engine.locator('canvas').first();
    // The editor uses canvas coordinates. Fix its viewport independently of the outer sidebar.
    await (await engine.frameElement()).evaluate(el => {el.style.width='1320px';el.style.height='860px';});
    await engine.waitForFunction(() => innerWidth===1320 && innerHeight===860 && window.wasmBindings &&
      !document.querySelector('[id$="_loading"]')?.getClientRects().length, null, {timeout:120000});
    await canvas.click({position:{x:144,y:450}});
    await canvas.click({position:{x:20,y:338}});
    const bounds = await canvas.boundingBox();
    await page.mouse.move(bounds.x+335,bounds.y+185);
    await page.mouse.down();
    await page.mouse.move(bounds.x+605,bounds.y+352,{steps:12});
    await page.mouse.up();
    const saving = page.waitForEvent('download');
    await page.keyboard.press('Control+s');
    const original = await saving;
    const name = original.suggestedFilename();
    assert.match(name,/\.designcraft$/);
    const bytes = await readFile(await original.path());
    assert.ok(bytes.length>100);
    await page.waitForFunction(name=>Array.from(document.querySelector('#documents').options).some(o=>o.text.includes(name)),name,{timeout:45000});
    const id = await page.locator('#documents').inputValue();
    const project = await page.locator('#project').inputValue();
    await page.reload();
    await page.locator('#project').selectOption(project);
    await page.locator('#documents').selectOption(id);
    const downloading = page.waitForEvent('download');
    await page.locator('#download').click();
    const saved = await downloading;
    assert.equal(saved.suggestedFilename(),name);
    assert.deepEqual(await readFile(await saved.path()),bytes);
    console.log('PASS layout editor download persisted through project reload',bytes.length,
      createHash('sha256').update(bytes).digest('hex'));
  } finally {await browser.close();}
}
run().catch(error=>{console.error(error);process.exitCode=1;});
