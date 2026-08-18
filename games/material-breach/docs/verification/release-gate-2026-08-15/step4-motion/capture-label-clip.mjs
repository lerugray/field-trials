// capture-label-clip.mjs — measure the "strength N" head label against the section's clip edges.
//
// render.js draws the replay's head label at a FIXED offset from the party's head cell
// (px + 12, py - 18) inside a clip rect set to the section drawing. When a party enters on the
// right or top edge, the label is drawn partly outside that rect and is cut mid-word — including
// the number, which is the only strength readout the replay has.
//
// This captures the first 40 consecutive presentation frames of each cycle's replay at stride 1,
// so the duration of any clipped state can be counted in real frames rather than estimated.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..', '..', '..');
const require = createRequire(join(ROOT, 'node_modules', 'noop.js'));
const { chromium } = require('playwright');

const outDir = join(HERE, 'frames', 'S10-label-clip');
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto('file://' + join(ROOT, 'dist', 'index.html'));
await page.waitForFunction(() => !!window.__GAME);
const st = () => page.evaluate(() => window.__GAME.state());
await page.keyboard.press('Enter');
await page.waitForTimeout(120);
await page.keyboard.press('Enter');
await page.waitForTimeout(120);

for (let c = 0; c < 8; c++) {
  const s = await st();
  if (s.status !== 'active') break;
  if (s.overlay === 'raid') {
    await page.keyboard.press('Enter');
    await page.waitForTimeout(250);
    continue;
  }
  await page.keyboard.press('Enter');
  await page.waitForTimeout(140);
  const p = page.evaluate(async () => {
    const cvs = document.getElementById('screen');
    const out = [];
    await new Promise((res) => {
      let n = 0;
      function grab() {
        out.push(cvs.toDataURL('image/png'));
        if (++n >= 40) return res();
        requestAnimationFrame(grab);
      }
      requestAnimationFrame(grab);
    });
    return out;
  });
  await page.waitForTimeout(70);
  await page.keyboard.press('Enter'); // sign over
  const pngs = await p;
  const dir = join(outDir, `cycle-${s.cycle}`);
  mkdirSync(dir, { recursive: true });
  pngs.forEach((png, i) =>
    writeFileSync(join(dir, `${String(i).padStart(2, '0')}.png`), Buffer.from(png.split(',')[1], 'base64')),
  );
  console.log(`cycle ${s.cycle}: 40 consecutive frames`);
  for (let i = 0; i < 14 && (await st()).overlay === 'raid'; i++) await page.waitForTimeout(200);
}
await browser.close();
