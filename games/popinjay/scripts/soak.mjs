// soak.mjs — M7 ACCEPTANCE SOAK + DOSSIER (DESIGN-SEED §M7). Drives the SHIPPED dist
// over file:// through the three FORCED loadouts (baseline / wire / sidearm), a MORTAL
// death, and a quit→RESUME, with the error traps ARMED, then prints an acceptance
// dossier (BLOCKER / DEFECT / FRICTION). Any pageerror, in-game debuglog error, stall
// (frozen tick under the bot), an uncleared stage, or a broken resume is a BLOCKER —
// the seed's "any pageerror, stall, or dead control = not staged" bar.
//
// Each phase runs in a FRESH browser context (clean localStorage) so the dead-save of
// the mortal phase can't leak into the resume phase. Run: node scripts/soak.mjs

import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const URL = pathToFileURL(resolve('dist/popinjay.html')).href;
const PHASE_BUDGET_MS = 90000;

const blockers = [], defects = [], frictions = [];

async function newPage(browser) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errs.push(`console.error: ${m.text()}`); });
  await page.goto(URL);
  await page.waitForFunction('window.__popinjayReady === true', { timeout: 10000 });
  await page.evaluate(() => window.focus());
  await page.keyboard.press('Enter'); // a gesture → the House Band runs under the soak too
  page._errs = errs;
  return { ctx, page, errs };
}

async function debugErrors(page) {
  const log = await page.evaluate(() => (window.POPINJAY.debuglog.export ? window.POPINJAY.debuglog.export() : ''));
  return log.split('\n').filter((l) => /ERROR/.test(l)).map((l) => `debuglog: ${l.trim()}`);
}

// Drive one soak phase to completion; return {state, errs}.
async function runPhase(browser, label, opts) {
  const { ctx, page, errs } = await newPage(browser);
  await page.evaluate((o) => window.POPINJAY.soakStart(o), opts);
  const start = Date.now();
  let state = null;
  while (Date.now() - start < PHASE_BUDGET_MS) {
    state = await page.evaluate(() => window.POPINJAY.soakState());
    if (state.done) break;
    await page.waitForTimeout(150);
  }
  errs.push(...await debugErrors(page));
  console.log(`[soak] ${label}: tours ${state ? state.tours : 0}/${opts.tours} · stages ${state ? state.stages : 0} · finales ${state ? state.finales : 0} · victories ${state ? state.victories : 0} · deaths ${state ? state.deaths : 0} · sidearm ${state ? state.sidearmShots : 0}`);
  for (const e of errs) blockers.push(`[${label}] ${e}`);
  if (!state || !state.done) blockers.push(`[${label}] did not complete within ${PHASE_BUDGET_MS / 1000}s (a stall or flow dead-end)`);
  else if (state.stalled) blockers.push(`[${label}] STALLED / an uncleared stage (dead control)`);
  await ctx.close();
  return state;
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  try {
    // The three FORCED loadouts — a full tour each (invincible = the clearance axis).
    await runPhase(browser, 'baseline', { tours: 1, loadout: 'baseline' });
    await runPhase(browser, 'wire-build', { tours: 1, loadout: 'wire' });
    const side = await runPhase(browser, 'sidearm-build', { tours: 1, loadout: 'sidearm' });
    if (side && side.done && side.sidearmShots === 0) defects.push('sidearm-build fired the sidearm 0 times (the X verb went untested)');

    // A MORTAL run exercises the death → scorecard → record path (the naive clearance
    // bot doesn't dodge, so it downs).
    const mortal = await runPhase(browser, 'mortal-death', { tours: 1, mortal: true });
    if (mortal && mortal.done && mortal.deaths === 0) frictions.push('mortal soak did not record a death (the bot survived a full tour un-dodged — unlikely but not fatal)');

    // QUIT → RESUME: play a bit (an alive autosave lands), reload, press R, confirm play
    // continues byte-safely (resume can never re-roll — DESIGN-SEED death discipline).
    {
      const { ctx, page, errs } = await newPage(browser);
      await page.evaluate(() => window.POPINJAY.soakStart({ tours: 9, loadout: 'baseline' })); // long; we interrupt it
      const start = Date.now();
      while (Date.now() - start < 20000) { const s = await page.evaluate(() => window.POPINJAY.soakState()); if (s.stages >= 1) break; await page.waitForTimeout(120); }
      await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange'))); // nudge an autosave
      await page.waitForTimeout(200);
      await page.reload(); // quit
      await page.waitForFunction('window.__popinjayReady === true', { timeout: 10000 });
      await page.evaluate(() => window.focus());
      await page.keyboard.press('r'); // resume the saved run
      await page.waitForTimeout(400);
      const m = await page.evaluate(() => window.POPINJAY.mode);
      errs.push(...await debugErrors(page));
      console.log(`[soak] quit-resume: mode after R = ${m}`);
      for (const e of errs) blockers.push(`[quit-resume] ${e}`);
      if (m !== 'playing') blockers.push(`[quit-resume] R did not resume into play (mode='${m}') — resume broken`);
      await ctx.close();
    }
    // DEAD-CONTROL check via REAL keyboard events (not the in-app driver): walk + fire
    // must move the player + launch a wire (the seed's "real input events" + the
    // verification bar's dead-control deltas). This exercises keydown → simInput → sim.
    {
      const { ctx, page, errs } = await newPage(browser);
      await page.evaluate(() => window.POPINJAY.startStage(false)); // a live stage
      await page.waitForTimeout(200);
      const x0 = (await page.evaluate(() => window.POPINJAY.probe())).playerX;
      await page.keyboard.down('ArrowRight'); await page.waitForTimeout(500); await page.keyboard.up('ArrowRight');
      const x1 = (await page.evaluate(() => window.POPINJAY.probe())).playerX;
      await page.keyboard.down('ArrowLeft'); await page.waitForTimeout(500); await page.keyboard.up('ArrowLeft');
      const x2 = (await page.evaluate(() => window.POPINJAY.probe())).playerX;
      // Fire: hold Space and poll rapidly — the wire either APPEARS (climbing) or
      // instantly POPS a balloon (in-column), so fire is live if a wire is ever seen OR
      // the balloon count drops during the burst. (A single 60ms sample can miss both.)
      const b0 = (await page.evaluate(() => window.POPINJAY.probe())).balloons;
      let sawWire = false, poppedTo = b0;
      await page.keyboard.down(' ');
      for (let i = 0; i < 14; i++) { const p = await page.evaluate(() => window.POPINJAY.probe()); if (p.wires > 0) sawWire = true; poppedTo = Math.min(poppedTo, p.balloons); await page.waitForTimeout(30); }
      await page.keyboard.up(' ');
      const fired = sawWire || poppedTo < b0;
      errs.push(...await debugErrors(page));
      console.log(`[soak] dead-control: x ${Math.round(x0)}→${Math.round(x1)}→${Math.round(x2)} · fire ${fired ? 'live' : 'DEAD'} (wireSeen=${sawWire} balloons ${b0}→${poppedTo})`);
      for (const e of errs) blockers.push(`[dead-control] ${e}`);
      if (!(x1 > x0 + 2)) blockers.push(`[dead-control] ArrowRight did not walk the player (${Math.round(x0)}→${Math.round(x1)}) — dead control`);
      if (!(x2 < x1 - 2)) blockers.push(`[dead-control] ArrowLeft did not walk the player (${Math.round(x1)}→${Math.round(x2)}) — dead control`);
      if (!fired) blockers.push('[dead-control] Space produced neither a wire nor a pop — dead fire control');
      await ctx.close();
    }
  } finally {
    await browser.close();
  }

  console.log('\n========== M7 ACCEPTANCE DOSSIER ==========');
  const section = (name, arr) => { console.log(`\n${name} (${arr.length})`); for (const x of arr) console.log(`  - ${x}`); };
  section('BLOCKER', blockers);
  section('DEFECT', defects);
  section('FRICTION', frictions);
  const staged = blockers.length === 0;
  console.log(`\n[soak] ${staged ? 'STAGEABLE — no blockers across all loadouts + death + resume.' : 'NOT STAGED — blockers must be fixed.'}`);
  if (!staged) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
