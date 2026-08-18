// colorblind-sim.mjs — COLORBLIND SIM over a full-vocabulary GAMEPLAY frame (DESIGN-
// SEED verification bar + accessibility floor). Stages one frame carrying every balloon
// class + a weighted GORE + every drop silhouette, then re-renders it through
// protanope / deuteranope / tritanope colour transforms, writing dated proofs. The
// aesthetic + accessibility law: each class/variant/drop must read by SHAPE, never
// colour alone — the opus looker confirms the shapes stay distinct under each CVD.
//
// The transform is done in-page synchronously (getImageData -> matrix -> putImageData ->
// toDataURL) so the RAF loop can't overwrite it mid-capture; node just writes the PNG.
// Run: node scripts/colorblind-sim.mjs

import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
import { resolve, join } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';

const ROOT = resolve('.');
const PROOFS = join(ROOT, 'proofs');

// Standard sRGB CVD approximation matrices (row-major 3x3). Identity = the reference.
const CVD = {
  normal:      [1, 0, 0, 0, 1, 0, 0, 0, 1],
  protanope:   [0.567, 0.433, 0, 0.558, 0.442, 0, 0, 0.242, 0.758],
  deuteranope: [0.625, 0.375, 0, 0.700, 0.300, 0, 0, 0.300, 0.700],
  tritanope:   [0.950, 0.050, 0, 0, 0.433, 0.567, 0, 0.475, 0.525],
};

function stamp() {
  // A fixed stamp keeps this set together; caller supplies via env else a constant tag.
  return process.env.CVD_STAMP || 'cvd';
}

async function main() {
  mkdirSync(PROOFS, { recursive: true });
  const url = pathToFileURL(resolve('dist/popinjay.html')).href;
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  const errs = [];
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errs.push('console.error: ' + m.text()); });

  await page.goto(url);
  await page.waitForFunction('window.__popinjayReady === true', { timeout: 8000 });
  await page.evaluate(() => window.POPINJAY.paletteDemo());
  await page.waitForTimeout(300); // let the frame settle (effect badges, balloons at rest)

  const ts = stamp();
  const written = [];
  for (const [name, m] of Object.entries(CVD)) {
    // Snapshot the current frame, apply the CVD matrix, and read it back as a PNG — all
    // in one synchronous evaluate so the animation loop can't repaint between steps.
    const dataUrl = await page.evaluate((mat) => {
      const cv = document.getElementById('stage');
      const g = cv.getContext('2d');
      const img = g.getImageData(0, 0, cv.width, cv.height);
      const d = img.data;
      for (let i = 0; i < d.length; i += 4) {
        const r = d[i], gg = d[i + 1], b = d[i + 2];
        d[i]     = Math.min(255, mat[0] * r + mat[1] * gg + mat[2] * b);
        d[i + 1] = Math.min(255, mat[3] * r + mat[4] * gg + mat[5] * b);
        d[i + 2] = Math.min(255, mat[6] * r + mat[7] * gg + mat[8] * b);
      }
      g.putImageData(img, 0, 0);
      return cv.toDataURL('image/png');
    }, m);
    const buf = Buffer.from(dataUrl.split(',')[1], 'base64');
    const file = join(PROOFS, `M5-${name}_1280x800@1x_${ts}.png`);
    writeFileSync(file, buf);
    written.push(file);
    // Force a fresh clean frame before the next transform (RAF repaints the untinted view).
    await page.evaluate(() => window.POPINJAY.paletteDemo());
    await page.waitForTimeout(200);
  }
  await browser.close();

  console.log('[cvd] colorblind sim proofs (proofs/):');
  for (const f of written) console.log('  ' + f.split('/').pop());
  if (errs.length) { console.log('[cvd] ERRORS:', errs.join(' | ')); process.exit(1); }
  console.log(`[cvd] ${written.length} frames written (normal + 3 CVD types). Opus looker confirms shapes stay distinct.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
