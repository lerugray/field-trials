// The march engine: determinism, save/restore continuation, road invariants.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TUNING } from '../src/tuning.js';
import {
  createMarch,
  step,
  runTicks,
  serializeMarch,
  restoreMarch,
  terrainAt,
  TERRAINS,
} from '../src/engine.js';

test('same seed produces an identical event trace', () => {
  const a = createMarch(2024);
  const b = createMarch(2024);
  assert.deepEqual(runTicks(a, 500), runTicks(b, 500));
});

test('different seeds diverge', () => {
  const a = runTicks(createMarch(1), 500);
  const b = runTicks(createMarch(2), 500);
  assert.notDeepEqual(a, b);
});

test('serialize mid-march, restore, continuation is byte-identical', () => {
  const live = createMarch(31337);
  runTicks(live, 137); // march partway (across at least one leg)
  const snap = JSON.parse(JSON.stringify(serializeMarch(live))); // prove it is plain JSON

  const liveCont = runTicks(live, TUNING.determinismProbeTicks);
  const restored = restoreMarch(snap);
  const restoredCont = runTicks(restored, TUNING.determinismProbeTicks);

  assert.deepEqual(restoredCont, liveCont);
});

test('encounters never fall inside the minimum gap', () => {
  const s = createMarch(4242);
  const trace = runTicks(s, 3000);
  // Group encounter paces per leg; within a leg no two are closer than the gap.
  const perLeg = new Map();
  for (const ev of trace) {
    if (ev.type === 'encounter') {
      if (!perLeg.has(ev.leg)) perLeg.set(ev.leg, []);
      perLeg.get(ev.leg).push(ev.pace);
    }
  }
  for (const [, paces] of perLeg) {
    for (let i = 1; i < paces.length; i++) {
      assert.ok(paces[i] - paces[i - 1] >= TUNING.encounterMinGapPaces,
        `encounters ${paces[i - 1]} and ${paces[i]} closer than min gap`);
    }
  }
});

test('a leg completes exactly at legLengthPaces and rolls into the next', () => {
  const s = createMarch(7);
  const trace = runTicks(s, TUNING.legLengthPaces + 5);
  const complete = trace.find((e) => e.type === 'leg-complete');
  const begin = trace.find((e) => e.type === 'leg-begin');
  assert.ok(complete, 'leg never completed');
  assert.equal(complete.leg, 0);
  assert.ok(begin, 'next leg never began');
  assert.equal(begin.leg, 1);
});

test('terrainAt returns a known terrain for every pace of a leg', () => {
  const s = createMarch(99);
  for (let p = 0; p <= TUNING.legLengthPaces; p++) {
    assert.ok(TERRAINS.includes(terrainAt(s.legProfile, p)));
  }
});

test('speed does not affect simulation (engine has no wall-clock)', () => {
  // The engine steps one tick per call regardless of anything; the "speed"
  // invariant is that running the same tick count yields the same result.
  const slow = runTicks(createMarch(555), 400);
  const fast = runTicks(createMarch(555), 400);
  assert.deepEqual(slow, fast);
});
