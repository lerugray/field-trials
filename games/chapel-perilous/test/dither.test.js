import test from 'node:test';
import assert from 'node:assert/strict';
import { bayer, ditherLevel, grain, texturedShade, accentHit } from '../src/engine/dither.js';

test('bayer thresholds are the approved PoC 8x8 permutation in (0,1)', () => {
  const seen = new Set();
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
    const v = bayer(x, y);
    assert.ok(v > 0 && v < 1, `bayer(${x},${y})=${v} in (0,1)`);
    seen.add(v);
  }
  assert.equal(seen.size, 64, '64 distinct thresholds');
  assert.equal(bayer(0, 0), (0.5 / 64), 'first threshold matches approved matrix');
  assert.equal(bayer(7, 7), (21.5 / 64), 'last threshold matches approved matrix');
  // Tiles by 8 in both axes (the pattern repeats).
  assert.equal(bayer(0, 0), bayer(8, 16));
});

test('ditherLevel returns integer indices bounded to the ramp', () => {
  for (const lvl of [-3, 0, 2.5, 6, 9]) {
    for (let sy = 0; sy < 4; sy++) for (let sx = 0; sx < 4; sx++) {
      const v = ditherLevel(lvl, sx, sy, 7);
      assert.ok(Number.isInteger(v) && v >= 0 && v <= 6, `bounded ${v}`);
    }
  }
});

test('an integer level dithers to exactly itself (no shimmer on flat tones)', () => {
  for (let sy = 0; sy < 4; sy++) for (let sx = 0; sx < 4; sx++) {
    assert.equal(ditherLevel(3, sx, sy, 7), 3);
    assert.equal(ditherLevel(0, sx, sy, 7), 0);
    assert.equal(ditherLevel(6, sx, sy, 7), 6);
  }
});

test('a fractional level averages across the 8x8 cell to ~that level', () => {
  // 3.4 over the 64-cell Bayer field: fraction 0.4 -> ~40% land on 4, rest on 3.
  let sum = 0;
  for (let sy = 0; sy < 8; sy++) for (let sx = 0; sx < 8; sx++) sum += ditherLevel(3.4, sx, sy, 7);
  const avg = sum / 64;
  assert.ok(Math.abs(avg - 3.4) < 0.1, `avg ${avg} ~= 3.4`);
});

test('ditherLevel only ever picks two ADJACENT ramp indices', () => {
  const picks = new Set();
  for (let sy = 0; sy < 4; sy++) for (let sx = 0; sx < 4; sx++) picks.add(ditherLevel(2.7, sx, sy, 7));
  const arr = [...picks].sort();
  assert.ok(arr.length <= 2, 'at most two indices');
  if (arr.length === 2) assert.equal(arr[1] - arr[0], 1, 'adjacent');
});

test('grain is deterministic in (x,y,seed) and order-independent', () => {
  assert.equal(grain(5, 9, 42), grain(5, 9, 42));
  assert.notEqual(grain(5, 9, 42), grain(6, 9, 42)); // varies by position
  const a = grain(1, 2, 7), b = grain(100, 200, 7);
  assert.ok(a >= 0 && a < 1 && b >= 0 && b < 1);
});

test('texturedShade preserves silhouette: shade 0 and transparent untouched', () => {
  assert.equal(texturedShade(0, 3, 4, 1, 1), 0);
  assert.equal(texturedShade(-1, 3, 4, 1, 1), -1);
});

test('texturedShade keeps the AVERAGE tone (no muddying) and stays in-ramp', () => {
  // Average over many world positions + sub-pixels should track the base shade.
  const base = 3;
  let sum = 0, n = 0, min = 9, max = -9;
  for (let wy = 0; wy < 8; wy++) for (let wx = 0; wx < 8; wx++) {
    for (let sy = 0; sy < 4; sy++) for (let sx = 0; sx < 4; sx++) {
      const v = texturedShade(base, wx, wy, sx, sy, { seed: 1 });
      sum += v; n++;
      if (v < min) min = v;
      if (v > max) max = v;
    }
  }
  const avg = sum / n;
  assert.ok(Math.abs(avg - base) < 0.2, `avg ${avg} ~= ${base}`);
  assert.ok(min >= 0 && max <= 6, 'in ramp');
  assert.ok(max > base || min < base, 'actually textures (varies off the flat base)');
});

test('accentHit is sparse (~chance), deterministic, and off when chance<=0', () => {
  let hits = 0, n = 0;
  for (let wy = 0; wy < 16; wy++) for (let wx = 0; wx < 16; wx++) {
    for (let sy = 0; sy < 2; sy++) for (let sx = 0; sx < 2; sx++) {
      if (accentHit(wx, wy, sx, sy, 7, 0.2)) hits++; n++;
    }
  }
  const rate = hits / n;
  assert.ok(rate > 0.1 && rate < 0.3, `accent fires sparsely (~0.2), got ${rate.toFixed(2)}`);
  assert.equal(accentHit(3, 4, 1, 0, 7, 0.2), accentHit(3, 4, 1, 0, 7, 0.2), 'deterministic');
  assert.equal(accentHit(3, 4, 1, 0, 7, 0), false, 'off when chance<=0');
});

test('texturedShade is deterministic (world-anchored, no crawl)', () => {
  assert.equal(
    texturedShade(4, 12, 7, 2, 3, { seed: 5 }),
    texturedShade(4, 12, 7, 2, 3, { seed: 5 }),
  );
});
