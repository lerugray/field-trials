// The determinism contract, in the sim's own terms: the same seed always deals the same run,
// and two named streams never disturb one another.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng, hash32 } from '../src/rng.js';

test('the same seed replays the same run', () => {
  const a = createRng('tenure-01');
  const b = createRng('tenure-01');
  const drawsA = Array.from({ length: 32 }, () => a.stream('raid').float());
  const drawsB = Array.from({ length: 32 }, () => b.stream('raid').float());
  assert.deepEqual(drawsA, drawsB);
});

test('a different seed deals a different run', () => {
  const a = createRng('tenure-01');
  const b = createRng('tenure-02');
  const drawsA = Array.from({ length: 32 }, () => a.stream('raid').float());
  const drawsB = Array.from({ length: 32 }, () => b.stream('raid').float());
  assert.notDeepEqual(drawsA, drawsB);
});

test('numeric and string seeds are both accepted and reproducible', () => {
  const a = createRng(12345);
  const b = createRng(12345);
  assert.equal(a.stream('x').float(), b.stream('x').float());
});

test('named streams are independent: drawing from one does not perturb another', () => {
  // Draw morale-then-raid in one run; raid-then-morale in another. The raid stream must be
  // identical either way, or a payroll draw could silently change who a raid kills.
  const r1 = createRng('facility');
  r1.stream('morale').float();
  r1.stream('morale').float();
  const raidAfterMorale = r1.stream('raid').float();

  const r2 = createRng('facility');
  const raidFirst = r2.stream('raid').float();

  assert.equal(raidAfterMorale, raidFirst);
});

test('stream(name) is memoised: the same name keeps advancing, it does not reset', () => {
  const r = createRng('facility');
  const first = r.stream('claims').float();
  const second = r.stream('claims').float();
  assert.notEqual(first, second);
});

test('draws stay in their stated ranges', () => {
  const s = createRng('ranges').stream('t');
  for (let i = 0; i < 500; i++) {
    const f = s.float();
    assert.ok(f >= 0 && f < 1);
    const n = s.int(3, 7);
    assert.ok(n >= 3 && n < 7);
    const b = s.between(10, 12);
    assert.ok(b >= 10 && b <= 12);
    assert.ok(typeof s.chance(0.5) === 'boolean');
  }
});

test('hash32 is stable and unsigned', () => {
  assert.equal(hash32('material-breach'), hash32('material-breach'));
  assert.ok(hash32('anything') >= 0);
});
