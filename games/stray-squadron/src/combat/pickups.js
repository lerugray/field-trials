// Pickups — the reward that makes a 'rescue' breather beat matter. A rescue chunk
// is the calm between fights; dropping a grab-able reward into it turns the pause
// into a choice ("swing over and take it") instead of dead air, and gives the
// fairness harness something to point at so a breather never reads as a dead
// stretch. Two kinds: a hull repair (heal 1) and a bonus-score cache.
//
// Placement is pure + headless-testable (this file). The runtime collection +
// mesh + HUD cue are wired in M4.4. Pickups live in the same rail-relative space
// as everything else (station s + frame offset lat/vert), so "flew through it" is
// the same cheap disk test the ship already uses for obstacles.

export const PICKUP = {
  kinds: {
    repair: { hull: 1, score: 0 },   // a heal cross — restore one hull
    score:  { hull: 0, score: 300 }, // a score gem — banked bonus points
  },
  radius: 1.1,       // generous grab radius (a gift, not a skill check)
  latRange: 2.4,     // placed inside the reachable steer frame (grabbable)
  vertRange: 1.5,
  spacing: 40,       // ~one pickup per this much rail (count scales with length)
  perChunkMin: 1,    // a breather always carries at least one reward
  perChunkMax: 3,    // ...but never a loot pile (cap on a stretched breather)
  edgePad: 6,        // keep pickups just off the chunk seams (settled in the calm)
  shipRadius: 0.7,   // ship collect radius (matches PLAYER.radius)
};

// One pickup at station `s`. Single source of truth for the pickup shape + draw
// order (kind, then lat, then vert), shared by any per-chunk fill.
export function makePickup(rng, s, id) {
  const kind = rng.chance(0.5) ? 'repair' : 'score';
  const k = PICKUP.kinds[kind];
  return {
    id, s, kind,
    lat: rng.range(-PICKUP.latRange, PICKUP.latRange),
    vert: rng.range(-PICKUP.vertRange, PICKUP.vertRange),
    hull: k.hull, score: k.score,
    radius: PICKUP.radius,
    taken: false,
    spin: rng.range(0, Math.PI * 2), // idle rotation phase for the render
  };
}

// Fill one 'rescue' chunk [s0, s1) with 1-2 pickups spread along its calm middle,
// appending to `list`. Returns the next free id. `rng` should be a per-chunk fork.
export function fillRescueChunk(rng, s0, s1, list, startId = 1) {
  const inner0 = s0 + PICKUP.edgePad;
  const inner1 = s1 - PICKUP.edgePad;
  const span = Math.max(0, inner1 - inner0);
  // Count scales with the chunk's length so even a stretched breather stays
  // covered (no sparse dead middle), capped so it never becomes a loot pile.
  const n = Math.max(PICKUP.perChunkMin,
    Math.min(PICKUP.perChunkMax, Math.ceil(span / PICKUP.spacing)));
  // Even placement inset from both ends by half a slot — spacing stays ~span/n so
  // the largest empty stretch inside the chunk is bounded regardless of length.
  let id = startId;
  for (let i = 0; i < n; i++) {
    list.push(makePickup(rng, inner0 + span * ((i + 0.5) / n), id++));
  }
  return { id, count: n };
}

// The untaken pickups in an along-rail window ahead of the ship — the set the
// renderer draws and collection scans (mirrors activeEnemies).
export function activePickups(pickups, shipS, aheadS = 220) {
  return pickups.filter((p) => !p.taken && p.s > shipS - 8 && p.s < shipS + aheadS);
}

// S5: the same window, filtered INTO a caller-owned scratch array (no per-frame array
// allocation in the render loop). Rebuilt fresh each call, so reuse is safe. Returns `out`.
export function activePickupsInto(out, pickups, shipS, aheadS = 220) {
  out.length = 0;
  for (const p of pickups) {
    if (!p.taken && p.s > shipS - 8 && p.s < shipS + aheadS) out.push(p);
  }
  return out;
}

// Collect any pickups the ship is flying through (the same rail-relative disk test
// obstacles use). A taken pickup applies its reward once — hull repair (capped at
// maxHull, never over-heal) and/or banked score — then is flagged so it can't be
// double-collected. Returns the pickups grabbed this step (for the render/HUD cue).
export function collectPickups(pickups, shipS, offX, offY, player, run, shipRadius = PICKUP.shipRadius) {
  const got = [];
  for (const p of pickups) {
    if (p.taken) continue;
    if (Math.abs(p.s - shipS) > p.radius + shipRadius) continue;
    const dl = p.lat - offX, dv = p.vert - offY;
    if (Math.hypot(dl, dv) >= p.radius + shipRadius) continue;
    p.taken = true;
    if (p.hull > 0 && player) player.hull = Math.min(player.maxHull, player.hull + p.hull);
    if (p.score > 0 && run) run.score += p.score;
    got.push(p);
  }
  return got;
}
