// M5.2 — medals, the in-level pace read, and the performance gate. Medals are a
// fairness story too: measured against what a level can GIVE, and the gate never
// strands (the calm branch is always open).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MEDALS, MEDAL_FRACTION, rankOf, levelPotential, medalFor, medalPace, evaluateChoices,
} from '../src/run/medals.js';

const level = (enemies, pickups) => ({ enemies, pickups });

test('levelPotential sums enemy score + score-pod score, ignores heal pods', () => {
  const l = level(
    [{ score: 100 }, { score: 300 }],
    [{ score: 0, hull: 1 }, { score: 300, hull: 0 }],
  );
  assert.equal(levelPotential(l), 700);
  assert.equal(levelPotential(level([], [])), 0);
});

test('medalFor lands on the fraction thresholds', () => {
  const P = 1000;
  assert.equal(medalFor(1000, P), 'gold');
  assert.equal(medalFor(MEDAL_FRACTION.gold * P, P), 'gold');
  assert.equal(medalFor(MEDAL_FRACTION.silver * P, P), 'silver');
  assert.equal(medalFor(MEDAL_FRACTION.bronze * P, P), 'bronze');
  assert.equal(medalFor(MEDAL_FRACTION.bronze * P - 1, P), 'none');
  assert.equal(medalFor(0, P), 'none');
});

test('a level with nothing to score cannot be missed (gold on complete)', () => {
  assert.equal(medalFor(0, 0), 'gold');
});

test('rankOf orders the ladder none<bronze<silver<gold', () => {
  assert.ok(rankOf('none') < rankOf('bronze'));
  assert.ok(rankOf('bronze') < rankOf('silver'));
  assert.ok(rankOf('silver') < rankOf('gold'));
  assert.equal(rankOf('nonsense'), 0);
  assert.equal(MEDALS.length, 4);
});

test('medalPace projects the finish and caps at the potential', () => {
  // halfway with 500 of a 1000 level -> projected 1000 -> gold
  assert.deepEqual(medalPace(500, 0.5, 1000), { medal: 'gold', projected: 1000 });
  // a quarter in with 100 -> projects 400 -> bronze
  assert.deepEqual(medalPace(100, 0.25, 1000), { medal: 'bronze', projected: 400 });
  // can't project past what's there
  assert.equal(medalPace(900, 0.9, 1000).projected, 1000);
  // too early to read
  assert.deepEqual(medalPace(50, 0.0, 1000), { medal: 'none', projected: 0 });
  assert.deepEqual(medalPace(50, 0.01, 1000), { medal: 'none', projected: 0 });
});

test('the performance gate always leaves a branch open', () => {
  const choices = [
    { id: 'a', threat: 1 }, { id: 'b', threat: 2 }, { id: 'c', threat: 3 },
  ];
  // no medal: only the calm branch is open, the deeper two are locked
  const noMedal = evaluateChoices(choices, 'none');
  assert.deepEqual(noMedal.map((c) => c.locked), [false, true, true]);
  assert.ok(noMedal.some((c) => !c.locked), 'never fully locked');
  // a bronze unlocks the elite branches
  const withMedal = evaluateChoices(choices, 'bronze');
  assert.deepEqual(withMedal.map((c) => c.locked), [false, false, false]);
});

test('gate: equal-threat choices are all open regardless of medal', () => {
  const choices = [{ id: 'a', threat: 2 }, { id: 'b', threat: 2 }];
  assert.deepEqual(evaluateChoices(choices, 'none').map((c) => c.locked), [false, false]);
});

test('gate: a single choice is never locked', () => {
  assert.deepEqual(evaluateChoices([{ id: 'a', threat: 3 }], 'none'), [{ node: { id: 'a', threat: 3 }, locked: false }]);
  assert.deepEqual(evaluateChoices([], 'gold'), []);
});
