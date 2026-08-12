import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeLcg } from '../src/state.js';

test('makeLcg produces identical sequences for identical seeds', () => {
  const a = makeLcg(12345);
  const b = makeLcg(12345);
  for (let i = 0; i < 100; i += 1) {
    assert.equal(a(), b());
  }
});

test('makeLcg produces different sequences for different seeds', () => {
  const a = makeLcg(1);
  const b = makeLcg(2);
  let collisions = 0;
  for (let i = 0; i < 50; i += 1) {
    if (a() === b()) collisions += 1;
  }
  assert.ok(collisions < 5, 'too many collisions for different seeds');
});

test('makeLcg values are in [0,1)', () => {
  const rng = makeLcg(98765);
  for (let i = 0; i < 200; i += 1) {
    const v = rng();
    assert.ok(v >= 0 && v < 1, `value ${v} out of range`);
  }
});
