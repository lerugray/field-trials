import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hash2, valueNoise, fbm } from './fbm.js';

test('hash2 is deterministic and in [0,1)', () => {
  assert.equal(hash2(3, 7, 1), hash2(3, 7, 1));
  for (let i = 0; i < 50; i++) { const v = hash2(i, i * 3, 5); assert.ok(v >= 0 && v < 1); }
});

test('hash2 varies with position and seed', () => {
  assert.notEqual(hash2(1, 1, 0), hash2(2, 1, 0));
  assert.notEqual(hash2(1, 1, 0), hash2(1, 1, 1));
});

test('valueNoise is continuous at integer lattice points', () => {
  assert.ok(Math.abs(valueNoise(3, 4, 0) - hash2(3, 4, 0)) < 1e-9);
});

test('fbm stays in [0,1] and is deterministic', () => {
  for (let i = 0; i < 40; i++) {
    const v = fbm(i * 0.3, i * 0.7, { octaves: 5, seed: 2 });
    assert.ok(v >= 0 && v <= 1, `fbm out of range: ${v}`);
  }
  assert.equal(fbm(1.5, 2.5, { seed: 9 }), fbm(1.5, 2.5, { seed: 9 }));
});

test('fbm actually varies across space (not a flat field)', () => {
  const a = fbm(0.5, 0.5, { seed: 0 });
  const b = fbm(10.5, 20.5, { seed: 0 });
  assert.notEqual(a, b);
});
