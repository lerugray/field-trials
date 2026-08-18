// Shipped-dist duplicate binding probe. Rebind Climb-up to J, attempt the same
// key for Climb-down, then prove J still produces one direction instead of zero.

import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const settle = (ms = 70) => page.waitForTimeout(ms);
try {
  await page.goto(pathToFileURL(resolve('dist/popinjay.html')).href, { waitUntil: 'load' });
  await page.waitForFunction('window.__popinjayReady === true', { timeout: 10000 });
  await page.keyboard.press('o'); await settle();
  for (let i = 0; i < 16; i++) {
    const at = await page.evaluate(() => window.POPINJAY.controller.optPane === 'settings'
      && window.POPINJAY.controller.optCursor === 8);
    if (at) break;
    await page.keyboard.press('ArrowDown'); await settle(35);
  }
  await page.keyboard.press('Enter'); await settle();

  async function goTo(row) {
    for (let i = 0; i < 20; i++) {
      if (await page.evaluate(() => window.POPINJAY.controller.optCursor) === row) return;
      await page.keyboard.press('ArrowDown'); await settle(35);
    }
  }
  async function attempt(row, key) {
    await goTo(row);
    await page.keyboard.press('Enter'); await settle();
    await page.keyboard.press(key); await settle();
  }

  await attempt(2, 'j');
  const beforeDuplicate = await page.evaluate(() => ({
    up: [...window.POPINJAY.controller.bindings.up.keys],
    down: [...window.POPINJAY.controller.bindings.down.keys],
  }));
  await attempt(3, 'j');
  const afterDuplicate = await page.evaluate(() => ({
    up: [...window.POPINJAY.controller.bindings.up.keys],
    down: [...window.POPINJAY.controller.bindings.down.keys],
    rebinding: window.POPINJAY.controller.rebinding,
    feedback: window.POPINJAY.controller.bindingFeedback,
    cursor: window.POPINJAY.controller.optCursor,
    stored: JSON.parse(localStorage.getItem('popinjay:binds:v1')),
  }));
  await page.locator('#stage').screenshot({
    path: 'docs/verification/followups-2026-08-17/duplicate-binding-feedback.png',
  });
  const cursorBeforeJ = afterDuplicate.cursor;
  await page.keyboard.press('j'); await settle();
  const cursorAfterJ = await page.evaluate(() => window.POPINJAY.controller.optCursor);
  const pass = beforeDuplicate.up[0] === 'KeyJ'
    && afterDuplicate.up[0] === 'KeyJ'
    && afterDuplicate.down[0] === 'ArrowDown'
    && afterDuplicate.stored.down.keys[0] === 'ArrowDown'
    && afterDuplicate.rebinding === null
    && /J ALREADY BINDS CLIMB UP/.test(afterDuplicate.feedback || '')
    && cursorAfterJ === cursorBeforeJ - 1;
  const report = {
    date: '2026-08-17', probe: 'duplicate-binding-refusal',
    attempted: { action: 'down', code: 'KeyJ' },
    beforeDuplicate, afterDuplicate,
    keyJMotion: { cursorBeforeJ, cursorAfterJ, delta: cursorAfterJ - cursorBeforeJ },
    screenshot: 'duplicate-binding-feedback.png', pass,
  };
  console.log(JSON.stringify(report, null, 2));
  if (!pass) process.exitCode = 1;
} finally {
  await browser.close();
}
