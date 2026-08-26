// B1 keyboard refuse-and-tell re-verify at HEAD (READ-ONLY probe; evidence to this dir).
// Excerpted from the 2026-08-18 forks probe — does not write into that dossier.
//   node docs/verification/release-gate-2026-08-23/forks/probe-b1.mjs

import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../../../..');
const URL = pathToFileURL(resolve(ROOT, 'dist/popinjay.html')).href;
const HEAD = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
await page.goto(URL, { waitUntil: 'load' });
await page.waitForFunction('window.__popinjayReady === true');
await page.waitForTimeout(600);

await page.keyboard.press('KeyO');
await page.waitForTimeout(300);
for (let i = 0; i < 8; i++) { await page.keyboard.press('ArrowDown'); await page.waitForTimeout(60); }
await page.keyboard.press('Enter');
await page.waitForTimeout(400);

const bindsBefore = await page.evaluate(() => JSON.parse(JSON.stringify(window.POPINJAY.controller.bindings)));

for (let i = 0; i < 14; i++) {
  await page.keyboard.press('Enter');
  await page.waitForTimeout(80);
  const arming = await page.evaluate(() => window.POPINJAY.controller.rebinding);
  if (arming === 'down') break;
  await page.keyboard.press('Escape');
  await page.waitForTimeout(60);
  await page.keyboard.press('ArrowDown');
  await page.waitForTimeout(60);
}

const armedAction = await page.evaluate(() => window.POPINJAY.controller.rebinding);
await page.keyboard.press('ArrowUp');
await page.waitForTimeout(300);
const afterConflict = await page.evaluate(() => {
  const c = window.POPINJAY.controller;
  return { feedback: c.bindingFeedback, rebinding: c.rebinding, bindings: JSON.parse(JSON.stringify(c.bindings)) };
});
await page.screenshot({ path: `${HERE}/B1-refuse-and-tell.png` });

const B1 = {
  offered: 'ArrowUp (owned by CLIMB UP) onto CLIMB DOWN',
  armedAction,
  feedbackShown: afterConflict.feedback,
  downKeysAfter: afterConflict.bindings.down.keys,
  upKeysAfter: afterConflict.bindings.up.keys,
  previousBindSurvived: JSON.stringify(afterConflict.bindings.down.keys) === JSON.stringify(bindsBefore.down.keys),
  upStillOwnsArrowUp: afterConflict.bindings.up.keys.includes('ArrowUp'),
  namesOwningAction: !!(afterConflict.feedback && /ALREADY BINDS/.test(afterConflict.feedback)),
  silentStealAbsent: !afterConflict.bindings.down.keys.includes('ArrowUp'),
};

const pass = B1.armedAction === 'down'
  && B1.previousBindSurvived
  && B1.upStillOwnsArrowUp
  && B1.namesOwningAction
  && B1.silentStealAbsent;

const summary = { head: HEAD, url: URL, B1, pass };
writeFileSync(`${HERE}/b1.json`, JSON.stringify(summary, null, 2));
await ctx.close();
await browser.close();
console.log('[probe-b1] PASS=', pass);
console.log(JSON.stringify(B1, null, 2));
