import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  WALKTHROUGH_KEY,
  WALKTHROUGH_STEPS,
  shouldAutoStart,
  rememberWalkthrough
} from '../src/walkthrough.js';

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, value); }
  };
}

test('walkthrough covers the five required first-time topics in a handful of steps', () => {
  // 'coverage' added 2026-08-08 (operator field session): first-timers must be
  // told supply is lines-not-neighbors, that moving into isolation is legal,
  // and where the coverage toggle and opponent selector live.
  assert.deepEqual(WALKTHROUGH_STEPS.map(step => step.id), [
    'pieces',
    'communication',
    'coverage',
    'turn',
    'victory'
  ]);
});

test('walkthrough auto-starts once and stays dismissed after skip or completion', () => {
  const storage = memoryStorage();
  assert.equal(shouldAutoStart(storage), true);
  rememberWalkthrough(storage, 'skipped');
  assert.equal(storage.getItem(WALKTHROUGH_KEY), 'skipped');
  assert.equal(shouldAutoStart(storage), false);

  const completed = memoryStorage();
  rememberWalkthrough(completed, 'completed');
  assert.equal(shouldAutoStart(completed), false);
});
