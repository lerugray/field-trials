// Pacing invariants (M8 balance pass). The ~45-minute hatch-to-retirement target
// stops being a hand-feel claim here: we compute a full first life from the real
// calendar (aging budgets + mandatory cadence) and assert the target sits
// comfortably inside the fast/deliberate play-speed bracket. If a future change to
// the lifespan, stage budgets or meet cadence pushes the target to an edge, this
// fails — the clock is now a checked invariant, not vibes.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  LIFE_TIME_TARGET_MIN,
  lifetimeActionBudget,
  lifetimeBattleCount,
  estimateLifeMinutes,
  lifeTimeBracket,
  FAST_PLAYER,
  DELIBERATE_PLAYER,
} from '../src/engine/pacing.js';
import { lifeStage, LIFESPAN_WEEKS } from '../src/engine/raise.js';

test('lifetime action budget sums the real aging budgets exactly', () => {
  // Hand-sum the stage budgets so this catches any silent calendar drift.
  let expected = 0;
  for (let w = 1; w <= LIFESPAN_WEEKS; w++) expected += lifeStage(w).budget;
  assert.equal(lifetimeActionBudget(), expected);
  assert.ok(expected > 0);
});

test('a life always includes at least the mandatory meets', () => {
  const floor = lifetimeBattleCount(LIFESPAN_WEEKS, 0);
  assert.ok(floor >= 1, 'even a battle-shy player must meet the mandatory bouts');
  // More eagerness only ever adds bouts.
  assert.ok(lifetimeBattleCount(LIFESPAN_WEEKS, 1) >= floor);
});

test('fast player finishes quicker than a deliberate one', () => {
  const fast = estimateLifeMinutes(FAST_PLAYER);
  const deliberate = estimateLifeMinutes(DELIBERATE_PLAYER);
  assert.ok(fast < deliberate, `fast (${fast}) should be under deliberate (${deliberate})`);
});

test('the 45-minute target sits comfortably inside the play-speed bracket', () => {
  const { fast, deliberate, target } = lifeTimeBracket();
  assert.equal(target, LIFE_TIME_TARGET_MIN);
  // Strictly interior...
  assert.ok(target > fast, `target ${target} must exceed the fast floor ${fast.toFixed(1)}`);
  assert.ok(target < deliberate, `target ${target} must trail the deliberate ceiling ${deliberate.toFixed(1)}`);
  // ...and not hugging either edge (a first life should reach ~45 min for a
  // normal player, not only a speedrunner or only a maximally-fussy one).
  assert.ok(target > fast * 1.4, `target ${target} too close to the fast floor ${fast.toFixed(1)}`);
  assert.ok(target < deliberate * 0.95, `target ${target} too close to the deliberate ceiling ${deliberate.toFixed(1)}`);
});

test('the whole bracket stays in a one-sitting sane range', () => {
  const { fast, deliberate } = lifeTimeBracket();
  // A speedrun is still a real session; a fussy run still ends in one sitting.
  assert.ok(fast >= 10, `fast run ${fast.toFixed(1)} min is implausibly short`);
  assert.ok(deliberate <= 90, `deliberate run ${deliberate.toFixed(1)} min overruns one sitting`);
});
