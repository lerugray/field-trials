// capture-proof-m2.mjs — M2 proof: carving and departments, driven from file:// with a real
// browser and real mouse. Saves dated screenshots. Run like capture-proof.mjs (PW_PATH set).
import { mkdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { cutawayGeometry } from '../src/layout.js';

const pwBase = process.env.PW_PATH;
if (!pwBase) throw new Error('set PW_PATH to the node_modules dir that contains playwright');
const require = createRequire(join(pwBase, 'noop.js'));
const { chromium } = require('playwright');

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = process.argv[2] || join(ROOT, 'docs', 'proofs', 'shots-m2');
mkdirSync(outDir, { recursive: true });
const fileUrl = 'file://' + join(ROOT, 'dist', 'index.html');

const geo = cutawayGeometry({ cols: 24, rows: 16 }, { x: 0, y: 0 });
const CENTRE = { x: 12, y: 8 };

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto(fileUrl);
await page.waitForFunction(() => !!window.__GAME);

async function shot(name) {
  await page.waitForTimeout(160);
  await page.screenshot({ path: join(outDir, name) });
  console.log('captured', name);
}

// Map a grid cell centre to client coords through the real canvas rectangle.
async function clickCell(gx, gy) {
  const bx = geo.ox + gx * geo.cell + geo.cell / 2;
  const by = geo.oy + gy * geo.cell + geo.cell / 2;
  const c = await page.evaluate(
    ({ bx, by }) => {
      const r = document.getElementById('screen').getBoundingClientRect();
      return { x: r.left + bx * (r.width / 640), y: r.top + by * (r.height / 360) };
    },
    { bx, by },
  );
  await page.mouse.click(c.x, c.y);
}

await page.keyboard.press('Enter'); // dismiss orientation
await shot('01-admin-grid.png');

// Carve a ring of cells beside the claimed footprint (real mouse clicks, Excavate tool default).
for (const [dx, dy] of [[2, 0], [0, 2], [-2, 0], [0, -2]]) {
  await clickCell(CENTRE.x + dx, CENTRE.y + dy);
}
await shot('02-excavation-queued.png');

// Sign a few cycles so the works orders complete and claim spreads.
for (let i = 0; i < 3; i++) {
  await page.keyboard.press('Enter'); // checklist
  await page.keyboard.press('Enter'); // confirm
  await page.waitForTimeout(60);
}
await shot('03-carved-and-claimed.png');

// Switch the tool to a department and designate claimed floor (press T once -> Treasury).
await page.keyboard.press('t');
await clickCell(CENTRE.x + 2, CENTRE.y);
await clickCell(CENTRE.x + 1, CENTRE.y);
await shot('04-department-designated.png');

await page.keyboard.press('Enter');
await page.keyboard.press('Enter');
await shot('05-after-action.png');

await browser.close();
