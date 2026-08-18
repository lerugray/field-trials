// photo-analysis.mjs — COMPOSITE PHOTOSENSITIVITY ANALYSIS (DESIGN-SEED verification
// bar + hard rule 11). Drives the SHIPPED dist over file:// through the worst-case
// burst (dynamite cascade + a big chain + the panic galop's closing-bell visuals),
// samples the live canvas luminance every ~50 ms, and measures the composite against
// the 3-flashes-per-second ceiling — a luminance-delta + flash-RATE + flash-AREA test
// binding the composite, not any single effect.
//
// Method (a pragmatic W3C-style transient analysis): each sample downsamples the
// canvas to a luminance grid; a cell "transitions" when its luminance swings by
// >= L_STEP between consecutive samples; a sample is a "flash frame" when the
// transitioning AREA >= AREA_MAX of the field. The flash RATE (flash frames per
// second) must stay <= FLASH_PER_SEC. Localized fading effects (our rings/confetti)
// change only a small area and fade, so the composite passes with margin.
//
// Run: node scripts/photo-analysis.mjs   (exits non-zero if the ceiling is breached)

import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { DYNAMITE, TICK_HZ } from '../src/tuning.js';

const L_STEP = 0.10;        // a cell "transitions" on a >=10% normalized luminance swing
const AREA_MAX = 0.25;      // a sample is a "flash" when >=25% of the field transitions
const FLASH_PER_SEC = 3;    // the ceiling (hard rule 11) the composite must hold
const SAMPLE_MS = 50;       // ~20 samples/s
const DURATION_MS = 4000;   // a 4 s worst-case window
// SUSTAIN cadence = the fastest screen-wide luminance event the GAME can produce: a
// dynamite cascade beat (all balloons split at once). Real chain pops are sequential
// (the wire pops one balloon at a time) and localized (<25% area), so nothing in play
// drives a large-area transition faster than one cascade beat. Modelling the burst at
// this cadence is the HONEST worst case — anything faster is unachievable by mechanics.
const REINJECT_MS = (DYNAMITE.beatTicks / TICK_HZ) * 1000; // 24/60 s = 400 ms (2.5/s)
const GRID_W = 64, GRID_H = 40;

async function main() {
  const url = pathToFileURL(resolve('dist/popinjay.html')).href;
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  const errs = [];
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errs.push('console.error: ' + m.text()); });

  await page.goto(url);
  await page.waitForFunction('window.__popinjayReady === true', { timeout: 8000 });
  await page.evaluate(() => window.focus());
  await page.keyboard.press('Enter');           // a gesture: start a stage (audio may start; irrelevant to luminance)
  await page.waitForTimeout(400);

  // Expose the sampler in-page: downsample the canvas to a luminance grid (0..1 cells).
  await page.evaluate(({ GW, GH }) => {
    const cv = document.getElementById('stage');
    window.__lumaGrid = () => {
      const gctx = cv.getContext('2d');
      const iw = cv.width, ih = cv.height;
      const img = gctx.getImageData(0, 0, iw, ih).data;
      const grid = new Float32Array(GW * GH);
      const cw = iw / GW, ch = ih / GH;
      for (let gy = 0; gy < GH; gy++) for (let gx = 0; gx < GW; gx++) {
        const sx = (gx * cw) | 0, sy = (gy * ch) | 0;
        const o = (sy * iw + sx) * 4;
        // Rec.601 relative luminance, normalized 0..1.
        grid[gy * GW + gx] = (0.299 * img[o] + 0.587 * img[o + 1] + 0.114 * img[o + 2]) / 255;
      }
      return Array.from(grid);
    };
  }, { GW: GRID_W, GH: GRID_H });

  const samples = [];
  let lastInject = 0;
  const start = Date.now();
  while (Date.now() - start < DURATION_MS) {
    const now = Date.now();
    if (now - lastInject >= REINJECT_MS) { await page.evaluate(() => window.POPINJAY.photoBurst()); lastInject = now; }
    const grid = await page.evaluate('window.__lumaGrid()');
    samples.push(grid);
    await page.waitForTimeout(SAMPLE_MS);
  }
  await browser.close();

  // Analyze consecutive samples: transitioning-area per step, flash frames, flash rate.
  const cells = GRID_W * GRID_H;
  let flashFrames = 0, maxArea = 0, sumMeanDelta = 0;
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1], b = samples[i];
    let transitions = 0, meanDelta = 0;
    for (let c = 0; c < cells; c++) { const d = Math.abs(b[c] - a[c]); meanDelta += d; if (d >= L_STEP) transitions++; }
    const area = transitions / cells;
    sumMeanDelta += meanDelta / cells;
    if (area > maxArea) maxArea = area;
    if (area >= AREA_MAX) flashFrames++;
  }
  const elapsedS = (samples.length * SAMPLE_MS) / 1000;
  const flashRate = flashFrames / elapsedS;
  const meanDelta = sumMeanDelta / Math.max(1, samples.length - 1);

  console.log('[photo] composite photosensitivity analysis (worst-case burst)');
  console.log(`[photo]   samples=${samples.length} over ${elapsedS.toFixed(1)}s  grid=${GRID_W}x${GRID_H}`);
  console.log(`[photo]   peak transitioning AREA = ${(maxArea * 100).toFixed(1)}%  (flash threshold ${AREA_MAX * 100}%)`);
  console.log(`[photo]   mean per-frame luminance delta = ${(meanDelta * 100).toFixed(2)}%`);
  console.log(`[photo]   flash FRAMES (area>=${AREA_MAX * 100}%) = ${flashFrames}  ->  flash RATE = ${flashRate.toFixed(2)}/s  (ceiling ${FLASH_PER_SEC}/s)`);

  const pass = flashRate <= FLASH_PER_SEC && errs.length === 0;
  if (errs.length) console.log('[photo]   ERRORS:', errs.join(' | '));
  console.log(`[photo] ${pass ? 'PASS' : 'FAIL'} — the composite ${pass ? 'holds' : 'BREACHES'} the 3/sec ceiling.`);
  if (!pass) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
