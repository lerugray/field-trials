import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const DIST = pathToFileURL(resolve('dist/popinjay.html')).href;

async function freshPage() {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  await page.goto(DIST, { waitUntil: 'load' });
  await page.waitForFunction('window.__popinjayReady === true', { timeout: 10000 });
  return { browser, ctx, page };
}

test('Enter on title with a live save requires confirmation before overwrite', async () => {
  const { browser, page } = await freshPage();
  try {
    const mode = () => page.evaluate(() => window.POPINJAY.mode);
    const savePresent = () => page.evaluate(() => !!localStorage.getItem('popinjay:save:v4'));

    await page.keyboard.press('Enter');
    await page.waitForTimeout(400);
    assert.equal(await mode(), 'playing', 'first Enter starts a run');

    await page.keyboard.press('p');
    await page.waitForTimeout(120);
    await page.keyboard.press('q');
    await page.waitForTimeout(200);
    assert.equal(await mode(), 'title', 'quit to title');
    assert.ok(await savePresent(), 'a live save exists after quit');

    await page.keyboard.press('Enter');
    await page.waitForTimeout(200);
    assert.equal(await mode(), 'title', 'Enter with a live save shows confirm, does not start');
    assert.ok(await savePresent(), 'the live save is NOT overwritten while confirm is shown');

    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
    assert.equal(await mode(), 'title', 'Escape cancels the confirm');
    assert.ok(await savePresent(), 'save still intact after cancel');

    await page.keyboard.press('Enter');
    await page.waitForTimeout(200);
    assert.equal(await mode(), 'title', 'Enter re-opens the confirm');

    await page.keyboard.press('Enter');
    await page.waitForTimeout(400);
    assert.equal(await mode(), 'playing', 'second Enter confirms and starts a new run');
  } finally {
    await browser.close();
  }
});
