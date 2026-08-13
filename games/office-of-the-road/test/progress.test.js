// progress.test.js — THE NO-PROGRESS DETECTOR (DESIGN-SEED M5). A leg is stalled
// only when it advances nothing; the valve surfaces after the configured streak.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { TUNING } from '../src/tuning.js';
import { legIsStale, bumpStreak, noProgress } from '../src/progress.js';

test('a leg is stale only on net-negative gold with no gear and no xp gain', () => {
  assert.equal(legIsStale(-5, false, false), true, 'lost gold, gained nothing → stale');
  assert.equal(legIsStale(-5, true, false), false, 'gained gear → not stale');
  assert.equal(legIsStale(-5, false, true), false, 'gained mastery → not stale');
  assert.equal(legIsStale(3, false, false), false, 'net-positive gold → not stale');
  assert.equal(legIsStale(0, false, false), false, 'break-even is not backward');
});

test('the streak extends on stalls and resets on any advance', () => {
  let s = 0;
  s = bumpStreak(s, true); assert.equal(s, 1);
  s = bumpStreak(s, true); assert.equal(s, 2);
  s = bumpStreak(s, false); assert.equal(s, 0, 'one good leg clears the streak');
});

test('the valve surfaces at the configured consecutive-stall threshold', () => {
  assert.equal(noProgress(TUNING.noProgressLegs - 1), false);
  assert.equal(noProgress(TUNING.noProgressLegs), true);
  assert.equal(noProgress(TUNING.noProgressLegs + 3), true);
});
