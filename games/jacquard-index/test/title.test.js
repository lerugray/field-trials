import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Framebuffer } from '../src/gfx/framebuffer.js';
import { composeTitle, drawPrompt, titleLayout, HOUSE_NAME } from '../src/scenes/title.js';

// Count how many pixels differ from a reference color (used to prove the frame is a
// composed picture, not a flat fill).
function distinctColors(fb) {
  const seen = new Set();
  const d = fb.data;
  for (let i = 0; i < d.length; i += 4) {
    seen.add((d[i] << 24) | (d[i + 1] << 16) | (d[i + 2] << 8) | d[i + 3]);
  }
  return seen.size;
}

test('composeTitle fills the whole frame opaque (no transparent gaps)', () => {
  const fb = new Framebuffer(320, 180);
  composeTitle(fb);
  for (let i = 3; i < fb.data.length; i += 4) {
    assert.equal(fb.data[i], 255, `pixel ${i} not opaque`);
  }
});

test('composeTitle is a composed picture, not a flat fill', () => {
  const fb = new Framebuffer(320, 180);
  composeTitle(fb);
  // A real composed scene (light rig + card + grid + text) has many distinct tones.
  assert.ok(distinctColors(fb) > 200, `only ${distinctColors(fb)} colors — looks flat`);
});

test('composeTitle is deterministic (byte-identical across runs)', () => {
  const a = new Framebuffer(200, 140);
  const b = new Framebuffer(200, 140);
  composeTitle(a);
  composeTitle(b);
  assert.deepEqual(Array.from(a.data), Array.from(b.data));
});

test('the card region is lit manila, distinct from the oil floor corners', () => {
  const fb = new Framebuffer(320, 180);
  composeTitle(fb);
  const { cardX, cardY, cardW, cardH } = titleLayout(fb);
  // Sample the lower drafting band (below the stamped title), not the geometric center —
  // display-face ink can land on the midpoint without the stock going dark.
  const center = fb.getPixel(cardX + (cardW >> 1), cardY + Math.round(cardH * 0.65));
  const corner = fb.getPixel(2, 2);
  // Card stock is warm/bright manila; corner is dark oil.
  assert.ok(center[0] > 140, `card stock too dark: ${center}`);
  assert.ok(corner[0] < 90, `corner too bright (light rig should fall off): ${corner}`);
  assert.ok(center[0] > corner[0] + 60, 'card should stand out from the floor');
});

test('the title card remains physically inside the approved pattern room', () => {
  const fb = new Framebuffer(640, 360);
  composeTitle(fb);
  const window = fb.getPixel(35, 80);
  const cabinet = fb.getPixel(610, 100);
  assert.ok(window[1] > 95 && window[2] > 90, `north-light sash missing: ${window}`);
  assert.ok(cabinet[0] > cabinet[2] + 12, `master cabinet missing: ${cabinet}`);
});

test('title ink is present on the card (graphite darker than the manila under it)', () => {
  const fb = new Framebuffer(320, 180);
  composeTitle(fb);
  const { cardX, cardY, cardW, cardH } = titleLayout(fb);
  // Scan the upper-middle band where the title sits for dark ink pixels.
  let inkPixels = 0;
  const y0 = cardY + Math.round(cardH * 0.18);
  const y1 = cardY + Math.round(cardH * 0.55);
  for (let y = y0; y < y1; y++) {
    for (let x = cardX; x < cardX + cardW; x++) {
      if (fb.getPixel(x, y)[0] < 70) inkPixels++;
    }
  }
  assert.ok(inkPixels > 80, `expected stamped title ink, found ${inkPixels} dark pixels`);
});

test('drawPrompt(on=true) adds ink; on=false leaves the frame unchanged', () => {
  const base = new Framebuffer(320, 180);
  composeTitle(base);
  const snapshot = Array.from(base.data);

  const off = new Framebuffer(320, 180);
  composeTitle(off);
  drawPrompt(off, false);
  assert.deepEqual(Array.from(off.data), snapshot, 'prompt off should be a no-op');

  const on = new Framebuffer(320, 180);
  composeTitle(on);
  drawPrompt(on, true);
  assert.notDeepEqual(Array.from(on.data), snapshot, 'prompt on should change pixels');
});

test('HOUSE_NAME is a non-empty clean-room name', () => {
  assert.ok(typeof HOUSE_NAME === 'string' && HOUSE_NAME.length > 0);
  assert.doesNotMatch(HOUSE_NAME.toLowerCase(), /picross|nintendo|ufo/);
});
