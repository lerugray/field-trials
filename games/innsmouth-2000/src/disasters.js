// The five wrath disasters for INNSMOUTH 2000 (M6).
//
// Each god's wrath is a distinct, deterministic mutation of the map. Two strike all at once (the
// Flood Tide, the Awakening, the Rift); two crawl across the town over several months (the Greening
// and the Burning). A wrath fires when a favor track falls to the floor (src/gods.js) or when the
// player summons it from the disasters menu (the reference's homage, and the test hook). Pure over
// sim + map state (no canvas): render.js reads the marks this leaves, node --test asserts on them.
//
// What a wrath leaves behind, for the renderer:
//   tile.scar = { kind }   burnt | overgrown | rubble | flooded | rift
//   sim.disaster           the active event { god, kind, name, age, maxAge, front:[idx], done }
// A spreading wrath advances one ring per month via advanceDisaster(); an instant one applies in
// full on trigger and lingers only as a short visual flash (age -> maxAge) over its footprint.

import { TERRAIN } from './mapgen.js';
import {
  refreshConnectionsAround, isWaterTerrain, waterWithin, hasNetwork, removeNetwork,
} from './tools.js';
import { GOD, GOD_INFO, POST_WRATH_FAVOR, DOOM_AWAKENINGS } from './gods.js';
import { spikePresenceFrom } from './deep.js';

// The 4 orthogonal neighbours (fire and growth creep along edges, not diagonals).
const NB4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];

const GREENING_MAX_RINGS = 7;
const BURNING_MAX_RINGS = 8;
const GREENING_CAP = 70; // tiles the growth will devour before it spends itself
const BURNING_CAP = 80;

function clampDread(v) { return v < 0 ? 0 : v > 100 ? 100 : v; }

// Strip whatever a lot carries (a wrath destroys what stood there). Leaves terrain + elevation.
function razeTile(tile) {
  tile.building = null;
  tile.object = null;
  tile.structure = null;
  tile.zone = null;
}

// Fire the given god's wrath on the sim. Returns an event { god, kind, name, count, message }.
// Sets sim.disaster to the active event and (for a floor-triggered call) is what the sim runs.
export function triggerWrath(sim, god) {
  switch (god) {
    case GOD.DAGON: return floodTide(sim);
    case GOD.CTHULHU: return theAwakening(sim);
    case GOD.SHUB: return theGreening(sim);
    case GOD.NYARLATHOTEP: return theBurning(sim);
    case GOD.YOG: return theRift(sim);
    default: return null;
  }
}

// --- Dagon: The Flood Tide + Deep One uprising -------------------------------------------
// The sea climbs the shore. Low land within reach of water drowns (two rings inland), taking
// whatever stood on it; the surviving waterfront turns to the Deep Ones, and dread surges.
function floodTide(sim) {
  const { map } = sim;
  const drowned = [];
  for (let ring = 0; ring <= 1; ring++) {
    const toDrown = [];
    for (let row = 0; row < map.rows; row++) {
      for (let col = 0; col < map.cols; col++) {
        const t = map.tiles[map.index(col, row)];
        if (isWaterTerrain(t.terrain)) continue;
        if (t.elevation > ring) continue; // only the low shore drowns
        if (!waterAdjacent(map, col, row)) continue;
        toDrown.push([col, row]);
      }
    }
    for (const [col, row] of toDrown) {
      const i = map.index(col, row);
      const t = map.tiles[i];
      razeTile(t);
      t.terrain = TERRAIN.SHALLOW;
      t.elevation = 0;
      t.scar = { kind: 'flooded' };
      refreshConnectionsAround(map, col, row);
      drowned.push(i);
    }
  }
  // Deep One uprising: surviving homes near the new tideline turn Deep One.
  let risen = 0;
  for (let row = 0; row < map.rows; row++) {
    for (let col = 0; col < map.cols; col++) {
      const t = map.tiles[map.index(col, row)];
      if (t.building && t.zone === 'residential' && waterWithin(map, col, row, 2)) {
        t.building.cls = 'deepone';
        risen++;
      }
    }
  }
  sim.dread = clampDread(sim.dread + 20);
  // Saltwater intrusion (M-b, spec section 6): the sea is now IN ground that was sweet. The aquifer
  // re-reads itself from the terrain next step, so the brine moves inland with no help from here;
  // what this must do is push the Deep Presence along the ground the water reached.
  spikePresenceFrom(sim, drowned);
  return setEvent(sim, GOD.DAGON, 'flood', {
    front: drowned, maxAge: 4, count: drowned.length,
    message: `The flood tide takes ${drowned.length} lots; ${risen} homes turn to the Deep Ones.`,
  });
}

// --- Cthulhu: The Awakening (earthquake + city-wide madness) ------------------------------
// Rare and ruinous. The ground heaves: most buildings collapse to rubble, roads shear, and every
// mind in the town is unseated (dread all but maxes). Favor only delays this; it cannot soften it.
function theAwakening(sim) {
  const { map, rng } = sim;
  // Each Awakening is worse than the last (M8 doom clock): the ground heaves harder, more falls, and
  // the madness bites deeper. `n` is which Awakening this is (1 for the first).
  const n = (sim.awakenings || 0) + 1;
  sim.awakenings = n;
  const esc = n - 1;
  const razeChance = Math.min(0.92, 0.6 + 0.11 * esc);
  const structChance = Math.min(0.9, 0.45 + 0.12 * esc);
  const roadChance = Math.min(0.9, 0.5 + 0.11 * esc);
  const dreadSpike = Math.min(85, 60 + 8 * esc);
  const wrecked = [];
  for (let row = 0; row < map.rows; row++) {
    for (let col = 0; col < map.cols; col++) {
      const i = map.index(col, row);
      const t = map.tiles[i];
      if (t.building && rng.chance(razeChance)) {
        razeTile(t); t.scar = { kind: 'rubble' }; wrecked.push(i);
      } else if (t.structure && rng.chance(structChance)) {
        razeTile(t); t.scar = { kind: 'rubble' }; wrecked.push(i);
      } else if (hasNetwork(t, 'road') && rng.chance(roadChance)) {
        removeNetwork(t, 'road'); refreshConnectionsAround(map, col, row); wrecked.push(i);
      }
    }
  }
  sim.dread = clampDread(sim.dread + dreadSpike);
  const ordinal = n === DOOM_AWAKENINGS ? 'The dreamer wakes in full' : `The Awakening returns, ${n} times now`;
  return setEvent(sim, GOD.CTHULHU, 'awakening', {
    front: wrecked, maxAge: 6, count: wrecked.length, awakening: n,
    message: n === 1
      ? `The Awakening: the ground heaves and ${wrecked.length} lots fall to ruin.`
      : `${ordinal}: ${wrecked.length} lots fall to ruin.`,
  });
}

// --- Shub-Niggurath: The Greening (crawls block by block) ---------------------------------
// A seed of unnatural growth takes a built lot on wet sand or marsh grass and spreads outward one
// ring per month, choking streets and buildings until it spends itself. Bare hill rock resists:
// the setting's sea-rotted growth needs a damp substrate even when a road or building stands there.
function theGreening(sim) {
  const seed = pickBuiltTile(sim, canGreeningTakeHold);
  if (seed === null) {
    return setEvent(sim, GOD.SHUB, 'greening', {
      front: [], maxAge: 0, count: 0, consumed: 0, done: true,
      message: 'The Greening finds no damp ground and fails to take root.',
    });
  }
  consumeGreen(sim.map, seed);
  return setEvent(sim, GOD.SHUB, 'greening', {
    front: [seed], maxAge: GREENING_MAX_RINGS, count: 1, consumed: 1,
    message: 'The Greening takes root. Growth begins to devour the streets.',
  });
}

// --- Nyarlathotep: The Burning (fire + riots run the streets) -----------------------------
// Fire catches at a built lot and runs along the streets and rooftops, month by month, while
// riots drive dread up. A constabulary in reach damps the spread.
function theBurning(sim) {
  const seed = pickBuiltTile(sim) ?? centreTile(sim.map);
  consumeBurn(sim.map, seed);
  sim.dread = clampDread(sim.dread + 10);
  return setEvent(sim, GOD.NYARLATHOTEP, 'burning', {
    front: [seed], maxAge: BURNING_MAX_RINGS, count: 1, consumed: 1,
    message: 'Fire catches in the streets, and the mob runs with it.',
  });
}

// --- Yog-Sothoth: The Rift (a district scrambled out of true) -----------------------------
// A gate opens over a district: the contents of its land tiles (roads, zones, buildings,
// structures) are permanently permuted, out of place and out of true. The land itself stays.
function theRift(sim) {
  const { map, rng } = sim;
  const N = 6;
  const anchor = pickBuiltTile(sim) ?? centreTile(sim.map);
  const c0 = clampInt((anchor % map.cols) - Math.floor(N / 2), 0, map.cols - N);
  const r0 = clampInt(Math.floor(anchor / map.cols) - Math.floor(N / 2), 0, map.rows - N);

  const cells = [];
  for (let dr = 0; dr < N; dr++) {
    for (let dc = 0; dc < N; dc++) {
      const col = c0 + dc; const row = r0 + dr;
      const t = map.tileAt(col, row);
      if (!t || isWaterTerrain(t.terrain)) continue; // only relocate what sits on land
      cells.push(map.index(col, row));
    }
  }
  const contents = cells.map((i) => {
    const t = map.tiles[i];
    return { object: t.object, zone: t.zone, building: t.building, structure: t.structure, scar: t.scar };
  });
  const shuffled = rng.shuffle(contents);
  cells.forEach((i, k) => {
    const t = map.tiles[i];
    t.object = shuffled[k].object;
    t.zone = shuffled[k].zone;
    t.building = shuffled[k].building;
    t.structure = shuffled[k].structure;
    t.scar = shuffled[k].scar;
  });
  for (const i of cells) refreshConnectionsAround(map, i % map.cols, Math.floor(i / map.cols));
  sim.dread = clampDread(sim.dread + 15);
  return setEvent(sim, GOD.YOG, 'rift', {
    front: cells, maxAge: 5, count: cells.length,
    message: `The Rift opens: a district of ${cells.length} lots is scrambled out of true.`,
  });
}

// Advance the active spreading disaster one month. Instant events just age out; the Greening and
// the Burning grow their front by one ring. Clears sim.disaster when it is spent.
export function advanceDisaster(sim) {
  const d = sim.disaster;
  if (!d || d.done) { sim.disaster = null; return null; }
  d.age++;
  if (d.kind === 'greening') spreadFront(sim, d, greenNeighbours, consumeGreen, GREENING_CAP);
  else if (d.kind === 'burning') {
    spreadFront(sim, d, burnNeighbours, consumeBurn, BURNING_CAP);
    sim.dread = clampDread(sim.dread + 4); // the riot keeps the town on edge
  }
  if (d.age >= d.maxAge || (d.front && d.front.length === 0)) d.done = true;
  return d;
}

// Grow a spreader's front by one ring: from each active tile, catch eligible orthogonal
// neighbours (chance-gated, deterministic), consume them, and make them the new front.
function spreadFront(sim, d, neighboursOf, consume, cap) {
  const { map, rng } = sim;
  const next = [];
  const seen = new Set(d.consumedSet || []);
  for (const idx of d.front) {
    const col = idx % map.cols; const row = Math.floor(idx / map.cols);
    for (const [ncol, nrow, p] of neighboursOf(sim, col, row)) {
      const ni = map.index(ncol, nrow);
      if (seen.has(ni)) continue;
      if ((d.consumed || 0) >= cap) continue;
      if (!rng.chance(p)) continue;
      seen.add(ni);
      consume(map, ni);
      d.consumed = (d.consumed || 0) + 1;
      next.push(ni);
    }
  }
  d.consumedSet = seen;
  d.front = next;
}

// The design seed names the Greening but does not settle its terrain gate. Chosen field rule:
// damp land (marsh grass or wet sand) accepts it; open grass catches more slowly than developed
// ground; water and bare hill rock resist absolutely.
//
// M-b adds one door through that rule (spec section 6, "the Greening"): ground a foul main has been
// SEEPING into is damp, and the growth takes to damp ground whatever it is made of. So an infested
// pipe run through the hills is a bridge inland past rock that would otherwise stop the Greening
// dead. Only leaks and infested mains do this; a clean, maintained network hands it nothing, which is
// the spec's own caution against punishing a player for building an ordinary water system.
export function canGreeningTakeHold(tile) {
  if (!tile) return false;
  if (tile.terrain === TERRAIN.GRASS || tile.terrain === TERRAIN.BEACH) return true;
  if (isWaterTerrain(tile.terrain)) return false; // the tide never grows over
  return tile.damp > 0;
}

function greenNeighbours(sim, col, row) {
  const out = [];
  for (const [dc, dr] of NB4) {
    const t = sim.map.tileAt(col + dc, row + dr);
    if (!canGreeningTakeHold(t)) continue;
    if (t.scar && t.scar.kind === 'overgrown') continue;
    const developed = t.building || t.object || t.structure || t.zone;
    let p = developed ? 0.85 : (t.terrain === TERRAIN.GRASS ? 0.4 : 0.3);
    // Tainted damp is what the growth likes best: it catches there readily even on bare rock.
    if (t.damp > 0) p = Math.max(p, 0.6);
    out.push([col + dc, row + dr, p]);
  }
  return out;
}

// Fire spreads along what will burn (buildings, structures, roads). A constabulary in reach
// halves the odds a neighbour catches.
function burnNeighbours(sim, col, row) {
  const out = [];
  for (const [dc, dr] of NB4) {
    const ncol = col + dc; const nrow = row + dr;
    const t = sim.map.tileAt(ncol, nrow);
    if (!t) continue;
    if (t.scar && t.scar.kind === 'burnt') continue;
    const flammable = t.building || t.structure || hasNetwork(t, 'road');
    if (!flammable) continue;
    const guarded = constabularyNear(sim.map, ncol, nrow);
    out.push([ncol, nrow, guarded ? 0.35 : 0.8]);
  }
  return out;
}

function consumeGreen(map, idx) {
  const t = map.tiles[idx];
  razeTile(t);
  t.terrain = TERRAIN.GRASS;
  t.scar = { kind: 'overgrown' };
  refreshConnectionsAround(map, idx % map.cols, Math.floor(idx / map.cols));
}

function consumeBurn(map, idx) {
  const t = map.tiles[idx];
  razeTile(t);
  t.scar = { kind: 'burnt' };
  refreshConnectionsAround(map, idx % map.cols, Math.floor(idx / map.cols));
}

// --- shared helpers ----------------------------------------------------------------------

function setEvent(sim, god, kind, extra) {
  const info = GOD_INFO[god];
  const event = {
    god, kind, name: info.wrath, age: 0, done: false, consumed: extra.consumed || 0,
    ...extra,
  };
  sim.disaster = event;
  sim.lastWrath = { god, name: info.wrath, message: event.message };
  return event;
}

function waterAdjacent(map, col, row) {
  for (const [dc, dr] of NB4) {
    const t = map.tileAt(col + dc, row + dr);
    if (t && isWaterTerrain(t.terrain)) return true;
  }
  return false;
}


function constabularyNear(map, col, row) {
  const R = 6;
  for (let dr = -R; dr <= R; dr++) {
    for (let dc = -R; dc <= R; dc++) {
      const t = map.tileAt(col + dc, row + dr);
      if (t && t.structure && t.structure.kind === 'constabulary') {
        if (Math.max(Math.abs(dc), Math.abs(dr)) <= R) return true;
      }
    }
  }
  return false;
}

// A built/developed tile to seed a crawling wrath (deterministic pick over the sim rng).
function pickBuiltTile(sim, accepts = null) {
  const { map, rng } = sim;
  const built = [];
  for (let i = 0; i < map.tiles.length; i++) {
    const t = map.tiles[i];
    if ((t.building || t.structure) && (!accepts || accepts(t))) built.push(i);
  }
  if (built.length === 0) return null;
  return rng.pick(built);
}

function centreTile(map) {
  return map.index(Math.floor(map.cols / 2), Math.floor(map.rows / 2));
}

function clampInt(v, lo, hi) {
  v = Math.round(v);
  return v < lo ? lo : v > hi ? hi : v;
}
