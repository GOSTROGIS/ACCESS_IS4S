// Writes docs/images/flowchart.png: a screenshot of the dashboard home page (the pipeline flowchart).
//
// Usage:
//   1. Build the mock UI:   cd web && VITE_MOCK=1 npx vite build --outDir <dir> --emptyOutDir
//   2. Serve it:            node scripts/serve-spa.mjs <dir> <port>
//   3. Run:                 npm run docs:image -- http://127.0.0.1:<port>
//
// Playwright is not a dependency of this repo. Install playwright-core and a Chromium build
// elsewhere, then point the script at them:
//   PLAYWRIGHT_DIR        directory that contains node_modules/playwright-core (default: resolve normally)
//   CHROMIUM_PATH         path to the Chromium or headless-shell binary (default: Playwright's own)
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const url = process.argv[2];
if (!url) {
  console.error("usage: node scripts/flowchart-shot.mjs <dashboard-url>");
  process.exit(2);
}
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const base = process.env.PLAYWRIGHT_DIR ? join(process.env.PLAYWRIGHT_DIR, "/") : import.meta.url;
const { chromium } = createRequire(base)("playwright-core");

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
try {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 1650 }, colorScheme: "light" });
  const page = await ctx.newPage();
  await page.goto(new URL("/flow?as=operator", url).href);
  await page.waitForSelector("[data-node]", { timeout: 30000 });
  await page.waitForTimeout(2500);
  // The chart grid plus the "Waiting for people" line above it.
  const clip = await page.evaluate(() => {
    const grid = document.querySelector("[data-node]").parentElement.parentElement;
    const rects = [grid.getBoundingClientRect()];
    const people = grid.parentElement.parentElement.previousElementSibling;
    if (people) rects.push(people.getBoundingClientRect());
    const pad = 8;
    const x = Math.max(0, Math.min(...rects.map((r) => r.left)) - pad);
    const y = Math.max(0, Math.min(...rects.map((r) => r.top)) - pad);
    const right = Math.max(...rects.map((r) => r.right)) + pad;
    const bottom = Math.max(...rects.map((r) => r.bottom)) + pad;
    return { x, y: y + window.scrollY, width: right - x, height: bottom - y };
  });
  await page.screenshot({ path: join(root, "docs/images/flowchart.png"), clip, fullPage: true });
} finally {
  await browser.close();
}
