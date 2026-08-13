// M2 legibility gate: WCAG contrast on every used colour pair, the non-colour
// channel inventory, and CVD-matrix sanity.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PALETTE } from '../src/palette.js';
import {
  contrast, runContrastChecks, CONTRAST_CHECKS, NONCOLOR_CHANNELS, simulateCVD, CVD_MATRICES,
} from '../src/legibility.js';

test('contrast() matches known WCAG anchors', () => {
  assert.equal(contrast('#000000', '#ffffff').toFixed(1), '21.0');
  assert.equal(contrast('#ffffff', '#ffffff'), 1);
});

test('every body-text pair clears 4.5:1 and every UI edge clears 3:1 (M2 gate)', () => {
  const r = runContrastChecks(PALETTE);
  assert.ok(r.ok, 'contrast failures: ' + JSON.stringify(r.fails));
});

test('the checked pairs actually reference real palette colours', () => {
  for (const [fg, bg] of [...CONTRAST_CHECKS.body, ...CONTRAST_CHECKS.edge]) {
    assert.ok(PALETTE[fg], 'missing palette colour ' + fg);
    assert.ok(PALETTE[bg], 'missing palette colour ' + bg);
  }
});

test('every state distinction has a documented non-colour channel', () => {
  for (const k of ['focus', 'status', 'save', 'hp', 'reduced', 'combatDamage', 'terrain']) {
    assert.ok(NONCOLOR_CHANNELS[k] && NONCOLOR_CHANNELS[k].length > 10, 'missing non-colour channel for ' + k);
  }
});

test('CVD matrices exist for all three deficiencies and transform in range', () => {
  for (const type of ['deuteranopia', 'protanopia', 'tritanopia']) {
    assert.equal(CVD_MATRICES[type].length, 9);
    const [r, g, b] = simulateCVD(type, 200, 120, 60);
    for (const v of [r, g, b]) assert.ok(v >= 0 && v <= 255);
  }
  // Unknown type is a pass-through (never throws).
  assert.deepEqual(simulateCVD('none', 10, 20, 30), [10, 20, 30]);
});
