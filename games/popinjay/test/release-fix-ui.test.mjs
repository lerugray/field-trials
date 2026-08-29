import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const BROWSER = !!process.env.FT_BROWSER;
const { chromium } = BROWSER ? await import('playwright') : { chromium: null };

const DIST = pathToFileURL(resolve('dist/popinjay.html')).href;

async function freshPage() {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  await page.goto(DIST, { waitUntil: 'load' });
  await page.waitForFunction('window.__popinjayReady === true', { timeout: 10000 });
  return { browser, ctx, page };
}

test('scorecard Escape / E returns to title instead of dead-ending', { skip: !BROWSER && 'browser test; runs in the weekly browser job (FT_BROWSER=1)' }, async () => {
  const { browser, page } = await freshPage();
  try {
    const mode = () => page.evaluate(() => window.POPINJAY.mode);
    await page.evaluate(() => window.POPINJAY.scorecardDemo());
    await page.waitForTimeout(200);
    assert.equal(await mode(), 'scorecard');

    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
    assert.equal(await mode(), 'title', 'Escape must leave the scorecard');

    await page.evaluate(() => window.POPINJAY.scorecardDemo());
    await page.waitForTimeout(200);
    await page.keyboard.press('e');
    await page.waitForTimeout(200);
    assert.equal(await mode(), 'title', 'E must also leave the scorecard');
  } finally {
    await browser.close();
  }
});

test('rehearsal can be paused and unpaused without leaving the mode', { skip: !BROWSER && 'browser test; runs in the weekly browser job (FT_BROWSER=1)' }, async () => {
  const { browser, page } = await freshPage();
  try {
    const mode = () => page.evaluate(() => window.POPINJAY.mode);

    await page.evaluate(() => window.POPINJAY.rehearsalDemo());
    await page.waitForTimeout(300);
    assert.equal(await mode(), 'rehearsal');

    await page.keyboard.press('p');
    await page.waitForTimeout(200);
    assert.equal(await mode(), 'rehearsal', 'P pauses without changing mode');

    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
    assert.equal(await mode(), 'rehearsal', 'Escape unpauses back to rehearsal');
  } finally {
    await browser.close();
  }
});
