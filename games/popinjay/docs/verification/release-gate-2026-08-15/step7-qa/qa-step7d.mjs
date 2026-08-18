// STEP 7 QA — probe D: the RESUME affordance. Does the title advertise R? What does the
// advertised ENTER do to an in-progress tour? Also blur-clears-held-keys. Read-only.
import { chromium } from '/Users/rayweiss/Desktop/Dev Work/popinjay/node_modules/playwright/index.mjs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { writeFileSync } from 'node:fs';

const ROOT = '/Users/rayweiss/Desktop/Dev Work/popinjay';
const URL = pathToFileURL(resolve(ROOT, 'dist/popinjay.html')).href;
const OUT = resolve(ROOT, 'docs/verification/release-gate-2026-08-15/step7-qa');

async function fresh(browser) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errs.push(`console.error: ${m.text()}`); });
  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForFunction('window.__popinjayReady === true', { timeout: 15000 });
  await page.evaluate(() => window.focus());
  return { ctx, page, errs };
}
const mode = (p) => p.evaluate(() => window.POPINJAY.mode);
const save = (p) => p.evaluate(() => { const s = localStorage.getItem('popinjay:save:v4'); return s ? JSON.parse(s) : null; });
const shot = (p, n) => p.screenshot({ path: resolve(OUT, n) });
const R = {};

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    // Build a genuine mid-tour state: clear 1-1, take a souvenir, land in 1-2, then quit.
    const { ctx, page, errs } = await fresh(browser);
    await page.keyboard.press('Enter'); await page.waitForTimeout(400);
    await page.evaluate(() => window.POPINJAY.clearedDemo(1, 1)); await page.waitForTimeout(350);
    await page.keyboard.press('Enter'); await page.waitForTimeout(300);
    await page.keyboard.press('1'); await page.waitForTimeout(600);
    const mid = await save(page);
    R.midTour = { locale: mid?.run?.locale, stage: mid?.run?.stage, score: mid?.run?.score, tickets: mid?.run?.tickets, souvenirs: mid?.run?.souvenirs, dead: mid?.dead };

    // (a) quit to title IN-SESSION → does the title advertise R?
    await page.keyboard.press('p'); await page.keyboard.press('q'); await page.waitForTimeout(400);
    await shot(page, 'pd-title-after-quit-insession.png');
    R.afterQuitMode = await mode(page);

    // (b) full RELOAD with an alive save → does the title advertise R now?
    await page.reload({ waitUntil: 'load' }); await page.waitForFunction('window.__popinjayReady === true');
    await page.waitForTimeout(400);
    R.afterReloadMode = await mode(page);
    await shot(page, 'pd-title-after-reload-alive-save.png');

    // (c) press the ADVERTISED key (Enter) and see what happens to the tour
    const beforeEnter = await save(page);
    await page.keyboard.press('Enter'); await page.waitForTimeout(900);
    const afterEnter = await save(page);
    R.enterWithResumableSave = {
      before: { locale: beforeEnter?.run?.locale, stage: beforeEnter?.run?.stage, score: beforeEnter?.run?.score, tickets: beforeEnter?.run?.tickets, souvenirs: beforeEnter?.run?.souvenirs },
      after: { locale: afterEnter?.run?.locale, stage: afterEnter?.run?.stage, score: afterEnter?.run?.score, tickets: afterEnter?.run?.tickets, souvenirs: afterEnter?.run?.souvenirs },
      mode: await mode(page),
    };
    await shot(page, 'pd-after-enter-with-resumable-save.png');
    await ctx.close();

    // (d) the R path for comparison, from a clean reload
    const b = await fresh(browser);
    await b.page.keyboard.press('Enter'); await b.page.waitForTimeout(400);
    await b.page.evaluate(() => window.POPINJAY.clearedDemo(1, 1)); await b.page.waitForTimeout(350);
    await b.page.keyboard.press('Enter'); await b.page.waitForTimeout(300);
    await b.page.keyboard.press('1'); await b.page.waitForTimeout(600);
    await b.page.keyboard.press('p'); await b.page.keyboard.press('q'); await b.page.waitForTimeout(400);
    const preR = await save(b.page);
    await b.page.keyboard.press('r'); await b.page.waitForTimeout(900);
    const postR = await save(b.page);
    R.rPath = {
      before: { locale: preR?.run?.locale, stage: preR?.run?.stage, score: preR?.run?.score, souvenirs: preR?.run?.souvenirs },
      after: { locale: postR?.run?.locale, stage: postR?.run?.stage, score: postR?.run?.score, souvenirs: postR?.run?.souvenirs },
      mode: await mode(b.page),
    };

    // (e) blur must clear held keys (no stuck-key drift)
    await b.page.keyboard.down('ArrowRight');
    await b.page.waitForTimeout(200);
    const x0 = await b.page.evaluate(() => window.POPINJAY.probe().playerX);
    await b.page.evaluate(() => window.dispatchEvent(new Event('blur')));
    await b.page.waitForTimeout(700);
    const x1 = await b.page.evaluate(() => window.POPINJAY.probe().playerX);
    await b.page.keyboard.up('ArrowRight');
    R.blurClearsHeld = { movedAfterBlur: +(x1 - x0).toFixed(2), stuck: Math.abs(x1 - x0) > 2 };
    R.errs = [...errs, ...b.errs];
    await b.ctx.close();
  } catch (e) { R.harnessError = String(e && e.stack || e); console.error(e); }
  await browser.close();
  writeFileSync(resolve(OUT, 'qa-results-d.json'), JSON.stringify(R, null, 2));
  console.log(JSON.stringify(R, null, 2));
})();
