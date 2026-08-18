// STEP 7 studio QA sweep — POPINJAY @ e07703a, against the SHIPPED dist over file://.
// Read-only: never writes to src/ or dist/. Evidence → docs/verification/release-gate-2026-08-15/step7-qa/
import { chromium } from '/Users/rayweiss/Desktop/Dev Work/popinjay/node_modules/playwright/index.mjs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { writeFileSync, mkdirSync } from 'node:fs';

const ROOT = '/Users/rayweiss/Desktop/Dev Work/popinjay';
const URL = pathToFileURL(resolve(ROOT, 'dist/popinjay.html')).href;
const OUT = resolve(ROOT, 'docs/verification/release-gate-2026-08-15/step7-qa');
mkdirSync(OUT, { recursive: true });

const findings = [];
const notes = [];
const F = (sev, id, text, evidence) => findings.push({ sev, id, text, evidence });
const N = (k, v) => notes.push({ [k]: v });

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
const dbgErrors = (page) => page.evaluate(() =>
  (window.POPINJAY.debuglog.export ? window.POPINJAY.debuglog.export() : '')
    .split('\n').filter((l) => /ERROR/.test(l)).map((l) => l.trim()));
const probe = (page) => page.evaluate(() => window.POPINJAY.probe());
const shot = (page, name) => page.screenshot({ path: resolve(OUT, name) });

// ---------------------------------------------------------------- PHASE 1: INPUT
async function phaseInput(browser) {
  const { ctx, page, errs } = await fresh(browser);
  const r = { phase: 'input' };
  await page.keyboard.press('Enter');            // title → stage 1-1
  await page.waitForTimeout(600);
  r.modeAfterEnter = (await probe(page)).mode;

  // --- dead-control: walk left, walk right
  const p0 = await probe(page);
  await page.keyboard.down('ArrowLeft'); await page.waitForTimeout(500); await page.keyboard.up('ArrowLeft');
  const pL = await probe(page);
  await page.keyboard.down('ArrowRight'); await page.waitForTimeout(500); await page.keyboard.up('ArrowRight');
  const pR = await probe(page);
  r.walkLeftDelta = +(pL.playerX - p0.playerX).toFixed(2);
  r.walkRightDelta = +(pR.playerX - pL.playerX).toFixed(2);

  // --- fire (z) and fire (space): wire must appear
  const before = await probe(page);
  await page.keyboard.press('z');
  await page.waitForTimeout(90);
  const afterZ = await probe(page);
  r.fireZ_wires = afterZ.wires;
  await page.waitForTimeout(1400);
  await page.keyboard.press(' ');
  await page.waitForTimeout(90);
  r.fireSpace_wires = (await probe(page)).wires;
  r.tickAdvancing = (await probe(page)).tick > before.tick;

  // --- single-slot law under MASHING: 40 rapid fires must never exceed slot count
  let maxWires = 0;
  for (let i = 0; i < 40; i++) { await page.keyboard.press('z'); const s = await probe(page); maxWires = Math.max(maxWires, s.wires); }
  r.maxWiresUnderMash = maxWires;

  // --- simultaneous opposing inputs
  await page.keyboard.down('ArrowLeft'); await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(600);
  const opp = await probe(page);
  await page.keyboard.up('ArrowLeft'); await page.keyboard.up('ArrowRight');
  r.opposingX = opp.playerX;
  r.opposingFinite = Number.isFinite(opp.playerX) && Number.isFinite(opp.feetY);

  // --- up/down (ladder) + sidearm + tuba: must not throw, must not freeze the sim
  const tA = (await probe(page)).tick;
  for (const k of ['ArrowUp', 'ArrowDown', 'x', 't']) { await page.keyboard.down(k); await page.waitForTimeout(180); await page.keyboard.up(k); }
  const tB = (await probe(page)).tick;
  r.simAliveAfterAllKeys = tB > tA;

  // --- MOUSE: the seed declares keyboard-only, no mouse verbs. Confirm clicks are inert, not broken.
  const mBefore = await probe(page);
  await page.mouse.click(640, 400); await page.mouse.click(200, 600); await page.mouse.dblclick(900, 300);
  await page.waitForTimeout(200);
  const mAfter = await probe(page);
  r.mouseInert = mAfter.wires === mBefore.wires;

  // --- input DURING a pause transition (mash through the pause toggle)
  for (let i = 0; i < 8; i++) { await page.keyboard.press('p'); await page.keyboard.press('z'); await page.keyboard.press('ArrowRight'); }
  await page.waitForTimeout(300);
  const pauseState = await page.evaluate(() => ({ mode: window.POPINJAY.mode }));
  r.modeAfterPauseMash = pauseState.mode;
  // leave unpaused
  const isPaused = await page.evaluate(() => { const a = window.POPINJAY.probe().tick; return new Promise((res) => setTimeout(() => res(window.POPINJAY.probe().tick === a), 250)); });
  if (isPaused) await page.keyboard.press('p');
  await page.waitForTimeout(200);
  r.recoveredFromPauseMash = await page.evaluate(() => { const a = window.POPINJAY.probe().tick; return new Promise((res) => setTimeout(() => res(window.POPINJAY.probe().tick > a), 300)); });

  await shot(page, 'p1-input-live-stage.png');
  r.debugErrors = await dbgErrors(page);
  r.pageErrors = errs.slice();
  await ctx.close();
  return r;
}

// ---------------------------------------------------------------- PHASE 2: MENUS
async function phaseMenus(browser) {
  const { ctx, page, errs } = await fresh(browser);
  const r = { phase: 'menus', cycles: [] };
  const mode = () => page.evaluate(() => window.POPINJAY.mode);

  // OPTIONS: open/close/reopen x3 from TITLE
  for (let i = 0; i < 3; i++) {
    await page.keyboard.press('o'); await page.waitForTimeout(120); const opened = await mode();
    await page.keyboard.press('Escape'); await page.waitForTimeout(120); const closed = await mode();
    r.cycles.push({ menu: 'options@title', i, opened, closed });
  }
  // TRUNK: open/close/reopen x3 (three documented exits: Escape, b, t)
  for (const exit of ['Escape', 'b', 't']) {
    await page.keyboard.press('t'); await page.waitForTimeout(120); const opened = await mode();
    await page.keyboard.press(exit); await page.waitForTimeout(120); const closed = await mode();
    r.cycles.push({ menu: 'trunk@title', exit, opened, closed });
  }
  await shot(page, 'p2-title.png');
  await page.keyboard.press('t'); await page.waitForTimeout(150); await shot(page, 'p2-trunk.png'); await page.keyboard.press('Escape');
  await page.keyboard.press('o'); await page.waitForTimeout(150); await shot(page, 'p2-options.png');

  // OPTIONS persistence + live application: flip flash-reduce + drop volume, reload, verify.
  const optsBefore = await page.evaluate(() => JSON.parse(localStorage.getItem('popinjay:settings:v1') || '{}'));
  // cursor starts 0 (Master volume). Adjust volume down 3, then walk to flash-reduce (index 6) and toggle.
  await page.keyboard.press('ArrowLeft'); await page.keyboard.press('ArrowLeft'); await page.keyboard.press('ArrowLeft');
  for (let i = 0; i < 6; i++) await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');            // toggle flash-reduce
  await page.waitForTimeout(120);
  await shot(page, 'p2-options-changed.png');
  const optsAfter = await page.evaluate(() => JSON.parse(localStorage.getItem('popinjay:settings:v1') || '{}'));
  r.settingsWritten = { before: optsBefore, after: optsAfter };
  await page.keyboard.press('Escape');
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction('window.__popinjayReady === true');
  const optsReload = await page.evaluate(() => JSON.parse(localStorage.getItem('popinjay:settings:v1') || '{}'));
  r.settingsPersisted = optsReload;

  // Pause → options → back → resume (the mid-run assist-parity path)
  await page.keyboard.press('Enter'); await page.waitForTimeout(500);
  await page.keyboard.press('p'); await page.waitForTimeout(150);
  await shot(page, 'p2-pause.png');
  await page.keyboard.press('o'); await page.waitForTimeout(150);
  const inOptsFromPause = await mode();
  await shot(page, 'p2-options-from-pause.png');
  await page.keyboard.press('Escape'); await page.waitForTimeout(150);
  const backToPlaying = await mode();
  await page.keyboard.press('p'); await page.waitForTimeout(250);
  r.pauseOptionsRoundTrip = { inOptsFromPause, backToPlaying, resumed: await page.evaluate(() => { const a = window.POPINJAY.probe().tick; return new Promise((res) => setTimeout(() => res(window.POPINJAY.probe().tick > a), 300)); }) };

  // Quit to title from pause, then Resume (R)
  await page.keyboard.press('p'); await page.waitForTimeout(120);
  await page.keyboard.press('q'); await page.waitForTimeout(200);
  r.quitToTitleMode = await mode();
  await shot(page, 'p2-title-with-resume.png');
  await page.keyboard.press('r'); await page.waitForTimeout(400);
  r.resumeMode = await mode();

  // DRAFT surface (untimed + decline documented)
  await page.evaluate(() => window.POPINJAY.draftDemo()); await page.waitForTimeout(250);
  await shot(page, 'p2-draft.png');
  const draftMode = await mode();
  await page.waitForTimeout(2500);              // untimed: must still be there
  r.draftUntimed = (await mode()) === draftMode;
  await page.keyboard.press('d'); await page.waitForTimeout(200);
  r.draftDeclineExits = (await mode()) !== draftMode;

  r.debugErrors = await dbgErrors(page); r.pageErrors = errs.slice();
  await ctx.close();
  return r;
}

// ---------------------------------------------------------------- PHASE 3: EDGE STATES
async function phaseEdge(browser) {
  const out = { phase: 'edge' };

  // (a) RESIZE mid-play — fill must re-assert
  {
    const { ctx, page, errs } = await fresh(browser, { w: 1440, h: 900 });
    await page.keyboard.press('Enter'); await page.waitForTimeout(500);
    const fill = async () => page.evaluate(() => {
      const p = window.POPINJAY.present;
      return { scale: p.scale, w: p.w, h: p.h, frac: +((p.w * p.h) / (window.innerWidth * window.innerHeight)).toFixed(4), win: [window.innerWidth, window.innerHeight] };
    });
    const sizes = [[1440, 900], [1280, 800], [1100, 700], [1920, 1080], [900, 600], [1440, 900]];
    out.resize = [];
    for (const [w, h] of sizes) {
      await page.setViewportSize({ width: w, height: h });
      await page.waitForTimeout(350);
      out.resize.push(await fill());
    }
    await shot(page, 'p3-resize-back-to-1440x900.png');
    await page.setViewportSize({ width: 1100, height: 700 }); await page.waitForTimeout(350);
    await shot(page, 'p3-resize-1100x700.png');
    out.resizeErrors = [...errs, ...await dbgErrors(page)];
    await ctx.close();
  }

  // (b) TAB-AWAY / REFOCUS — no runaway or double-speed
  {
    const { ctx, page, errs } = await fresh(browser);
    await page.keyboard.press('Enter'); await page.waitForTimeout(600);
    const t0 = (await probe(page)).tick;
    const other = await ctx.newPage(); await other.goto('about:blank'); await other.bringToFront();
    await new Promise((r) => setTimeout(r, 4000));
    await page.bringToFront(); await page.waitForTimeout(80);
    const t1 = (await probe(page)).tick;
    await page.waitForTimeout(1000);
    const t2 = (await probe(page)).tick;
    out.blur = { jumpOnRefocus: t1 - t0, ticksPerSecondAfter: t2 - t1, expected60: 60 };
    out.blurErrors = [...errs, ...await dbgErrors(page)];
    await other.close(); await ctx.close();
  }

  // (c) PAUSE at distinct moments
  {
    const { ctx, page, errs } = await fresh(browser);
    const paused = async () => page.evaluate(() => { const a = window.POPINJAY.probe().tick; return new Promise((res) => setTimeout(() => res(window.POPINJAY.probe().tick === a), 300)); });
    const mode = () => page.evaluate(() => window.POPINJAY.mode);
    out.pause = {};
    await page.keyboard.press('Enter'); await page.waitForTimeout(500);
    await page.keyboard.press('p'); await page.waitForTimeout(150);
    out.pause.duringPlay = await paused();
    await page.keyboard.press('Escape'); await page.waitForTimeout(150);
    out.pause.escapeUnpauses = !(await paused());
    // pause during a live dynamite cascade
    await page.evaluate(() => window.POPINJAY.dynamiteDemo()); await page.waitForTimeout(400);
    await page.keyboard.press('p'); await page.waitForTimeout(150);
    out.pause.duringCascade = await paused();
    await shot(page, 'p3-pause-during-cascade.png');
    await page.keyboard.press('p');
    // pause during the closing-bell / drip state
    await page.evaluate(() => window.POPINJAY.dripDemo()); await page.waitForTimeout(500);
    await page.keyboard.press('p'); await page.waitForTimeout(150);
    out.pause.duringClosingBell = await paused();
    await page.keyboard.press('p');
    // pause during the FINALE
    await page.evaluate(() => window.POPINJAY.finaleDemo()); await page.waitForTimeout(500);
    await page.keyboard.press('p'); await page.waitForTimeout(150);
    out.pause.duringFinale = await paused();
    await shot(page, 'p3-pause-during-finale.png');
    await page.keyboard.press('p'); await page.waitForTimeout(150);
    // pause attempt during REHEARSAL (a real-time-timed screen) and during DRAFT/TOURMAP
    await page.evaluate(() => window.POPINJAY.tourmapDemo()); await page.waitForTimeout(250);
    await page.keyboard.press('p'); await page.waitForTimeout(200);
    out.pause.tourmapModeAfterP = await mode();
    await page.keyboard.press('Enter'); await page.waitForTimeout(400);   // → REHEARSAL
    const rehearsalMode = await mode();
    await page.keyboard.press('p'); await page.waitForTimeout(200);
    out.pause.rehearsalMode = rehearsalMode;
    out.pause.rehearsalModeAfterP = await mode();
    await shot(page, 'p3-rehearsal.png');
    // does the rehearsal clock keep running while "paused"?
    const rt0 = await page.evaluate(() => window.POPINJAY.probe().tick);
    await page.waitForTimeout(1200);
    const rt1 = await page.evaluate(() => window.POPINJAY.probe().tick);
    out.pause.rehearsalAdvancesUnderP = rt1 !== rt0;
    out.pauseErrors = [...errs, ...await dbgErrors(page)];
    await ctx.close();
  }

  // (d) CORRUPT-SAVE notice path (localStorage tampering must be LOUD, not a silent wipe)
  {
    const { ctx, page, errs } = await fresh(browser);
    out.storage = {};
    out.storage.available = await page.evaluate(() => { try { localStorage.setItem('__t', '1'); localStorage.removeItem('__t'); return true; } catch (_) { return false; } });
    if (out.storage.available) {
      // make a real save first
      await page.keyboard.press('Enter'); await page.waitForTimeout(1500);
      await page.keyboard.press('p'); await page.keyboard.press('q'); await page.waitForTimeout(300);
      out.storage.savePresent = await page.evaluate(() => !!localStorage.getItem('popinjay:save:v4'));
      const cleanTitle = await page.screenshot();
      const variants = {
        garbage: 'not json at all {{{',
        truncated: '{"v":1,"seed":123,"dead":fal',
        wrongShape: '{"v":1,"seed":"abc","dead":"no"}',
        versionSkew: '{"v":99,"seed":123,"dead":false,"world":{},"run":{}}',
        emptyString: '',
      };
      out.storage.variants = {};
      for (const [name, payload] of Object.entries(variants)) {
        await page.evaluate((p) => localStorage.setItem('popinjay:save:v4', p), payload);
        await page.reload({ waitUntil: 'load' });
        await page.waitForFunction('window.__popinjayReady === true');
        await page.waitForTimeout(400);
        const buf = await page.screenshot();
        await shot(page, `p3-corrupt-${name}.png`);
        const differs = Buffer.compare(buf, cleanTitle) !== 0;
        const mode = await page.evaluate(() => window.POPINJAY.mode);
        const errsNow = await dbgErrors(page);
        out.storage.variants[name] = { noticeRendered: differs, mode, debugErrors: errsNow };
      }
      // tamper the OTHER stores too — scores/runs/settings/trunk
      out.storage.otherStores = {};
      for (const key of ['popinjay:scores:v1', 'popinjay:runs:v1', 'popinjay:settings:v1', 'popinjay:trunk:v1', 'popinjay:flags:v1']) {
        await page.evaluate((k) => { localStorage.setItem(k, '###not json###'); localStorage.removeItem('popinjay:save:v4'); }, key);
        await page.reload({ waitUntil: 'load' });
        let ok = true, err = null;
        try { await page.waitForFunction('window.__popinjayReady === true', { timeout: 8000 }); } catch (e) { ok = false; err = String(e.message).slice(0, 120); }
        await page.waitForTimeout(200);
        out.storage.otherStores[key] = { booted: ok, err, debugErrors: ok ? await dbgErrors(page) : [], pageErrors: errs.slice(-3) };
        await shot(page, `p3-tamper-${key.replace(/[:]/g, '_')}.png`);
        await page.evaluate((k) => localStorage.removeItem(k), key);
      }
    }
    out.storageErrors = errs.slice();
    await ctx.close();
  }
  return out;
}

// ---------------------------------------------------------------- PHASE 4: LOOPS
async function phaseLoops(browser) {
  const { ctx, page, errs } = await fresh(browser);
  const r = { phase: 'loops', runs: [] };
  const mode = () => page.evaluate(() => window.POPINJAY.mode);
  const stores = () => page.evaluate(() => ({
    runs: JSON.parse(localStorage.getItem('popinjay:runs:v1') || '[]'),
    scores: JSON.parse(localStorage.getItem('popinjay:scores:v1') || '[]'),
    trunk: JSON.parse(localStorage.getItem('popinjay:trunk:v1') || 'null'),
    save: (() => { try { return JSON.parse(localStorage.getItem('popinjay:save:v4') || 'null'); } catch (_) { return 'UNPARSEABLE'; } })(),
  }));

  for (let i = 0; i < 5; i++) {
    // enter a stage, play a little for a real score, then take a fatal hit
    if (i === 0) { await page.keyboard.press('Enter'); await page.waitForTimeout(400); }
    await page.evaluate(() => window.POPINJAY.startStageAt(1, 1));
    await page.waitForTimeout(200);
    // fire a few real shots so score/pops are non-trivial and differ per loop
    for (let k = 0; k <= i; k++) { await page.keyboard.press('z'); await page.waitForTimeout(700); }
    await page.evaluate(() => window.POPINJAY.killDemo());
    // wait for death → scorecard
    let waited = 0;
    while (waited < 8000 && (await mode()) !== 'scorecard') { await page.waitForTimeout(200); waited += 200; }
    const st = await stores();
    const snap = await page.evaluate(() => window.POPINJAY.probe());
    r.runs.push({
      loop: i, modeAtEnd: await mode(), waitedMs: waited,
      lastRun: st.runs[0] || null, runsCount: st.runs.length,
      scoresTop: st.scores.slice(0, 3), trunkTickets: st.trunk && st.trunk.tickets,
      saveDead: st.save && st.save.dead, savedRunScore: st.save && st.save.run && st.save.run.score,
      savedRunTickets: st.save && st.save.run && st.save.run.tickets,
      savedSouvenirs: st.save && st.save.run && st.save.run.souvenirs,
      probeHearts: snap.hearts,
    });
    if (i === 0) await shot(page, 'p4-scorecard-run1.png');
    if (i === 4) await shot(page, 'p4-scorecard-run5.png');
    await page.keyboard.press('Enter');   // → new run
    await page.waitForTimeout(500);
    r.runs[i].modeAfterRestart = await mode();
    const st2 = await stores();
    r.runs[i].saveClearedOnRestart = st2.save === null;
  }
  // Reboot with a DEAD save present → must show the scorecard, never a retry
  await page.evaluate(() => window.POPINJAY.killDemo());
  let w2 = 0; while (w2 < 8000 && (await mode()) !== 'scorecard') { await page.waitForTimeout(200); w2 += 200; }
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction('window.__popinjayReady === true');
  await page.waitForTimeout(400);
  r.deadSaveRebootMode = await mode();
  await shot(page, 'p4-dead-save-reboot.png');

  r.debugErrors = await dbgErrors(page); r.pageErrors = errs.slice();
  await ctx.close();
  return r;
}

// ---------------------------------------------------------------- LOOK captures
async function phaseLook(browser) {
  const { ctx, page, errs } = await fresh(browser, { w: 1440, h: 900 });
  const shots = [
    ['look-01-title.png', null],
    ['look-02-play.png', () => window.POPINJAY.startStageAt(1, 2)],
    ['look-03-draft.png', () => window.POPINJAY.draftDemo()],
    ['look-04-scorecard.png', () => window.POPINJAY.scorecardDemo()],
    ['look-05-tourmap.png', () => window.POPINJAY.tourmapDemo()],
    ['look-06-finale.png', () => window.POPINJAY.finaleDemo()],
    ['look-07-options.png', () => window.POPINJAY.optionsDemo()],
    ['look-08-pause.png', () => window.POPINJAY.pauseDemo()],
    ['look-09-trunk.png', () => window.POPINJAY.trunkDemo()],
    ['look-10-cleared.png', () => window.POPINJAY.clearedDemo()],
  ];
  for (const [name, fn] of shots) {
    if (fn) { await page.evaluate(fn); await page.waitForTimeout(700); }
    await shot(page, name);
  }
  const out = { phase: 'look', debugErrors: await dbgErrors(page), pageErrors: errs.slice() };
  await ctx.close();
  return out;
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const results = {};
  try {
    results.input = await phaseInput(browser);
    console.log('[qa] input done');
    results.menus = await phaseMenus(browser);
    console.log('[qa] menus done');
    results.edge = await phaseEdge(browser);
    console.log('[qa] edge done');
    results.loops = await phaseLoops(browser);
    console.log('[qa] loops done');
    results.look = await phaseLook(browser);
    console.log('[qa] look done');
  } catch (e) {
    results.harnessError = String(e && e.stack || e);
    console.error('[qa] HARNESS ERROR', e);
  }
  await browser.close();
  writeFileSync(resolve(OUT, 'qa-results.json'), JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results, null, 2));
})();
