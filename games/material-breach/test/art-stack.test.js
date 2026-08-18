// The VACUUM SEALED technique stack, asserted structurally (DESIGN-SEED §4.5). These are the art
// laws made mechanical: one palette in named ramps that actually run dark to light, a dither that
// really is an ordered 8x8 matrix, grain that is seeded rather than random, and light that behaves
// like a light. The "does it look right" half stays human-judged at the LOOK checklist.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RAMPS, C, DEPT_RAMP, CAST_RAMP, step, rgb, RAMP_BYTES, TEXT_PAIRS } from '../src/palette.js';
import { BAYER8, dither, createNoise, lightAt } from '../src/noise.js';

function luminance(hex) {
  const [r, g, b] = rgb(hex);
  const chan = [r, g, b].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * chan[0] + 0.7152 * chan[1] + 0.0722 * chan[2];
}

// ---- §4.5 item 4: a single curated palette in named ramps, dark to light ----------------------

test('every ramp runs dark to light, with no step out of order', () => {
  for (const [name, ramp] of Object.entries(RAMPS)) {
    assert.ok(ramp.length >= 5, `ramp '${name}' has only ${ramp.length} steps; a ramp needs range`);
    for (let i = 1; i < ramp.length; i++) {
      assert.ok(
        luminance(ramp[i]) > luminance(ramp[i - 1]),
        `ramp '${name}' step ${i} (${ramp[i]}) is not lighter than step ${i - 1} (${ramp[i - 1]})`,
      );
    }
  }
});

test('every colour the game draws is a step of a named ramp, and nothing is drawn off-palette', () => {
  const allSteps = new Set(Object.values(RAMPS).flat());
  for (const [name, hex] of Object.entries(C)) {
    assert.ok(allSteps.has(hex), `named colour '${name}' (${hex}) is not a step of any ramp`);
  }
});

test('every department and every cast role selects from a ramp that exists', () => {
  for (const [dept, ramp] of Object.entries(DEPT_RAMP)) {
    assert.ok(RAMPS[ramp], `department '${dept}' names a ramp '${ramp}' that does not exist`);
  }
  for (const [role, ramp] of Object.entries(CAST_RAMP)) {
    assert.ok(RAMPS[ramp], `cast role '${role}' names a ramp '${ramp}' that does not exist`);
  }
});

test('a ramp step selection is clamped, so a lighting overshoot can never leave the palette', () => {
  assert.equal(step('stone', -50), RAMPS.stone[0]);
  assert.equal(step('stone', 500), RAMPS.stone[RAMPS.stone.length - 1]);
  assert.equal(step('stone', 2), RAMPS.stone[2]);
  assert.throws(() => step('nosuchramp', 0), /unknown ramp/);
});

test('the per-pixel renderer sees the same colours as the drawing code', () => {
  for (const [name, ramp] of Object.entries(RAMPS)) {
    const bytes = RAMP_BYTES[name];
    assert.equal(bytes.length, ramp.length * 3, `ramp '${name}' byte table is the wrong length`);
    ramp.forEach((hex, i) => {
      const [r, g, b] = rgb(hex);
      assert.deepEqual([bytes[i * 3], bytes[i * 3 + 1], bytes[i * 3 + 2]], [r, g, b], `ramp '${name}' step ${i}`);
    });
  }
});

// ---- §4.5 item 3: dither and fbm ---------------------------------------------------------------

test('the dither is a real ordered 8x8 Bayer matrix, every threshold used exactly once', () => {
  assert.equal(BAYER8.length, 64);
  const seen = new Set(BAYER8);
  assert.equal(seen.size, 64, 'the Bayer matrix repeats a threshold');
  assert.equal(Math.min(...BAYER8), 0);
  assert.equal(Math.max(...BAYER8), 63);
});

test('the dither threshold is stable for a coordinate and tiles every 8 pixels', () => {
  assert.equal(dither(3, 5), dither(3 + 8, 5));
  assert.equal(dither(3, 5), dither(3, 5 + 8));
  assert.equal(dither(3, 5), dither(3 + 64, 5 + 128));
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const d = dither(x, y);
      assert.ok(d >= 0 && d < 1, `dither(${x},${y}) = ${d} is outside [0,1)`);
    }
  }
});

test('the grain is seeded, so the same facility renders the same texture every run', () => {
  const a = createNoise('facility-grain');
  const b = createNoise('facility-grain');
  const c = createNoise('a-different-facility');
  let sameCount = 0;
  for (let i = 0; i < 200; i++) {
    const x = i * 0.37;
    const y = i * 0.19;
    assert.equal(a.fbm(x, y), b.fbm(x, y), 'the same seed produced different grain');
    if (a.fbm(x, y) === c.fbm(x, y)) sameCount++;
  }
  assert.ok(sameCount < 20, 'two different seeds produced the same grain');
});

test('the grain stays in range and actually varies across a surface', () => {
  const n = createNoise('range-check');
  let min = 1;
  let max = 0;
  for (let y = 0; y < 40; y++) {
    for (let x = 0; x < 40; x++) {
      const v = n.fbm(x / 6, y / 6, 4);
      assert.ok(v >= 0 && v <= 1, `fbm out of range at ${x},${y}: ${v}`);
      if (v < min) min = v;
      if (v > max) max = v;
    }
  }
  assert.ok(max - min > 0.2, `grain is nearly flat (range ${(max - min).toFixed(3)}); surfaces would read as fills`);
});

// ---- §4.5 item 2: lighting as compositing ------------------------------------------------------

test('a lamp is brightest at its centre and falls away to the ambient floor', () => {
  const lamps = [{ x: 50, y: 50, radius: 30, intensity: 0.8 }];
  const centre = lightAt(lamps, 50, 50, 0.18);
  const mid = lightAt(lamps, 65, 50, 0.18);
  const outside = lightAt(lamps, 200, 200, 0.18);
  assert.ok(centre > mid, 'the lamp centre is not brighter than its middle distance');
  assert.ok(mid > outside, 'the lamp middle is not brighter than beyond its radius');
  assert.equal(outside, 0.18, 'beyond every lamp, light should sit exactly on the ambient floor');
});

test('light never leaves the 0 to 1 range, however many lamps overlap', () => {
  const lamps = [];
  for (let i = 0; i < 12; i++) lamps.push({ x: 50, y: 50, radius: 40, intensity: 0.9 });
  const v = lightAt(lamps, 50, 50, 0.5);
  assert.ok(v >= 0 && v <= 1, `stacked lamps produced light ${v}`);
  assert.equal(v, 1, 'saturated light should clamp to 1, not overshoot the ramp');
});

// ---- Gate 5 kept honest across the palette change ----------------------------------------------

test('every text pairing the renderer actually draws clears the 4.5:1 contrast floor', () => {
  function contrast(a, b) {
    const la = luminance(a);
    const lb = luminance(b);
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
  }
  assert.ok(TEXT_PAIRS.length >= 10, 'the measured pairing list has gone thin; it must cover what is drawn');
  for (const pair of TEXT_PAIRS) {
    const ratio = contrast(pair.fg, pair.bg);
    assert.ok(ratio >= 4.5, `${pair.name}: ${pair.fg} on ${pair.bg} is ${ratio.toFixed(2)}:1, below the 4.5:1 floor`);
  }
});
