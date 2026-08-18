// GATE 2026-08-18 — STEP 3 (corrected): mid-tenure save/resume, the CLOSED surface, restart,
// corrupt-save notice. Drives the shipped artifact through the real UI.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const ROOT = '/Users/rayweiss/Desktop/Dev Work/material-breach';
const OUT = join(ROOT, 'docs', 'verification', 'release-gate-2026-08-18', 'step3-endstates');
mkdirSync(OUT, { recursive: true });
const require = createRequire(join(ROOT, 'node_modules', 'noop.js'));
const { chromium } = require('playwright');
const url = 'file://' + join(ROOT, 'dist', 'index.html');

const findings = [];
const note = (l, a, t) => { findings.push({ level: l, area: a, text: t }); console.log(`  ${l.padEnd(8)} ${a}: ${t}`); };
const ok = (a, t) => console.log(`  ok       ${a}: ${t}`);
const record = {};

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(String(e && e.message)));
page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
await page.goto(url);
await page.waitForFunction(() => !!window.__GAME, { timeout: 20000 });

const st = () => page.evaluate(() => window.__GAME.state());
async function click(id) {
  const pt = await page.evaluate((id) => {
    const b = (window.__GAME.state().buttons || []).find((b) => b.id === id);
    if (!b) return null;
    const r = document.getElementById('screen').getBoundingClientRect();
    return { x: r.left + (b.x + b.w / 2) * (r.width / 640), y: r.top + (b.y + b.h / 2) * (r.height / 360) };
  }, id);
  if (!pt) return false;
  await page.mouse.click(pt.x, pt.y);
  await page.waitForTimeout(140);
  return true;
}
const shot = async (n) => { await page.waitForTimeout(130); await page.screenshot({ path: join(OUT, n) }); };
// Advance through any replay/report overlay until we are at a settled surface.
async function settle(maxMs = 12000) {
  const t0 = Date.now();
  while (Date.now() - t0 < maxMs) {
    const s = await st();
    if (s.overlay === 'closed' || s.overlay === null || s.overlay === 'checklist') return s;
    const ids = s.buttons.map((b) => b.id);
    const skip = ids.find((i) => /skip|continue|dismiss|ok/i.test(i));
    if (skip) await click(skip); else await page.keyboard.press('Enter');
    await page.waitForTimeout(220);
  }
  return await st();
}

// ================= A. MID-TENURE SAVE / RESUME =================
await click('enter');
await page.keyboard.press('Enter');
await page.waitForTimeout(250);
for (let i = 0; i < 2; i++) { await page.keyboard.press('Enter'); await page.waitForTimeout(260); await settle(6000); }
const mid = await st();
const savedRaw = await page.evaluate(() => { try { return localStorage.getItem('material-breach:save'); } catch (e) { return 'THREW:' + e.message; } });
record.midTenure = { cycle: mid.cycle, treasury: mid.treasury, cornerstone: mid.cornerstone, status: mid.status };
record.savePresent = !!(savedRaw && !String(savedRaw).startsWith('THREW')) ;
record.saveBytes = savedRaw ? String(savedRaw).length : 0;
console.log(`  mid-tenure cycle ${mid.cycle}, save present=${record.savePresent} (${record.saveBytes} bytes)`);
if (!record.savePresent) note('DEFECT', 'save', 'no autosave written mid-tenure under material-breach:save');
await shot('e10-mid-tenure.png');

await page.reload();
await page.waitForFunction(() => !!window.__GAME, { timeout: 20000 });
await page.waitForTimeout(450);
const onReload = await st();
record.onReload = { overlay: onReload.overlay, resumable: onReload.resumable, buttons: onReload.buttons.map((b) => b.id) };
console.log('  on reload:', JSON.stringify(record.onReload));
await shot('e11-title-resumable.png');
if (!onReload.resumable) note('DEFECT', 'resume', 'a mid-tenure save exists but the title does not offer to resume');
else {
  ok('resume', 'title offers to resume the saved tenure');
  await click('enter'); // 'enter' resumes when resumable (view.js: overlay = resumable ? null : orientation)
  await page.waitForTimeout(350);
  const res = await st();
  record.resumed = { cycle: res.cycle, treasury: res.treasury, cornerstone: res.cornerstone };
  const match = res.cycle === mid.cycle && res.treasury === mid.treasury && res.cornerstone === mid.cornerstone;
  if (!match) note('DEFECT', 'resume', `resumed state differs: before=${JSON.stringify(record.midTenure)} after=${JSON.stringify(record.resumed)}`);
  else ok('resume', `resumed exactly: cycle ${res.cycle}, treasury ${res.treasury}, cornerstone ${res.cornerstone}`);
  await shot('e12-resumed.png');
}

// ================= B. TERMINAL -> THE CLOSED SURFACE =================
let s = await st();
let guard = 0;
while (s.status === 'active' && guard < 150) {
  await page.keyboard.press('Enter');
  await page.waitForTimeout(200);
  s = await st();
  guard++;
}
record.terminalStatus = s.status;
record.terminalCycle = s.cycle;
console.log(`  terminal: ${s.status} at cycle ${s.cycle} (overlay ${s.overlay})`);
const closed = await settle(15000);
record.closedSurface = { overlay: closed.overlay, buttons: closed.buttons.map((b) => b.id), rubric: closed.rubric };
console.log('  CLOSED surface:', JSON.stringify(record.closedSurface.buttons), 'overlay=', closed.overlay);
await shot('e13-closed-surface.png');
if (closed.overlay !== 'closed') note('DEFECT', 'closed', `never settled on the closed surface (overlay=${closed.overlay})`);
else ok('closed', `closed surface reached; rubric.finished=${closed.rubric && closed.rubric.finished}`);
if (closed.rubric && closed.rubric.finished !== true) note('DEFECT', 'rubric', `finished=false at close: ${JSON.stringify(closed.rubric.reasons)}`);

// ================= C. RESTART from the closed surface =================
const restartId = record.closedSurface.buttons.find((i) => /new|restart|again/i.test(i));
if (!restartId) note('BLOCKER', 'restart', `no restart control on the closed surface: ${record.closedSurface.buttons.join(',')}`);
else {
  await click(restartId);
  await page.waitForTimeout(400);
  const after = await settle(8000);
  record.afterRestart = { status: after.status, cycle: after.cycle, overlay: after.overlay, cornerstone: after.cornerstone, treasury: after.treasury };
  console.log('  after restart:', JSON.stringify(record.afterRestart));
  if (after.status !== 'active' || after.cycle !== 1) note('DEFECT', 'restart', `restart left status=${after.status} cycle=${after.cycle}`);
  else ok('restart', `'${restartId}' starts a clean tenure at cycle 1`);
  await shot('e14-after-restart.png');
}

// ================= D. CORRUPT SAVE -> LOUD NOTICE (the 08-15 step-7 fix) =================
await page.evaluate(() => localStorage.setItem('material-breach:save', '{{{ not json'));
await page.reload();
await page.waitForFunction(() => !!window.__GAME, { timeout: 20000 });
await page.waitForTimeout(450);
const corrupt = await st();
record.afterCorrupt = { overlay: corrupt.overlay, resumable: corrupt.resumable, status: corrupt.status, buttons: corrupt.buttons.map((b) => b.id) };
console.log('  after corrupt save:', JSON.stringify(record.afterCorrupt));
await shot('e15-corrupt-save-notice.png');
if (errs.length) note('DEFECT', 'corrupt', `errors after corrupt save: ${errs.slice(0, 3).join(' | ')}`);
else ok('corrupt', 'corrupt save handled without throwing');

// ================= E. QUIT =================
const q = await page.evaluate(() => { try { window.__GAME.quit(); return true; } catch (e) { return String(e && e.message); } });
record.quit = q;
if (q !== true) note('DEFECT', 'quit', `quit() threw: ${q}`); else ok('quit', 'clean teardown');

writeFileSync(join(OUT, 'step3-endstate.json'), JSON.stringify({ record, findings, errors: errs }, null, 2));
console.log('\nfindings:', findings.length, '| page errors:', errs.length);
await ctx.close();
await browser.close();
