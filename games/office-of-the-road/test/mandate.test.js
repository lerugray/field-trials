// mandate.test.js — THE MANDATE (DESIGN-SEED M4). The Office's quest-chain: a
// terminus, a floor-guaranteed disbursement, optional side-clauses, and exact
// serialization. All generation is deterministic on the `mandate` stream.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { makeStreams } from '../src/rng.js';
import { TUNING } from '../src/tuning.js';
import {
  createMandate, legsRemaining, isTerminus, evaluateSideClause,
  dischargeReward, serializeMandate, restoreMandate,
} from '../src/mandate.js';

test('createMandate is deterministic under seed (mandate stream)', () => {
  const a = createMandate(makeStreams(12345).mandate, 0, 0, 0);
  const b = createMandate(makeStreams(12345).mandate, 0, 0, 0);
  assert.deepEqual(a, b, 'same seed → identical mandate');
  const c = createMandate(makeStreams(999).mandate, 0, 0, 0);
  assert.notEqual(a.title + a.ref, c.title + c.ref, 'different seed → different mandate (title/ref)');
});

test('terminus is within the configured leg span, ahead of issue', () => {
  const [lo, hi] = TUNING.mandateLegSpan;
  for (let seed = 1; seed <= 200; seed++) {
    const issuedAt = seed % 7;
    const m = createMandate(makeStreams(seed).mandate, 0, issuedAt, 0);
    assert.ok(m.span >= lo && m.span <= hi, `span ${m.span} in [${lo},${hi}]`);
    assert.equal(m.destinationLeg, issuedAt + m.span);
    assert.ok(m.destinationLeg > issuedAt, 'terminus is ahead of the party');
  }
});

test('reward never falls below the floor (forward-progress guarantee)', () => {
  for (let seed = 1; seed <= 300; seed++) {
    const m = createMandate(makeStreams(seed).mandate, 0, 0, 0);
    assert.ok(m.reward >= TUNING.mandateRewardFloor, `reward ${m.reward} ≥ floor ${TUNING.mandateRewardFloor}`);
  }
});

test('legsRemaining and isTerminus track progress toward the destination', () => {
  const m = createMandate(makeStreams(42).mandate, 0, 2, 0); // issued at leg 2
  assert.equal(legsRemaining(m, 2), m.span);
  assert.equal(legsRemaining(m, m.destinationLeg), 0);
  assert.equal(legsRemaining(m, m.destinationLeg + 5), 0, 'never negative');
  assert.equal(isTerminus(m, m.destinationLeg - 1), false);
  assert.equal(isTerminus(m, m.destinationLeg), true);
  assert.equal(isTerminus(m, m.destinationLeg + 1), true, 'passing the terminus also counts');
});

test('side-clauses evaluate against the discharge record', () => {
  // Force clauses of each kind to exist by scanning seeds.
  let frugal = null, prov = null;
  for (let seed = 1; seed <= 500 && (!frugal || !prov); seed++) {
    const m = createMandate(makeStreams(seed).mandate, 0, 0, 0);
    for (const c of m.side) {
      if (c.kind === 'frugal' && !frugal) frugal = c;
      if (c.kind === 'provisioned' && !prov) prov = c;
    }
  }
  assert.ok(frugal && prov, 'both clause kinds are reachable');
  assert.equal(evaluateSideClause(frugal, { encounters: frugal.threshold, supplies: 0 }), true);
  assert.equal(evaluateSideClause(frugal, { encounters: frugal.threshold + 1, supplies: 0 }), false);
  assert.equal(evaluateSideClause(prov, { encounters: 99, supplies: prov.threshold }), true);
  assert.equal(evaluateSideClause(prov, { encounters: 0, supplies: prov.threshold - 1 }), false);
});

test('dischargeReward pays base + met side-bonuses; met is exact', () => {
  // Find a mandate with at least one side-clause.
  let m = null;
  for (let seed = 1; seed <= 200; seed++) {
    const cand = createMandate(makeStreams(seed).mandate, 0, 0, 0);
    if (cand.side.length >= 1) { m = cand; break; }
  }
  assert.ok(m, 'a mandate with a side-clause exists');
  // A record that satisfies everything: 0 encounters, full supplies.
  const good = dischargeReward(m, { encounters: 0, supplies: TUNING.startSupplies });
  const bonusTotal = m.side.reduce((s, c) => s + c.bonus, 0);
  assert.equal(good.gold, m.reward + bonusTotal, 'all clauses met → base + every bonus');
  assert.equal(good.met.length, m.side.length);
  // A record that satisfies nothing: many encounters, no supplies.
  const bad = dischargeReward(m, { encounters: 9999, supplies: 0 });
  assert.equal(bad.gold, m.reward, 'no clause met → exactly the floor-guaranteed base');
  assert.equal(bad.met.length, 0);
  assert.ok(bad.gold >= TUNING.mandateRewardFloor, 'even the worst discharge clears the floor');
});

test('serialize/restore round-trips a mandate exactly', () => {
  const m = createMandate(makeStreams(7).mandate, 3, 1, 4);
  const round = restoreMandate(JSON.parse(JSON.stringify(serializeMandate(m))));
  assert.deepEqual(round, m);
  assert.equal(serializeMandate(null), null);
  assert.equal(restoreMandate(null), null);
});
