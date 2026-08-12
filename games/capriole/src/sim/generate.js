// generate.js — the SKY GENERATOR (M2). Builds a procedural floating archipelago for
// one sphere as a PURE FUNCTION of (worldSeed, sphereIndex): a spawn pad, a wandering
// chain of disc islands whose gaps sit inside the measured jump-tier reach, four pods
// spread along the chain, and an exit portal on the far island. Deterministic (no live
// RNG stream — layout is recomputed from the seed on resume, never re-rolled), pure sim
// (no WebGL). The reachability validator (reachability.js) proves the result with the
// real tick; makeValidatedSphere() (world.js) re-rolls until valid.
//
// Sphere 1 (index 0) is a TEACHING SPHERE by constrained generation: its gap bands are
// authored to escalate jump 1 → 2 → 3 (gen.teachTiers), yet angles, heights, radii and
// exact gaps are still seeded — procedural, never handcrafted.

import { island } from './islands.js';
import { Stream } from './rng.js';
import { tuning } from './tuning.js';

const DEG = Math.PI / 180;

// Deterministic per-sphere layout seed: fold the sphere index (and a reroll `attempt`,
// used by makeValidatedSphere when a layout fails validation) into the world seed so each
// sphere/attempt gets an independent, reproducible layout (FNV-ish + a mix). Because it's
// pure, resume recomputes the same valid layout without storing any of it.
export function layoutSeed(worldSeed, sphereIndex, attempt = 0) {
  let h = (0x811c9dc5 ^ (worldSeed >>> 0)) >>> 0;
  h = Math.imul(h ^ (sphereIndex >>> 0), 0x01000193);
  h = Math.imul(h ^ (attempt >>> 0), 0x01000193);
  h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12;
  return h >>> 0;
}

// True if a candidate disc (cx,cz,r) clears every existing island by the rim clearance
// (no-overlap guarantee) — used during placement.
function clearsAll(islands, cx, cz, r, clearance) {
  for (const o of islands) {
    if (Math.hypot(cx - o.cx, cz - o.cz) < o.radius + r + clearance) return false;
  }
  return true;
}

// Generate a sphere layout. Returns { sphereIndex, seed, spawn, islands, pods, exit }.
// islands[0] is always the spawn pad. Pod/exit here are STATIC positions; runtime
// collected/open flags are added by the world (sphere.js) — the generator is stateless.
export function generateSphere(worldSeed, sphereIndex = 0, attempt = 0, T = tuning) {
  const g = T.gen;
  const rng = new Stream(layoutSeed(worldSeed >>> 0, sphereIndex, attempt));
  const isTeaching = sphereIndex === 0;

  // Spawn pad at origin, roomy, top at y=0.
  const islands = [island(0, 0, 0, g.spawnRadius)];

  // Chain length: teaching sphere uses its authored escalation length; others sample.
  const chainLen = isTeaching
    ? g.teachTiers.length
    : rng.int(g.chainLen[0], g.chainLen[1] + 1);

  // Wander a heading forward from spawn (start toward -Z, the camera's forward at yaw 0).
  let heading = -Math.PI / 2; // atan2 convention: angle of (dx,dz)=(cos,sin); -PI/2 → -Z
  let prev = islands[0];

  for (let i = 0; i < chainLen; i++) {
    const tier = (isTeaching ? g.teachTiers[i] : pickTier(rng)) - 1; // 0..2
    const band = g.gapBand[tier];
    const radius = round2(rng.range(g.radiusBand[0], g.radiusBand[1]));
    // Top-Y delta: a rise capped by the tier's reach headroom, a free drop (drops ease it).
    const topY = round2(prev.topY + rng.range(-g.dropMax, g.riseCap[tier]));

    let placed = null;
    for (let attempt = 0; attempt < g.placeTries; attempt++) {
      // Straighten the heading progressively as attempts fail (last resort: straight on).
      const wander = attempt < g.placeTries - 2 ? (rng.range(-1, 1) * g.turnMaxDeg * DEG) : 0;
      const voidGap = rng.range(band[0], band[1]);
      const D = prev.radius + radius + voidGap; // center distance = both radii + the void the player clears

      // Bounded extents: steer the heading back toward origin when a straight-on hop
      // would leave the world radius (keeps the archipelago compact and finite).
      let h = heading + wander;
      const straight = { x: prev.cx + Math.cos(h) * D, z: prev.cz + Math.sin(h) * D };
      if (Math.hypot(straight.x, straight.z) > g.maxExtent - radius) {
        const toIn = Math.atan2(-prev.cz, -prev.cx); // heading back toward origin
        h = toIn + rng.range(-1, 1) * (g.turnMaxDeg * 0.5 * DEG);
      }
      const cx = round2(prev.cx + Math.cos(h) * D);
      const cz = round2(prev.cz + Math.sin(h) * D);
      if (Math.hypot(cx, cz) > g.maxExtent - radius) continue;
      if (!clearsAll(islands, cx, cz, radius, g.clearance)) continue;

      placed = island(cx, cz, topY, radius);
      heading = Math.atan2(cz - prev.cz, cx - prev.cx); // continue from the realized heading
      break;
    }

    // Last resort (dense wander boxed us in): sweep angles around the origin-ward
    // heading at the band's min void, growing the void ring by ring, and take the first
    // spot that clears every island and stays in bounds. Guarantees no-overlap; a gentle
    // drop keeps it reachable. (Rare; any residual reach shortfall is caught by the
    // validator's reroll in makeValidatedSphere.)
    if (!placed) {
      const preferH = Math.atan2(-prev.cz, -prev.cx); // toward origin
      const spot = fallbackSpot(islands, prev, radius, band, g, preferH);
      const cx = spot.cx, cz = spot.cz;
      placed = island(cx, cz, round2(prev.topY - 1.0), radius);
      heading = Math.atan2(cz - prev.cz, cx - prev.cx);
    }

    islands.push(placed);
    prev = placed;
  }

  // Pods: spread `perSphere` pods across chain islands (never the spawn pad), each on a
  // distinct island, spaced by podSpacingMin, biased toward an even spread along the chain.
  const pods = placePods(islands, T);
  // Exit portal on the farthest chain island (the last placed) — always past all pods.
  const last = islands[islands.length - 1];
  const exit = { x: last.cx, z: last.cz, y: last.topY, island: islands.length - 1 };

  return { sphereIndex, seed: worldSeed >>> 0, spawn: spawnPoint(islands[0]), islands, pods, exit };
}

// Weighted jump-tier pick for non-teaching spheres: favour tier 2 (the reach jump) with
// real tier-1 breathers and tier-3 commits, so a sphere feels varied but never monotone.
function pickTier(rng) {
  const r = rng.next();
  if (r < 0.30) return 1;
  if (r < 0.75) return 2;
  return 3;
}

// Place pods on well-spread chain islands. Deterministic: walks the chain picking islands
// at even fractional stops, skipping any too close to an already-chosen pod island.
function placePods(islands, T = tuning) {
  const g = T.gen;
  const n = T.pods.perSphere;
  const chain = islands.slice(1); // exclude spawn pad
  const chosen = [];
  // Ideal stops evenly along the chain (avoid clumping at spawn or exit).
  for (let k = 0; k < n && chain.length; k++) {
    const frac = (k + 1) / (n + 1);
    let idx = Math.min(chain.length - 1, Math.round(frac * (chain.length - 1)));
    // Nudge off collisions with prior pod islands (spacing) and duplicates.
    let tries = 0;
    while (tries < chain.length &&
      (chosen.includes(idx) ||
       chosen.some((c) => Math.hypot(chain[idx].cx - chain[c].cx, chain[idx].cz - chain[c].cz) < g.podSpacingMin))) {
      idx = (idx + 1) % chain.length; tries++;
    }
    if (!chosen.includes(idx)) chosen.push(idx);
  }
  return chosen.map((ci) => {
    const isl = chain[ci];
    const islandIndex = islands.indexOf(isl);
    return { x: isl.cx, z: isl.cz, y: isl.topY + T.pods.heightAboveTop, island: islandIndex };
  });
}

// Sweep headings around a preferred direction at growing void rings; return the first
// {cx,cz} clearing every island and inside the bound. Falls through to the widest ring's
// best-effort spot so the generator always returns (validator reroll covers the rare miss).
function fallbackSpot(islands, prev, radius, band, g, preferH) {
  let last = null;
  for (let ring = 0; ring < 8; ring++) {
    const D = prev.radius + radius + band[0] + ring * 2.0;
    for (let a = 0; a < 24; a++) {
      const step = Math.ceil(a / 2) * (Math.PI / 12);
      const h = preferH + (a % 2 ? step : -step);
      const cx = round2(prev.cx + Math.cos(h) * D);
      const cz = round2(prev.cz + Math.sin(h) * D);
      last = { cx, cz };
      if (Math.hypot(cx, cz) > g.maxExtent - radius) continue;
      if (!clearsAll(islands, cx, cz, radius, g.clearance)) continue;
      return { cx, cz };
    }
  }
  return last;
}

function spawnPoint(spawnIsland) {
  // Spawn a touch above the pad top so the player visibly settles onto it (M1 convention).
  return { x: spawnIsland.cx, y: spawnIsland.topY + 6, z: spawnIsland.cz };
}

function round2(v) { return Math.round(v * 100) / 100; }
