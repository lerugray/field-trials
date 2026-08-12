import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRng, hashString } from '../src/rng.js';

test('same seed produces identical sequences', () => {
  const a = makeRng(42);
  const b = makeRng(42);
  const seqA = Array.from({ length: 100 }, () => a.next());
  const seqB = Array.from({ length: 100 }, () => b.next());
  assert.deepEqual(seqA, seqB);
});

test('different seeds produce different sequences', () => {
  const a = makeRng(1);
  const b = makeRng(2);
  const seqA = Array.from({ length: 50 }, () => a.next());
  const seqB = Array.from({ length: 50 }, () => b.next());
  assert.notDeepEqual(seqA, seqB);
});

test('nearby integer seeds are decorrelated', () => {
  // splitmix pre-hash means seed 0 and seed 1 must not share a prefix.
  const a = makeRng(0);
  const b = makeRng(1);
  assert.notEqual(a.next(), b.next());
});

test('string seeds work and are deterministic', () => {
  const a = makeRng('Innsmouth');
  const b = makeRng('Innsmouth');
  assert.equal(a.next(), b.next());
  assert.notEqual(makeRng('Innsmouth').next(), makeRng('Arkham').next());
});

test('next() stays in [0, 1)', () => {
  const r = makeRng(7);
  for (let i = 0; i < 10000; i++) {
    const v = r.next();
    assert.ok(v >= 0 && v < 1, `value ${v} out of range`);
  }
});

test('int() respects inclusive bounds', () => {
  const r = makeRng(9);
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < 10000; i++) {
    const v = r.int(3, 7);
    assert.ok(Number.isInteger(v));
    min = Math.min(min, v);
    max = Math.max(max, v);
  }
  assert.equal(min, 3);
  assert.equal(max, 7);
});

test('int() with equal bounds is constant', () => {
  const r = makeRng(1);
  for (let i = 0; i < 100; i++) assert.equal(r.int(5, 5), 5);
});

test('range() stays within bounds', () => {
  const r = makeRng(11);
  for (let i = 0; i < 10000; i++) {
    const v = r.range(-2, 5);
    assert.ok(v >= -2 && v < 5);
  }
});

test('chance() is deterministic and roughly calibrated', () => {
  const r = makeRng(3);
  let hits = 0;
  const n = 20000;
  for (let i = 0; i < n; i++) if (r.chance(0.3)) hits++;
  const frac = hits / n;
  assert.ok(Math.abs(frac - 0.3) < 0.02, `fraction ${frac} not near 0.3`);
});

test('pick() returns an element of the array', () => {
  const r = makeRng(5);
  const arr = ['a', 'b', 'c', 'd'];
  for (let i = 0; i < 100; i++) assert.ok(arr.includes(r.pick(arr)));
});

test('shuffle() is a permutation and does not mutate input', () => {
  const r = makeRng(13);
  const arr = [1, 2, 3, 4, 5, 6, 7, 8];
  const copy = arr.slice();
  const shuffled = r.shuffle(arr);
  assert.deepEqual(arr, copy, 'input was mutated');
  assert.deepEqual(shuffled.slice().sort((a, b) => a - b), copy);
});

test('shuffle() is deterministic per seed', () => {
  const arr = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  assert.deepEqual(makeRng(21).shuffle(arr), makeRng(21).shuffle(arr));
});

test('fork() gives an independent reproducible stream', () => {
  const parent1 = makeRng(100);
  const parent2 = makeRng(100);
  const c1 = parent1.fork();
  const c2 = parent2.fork();
  assert.equal(c1.next(), c2.next());
});

test('hashString is stable and case-sensitive', () => {
  assert.equal(hashString('Dagon'), hashString('Dagon'));
  assert.notEqual(hashString('Dagon'), hashString('dagon'));
});
