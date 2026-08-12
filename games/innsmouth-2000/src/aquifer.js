// The subsurface substrate for INNSMOUTH 2000 (M-b of the underground system).
//
// M-a gave the town a water network. This gives the ground that network is dug into a character:
// where the aquifer runs fresh, where the sea has pushed brine into it, and where the rock has
// opened into a sea-connected fissure. Those three readings are what make one well head clean for
// a century and the next one a road inward for something that was already down there.
//
// Everything here is DERIVED from the map's own terrain and is never stored on a tile. Three
// reasons, all of which earned their place:
//   - a save written before this milestone loads with a correct aquifer, not a missing field;
//   - the Flood Tide gets its spec-mandated behaviour for free (section 6: "saltwater intrusion
//     into coastal pipes"): land the sea takes becomes sea-connected ground, so a flood really does
//     push brine inland, with no separate flood-to-aquifer code path to keep in step;
//   - a derived field cannot drift out of step with the terrain it describes.
//
// The one thing the player changes IS stored, because it is a decision and not a fact about the
// ground: a sealed fissure (`tile.sealed`).
//
// Pure: no canvas, no DOM, and no RNG stream. The scatter of fissures comes from a positional hash,
// so it is identical every month, identical between a game and its reloaded save, and identical
// between the whole-map pass and the single-tile query below.

import { TERRAIN } from './mapgen.js';

// What the ground holds beneath a tile.
export const SUBSTRATE = {
  SEA: 'sea', // open water: the source of every brine problem below
  FISSURE: 'fissure', // a sea-connected void or flooded cavity: where they dwell
  BRACKISH: 'brackish', // the aquifer near the shore, tainted with salt
  FRESH: 'fresh', // sweet water, inland and uphill
};

// Plain-English names for the query window (period register, no em-dashes).
export const SUBSTRATE_LABEL = {
  sea: 'Open water',
  fissure: 'A sea fissure. The rock is open to the deep.',
  brackish: 'Brackish aquifer. The sea has been in this ground.',
  fresh: 'Fresh aquifer. Sweet water, and no salt in it.',
};

// How far inland the brine reaches, how close to the water the rock opens, and how much of that
// near-shore ground is fissured. Scenarios scale these (section 5): the Quiet Cove has a narrow
// brine band and few fissures; the Blighted Shore is riddled with them.
export const AQUIFER_DEFAULTS = {
  brackishReach: 3, // tiles inland the brine carries
  brackishMaxElev: 3, // above this the ground is sweet whatever its distance
  fissureReach: 1, // fissures only open where the rock all but touches the water
  fissureRate: 0.12, // the share of eligible ground that is actually open
};

// Resolve a partial option set against the defaults.
export function aquiferOptions(opts = {}) {
  return { ...AQUIFER_DEFAULTS, ...(opts || {}) };
}

// The 4 grid neighbours. (Named apart from power.js's NB and water.js's WATER_NB: the single-file
// build concatenates every module into one shared scope, so top-level names must be unique across
// all of src/. A duplicate has shipped a blank page once already.)
const AQ_NB = [[1, 0], [-1, 0], [0, 1], [0, -1]];

// A stable positional hash in [0,1). Not an RNG: the same tile always answers the same, so the
// fissures never blink between one month and the next, nor between a save and its reload.
export function aquiferHash(index, salt = 0) {
  let h = Math.imul(index + 1, 2654435761) ^ Math.imul(salt + 1, 40503);
  h = Math.imul(h ^ (h >>> 15), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function isSeaTerrain(t) {
  return t === TERRAIN.DEEP || t === TERRAIN.SHALLOW;
}

// Classify the substrate at one tile, from its terrain, its height, and how far the water is. This
// is the single rule; computeAquifer below applies exactly the same thresholds over the whole map
// with a faster distance pass, and a test pins the two together on a real coast.
//
// The distance metric is 4-neighbour steps to the nearest water, which on an open grid is the same
// as Manhattan distance, so this local box scan and the whole-map flood are equivalent by
// construction rather than by coincidence.
export function substrateAt(map, col, row, opts = {}) {
  const tile = map.tileAt(col, row);
  if (!tile) return null;
  if (isSeaTerrain(tile.terrain)) return SUBSTRATE.SEA;
  const o = aquiferOptions(opts);
  const reach = Math.max(o.brackishReach, o.fissureReach);
  let dist = Infinity;
  for (let dr = -reach; dr <= reach; dr++) {
    const room = reach - Math.abs(dr);
    for (let dc = -room; dc <= room; dc++) {
      const t = map.tileAt(col + dc, row + dr);
      if (!t || !isSeaTerrain(t.terrain)) continue;
      const d = Math.abs(dc) + Math.abs(dr);
      if (d < dist) dist = d;
    }
  }
  return classify(map.index(col, row), tile, dist, o);
}

// The thresholds themselves, shared by both passes.
function classify(index, tile, dist, o) {
  if (dist <= o.fissureReach && tile.elevation <= 1
      && aquiferHash(index, 1) < o.fissureRate) {
    return SUBSTRATE.FISSURE;
  }
  if (dist <= o.brackishReach && tile.elevation <= o.brackishMaxElev) return SUBSTRATE.BRACKISH;
  return SUBSTRATE.FRESH;
}

// Compute the whole subsurface: a substrate reading per tile, and the sea-connected regions the
// Deep Ones dwell in. Returns:
//   substrate:  string[] per tile index (one of SUBSTRATE)
//   seaDistance: Int32Array, 4-neighbour steps to the nearest water (large where far inland)
//   isSea:      Uint8Array, 1 where a water tile belongs to the OPEN SEA (see below)
//   regions:    [{ id, tiles:[idx], fissures:[idx], openFissures, sealedFissures, seaConnected }]
//   regionOf:   Int32Array, tile index -> position in `regions`, or -1
//   fissures:   [idx] every fissure on the map, sealed or not
// A region is one connected run of brine-bearing ground (brackish or fissured). `id` is its lowest
// tile index, which makes it a stable name across months and across a save, and is what the Deep
// Presence ledger is keyed by. Deterministic: the flood order follows tile index.
//
// THE OPEN SEA IS NOT THE SAME AS ANY WATER, and the difference is load-bearing. A marsh town is
// full of standing pools, and a pool leaves salt in the ground around it just as the sea does, so
// every water tile brines its neighbourhood. But the spec is explicit that the Deep Ones are strong
// "where underground water connects to the sea": a landlocked pool is a nuisance, not a door. So the
// sea is identified as the water body (or bodies) reaching the edge of the map -- which on a coast
// map is the seaward front, and includes the carved river, correctly, because it is tidal -- and
// only a region touching THAT counts as sea-connected. A brackish pocket around an inland pool
// raises a region, fouls a pump sunk in it, and its Deep Presence fades to nothing, because nothing
// is coming up into it.
//
// (Found while writing test/aquifer.test.js: the first cut of this flagged an inland pond's pocket
// sea-connected, which would have grown presence in a place the deep cannot reach.)
export function computeAquifer(map, opts = {}) {
  const o = aquiferOptions(opts);
  const n = map.cols * map.rows;
  const substrate = new Array(n);
  const seaDistance = new Int32Array(n).fill(0x3fffffff);

  // A multi-source breadth-first flood out from every water tile gives each land tile its distance
  // to the sea in one pass.
  const queue = new Int32Array(n);
  let head = 0;
  let tail = 0;
  for (let i = 0; i < n; i++) {
    if (isSeaTerrain(map.tiles[i].terrain)) {
      seaDistance[i] = 0;
      queue[tail++] = i;
    }
  }
  while (head < tail) {
    const i = queue[head++];
    const col = i % map.cols;
    const row = (i - col) / map.cols;
    const d = seaDistance[i] + 1;
    for (const [dc, dr] of AQ_NB) {
      const nc = col + dc;
      const nr = row + dr;
      if (!map.inBounds(nc, nr)) continue;
      const ni = map.index(nc, nr);
      if (seaDistance[ni] <= d) continue;
      seaDistance[ni] = d;
      queue[tail++] = ni;
    }
  }

  // Which water is the OPEN SEA: flood the water bodies that reach the edge of the map. A pool that
  // touches no edge is inland, however large.
  const isSea = new Uint8Array(n);
  head = 0;
  tail = 0;
  for (let row = 0; row < map.rows; row++) {
    for (let col = 0; col < map.cols; col++) {
      const onEdge = col === 0 || row === 0 || col === map.cols - 1 || row === map.rows - 1;
      if (!onEdge) continue;
      const i = map.index(col, row);
      if (!isSeaTerrain(map.tiles[i].terrain) || isSea[i]) continue;
      isSea[i] = 1;
      queue[tail++] = i;
    }
  }
  while (head < tail) {
    const i = queue[head++];
    const col = i % map.cols;
    const row = (i - col) / map.cols;
    for (const [dc, dr] of AQ_NB) {
      const nc = col + dc;
      const nr = row + dr;
      if (!map.inBounds(nc, nr)) continue;
      const ni = map.index(nc, nr);
      if (isSea[ni] || !isSeaTerrain(map.tiles[ni].terrain)) continue;
      isSea[ni] = 1;
      queue[tail++] = ni;
    }
  }

  const fissures = [];
  for (let i = 0; i < n; i++) {
    const tile = map.tiles[i];
    if (isSeaTerrain(tile.terrain)) { substrate[i] = SUBSTRATE.SEA; continue; }
    substrate[i] = classify(i, tile, seaDistance[i], o);
    if (substrate[i] === SUBSTRATE.FISSURE) fissures.push(i);
  }

  // Regions: connected runs of brine-bearing ground. Sweet ground and open water both break a run,
  // so an inland brackish pocket is its own region and is NOT sea-connected, which is exactly the
  // reading the player should get from it (a nuisance, not a door).
  const regionOf = new Int32Array(n).fill(-1);
  const regions = [];
  const stack = [];
  for (let start = 0; start < n; start++) {
    if (regionOf[start] !== -1) continue;
    if (substrate[start] !== SUBSTRATE.BRACKISH && substrate[start] !== SUBSTRATE.FISSURE) continue;
    const pos = regions.length;
    const tiles = [];
    const regionFissures = [];
    let seaConnected = false;
    stack.length = 0;
    stack.push(start);
    regionOf[start] = pos;
    while (stack.length) {
      const i = stack.pop();
      tiles.push(i);
      if (substrate[i] === SUBSTRATE.FISSURE) regionFissures.push(i);
      const col = i % map.cols;
      const row = (i - col) / map.cols;
      for (const [dc, dr] of AQ_NB) {
        const nc = col + dc;
        const nr = row + dr;
        if (!map.inBounds(nc, nr)) continue;
        const ni = map.index(nc, nr);
        // Only the OPEN sea is a door. An inland pool brines the ground and nothing more.
        if (substrate[ni] === SUBSTRATE.SEA) { if (isSea[ni]) seaConnected = true; continue; }
        if (regionOf[ni] !== -1) continue;
        if (substrate[ni] !== SUBSTRATE.BRACKISH && substrate[ni] !== SUBSTRATE.FISSURE) continue;
        regionOf[ni] = pos;
        stack.push(ni);
      }
    }
    tiles.sort((a, b) => a - b); // stable order regardless of the flood's stack order
    regionFissures.sort((a, b) => a - b);
    let sealedFissures = 0;
    for (const i of regionFissures) if (map.tiles[i].sealed) sealedFissures++;
    regions.push({
      id: tiles[0],
      tiles,
      fissures: regionFissures,
      openFissures: regionFissures.length - sealedFissures,
      sealedFissures,
      seaConnected,
    });
  }

  return { substrate, seaDistance, isSea, regions, regionOf, fissures, options: o };
}

// The substrate reading at a tile index, from a computed aquifer. Null-safe so the renderer and the
// query can ask before the sim has ever computed one.
export function substrateOf(aquifer, index) {
  if (!aquifer || !aquifer.substrate) return null;
  return aquifer.substrate[index] || null;
}

// The region a tile belongs to, or null. Sweet ground belongs to none.
export function regionOfTile(aquifer, index) {
  if (!aquifer || !aquifer.regionOf) return null;
  const pos = aquifer.regionOf[index];
  return pos >= 0 ? aquifer.regions[pos] : null;
}

// Is this tile an open (unsealed) fissure? The seal tool's own gate, and the renderer's.
export function isOpenFissure(map, aquifer, index) {
  if (substrateOf(aquifer, index) !== SUBSTRATE.FISSURE) return false;
  return !map.tiles[index].sealed;
}
