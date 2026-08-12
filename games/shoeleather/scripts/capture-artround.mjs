// SHOELEATHER — deterministic browser proof capture for the 2026-08-11 art round.
// Uses the operator-specified Playwright installation and Chromium sandbox flags.

import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = resolve(import.meta.dirname, '..');
const BUILD_URL = pathToFileURL(join(ROOT, 'dist', 'shoeleather.html')).href;
const OUT = join(ROOT, 'docs', 'proofs', 'design-calls-20260811');
const LAUNCH_ARGS = ['--single-process', '--no-zygote', '--disable-gpu', '--disable-software-rasterizer'];

mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ headless: true, args: LAUNCH_ARGS });
const errors = [];
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const page = await context.newPage();
let activeName = 'boot';
page.on('pageerror', (error) => errors.push(`${activeName} pageerror: ${error.message}`));
page.on('console', (message) => { if (message.type() === 'error') errors.push(`${activeName} console: ${message.text()}`); });

async function proof(name, query, prepare = async () => {}) {
  activeName = name;
  await page.goto(`${BUILD_URL}?${query}`, { waitUntil: 'load' });
  await page.waitForTimeout(250);
  await prepare(page);
  await page.waitForTimeout(150);
  const target = join(OUT, name);
  await page.screenshot({ path: target, fullPage: false });
  console.log(`captured ${target}`);
}

async function advanceEnding(page, count) {
  for (let i = 0; i < count; i++) await page.locator('.sl-end-action').click();
}

await proof('call2-confrontation-v2-20260811.png', 'case=1&demo=board&solve', (page) => advanceEnding(page, 6));
await proof('call2-case-closed-v2-20260811.png', 'case=1&demo=board&solve', async (page) => {
  while (await page.locator('.sl-end-action').count()) await page.locator('.sl-end-action').click();
  await page.locator('.sl-end-title').waitFor();
});
await proof('call3-world-people-v2-20260811.png', 'case=1&demo=world');
await proof('call3-interrogation-hostile-v2-20260811.png', 'case=1&demo=interro&portrait=hostile');
await proof('call3-notebook-portraits-v2-20260811.png', 'case=1&demo=notebook&portrait=hostile');
await proof('call3-ending-portraits-v2-20260811.png', 'case=2&demo=board&solve', (page) => advanceEnding(page, 8));

await context.close();
await browser.close();
if (errors.length) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
} else {
  console.log('proof capture clean: 6 frames, 0 page/console errors');
}
