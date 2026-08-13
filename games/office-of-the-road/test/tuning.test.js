// tuning.js sanity: speed control constants and helpers behave (M1 spine).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TUNING, clampSpeedIndex, speedAt } from '../src/tuning.js';

test('speed steps are the seeded set and default index is valid', () => {
  assert.deepEqual(TUNING.speedSteps, [0.5, 1, 2, 4]);
  assert.ok(TUNING.defaultSpeedIndex >= 0 && TUNING.defaultSpeedIndex < TUNING.speedSteps.length);
  assert.equal(speedAt(TUNING.defaultSpeedIndex), 1);
});

test('clampSpeedIndex stays in bounds', () => {
  assert.equal(clampSpeedIndex(-5), 0);
  assert.equal(clampSpeedIndex(0), 0);
  assert.equal(clampSpeedIndex(2), 2);
  assert.equal(clampSpeedIndex(99), TUNING.speedSteps.length - 1);
});

test('core pacing constants are positive numbers', () => {
  for (const k of ['tickMs', 'pacesPerTick', 'legLengthPaces', 'autosaveHeartbeatTicks', 'determinismProbeTicks']) {
    assert.equal(typeof TUNING[k], 'number', `${k} must be a number`);
    assert.ok(TUNING[k] > 0, `${k} must be positive`);
  }
});
