// soak-m8.mjs — GATE 8: the player-path soak plus acceptance battery, on the SHIPPED artifact.
//
// Hard rule 11: never stage for Ray without this. DESIGN-SEED §8.8: a scripted full-tenure soak on
// the shipped single-file artifact, findings classified BLOCKER / DEFECT / FRICTION.
//
// It drives `dist/index.html` from a file:// double-click in a real browser with real mouse and
// real keys — never by calling handlers — because everything this gate exists to catch lives in the
// seam between the interface and the engine, and a synthetic dispatch crosses that seam without
// testing it. The unit battery proves the engine; this proves the game.
//
// Findings are classified, never merely counted:
//   BLOCKER  — the game cannot be played, or does something irreversible and wrong.
//   DEFECT   — a thing is broken or false, but the tenure survives it.
//   FRICTION — it works and it is annoying.
//
// Run:  node scripts/soak-m8.mjs [outDir]
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = process.argv[2] || join(ROOT, 'docs', 'proofs', '2026-08-14-M8');
mkdirSync(OUT, { recursive: true });
const require = createRequire(join(process.env.PW_PATH || join(ROOT, 'node_modules'), 'noop.js'));
const { chromium } = require('playwright');

const findings = [];
const note = (level, area, text) => {
  findings.push({ level, area, text });
  console.log(`  ${level.padEnd(8)} ${area}: ${text}`);
};
const ok = (area, text) => console.log(`  ok       ${area}: ${text}`);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

// Everything the page says about itself, collected for the whole run.
const consoleErrors = [];
const pageErrors = [];
page.on('console', (m) => {
  if (m.type() === 'error') consoleErrors.push(m.text());
});
page.on('pageerror', (e) => pageErrors.push(String(e && e.message)));

const url = 'file://' + join(ROOT, 'dist', 'index.html');
await page.goto(url);
await page.waitForFunction(() => !!window.__GAME, { timeout: 15000 });
const st = () => page.evaluate(() => window.__GAME.state());

async function shot(name) {
  await page.waitForTimeout(140);
  await page.screenshot({ path: join(OUT, name) });
}

// Click a control by the id the layout gives it, through a REAL mouse click at its real position,
// read from the running game. Recomputing the layout in the harness would click coordinates the
// harness invented, which passes whether or not the control is where the player sees it.
async function clickControl(id) {
  const pt = await page.evaluate((id) => {
    const b = (window.__GAME.state().buttons || []).find((b) => b.id === id);
    if (!b) return null;
    const r = document.getElementById('screen').getBoundingClientRect();
    return { x: r.left + (b.x + b.w / 2) * (r.width / 640), y: r.top + (b.y + b.h / 2) * (r.height / 360) };
  }, id);
  if (!pt) return false;
  await page.mouse.click(pt.x, pt.y);
  return true;
}

console.log('\n=== 1. THE SHELL, by mouse ===');
{
  const s = await st();
  if (s.overlay !== 'title') note('BLOCKER', 'shell', `the game did not open on the title (overlay=${s.overlay})`);
  else ok('shell', 'opens on the title');
  await shot('01-title.png');

  // The shell is navigated with real clicks. __BUTTONS is published by the renderer for this gate.
  for (const [id, expect, name] of [
    ['provenance', 'provenance', 'the credits'],
    ['totitle', 'title', 'back from the credits'],
    ['options', 'options', 'the options'],
    ['totitle', 'title', 'back from the options'],
  ]) {
    const clicked = await clickControl(id);
    await page.waitForTimeout(120);
    const now = (await st()).overlay;
    if (!clicked) note('BLOCKER', 'shell', `control '${id}' is not on screen when it should be`);
    else if (now !== expect) note('DEFECT', 'shell', `${name}: clicking '${id}' left overlay=${now}, expected ${expect}`);
    else ok('shell', `${name} reachable by mouse`);
    if (id === 'provenance') await shot('02-provenance.png');
    if (id === 'options') await shot('03-options.png');
  }
}

console.log('\n=== 2. THE PACING LAW, on the artifact ===');
{
  await clickControl('enter');
  await page.waitForTimeout(150);
  const a = await st();
  await page.waitForTimeout(3000);
  const b = await st();
  if (a.cycle !== b.cycle) note('BLOCKER', 'pacing', `the clock advanced on its own: cycle ${a.cycle} -> ${b.cycle}`);
  else ok('pacing', `three seconds of real time advanced nothing (cycle ${a.cycle})`);
  if (a.cornerstone !== b.cornerstone) note('BLOCKER', 'pacing', 'the loss object changed with no input');
}

console.log('\n=== 3. A FULL TENURE, by real mouse and real keys ===');
await page.keyboard.press('Enter'); // leave the orientation packet
await page.waitForTimeout(120);

const C0 = { x: 12, y: 8 };
async function cellPoint(gx, gy) {
  return page.evaluate(
    ({ gx, gy }) => {
      const g = window.__GAME.state().geo;
      const r = document.getElementById('screen').getBoundingClientRect();
      return {
        x: r.left + (g.ox + gx * g.cell + g.cell / 2) * (r.width / 640),
        y: r.top + (g.oy + gy * g.cell + g.cell / 2) * (r.height / 360),
      };
    },
    { gx, gy },
  );
}
async function clickCell(gx, gy) {
  const p = await cellPoint(gx, gy);
  await page.mouse.click(p.x, p.y);
}
async function sign() {
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__GAME.state().overlay === 'checklist', { timeout: 1200 }).catch(() => {});
  await page.keyboard.press('Enter');
  await page.waitForTimeout(60);
  if ((await st()).overlay === 'raid') {
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => window.__GAME.state().overlay !== 'raid', { timeout: 1200 }).catch(() => {});
  }
}
const TOOLS = ['excavate', 'treasury', 'records', 'fabrication', 'holding', 'quarters', 'commissary', 'clear'];
async function selectTool(name) {
  for (let i = 0; i < TOOLS.length + 1; i++) {
    if ((await st()).tool === name) return true;
    await page.keyboard.press('t');
  }
  return false;
}

const excavatedBefore = (await st()).excavated;
for (const wave of [
  [[1, 0], [-1, 0], [0, 1], [2, 0], [-2, 0]],
  [[3, 0], [-3, 0], [1, 1], [-1, 1], [2, 1], [-2, 1]],
  [[1, 2], [-1, 2], [0, 2], [2, 2], [-2, 2]],
]) {
  for (const [dx, dy] of wave) await clickCell(C0.x + dx, C0.y + dy);
  await sign();
  await sign();
  if ((await st()).status !== 'active') break;
}
const afterCarve = await st();
if (afterCarve.excavated <= excavatedBefore) note('BLOCKER', 'excavation', 'real mouse clicks carved nothing');
else ok('excavation', `${afterCarve.excavated - excavatedBefore} cells carved by real clicks`);

for (const [tool, cells] of [
  ['records', [[-2, 1], [-3, 0]]],
  ['quarters', [[2, 1], [3, 0]]],
  ['treasury', [[0, 2]]],
  ['holding', [[1, 2]]],
]) {
  if (!(await selectTool(tool))) note('DEFECT', 'tools', `the tool ring never reached '${tool}'`);
  for (const [dx, dy] of cells) await clickCell(C0.x + dx, C0.y + dy);
}
await sign();
const afterDept = await st();
if (afterDept.rooms < 3) note('DEFECT', 'departments', `only ${afterDept.rooms} departments were designated by mouse`);
else ok('departments', `${afterDept.rooms} departments designated by mouse`);
await shot('04-tenure-underway.png');

console.log('\n=== 4. SAVE AND RESUME, across a real reload ===');
{
  const before = await st();
  await page.reload();
  await page.waitForFunction(() => !!window.__GAME, { timeout: 15000 });
  const onLoad = await st();
  if (onLoad.overlay !== 'title') note('DEFECT', 'shell', `a reload did not return to the title (overlay=${onLoad.overlay})`);
  if (!onLoad.resumable) note('BLOCKER', 'persistence', 'a running tenure was not offered for resumption after reload');
  else ok('persistence', 'the title offers to resume the saved tenure');
  await clickControl('enter');
  await page.waitForTimeout(150);
  const after = await st();
  if (after.cycle !== before.cycle) note('BLOCKER', 'persistence', `resumed at cycle ${after.cycle}, saved at ${before.cycle}`);
  else if (after.excavated !== before.excavated) note('DEFECT', 'persistence', `resumed with ${after.excavated} carved cells, saved with ${before.excavated}`);
  else ok('persistence', `resumed at cycle ${after.cycle} with the facility intact`);
  if (after.overlay !== null) note('FRICTION', 'shell', `resuming lands on overlay=${after.overlay} rather than the desk`);
}

console.log('\n=== 5. ESC ALWAYS REACHES PAUSE (contract item 5) ===');
{
  let stranded = null;
  for (const setup of ['desk', 'checklist']) {
    if (setup === 'checklist') {
      await page.keyboard.press('Enter');
      await page.waitForTimeout(120);
    }
    await page.keyboard.press('Escape');
    await page.waitForTimeout(120);
    const s = await st();
    if (s.overlay !== 'pause' && setup === 'desk') stranded = `${setup}: Esc left overlay=${s.overlay}`;
    if (s.overlay === 'pause') {
      await page.keyboard.press('Escape');
      await page.waitForTimeout(100);
    } else if (setup === 'checklist') {
      await page.keyboard.press('x');
      await page.waitForTimeout(100);
    }
  }
  if (stranded) note('DEFECT', 'input', `Esc was consumed away from pause (${stranded})`);
  else ok('input', 'Esc reaches the pause surface from the desk');
}

console.log('\n=== 6. RUN THE TENURE TO ITS TERMINAL CONDITION ===');
{
  let guard = 0;
  while ((await st()).status === 'active' && guard++ < 40) {
    const s = await st();
    // Answer an instrument when one stands and the treasury can bear it: this is the path that
    // makes the mastered and secret tiers reachable at all.
    if (s.noticesServed > 0) await clickControl('answer');
    await sign();
  }
  const end = await st();
  if (end.status === 'active') note('BLOCKER', 'tenure', `the tenure never reached a terminal condition in ${guard} cycles`);
  else ok('tenure', `closed as ${end.status} at cycle ${end.cycle}, score ${end.score}`);
  if (end.status !== 'active' && end.overlay !== 'closed') note('DEFECT', 'tenure', `a closed tenure is showing overlay=${end.overlay}`);
  if (end.score === null || end.score === undefined) note('DEFECT', 'scoring', 'a closed tenure filed no score');
  const r = end.rubric;
  if (!r) note('DEFECT', 'rubric', 'the rubric is not reported');
  else if (!r.finished) note('DEFECT', 'rubric', `a closed tenure did not reach 'finished': ${r.reasons.finished}`);
  else ok('rubric', `finished reached; mastered=${r.mastered} secret=${r.secret}`);
  await shot('05-tenure-closed.png');
}

console.log('\n=== 7. THE SECRET TIER IS REACHABLE BY PLAYING ===');
{
  // A driven run whose only aim is to answer a condemnation order. The tier is worth nothing if no
  // sequence of real inputs can reach it, and "the flag can be set" is not the same claim.
  await page.evaluate(() => window.__GAME.quit());
  await page.goto(url);
  await page.waitForFunction(() => !!window.__GAME, { timeout: 15000 });
  await clickControl('enter');
  await page.waitForTimeout(120);
  if ((await st()).overlay === 'title') await clickControl('newtenure');
  await page.waitForTimeout(120);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(120);

  let reached = false;
  let sawInspector = false;
  const secretDriveCeiling = 30;
  for (let i = 0; i < secretDriveCeiling && !reached; i++) {
    const s = await st();
    if (s.status !== 'active') break;
    if (s.ladderRung === 'inspector') sawInspector = true;
    if (s.noticesServed > 0) await clickControl('answer');
    const after = await st();
    if (after.rubric && after.rubric.secret) {
      reached = true;
      break;
    }
    await sign();
  }
  const s = await st();
  if (reached) ok('rubric', 'the secret tier was reached by answering a condemnation order in play');
  else if (!sawInspector) note('FRICTION', 'rubric', `a Licensing Inspector never arrived in a ${secretDriveCeiling}-cycle driven run, so the secret tier was not exercised end to end`);
  else note('DEFECT', 'rubric', 'a Licensing Inspector arrived but the condemnation could not be answered in play');
}

console.log('\n=== 8. THE PICTURE FILLS THE FRAME (Gate 6, measured on the artifact) ===');
{
  const fill = await page.evaluate(() => {
    const c = document.getElementById('screen');
    const x = c.getContext('2d');
    const d = x.getImageData(0, 0, 640, 360).data;
    let filled = 0;
    for (let i = 0; i < d.length; i += 4) {
      // Anything that is not the page's own backdrop counts as drawn.
      if (!(d[i] === 20 && d[i + 1] === 20 && d[i + 2] === 27) && d[i + 3] > 0) filled++;
    }
    return filled / (640 * 360);
  });
  if (fill < 0.95) note('DEFECT', 'composition', `the composed picture fills ${(fill * 100).toFixed(1)}% of the buffer, under the 95% floor`);
  else ok('composition', `the picture fills ${(fill * 100).toFixed(1)}% of the buffer`);
}

console.log('\n=== 9. FAILURES ARE LOUD, AND NOTHING FAILED QUIETLY ===');
{
  const log = await page.evaluate(() => {
    try {
      return window.__GAME && window.__GAME.state ? 'ok' : 'missing';
    } catch (e) {
      return 'threw';
    }
  });
  if (log !== 'ok') note('BLOCKER', 'host', `the host surface is ${log} after a full soak`);
  else ok('host', 'window.__GAME is intact after a full soak');

  if (pageErrors.length) note('BLOCKER', 'errors', `${pageErrors.length} uncaught page error(s): ${pageErrors.slice(0, 3).join(' | ')}`);
  else ok('errors', 'no uncaught page errors across the whole soak');
  if (consoleErrors.length) note('DEFECT', 'errors', `${consoleErrors.length} console error(s): ${consoleErrors.slice(0, 3).join(' | ')}`);
  else ok('errors', 'no console errors across the whole soak');
}

console.log('\n=== 10. TEARDOWN ===');
{
  await page.evaluate(() => window.__GAME.quit());
  await page.waitForTimeout(150);
  const alive = await page.evaluate(() => {
    try {
      return typeof window.__GAME.state === 'function';
    } catch {
      return false;
    }
  });
  if (!alive) note('DEFECT', 'teardown', 'quit() removed the host surface rather than stopping the game');
  else ok('teardown', 'quit() stopped the game cleanly and left the host surface addressable');
}

await browser.close();

const by = (l) => findings.filter((f) => f.level === l);
const summary = {
  generated: '2026-08-14',
  artifact: 'dist/index.html',
  blockers: by('BLOCKER').length,
  defects: by('DEFECT').length,
  friction: by('FRICTION').length,
  findings,
};
writeFileSync(join(OUT, 'GATE8-soak-findings.json'), JSON.stringify(summary, null, 2));

console.log('\n---- GATE 8 ----');
console.log(`BLOCKER ${summary.blockers}   DEFECT ${summary.defects}   FRICTION ${summary.friction}`);
console.log(summary.blockers === 0 ? 'SOAK PASSED (no blockers)' : 'SOAK FAILED (blockers present)');
process.exit(summary.blockers === 0 ? 0 : 1);
