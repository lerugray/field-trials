// Seeded coastal map generation for INNSMOUTH 2000.
//
// Innsmouth is a rotting Massachusetts coast town, so the map MUST have a real shoreline, a
// river mouth (the Manuxet register), and hills climbing away from the water. Every later
// system depends on the coast existing from the first tile: Deep Ones need waterfront, wharves
// need shore, the tax base climbs the hill. Generation is fully seeded and deterministic
// (STUDY section 5): same seed produces the identical map.
//
// Method (zero dependencies): a fractal value-noise heightfield, a seaward gradient that pulls
// the front of the map underwater to make a wiggly coast, one carved river reaching the sea,
// then terrain classification. The "front" of the dimetric view (larger col + row) is the
// water, so the town reads as climbing inland away from the shore.

import { makeRng } from './rng.js';

// Terrain kinds. Values are strings so tiles are legible in test output and save files.
export const TERRAIN = {
  DEEP: 'deep', // deep brine, no wall band
  SHALLOW: 'shallow', // shallow sea / river channel
  BEACH: 'beach', // wet sand strip between water and land
  GRASS: 'grass', // marsh grass / buildable land
  ROCK: 'rock', // hill rock (highest elevations)
};

export const MAX_ELEV = 6; // terrain elevation levels above sea (STUDY 1.2)

const DEFAULT_COLS = 96;
const DEFAULT_ROWS = 96;

// --- fractal value noise -----------------------------------------------------------------

function buildLattice(rng, w, h) {
  const a = new Float64Array(w * h);
  for (let i = 0; i < a.length; i++) a[i] = rng.next();
  return a;
}

function smoothstep(t) {
  return t * t * (3 - 2 * t);
}

function sampleLattice(lat, w, fx, fy) {
  const gx = Math.floor(fx);
  const gy = Math.floor(fy);
  const tx = smoothstep(fx - gx);
  const ty = smoothstep(fy - gy);
  const i00 = lat[gy * w + gx];
  const i10 = lat[gy * w + gx + 1];
  const i01 = lat[(gy + 1) * w + gx];
  const i11 = lat[(gy + 1) * w + gx + 1];
  const top = i00 + (i10 - i00) * tx;
  const bot = i01 + (i11 - i01) * tx;
  return top + (bot - top) * ty;
}

// Fractal Brownian motion over several octaves. Returns fbm(col,row) in [0,1].
function makeFbm(rng, cols, rows) {
  const octaves = [
    { spacing: 24, amp: 1.0 },
    { spacing: 12, amp: 0.5 },
    { spacing: 6, amp: 0.25 },
  ];
  const layers = octaves.map((o) => {
    const w = Math.ceil(cols / o.spacing) + 2;
    const h = Math.ceil(rows / o.spacing) + 2;
    return { lat: buildLattice(rng, w, h), w, spacing: o.spacing, amp: o.amp };
  });
  const totalAmp = octaves.reduce((s, o) => s + o.amp, 0);
  return function fbm(col, row) {
    let sum = 0;
    for (const l of layers) {
      sum += l.amp * sampleLattice(l.lat, l.w, col / l.spacing, row / l.spacing);
    }
    return sum / totalAmp;
  };
}

// --- map ---------------------------------------------------------------------------------

// A plain tile grid with helpers. Each tile: { terrain, elevation, object }.
class GameMap {
  constructor(cols, rows) {
    this.cols = cols;
    this.rows = rows;
    this.tiles = new Array(cols * rows);
  }

  inBounds(col, row) {
    return col >= 0 && row >= 0 && col < this.cols && row < this.rows;
  }

  index(col, row) {
    return row * this.cols + col;
  }

  tileAt(col, row) {
    if (!this.inBounds(col, row)) return null;
    return this.tiles[this.index(col, row)];
  }

  isWater(col, row) {
    const t = this.tileAt(col, row);
    return !!t && (t.terrain === TERRAIN.DEEP || t.terrain === TERRAIN.SHALLOW);
  }
}

function mapgenIsWater(t) {
  return t === TERRAIN.DEEP || t === TERRAIN.SHALLOW;
}

// Generate a coastal map. opts: { seed, cols, rows }.
export function makeMap(opts = {}) {
  const cols = opts.cols || DEFAULT_COLS;
  const rows = opts.rows || DEFAULT_ROWS;
  const rng = makeRng(opts.seed ?? 0);
  const fbm = makeFbm(rng.fork(), cols, rows);

  const map = new GameMap(cols, rows);
  const maxDepth = cols + rows - 2;

  // Pass 1: heightfield + sea. landValue < 0 is water; >= 0 is land at some elevation.
  const landValue = new Float64Array(cols * rows);
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const n = fbm(col, row); // 0..1 hills
      const depth = (col + row) / maxDepth; // 0 inland, 1 at the seaward front
      // Seaward pull: nothing until depth 0.35, ramping to a strong pull at the front.
      const g = Math.max(0, (depth - 0.35) / 0.5);
      const lv = n - g * 1.15;
      landValue[map.index(col, row)] = lv;
    }
  }

  // Pass 2: classify base terrain + elevation from landValue.
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const i = map.index(col, row);
      const lv = landValue[i];
      let terrain;
      let elevation;
      if (lv < 0) {
        terrain = lv < -0.22 ? TERRAIN.DEEP : TERRAIN.SHALLOW;
        elevation = 0;
      } else {
        // Land elevation grows with landValue, capped.
        elevation = Math.min(MAX_ELEV, Math.floor(lv / 0.14));
        terrain = elevation >= 4 ? TERRAIN.ROCK : TERRAIN.GRASS;
      }
      map.tiles[i] = {
        terrain, elevation, object: null, zone: null, building: null, structure: null, scar: null,
        pipe: null, // the underground water plane (M-a), independent of everything above
      };
    }
  }

  // Pass 3: carve one river from inland to the sea (the river mouth).
  carveRiver(map, rng.fork());

  // Pass 4: beaches. A land tile at elevation 0 touching any water becomes wet sand.
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const t = map.tiles[map.index(col, row)];
      if (mapgenIsWater(t.terrain) || t.elevation > 0) continue;
      if (
        map.isWater(col + 1, row) || map.isWater(col - 1, row) ||
        map.isWater(col, row + 1) || map.isWater(col, row - 1)
      ) {
        t.terrain = TERRAIN.BEACH;
      }
    }
  }

  return map;
}

// Walk a channel from a low-depth inland tile toward the sea, lowering it to shallow water.
// Guaranteed to reach water because the seaward front is underwater.
function carveRiver(map, rng) {
  const { cols, rows } = map;
  const maxDepth = cols + rows - 2;
  // Start on the inland anti-diagonal at ~18% depth, at a random offset along it.
  const startSum = Math.round(0.18 * maxDepth);
  const minCol = Math.max(0, startSum - (rows - 1));
  const maxCol = Math.min(cols - 1, startSum);
  let col = rng.int(minCol, maxCol);
  let row = startSum - col;
  if (row < 0) row = 0;
  if (row > rows - 1) row = rows - 1;

  let guard = 0;
  const maxSteps = cols + rows + 8;
  while (map.inBounds(col, row) && guard++ < maxSteps) {
    carveChannelTile(map, col, row);
    // Reached the sea: the mouth. Stop once we are into open water.
    if (map.tileAt(col, row) && map.isWater(col, row) && (col + row) / maxDepth > 0.6) break;

    // Step seaward (increase col+row). Meander between down-right, down-left, and a
    // sideways drift, weighted so the river mostly advances but wiggles.
    const roll = rng.next();
    let ncol = col;
    let nrow = row;
    if (roll < 0.42) ncol = col + 1; // down-right
    else if (roll < 0.84) nrow = row + 1; // down-left
    else if (rng.chance()) { ncol = col + 1; nrow = row - 1; } // drift, same depth
    else { ncol = col - 1; nrow = row + 1; } // drift, same depth

    if (!map.inBounds(ncol, nrow)) { ncol = col + 1; nrow = row + 1; }
    col = ncol;
    row = nrow;
  }
}

// Lower a tile (and its 4-neighbours, for width) to a shallow channel.
function carveChannelTile(map, col, row) {
  const cells = [[col, row], [col + 1, row], [col - 1, row], [col, row + 1], [col, row - 1]];
  for (const [c, r] of cells) {
    const t = map.tileAt(c, r);
    if (!t) continue;
    // The centre becomes channel; banks only lower if not already deep sea.
    if (c === col && r === row) {
      t.terrain = TERRAIN.SHALLOW;
      t.elevation = 0;
    } else if (t.terrain !== TERRAIN.DEEP && t.elevation > 0) {
      // Lower steep banks by one so the river sits in a shallow valley, no cliff walls.
      t.elevation = Math.max(0, t.elevation - 1);
    }
  }
}

// Summary stats, handy for tools/tests: counts by terrain and land/water fractions.
export function mapStats(map) {
  const counts = { deep: 0, shallow: 0, beach: 0, grass: 0, rock: 0 };
  for (const t of map.tiles) counts[t.terrain]++;
  const total = map.tiles.length;
  const water = counts.deep + counts.shallow;
  return {
    counts,
    total,
    waterFraction: water / total,
    landFraction: (total - water) / total,
  };
}

export { GameMap };
