// Release fix round B1/B2 — non-circular fill probe.
//
// The old integer-floor scaler left the 640x360 buffer at 1x on small laptop windows and produced
// letterboxing that an element-box measurement missed (a sibling gate sat green while the playfield
// covered only ~60% of the limiting dimension). This probe screenshots the real viewport, decodes
// the actual pixels in the browser, and measures the non-background bounding box.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SCREEN, CUTAWAY, LEDGER, SECTION_INSET } from '../src/layout.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

let chromium = null;
try {
  ({ chromium } = await import('playwright'));
} catch {
  // Playwright not installed here; the probe skips cleanly.
}

const VIEWPORTS = [
  { w: 900, h: 600 },
  { w: 1280, h: 800 },
  { w: 1440, h: 812 },
  { w: 1440, h: 900 },
  { w: 1920, h: 1080 },
  { w: 2560, h: 1440 },
];

const TEXT_COMPLETENESS_VIEWPORTS = new Set(['1280x800', '1440x900', '2560x1440']);
const TEXT_PANELS = {
  Ledger: LEDGER,
  Legend: {
    x: CUTAWAY.x + 3,
    y: CUTAWAY.y + CUTAWAY.h - SECTION_INSET.bottom + 2,
    w: CUTAWAY.w - 6,
    h: SECTION_INSET.bottom - 4,
  },
  'section header': {
    x: CUTAWAY.x,
    y: CUTAWAY.y,
    w: CUTAWAY.w,
    h: SECTION_INSET.top - 2,
  },
};

function buildIfNeeded() {
  execFileSync('node', [join(ROOT, 'scripts', 'build-singlefile.mjs')], { cwd: ROOT, stdio: 'ignore' });
  return 'file://' + join(ROOT, 'dist', 'index.html');
}

async function measureViewport(page, vp) {
  await page.setViewportSize({ width: vp.w, height: vp.h });
  await page.goto(buildIfNeeded());
  await page.waitForFunction(() => !!window.__GAME);
  await page.waitForTimeout(200);

  // Paint everything outside the canvas a sentinel colour so the probe measures rendered pixels,
  // not the canvas element box.
  await page.evaluate(() => {
    document.body.style.background = '#ff00ff';
    document.documentElement.style.background = '#ff00ff';
  });
  await page.waitForTimeout(50);

  const png = await page.screenshot({ type: 'png' });
  const b64 = png.toString('base64');

  return page.evaluate(
    ({ b64, vpW, vpH, screen, textPanels }) => {
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
              const r = data[o];
              const g = data[o + 1];
              const b = data[o + 2];
              if (r === 255 && g === 0 && b === 255) continue;
              if (x < minX) minX = x;
              if (x > maxX) maxX = x;
              if (y < minY) minY = y;
              if (y > maxY) maxY = y;
            }
          }
          const canvasRect = document.getElementById('screen').getBoundingClientRect();
          const sx = canvasRect.width / screen.w;
          const sy = canvasRect.height / screen.h;
          const presentedTextPanels = Object.fromEntries(
            Object.entries(textPanels).map(([name, panel]) => [
              name,
              {
                left: canvasRect.left + panel.x * sx,
                top: canvasRect.top + panel.y * sy,
                right: canvasRect.left + (panel.x + panel.w) * sx,
                bottom: canvasRect.top + (panel.y + panel.h) * sy,
              },
            ]),
          );
          resolve({ minX, minY, maxX, maxY, presentedTextPanels });
        };
        img.onerror = reject;
        img.src = 'data:image/png;base64,' + b64;
      });
    },
    { b64, vpW: vp.w, vpH: vp.h, screen: SCREEN, textPanels: TEXT_PANELS },
  );
}

test('the playfield fills at least 90% of its constrained viewport axis without cropping text panels (B1)', { skip: chromium ? false : 'playwright unavailable' }, async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  try {
    for (const vp of VIEWPORTS) {
      const box = await measureViewport(page, vp);
      const boxW = box.maxX - box.minX + 1;
      const boxH = box.maxY - box.minY + 1;
      const widthConstrained = vp.w / vp.h <= SCREEN.w / SCREEN.h;
      const constrainedFill = widthConstrained ? boxW / vp.w : boxH / vp.h;
      assert.ok(
        constrainedFill >= 0.9,
        `${vp.w}x${vp.h}: playfield ${boxW}x${boxH} fills only ${(constrainedFill * 100).toFixed(1)}% of the constrained axis`,
      );
      if (TEXT_COMPLETENESS_VIEWPORTS.has(`${vp.w}x${vp.h}`)) {
        for (const [name, panel] of Object.entries(box.presentedTextPanels)) {
          assert.ok(
            panel.left >= 0 && panel.top >= 0 && panel.right <= vp.w && panel.bottom <= vp.h,
            `${vp.w}x${vp.h}: ${name} is cropped (presented box ${panel.left.toFixed(1)},${panel.top.toFixed(1)} to ${panel.right.toFixed(1)},${panel.bottom.toFixed(1)})`,
          );
        }
      }
    }
  } finally {
    await browser.close();
  }
});

test('body copy is at least 11px effective at every battery viewport (B2)', { skip: chromium ? false : 'playwright unavailable' }, async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  try {
    for (const vp of VIEWPORTS) {
      const box = await measureViewport(page, vp);
      const boxH = box.maxY - box.minY + 1;
      const scale = boxH / 360;
      const effective = 11 * scale;
      assert.ok(
        effective >= 11,
        `${vp.w}x${vp.h}: effective body copy is ${effective.toFixed(1)}px`,
      );
    }
  } finally {
    await browser.close();
  }
});
