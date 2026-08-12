// Schedule-driven raising: the rancher's year in compressed weeks. A week is a
// QUEUE of actions the player spends from a thinning budget; resolving the week
// applies drills, rest and care, then ages the pet by one week.
//
// Everything here is a PURE, DETERMINISTIC function of (state, plan) — no RNG,
// no clock. That is deliberate: the planner must PREVIEW the exact before/after
// it will commit, so preview and resolve are literally the same computation.
// "No hidden psychology": every delta is a formula the player could learn.

import { STAT_KEYS } from './summon.js';

// --- Estate / vitals constants (M5 tunes these; the seed left them open) ------
export const START_MONEY = 500;
export const WEEKLY_UPKEEP = 20;

export const STRESS_MAX = 100;
export const FATIGUE_MAX = 100;
export const BOND_MAX = 100;
export const STAT_CAP = 99;
export const STAT_FLOOR = 5;

// Fresh-pet vitals. Bond starts warm-ish (a new summon likes you a little);
// stress/fatigue start clear; age is measured in weeks lived (1 = first week).
export const START_BOND = 50;

export function freshVitals() {
  return { bond: START_BOND, stress: 0, fatigue: 0, age: 1 };
}

// --- Aging thins the budget: young ~12 -> prime ~8 -> elder ~4 ----------------
// Bandwidth shrinks before any UI says "time's up." Lifespan is a v1 constant;
// past it the pet is retirement-due (retirement itself lands in M6).
export const LIFESPAN_WEEKS = 30;

// Elder runs up to (not including) the lifespan week: at LIFESPAN_WEEKS the pet
// crosses into Twilight, the same week isRetirementDue() begins nudging. Keeping
// the two thresholds identical is deliberate — an off-by-one here once let the
// card say "Elder" while retirement was already due.
const LIFE_STAGES = [
  { key: 'young', label: 'Young', maxWeek: 8, budget: 12 },
  { key: 'prime', label: 'Prime', maxWeek: 20, budget: 8 },
  { key: 'elder', label: 'Elder', maxWeek: LIFESPAN_WEEKS - 1, budget: 4 },
];

export function lifeStage(age) {
  for (const s of LIFE_STAGES) {
    if (age <= s.maxWeek) return s;
  }
  // past the natural lifespan: still playable, still 4 actions, retirement-due
  return { key: 'twilight', label: 'Twilight', maxWeek: Infinity, budget: 4 };
}

// Actions the player may draw this week. drills raise one stat; rest is the
// stress/fatigue sink; play (care) trades an action for Bond. care and training
// draw from the SAME pool — that split IS the game.
export const ACTIONS = {
  drill_pow: { id: 'drill_pow', kind: 'drill', stat: 'pow', label: 'Power', glyph: '⚔' },
  drill_def: { id: 'drill_def', kind: 'drill', stat: 'def', label: 'Defense', glyph: '⛨' },
  drill_spd: { id: 'drill_spd', kind: 'drill', stat: 'spd', label: 'Speed', glyph: '➤' },
  drill_sta: { id: 'drill_sta', kind: 'drill', stat: 'sta', label: 'Stamina', glyph: '♥' },
  drill_foc: { id: 'drill_foc', kind: 'drill', stat: 'foc', label: 'Focus', glyph: '◉' },
  rest: { id: 'rest', kind: 'rest', label: 'Rest', glyph: '☾' },
  play: { id: 'play', kind: 'care', label: 'Play', glyph: '♡' },
};

export const DRILL_IDS = ['drill_pow', 'drill_def', 'drill_spd', 'drill_sta', 'drill_foc'];

// Per-action tuning. Kept in one table so balance is one edit.
const DRILL_BASE_GAIN = 4;
const DRILL_FATIGUE = 14;
const DRILL_STRESS = 7;
const DRILL_BOND_COST = 1;

const REST_FATIGUE = 28;
const REST_STRESS = 20;
const REST_BOND = 1;

const PLAY_BOND = 6;
const PLAY_STRESS = 8;
const PLAY_FATIGUE = 1;

const DRIFT = 1; // undrilled stats drift down a touch each week (care costs stats)

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

// How much a drill yields RIGHT NOW, given tiredness, stress and headroom. A
// fresh pet gets the full gain; a maxed-fatigue, maxed-stress pet still gets 1
// (a drill always does something visible — the generous/hand-holding posture).
function drillGain(statVal, fatigue, stress) {
  const effectiveness = clamp(1 - (fatigue / FATIGUE_MAX) * 0.7 - (stress / STRESS_MAX) * 0.3, 0, 1);
  const room = clamp((STAT_CAP - statVal) / STAT_CAP, 0.2, 1);
  return Math.max(1, Math.round(DRILL_BASE_GAIN * effectiveness * room));
}

// A snapshot of the raising-relevant numbers, pulled from state.creature.
function vitalsOf(creature) {
  return {
    stats: { ...creature.stats },
    bond: creature.bond,
    stress: creature.stress,
    fatigue: creature.fatigue,
    age: creature.age,
  };
}

// The budget for THIS week (a function of the pet's current age).
export function weekBudget(creature) {
  return lifeStage(creature.age).budget;
}

// Resolve a planned week. Returns { creature, estate, deltas, summary } WITHOUT
// mutating the inputs. Actions apply IN ORDER, so resting early makes later
// drills land harder — the player can sequence the week, and preview shows it
// honestly. Only the first `budget` actions are honored (UI enforces the cap;
// this is the belt-and-braces guard).
export function resolveWeek(state, plan) {
  const c = state.creature;
  const estate = state.estate || { money: START_MONEY };
  const budget = weekBudget(c);
  const actions = (plan || []).slice(0, budget);

  const v = vitalsOf(c);
  const before = vitalsOf(c);
  const beforeMoney = estate.money;
  const drilled = new Set();
  let drills = 0;
  let rests = 0;
  let plays = 0;

  for (const id of actions) {
    const a = ACTIONS[id];
    if (!a) continue;
    if (a.kind === 'drill') {
      const g = drillGain(v.stats[a.stat], v.fatigue, v.stress);
      v.stats[a.stat] = clamp(v.stats[a.stat] + g, STAT_FLOOR, STAT_CAP);
      v.fatigue = clamp(v.fatigue + DRILL_FATIGUE, 0, FATIGUE_MAX);
      v.stress = clamp(v.stress + DRILL_STRESS, 0, STRESS_MAX);
      v.bond = clamp(v.bond - DRILL_BOND_COST, 0, BOND_MAX);
      drilled.add(a.stat);
      drills++;
    } else if (a.kind === 'rest') {
      v.fatigue = clamp(v.fatigue - REST_FATIGUE, 0, FATIGUE_MAX);
      v.stress = clamp(v.stress - REST_STRESS, 0, STRESS_MAX);
      v.bond = clamp(v.bond + REST_BOND, 0, BOND_MAX);
      rests++;
    } else if (a.kind === 'care') {
      v.bond = clamp(v.bond + PLAY_BOND, 0, BOND_MAX);
      v.stress = clamp(v.stress - PLAY_STRESS, 0, STRESS_MAX);
      v.fatigue = clamp(v.fatigue + PLAY_FATIGUE, 0, FATIGUE_MAX);
      plays++;
    }
  }

  // Stats not trained this week drift down a little: a pure-care week costs
  // stats, a pure-drill week neglects Bond. Two hungers, one pool.
  for (const key of STAT_KEYS) {
    if (!drilled.has(key)) v.stats[key] = clamp(v.stats[key] - DRIFT, STAT_FLOOR, STAT_CAP);
  }

  // Upkeep drains the purse but never past empty: going broke is the economy
  // pressure, not a negative-debt dead-end (M5 no-softlock posture). A broke
  // rancher recovers by fighting the always-free E rung, never by owing money.
  const money = Math.max(0, beforeMoney - WEEKLY_UPKEEP);
  const nextAge = c.age + 1;

  const nextCreature = {
    ...c,
    stats: v.stats,
    bond: v.bond,
    stress: v.stress,
    fatigue: v.fatigue,
    age: nextAge,
  };
  const nextEstate = { ...estate, money };

  const statDeltas = {};
  for (const key of STAT_KEYS) statDeltas[key] = v.stats[key] - before.stats[key];

  const deltas = {
    stats: statDeltas,
    bond: v.bond - before.bond,
    stress: v.stress - before.stress,
    fatigue: v.fatigue - before.fatigue,
    money: money - beforeMoney,
    age: nextAge - before.age,
  };

  return {
    creature: nextCreature,
    estate: nextEstate,
    deltas,
    summary: { drills, rests, plays, spent: actions.length, budget },
  };
}
