import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summon, STAT_KEYS } from '../src/engine/summon.js';
import {
  resolveWeek,
  weekBudget,
  lifeStage,
  freshVitals,
  ACTIONS,
  DRILL_IDS,
  START_MONEY,
  WEEKLY_UPKEEP,
  STRESS_MAX,
  FATIGUE_MAX,
  STAT_CAP,
  LIFESPAN_WEEKS,
} from '../src/engine/raise.js';

// A minimal raise-ready state around a summoned creature.
function stateFor(phrase, over = {}) {
  const creature = { ...summon(phrase), ...freshVitals(), ...over.creature };
  return { version: 2, createdAt: 0, creature, estate: { money: START_MONEY, ...over.estate } };
}

test('life stages thin the budget with age (young > prime > elder)', () => {
  assert.equal(lifeStage(1).budget, 12);
  assert.equal(lifeStage(8).budget, 12);
  assert.equal(lifeStage(9).budget, 8);
  assert.equal(lifeStage(20).budget, 8);
  assert.equal(lifeStage(21).budget, 4);
  assert.equal(lifeStage(LIFESPAN_WEEKS).budget, 4);
  // past lifespan: still playable, still 4, and flagged twilight
  assert.equal(lifeStage(LIFESPAN_WEEKS + 5).key, 'twilight');
  assert.equal(lifeStage(LIFESPAN_WEEKS + 5).budget, 4);
});

test('a drill raises exactly its stat; untrained stats drift down', () => {
  const s = stateFor('driller');
  const before = { ...s.creature.stats };
  const res = resolveWeek(s, ['drill_pow']);
  assert.ok(res.deltas.stats.pow > 0, 'power should rise');
  for (const k of STAT_KEYS) {
    if (k === 'pow') continue;
    assert.equal(res.deltas.stats[k], -1, `${k} should drift -1 when untrained`);
  }
  // input untouched (pure)
  assert.deepEqual(s.creature.stats, before);
});

test('preview equals resolve: same plan yields identical deltas (deterministic)', () => {
  const s = stateFor('preview honesty');
  const plan = ['drill_spd', 'rest', 'drill_spd', 'play'];
  const a = resolveWeek(s, plan);
  const b = resolveWeek(s, plan);
  assert.deepEqual(a.deltas, b.deltas);
  assert.deepEqual(a.creature.stats, b.creature.stats);
});

test('resting early makes later drills land harder (order matters)', () => {
  // Fatigue the pet, then compare drill-first vs rest-first on the same stat.
  const s = stateFor('tired', { creature: { fatigue: FATIGUE_MAX, stress: 0 } });
  const drillFirst = resolveWeek(s, ['drill_foc', 'rest']);
  const restFirst = resolveWeek(s, ['rest', 'drill_foc']);
  assert.ok(
    restFirst.deltas.stats.foc >= drillFirst.deltas.stats.foc,
    'a rest before the drill should not gain less',
  );
});

test('drills add stress + fatigue and nick bond; rest and play are the sinks', () => {
  const s = stateFor('vitals');
  const drilled = resolveWeek(s, ['drill_pow', 'drill_pow']);
  assert.ok(drilled.deltas.stress > 0 && drilled.deltas.fatigue > 0);
  assert.ok(drilled.deltas.bond < 0, 'training drains bond');

  const stressed = stateFor('stressed', { creature: { stress: 60, fatigue: 60 } });
  const rested = resolveWeek(stressed, ['rest']);
  assert.ok(rested.deltas.stress < 0 && rested.deltas.fatigue < 0);

  const played = resolveWeek(s, ['play']);
  assert.ok(played.deltas.bond > 0, 'care raises bond');
});

test('a fully fatigued+stressed drill still yields at least 1 (always gives)', () => {
  const s = stateFor('maxed', { creature: { fatigue: FATIGUE_MAX, stress: STRESS_MAX } });
  const res = resolveWeek(s, ['drill_sta']);
  assert.ok(res.deltas.stats.sta >= 1);
});

test('the week ages the pet and charges upkeep', () => {
  const s = stateFor('aged');
  const res = resolveWeek(s, ['rest']);
  assert.equal(res.creature.age, s.creature.age + 1);
  assert.equal(res.estate.money, START_MONEY - WEEKLY_UPKEEP);
  assert.equal(res.deltas.age, 1);
  assert.equal(res.deltas.money, -WEEKLY_UPKEEP);
});

test('over-budget plans are clamped to the week budget', () => {
  const s = stateFor('greedy'); // young -> 12 actions
  assert.equal(weekBudget(s.creature), 12);
  const plan = new Array(30).fill('drill_pow');
  const res = resolveWeek(s, plan);
  assert.equal(res.summary.spent, 12, 'only the budget is honored');
  assert.equal(res.summary.budget, 12);
});

test('vitals stay within their ceilings and floors', () => {
  const s = stateFor('bounds', { creature: { bond: 99, stress: 95, fatigue: 95 } });
  const plan = [...DRILL_IDS, ...DRILL_IDS]; // hammer everything
  const res = resolveWeek(s, plan);
  assert.ok(res.creature.stress <= STRESS_MAX && res.creature.stress >= 0);
  assert.ok(res.creature.fatigue <= FATIGUE_MAX && res.creature.fatigue >= 0);
  assert.ok(res.creature.bond <= 100 && res.creature.bond >= 0);
  for (const k of STAT_KEYS) assert.ok(res.creature.stats[k] <= STAT_CAP);
});

test('an empty week still passes time (all stats drift, pet ages)', () => {
  const s = stateFor('idle');
  const res = resolveWeek(s, []);
  for (const k of STAT_KEYS) assert.equal(res.deltas.stats[k], -1);
  assert.equal(res.creature.age, s.creature.age + 1);
  assert.equal(res.summary.spent, 0);
});

test('ACTIONS table exposes the five drills, rest and play', () => {
  assert.equal(DRILL_IDS.length, 5);
  for (const id of DRILL_IDS) assert.equal(ACTIONS[id].kind, 'drill');
  assert.equal(ACTIONS.rest.kind, 'rest');
  assert.equal(ACTIONS.play.kind, 'care');
});
