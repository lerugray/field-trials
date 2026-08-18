// capture-counters.mjs — the motion-adjacent TRUTH check.
//
// Two things in this build visibly count: a served instrument's deadline ("N cycle(s) left" in the
// ledger's STANDING block) and a works order's lead time ("N cycle(s) remaining" in the pre-commit
// checklist). Both are stated in CYCLES, and the pacing law says the clock only moves when the
// operator signs the cycle over.
//
// So the cadence has two halves, and both are captured here as frames:
//   A. HELD: the ADMIN surface held for 150 consecutive presentation frames. The Cornerstone pulse
//      must keep animating (proving the frame loop is live) while the counter does not move.
//   B. STEPPED: the same counter across successive sign-overs, which must fall by exactly one.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..', '..', '..');
const require = createRequire(join(ROOT, 'node_modules', 'noop.js'));
const { chromium } = require('playwright');

const outDir = join(HERE, 'frames', 'S7-counter-cadence');
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto('file://' + join(ROOT, 'dist', 'index.html'));
await page.waitForFunction(() => !!window.__GAME);
const st = () => page.evaluate(() => window.__GAME.state());
const shot = async (name) => {
  const png = await page.evaluate(() => document.getElementById('screen').toDataURL('image/png'));
  writeFileSync(join(outDir, name), Buffer.from(png.split(',')[1], 'base64'));
};

await page.keyboard.press('Enter');
await page.waitForTimeout(120);
await page.keyboard.press('Enter');
await page.waitForTimeout(120);

// Sign cycles over until an instrument is served, so there is a stated deadline to watch.
const sign = async () => {
  await page.keyboard.press('Enter');
  await page.waitForTimeout(150);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(250);
  for (let i = 0; i < 16 && (await st()).overlay === 'raid'; i++) {
    await page.keyboard.press('Enter');
    await page.waitForTimeout(180);
  }
};
for (let i = 0; i < 9 && (await st()).noticesServed === 0 && (await st()).status === 'active'; i++) await sign();
const served = await st();
console.log('notice served at cycle', served.cycle, 'rung', served.ladderRung, 'served', served.noticesServed);

// --- A. HELD: 150 consecutive presentation frames on the ADMIN surface, nothing touched.
const held = await page.evaluate(async () => {
  const cvs = document.getElementById('screen');
  const out = [];
  await new Promise((res) => {
    let n = 0;
    function grab() {
      // The ledger's STANDING block, where the deadline is printed, plus the pulse's neighbourhood.
      out.push(cvs.toDataURL('image/png'));
      if (++n >= 150) return res();
      requestAnimationFrame(grab);
    }
    requestAnimationFrame(grab);
  });
  return out;
});
const heldDir = join(outDir, 'A-held-150-frames');
mkdirSync(heldDir, { recursive: true });
// Keep the ends and a spread of the middle; the analysis compares the ledger crop of every one.
held.forEach((png, i) => {
  if (i % 10 === 0 || i === held.length - 1)
    writeFileSync(join(heldDir, `${String(i).padStart(3, '0')}.png`), Buffer.from(png.split(',')[1], 'base64'));
});
console.log('held: kept', held.filter((_, i) => i % 10 === 0 || i === held.length - 1).length, 'of 150 frames');

// --- B. STEPPED: the same counter after each sign-over.
const steps = [];
for (let c = 0; c < 4; c++) {
  const s = await st();
  if (s.status !== 'active') break;
  await shot(`B-cycle-${String(s.cycle).padStart(2, '0')}-admin.png`);
  steps.push({ cycle: s.cycle, noticesServed: s.noticesServed, ladderRung: s.ladderRung });
  await sign();
}
writeFileSync(join(outDir, 'stepped.json'), JSON.stringify(steps, null, 1));
console.log('stepped:', JSON.stringify(steps));
await browser.close();
