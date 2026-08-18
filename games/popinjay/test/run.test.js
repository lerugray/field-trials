// run.test.js — the RUN/TOUR spine + ticket economy (DESIGN-SEED §The loop). Pure sim.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { Run, LOCALE_TICKETS, STAGES_PER_LOCALE, LOCALES } from '../src/sim/run.js';
import { World } from '../src/sim/world.js';

// A stub cleared stage with known stats.
function clearedStage({ score = 1000, pops = 15, bestChain = 3 } = {}) {
  const w = new World({ seed: 1 });
  w.score = score; w.pops = pops; w.bestChain = bestChain;
  return w;
}

test('clearing stages advances the tour cursor 1-1 → 1-4 → 2-1 … → finale', () => {
  const r = new Run({ seed: 1 });
  const seen = [];
  for (let i = 0; i < LOCALES * STAGES_PER_LOCALE; i++) { seen.push(`${r.locale}-${r.stage}`); r.clearStage(clearedStage()); }
  assert.equal(seen[0], '1-1');
  assert.equal(seen[3], '1-4');   // the centerpiece
  assert.equal(seen[4], '2-1');
  assert.equal(seen[LOCALES * STAGES_PER_LOCALE - 1], '3-4');
  assert.ok(r.atFinale(), 'past locale 3 the Panic Finale is next');
});

test('ticket payouts are convex by locale, and centerpieces pay double', () => {
  // Locale 1: stages 1-3 pay 1 each; the 1-4 centerpiece pays 2×.
  const r = new Run({ seed: 1 });
  r.clearStage(clearedStage()); assert.equal(r.tickets, LOCALE_TICKETS[0]);        // 1-1 → 1
  r.clearStage(clearedStage()); r.clearStage(clearedStage());                       // 1-2, 1-3 → +2
  assert.equal(r.tickets, LOCALE_TICKETS[0] * 3);
  r.clearStage(clearedStage()); // 1-4 centerpiece → +2
  assert.equal(r.tickets, LOCALE_TICKETS[0] * 3 + LOCALE_TICKETS[0] * 2);
  // Now in locale 2: a stage pays 3.
  const before = r.tickets;
  r.clearStage(clearedStage()); // 2-1 → +3
  assert.equal(r.tickets - before, LOCALE_TICKETS[1]);
});

test('prestige score + stats accumulate across the run', () => {
  const r = new Run({ seed: 1 });
  r.clearStage(clearedStage({ score: 1000, pops: 15, bestChain: 2 }));
  r.clearStage(clearedStage({ score: 500, pops: 7, bestChain: 4 }));
  assert.equal(r.score, 1500);
  assert.equal(r.totalPops, 22);
  assert.equal(r.bestChain, 4, 'best chain is the run maximum');
  assert.equal(r.stagesCleared, 2);
});

test('death stamps a causal scorecard (culprit, seed, loadout, pops, chain, score)', () => {
  const r = new Run({ seed: 42 });
  r.souvenirs = ['secondBarrel'];
  r.clearStage(clearedStage({ score: 800, pops: 10, bestChain: 3 })); // banked some tickets
  const dyingStage = clearedStage({ score: 200, pops: 5, bestChain: 2 });
  dyingStage.deathCulpritCls = 'penny';
  r.die(dyingStage);
  assert.ok(r.over && !r.victory);
  const sc = r.scorecard;
  assert.equal(sc.outcome, 'downed');
  assert.equal(sc.culpritCls, 'penny');
  assert.equal(sc.seed, 42);
  assert.deepEqual(sc.souvenirs, ['secondBarrel']);
  assert.equal(sc.pops, 15);       // 10 + 5
  assert.equal(sc.score, 1000);    // 800 + 200
  assert.ok(sc.tickets >= 1, 'banked tickets survive to the scorecard');
});

test('winning the finale pays a premium and stamps a victory scorecard', () => {
  const r = new Run({ seed: 1 });
  for (let i = 0; i < LOCALES * STAGES_PER_LOCALE; i++) r.clearStage(clearedStage());
  assert.ok(r.atFinale());
  const t0 = r.tickets;
  r.winFinale(5000, 4);
  assert.ok(r.victory && r.over);
  assert.equal(r.scorecard.outcome, 'victory');
  assert.ok(r.tickets > t0, 'the finale premium paid out');
});

test('run state round-trips through serialize/restore', () => {
  const r = new Run({ seed: 9 });
  r.souvenirs = ['quickSpool', 'skyAnchor'];
  r.clearStage(clearedStage()); r.clearStage(clearedStage());
  const snap = JSON.parse(JSON.stringify(r.serialize()));
  const r2 = Run.fromSerialized(snap);
  assert.deepEqual(r2.serialize(), snap);
  assert.equal(r2.tickets, r.tickets);
  assert.deepEqual(r2.souvenirs, r.souvenirs);
});
