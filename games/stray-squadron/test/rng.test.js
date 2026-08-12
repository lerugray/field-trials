import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRng, hashSeed } from '../src/core/rng.js';

test('same seed produces the same stream', () => {
  const a = makeRng('sector-42');
  const b = makeRng('sector-42');
  const seqA = Array.from({ length: 16 }, () => a.next());
  const seqB = Array.from({ length: 16 }, () => b.next());
  assert.deepEqual(seqA, seqB);
});

test('different seeds diverge', () => {
  const a = makeRng('sector-42');
  const b = makeRng('sector-43');
  const seqA = Array.from({ length: 16 }, () => a.next());
  const seqB = Array.from({ length: 16 }, () => b.next());
  assert.notDeepEqual(seqA, seqB);
});

test('numeric and string seeds both work and are stable', () => {
  const a = makeRng(12345);
  const b = makeRng(12345);
  assert.equal(a.next(), b.next());
});

test('next() stays in [0, 1)', () => {
  const r = makeRng('bounds');
  for (let i = 0; i < 100000; i++) {
    const v = r.next();
    assert.ok(v >= 0 && v < 1, `out of range: ${v}`);
  }
});

test('range(min, max) stays in [min, max)', () => {
  const r = makeRng('range');
  for (let i = 0; i < 50000; i++) {
    const v = r.range(-5, 12);
    assert.ok(v >= -5 && v < 12, `out of range: ${v}`);
  }
});

test('int(min, max) is inclusive on both ends and never exceeds them', () => {
  const r = makeRng('int');
  const seen = new Set();
  for (let i = 0; i < 20000; i++) {
    const v = r.int(1, 6);
    assert.ok(Number.isInteger(v));
    assert.ok(v >= 1 && v <= 6, `out of range: ${v}`);
    seen.add(v);
  }
  // With 20k draws over a die we must have hit both extremes.
  assert.ok(seen.has(1) && seen.has(6));
  assert.equal(seen.size, 6);
});

test('pick returns an element of the array', () => {
  const r = makeRng('pick');
  const arr = ['a', 'b', 'c', 'd'];
  for (let i = 0; i < 1000; i++) {
    assert.ok(arr.includes(r.pick(arr)));
  }
});

test('shuffle is a permutation and is deterministic for a seed', () => {
  const base = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
  const s1 = makeRng('shuf').shuffle(base.slice());
  const s2 = makeRng('shuf').shuffle(base.slice());
  assert.deepEqual(s1, s2);
  assert.deepEqual(s1.slice().sort((a, b) => a - b), base);
});

test('fork produces an independent but reproducible substream', () => {
  const parent1 = makeRng('run');
  const parent2 = makeRng('run');
  const c1 = parent1.fork('wingmates').next();
  const c2 = parent2.fork('wingmates').next();
  assert.equal(c1, c2);
  // A differently-salted fork diverges.
  const other = makeRng('run').fork('enemies').next();
  assert.notEqual(c1, other);
});

test('hashSeed is a stable uint32', () => {
  const h = hashSeed('stray');
  assert.ok(Number.isInteger(h) && h >= 0 && h <= 0xffffffff);
  assert.equal(h, hashSeed('stray'));
});
