// capture-proof-m3.mjs — M3 proof: departments open posts and rooms attract applicants. Driven
// from file:// with a real browser and real mouse. Run like the other capture scripts (PW_PATH set).
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
const outDir = process.argv[2] || join(ROOT, 'docs', 'proofs', 'shots-m3');
mkdirSync(outDir, { recursive: true });
const fileUrl = 'file://' + join(ROOT, 'dist', 'index.html');

const geo = cutawayGeometry({ cols: 24, rows: 16 }, { x: 0, y: 0 });
const C = { x: 12, y: 8 };

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto(fileUrl);
await page.waitForFunction(() => !!window.__GAME);

async function shot(name) {
  await page.waitForTimeout(160);
  await page.screenshot({ path: join(outDir, name) });
  console.log('captured', name);
}
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
async function sign() {
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(60);
}

await page.keyboard.press('Enter'); // dismiss orientation

// Carve a spread of cells around the footprint (each is adjacent to claimed ground).
for (const [gx, gy] of [[14, 8], [10, 8], [12, 6], [12, 10], [13, 9], [11, 7]]) {
  await clickCell(gx, gy);
}
await sign(); // carve + claim
await shot('01-carved-and-claimed.png');

// Designate two Records tiles (clerk posts) and three Quarters tiles (beds). Tool order:
// excavate, treasury, records, fabrication, holding, quarters, commissary, clear.
await page.keyboard.press('t'); // treasury
await page.keyboard.press('t'); // records
await clickCell(14, 8);
await clickCell(13, 9);
for (let i = 0; i < 3; i++) await page.keyboard.press('t'); // fabrication, holding, quarters
await clickCell(10, 8);
await clickCell(12, 10);
await clickCell(11, 7);
await shot('02-departments-records-quarters.png');

// Sign cycles: applicants report to the open clerk post against the free beds.
for (let i = 0; i < 6; i++) await sign();
await shot('03-applicant-hired.png');

await browser.close();
