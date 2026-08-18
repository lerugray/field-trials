// GATE 3 — the degenerate-strategy probe (DESIGN-SEED §8.3, DIRECTIONS fold 18). A game whose
// fantasy is administration is exactly the shape that can accidentally administer itself. So:
//   - zero input across the cycles MUST lose (an unadministered facility falls);
//   - the cheapest spam strategy (one order repeated forever) MUST also lose.
// The numbers are the gate: zero-input loses within 12 cycles; single-order spam within 20.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFacility } from '../src/model.js';
import { commitCycle } from '../src/cycle.js';
import { queueFortify } from '../src/actions.js';

const SEEDS = ['a', 'b', 'tenure-01', 'xyz', 'material-breach', 'seed-6', 'seed-7', 'seed-8'];

function runZeroInput(seed, cap = 30) {
  let f = createFacility({ seed });
  while (f.status === 'active' && f.tenure.cyclesSurvived < cap) f = commitCycle(f);
  return f;
}

function runFortifySpam(seed, cap = 30) {
  let f = createFacility({ seed });
  while (f.status === 'active' && f.tenure.cyclesSurvived < cap) {
    queueFortify(f); // repeat the one lever forever
    f = commitCycle(f);
  }
  return f;
}

test('zero input LOSES within 12 cycles: an unadministered facility falls', () => {
  for (const seed of SEEDS) {
    const f = runZeroInput(seed);
    assert.notEqual(f.status, 'active', `seed ${seed}: zero input did not lose`);
    assert.ok(
      f.tenure.cyclesSurvived <= 12,
      `seed ${seed}: zero input survived ${f.tenure.cyclesSurvived} cycles, must fall by 12`,
    );
  }
});

test('the cheapest spam strategy LOSES within 20 cycles', () => {
  for (const seed of SEEDS) {
    const f = runFortifySpam(seed);
    assert.notEqual(f.status, 'active', `seed ${seed}: fortify spam did not lose`);
    assert.ok(
      f.tenure.cyclesSurvived <= 20,
      `seed ${seed}: fortify spam survived ${f.tenure.cyclesSurvived} cycles, must fall by 20`,
    );
  }
});

test('a closed tenure cannot be signed over again: it fails loudly', () => {
  const f = runZeroInput('a');
  assert.throws(() => commitCycle(f), /closed tenure/);
});
