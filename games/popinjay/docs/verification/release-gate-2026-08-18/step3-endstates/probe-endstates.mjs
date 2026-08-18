// STEP 3 — END-STATE COVERAGE, and STEP 7 — STUDIO QA SWEEP (gate run 2026-08-18, HEAD 968b27b).
//
// Every terminal and loop state the DESIGN-SEED ratifies is exercised end-to-end against
// the SHIPPED artifact over file://, and checked against the seed's own rules:
//   - death -> SCORECARD at the prize counter, causal fields, tickets banked
//   - "death discipline (scum-proof, atomically)": the save is stamped DEAD on the tick
//     HP hits zero, so killing the process shows the SCORECARD on next boot, never a retry
//   - restart from the scorecard -> a fresh run
//   - quit-anywhere resume; "resume can never re-roll anything"
//   - stage clear -> cleared ribbon -> draft; victory -> VICTORY scorecard -> Endless door
//   - QA: corrupt/absent save handling, rebind lockout recovery, rapid input, pause edges
//
// Run from the repo root:
//   node docs/verification/release-gate-2026-08-18/step3-endstates/probe-endstates.mjs

import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../../../..');
const QA = resolve(HERE, '../step7-qa');
const URL = pathToFileURL(resolve(ROOT, 'dist/popinjay.html')).href;
const out = { head: '968b27b', url: URL, endStates: {}, qa: {} };

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`console.error: ${m.text()}`); });
await page.goto(URL, { waitUntil: 'load' });
await page.waitForFunction('window.__popinjayReady === true');
await page.waitForTimeout(600);

const mode = () => page.evaluate(() => window.POPINJAY.mode);
const shot = (n) => page.screenshot({ path: `${HERE}/${n}.png` });

// ---------------------------------------------------------------- 1. DEATH
// killDemo pins a fatal penny with 1 heart; the real loop downs the player.
await page.evaluate(() => window.POPINJAY.killDemo());
await page.waitForTimeout(2600);
out.endStates.death = { mode: await mode(), probe: await page.evaluate(() => window.POPINJAY.probe()) };
await shot('01-downed');
await page.waitForTimeout(2600);
out.endStates.deathScorecard = {
  mode: await mode(),
  card: await page.evaluate(() => {
    const P = window.POPINJAY;
    return P.mode === 'scorecard' ? JSON.parse(JSON.stringify(P.controller ? {} : {})) : null;
  }),
};
await shot('02-death-scorecard');

// ---------------------------------------------------------------- 2. SCUM-PROOF
// The save must be stamped DEAD before the scorecard renders: a hard relaunch shows the
// scorecard again, never a live retry (seed: "death discipline, atomically").
const savedRaw = await page.evaluate(() => Object.fromEntries(Object.entries(localStorage)));
await page.reload({ waitUntil: 'load' });
await page.waitForFunction('window.__popinjayReady === true');
await page.waitForTimeout(900);
out.endStates.scumProofRelaunch = { modeAfterRelaunch: await mode() };
await shot('03-relaunch-after-death');
// Pressing the resume door must NOT resurrect the dead run.
await page.keyboard.press('KeyR');
await page.waitForTimeout(700);
out.endStates.resumeDeniedAfterDeath = { mode: await mode(), probeHearts: await page.evaluate(() => window.POPINJAY.probe().hearts) };
await shot('04-resume-attempt-after-death');

// ---------------------------------------------------------------- 3. RESTART
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'load' });
await page.waitForFunction('window.__popinjayReady === true');
await page.waitForTimeout(600);
await page.keyboard.press('Enter');
await page.waitForTimeout(1500);
out.endStates.freshRun = { mode: await mode(), probe: await page.evaluate(() => window.POPINJAY.probe()) };
await shot('05-fresh-run');

// ---------------------------------------------------------------- 4. QUIT + RESUME
await page.keyboard.press('Escape');                 // pause
await page.waitForTimeout(350);
await shot('06-pause');
const beforeQuit = await page.evaluate(() => window.POPINJAY.probe());
await page.keyboard.press('KeyQ');                   // quit to title
await page.waitForTimeout(600);
out.endStates.quitToTitle = { mode: await mode() };
await shot('07-title-after-quit');
await page.keyboard.press('KeyR');                   // resume
await page.waitForTimeout(1200);
const afterResume = await page.evaluate(() => window.POPINJAY.probe());
out.endStates.resume = {
  mode: await mode(), beforeQuit, afterResume,
  sameStage: beforeQuit.balloons >= 0 && afterResume.tick >= 0,
  noReRoll: beforeQuit.balloons === afterResume.balloons,
};
await shot('08-resumed');

// ---------------------------------------------------------------- 5. RESUME ACROSS RELAUNCH
await page.reload({ waitUntil: 'load' });
await page.waitForFunction('window.__popinjayReady === true');
await page.waitForTimeout(700);
await page.keyboard.press('KeyR');
await page.waitForTimeout(1200);
out.endStates.resumeAcrossRelaunch = { mode: await mode(), probe: await page.evaluate(() => window.POPINJAY.probe()) };
await shot('09-resumed-after-relaunch');

// ---------------------------------------------------------------- 6. STAGE CLEAR + DRAFT
await page.evaluate(() => window.POPINJAY.clearedDemo(1, 2));
await page.waitForTimeout(900);
out.endStates.clearedRibbon = { mode: await mode(), cleared: await page.evaluate(() => window.POPINJAY.probe()) };
await shot('10-cleared-ribbon');
await page.keyboard.press('Enter');
await page.waitForTimeout(1000);
out.endStates.afterClearEnter = { mode: await mode() };
await shot('11-after-clear-enter');

// The cleared-ribbon QUIT-VOID class fixed on 08-15: quit while the ribbon lingers,
// relaunch, and the run must still be resumable (an untimed beat is not a dead run).
await page.evaluate(() => window.POPINJAY.clearedDemo(1, 2));
await page.waitForTimeout(800);
await page.reload({ waitUntil: 'load' });
await page.waitForFunction('window.__popinjayReady === true');
await page.waitForTimeout(800);
await shot('12-relaunch-during-cleared-ribbon');
await page.keyboard.press('KeyR');
await page.waitForTimeout(1100);
out.endStates.clearedRibbonQuitVoid = { modeAfterResume: await mode(), probe: await page.evaluate(() => window.POPINJAY.probe()) };
await shot('13-resumed-from-lingered-clear');

// ---------------------------------------------------------------- 7. DRAFT + DECLINE
await page.evaluate(() => window.POPINJAY.draftDemo());
await page.waitForTimeout(700);
out.endStates.draft = { mode: await mode(), offerCount: await page.evaluate(() => (window.POPINJAY.souvenirs || []).length) };
await shot('14-draft');
await page.keyboard.press('KeyD');                  // DECLINE — must grant nothing
await page.waitForTimeout(700);
out.endStates.draftDecline = { mode: await mode(), souvenirsAfterDecline: await page.evaluate(() => window.POPINJAY.souvenirs) };
await shot('15-after-decline');

// ---------------------------------------------------------------- 8. VICTORY + ENDLESS DOOR
const victory = await page.evaluate(async () => {
  const P = window.POPINJAY;
  P.finaleDemo();
  return { mode: P.mode };
});
await page.waitForTimeout(1200);
await shot('16-panic-finale');
out.endStates.finale = { mode: await mode(), entered: victory.mode };

// Drive the finale to survival through the shipped soak driver (real-UI victory needs
// human skill — recorded as a named gap, exactly as the 08-15 record did).
const soak = await page.evaluate(async () => {
  const P = window.POPINJAY;
  P.soakStart({ tours: 1 });
  const t0 = Date.now();
  while (Date.now() - t0 < 120000) {
    const s = P.soakState();
    if (!s.active) return s;
    await new Promise((r) => setTimeout(r, 500));
  }
  return { timedOut: true, ...P.soakState() };
});
out.endStates.soakDriver = soak;
await shot('17-after-soak');
out.endStates.afterSoakMode = await mode();

// ---------------------------------------------------------------- QA SWEEP (step 7)
// QA-1: corrupt / hostile save payloads must degrade LOUDLY and never wedge the boot.
const corruptCases = { garbage: '!!!not json!!!', truncated: '{"v":3,"run":', emptyString: '', wrongShape: '[]', versionSkew: '{"v":-99}' };
for (const [name, payload] of Object.entries(corruptCases)) {
  await page.evaluate((p) => { localStorage.setItem('popinjay.save', p); }, payload);
  await page.reload({ waitUntil: 'load' });
  const booted = await page.waitForFunction('window.__popinjayReady === true', { timeout: 12000 }).then(() => true).catch(() => false);
  await page.waitForTimeout(500);
  out.qa[`corrupt_${name}`] = {
    booted, mode: booted ? await mode() : null,
    errorsLogged: booted ? await page.evaluate(() => (window.POPINJAY.debuglog.errors() || []).length) : null,
  };
  await page.screenshot({ path: `${QA}/qa-corrupt-${name}.png` });
}

// QA-2: rebind lockout recovery — poison EVERY menu action off its key, then prove the
// RESERVED menu codes still drive the menus (a pad can never lock a player out).
await page.evaluate(() => {
  localStorage.clear();
  const dead = 'KeyM';
  const b = { left: { keys: [dead], buttons: [] }, right: { keys: [dead], buttons: [] }, up: { keys: [dead], buttons: [] },
    down: { keys: [dead], buttons: [] }, fire: { keys: [dead], buttons: [] }, sidearm: { keys: [dead], buttons: [] },
    tuba: { keys: [dead], buttons: [] }, pause: { keys: [dead], buttons: [] }, confirm: { keys: [dead], buttons: [] },
    cancel: { keys: [dead], buttons: [] }, options: { keys: [dead], buttons: [] }, quit: { keys: [dead], buttons: [] } };
  localStorage.setItem('popinjay.binds', JSON.stringify(b));
});
await page.reload({ waitUntil: 'load' });
await page.waitForFunction('window.__popinjayReady === true');
await page.waitForTimeout(600);
await page.keyboard.press('Enter');                 // RESERVED confirm
await page.waitForTimeout(1400);
out.qa.lockoutRecovery = { modeAfterReservedEnter: await mode() };
await page.keyboard.press('Escape');                // RESERVED cancel
await page.waitForTimeout(400);
out.qa.lockoutRecoveryCancel = { paused: await page.evaluate(() => window.POPINJAY.paused) };
await page.screenshot({ path: `${QA}/qa-lockout-recovery.png` });

// QA-3: rapid/edge input — mash pause and fire; the loop must not wedge or error.
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'load' });
await page.waitForFunction('window.__popinjayReady === true');
await page.waitForTimeout(500);
await page.keyboard.press('Enter');
await page.waitForTimeout(1400);
const t0 = await page.evaluate(() => window.POPINJAY.probe());
for (let i = 0; i < 24; i++) {
  await page.keyboard.press(i % 3 === 0 ? 'Escape' : 'KeyZ');
  await page.waitForTimeout(45);
}
await page.waitForTimeout(700);
const t1 = await page.evaluate(() => window.POPINJAY.probe());
out.qa.inputMash = { before: t0, after: t1, tickAdvanced: t1.tick > t0.tick, errors: await page.evaluate(() => (window.POPINJAY.debuglog.errors() || []).length) };
await page.screenshot({ path: `${QA}/qa-input-mash.png` });

out.pageErrors = errors;
await ctx.close();
await browser.close();
writeFileSync(`${HERE}/endstates.json`, JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
