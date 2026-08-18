// STEP 7 QA — probe C: tap-duration fire reliability, PROVEN hidden-tab simulation,
// trunk bank + unlock, seed entry, and the remaining title-screen keys. Read-only.
import { chromium } from '/Users/rayweiss/Desktop/Dev Work/popinjay/node_modules/playwright/index.mjs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { writeFileSync } from 'node:fs';

const ROOT = '/Users/rayweiss/Desktop/Dev Work/popinjay';
const URL = pathToFileURL(resolve(ROOT, 'dist/popinjay.html')).href;
const OUT = resolve(ROOT, 'docs/verification/release-gate-2026-08-15/step7-qa');

async function fresh(browser, { w = 1280, h = 800 } = {}) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
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
const dbg = (p) => p.evaluate(() => (window.POPINJAY.debuglog.export ? window.POPINJAY.debuglog.export() : '').split('\n').filter((l) => /ERROR/.test(l)).map((l) => l.trim()));
const shot = (p, n) => p.screenshot({ path: resolve(OUT, n) });
const R = {};

// 1) TAP DURATION → does the fire actually register? (level-read of `held` vs a latch)
async function tapDurations(browser) {
  const { ctx, page, errs } = await fresh(browser);
  const out = { trials: [] };
  await page.keyboard.press('Enter'); await page.waitForTimeout(700);
  // Instrument in-page: record the max wire count seen on every animation frame, so a
  // short-lived wire cannot be missed between CDP round-trips.
  await page.evaluate(() => {
    window.__wireWatch = { max: 0, seen: 0 };
    const loop = () => { const w = window.POPINJAY.probe().wires; if (w > window.__wireWatch.max) window.__wireWatch.max = w; if (w > 0) window.__wireWatch.seen++; requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
  });
  for (const ms of [0, 10, 20, 34, 60, 120, 200]) {
    let fired = 0;
    for (let t = 0; t < 5; t++) {
      await page.waitForFunction(() => window.POPINJAY.probe().wires === 0, { timeout: 6000 });
      await page.evaluate(() => { window.__wireWatch.max = 0; window.__wireWatch.seen = 0; });
      await page.keyboard.down('z');
      if (ms > 0) await page.waitForTimeout(ms);
      await page.keyboard.up('z');
      await page.waitForTimeout(260);
      const w = await page.evaluate(() => window.__wireWatch);
      if (w.max > 0) fired++;
    }
    out.trials.push({ tapMs: ms, firedOutOf5: fired });
  }
  out.errs = [...errs, ...await dbg(page)];
  await ctx.close();
  return out;
}

// 2) HIDDEN TAB — prove the page was genuinely hidden AND that the sim kept running.
async function hiddenProven(browser) {
  const { ctx, page, errs } = await fresh(browser);
  const out = {};
  await page.keyboard.press('Enter'); await page.waitForTimeout(800);
  await page.evaluate(() => {
    window.__vis = [];
    const rec = () => window.__vis.push({ state: document.visibilityState, t: Math.round(performance.now()), tick: window.POPINJAY.probe().tick, hearts: window.POPINJAY.probe().hearts });
    rec();
    document.addEventListener('visibilitychange', rec);
    window.__visTimer = setInterval(rec, 1000);
  });
  const other = await ctx.newPage(); await other.goto('about:blank'); await other.bringToFront();
  await new Promise((r) => setTimeout(r, 12000));
  await page.bringToFront(); await page.waitForTimeout(150);
  out.timeline = await page.evaluate(() => { clearInterval(window.__visTimer); return window.__vis; });
  const hidden = out.timeline.filter((s) => s.state === 'hidden');
  out.hiddenSamples = hidden.length;
  out.everActuallyHidden = hidden.length > 0;
  if (hidden.length > 1) {
    const first = hidden[0], last = hidden[hidden.length - 1];
    out.whileHidden = { seconds: +((last.t - first.t) / 1000).toFixed(1), ticks: last.tick - first.tick, heartsLost: first.hearts - last.hearts, ticksPerSecond: +(((last.tick - first.tick) / ((last.t - first.t) / 1000))).toFixed(1) };
  }
  out.finalMode = await mode(page);
  out.errs = [...errs, ...await dbg(page)];
  await other.close(); await ctx.close();
  return out;
}

// 3) TRUNK bank accumulation + the unlock purchase path
async function trunkBank(browser) {
  const { ctx, page, errs } = await fresh(browser);
  const out = { cycles: [] };
  const trunk = () => page.evaluate(() => JSON.parse(localStorage.getItem('popinjay:trunk:v1') || 'null'));
  await page.keyboard.press('Enter'); await page.waitForTimeout(400);
  for (let i = 0; i < 3; i++) {
    await page.evaluate(() => window.POPINJAY.clearedDemo(1, 1)); await page.waitForTimeout(350);
    await page.keyboard.press('Enter'); await page.waitForTimeout(300);   // bank + draft
    await page.keyboard.press('d'); await page.waitForTimeout(400);       // decline
    await page.evaluate(() => window.POPINJAY.killDemo());
    let w = 0; while (w < 8000 && (await mode(page)) !== 'scorecard') { await page.waitForTimeout(200); w += 200; }
    const t = await trunk();
    out.cycles.push({ run: i + 1, bank: t && t.bank, owned: t && t.owned.length });
    await page.keyboard.press('Enter'); await page.waitForTimeout(500);
  }
  // Force enough bank to buy an unlock, then drive the TRUNK purchase with real keys.
  await page.evaluate(() => { const t = JSON.parse(localStorage.getItem('popinjay:trunk:v1')); t.bank = 40; localStorage.setItem('popinjay:trunk:v1', JSON.stringify(t)); });
  await page.reload({ waitUntil: 'load' }); await page.waitForFunction('window.__popinjayReady === true');
  await page.waitForTimeout(300);
  if ((await mode(page)) === 'scorecard') { await page.keyboard.press('Enter'); await page.waitForTimeout(400); await page.keyboard.press('p'); await page.keyboard.press('q'); await page.waitForTimeout(300); }
  await page.keyboard.press('t'); await page.waitForTimeout(250);
  out.trunkOpened = await mode(page);
  const beforeBuy = await trunk();
  await shot(page, 'pc-trunk-before-buy.png');
  await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter'); await page.waitForTimeout(400);
  const afterBuy = await trunk();
  await shot(page, 'pc-trunk-after-buy.png');
  out.purchase = { bankBefore: beforeBuy && beforeBuy.bank, bankAfter: afterBuy && afterBuy.bank, ownedBefore: beforeBuy && beforeBuy.owned.length, ownedAfter: afterBuy && afterBuy.owned.length };
  out.errs = [...errs, ...await dbg(page)];
  await ctx.close();
  return out;
}

// 4) TITLE-screen keys: seed entry (digits + Backspace), locked Endless (e), log (l), mute (m)
async function titleKeys(browser) {
  const { ctx, page, errs } = await fresh(browser);
  const out = {};
  const seedOf = () => page.evaluate(() => { const s = localStorage.getItem('popinjay:save:v4'); return s ? JSON.parse(s).seed : null; });
  for (const k of ['4', '2', '4', '2']) { await page.keyboard.press(k); await page.waitForTimeout(60); }
  await page.keyboard.press('Backspace'); await page.waitForTimeout(80);
  await shot(page, 'pc-title-seed-entry.png');
  await page.keyboard.press('Enter'); await page.waitForTimeout(700);
  out.seedAfterEntry = await seedOf();     // expect 424 (4242 minus the backspace)
  out.modeAfterSeedStart = await mode(page);
  await page.keyboard.press('p'); await page.keyboard.press('q'); await page.waitForTimeout(300);
  // 'e' with Endless LOCKED must be inert (never a dead-end / never a broken screen)
  const beforeE = await mode(page);
  await page.keyboard.press('e'); await page.waitForTimeout(300);
  out.endlessLocked = { before: beforeE, after: await mode(page) };
  // 'l' export-log and 'm' mute must not throw anywhere
  await page.keyboard.press('m'); await page.waitForTimeout(120);
  await page.keyboard.press('m'); await page.waitForTimeout(120);
  await page.keyboard.press('l'); await page.waitForTimeout(300);
  out.afterLogAndMute = { mode: await mode(page), errs: [...errs, ...await dbg(page)] };
  // 25-digit seed spam (input clamp at 9 chars) then start
  for (let i = 0; i < 25; i++) await page.keyboard.press('9');
  await shot(page, 'pc-title-seed-overflow.png');
  await page.keyboard.press('Enter'); await page.waitForTimeout(700);
  out.seedOverflow = { seed: await seedOf(), mode: await mode(page) };
  out.errs = [...errs, ...await dbg(page)];
  await ctx.close();
  return out;
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    R.tap = await tapDurations(browser); console.log('[c] tap done');
    R.hidden = await hiddenProven(browser); console.log('[c] hidden done');
    R.trunk = await trunkBank(browser); console.log('[c] trunk done');
    R.title = await titleKeys(browser); console.log('[c] title done');
  } catch (e) { R.harnessError = String(e && e.stack || e); console.error(e); }
  await browser.close();
  writeFileSync(resolve(OUT, 'qa-results-c.json'), JSON.stringify(R, null, 2));
  console.log(JSON.stringify(R, null, 2));
})();
