// playthrough.test.js — AUDIT-PLAYTHROUGH finding 7: shop/multi-leg breadth must
// be exercised headlessly, not only in a single-defeat browser driver run.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { runPlaythroughSession, findBreadthSeed } from '../src/playthrough.js';

test('a headless session reaches defeat with at least two routed legs', () => {
  let sample = null;
  for (let seed = 1; seed <= 48 && !sample; seed++) {
    const s = runPlaythroughSession(seed, { maxLegs: 8 });
    if (s.reachedDefeat && s.routeVisits >= 2) sample = s;
  }
  assert.ok(sample, 'expected a seed that wipes after multi-leg routing');
  assert.ok(sample.legsCompleted >= 2, 'defeat path crossed multiple camp pauses');
  if (sample.shopVisits > 0) assert.ok(sample.shopTxns >= 1, 'shop visit included a transaction');
});

test('breadth probe covers multi-leg routes, a shop transaction, and an open docket save', () => {
  const hit = findBreadthSeed(64, 2, 1);
  assert.ok(hit, 'no seed in 1..64 satisfied route+shop+docket breadth');
  const { stats } = hit;
  assert.ok(stats.routeVisits >= 2, `routeVisits ${stats.routeVisits}`);
  assert.ok(stats.shopVisits >= 1, `shopVisits ${stats.shopVisits}`);
  assert.ok(stats.shopTxns >= 1, `shopTxns ${stats.shopTxns}`);
  assert.equal(stats.reachedDocket, true, 'open save would present the docket on boot');
});

test('a headless session can survive several legs without wipe (success-path breadth)', () => {
  let sample = null;
  for (let seed = 1; seed <= 64 && !sample; seed++) {
    const s = runPlaythroughSession(seed, { maxLegs: 5 });
    if (!s.reachedDefeat && s.routeVisits >= 3 && s.shopVisits >= 1) sample = s;
  }
  assert.ok(sample, 'expected a seed that clears several legs with shop+dock');
  assert.ok(sample.legsCompleted >= 4, 'success path filed multiple legs');
});

test('playthrough sessions are deterministic under seed', () => {
  const a = runPlaythroughSession(11, { maxLegs: 5 });
  const b = runPlaythroughSession(11, { maxLegs: 5 });
  assert.deepEqual(a, b);
});
