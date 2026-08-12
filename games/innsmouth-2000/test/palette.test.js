import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RAMP, CHROME, hexToRgb, terrainRamp, SHADOW, HIGHLIGHT } from '../src/palette.js';
import { TERRAIN } from '../src/mapgen.js';

test('every ramp has exactly 4 steps of valid hex', () => {
  for (const [key, ramp] of Object.entries(RAMP)) {
    assert.equal(ramp.length, 4, `${key} is not a 4-step ramp`);
    for (const c of ramp) assert.match(c, /^#[0-9a-f]{6}$/, `${key} has bad hex ${c}`);
  }
});

test('ramps go from dark shadow to bright highlight', () => {
  const lum = (hex) => {
    const { r, g, b } = hexToRgb(hex);
    return 0.299 * r + 0.587 * g + 0.114 * b;
  };
  for (const [key, ramp] of Object.entries(RAMP)) {
    assert.ok(lum(ramp[SHADOW]) < lum(ramp[HIGHLIGHT]), `${key} ramp does not brighten`);
  }
});

test('hexToRgb parses correctly', () => {
  assert.deepEqual(hexToRgb('#000000'), { r: 0, g: 0, b: 0 });
  assert.deepEqual(hexToRgb('#ffffff'), { r: 255, g: 255, b: 255 });
  assert.deepEqual(hexToRgb('#356b64'), { r: 0x35, g: 0x6b, b: 0x64 });
});

test('every terrain kind maps to a real ramp', () => {
  for (const terrain of Object.values(TERRAIN)) {
    const key = terrainRamp(terrain);
    assert.ok(RAMP[key], `terrain ${terrain} maps to missing ramp ${key}`);
  }
});

test('chrome greys are all valid hex', () => {
  for (const [role, hex] of Object.entries(CHROME)) {
    assert.match(hex, /^#[0-9a-f]{6}$/, `chrome ${role} bad hex ${hex}`);
  }
});
