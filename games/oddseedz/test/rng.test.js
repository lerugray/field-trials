import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRng, rngInt, rngPick, rngWeighted } from '../src/engine/rng.js';

test('makeRng is deterministic for a seed', () => {
  const a = makeRng(12345);
  const b = makeRng(12345);
  for (let i = 0; i < 50; i++) assert.equal(a(), b());
});

test('makeRng streams stay in [0,1)', () => {
  const r = makeRng(7);
  for (let i = 0; i < 1000; i++) {
    const v = r();
    assert.ok(v >= 0 && v < 1);
  }
});

test('different seeds diverge', () => {
  const a = makeRng(1);
  const b = makeRng(2);
  assert.notEqual(a(), b());
});

test('rngInt respects inclusive bounds', () => {
  const r = makeRng(99);
  let min = Infinity, max = -Infinity;
  for (let i = 0; i < 5000; i++) {
    const v = rngInt(r, 3, 9);
    assert.ok(Number.isInteger(v));
    assert.ok(v >= 3 && v <= 9);
    min = Math.min(min, v);
    max = Math.max(max, v);
  }
  assert.equal(min, 3);
  assert.equal(max, 9);
});

test('rngPick returns an element', () => {
  const r = makeRng(5);
  const arr = ['a', 'b', 'c'];
  for (let i = 0; i < 100; i++) assert.ok(arr.includes(rngPick(r, arr)));
});

test('rngWeighted honours weights roughly', () => {
  const r = makeRng(42);
  const entries = [
    { value: 'x', weight: 90 },
    { value: 'y', weight: 10 },
  ];
  let x = 0;
  const N = 10000;
  for (let i = 0; i < N; i++) if (rngWeighted(r, entries) === 'x') x++;
  const frac = x / N;
  assert.ok(frac > 0.85 && frac < 0.95, `x fraction ${frac}`);
});
