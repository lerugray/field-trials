import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng, hashSeed } from '../src/core/rng.js';

test('rng: same seed reproduces the same sequence', () => {
  const a = createRng(1234);
  const b = createRng(1234);
  const seqA = Array.from({ length: 20 }, () => a.next());
  const seqB = Array.from({ length: 20 }, () => b.next());
  assert.deepEqual(seqA, seqB);
});

test('rng: different seeds diverge', () => {
  const a = createRng(1);
  const b = createRng(2);
  const seqA = Array.from({ length: 20 }, () => a.next());
  const seqB = Array.from({ length: 20 }, () => b.next());
  assert.notDeepEqual(seqA, seqB);
});

test('rng: string seeds hash deterministically and are usable', () => {
  assert.equal(hashSeed('adversary'), hashSeed('adversary'));
  assert.notEqual(hashSeed('a'), hashSeed('b'));
  const a = createRng('run-seed');
  const b = createRng('run-seed');
  assert.equal(a.next(), b.next());
});

test('rng: next() stays in [0,1)', () => {
  const r = createRng(42);
  for (let i = 0; i < 5000; i++) {
    const v = r.next();
    assert.ok(v >= 0 && v < 1, `out of range: ${v}`);
  }
});

test('rng: int() is inclusive on both bounds and never escapes', () => {
  const r = createRng(7);
  let sawMin = false, sawMax = false;
  for (let i = 0; i < 5000; i++) {
    const v = r.int(3, 6);
    assert.ok(v >= 3 && v <= 6);
    assert.ok(Number.isInteger(v));
    if (v === 3) sawMin = true;
    if (v === 6) sawMax = true;
  }
  assert.ok(sawMin && sawMax, 'both bounds should occur');
});

test('rng: getState/setState round-trips mid-stream (save/replay)', () => {
  const r = createRng(99);
  for (let i = 0; i < 10; i++) r.next();
  const snapshot = r.getState();
  const after = Array.from({ length: 15 }, () => r.next());
  r.setState(snapshot);
  const replay = Array.from({ length: 15 }, () => r.next());
  assert.deepEqual(after, replay);
});

test('rng: fork() is reproducible and independent of the parent stream', () => {
  const p1 = createRng(5);
  const p2 = createRng(5);
  const c1 = p1.fork();
  const c2 = p2.fork();
  // Same parent state → same child stream.
  assert.deepEqual(
    Array.from({ length: 10 }, () => c1.next()),
    Array.from({ length: 10 }, () => c2.next()),
  );
  // Parent continues identically regardless of whether the child was drawn from.
  assert.equal(p1.next(), p2.next());
});

test('rng: pick returns a member of the array', () => {
  const r = createRng(3);
  const arr = ['a', 'b', 'c', 'd'];
  for (let i = 0; i < 100; i++) assert.ok(arr.includes(r.pick(arr)));
});
