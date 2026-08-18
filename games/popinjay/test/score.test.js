// score.test.js — the score system (DESIGN-SEED §Score vs tickets): per-class values,
// the tick-denominated chain MULTIPLIER (x1/x2/x3/x4), and the stage-clear time bonus.
// Pure sim.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { World } from '../src/sim/world.js';
import { Balloon } from '../src/sim/balloon.js';
import { CLASSES, CHAIN, SCORE, TICK_HZ } from '../src/tuning.js';

function penny(id) { return new Balloon({ cls: 'penny', x: 100, floorY: 700, y: 600, vy: 0, id }); }

test('per-class value + chain multiplier: pops inside the window escalate x1→x2→x3→x4', () => {
  const w = new World({ seed: 1 });
  w.balloons = [];
  const V = CLASSES.penny.score; // 800

  const gains = [];
  let last = 0;
  const ticks = [100, 150, 200, 250, 300]; // each within CHAIN.windowTicks (90) of the last
  for (let i = 0; i < ticks.length; i++) {
    w.tick = ticks[i];
    const b = penny(i + 1); w.balloons = [b];
    w._resolveHit(b);
    gains.push(w.score - last); last = w.score;
  }
  // chain 1..5 → multiplier caps at x4 (mult table length).
  assert.deepEqual(gains, [V * 1, V * 2, V * 3, V * 4, V * 4]);
});

test('the chain resets once the window lapses (no free multiplier)', () => {
  const w = new World({ seed: 1 });
  w.balloons = [];
  w.tick = 100; let b = penny(1); w.balloons = [b]; w._resolveHit(b); // chain 1
  const afterFirst = w.score;
  w.tick = 100 + CHAIN.windowTicks + 5; // past the window
  b = penny(2); w.balloons = [b]; w._resolveHit(b);                    // chain resets → x1
  assert.equal(w.score - afterFirst, CLASSES.penny.score * 1);
  assert.equal(w.chain, 1);
});

test('stage clear pays a time bonus vs par (beating par is prestige)', () => {
  const w = new World({ seed: 1 });
  w.balloons = [];
  w.parTicks = 60 * TICK_HZ; // 60 s par
  w.step({});                 // clears at tick 1 — well under par
  assert.ok(w.cleared);
  const remainSec = Math.floor((w.parTicks - w.tick) / TICK_HZ);
  assert.equal(w.timeBonus, SCORE.clearBonusBase + remainSec * SCORE.timeBonusPerSec);
  assert.ok(w.score >= w.timeBonus, 'the bonus is folded into the score');
});

test('a stage cleared AT/after par still pays the base clear award (never negative)', () => {
  const w = new World({ seed: 1 });
  w.balloons = [];
  w.parTicks = 0;   // already past par
  w.step({});
  assert.equal(w.timeBonus, SCORE.clearBonusBase, 'no negative bonus past par');
});

test('a downed player does NOT trigger a clear/time-bonus even with no balloons', () => {
  const w = new World({ seed: 1 });
  w.balloons = [];
  w.dead = true;
  w.step({});
  assert.equal(w.cleared, false, 'death suppresses the clear');
  assert.equal(w.timeBonus, 0);
});
