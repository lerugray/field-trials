import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fnv1a, normalizePhrase, seedFromPhrase } from '../src/engine/hash.js';

test('normalizePhrase collapses trivial differences', () => {
  assert.equal(normalizePhrase('  Hello  World '), 'hello world');
  assert.equal(normalizePhrase('HELLO WORLD'), 'hello world');
  assert.equal(normalizePhrase('hello world'), 'hello world');
  assert.equal(normalizePhrase(null), '');
  assert.equal(normalizePhrase(undefined), '');
});

test('fnv1a is deterministic and unsigned 32-bit', () => {
  const a = fnv1a('oddseedz');
  const b = fnv1a('oddseedz');
  assert.equal(a, b);
  assert.ok(Number.isInteger(a));
  assert.ok(a >= 0 && a <= 0xffffffff);
});

test('fnv1a distinguishes near-identical inputs', () => {
  assert.notEqual(fnv1a('cat'), fnv1a('cot'));
  assert.notEqual(fnv1a('a'), fnv1a('b'));
});

test('seedFromPhrase is stable across whitespace/case', () => {
  assert.equal(seedFromPhrase('  Fluffy  '), seedFromPhrase('fluffy'));
});

test('hash spread is not obviously clumped', () => {
  const buckets = new Array(16).fill(0);
  for (let i = 0; i < 4000; i++) buckets[fnv1a('phrase-' + i) & 15]++;
  // every low-nibble bucket should get a reasonable share (expected 250)
  for (const c of buckets) assert.ok(c > 120 && c < 420, `bucket count ${c} off`);
});
