// Seeded obstacle course — hazards placed IN the flight tunnel (unlike the
// decorative rail field, which keeps the center clear) that the player weaves
// through. M2 places + renders them and exposes a tested collision query; the
// actual hit/damage response is M3 (this is the honest seam). Pure + headless-
// testable. Positions are rail-relative (station s + lateral/vertical offset in
// rail-frame units), matching the ship's own offX/offY so collision is a simple
// 2D disk test in the frame plane.

import { makeRng } from '../core/rng.js';

export const OBSTACLE = {
  minGapS: 14,     // minimum along-rail spacing (fair: never a wall)
  maxGapS: 26,
  latRange: 2.2,   // lateral placement bound (inside the steerRangeX of 3.4)
  vertRange: 1.4,  // vertical placement bound (inside steerRangeY of 2.1)
  radiusMin: 0.9,
  radiusMax: 1.4,
  shipRadius: 0.7, // ship collision radius for the query
};

// One obstacle at station `s`. Single source of truth for the obstacle shape +
// draw order, shared by the legacy whole-rail course and the M4 per-chunk fill.
export function makeObstacle(rng, s) {
  return {
    s,
    lat: rng.range(-OBSTACLE.latRange, OBSTACLE.latRange),
    vert: rng.range(-OBSTACLE.vertRange, OBSTACLE.vertRange),
    radius: rng.range(OBSTACLE.radiusMin, OBSTACLE.radiusMax),
    spin: rng.range(0, Math.PI * 2),
    variant: rng.int(0, 2),
  };
}

// Fill one 'field' chunk [s0, s1) with a weave-able obstacle run, appending to
// `list`. Used by the M4 encounter grammar; the min/max gap keeps it fair (never
// a wall). `rng` should be a per-chunk fork.
// `opts.maxGap` (S6) — route threat tightens the along-rail spacing (denser field) on
// harder branches. minGap (the fairness floor) never moves. Default = baseline maxGap,
// so an omitted opts draws the same rng sequence as before.
export function fillFieldChunk(rng, s0, s1, list, opts = {}) {
  const maxGap = opts.maxGap != null ? opts.maxGap : OBSTACLE.maxGapS;
  let s = s0;
  while (s < s1) {
    list.push(makeObstacle(rng, s));
    s += rng.range(OBSTACLE.minGapS, maxGap);
  }
  return list;
}

export function createObstacleCourse(seed, sStart = 34, sMax = 1200) {
  const rng = makeRng(String(seed) + ':obstacles');
  const list = [];
  let s = sStart;
  while (s < sMax) {
    list.push(makeObstacle(rng, s));
    s += rng.range(OBSTACLE.minGapS, OBSTACLE.maxGapS);
  }
  return list;
}

// Nearest obstacle the ship is currently intersecting, or null. shipS is the
// ship's own rail station; offX/offY its frame offset. Along-rail overlap plus a
// disk test in the frame plane.
export function obstacleHit(course, shipS, offX, offY, shipRadius = OBSTACLE.shipRadius) {
  for (const o of course) {
    const along = Math.abs(o.s - shipS);
    if (along > o.radius + shipRadius) continue;
    const dl = o.lat - offX;
    const dv = o.vert - offY;
    if (Math.hypot(dl, dv) < o.radius + shipRadius) return o;
  }
  return null;
}
