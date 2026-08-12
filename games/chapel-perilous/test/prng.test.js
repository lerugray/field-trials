import test from 'node:test';
import assert from 'node:assert/strict';
import { mulberry32, hash2, hashInt } from '../src/engine/prng.js';

test('mulberry32 is deterministic for a given seed', () => {
  const a = mulberry32(2323);
  const b = mulberry32(2323);
  const seqA = Array.from({ length: 8 }, () => a());
  const seqB = Array.from({ length: 8 }, () => b());
  assert.deepEqual(seqA, seqB);
});

test('mulberry32 differs across seeds and stays in [0,1)', () => {
  const a = mulberry32(1);
  const b = mulberry32(2);
  const va = a();
  const vb = b();
  assert.notEqual(va, vb);
  for (const v of [va, vb]) {
    assert.ok(v >= 0 && v < 1, `value ${v} out of range`);
  }
});

test('hash2 is stateless and order-independent', () => {
  const forward = hash2(3, 9, 2323);
  // interleave other calls; result for (3,9) must not change
  hash2(100, 200, 2323);
  hash2(-5, -5, 7);
  const again = hash2(3, 9, 2323);
  assert.equal(forward, again);
  assert.ok(forward >= 0 && forward < 1);
});

test('hash2 varies with coordinate and seed', () => {
  assert.notEqual(hash2(0, 0, 1), hash2(1, 0, 1));
  assert.notEqual(hash2(0, 0, 1), hash2(0, 0, 2));
});

test('hashInt returns a uint32', () => {
  const v = hashInt(23, 5, 2323);
  assert.ok(Number.isInteger(v));
  assert.ok(v >= 0 && v <= 0xffffffff);
});
