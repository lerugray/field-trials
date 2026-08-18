// capture-directions.mjs — the FACING probe.
//
// raid.js picks the party's entry cell on ANY of the four section edges, so a party crosses the
// cutaway leftward, rightward, upward or downward depending on the cycle. cast-data.js states that
// every figure in the pack is drawn FACING RIGHT and is mirrored by the renderer for the other
// facing. This harness captures a replay per cycle and records which way the party actually
// travels, so the sprite's facing can be judged against its direction of travel with the eye
// instead of inferred.
//
// Read-only. Writes only into this evidence directory.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..', '..', '..');
const require = createRequire(join(ROOT, 'node_modules', 'noop.js'));
const { chromium } = require('playwright');

const outDir = join(HERE, 'frames', 'S9-facing-by-direction');
mkdirSync(outDir, { recursive: true });
const fileUrl = 'file://' + join(ROOT, 'dist', 'index.html');

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto(fileUrl);
await page.waitForFunction(() => !!window.__GAME);
const st = () => page.evaluate(() => window.__GAME.state());

await page.keyboard.press('Enter'); // title -> orientation
await page.waitForTimeout(120);
await page.keyboard.press('Enter'); // orientation -> admin
await page.waitForTimeout(120);

// Capture `count` canvas frames every `stride` animation frames, tagged for one cycle's replay.
function burst(tag, count, stride) {
  return page.evaluate(
    async ({ count, stride }) => {
      const cvs = document.getElementById('screen');
      const out = [];
      await new Promise((res) => {
        let n = 0,
          skip = 0;
        function grab() {
          if (skip <= 0) {
            out.push(cvs.toDataURL('image/png'));
            skip = stride - 1;
            n++;
          } else skip--;
          if (n >= count) return res();
          requestAnimationFrame(grab);
        }
        requestAnimationFrame(grab);
      });
      return out;
    },
    { count, stride },
  ).then((pngs) => {
    const dir = join(outDir, tag);
    mkdirSync(dir, { recursive: true });
    pngs.forEach((p, i) =>
      writeFileSync(join(dir, `${String(i).padStart(2, '0')}.png`), Buffer.from(p.split(',')[1], 'base64')),
    );
    return pngs.length;
  });
}

const log = [];
for (let c = 0; c < 9; c++) {
  const s = await st();
  if (s.status !== 'active') break;
  if (s.overlay === 'raid') {
    await page.keyboard.press('Enter');
    await page.waitForTimeout(250);
    continue;
  }
  await page.keyboard.press('Enter'); // checklist
  await page.waitForTimeout(140);
  const p = burst(`cycle-${s.cycle}`, 12, 4);
  await page.waitForTimeout(80);
  await page.keyboard.press('Enter'); // sign over -> replay
  await p;
  const after = await st();
  log.push({ cycle: s.cycle, overlayAfter: after.overlay, cornerstone: after.cornerstone });
  console.log(`cycle ${s.cycle}: overlay ${after.overlay}, cornerstone ${after.cornerstone}`);
  for (let i = 0; i < 14 && (await st()).overlay === 'raid'; i++) await page.waitForTimeout(200);
}
writeFileSync(join(outDir, 'log.json'), JSON.stringify(log, null, 1));
await browser.close();
console.log('done');
