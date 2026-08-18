// capture-proof-m4.mjs — M4 proof: the intel memo, the watchable raid replay on the cutaway, and
// the after-action report. Driven from file:// with a real browser. Run with PW_PATH set.
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
const outDir = process.argv[2] || join(ROOT, 'docs', 'proofs', 'shots-m4');
mkdirSync(outDir, { recursive: true });
const fileUrl = 'file://' + join(ROOT, 'dist', 'index.html');

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto(fileUrl);
await page.waitForFunction(() => !!window.__GAME);

async function shot(name) {
  await page.waitForTimeout(120);
  await page.screenshot({ path: join(outDir, name) });
  console.log('captured', name);
}

await page.keyboard.press('Enter'); // dismiss orientation

// Hover the Cornerstone so the plain-language cell label shows (LEGIBILITY LAW).
const geo = cutawayGeometry({ cols: 24, rows: 16 }, { x: 0, y: 0 });
const bx = geo.ox + 12 * geo.cell + geo.cell / 2;
const by = geo.oy + 8 * geo.cell + geo.cell / 2;
const cc = await page.evaluate(
  ({ bx, by }) => {
    const r = document.getElementById('screen').getBoundingClientRect();
    return { x: r.left + bx * (r.width / 640), y: r.top + by * (r.height / 360) };
  },
  { bx, by },
);
await page.mouse.move(cc.x, cc.y);
await shot('01-admin-intel-memo.png'); // the INTEL line previews the coming raid; legend + hover label show

// Sign the cycle over: checklist, then confirm -> the watchable raid replay begins.
await page.keyboard.press('Enter'); // checklist
await page.keyboard.press('Enter'); // confirm -> raid overlay
await page.waitForFunction(() => window.__GAME.state().overlay === 'raid', { timeout: 2000 }).catch(() => {});
await page.waitForTimeout(350); // let the party advance partway across the section
await shot('02-raid-replay.png');

// Continue past the replay to the after-action report.
await page.keyboard.press('Enter');
await page.waitForFunction(() => window.__GAME.state().overlay !== 'raid', { timeout: 2000 }).catch(() => {});
await shot('03-after-action-report.png');

await browser.close();
