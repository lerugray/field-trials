// node --test — per-sphere palette tables (art law: 5-7 hue palette PER SPHERE,
// act-themed, committed). Pure data; no WebGL.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PALETTES, PALETTE_KEYS, SPHERE_COUNT, paletteForSphere, actForSphere } from '../src/render/palettes.js';

const HEX = /^#[0-9a-fA-F]{6}$/;

test('there is one committed palette per sphere (3 acts of 3)', () => {
  assert.equal(SPHERE_COUNT, 9);
  assert.equal(PALETTES.length, SPHERE_COUNT, 'nine committed palettes');
});

test('every palette carries all renderer keys as valid hex, 5-7 distinct hues', () => {
  for (const pal of PALETTES) {
    for (const k of PALETTE_KEYS) {
      assert.ok(HEX.test(pal[k]), `${pal.name}.${k} = ${pal[k]} is a #rrggbb hex`);
    }
    const distinct = new Set(PALETTE_KEYS.map((k) => pal[k].toLowerCase()));
    assert.ok(distinct.size >= 5 && distinct.size <= PALETTE_KEYS.length,
      `${pal.name} has ${distinct.size} distinct hues (5-7 family, art law)`);
  }
});

test('acts group in threes and the palette family marks the act', () => {
  assert.equal(actForSphere(0), 0);
  assert.equal(actForSphere(2), 0);
  assert.equal(actForSphere(3), 1);
  assert.equal(actForSphere(8), 2);
  for (let i = 0; i < SPHERE_COUNT; i++) assert.equal(PALETTES[i].act, Math.floor(i / 3));
});

test('paletteForSphere is deterministic and clamps out-of-range safely', () => {
  assert.equal(paletteForSphere(0), PALETTES[0]);
  assert.equal(paletteForSphere(0), paletteForSphere(0), 'deterministic');
  assert.equal(paletteForSphere(-5), PALETTES[0], 'clamps below');
  assert.equal(paletteForSphere(99), PALETTES[PALETTES.length - 1], 'clamps above (fails soft)');
});
