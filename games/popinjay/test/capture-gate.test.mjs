// capture-gate.test.mjs — the rewritten screen-fill gate must measure the actual
// presented playfield from pixels, and it must FAIL the old integer-letterbox scaler.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { measurePresentBox, computeFill, FILL_THRESHOLD, PAGE_BG } from '../scripts/fill-measure.mjs';

function makeImage({ w, h, box }) {
  const bg = { r: 28, g: 25, b: 22 };
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = bg.r; data[i + 1] = bg.g; data[i + 2] = bg.b; data[i + 3] = 255;
  }
  if (box) {
    for (let y = box.y; y < box.y + box.h && y < h; y++) {
      for (let x = box.x; x < box.x + box.w && x < w; x++) {
        const i = (y * w + x) * 4;
        data[i] = 200; data[i + 1] = 190; data[i + 2] = 180; // clearly not background
      }
    }
  }
  return { data, width: w, height: h };
}

test('measurePresentBox bounds the non-background playfield', () => {
  const vp = { w: 1280, h: 800 };
  // Old integer scaler: 2× native, centred, leaving large letterbox bars.
  const box = { x: 160, y: 100, w: 960, h: 600 };
  const img = makeImage({ w: vp.w, h: vp.h, box });
  const measured = measurePresentBox(img, PAGE_BG);
  assert.equal(measured.x, box.x);
  assert.equal(measured.y, box.y);
  assert.equal(measured.w, box.w);
  assert.equal(measured.h, box.h);
});

test('the fill gate rejects the old integer-letterbox scaler at 1280x800', () => {
  const vp = { w: 1280, h: 800 };
  const img = makeImage({ w: vp.w, h: vp.h, box: { x: 160, y: 100, w: 960, h: 600 } });
  const fill = computeFill(measurePresentBox(img, PAGE_BG), vp.w, vp.h);
  assert.ok(fill.fill < FILL_THRESHOLD, `old scaler fill ${(fill.fill * 100).toFixed(1)}% should fail ${FILL_THRESHOLD * 100}%`);
});

test('the fill gate accepts a best-fit fractional scaler that fills the viewport', () => {
  const vp = { w: 1280, h: 800 };
  // Best-fit fractional: about 2.67×, so the playfield nearly fills the viewport.
  const box = { x: 0, y: 8, w: 1280, h: 784 };
  const img = makeImage({ w: vp.w, h: vp.h, box });
  const fill = computeFill(measurePresentBox(img, PAGE_BG), vp.w, vp.h);
  assert.ok(fill.fill >= FILL_THRESHOLD, `best-fit fill ${(fill.fill * 100).toFixed(1)}% should pass`);
});

test('a full-screen frame passes the fill gate', () => {
  const vp = { w: 1440, h: 900 };
  const img = makeImage({ w: vp.w, h: vp.h, box: { x: 0, y: 0, w: vp.w, h: vp.h } });
  const fill = computeFill(measurePresentBox(img, PAGE_BG), vp.w, vp.h);
  assert.equal(fill.fill, 1);
});
