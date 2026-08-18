// FORK A, ROUND 3 — an UNCONTAMINATED measurement of the controller toast.
//
// Round 2 diffed a frame before the pad connected against one after, and caught the
// pause overlay swapping its key glyphs for pad glyphs: a 392x216 box that measured
// two changes at once. This round connects the pad FIRST and lets the notice expire,
// so every pad-dependent surface is already settled; the only thing that then changes
// between the two grabs is the toast returning. The diff box is therefore the toast.
//
// Run from the repo root:
//   node docs/verification/release-gate-2026-08-18/forks/probe-forks3.mjs

import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../../../..');
const URL = pathToFileURL(resolve(ROOT, 'dist/popinjay.html')).href;

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
await page.goto(URL, { waitUntil: 'load' });
await page.waitForFunction('window.__popinjayReady === true');

await page.keyboard.press('Enter');          // start a run
await page.waitForTimeout(1600);

const result = await page.evaluate(async () => {
  const P = window.POPINJAY;
  const cv = document.querySelector('canvas');
  const g = cv.getContext('2d', { willReadFrequently: true });

  const pad = { index: 0, id: 'Standard Gamepad', mapping: 'standard', connected: true, buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })), axes: [0, 0, 0, 0], timestamp: performance.now() };
  Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => [pad, null, null, null] });
  const ev = new Event('gamepadconnected');
  Object.defineProperty(ev, 'gamepad', { value: pad });
  window.dispatchEvent(ev);
  await new Promise((r) => setTimeout(r, 120));

  // PAUSE while the notice is still up. The pad is ALREADY connected, so the pause
  // overlay is in pad mode for BOTH grabs — the toast expiring is the only difference.
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', key: 'Escape' }));
  window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Escape', key: 'Escape' }));
  await new Promise((r) => setTimeout(r, 350));

  const present = P.present, s = present.scale;
  const grab = () => g.getImageData(present.x, present.y, Math.round(present.native.w * s), Math.round(present.native.h * s));

  const noticeUpAtWith = !!P.controller.notice;
  const withNotice = grab();

  // Let the toast expire; everything else on the paused frame is static.
  for (let i = 0; i < 80 && P.controller.notice; i++) await new Promise((r) => setTimeout(r, 100));
  const noticeGoneAfter = !P.controller.notice;
  await new Promise((r) => setTimeout(r, 400));
  const withoutNotice = grab();

  const w = withNotice.width, h = withNotice.height;
  let minX = 1e9, maxX = -1, minY = 1e9, maxY = -1, changed = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    const d = Math.abs(withNotice.data[i] - withoutNotice.data[i]) + Math.abs(withNotice.data[i + 1] - withoutNotice.data[i + 1]) + Math.abs(withNotice.data[i + 2] - withoutNotice.data[i + 2]);
    if (d > 24) { changed++; if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
  }
  const box = maxX < 0 ? null : {
    x0: +(minX / s).toFixed(1), x1: +(maxX / s).toFixed(1),
    y0: +(minY / s).toFixed(1), y1: +(maxY / s).toFixed(1),
    w: +((maxX - minX + 1) / s).toFixed(1), h: +((maxY - minY + 1) / s).toFixed(1),
  };

  // ALPHA CHECK: at 0.58 the card is see-through, so an interior pixel must be a BLEND
  // of the card and whatever was behind it — never the flat paper colour.
  let blend = null;
  if (box) {
    const ix = Math.round((box.x0 + 8) * s), iy = Math.round((box.y0 + 17) * s);
    const k = (iy * w + ix) * 4;
    blend = { interiorWithNotice: [withNotice.data[k], withNotice.data[k + 1], withNotice.data[k + 2]], interiorWithout: [withoutNotice.data[k], withoutNotice.data[k + 1], withoutNotice.data[k + 2]] };
  }

  return { scale: s, nativeW: present.native.w, nativeH: present.native.h, changedPx: changed, box, blend, noticeUpAtWith, noticeGoneAfter, paused: P.paused };
});

await page.screenshot({ path: `${HERE}/forkA-toast-isolated.png` });
await ctx.close();
await browser.close();

const b = result.box;
const out = {
  head: '968b27b',
  method: 'pad connected + notice expired => baseline; re-fire connect => only the toast differs',
  ...result,
  verdict: b ? {
    rightEdgeAtNativeX472: Math.abs(b.x1 - (result.nativeW - 8 - 1)) <= 3,
    topAtNativeY56: Math.abs(b.y0 - 56) <= 3,
    widthIs220NotBanner320: Math.abs(b.w - 220) <= 8,
    heightIs22NotBanner28: Math.abs(b.h - 22) <= 8,
    clearsPlayerColumn: b.x0 > result.nativeW * 0.4,
    isCornerToastNotCentredBanner: Math.abs(((b.x0 + b.x1) / 2) - result.nativeW / 2) > 40,
  } : { measured: false },
  expected: 'FORK A (Ray): right-corner toast 220x22, right edge native x471, top native y56, alpha 0.58',
};
writeFileSync(`${HERE}/forkA-isolated.json`, JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
