// islands.js — island colliders + the handcrafted M1 test archipelago. Pure sim
// (no WebGL). Islands are floating disc platforms: a top surface you land on and
// walk across; below the top you pass freely (they float). Collision is a SWEPT
// vertical check — if the player crossed a top from above this tick, they land —
// so a fast fall can never tunnel through a platform (verification fold).
//
// M1 scope is a HANDCRAFTED course that escalates gap widths to force jump 1 → 2
// → 3 (the leap taught by geometry). M2 replaces this with seeded generation +
// the reachability validator.

import { tuning } from './tuning.js';

// One island: a disc platform centered at (cx,cz) with a top surface at topY.
export function island(cx, cz, topY, radius) {
  return { cx, cz, topY, radius };
}

// The handcrafted M1 archipelago: a start pad, then pads across widening gaps and
// rising heights so the player must reach for jump 1, then 2, then 3. Distances
// are chosen against the tuned reach (base speed + apex heights) with margin.
export function makeTestArchipelago() {
  return [
    island(0, 0, 0, 7),         // A — spawn pad, roomy
    island(0, -16, 0.5, 5),     // B — a short hop away (jump 1)
    island(0, -33, 2.5, 5),     // C — wider gap + higher (double jump)
    island(-14, -50, 5.5, 5),   // D — wide + high, offset (triple jump commit)
    island(-30, -46, 3.0, 4.5), // E — a side pad to chain back toward
    island(-30, -30, 1.5, 5),   // F — loop back toward spawn height
  ];
}

// Highest island top at (x,z) that sits at or below `maxY` (with edge-snap
// margin). Returns { y, cx, cz, radius, dist } or null (over the void). Used both
// for the swept landing test and for the blob-shadow / landing-ring projection.
export function surfaceBelow(islands, x, z, maxY = Infinity) {
  let best = null;
  const margin = tuning.land.edgeSnap;
  for (const isl of islands) {
    const dx = x - isl.cx, dz = z - isl.cz;
    const dist = Math.hypot(dx, dz);
    if (dist > isl.radius + margin) continue;       // outside the disc (+snap ring)
    if (isl.topY > maxY + 1e-6) continue;           // above the query height — can't be below us
    if (!best || isl.topY > best.y) best = { y: isl.topY, cx: isl.cx, cz: isl.cz, radius: isl.radius, dist, dx, dz };
  }
  return best;
}

// Ground adapter for updatePlayer over an archipelago. Implements sampleBelow:
// given the player's pre/post-move Y, decide if they land this tick and where
// (with edge-snap clamping the landing point onto the disc).
export function archipelagoGround(islands) {
  return {
    islands,
    // Return a landing { y, x, z } if the player crossed a top from above this
    // tick while descending; else null (airborne / void).
    sampleBelow(x, z, prevY, newY, vy, allowEdgeSnap = true) {
      if (vy > 0) return null; // rising — nothing to land on
      // Edge-snap is near-miss LANDING generosity, not a ledge guard. A player who
      // was grounded at the start of the tick gets only the real disc radius; once
      // they walk beyond it they must fall. Airborne descents retain the snap ring.
      const margin = allowEdgeSnap ? tuning.land.edgeSnap : 0;
      let landing = null;
      for (const isl of islands) {
        const top = isl.topY;
        // Swept: did we cross the top plane from above to at/below this tick?
        if (prevY >= top - 1e-6 && newY <= top + 1e-6) {
          const dx = x - isl.cx, dz = z - isl.cz;
          const dist = Math.hypot(dx, dz);
          if (dist > isl.radius + margin) continue;
          // Edge-snap: if landing just past the rim, clamp onto the rim (law #8).
          let lx = x, lz = z;
          if (allowEdgeSnap && dist > isl.radius && dist > 1e-6) {
            const k = isl.radius / dist;
            lx = isl.cx + dx * k;
            lz = isl.cz + dz * k;
          }
          if (!landing || top > landing.y) landing = { y: top, x: lx, z: lz };
        }
      }
      return landing;
    },
    // The static surface directly under (x,z) at or below maxY — for the blob.
    surfaceUnder(x, z, maxY) {
      return surfaceBelow(islands, x, z, maxY);
    },
    lowestTop() {
      return islands.reduce((m, i) => Math.min(m, i.topY), Infinity);
    },
  };
}

// A flat-plane ground adapter (M0/M1 fallback + tests): an infinite floor at y.
export function flatGround(groundY = 0) {
  return {
    sampleBelow(x, z, prevY, newY, vy) {
      if (vy > 0) return null;
      if (prevY >= groundY - 1e-6 && newY <= groundY + 1e-6) return { y: groundY, x, z };
      return null;
    },
    surfaceUnder(x, z) { return { y: groundY, cx: x, cz: z, radius: Infinity, dist: 0 }; },
    lowestTop() { return groundY; },
  };
}
