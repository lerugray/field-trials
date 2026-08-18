// STEP 2 — COLD BOOT AS A STRANGER (public-release gate, run 2026-08-18 at HEAD 968b27b).
//
// Fresh browser context per viewport (no localStorage carried in = a stranger's very
// first boot), the SHIPPED artifact over file:// (never a dev path), seven viewports
// from small-laptop to large-desktop. Every stop is reached by the keys a stranger
// actually has — O opens OPTIONS, arrows move, ENTER starts, ESC pauses — never by a
// harness jump. At every stop: a capture, the letterbox fill gate, and the LOUD-failure
// debuglog check.
//
// Run from the repo root:
//   node docs/verification/release-gate-2026-08-18/step2-coldboot/probe-coldboot.mjs

import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { FILL_THRESHOLD } from '../../../../scripts/fill-measure.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../../../..');
const OUT = HERE;
const URL = pathToFileURL(resolve(ROOT, 'dist/popinjay.html')).href;
const HEAD = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();

const VIEWPORTS = [
  { w: 900, h: 600, tag: '900x600' },
  { w: 1280, h: 800, tag: '1280x800' },
  { w: 1366, h: 768, tag: '1366x768' },
  { w: 1440, h: 900, tag: '1440x900' },
  { w: 1512, h: 860, tag: '1512x860' },
  { w: 1920, h: 1080, tag: '1920x1080' },
  { w: 2560, h: 1440, tag: '2560x1440' },
];
const FOOTER_NATIVE = Object.freeze({ promptY: 268, creditY: 285, lineHeight: 8.8 });

async function stop(page, name) {
  return page.evaluate(() => {
    const p = window.POPINJAY;
    const box = p.present;
    return {
      mode: p.mode,
      paused: p.paused,
      errors: ((p.debuglog && p.debuglog.errors()) || []).map((e) => `t${e.tick} ${e.msg}`),
      present: box,
      fill: Number(((box.w * box.h) / (window.innerWidth * window.innerHeight)).toFixed(4)),
      vp: { w: window.innerWidth, h: window.innerHeight },
    };
  });
}

async function footerGap(page) {
  return page.evaluate((footer) => {
    const p = window.POPINJAY;
    const box = p.present;
    const canvas = document.getElementById('stage');
    const ctx = canvas.getContext('2d');
    ctx.save();
    ctx.font = `700 ${footer.lineHeight * box.scale}px "Popinjay Old Standard"`;
    ctx.textBaseline = 'top';
    const promptBox = ctx.measureText('PRESS ENTER TO BEGIN THE TOUR');
    const creditBox = ctx.measureText('EXPOSITION AMUSEMENTS CO.');
    ctx.restore();
    const promptTop = box.y + footer.promptY * box.scale;
    const promptBottom = promptTop + Math.max(footer.lineHeight * box.scale,
      (promptBox.actualBoundingBoxAscent || 0) + (promptBox.actualBoundingBoxDescent || 0));
    const creditTop = box.y + footer.creditY * box.scale;
    const creditBottom = creditTop + Math.max(footer.lineHeight * box.scale,
      (creditBox.actualBoundingBoxAscent || 0) + (creditBox.actualBoundingBoxDescent || 0));
    return {
      promptTop,
      promptBottom,
      creditTop,
      creditBottom,
      gapRows: Math.floor(creditTop) - Math.ceil(promptBottom),
      bottomSlackRows: Math.floor(box.y + box.h) - Math.ceil(creditBottom),
    };
  }, FOOTER_NATIVE);
}

const results = [];
const browser = await chromium.launch();

for (const vp of VIEWPORTS) {
  // A STRANGER: brand-new context => empty localStorage, no save, no bindings profile.
  const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') pageErrors.push(`console.error: ${m.text()}`); });

  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForFunction('window.__popinjayReady === true', { timeout: 15000 });
  await page.waitForTimeout(800);

  const rec = { viewport: vp.tag, stops: {}, pageErrors };

  // 01 TITLE — the stranger's first two seconds.
  await page.screenshot({ path: `${OUT}/01-title_${vp.tag}.png` });
  rec.stops.title = await stop(page, 'title');
  rec.titleFooter = await footerGap(page);

  // 02 OPTIONS — reached by the documented door (KeyO), not a harness jump.
  await page.keyboard.press('KeyO');
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/02-options_${vp.tag}.png` });
  rec.stops.options = await stop(page, 'options');

  // 03 OPTIONS scrolled to the bottom rows (CONTROLS / rebind door lives below).
  for (let i = 0; i < 9; i++) { await page.keyboard.press('ArrowDown'); await page.waitForTimeout(70); }
  await page.screenshot({ path: `${OUT}/03-options-bottom_${vp.tag}.png` });
  rec.stops.optionsBottom = await stop(page, 'options-bottom');

  // 03b CONTROLS pane — ENTER on the controls row (whatever the cursor now sits on
  // that navigates); recorded so the pane identity is evidence, not assumption.
  await page.keyboard.press('Enter');
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/03b-controls_${vp.tag}.png` });
  rec.stops.controls = { ...(await stop(page)), pane: await page.evaluate(() => window.POPINJAY.controller.optPane) };
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(350);

  // 04 START A RUN — ENTER from the title, the way a stranger begins.
  rec.modeBeforeStart = await page.evaluate(() => window.POPINJAY.mode);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(2200);
  await page.screenshot({ path: `${OUT}/04-gameplay-early_${vp.tag}.png` });
  rec.stops.gameplay = await stop(page, 'gameplay');

  // 05 REAL INPUT — walk right, then fire. Proves the controls a stranger uses are live.
  const before = await page.evaluate(() => window.POPINJAY.probe());
  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(700);
  await page.keyboard.up('ArrowRight');
  await page.waitForTimeout(120);
  await page.keyboard.press('KeyZ');
  await page.waitForTimeout(220);
  const after = await page.evaluate(() => window.POPINJAY.probe());
  rec.liveInput = { before, after, walked: after.playerX - before.playerX, firedWire: after.wires > 0 || after.tick > before.tick };
  await page.screenshot({ path: `${OUT}/05-live-input_${vp.tag}.png` });

  // 06 PAUSE — ESC mid-play.
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/06-pause_${vp.tag}.png` });
  rec.stops.pause = await stop(page, 'pause');

  rec.fillGate = Object.fromEntries(Object.entries(rec.stops).map(([k, v]) => [k, { fill: v.fill, pass: v.fill >= FILL_THRESHOLD }]));
  rec.allErrors = [...new Set(Object.values(rec.stops).flatMap((s) => s.errors))];
  results.push(rec);
  await ctx.close();
  console.log(`[${vp.tag}] modes ${Object.entries(rec.stops).map(([k, v]) => `${k}:${v.mode}${v.paused ? '(paused)' : ''}`).join(' ')} | walked ${rec.liveInput.walked} | fills ${Object.values(rec.fillGate).map((f) => f.fill).join(',')} | err ${rec.allErrors.length}/${pageErrors.length}`);
}
await browser.close();

const summary = {
  head: HEAD,
  url: URL,
  fillThreshold: FILL_THRESHOLD,
  viewports: results,
  verdict: {
    fillGateAllPass: results.every((r) => Object.values(r.fillGate).every((f) => f.pass)),
    zeroRuntimeErrors: results.every((r) => r.allErrors.length === 0 && r.pageErrors.length === 0),
    footerGapRowsEverywhere: results.every((r) => r.titleFooter.gapRows >= 1),
    footerBottomSlackEverywhere: results.every((r) => r.titleFooter.bottomSlackRows >= 1),
    optionsDoorWorks: results.every((r) => r.stops.options.mode === 'options' || r.stops.options.mode === 3 || r.stops.options.mode !== r.stops.title.mode),
    startsFromTitleByEnter: results.every((r) => r.stops.gameplay.mode !== r.stops.title.mode),
    liveInputMoves: results.every((r) => Math.abs(r.liveInput.walked) > 4),
    pauseWorks: results.every((r) => r.stops.pause.paused === true),
  },
};
writeFileSync(`${OUT}/coldboot.json`, JSON.stringify(summary, null, 2));
console.log('\nVERDICT', JSON.stringify(summary.verdict, null, 2));
