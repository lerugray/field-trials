// route.test.js — ROUTING THE NEXT LEG (DESIGN-SEED M4). Branch generation is
// deterministic and spans the safety-vs-resource axis; leg mods ride on the leg
// and round-trip; neutral mods leave the M2 baseline untouched.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { TUNING } from '../src/tuning.js';
import { generateBranches, neutralLegMods } from '../src/route.js';
import { createMarch, serializeMarch, restoreMarch, step, runTicks } from '../src/engine.js';

test('generateBranches is deterministic per (seed, leg)', () => {
  const a = generateBranches(2024, 3);
  const b = generateBranches(2024, 3);
  assert.deepEqual(a, b, 'same (seed,leg) → identical board');
  const c = generateBranches(2024, 4);
  assert.notDeepEqual(a.branches.map((x) => x.encounterMult), c.branches.map((x) => x.encounterMult), 'different leg → different figures');
});

test('branches span the safety-vs-resource axis (safe < ordinary < exposed)', () => {
  for (let seed = 1; seed <= 100; seed++) {
    const { branches } = generateBranches(seed, seed % 5);
    assert.equal(branches.length, TUNING.routeBranchCount);
    const [posted, ordinary, verge] = branches;
    // encounter risk rises across the axis
    assert.ok(posted.encounterMult < verge.encounterMult, 'posted quieter than the verge');
    assert.ok(posted.encounterMult <= ordinary.encounterMult + 1e-9);
    assert.ok(ordinary.encounterMult <= verge.encounterMult + 1e-9);
    // pay rises with risk
    assert.ok(posted.goldMult <= verge.goldMult, 'the verge pays at least as well');
    // only the safe road tolls; the verge never does
    assert.ok(posted.supplyToll >= 0);
    assert.equal(verge.supplyToll, 0, 'the verge is untolled');
  }
});

test('every branch is bounded inside its archetype tuning bands', () => {
  const { branches } = generateBranches(777, 2);
  const ids = ['posted', 'ordinary', 'verge'];
  branches.forEach((b, i) => {
    const id = ids[i];
    const [elo, ehi] = TUNING.routeEncounterMult[id];
    const [glo, ghi] = TUNING.routeGoldMult[id];
    const [tlo, thi] = TUNING.routeSupplyToll[id];
    assert.ok(b.encounterMult >= elo && b.encounterMult <= ehi, `${id} enc in band`);
    assert.ok(b.goldMult >= glo && b.goldMult <= ghi, `${id} gold in band`);
    assert.ok(b.supplyToll >= tlo && b.supplyToll <= thi, `${id} toll in band`);
    assert.deepEqual(b.mods, { encounterMult: b.encounterMult, goldMult: b.goldMult });
  });
});

test('neutral leg mods are the identity multipliers', () => {
  assert.deepEqual(neutralLegMods(), { encounterMult: 1, goldMult: 1 });
});

test('a fresh march starts under neutral mods; leg-begin resets them', () => {
  const m = createMarch(123);
  assert.deepEqual(m.legMods, { encounterMult: 1, goldMult: 1 });
  m.legMods = { encounterMult: 1.7, goldMult: 1.4 }; // as if routed
  // march to the next leg; leg-begin must reset mods to neutral
  let sawBegin = false;
  for (let i = 0; i < 5000 && !sawBegin; i++) {
    for (const ev of step(m)) if (ev.type === 'leg-begin') sawBegin = true;
  }
  assert.ok(sawBegin, 'a leg began');
  assert.deepEqual(m.legMods, { encounterMult: 1, goldMult: 1 }, 'mods reset on the new leg');
});

test('legMods round-trip through march serialization', () => {
  const m = createMarch(55);
  m.legMods = { encounterMult: 0.6, goldMult: 0.9 };
  const round = restoreMarch(JSON.parse(JSON.stringify(serializeMarch(m))));
  assert.deepEqual(round.legMods, { encounterMult: 0.6, goldMult: 0.9 });
});

test('neutral mods leave encounter cadence byte-identical to the pre-route engine', () => {
  // Two marches from the same seed: one untouched, one explicitly set neutral.
  // Encounter events must match tick-for-tick (mult ×1 is the identity).
  const a = createMarch(9001);
  const b = createMarch(9001);
  b.legMods = neutralLegMods();
  const ta = runTicks(a, 600).filter((e) => e.type === 'encounter');
  const tb = runTicks(b, 600).filter((e) => e.type === 'encounter');
  assert.deepEqual(ta, tb, 'neutral routing does not perturb the baseline cadence');
});

test('a lower encounter multiplier yields no more encounters than a higher one', () => {
  // Statistical sanity across seeds: the posted road should not out-fight the verge.
  let postedTotal = 0, vergeTotal = 0;
  for (let seed = 1; seed <= 40; seed++) {
    const quiet = createMarch(seed); quiet.legMods = { encounterMult: 0.5, goldMult: 1 };
    const loud = createMarch(seed); loud.legMods = { encounterMult: 1.7, goldMult: 1 };
    postedTotal += runTicks(quiet, 300).filter((e) => e.type === 'encounter').length;
    vergeTotal += runTicks(loud, 300).filter((e) => e.type === 'encounter').length;
  }
  assert.ok(vergeTotal > postedTotal, `verge fights more in aggregate (${vergeTotal} > ${postedTotal})`);
});
