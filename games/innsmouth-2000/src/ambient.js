// Ambient animation for INNSMOUTH 2000 (M9): the living world.
//
// The town breathes: gulls wheel over the water, fog banks drift across the map, slow shadows glide
// under the sea, a cart trundles a lane, and a procession walks toward a shrine. This is ATMOSPHERE,
// not simulation. It reads the map but never touches game state; nothing here changes a tile, a
// favour track, or a population. Everything is a smooth, deterministic function of a time value, so
// it needs no per-frame RNG and no stored motion state; a headless capture at any instant is valid.
//
// Two halves keep it cheap:
//   scanAmbientSites(map)   the O(map) scan for water / roads / shrines. The renderer caches this
//                           and refreshes it only occasionally (sites change slowly).
//   computeAmbient(...)     the per-frame math over the cached sites: tiny counts, hard caps below.
//
// Motion is slow and non-strobing by construction (the speeds below are small): the atmosphere never
// flashes or shakes, honouring the disaster-layer flash/shake discipline. A reduced-motion / low-power
// toggle drops every moving entity to nothing (the renderer keeps only its static fog wash), so the
// world can be stilled on a weak machine or for a player who wants it quiet.

import { tileToWorld, HALF_W, HALF_H } from './geometry.js';
import { mapWorldBounds } from './camera.js';
import { isWaterTerrain, hasNetwork } from './tools.js';

const TAU = Math.PI * 2;

// Hard caps: how many of each ambient entity may ever exist at once, regardless of map size. Keeps
// the living world cheap and uncluttered (a few gulls read as a flock; a screenful would be noise).
export const AMBIENT_CAPS = { gulls: 11, fog: 4, waterShadows: 6, carts: 3, processions: 2 };

// Slow, bounded motion rates (world units or radians per second). All small: nothing here moves fast
// enough to strobe or jitter.
const RATE = {
  gullOrbit: 0.28, // radians/sec a gull wheels about its home point
  gullFlap: 5.2, // radians/sec the wing V opens and closes (a flap, not a strobe)
  fogDrift: 7.5, // world px/sec a fog bank slides
  shadowDrift: 0.18, // radians/sec a sea shadow loops
  cartSpeed: 0.06, // fraction of a lane traversed per second (a slow trundle)
  processionSpeed: 0.05, // fraction of the approach walked per second
};

// A cheap deterministic [0,1) from an integer index (an integer hash; no Math.random, so a capture
// and a reload agree). Used to scatter phases and home points without storing any RNG state.
export function hash01(n) {
  let x = (n | 0) ^ 0x9e3779b9;
  x = Math.imul(x ^ (x >>> 16), 0x21f0aaad);
  x = Math.imul(x ^ (x >>> 15), 0x735a2d97);
  x ^= x >>> 15;
  return (x >>> 0) / 4294967296;
}

// Scan the map once for the sites ambient life attaches to: a sampled scatter of open-water points
// (sea shadows glide over these), the road runs a cart can trundle, and the shrines a procession
// walks toward. O(cols*rows); the renderer caches the result and refreshes it seldom.
export function scanAmbientSites(map) {
  const water = [];
  const shrines = [];
  const roadSet = new Set();
  const idx = (c, r) => r * map.cols + c;
  // Sample water on a stride so a vast sea does not build a vast list; a handful of anchors is enough.
  const stride = 5;
  for (let r = 0; r < map.rows; r++) {
    for (let c = 0; c < map.cols; c++) {
      const t = map.tileAt(c, r);
      if (!t) continue;
      if (isWaterTerrain(t.terrain)) {
        if (c % stride === 0 && r % stride === 0 && water.length < 60) water.push({ col: c, row: r });
      }
      if (hasNetwork(t, 'road')) roadSet.add(idx(c, r));
      if (t.structure && t.structure.kind === 'shrine') shrines.push({ col: c, row: r });
    }
  }
  const roadRuns = buildRoadRuns(map, roadSet);
  return { water, roadRuns, shrines };
}

// Greedily walk the road tiles into a few polylines (a "run" is a connected chain of lanes). Only as
// many as a cart could ride are kept, each at least two tiles long so it has a direction to travel.
function buildRoadRuns(map, roadSet, maxRuns = AMBIENT_CAPS.carts) {
  const runs = [];
  const visited = new Set();
  const NB = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const key = (c, r) => r * map.cols + c;
  const isRoad = (c, r) => roadSet.has(key(c, r));
  for (const start of roadSet) {
    if (runs.length >= maxRuns) break;
    if (visited.has(start)) continue;
    const c0 = start % map.cols;
    const r0 = Math.floor(start / map.cols);
    // Walk in one consistent direction as far as unvisited road continues: a lane, not a scribble.
    const run = [{ col: c0, row: r0 }];
    visited.add(start);
    let cur = { col: c0, row: r0 };
    let guard = 0;
    while (guard++ < map.cols + map.rows) {
      let next = null;
      for (const [dc, dr] of NB) {
        const nc = cur.col + dc;
        const nr = cur.row + dr;
        if (isRoad(nc, nr) && !visited.has(key(nc, nr))) { next = { col: nc, row: nr }; break; }
      }
      if (!next) break;
      visited.add(key(next.col, next.row));
      run.push(next);
      cur = next;
    }
    if (run.length >= 2) runs.push(run);
  }
  return runs;
}

// The world rectangle the map occupies, plus a margin so fog banks and gulls can drift in from just
// off the edges rather than popping in at the boundary.
export function ambientWorldBounds(map, margin = 200) {
  const b = mapWorldBounds(map.cols, map.rows);
  return { minX: b.minX - margin, maxX: b.maxX + margin, minY: b.minY - margin, maxY: b.maxY + margin };
}

// The per-frame ambient state over the cached sites at time `timeMs`. Returns bags of entities in
// WORLD coordinates (the camera projects them). Pure; no allocation beyond the returned arrays; no
// game-state read or write. With opts.reducedMotion every moving bag is empty (the low-power path).
export function computeAmbient(sites, bounds, timeMs, opts = {}) {
  const empty = { gulls: [], fog: [], waterShadows: [], carts: [], processions: [] };
  if (opts.reducedMotion) return empty;
  const t = timeMs / 1000;
  return {
    gulls: computeGulls(bounds, t),
    fog: computeFog(bounds, t),
    waterShadows: computeWaterShadows(sites.water, t),
    carts: computeCarts(sites.roadRuns, t),
    processions: computeProcessions(sites.shrines, t),
  };
}

// Gulls wheel on slow flattened orbits about scattered home points over the whole map, wings opening
// and closing. A flock, capped small.
function computeGulls(bounds, t) {
  const out = [];
  const spanX = bounds.maxX - bounds.minX;
  const spanY = bounds.maxY - bounds.minY;
  for (let i = 0; i < AMBIENT_CAPS.gulls; i++) {
    const homeX = bounds.minX + hash01(i * 2 + 1) * spanX;
    const homeY = bounds.minY + hash01(i * 2 + 7) * spanY * 0.85;
    const radius = 34 + hash01(i + 40) * 60;
    const dir = hash01(i + 90) < 0.5 ? -1 : 1;
    const ang = hash01(i + 3) * TAU + dir * t * RATE.gullOrbit;
    const x = homeX + Math.cos(ang) * radius;
    const y = homeY + Math.sin(ang) * radius * 0.5; // flattened for the dimetric plane
    const wing = 0.5 + 0.5 * Math.sin(t * RATE.gullFlap + hash01(i + 11) * TAU);
    out.push({ x, y, wing });
  }
  return out;
}

// Fog banks: broad soft ellipses sliding along the map, wrapping around when they leave the far edge.
function computeFog(bounds, t) {
  const out = [];
  const spanX = bounds.maxX - bounds.minX;
  const spanY = bounds.maxY - bounds.minY;
  const wrap = spanX + 400; // the wrap length includes room for a bank's own width
  for (let i = 0; i < AMBIENT_CAPS.fog; i++) {
    const w = 220 + hash01(i + 5) * 200;
    const h = 70 + hash01(i + 15) * 50;
    const y = bounds.minY + hash01(i + 25) * spanY;
    const phase = hash01(i + 35) * wrap;
    const x = bounds.minX - 200 + ((phase + t * RATE.fogDrift) % wrap);
    const alpha = 0.09 + hash01(i + 45) * 0.08; // faint, but enough that a drifting bank reads
    out.push({ x, y, w, h, alpha });
  }
  return out;
}

// Slow shadows gliding under the sea surface (a shape passing below the water). Each loops a small
// ellipse about a sampled water anchor. None if the map has no open water.
function computeWaterShadows(water, t) {
  const out = [];
  if (!water.length) return out;
  const count = Math.min(AMBIENT_CAPS.waterShadows, water.length);
  for (let i = 0; i < count; i++) {
    const anchor = water[(i * 7) % water.length];
    const w = tileToWorld(anchor.col, anchor.row);
    const r = 22 + hash01(i + 60) * 26;
    const ang = hash01(i + 70) * TAU + t * RATE.shadowDrift;
    const x = w.x + Math.cos(ang) * r;
    const y = w.y + Math.sin(ang) * r * 0.5;
    const rad = 20 + hash01(i + 80) * 14;
    out.push({ x, y, rad });
  }
  return out;
}

// A cart trundles each road run, ping-ponging along the lane (out to the end and back), so it never
// teleports. Position is a smooth function of time along the polyline of tile centres.
function computeCarts(roadRuns, t) {
  const out = [];
  const count = Math.min(AMBIENT_CAPS.carts, roadRuns.length);
  for (let i = 0; i < count; i++) {
    const run = roadRuns[i];
    const segs = run.length - 1;
    // Ping-pong parameter in [0, segs]: a triangle wave over time, offset per cart.
    const phase = (t * RATE.cartSpeed + hash01(i + 100)) % 1; // 0..1 over the full there-and-back
    const tri = phase < 0.5 ? phase * 2 : (1 - phase) * 2; // 0..1..0
    const along = tri * segs;
    const s = Math.min(Math.floor(along), segs - 1);
    const f = along - s;
    const a = tileToWorld(run[s].col, run[s].row);
    const b = tileToWorld(run[s + 1].col, run[s + 1].row);
    out.push({ x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f });
  }
  return out;
}

// A procession walks toward each shrine: a short file of hooded figures moving up an approach line
// from inland toward the shrine, looping. None without a shrine. Cheap: a handful of dots per shrine.
function computeProcessions(shrines, t) {
  const out = [];
  const count = Math.min(AMBIENT_CAPS.processions, shrines.length);
  const FIGURES = 4;
  for (let i = 0; i < count; i++) {
    const shrine = shrines[i];
    const end = tileToWorld(shrine.col, shrine.row);
    // Approach from up the slope (inland is smaller col+row): a short line ending at the shrine.
    const start = tileToWorld(shrine.col - 3, shrine.row - 3);
    const figures = [];
    for (let k = 0; k < FIGURES; k++) {
      const p = (t * RATE.processionSpeed + k / FIGURES + hash01(i + 200) ) % 1;
      figures.push({ x: start.x + (end.x - start.x) * p, y: start.y + (end.y - start.y) * p });
    }
    out.push({ figures, shrine: { x: end.x, y: end.y } });
  }
  return out;
}
