// Pacing model (M8 balance pass). The design target is a v1 constant: ~45 active
// minutes hatch-to-retirement (DESIGN-SEED, "The loop"). That target had lived as
// a hand-feel assertion; M8 makes it a COMPUTED, TUNABLE function so the balance
// pass can assert it and any future change to the calendar (lifespan, stage
// budgets, mandatory cadence) is checked against the clock, not vibes.
//
// The model is deliberately transparent. A first life's real minutes are
// dominated by three things a player actually spends time on:
//   1. WEEK ACTIONS — each week offers a budget of actions (young 12 -> prime 8
//      -> elder 4); choosing + committing each one costs a few seconds.
//   2. WEEK OVERHEAD — reading the before/after preview and confirming the week.
//   3. BATTLES — a coached bout runs several rounds; mandatory meets come due on
//      a fixed cadence and a player fights some optional bouts between them.
//
// We do NOT claim one true number. Different players move at different speeds, so
// the model brackets the target: a FAST player (skims previews, fights only the
// mandatory meets) sets the floor, a DELIBERATE player (ponders every action,
// fights often) sets the ceiling. The 45-minute target should sit BETWEEN them —
// achievable and central, not an edge case. That bracket is the balance invariant
// pacing.test.js asserts, and the lever the tuning pass turns.

import { lifeStage, LIFESPAN_WEEKS } from './raise.js';
import { MANDATORY_INTERVAL } from './career.js';

// The v1 design target, in minutes, hatch-to-retirement.
export const LIFE_TIME_TARGET_MIN = 45;

// How many actions a full first life presents, summed over the aging budgets. A
// player rarely leaves a week's budget unspent (the budget IS the week), so total
// actions ~= sum of each week's budget from hatch to retirement.
export function lifetimeActionBudget(lifespanWeeks = LIFESPAN_WEEKS) {
  let total = 0;
  for (let week = 1; week <= lifespanWeeks; week++) {
    total += lifeStage(week).budget;
  }
  return total;
}

// How many bouts a player fights across a life, given how often they opt in
// between the mandatory meets. `battleEagerness` in [0,1]: 0 = mandatory meets
// only, 1 = a bout essentially every week. Mandatory meets are the floor.
export function lifetimeBattleCount(lifespanWeeks = LIFESPAN_WEEKS, battleEagerness = 0) {
  const mandatory = Math.floor(lifespanWeeks / MANDATORY_INTERVAL);
  const optional = Math.round((lifespanWeeks - mandatory) * clamp01(battleEagerness));
  return mandatory + optional;
}

function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

// Estimate a full first life in MINUTES for one play-speed profile.
//   secondsPerAction — time to choose + queue one week action
//   weekOverhead     — seconds to read the preview and commit the week
//   secondsPerBattle — time for one coached bout, start to KO
//   battleEagerness  — how often optional bouts are taken (see above)
export function estimateLifeMinutes(profile, lifespanWeeks = LIFESPAN_WEEKS) {
  const { secondsPerAction, weekOverhead, secondsPerBattle, battleEagerness } = profile;
  const actions = lifetimeActionBudget(lifespanWeeks);
  const battles = lifetimeBattleCount(lifespanWeeks, battleEagerness);
  const seconds =
    actions * secondsPerAction +
    lifespanWeeks * weekOverhead +
    battles * secondsPerBattle;
  return seconds / 60;
}

// The two bracketing play-speed profiles. A first life should run between these,
// with the 45-minute target sitting inside the bracket.
export const FAST_PLAYER = {
  label: 'fast',
  secondsPerAction: 3, // skims the preview, clicks through
  weekOverhead: 2,
  secondsPerBattle: 30, // ends bouts quickly, few rounds
  battleEagerness: 0, // fights only the mandatory meets
};

export const DELIBERATE_PLAYER = {
  label: 'deliberate',
  secondsPerAction: 8, // weighs each action against fatigue/stress/bond
  weekOverhead: 6,
  secondsPerBattle: 75, // coaches every round, reads the log
  battleEagerness: 0.5, // fights roughly every other free week
};

// The bracket for the current calendar: [fastMinutes, deliberateMinutes].
export function lifeTimeBracket(lifespanWeeks = LIFESPAN_WEEKS) {
  return {
    fast: estimateLifeMinutes(FAST_PLAYER, lifespanWeeks),
    deliberate: estimateLifeMinutes(DELIBERATE_PLAYER, lifespanWeeks),
    target: LIFE_TIME_TARGET_MIN,
    weeks: lifespanWeeks,
  };
}
