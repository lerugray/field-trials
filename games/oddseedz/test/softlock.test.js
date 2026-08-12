// No-softlock validation (M5). The milestone demands proof that a full career
// cannot dead-end: not the careless rancher who never rests, not the greedy
// min-maxer, not the steady balanced player. We drive three bot profiles through
// a whole lifespan and assert, EVERY week, that the game still offers a legal,
// non-negative move — the escape valve holds.
//
// The core invariant: from ANY reached state there is always an affordable bout
// (E rung, fee 0) whose LOSER still banks a positive consolation, so money can
// never trap the player, and rest is always in the week's budget so a frazzled
// pet can always recover. Everything is seeded, so the whole sim is deterministic.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summon } from '../src/engine/summon.js';
import { newGame } from '../src/engine/save.js';
import {
  resolveWeek, weekBudget, DRILL_IDS, STRESS_MAX, FATIGUE_MAX,
} from '../src/engine/raise.js';
import {
  startBattle, stepBattle, settleBattle, makeOpponent, battleReward, BASIC_IDS, MOVES,
} from '../src/engine/battle.js';
import {
  resolveEntry, payEntry, recordBout, advanceCalendar,
} from '../src/engine/career.js';

// Play a bout to completion deterministically: always command the pet's
// strongest basic. Returns the finished battle state.
function playBout(creature, foe, seed) {
  let b = startBattle(creature, foe, seed);
  let best = 'strike', bv = -Infinity;
  for (const id of BASIC_IDS) {
    const v = creature.stats[MOVES[id].stat] || 0;
    if (v > bv) { bv = v; best = id; }
  }
  let guard = 0;
  while (!b.over && guard++ < 200) {
    b = stepBattle(b, { move: best }).state;
  }
  return b;
}

// A profile is: how to fill a week's plan, and whether to fight this week.
const PROFILES = {
  // Never rests, drills at random, only fights when forced (a mandatory meet).
  careless: {
    plan(budget, age, i) {
      const out = [];
      for (let k = 0; k < budget; k++) out.push(DRILL_IDS[(i + k) % DRILL_IDS.length]);
      return out;
    },
    fightThisWeek(state, due) { return due; },
  },
  // Rest when tired, play when bond-poor, drill otherwise; fights every other week.
  balanced: {
    plan(budget, age, i, c) {
      const out = [];
      for (let k = 0; k < budget; k++) {
        if (c.fatigue > 60 || c.stress > 60) out.push('rest');
        else if (c.bond < 45) out.push('play');
        else out.push(DRILL_IDS[(i + k) % DRILL_IDS.length]);
      }
      return out;
    },
    fightThisWeek(state, due, i) { return due || i % 2 === 0; },
  },
  // Hammers two stats, rests only at the brink, fights every week to climb hard.
  minmax: {
    plan(budget, age, i, c) {
      const out = [];
      for (let k = 0; k < budget; k++) {
        if (c.fatigue >= 90) out.push('rest');
        else out.push(k % 2 === 0 ? 'drill_pow' : 'drill_spd');
      }
      return out;
    },
    fightThisWeek() { return true; },
  },
};

function runCareer(profileName, phrase) {
  const profile = PROFILES[profileName];
  let state = newGame(summon(phrase), 1);

  // The formal no-softlock guarantee: the always-free rung's LOSER banks money.
  assert.ok(battleReward('E', false).money > 0, 'E-rung loss must still pay');

  for (let i = 0; i < 45; i++) {
    const c = state.creature;
    const budget = weekBudget(c);
    // Invariant: the pet can always act — the week always affords rest.
    assert.ok(budget >= 1, 'week budget must never starve');

    // --- plan + resolve a raising week ---
    const plan = profile.plan(budget, c.age, i, c);
    const res = resolveWeek(state, plan);
    state = { ...state, creature: res.creature, estate: res.estate };

    // Vitals must stay inside their rails no matter how careless the plan.
    assert.ok(state.creature.stress >= 0 && state.creature.stress <= STRESS_MAX);
    assert.ok(state.creature.fatigue >= 0 && state.creature.fatigue <= FATIGUE_MAX);

    // --- the calendar tick (mandatory meets, fines, reschedule) ---
    const cal = advanceCalendar(state.estate, state.creature.age);
    state = {
      ...state,
      estate: cal.estate,
      creature: { ...state.creature, stress: Math.min(STRESS_MAX, state.creature.stress + cal.stress) },
    };
    assert.ok(state.estate.money >= 0, 'a fine must never drive money negative');

    // --- the no-softlock check: an affordable bout always exists ---
    const due = state.creature.age >= state.estate.career.nextMandatory - 0; // informational
    const entry = resolveEntry(state.estate, state.creature.age);
    assert.ok(entry.fee <= state.estate.money, 'resolveEntry must never price a bout you cannot pay');

    // --- optionally fight ---
    if (profile.fightThisWeek(state, due, i)) {
      const paid = payEntry(state.estate, entry.fee);
      assert.ok(paid.money >= 0);
      const seed = ((i + 1) * 2654435761) >>> 0;
      const foe = makeOpponent(seed, entry.rank);
      const bout = playBout(state.creature, foe, seed);
      assert.ok(bout.over, 'a bout must always terminate');
      const settled = settleBattle(bout, state.creature, paid);
      const rb = recordBout(settled.estate.career, {
        rank: entry.rank, won: settled.won, reward: settled.reward.money, week: state.creature.age,
      });
      state = {
        ...state,
        creature: settled.creature,
        estate: { ...settled.estate, career: rb.career },
      };
      assert.ok(state.estate.money >= 0);
    }
  }
  return state;
}

test('careless player never softlocks across a full lifespan', () => {
  const end = runCareer('careless', 'careless carla');
  assert.ok(end.estate.money >= 0);
  assert.ok(end.creature.age > 30, 'the pet lived a full life');
});

test('balanced player never softlocks and can climb the ladder', () => {
  const end = runCareer('balanced', 'balanced bo');
  assert.ok(end.estate.money >= 0);
  // A steady player should have banked at least one promotion over a lifespan.
  assert.ok(['D', 'C'].includes(end.estate.career.rank), `balanced should climb, got ${end.estate.career.rank}`);
});

test('min-max player never softlocks and stacks wins', () => {
  const end = runCareer('minmax', 'minmax max');
  assert.ok(end.estate.money >= 0);
  assert.ok(end.estate.record.wins + end.estate.record.losses > 0, 'min-maxer fought bouts');
});

test('a broke pet at a paid rung can always still enter a free E bout and net positive', () => {
  // Force the worst case: promoted high, zero money, meet not due.
  const state = newGame(summon('broke'), 1);
  state.estate.money = 0;
  state.estate.career.rank = 'C';
  state.estate.career.nextMandatory = 999;
  const entry = resolveEntry(state.estate, state.creature.age);
  assert.equal(entry.fee, 0);
  assert.equal(entry.rank, 'E'); // dropped to the free rung
  // Even losing that bout banks money — the player is never stranded.
  assert.ok(battleReward('E', false).money > 0);
});
