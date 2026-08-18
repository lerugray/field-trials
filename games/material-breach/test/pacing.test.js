// GATE 1 — the pacing law, asserted structurally, not by comment (DESIGN-SEED §8.1, hard rule 3).
//
//   The player advances the clock; the clock never advances on the player.
//
// Enforced three ways: (a) no wall-clock or timer token appears in game-logic source; (b) the sim
// advances ONLY inside commitCycle(), and commitCycle is pure; (c) the cycle cannot be driven out
// of order without a loud failure.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { logicFiles } from './_logic-files.js';
import { createFacility } from '../src/model.js';
import { commitCycle, CycleError } from '../src/cycle.js';

// Wall-clock and real-time-tick tokens that must never reach game logic.
const BANNED = [
  /\bsetTimeout\b/,
  /\bsetInterval\b/,
  /\bsetImmediate\b/,
  /\bclearTimeout\b/,
  /\bclearInterval\b/,
  /\bDate\.now\b/,
  /new\s+Date\b/,
  /\bperformance\s*\.\s*now\b/,
  /\brequestAnimationFrame\b/,
  /\bcancelAnimationFrame\b/,
  /\bprocess\s*\.\s*hrtime\b/,
];

test('no wall-clock or timer token appears in game-logic source', () => {
  for (const file of logicFiles()) {
    for (const pattern of BANNED) {
      assert.ok(
        !pattern.test(file.code),
        `${file.name} contains a banned real-time token matching ${pattern}`,
      );
    }
  }
});

test('a facility left unsigned never advances: no clock ticks it', () => {
  const f = createFacility({ seed: 'still' });
  // Read it, inspect it, do anything short of signing it over.
  JSON.stringify(f);
  const _ = f.grid.length + f.treasury.gold;
  assert.equal(f.cycle.number, 1);
  assert.equal(f.cycle.phase, 'ADMIN');
});

test('the sim advances only inside commitCycle, and one call lands the next ADMIN', () => {
  const f0 = createFacility({ seed: 'spine' });
  const f1 = commitCycle(f0);
  assert.equal(f1.cycle.number, 2);
  assert.equal(f1.cycle.phase, 'ADMIN');
  assert.ok(f1.lastReport, 'a signed cycle produces an after-action report');
  assert.equal(f1.lastReport.cycle, 1);
});

test('commitCycle does not mutate the facility it is given', () => {
  const f0 = createFacility({ seed: 'immutable' });
  const before = structuredClone(f0);
  commitCycle(f0);
  assert.deepEqual(f0, before, 'the input facility was mutated by commitCycle');
});

test('signing over is deterministic in the seed: two identical runs match exactly', () => {
  const a = commitCycle(commitCycle(createFacility({ seed: 'replay' })));
  const b = commitCycle(commitCycle(createFacility({ seed: 'replay' })));
  assert.deepEqual(a, b);
});

test('driving the cycle out of order fails loudly, it does not silently no-op', () => {
  const f = createFacility({ seed: 'loud' });
  f.cycle.phase = 'RAID'; // not ADMIN
  assert.throws(() => commitCycle(f), CycleError);
});
