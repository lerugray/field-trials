import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bayer, hash2, toothed } from '../src/gfx/dither.js';

test('bayer is deterministic and tiles on a 4x4 grid', () => {
  assert.equal(bayer(0, 0), bayer(4, 4));
  assert.equal(bayer(1, 2), bayer(5, 6));
});

test('bayer stays within [-0.5, 0.5)', () => {
  for (let y = 0; y < 4; y++) {
    for (let x = 0; x < 4; x++) {
      const v = bayer(x, y);
      assert.ok(v >= -0.5 && v < 0.5, `bayer(${x},${y})=${v}`);
    }
  }
});

test('bayer matrix covers all 16 distinct thresholds', () => {
  const seen = new Set();
  for (let y = 0; y < 4; y++) {
    for (let x = 0; x < 4; x++) seen.add(bayer(x, y));
  }
  assert.equal(seen.size, 16);
});

test('hash2 is deterministic and in [0, 1)', () => {
  assert.equal(hash2(3, 7), hash2(3, 7));
  for (let i = 0; i < 50; i++) {
    const v = hash2(i, i * 3 + 1);
    assert.ok(v >= 0 && v < 1, `hash2 out of range: ${v}`);
  }
});

test('hash2 differs across neighboring cells (no flat runs)', () => {
  assert.notEqual(hash2(0, 0), hash2(1, 0));
  assert.notEqual(hash2(0, 0), hash2(0, 1));
});

test('toothed jitters a base color by the dither offset', () => {
  const base = [100, 100, 100];
  const t = toothed(base, 0, 0, 20);
  assert.equal(t.length, 3);
  // amount 20 -> jitter within +/-10 of base.
  for (const ch of t) assert.ok(Math.abs(ch - 100) <= 10);
});
