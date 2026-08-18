// STEP 7 QA — probe B: fire lifecycle, two-currency/bleed across restarts, rehearsal
// pause, hidden-tab damage, and REAL-WINDOW playfield fill. Read-only.
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
const dbgErrors = (page) => page.evaluate(() =>
  (window.POPINJAY.debuglog.export ? window.POPINJAY.debuglog.export() : '')
    .split('\n').filter((l) => /ERROR/.test(l)).map((l) => l.trim()));
const shot = (page, name) => page.screenshot({ path: resolve(OUT, name) });
const stores = (p) => p.evaluate(() => ({
  runs: JSON.parse(localStorage.getItem('popinjay:runs:v1') || '[]'),
  scores: JSON.parse(localStorage.getItem('popinjay:scores:v1') || '[]'),
  trunk: JSON.parse(localStorage.getItem('popinjay:trunk:v1') || 'null'),
  save: (() => { try { return JSON.parse(localStorage.getItem('popinjay:save:v4') || 'null'); } catch (_) { return 'X'; } })(),
}));

const R = {};

// 1) FIRE LIFECYCLE — tight poll: a wire must actually appear for BOTH fire keys.
async function fireLifecycle(browser) {
  const { ctx, page, errs } = await fresh(browser);
  const out = {};
  await page.keyboard.press('Enter'); await page.waitForTimeout(600);
  for (const key of ['z', ' ']) {
    // wait for the slot to be free
    await page.waitForFunction(() => window.POPINJAY.probe().wires === 0, { timeout: 5000 });
    const b0 = await page.evaluate(() => window.POPINJAY.probe());
    await page.keyboard.press(key);
    let maxW = 0, sawWire = false;
    for (let i = 0; i < 60; i++) {           // ~1s of 16ms polls
      const s = await page.evaluate(() => window.POPINJAY.probe());
      maxW = Math.max(maxW, s.wires); if (s.wires > 0) sawWire = true;
      if (sawWire && s.wires === 0) break;
      await page.waitForTimeout(16);
    }
    const b1 = await page.evaluate(() => window.POPINJAY.probe());
    out[key === ' ' ? 'space' : key] = { sawWire, maxWires: maxW, balloonsBefore: b0.balloons, balloonsAfter: b1.balloons };
  }
  // HOLD fire (auto-repeat / hold-vs-toggle) — must keep re-firing, never jam the slot
  await page.keyboard.down('z'); await page.waitForTimeout(2500);
  const held = await page.evaluate(() => window.POPINJAY.probe());
  await page.keyboard.up('z'); await page.waitForTimeout(400);
  out.holdFire = { balloonsWhileHeld: held.balloons, tick: held.tick };
  out.errs = [...errs, ...await dbgErrors(page)];
  await ctx.close();
  return out;
}

// 2) TWO-CURRENCY + BLEED across restarts, with genuinely non-zero state.
async function currencyAndBleed(browser) {
  const { ctx, page, errs } = await fresh(browser);
  const out = { steps: [] };
  await page.keyboard.press('Enter'); await page.waitForTimeout(500);
  // clear 1-1 for real (the sim's own clear path → real score + time bonus)
  await page.evaluate(() => window.POPINJAY.clearedDemo(1, 1)); await page.waitForTimeout(500);
  await shot(page, 'pb-cleared-1-1.png');
  out.steps.push({ at: 'cleared 1-1', mode: await mode(page) });
  await page.keyboard.press('Enter'); await page.waitForTimeout(400);   // bank + draft
  out.steps.push({ at: 'after Enter on clear', mode: await mode(page) });
  await page.keyboard.press('1'); await page.waitForTimeout(600);       // take souvenir #1
  out.steps.push({ at: 'after draft pick', mode: await mode(page) });
  const afterDraft = await stores(page);
  out.afterDraft = { runScore: afterDraft.save?.run?.score, runTickets: afterDraft.save?.run?.tickets, souvenirs: afterDraft.save?.run?.souvenirs, stagesCleared: afterDraft.save?.run?.stagesCleared };
  // clear a second stage for more tickets
  await page.evaluate(() => window.POPINJAY.clearedDemo(1, 2)); await page.waitForTimeout(400);
  await page.keyboard.press('Enter'); await page.waitForTimeout(400);
  await page.keyboard.press('d'); await page.waitForTimeout(600);       // DECLINE (must grant nothing)
  const afterDecline = await stores(page);
  out.afterDecline = { runScore: afterDecline.save?.run?.score, runTickets: afterDecline.save?.run?.tickets, souvenirs: afterDecline.save?.run?.souvenirs, stagesCleared: afterDecline.save?.run?.stagesCleared };
  // now die
  await page.evaluate(() => window.POPINJAY.killDemo());
  let w = 0; while (w < 8000 && (await mode(page)) !== 'scorecard') { await page.waitForTimeout(200); w += 200; }
  await shot(page, 'pb-scorecard-real-run.png');
  const atDeath = await stores(page);
  out.atDeath = {
    mode: await mode(page),
    recordedRun: atDeath.runs[0], topScore: atDeath.scores[0],
    trunkTickets: atDeath.trunk?.tickets,
    savedRun: { score: atDeath.save?.run?.score, tickets: atDeath.save?.run?.tickets, souvenirs: atDeath.save?.run?.souvenirs, dead: atDeath.save?.dead },
  };
  // restart → the NEXT run must start clean (no score/ticket/souvenir bleed)
  await page.keyboard.press('Enter'); await page.waitForTimeout(800);
  const afterRestart = await stores(page);
  out.afterRestart = {
    mode: await mode(page),
    newRun: { score: afterRestart.save?.run?.score, tickets: afterRestart.save?.run?.tickets, souvenirs: afterRestart.save?.run?.souvenirs, stagesCleared: afterRestart.save?.run?.stagesCleared, locale: afterRestart.save?.run?.locale, stage: afterRestart.save?.run?.stage },
    trunkTicketsStillBanked: afterRestart.trunk?.tickets,
  };
  // a second full restart cycle to catch slower bleed
  await page.evaluate(() => window.POPINJAY.clearedDemo(1, 1)); await page.waitForTimeout(400);
  await page.keyboard.press('Enter'); await page.waitForTimeout(300);
  await page.keyboard.press('d'); await page.waitForTimeout(500);
  await page.evaluate(() => window.POPINJAY.killDemo());
  w = 0; while (w < 8000 && (await mode(page)) !== 'scorecard') { await page.waitForTimeout(200); w += 200; }
  const second = await stores(page);
  out.secondDeath = { recordedRun: second.runs[0], trunkTickets: second.trunk?.tickets, runsCount: second.runs.length };
  await page.keyboard.press('Enter'); await page.waitForTimeout(700);
  const afterRestart2 = await stores(page);
  out.afterRestart2 = { score: afterRestart2.save?.run?.score, tickets: afterRestart2.save?.run?.tickets, souvenirs: afterRestart2.save?.run?.souvenirs };
  out.errs = [...errs, ...await dbgErrors(page)];
  await ctx.close();
  return out;
}

// 3) REHEARSAL: does P pause it? does it auto-advance anyway?
async function rehearsalPause(browser) {
  const { ctx, page, errs } = await fresh(browser);
  const out = {};
  await page.evaluate(() => window.POPINJAY.tourmapDemo()); await page.waitForTimeout(300);
  await page.keyboard.press('Enter'); await page.waitForTimeout(400);
  out.mode = await mode(page);
  await page.keyboard.press('p'); await page.waitForTimeout(200);
  out.modeAfterP = await mode(page);
  await page.keyboard.press('Escape'); await page.waitForTimeout(200);
  out.modeAfterEscape = await mode(page);
  // wait out the full ~12s burst with P "held down" repeatedly — if it advances, it never paused
  for (let i = 0; i < 16; i++) { await page.keyboard.press('p'); await page.waitForTimeout(1000); if ((await mode(page)) !== 'rehearsal') break; }
  out.modeAfter16s = await mode(page);
  out.errs = [...errs, ...await dbgErrors(page)];
  await ctx.close();
  return out;
}

// 4) HIDDEN TAB: can the player be damaged / can the run end while the tab is away?
async function hiddenTab(browser) {
  const { ctx, page, errs } = await fresh(browser);
  const out = {};
  await page.keyboard.press('Enter'); await page.waitForTimeout(800);
  const a = await page.evaluate(() => window.POPINJAY.probe());
  const other = await ctx.newPage(); await other.goto('about:blank'); await other.bringToFront();
  await new Promise((r) => setTimeout(r, 15000));
  await page.bringToFront(); await page.waitForTimeout(120);
  const b = await page.evaluate(() => window.POPINJAY.probe());
  out.before = { hearts: a.hearts, tick: a.tick, balloons: a.balloons };
  out.after = { hearts: b.hearts, tick: b.tick, balloons: b.balloons, mode: await mode(page) };
  out.ticksWhileHidden = b.tick - a.tick;
  out.heartsLostWhileHidden = a.hearts - b.hearts;
  out.hiddenState = await page.evaluate(() => document.visibilityState);
  out.errs = [...errs, ...await dbgErrors(page)];
  await other.close(); await ctx.close();
  return out;
}

// 5) REAL-WINDOW FILL: the fraction of the window the playfield+HUD actually occupies.
async function realWindowFill(browser) {
  const { ctx, page, errs } = await fresh(browser, { w: 1440, h: 900 });
  await page.keyboard.press('Enter'); await page.waitForTimeout(400);
  const sizes = [
    [1440, 900, 'exact ratified viewport'],
    [1440, 812, 'Mac 1440x900 display, maximised Chrome (chrome eats ~88px)'],
    [1280, 800, 'ratified viewport #2'],
    [1280, 672, 'MacBook 13in maximised browser'],
    [1512, 860, 'MacBook Pro 14in maximised'],
    [1920, 1080, '1080p maximised'],
    [1024, 640, 'small window'],
  ];
  const rows = [];
  for (const [w, h, label] of sizes) {
    await page.setViewportSize({ width: w, height: h });
    await page.waitForTimeout(320);
    const r = await page.evaluate(() => {
      const p = window.POPINJAY.present;
      return { scale: p.scale, pw: p.w, ph: p.h, iw: window.innerWidth, ih: window.innerHeight, native: p.native };
    });
    rows.push({ label, win: `${w}x${h}`, scale: r.scale, playfield: `${r.pw}x${r.ph}`, areaFill: +((r.pw * r.ph) / (r.iw * r.ih)).toFixed(3) });
    if (w === 1440 && h === 812) await shot(page, 'pb-fill-1440x812-real-mac-window.png');
    if (w === 1024 && h === 640) await shot(page, 'pb-fill-1024x640.png');
  }
  const out = { rows, native: (await page.evaluate(() => window.POPINJAY.present.native)), errs: [...errs, ...await dbgErrors(page)] };
  await ctx.close();
  return out;
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    R.fire = await fireLifecycle(browser); console.log('[b] fire done');
    R.currency = await currencyAndBleed(browser); console.log('[b] currency done');
    R.rehearsal = await rehearsalPause(browser); console.log('[b] rehearsal done');
    R.hidden = await hiddenTab(browser); console.log('[b] hidden done');
    R.fill = await realWindowFill(browser); console.log('[b] fill done');
  } catch (e) { R.harnessError = String(e && e.stack || e); console.error(e); }
  await browser.close();
  writeFileSync(resolve(OUT, 'qa-results-b.json'), JSON.stringify(R, null, 2));
  console.log(JSON.stringify(R, null, 2));
})();
