// The distress / rescue beat (M7) — the stakes the M4 "rescue" breather chunk has
// been pointing at all along. M4 dropped heal/score pods into a calm stretch; M7
// matures it: on some levels a wingmate goes down and a RESCUE POD marks where. Fly
// through it in time and they are back on the wing (plus a little salvage-score for
// the swing over); miss it and they are LOST for the remainder of the run, taking
// their passive support and callouts with them.
//
// This is the mortality mechanism WITHOUT a live combatant AI: no wingmate is flying
// and dying in the sim (that is the named cut). The distress is a seeded event with a
// pod to reach, resolved by whether you reached it. Pure + deterministic; main.js
// injects the pod into the level and calls resolveDistress at level end.

import { makeRng } from '../core/rng.js';
import { loseWingmate } from './wingmates.js';

export const DISTRESS = {
  chance: 0.5,        // how often a level carries a distress (seeded per node)
  minStation: 300,    // never in the opening stretch — give the pilot room to settle
  endPad: 120,        // ...and never so late the pod can't be reached before the end
  latRange: 2.2,      // placed inside the reachable steer frame (grabbable, a gift)
  vertRange: 1.4,
  radius: 1.3,        // a generous grab radius (rescuing is not a skill check)
  rescueScore: 250,   // a small score cache for the swing over (the reward is the wing)
};

// Plan the distress for ONE level. Deterministic from (runSeed, node id) so a given
// run always plays the same beats. Returns { wingId, station, lat, vert } or null when
// this level has no distress. `living` = the wingmates still alive (a lost one can't
// be in distress again). `levelEnd` bounds late placement; `chunks` (optional) biases
// the pod into a calm rescue stretch when one exists.
export function planDistress(runSeed, node, living, levelEnd, chunks = null) {
  const alive = (living || []).filter((w) => w && w.alive);
  if (!alive.length) return null;
  const rng = makeRng(String(runSeed) + ':distress:' + (node && node.id));
  if (!rng.chance(DISTRESS.chance)) return null;

  const wing = rng.pick(alive);
  const lo = DISTRESS.minStation;
  const hi = Math.max(lo + 1, levelEnd - DISTRESS.endPad);

  // Prefer a calm rescue chunk that overlaps the reachable window, so the pod settles
  // in a breather rather than the middle of a firefight. Fall back to mid-level.
  let station;
  const calm = (chunks || []).filter((c) => c.type === 'rescue' && c.s1 > lo + 5 && c.s0 < hi);
  if (calm.length) {
    const c = rng.pick(calm);
    const a = Math.max(c.s0, lo) + 5;
    const b = Math.min(c.s1, hi) - 5;
    station = b > a ? rng.range(a, b) : (a + b) / 2;
  } else {
    station = rng.range(lo, hi);
  }

  return {
    wingId: wing.id,
    station,
    lat: rng.range(-DISTRESS.latRange, DISTRESS.latRange),
    vert: rng.range(-DISTRESS.vertRange, DISTRESS.vertRange),
  };
}

// Build the rescue pod pickup for a plan (shares the pickup shape so collectPickups
// grabs it with the same disk test). kind 'rescue' + wingId flag it; a small score
// cache rides along so the grab is tangible, and hull 0 (rescuing is not a heal).
export function rescuePod(plan, id) {
  return {
    id, s: plan.station, kind: 'rescue', wingId: plan.wingId,
    lat: plan.lat, vert: plan.vert,
    hull: 0, score: DISTRESS.rescueScore,
    radius: DISTRESS.radius, taken: false, spin: 0,
  };
}

// Resolve a level's distress once the level is over. If the pod was taken -> rescued
// (the wingmate stays); else the wingmate is lost for the run (mutates the roster).
// Returns { outcome:'rescued'|'lost', wing } or null when there was no distress.
export function resolveDistress(plan, pod, roster, atNode) {
  if (!plan) return null;
  const wing = (roster || []).find((w) => w.id === plan.wingId) || null;
  if (pod && pod.taken) return { outcome: 'rescued', wing };
  loseWingmate(roster, plan.wingId, atNode);
  return { outcome: 'lost', wing };
}
