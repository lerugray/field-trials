// Release fix round proof capture — 2026-08-15.
//
// Rebuilds the artifact, opens it at the six battery viewports, saves normal screenshots, and
// measures the actual non-background pixel box for the fill probe. Writes the measurements to a
// JSON file so the report can quote numbers.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';

const pwBase = process.env.PW_PATH;
if (!pwBase) throw new Error('set PW_PATH to the node_modules dir that contains playwright');
const require = createRequire(join(pwBase, 'noop.js'));
const { chromium } = require('playwright');

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'docs', 'proofs', '2026-08-15-release-fixround');
mkdirSync(OUT, { recursive: true });

execFileSync('node', [join(ROOT, 'scripts', 'build-singlefile.mjs')], { cwd: ROOT, stdio: 'inherit' });
const fileUrl = 'file://' + join(ROOT, 'dist', 'index.html');

const VIEWPORTS = [
  { w: 900, h: 600 },
  { w: 1280, h: 800 },
  { w: 1440, h: 812 },
  { w: 1440, h: 900 },
  { w: 1920, h: 1080 },
  { w: 2560, h: 1440 },
];

const browser = await chromium.launch();
const page = await browser.newPage();

async function measureViewport(vp) {
  await page.setViewportSize({ width: vp.w, height: vp.h });
  await page.goto(fileUrl);
  await page.waitForFunction(() => !!window.__GAME);
  await page.waitForTimeout(200);

  const normalName = `2026-08-15-fill-${vp.w}x${vp.h}.png`;
  await page.screenshot({ path: join(OUT, normalName), type: 'png' });

  await page.evaluate(() => {
    document.body.style.background = '#ff00ff';
    document.documentElement.style.background = '#ff00ff';
  });
  await page.waitForTimeout(50);

  const png = await page.screenshot({ type: 'png' });
  const b64 = png.toString('base64');
  const box = await page.evaluate(
    ({ b64, vpW, vpH }) => {
      return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
          const c = document.createElement('canvas');
          c.width = vpW;
          c.height = vpH;
          const ctx = c.getContext('2d');
          ctx.drawImage(img, 0, 0);
          const data = ctx.getImageData(0, 0, vpW, vpH).data;
          let minX = vpW;
          let minY = vpH;
          let maxX = -1;
          let maxY = -1;
          for (let y = 0; y < vpH; y++) {
            for (let x = 0; x < vpW; x++) {
              const o = (y * vpW + x) * 4;
              if (data[o] === 255 && data[o + 1] === 0 && data[o + 2] === 255) continue;
              if (x < minX) minX = x;
              if (x > maxX) maxX = x;
              if (y < minY) minY = y;
              if (y > maxY) maxY = y;
            }
          }
          resolve({ minX, minY, maxX, maxY });
        };
        img.onerror = reject;
        img.src = 'data:image/png;base64,' + b64;
      });
    },
    { b64, vpW: vp.w, vpH: vp.h },
  );

  const boxW = box.maxX - box.minX + 1;
  const boxH = box.maxY - box.minY + 1;
  const scale = boxH / 360;
  return {
    viewport: `${vp.w}x${vp.h}`,
    screenshot: normalName,
    box,
    boxW,
    boxH,
    wPct: Number((boxW / vp.w * 100).toFixed(2)),
    hPct: Number((boxH / vp.h * 100).toFixed(2)),
    minPct: Number((Math.min(boxW, boxH) / Math.min(vp.w, vp.h) * 100).toFixed(2)),
    effectiveBodyPx: Number((11 * scale).toFixed(2)),
  };
}

const results = [];
for (const vp of VIEWPORTS) {
  const m = await measureViewport(vp);
  results.push(m);
  console.log(`${m.viewport}: ${m.boxW}x${m.boxH} (${m.minPct}% limiting), body ${m.effectiveBodyPx}px`);
}

writeFileSync(join(OUT, '2026-08-15-fill-probe.json'), JSON.stringify(results, null, 2));

await browser.close();
console.log('wrote proof captures to', OUT);
