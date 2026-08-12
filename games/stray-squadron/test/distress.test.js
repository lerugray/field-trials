// The distress / rescue beat (M7). Seeded and deterministic: a plan is stable for a
// (seed, node); the pod is reachable; rescuing keeps the wingmate; missing it loses
// them for the run. Never an unavoidable stake (missing a rescue never damages the
// ship — it only costs coverage).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planDistress, rescuePod, resolveDistress, DISTRESS } from '../src/run/distress.js';
import { generateRoster, rosterSupport } from '../src/run/wingmates.js';
import { collectPickups } from '../src/combat/pickups.js';

const NODE = { id: '1-0' };
const LEVEL_END = 1400;

test('a distress plan is deterministic for a (seed, node)', () => {
  const roster = generateRoster('d-seed', ['Vesper']);
  const a = planDistress('run-1', NODE, roster, LEVEL_END);
  const b = planDistress('run-1', NODE, roster, LEVEL_END);
  assert.deepEqual(a, b);
});

test('distress does not fire every level, but does fire across seeds', () => {
  const roster = generateRoster('d-seed', ['Vesper']);
  let fired = 0, total = 0;
  for (let i = 0; i < 60; i++) {
    total++;
    if (planDistress('run-' + i, NODE, roster, LEVEL_END)) fired++;
  }
  assert.ok(fired > 5 && fired < total, 'distress should be sometimes, not always/never');
});

test('a plan names a living wingmate and a reachable, in-bounds station', () => {
  const roster = generateRoster('reach', ['Vesper', 'Tuck']);
  for (let i = 0; i < 80; i++) {
    const plan = planDistress('r' + i, NODE, roster, LEVEL_END);
    if (!plan) continue;
    assert.ok(roster.some((w) => w.id === plan.wingId && w.alive), 'victim is a living wingmate');
    assert.ok(plan.station >= DISTRESS.minStation, 'not in the opening stretch');
    assert.ok(plan.station <= LEVEL_END - DISTRESS.endPad, 'reachable before the end');
    assert.ok(Math.abs(plan.lat) <= DISTRESS.latRange, 'lat in the reachable frame');
    assert.ok(Math.abs(plan.vert) <= DISTRESS.vertRange, 'vert in the reachable frame');
  }
});

test('no plan when every wingmate is already lost', () => {
  const roster = generateRoster('gone');
  for (const w of roster) w.alive = false;
  assert.equal(planDistress('run', NODE, roster, LEVEL_END), null);
});

test('distress biases into a calm rescue chunk when one is offered', () => {
  const roster = generateRoster('calm', ['Vesper']);
  const chunks = [
    { type: 'wave', s0: 34, s1: 400 },
    { type: 'rescue', s0: 600, s1: 760 },
    { type: 'wave', s0: 760, s1: 1400 },
  ];
  let inCalm = 0, planned = 0;
  for (let i = 0; i < 60; i++) {
    const plan = planDistress('cr' + i, NODE, roster, LEVEL_END, chunks);
    if (!plan) continue;
    planned++;
    if (plan.station >= 600 && plan.station <= 760) inCalm++;
  }
  assert.ok(planned > 0);
  assert.equal(inCalm, planned, 'every planned pod lands in the offered rescue chunk');
});

test('collecting the rescue pod keeps the wingmate; a rescue banks its score cache', () => {
  const roster = generateRoster('resc', ['Vesper']);
  const plan = { wingId: roster[0].id, station: 700, lat: 0, vert: 0 };
  const pod = rescuePod(plan, 1);
  const run = { score: 0 };
  const player = { hull: 3, maxHull: 6 };
  // fly through it
  const got = collectPickups([pod], pod.s, pod.lat, pod.vert, player, run);
  assert.equal(got.length, 1);
  assert.equal(pod.taken, true);
  assert.equal(run.score, DISTRESS.rescueScore, 'rescue banks its score cache');
  assert.equal(player.hull, 3, 'a rescue pod is not a heal');
  const before = rosterSupport(roster).aliveCount;
  const out = resolveDistress(plan, pod, roster, NODE.id);
  assert.equal(out.outcome, 'rescued');
  assert.equal(rosterSupport(roster).aliveCount, before, 'rescued wingmate stays');
  assert.equal(roster[0].alive, true);
});

test('an unrescued distress loses the wingmate for the run remainder', () => {
  const roster = generateRoster('miss', ['Vesper']);
  const plan = { wingId: roster[0].id, station: 700, lat: 0, vert: 0 };
  const pod = rescuePod(plan, 1);
  const supBefore = rosterSupport(roster);
  const out = resolveDistress(plan, pod, roster, '2-1'); // pod never taken
  assert.equal(out.outcome, 'lost');
  assert.equal(roster[0].alive, false);
  assert.equal(roster[0].lostAt, '2-1');
  const supAfter = rosterSupport(roster);
  assert.equal(supAfter.aliveCount, supBefore.aliveCount - 1);
});

test('resolveDistress on no-plan is a safe no-op', () => {
  const roster = generateRoster('none');
  assert.equal(resolveDistress(null, null, roster, 'n'), null);
  assert.equal(rosterSupport(roster).aliveCount, roster.length);
});
