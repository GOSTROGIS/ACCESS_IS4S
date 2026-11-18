'use strict';
// Open actual shipped ZIP contents with networking disabled. No rebuilding here.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { execFileSync } = require('node:child_process');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '../..');
const slugs = ['reading', 'writing', 'numeracy', 'digital', 'problem-solving',
  'communication', 'collaboration', 'adaptability', 'creativity-innovation'];
(async () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'is4s-offline-'));
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
    headless: true, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
  try {
    for (const slug of slugs) {
      const folder = path.join(temporary, slug);
      execFileSync('python3', ['-c', 'import sys; from zipfile import ZipFile; ZipFile(sys.argv[1]).extractall(sys.argv[2])',
        path.join(root, 'downloads', `ACCESS-IS4S-${slug}.zip`), folder]);
      const context = await browser.newContext({ offline: true, viewport: { width: 390, height: 844 } });
      try {
        const page = await context.newPage();
        const errors = [], localFailures = [];
        page.on('pageerror', e => errors.push(e.message));
        page.on('requestfailed', r => {
          if (r.url().startsWith('file:')) localFailures.push({url:r.url(), reason:r.failure()?.errorText});
        });
        const open = relative => page.goto(pathToFileURL(path.join(folder, relative)).href, {waitUntil:'networkidle'});
        await open('START-HERE.html');
        await page.getByRole('link', { name: 'Open this skill section' }).click();
        // A skill landing page loads its guide from the deferred navigation
        // script. Verify the actual guide before navigating to the next chapter.
        await page.locator('#access-student-guide').waitFor({state:'attached'});
        assert.ok(await page.locator('main').isVisible(), `${slug}: landing page`);
        for (const role of ['learner', 'teaching', 'answers']) {
          await open(`skills/${slug}/${role}.html`);
          if (role === 'learner') {
            assert.ok(await page.locator('main h1').isVisible(), `${slug}: learner chapter`);
            // Scroll to load lazy images, then verify every image in this chapter.
            await page.locator('img').evaluateAll(images => images.forEach(image => image.loading = 'eager'));
            await page.waitForFunction(() => [...document.images].every(image => image.complete && image.naturalWidth > 0));
            assert.ok(await page.evaluate(() => [...document.styleSheets].some(s => s.href?.startsWith('file:'))), `${slug}: local CSS`);
          } else {
            await page.locator('.ig-host').waitFor({ state: 'visible' });
            assert.equal(await page.evaluate(() => ACCESSInstructorGate.isUnlocked()), false);
          }
        }
        const lessons = path.join(folder, 'skills', slug, 'lessons');
        const first = fs.readdirSync(lessons).sort().find(name => fs.existsSync(path.join(lessons, name, 'learner.html')));
        assert.ok(first, `${slug}: a lesson is packaged`);
        await open(`skills/${slug}/lessons/${first}/learner.html`);
        assert.ok(await page.locator('h1').isVisible(), `${slug}: lesson`);
        await open(`skills/${slug}/lessons/${first}/instructor.html`);
        await page.locator('.ig-host').waitFor({ state: 'visible' });
        if (slug === 'numeracy') {
          await open('skills/numeracy/hub/index.html');
          const tabs = await page.locator('iframe[data-src]').evaluateAll(frames => frames.map(frame => ({
            panel: frame.closest('.panel').id.replace(/^p-/, ''), template: frame.dataset.src
          })));
          assert.ok(tabs.length > 0);
          for (const tab of tabs) {
            await page.evaluate(id => HubNav.open(id), tab.panel);
            await page.waitForFunction(id => {
              const frame = document.querySelector(`#p-${id} iframe`);
              return frame?.contentDocument?.body?.textContent.trim().length > 50;
            }, tab.panel);
          }
          console.log(`PASS: Numeracy ${tabs.length} embedded tabs render from local templates`);
        }
        assert.deepEqual(localFailures, [], `${slug}: missing local resources`);
        assert.deepEqual(errors, [], `${slug}: browser errors`);
        console.log(`PASS: ${slug} offline landing, chapter images/CSS, learner lesson and three instructor gates`);
      } finally { await context.close(); }
    }
  } finally {
    await browser.close();
    fs.rmSync(temporary, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
