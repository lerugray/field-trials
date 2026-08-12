import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  LIT_ANCHORS, LIT_BAYER, LIT_P, LIT_R, LitMask, LitPainter,
  litBay, litClamp, litFbm, litHex, litHsl, litMix, litRampAt, litRampFromRgb,
  litRgbOf, litRng, litShade, litT,
} from '../src/render/lit.js';
import { PALETTE, normColor } from '../src/render/palette.js';

// The lit layer is pure JS over a byte buffer, so unlike the vector creature
// renderer it can be checked for real in node — these are pixel assertions, not
// "it did not throw".

const px = (p, x, y) => p.get(x, y).slice(0, 3);

test('every lit ramp is anchored to a real PALETTE colour', () => {
  // If palette.js moves a colour, the lit scenes must move with it. This is the
  // guard against the lit layer quietly painting last month's register.
  for (const a of LIT_ANCHORS) {
    const ramp = LIT_R[a.ramp].map(normColor);
    assert.ok(
      ramp.includes(normColor(a.palette)),
      `${a.palette} is no longer a step of the ${a.ramp} ramp`,
    );
  }
});

test('the lit ramps run dark to light, monotonically', () => {
  const lum = (h) => { const c = litRgbOf(h); return c[0] * 0.30 + c[1] * 0.59 + c[2] * 0.11; };
  for (const [name, ramp] of Object.entries(LIT_R)) {
    assert.equal(ramp.length, 6, `${name} is not a 6-step ramp`);
    for (let i = 1; i < ramp.length; i++) {
      assert.ok(lum(ramp[i]) > lum(ramp[i - 1]), `${name} step ${i} is not lighter than ${i - 1}`);
    }
  }
});

test('the Bayer matrix is a complete 8x8 ordered dither', () => {
  assert.equal(LIT_BAYER.length, 64);
  const sorted = [...LIT_BAYER].sort((a, b) => a - b);
  for (let i = 1; i < sorted.length; i++) {
    assert.ok(sorted[i] > sorted[i - 1], 'threshold values repeat — the dither would band');
  }
  assert.ok(sorted[0] > 0 && sorted[63] < 1, 'thresholds must sit strictly inside (0,1)');
  // and it must actually vary with position, or every pixel picks the same step
  assert.notEqual(litBay(0, 0), litBay(1, 0));
  assert.equal(litBay(0, 0), litBay(8, 8), 'the matrix must tile on 8');
});

test('rampAt clamps at both ends and dithers between steps', () => {
  const ramp = LIT_R.navy;
  assert.equal(litRampAt(ramp, -1, 0, 0), ramp[0]);
  assert.equal(litRampAt(ramp, 0, 3, 4), ramp[0]);
  assert.equal(litRampAt(ramp, 2, 0, 0), ramp[5]);
  assert.equal(litRampAt(ramp, 1, 3, 4), ramp[5]);
  // At a t strictly between two steps, an 8x8 block must contain BOTH — that is
  // what makes a gradient read as ordered pixels instead of a hard edge.
  const seen = new Set();
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) seen.add(litRampAt(ramp, 0.5, x, y));
  assert.equal(seen.size, 2, 'a mid-ramp t must dither between exactly two steps');
});

test('the painter blends, adds and multiplies as advertised', () => {
  const p = new LitPainter(4, 4);
  p.clear('#000000');
  p.px(0, 0, '#ffffff');
  assert.deepEqual(px(p, 0, 0), [255, 255, 255]);

  p.clear('#000000');
  p.px(1, 1, '#ffffff', 0.5);
  assert.deepEqual(px(p, 1, 1), [128, 128, 128], 'alpha blend is a straight lerp');

  p.clear('#202020');
  p.add(2, 2, '#202020', 1);
  assert.deepEqual(px(p, 2, 2), [64, 64, 64], 'add is additive');

  p.clear('#ffffff');
  p.mul(3, 3, '#808080', 1);
  assert.deepEqual(px(p, 3, 3), [128, 128, 128], 'multiply scales toward the colour');
});

test('the painter never writes outside its buffer', () => {
  const p = new LitPainter(3, 3);
  p.clear('#000000');
  const before = Array.from(p.d);
  for (const [x, y] of [[-1, 0], [0, -1], [3, 0], [0, 3], [-99, -99], [1e6, 1e6]]) {
    p.px(x, y, '#ffffff');
    p.add(x, y, '#ffffff', 1);
    p.mul(x, y, '#000000', 1);
  }
  assert.deepEqual(Array.from(p.d), before, 'an out-of-bounds write leaked into the buffer');
});

test('add saturates rather than wrapping', () => {
  const p = new LitPainter(1, 1);
  p.clear('#f0f0f0');
  for (let i = 0; i < 10; i++) p.add(0, 0, '#ffffff', 1);
  assert.deepEqual(px(p, 0, 0), [255, 255, 255], 'Uint8ClampedArray must clamp, not overflow');
});

test('glow and pool only ever brighten', () => {
  const p = new LitPainter(21, 21);
  p.clear('#101010');
  p.glow(10, 10, 9, '#ffffff', 0.8, 2);
  assert.ok(px(p, 10, 10)[0] > 16, 'the glow centre must be brighter');
  assert.ok(px(p, 0, 0)[0] === 16, 'outside its radius nothing changes');
  const p2 = new LitPainter(21, 21);
  p2.clear('#101010');
  p2.pool(10, 10, 8, 4, '#ffffff', 0.8, 2);
  assert.ok(px(p2, 10, 10)[0] > 16);
  assert.ok(px(p2, 10, 0)[0] === 16, 'the pool is elliptical, not square');
});

test('shadowPool and castShadow only ever darken', () => {
  const p = new LitPainter(31, 21);
  p.clear('#808080');
  p.shadowPool(10, 10, 6, 3, 0.8);
  assert.ok(px(p, 10, 10)[0] < 128, 'the shadow centre must be darker');
  assert.equal(px(p, 30, 20)[0], 128, 'outside the pool nothing changes');
  const p2 = new LitPainter(31, 21);
  p2.clear('#808080');
  p2.castShadow(4, 8, 10, 12, 3, 0.7);
  assert.ok(px(p2, 6, 10)[0] < 128, 'the cast shadow darkens its footprint');
  // a zero-length cast is a no-op, not a divide-by-zero smear
  const p3 = new LitPainter(9, 9);
  p3.clear('#808080');
  p3.castShadow(2, 5, 4, 0, 0, 0.7);
  assert.equal(px(p3, 3, 4)[0], 128);
});

test('litT is a lambert term: it brightens toward the light and floors at ambient', () => {
  const lights = [{ x: 0, y: 0, col: '#ffffff', s: 1, range: 200 }];
  const top = litT(50, 40, 50, 50, 20, 20, lights, 0.2); // the lit side
  const bottom = litT(50, 60, 50, 50, 20, 20, lights, 0.2); // the shaded side
  assert.ok(top > bottom, 'the surface facing the light must be brighter');
  assert.ok(bottom >= 0.2 - 1e-9, 'nothing goes below ambient');
  // out of range contributes nothing
  const far = litT(500, 500, 500, 500, 20, 20, lights, 0.2);
  assert.ok(Math.abs(far - 0.2) < 1e-9, 'a light beyond its range must not reach');
  // no lights at all is legal and returns ambient
  assert.equal(litT(1, 1, 0, 0, 5, 5, [], 0.31), 0.31);
});

test('litRampFromRgb builds a 6-step ramp centred on the albedo', () => {
  const ramp = litRampFromRgb(0x40, 0x80, 0x30);
  assert.equal(ramp.length, 6);
  assert.equal(ramp[3], '#408030', 'step 3 is the albedo itself');
  const lum = (h) => { const c = litRgbOf(h); return c[0] + c[1] + c[2]; };
  for (let i = 1; i < ramp.length; i++) {
    assert.ok(lum(ramp[i]) > lum(ramp[i - 1]), 'the derived ramp must be monotonic');
  }
  // black and white albedos still produce a legal ramp (no NaN, no duplicates
  // that would make a lit pixel un-shadeable)
  for (const c of [[0, 0, 0], [255, 255, 255]]) {
    const r = litRampFromRgb(...c);
    assert.equal(r.length, 6);
    assert.ok(r.every((h) => /^#[0-9a-f]{6}$/.test(h)), 'ramp steps must be valid hex');
  }
});

test('the colour helpers round-trip', () => {
  assert.equal(litHex(16, 32, 48), '#102030');
  assert.deepEqual(litRgbOf('#102030'), [16, 32, 48]);
  assert.equal(litMix('#000000', '#ffffff', 0.5), '#808080');
  assert.equal(litShade('#808080', 0), '#808080');
  assert.ok(litRgbOf(litShade('#808080', 0.5))[0] > 128);
  assert.ok(litRgbOf(litShade('#808080', -0.5))[0] < 128);
  assert.equal(litHsl(0, 100, 50), '#ff0000');
  assert.equal(litHsl(360, 100, 50), '#ff0000', 'hue wraps');
  assert.equal(litHsl(-120, 100, 50), '#0000ff', 'a negative hue wraps too');
  assert.equal(litClamp(5, 0, 1), 1);
});

test('the scene PRNG and fbm are deterministic — a re-bake reproduces the room', () => {
  const a = litRng(1234), b = litRng(1234);
  for (let i = 0; i < 20; i++) assert.equal(a(), b());
  const f1 = litFbm(7, 3), f2 = litFbm(7, 3);
  assert.equal(f1(3.5, 9.25), f2(3.5, 9.25));
  assert.notEqual(litFbm(8, 3)(3.5, 9.25), f1(3.5, 9.25), 'a different seed must differ');
  // and it stays inside [0,1], or it would push ramp positions off the ends
  for (let i = 0; i < 200; i++) {
    const v = f1(i * 0.37, i * 0.91);
    assert.ok(v >= 0 && v <= 1, `fbm escaped [0,1]: ${v}`);
  }
});

test('LitMask marks part ids and finds its silhouette edge', () => {
  const mk = new LitMask(0, 0, 8, 8);
  mk.rrect(2, 2, 4, 4, 0, 1);
  assert.equal(mk.local(3, 3), 1);
  assert.equal(mk.local(0, 0), 0);
  assert.ok(mk.isEdge(2, 2), 'a corner of the block is an edge');
  assert.ok(!mk.isEdge(3, 3), 'an interior cell is not');
  assert.ok(!mk.isEdge(0, 0), 'an empty cell is never an edge');
  // writes outside the mask are dropped, not wrapped into the wrong row
  mk.set(-5, -5, 7);
  mk.set(99, 99, 7);
  assert.ok(!mk.m.includes(7));
});

test('the PALETTE anchors the lit layer quotes still exist', () => {
  // A blunt guard: the lit layer names these fields directly, so a rename in
  // palette.js must fail here rather than silently yielding `undefined` colours.
  for (const k of ['bgBandLo', 'bgBandHi', 'headerBand', 'beigeDark', 'accentGold',
    'accentOrange', 'accentRed', 'creatureFloor']) {
    assert.ok(typeof PALETTE[k] === 'string' && PALETTE[k].startsWith('#'), `PALETTE.${k} is gone`);
  }
  assert.ok(LIT_P.gd4 === normColor(PALETTE.accentGold).toUpperCase()
    || normColor(LIT_P.gd4) === normColor(PALETTE.accentGold));
});
