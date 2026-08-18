// GATE 2026-08-18 — STEP 2: cold boot as a stranger, on the SHIPPED artifact via file://.
// Fresh browser context per viewport (no storage carried), never a dev path.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createRequire } from 'node:module';

const ROOT = '/Users/rayweiss/Desktop/Dev Work/material-breach';
const OUT = join(ROOT, 'docs', 'verification', 'release-gate-2026-08-18', 'step2-coldboot');
mkdirSync(OUT, { recursive: true });
const require = createRequire(join(ROOT, 'node_modules', 'noop.js'));
const { chromium } = require('playwright');

const url = 'file://' + join(ROOT, 'dist', 'index.html');
const findings = [];
const note = (level, area, text) => { findings.push({ level, area, text }); console.log(`  ${level.padEnd(8)} ${area}: ${text}`); };

const VIEWPORTS = [
  { w: 900, h: 600, tag: 'small-laptop' },
  { w: 1280, h: 720, tag: 'laptop' },
  { w: 1440, h: 900, tag: 'macbook' },
  { w: 1920, h: 1080, tag: 'desktop' },
  { w: 2560, h: 1440, tag: 'large-desktop' },
];

const browser = await chromium.launch();
const fill = {};

for (const vp of VIEWPORTS) {
  // FRESH CONTEXT = fresh profile: no localStorage, no save, exactly what a stranger gets.
  const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h } });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e && e.message)));
  page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });

  await page.goto(url);
  await page.waitForFunction(() => !!window.__GAME, { timeout: 20000 });
  await page.waitForTimeout(400);

  const s = await page.evaluate(() => window.__GAME.state());
  if (s.overlay !== 'title') note('BLOCKER', `boot@${vp.w}x${vp.h}`, `did not open on the title (overlay=${s.overlay})`);

  await page.screenshot({ path: join(OUT, `title-${vp.w}x${vp.h}.png`) });

  // FILL: measure the real painted box against the viewport, by painting the page ground magenta
  // and finding the non-magenta bounding box. Non-circular: it measures pixels, not the layout math.
  const box = await page.evaluate(async ({ vpW, vpH }) => {
    document.body.style.background = '#ff00ff';
    document.documentElement.style.background = '#ff00ff';
    await new Promise((r) => setTimeout(r, 60));
    const el = document.getElementById('screen');
    const r = el.getBoundingClientRect();
    return { x: r.left, y: r.top, w: r.width, h: r.height, vpW, vpH };
  }, { vpW: vp.w, vpH: vp.h });
  const pct = ((box.w * box.h) / (vp.w * vp.h)) * 100;
  fill[`${vp.w}x${vp.h}`] = { canvasCssBox: box, fillPct: +pct.toFixed(2) };
  if (pct < 60) note('BLOCKER', `fill@${vp.w}x${vp.h}`, `canvas fills only ${pct.toFixed(1)}% of the viewport`);
  else if (pct < 85) note('FRICTION', `fill@${vp.w}x${vp.h}`, `canvas fills ${pct.toFixed(1)}%`);
  else console.log(`  ok       fill@${vp.w}x${vp.h}: ${pct.toFixed(1)}%`);

  // restore ground, then a 3x zoom crop of the title band for the legibility read
  await page.evaluate(() => { document.body.style.background = ''; document.documentElement.style.background = ''; });
  await page.waitForTimeout(80);
  await page.screenshot({
    path: join(OUT, `legibility-${vp.w}x${vp.h}-titleband.png`),
    clip: { x: box.x, y: box.y, width: box.w, height: Math.min(box.h * 0.45, box.h) },
  });

  if (errs.length) note('DEFECT', `errors@${vp.w}x${vp.h}`, errs.slice(0, 4).join(' | '));
  await ctx.close();
}

// ---- The stranger's first two minutes, at one viewport, by REAL MOUSE ----
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(String(e && e.message)));
page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
await page.goto(url);
await page.waitForFunction(() => !!window.__GAME, { timeout: 20000 });
await page.waitForTimeout(300);

const st = () => page.evaluate(() => window.__GAME.state());
async function clickControl(id) {
  const pt = await page.evaluate((id) => {
    const b = (window.__GAME.state().buttons || []).find((b) => b.id === id);
    if (!b) return null;
    const r = document.getElementById('screen').getBoundingClientRect();
    return { x: r.left + (b.x + b.w / 2) * (r.width / 640), y: r.top + (b.y + b.h / 2) * (r.height / 360) };
  }, id);
  if (!pt) return false;
  await page.mouse.click(pt.x, pt.y);
  await page.waitForTimeout(160);
  return true;
}
async function shot(n) { await page.waitForTimeout(140); await page.screenshot({ path: join(OUT, n) }); }

const menu = await page.evaluate(() => (window.__GAME.state().buttons || []).map((b) => b.id));
writeFileSync(join(OUT, 'title-menu-controls.json'), JSON.stringify(menu, null, 2));
console.log('\n  title menu controls:', menu.join(', '));
if (!menu.includes('options')) note('BLOCKER', 'menu', 'no options control on the title');
if (!menu.includes('enter')) note('BLOCKER', 'menu', 'no start control on the title');

await shot('walk-01-title.png');
for (const [id, expect, label] of [
  ['options', 'options', 'options'],
  ['totitle', 'title', 'back from options'],
  ['provenance', 'provenance', 'credits'],
  ['totitle', 'title', 'back from credits'],
]) {
  const clicked = await clickControl(id);
  const now = (await st()).overlay;
  if (!clicked) note('BLOCKER', 'menu', `control '${id}' absent when expected`);
  else if (now !== expect) note('DEFECT', 'menu', `${label}: overlay=${now}, expected ${expect}`);
  else console.log(`  ok       menu: ${label}`);
  if (id === 'options') await shot('walk-02-options.png');
  if (id === 'provenance') await shot('walk-03-provenance.png');
}

// start a session
await clickControl('enter');
await shot('walk-04-after-start.png');
const afterStart = await st();
console.log('  after start overlay:', afterStart.overlay);
await page.keyboard.press('Enter');
await page.waitForTimeout(200);
await shot('walk-05-admin.png');

// PACING LAW on the shipped artifact: 20 real seconds, no input.
const a = await st();
await page.waitForTimeout(20000);
const b = await st();
const drift = {
  cycle: [a.cycle, b.cycle],
  changed: JSON.stringify(a.cycle) !== JSON.stringify(b.cycle),
};
if (drift.changed) note('BLOCKER', 'pacing', `clock advanced with no input: ${a.cycle} -> ${b.cycle}`);
else console.log(`  ok       pacing: 20s of real time advanced nothing (cycle ${a.cycle})`);
await shot('walk-06-after-20s-idle.png');

writeFileSync(join(OUT, 'fill-measured.json'), JSON.stringify(fill, null, 2));
writeFileSync(join(OUT, 'step2-findings.json'), JSON.stringify({ findings, drift, errors: errs, menu }, null, 2));
console.log('\nSTEP2 findings:', findings.length, '| page errors:', errs.length);
await ctx.close();
await browser.close();
