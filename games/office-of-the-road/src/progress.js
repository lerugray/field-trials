// progress.js — THE NO-PROGRESS DETECTOR (DESIGN-SEED M5). The abandon valve is
// only useful if the game SURFACES when it is worth pulling. This is the loud
// signal: an expedition that has stalled — legs that end with net-negative gold
// and no equipment or certification gain — is going nowhere, and the valve (file
// for early return) should be offered plainly rather than left to be discovered.
//
// Pure state machine over per-leg deltas; node-testable. The UI holds a `streak`
// and asks these each leg boundary.

import { TUNING } from './tuning.js';

// legIsStale: did this leg fail to advance the expedition? Net-negative gold AND
// no new equipment AND no level/mastery gain (per the seed's exact condition).
export function legIsStale(netGold, gearGained, gainedXp) {
  return netGold < 0 && !gearGained && !gainedXp;
}

// bumpStreak: extend the stalled-leg streak, or reset it on a leg that advanced.
export function bumpStreak(streak, stale) {
  return stale ? (streak | 0) + 1 : 0;
}

// noProgress: has the streak reached the threshold that surfaces the valve?
export function noProgress(streak) {
  return (streak | 0) >= TUNING.noProgressLegs;
}
