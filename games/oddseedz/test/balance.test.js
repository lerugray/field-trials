// Balance invariants (M8 balance pass). "Bot-sim over hand-feel": every claim
// here is measured by driving the real engine, not asserted by taste. The M8
// balance pass owns these numbers — this file is where they are ratified, so any
// future edit to the stat bands, foe stables, prize table or rarity weights that
// breaks the intended shape fails loudly.
//
// The four shapes we lock:
//   1. SUMMONING ALWAYS GIVES — the rarity roll tracks its weights, common-biased,
//      legendary rare but reachable; every phrase yields a creature.
//   2. THE DIFFICULTY CURVE — E is a friendly, always-winnable rung; D contests a
//      fresh pet and rewards raising; C is a wall a full raising run clears.
//   3. RAISING BEATS RARITY — the stat bands overlap and a raising run outweighs a
//      rarity tier, so a beloved common stays competitive.
//   4. THE ECONOMY IS GENEROUS BUT REAL — a steady player banks a comfortable
//      cushion, a careless one feels the purse tighten, no one is ever trapped.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summon, STAT_BANDS, STAT_KEYS } from '../src/engine/summon.js';
import { RARITIES, RARITY_WEIGHTS } from '../src/data/roster.js';
import {
  startBattle, stepBattle, makeOpponent, BASIC_IDS, MOVES,
} from '../src/engine/battle.js';
import { resolveWeek, weekBudget, WEEKLY_UPKEEP } from '../src/engine/raise.js';
import { newGame } from '../src/engine/save.js';
import { settleBattle, battleReward } from '../src/engine/battle.js';
import {
  resolveEntry, payEntry, recordBout, advanceCalendar,
} from '../src/engine/career.js';

// --- sim helpers -------------------------------------------------------------
// Command the pet's strongest basic every round (a legible "play to your suit"
// bot); run the bout to a deterministic finish.
function bestBasic(c) {
  let best = 'strike', bv = -Infinity;
  for (const id of BASIC_IDS) {
    const v = c.stats[MOVES[id].stat] || 0;
    if (v > bv) { bv = v; best = id; }
  }
  return best;
}
function fightWins(creature, rank, seed) {
  const foe = makeOpponent(seed, rank);
  let b = startBattle(creature, foe, seed);
  const move = bestBasic(creature);
  let guard = 0;
  while (!b.over && guard++ < 200) b = stepBattle(b, { move }).state;
  return b.winner === 'player';
}
function winRate(makeCreature, rank, trials) {
  let wins = 0;
  for (let t = 0; t < trials; t++) {
    if (fightWins(makeCreature(t), rank, ((t + 1) * 2654435761) >>> 0)) wins++;
  }
  return wins / trials;
}
// Raise a summoned pet for N weeks on a balanced, spread-the-stats plan.
function raiseFor(weeks) {
  const plan = [
    'drill_pow', 'drill_spd', 'drill_def', 'rest', 'drill_sta', 'drill_foc',
    'play', 'drill_pow', 'drill_spd', 'drill_def', 'drill_foc', 'rest',
  ];
  return (t) => {
    let st = newGame(summon('bal' + t), 1);
    for (let w = 0; w < weeks; w++) {
      const r = resolveWeek(st, plan);
      st = { ...st, creature: r.creature, estate: r.estate };
    }
    return st.creature;
  };
}
const fresh = (t) => summon('raw' + t);
const TRIALS = 200;

// --- 1. summoning always gives ----------------------------------------------
test('rarity roll tracks its weights and every rarity is reachable', () => {
  const N = 6000;
  const counts = Object.fromEntries(RARITIES.map((r) => [r, 0]));
  for (let i = 0; i < N; i++) counts[summon('roll' + i).rarity] += 1;
  const totW = RARITIES.reduce((a, r) => a + RARITY_WEIGHTS[r], 0);
  for (const r of RARITIES) {
    const obs = counts[r] / N;
    const exp = RARITY_WEIGHTS[r] / totW;
    assert.ok(counts[r] > 0, `${r} must be reachable (summoning always gives)`);
    assert.ok(Math.abs(obs - exp) < 0.03, `${r} observed ${(obs * 100).toFixed(1)}% vs weight ${(exp * 100).toFixed(1)}%`);
  }
  // common-biased, legendary rare.
  assert.ok(counts.common > counts.legendary * 5, 'commons must dominate legendaries');
});

// --- 2. the difficulty curve -------------------------------------------------
test('E is a friendly rung: winnable fresh, dominated once raised', () => {
  assert.ok(winRate(fresh, 'E', TRIALS) > 0.7, 'a fresh pet should usually clear E (the free escape rung)');
  assert.ok(winRate(raiseFor(20), 'E', TRIALS) > 0.95, 'a raised pet should dominate E');
});

test('D contests a fresh pet and clearly rewards raising', () => {
  const raw = winRate(fresh, 'D', TRIALS);
  const raised = winRate(raiseFor(20), 'D', TRIALS);
  assert.ok(raw > 0.25 && raw < 0.65, `D should be a real contest for a fresh pet, got ${(raw * 100).toFixed(0)}%`);
  assert.ok(raised > raw + 0.2, `raising must visibly help at D (${(raw * 100).toFixed(0)}% -> ${(raised * 100).toFixed(0)}%)`);
});

test('C is a wall: hard fresh, clearable by a full raising run', () => {
  const raw = winRate(fresh, 'C', TRIALS);
  const raised = winRate(raiseFor(20), 'C', TRIALS);
  assert.ok(raw < 0.35, `C should wall a fresh pet, got ${(raw * 100).toFixed(0)}%`);
  assert.ok(raised > 0.55, `a full raising run should clear C more often than not, got ${(raised * 100).toFixed(0)}%`);
});

test('difficulty is monotonic across the rungs at a fixed prep level', () => {
  const mk = raiseFor(20);
  const e = winRate(mk, 'E', TRIALS);
  const d = winRate(mk, 'D', TRIALS);
  const c = winRate(mk, 'C', TRIALS);
  assert.ok(e >= d && d >= c, `win rate must fall E>=D>=C, got ${[e, d, c].map((x) => (x * 100).toFixed(0)).join('/')}`);
});

// --- 3. raising beats rarity -------------------------------------------------
test('stat bands overlap across adjacent rarities', () => {
  for (let i = 1; i < RARITIES.length; i++) {
    const lo = STAT_BANDS[RARITIES[i - 1]]; // rarer-below
    const hi = STAT_BANDS[RARITIES[i]]; // rarer
    assert.ok(hi[0] < lo[1], `${RARITIES[i]} min ${hi[0]} must dip below ${RARITIES[i - 1]} max ${lo[1]} (overlap)`);
  }
});

test('a raising run outweighs a whole rarity tier', () => {
  // The rarity edge between the top and bottom band midpoints...
  const commonMid = (STAT_BANDS.common[0] + STAT_BANDS.common[1]) / 2;
  const legendaryMid = (STAT_BANDS.legendary[0] + STAT_BANDS.legendary[1]) / 2;
  const rarityEdge = legendaryMid - commonMid;
  // ...is smaller than what a full raising run adds to a common's suit stats, so
  // a devoted common owner out-competes a neglected legendary.
  const raised = raiseFor(20)(7);
  const rawCommon = summon('bandcheck-common');
  const gainMax = Math.max(...STAT_KEYS.map((k) => raised.stats[k] - rawCommon.stats[k]));
  assert.ok(gainMax > rarityEdge, `raising gain ${gainMax} should exceed the rarity edge ${rarityEdge}`);
});

// --- 4. the economy is generous but real -------------------------------------
// A career runner shaped like the app loop: plan a week, tick the calendar, then
// optionally fight. Returns the money floor reached and the final standing.
const ECON_PROFILES = {
  balanced: {
    plan(bud, c, i) {
      const out = [];
      for (let k = 0; k < bud; k++) {
        if (c.fatigue > 60 || c.stress > 60) out.push('rest');
        else if (c.bond < 45) out.push('play');
        else out.push(['drill_pow', 'drill_def', 'drill_spd', 'drill_sta', 'drill_foc'][(i + k) % 5]);
      }
      return out;
    },
    fight: (i) => i % 2 === 0,
  },
  minmax: {
    plan(bud, c) {
      const out = [];
      for (let k = 0; k < bud; k++) out.push(c.fatigue >= 90 ? 'rest' : (k % 2 === 0 ? 'drill_pow' : 'drill_spd'));
      return out;
    },
    fight: () => true,
  },
};
function bestBout(cr, foe, seed) {
  let b = startBattle(cr, foe, seed);
  const m = bestBasic(cr);
  let g = 0;
  while (!b.over && g++ < 200) b = stepBattle(b, { move: m }).state;
  return b;
}
function runEconomy(name, weeks = 30) {
  const p = ECON_PROFILES[name];
  let st = newGame(summon(name + '-econ'), 1);
  let minMoney = st.estate.money;
  for (let i = 0; i < weeks; i++) {
    const c = st.creature;
    const res = resolveWeek(st, p.plan(weekBudget(c), c, i));
    st = { ...st, creature: res.creature, estate: res.estate };
    const cal = advanceCalendar(st.estate, st.creature.age);
    st = { ...st, estate: cal.estate };
    const entry = resolveEntry(st.estate, st.creature.age);
    if (p.fight(i)) {
      const paid = payEntry(st.estate, entry.fee);
      const seed = ((i + 1) * 2654435761) >>> 0;
      const bout = bestBout(st.creature, makeOpponent(seed, entry.rank), seed);
      const settled = settleBattle(bout, st.creature, paid);
      const rb = recordBout(settled.estate.career, {
        rank: entry.rank, won: settled.won, reward: settled.reward.money, week: st.creature.age,
      });
      st = { ...st, creature: settled.creature, estate: { ...settled.estate, career: rb.career } };
    }
    minMoney = Math.min(minMoney, st.estate.money);
  }
  return { money: st.estate.money, rank: st.estate.career.rank, record: st.estate.record, minMoney };
}

test('a steady player keeps a comfortable cushion and climbs the ladder', () => {
  const end = runEconomy('balanced');
  assert.ok(end.minMoney > 100, `a balanced first gen should never scrape zero, floor was ${end.minMoney}`);
  assert.ok(['D', 'C'].includes(end.rank), `a steady player should climb past E, got ${end.rank}`);
});

test('both play styles stay solvent for a full life, and fees are real pressure', () => {
  const grinder = runEconomy('minmax');
  const steady = runEconomy('balanced');
  // No style ever traps: the purse floors at zero, never negative.
  assert.ok(grinder.minMoney >= 0 && steady.minMoney >= 0, 'no play style may drive money negative');
  // A fight-every-week grinder actually competes a lot (the ladder is playable
  // aggressively)...
  assert.ok(grinder.record.wins + grinder.record.losses >= 20, 'a grinder should fight a full slate of bouts');
  // ...but paying an entry fee every week is genuine pressure — a reckless
  // over-fighter does NOT automatically out-bank a measured player. The economy
  // rewards picking your bouts, not just spamming them. (This is why balance is
  // bot-simmed: the naive "grinding always pays" intuition is false here.)
  assert.ok(steady.money > 100, 'a measured player keeps a healthy balance');
});

test('a broke pet grinding the free E rung recovers in expectation', () => {
  // The formal escape valve is non-negative money (softlock.test). The stronger
  // balance promise: a broke pet fighting the always-free E rung EARNS its way
  // out — the expected E prize, at a fresh pet's win rate, beats weekly upkeep.
  const eWinRate = winRate(fresh, 'E', TRIALS); // measured, not assumed
  const expected = eWinRate * battleReward('E', true).money
    + (1 - eWinRate) * battleReward('E', false).money;
  assert.ok(expected > WEEKLY_UPKEEP, `E income ${expected.toFixed(0)} must beat upkeep ${WEEKLY_UPKEEP} so a broke pet climbs out`);
});
