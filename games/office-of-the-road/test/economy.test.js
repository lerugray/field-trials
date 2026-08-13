// economy.test.js — THE CLOSED-LOOP ECONOMY (DESIGN-SEED M4 exit gate). Asserts
// the economy's health signals at a moderate sample: the gold curve is in band,
// buying is worth it, the always-open sink never sells out, no early power spike,
// the reward floor holds, and the run never strands. Deterministic.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { TUNING } from '../src/tuning.js';
import { runEconomy, compareStrategies, measureEconomy, sinkAlwaysOpen, noEarlySpike } from '../src/economy.js';

test('runEconomy is deterministic (same seed + strategy → identical trace)', () => {
  const a = runEconomy(7, { strategy: 'greedy', legs: 6 });
  const b = runEconomy(7, { strategy: 'greedy', legs: 6 });
  assert.deepEqual(a, b);
});

test('a surviving null run only accumulates gold by marching (progress ≥ standstill)', () => {
  // Find a seed whose null run survives all legs, then assert the gold curve is
  // non-decreasing — marching never leaves the ledger worse than standing still.
  let curve = null;
  for (let seed = 1; seed <= 60 && !curve; seed++) {
    const r = runEconomy(seed, { strategy: 'null', legs: 8 });
    if (!r.wiped && r.goldCurve.length >= 6) curve = r.goldCurve;
  }
  assert.ok(curve, 'a fully-surviving null run exists');
  for (let i = 1; i < curve.length; i++) assert.ok(curve[i] >= curve[i - 1], `gold non-decreasing at leg ${i} (${curve[i]} ≥ ${curve[i - 1]})`);
});

test('compareStrategies yields a divergence curve (buying moves the ledger)', () => {
  const { nul, grd, divergence } = compareStrategies(7, 8);
  assert.ok(grd.equipmentSpent > 0, 'greedy invests real gold in kit');
  assert.equal(divergence.length, Math.min(nul.goldCurve.length, grd.goldCurve.length));
  assert.ok(divergence.some((d) => d !== 0), 'the strategies diverge');
});

test('the resupply sink is always open (never sells out while gold covers it)', () => {
  assert.equal(sinkAlwaysOpen(), true);
});

test('no early power spike — no town stocks a tier before its minLeg', () => {
  assert.equal(noEarlySpike(60), true);
});

test('economy health signals hold at a moderate sample', () => {
  const eco = measureEconomy(24, 8);
  // closed loop: measured net gold/leg lands in the committed band
  const [lo, hi] = TUNING.economyGoldPerLegBand;
  assert.ok(eco.goldPerLeg >= lo && eco.goldPerLeg <= hi, `gold/leg ${eco.goldPerLeg.toFixed(1)} in [${lo},${hi}]`);
  // buying is worth it: greedy survives ≥ null in most seeds
  assert.ok(eco.greedyWorthFrac >= TUNING.economyGreedyWorthFrac, `greedy-worth ${eco.greedyWorthFrac} ≥ ${TUNING.economyGreedyWorthFrac}`);
  // never strands, floor holds
  assert.ok(eco.minGold >= 0, 'gold never goes negative');
  assert.equal(eco.floorOk, true, 'every mandate reward ≥ floor');
  // the sink has teeth (greedy actually spends)
  assert.ok(eco.greedySpent > 0);
});
