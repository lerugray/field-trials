// recon.mjs — read-only reconnaissance of MATERIAL BREACH's shipped dist for the STEP 4 motion
// lane. Drives the real build with real input and prints what state it reaches, so the capture
// harness clicks real controls instead of coordinates it invented.
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const require = createRequire(join(ROOT, 'node_modules', 'noop.js'));
const { chromium } = require('playwright');

const fileUrl = 'file://' + join(ROOT, 'dist', 'index.html');
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
await page.goto(fileUrl);
await page.waitForFunction(() => !!window.__GAME);

const st = () => page.evaluate(() => window.__GAME.state());

console.log('boot state:', JSON.stringify(await st(), null, 1).slice(0, 1200));

// Where a grid cell sits on screen right now (camera frames the built facility, so read it live).
async function cellPoint(gx, gy) {
  return page.evaluate(
    ({ gx, gy }) => {
      const g = window.__GAME.state().geo;
      const bx = g.ox + gx * g.cell + g.cell / 2;
      const by = g.oy + gy * g.cell + g.cell / 2;
      const r = document.getElementById('screen').getBoundingClientRect();
      return { x: r.left + bx * (r.width / 640), y: r.top + by * (r.height / 360) };
    },
    { gx, gy },
  );
}
async function clickCell(gx, gy) {
  const c = await cellPoint(gx, gy);
  await page.mouse.click(c.x, c.y);
}

const s0 = await st();
console.log('buttons:', s0.buttons.map((b) => b.id).join(', '));

// Carve a few cells and sign a cycle over, watching the overlay chain.
await clickCell(12, 8);
await clickCell(13, 8);
await clickCell(14, 8);
console.log('after 3 carves:', JSON.stringify(await st()).slice(0, 400));

await page.keyboard.press('Enter');
await page.waitForTimeout(120);
console.log('after 1st Enter, overlay =', (await st()).overlay);
await page.keyboard.press('Enter');
await page.waitForTimeout(120);
console.log('after 2nd Enter, overlay =', (await st()).overlay, 'cycle =', (await st()).cycle);

// Push several cycles to find the first raid that produces a watchable replay.
for (let i = 0; i < 14; i++) {
  const before = await st();
  await page.keyboard.press('Enter');
  await page.waitForTimeout(90);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(200);
  const s = await st();
  console.log(
    `cycle ${before.cycle} -> ${s.cycle}  overlay=${s.overlay}  cornerstone=${s.cornerstone}  rung=${s.ladderRung}  notices=${s.noticesServed}`,
  );
  if (s.overlay === 'raid') {
    console.log('  >>> WATCHABLE REPLAY entered at cycle', s.cycle);
    await page.waitForTimeout(2500);
    console.log('  after dwell, overlay =', (await st()).overlay);
  }
  if (s.status !== 'active') {
    console.log('  tenure closed:', s.status);
    break;
  }
}

await browser.close();
