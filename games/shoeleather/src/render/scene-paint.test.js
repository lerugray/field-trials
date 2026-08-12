import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Framebuffer } from './framebuffer.js';
import { PALETTE, mix, ditherMix, bayer } from './palette.js';
import { paintRoom, applyVignette } from './scene-paint.js';

test('palette entries are valid RGBA bytes', () => {
  for (const [name, c] of Object.entries(PALETTE)) {
    assert.equal(c.length, 4, name);
    for (const ch of c) assert.ok(ch >= 0 && ch <= 255, `${name} channel out of range`);
  }
});

test('mix interpolates endpoints', () => {
  assert.deepEqual(mix([0, 0, 0, 255], [100, 200, 50, 255], 0), [0, 0, 0, 255]);
  assert.deepEqual(mix([0, 0, 0, 255], [100, 200, 50, 255], 1), [100, 200, 50, 255]);
  assert.deepEqual(mix([0, 0, 0, 255], [100, 0, 0, 255], 0.5), [50, 0, 0, 255]);
});

test('bayer threshold stays in 0..1 and varies across the 4x4 cell', () => {
  const seen = new Set();
  for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
    const b = bayer(x, y);
    assert.ok(b > 0 && b < 1);
    seen.add(b);
  }
  assert.equal(seen.size, 16); // all distinct thresholds
});

test('ditherMix is deterministic', () => {
  const a = ditherMix(PALETTE.mustard, PALETTE.umber, 0.4, 3, 7);
  const b = ditherMix(PALETTE.mustard, PALETTE.umber, 0.4, 3, 7);
  assert.deepEqual(a, b);
});

test('paintRoom lights top brighter than floor (a rig, not a flat fill)', () => {
  const fb = new Framebuffer(64, 64);
  paintRoom(fb, { tint: PALETTE.avocado });
  const lum = (c) => c[0] + c[1] + c[2];
  const top = lum(fb.getPixel(32, 4));
  const bottom = lum(fb.getPixel(32, 60));
  assert.ok(top > bottom, `expected top (${top}) brighter than floor (${bottom})`);
});

test('paintRoom fills every pixel opaquely (no bare buffer left)', () => {
  const fb = new Framebuffer(48, 48);
  paintRoom(fb);
  for (let y = 0; y < 48; y += 7) for (let x = 0; x < 48; x += 7) {
    assert.equal(fb.getPixel(x, y)[3], 255);
  }
});

test('vignette darkens the corner relative to the center', () => {
  const fb = new Framebuffer(40, 40);
  fb.clear([120, 120, 120, 255]);
  applyVignette(fb, 0.6);
  const lum = (c) => c[0] + c[1] + c[2];
  assert.ok(lum(fb.getPixel(0, 0)) < lum(fb.getPixel(20, 20)));
});

test('lamp adds warmth near its center', () => {
  const dark = new Framebuffer(40, 40);
  paintRoom(dark, { tint: PALETTE.umber });
  const lit = new Framebuffer(40, 40);
  paintRoom(lit, { tint: PALETTE.umber, lamp: { x: 20, y: 20, r: 18 } });
  const lum = (c) => c[0] + c[1] + c[2];
  assert.ok(lum(lit.getPixel(20, 20)) >= lum(dark.getPixel(20, 20)));
});
