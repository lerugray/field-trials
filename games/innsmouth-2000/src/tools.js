// Placement and tools model for INNSMOUTH 2000 (M2 substrate).
//
// Pure logic over the map (no canvas), so node --test covers every rule. A tool applied at a
// tile mutates that tile and reports what happened. The tile shape from mapgen is
// { terrain, elevation, object, zone } where:
//   object: null | { kind: 'road' } | { kind: 'powerline' } | {
//     kind: 'crossing', roadMask, powerlineMask
//   } -- one network, or both networks sharing a crossing tile
//   zone:   null | 'residential' | 'commercial' | 'industrial'
//   pipe:   null | { mask } -- the UNDERGROUND plane (M-a), independent of everything above
// Roads auto-connect: each road/power tile knows which of its 4 grid neighbours share its kind,
// as a bitmask, so the renderer (M2.2) can pick the right piece. Growth onto zones is M3.
//
// The underground water plane (M-a) is deliberately its own field, not another `object` kind: a
// main runs beneath roads, power lines, zones and houses with no surface conflict whatever, and a
// surface road/power crossing never creates a water crossing. Bulldozing is layer-aware, so
// clearing a lot above leaves the main below intact, and vice versa.

import { TERRAIN } from './mapgen.js';
import { SUBSTRATE, substrateAt } from './aquifer.js';

export const TOOL = {
  QUERY: 'query',
  BULLDOZE: 'bulldoze',
  ROAD: 'road',
  POWERLINE: 'powerline',
  GASWORKS: 'gasworks',
  WHALEOIL: 'whaleoil',
  ZONE_R: 'zone_r',
  ZONE_C: 'zone_c',
  ZONE_I: 'zone_i',
  CONSTABULARY: 'constabulary',
  ASYLUM: 'asylum',
  CHAPEL: 'chapel',
  SHRINE: 'shrine',
  UNIVERSITY: 'university',
  PIPE: 'pipe',
  PUMPHOUSE: 'pumphouse',
  WELLHOUSE: 'wellhouse',
  RESERVOIR: 'reservoir',
  FILTERHOUSE: 'filterhouse',
  VALVE: 'valve', // fit a valve and shut it, or work one already fitted
  FLUSH: 'flush', // flush the whole main this tile belongs to
  SEAL: 'seal', // cap a sea fissure with a sealing works
};

// The two build contexts (M-a). The surface is the town as it stands; the underground is the
// utility plane beneath it, where the mains run. The palette and the bulldozer both read this.
export const VIEW = { SURFACE: 'surface', UNDERGROUND: 'underground' };

export const ZONE = {
  RESIDENTIAL: 'residential',
  COMMERCIAL: 'commercial',
  INDUSTRIAL: 'industrial',
};

// Placed civic structures (M5). Unlike zones, the player builds these directly; each occupies a
// single tile (footprint 1x1 for the prototype), draws on the treasury, and pays monthly upkeep.
// Two are power sources with a supply capacity; four are services with a coverage radius:
//   gasworks / whaleoil      -- generation, feed the power grid over lines and buildings
//   constabulary             -- public order / riot resistance (the Nyarlathotep counter, M6)
//   asylum                   -- madness recovery (eases dread; the recovery hook matures M6)
//   chapel                   -- the Old Faith: eases dread and holds residents Unwary in its reach
//   shrine                   -- the cult seed: draws Cultists and raises dread in its reach
//   university               -- the campus and its Containment Wing (M6): eases dread, holds the Rift
//   pumphouse / wellhouse    -- water sources (M-a); they feed the underground mains
//   reservoir                -- a stored head of pressure (M-a); makes no water of its own
//   filterhouse              -- water quality (M-b); cleanses the main it stands on, and its test
//                               bench is what lets the town NAME what is in the water
// capacity: power units supplied (0 for a consumer/service). radius: Chebyshev coverage (0 = none).
// water: water units supplied to a connected main (0 for everything that is not a source).
// buffer: stored pressure that covers a shortfall. needsPower: the source only runs on a live grid.
// filter: taint removed each month from the main it joins (0 for everything that is not a filter).
export const STRUCTURE = {
  GASWORKS: 'gasworks',
  WHALEOIL: 'whaleoil',
  CONSTABULARY: 'constabulary',
  ASYLUM: 'asylum',
  CHAPEL: 'chapel',
  SHRINE: 'shrine',
  UNIVERSITY: 'university',
  PUMPHOUSE: 'pumphouse',
  WELLHOUSE: 'wellhouse',
  RESERVOIR: 'reservoir',
  FILTERHOUSE: 'filterhouse',
};

export const STRUCTURE_INFO = {
  gasworks: {
    tool: TOOL.GASWORKS, label: 'Gasworks', cost: 800, upkeep: 20,
    capacity: 60, radius: 0, dread: 0,
    blurb: 'A coal-gas works. Feeds power along lines and through built lots.',
  },
  whaleoil: {
    tool: TOOL.WHALEOIL, label: 'Whale-Oil Works', cost: 1300, upkeep: 35,
    capacity: 140, radius: 0, dread: 0,
    blurb: 'The old rendering works. More power than the gasworks, at a price.',
  },
  constabulary: {
    tool: TOOL.CONSTABULARY, label: 'Constabulary', cost: 500, upkeep: 15,
    capacity: 0, radius: 6, dread: -2,
    blurb: 'The town watch. Steadies the streets against riot and unrest.',
  },
  asylum: {
    tool: TOOL.ASYLUM, label: 'Asylum', cost: 700, upkeep: 25,
    capacity: 0, radius: 6, dread: -3,
    blurb: 'The sanitarium. Takes in the maddened; eases the common dread.',
  },
  chapel: {
    tool: TOOL.CHAPEL, label: 'Chapel', cost: 400, upkeep: 10,
    capacity: 0, radius: 5, dread: -5,
    blurb: 'The Old Faith holds. Eases dread and keeps folk from the cult in its reach.',
  },
  shrine: {
    tool: TOOL.SHRINE, label: 'Shrine', cost: 350, upkeep: 8,
    capacity: 0, radius: 5, dread: 6,
    blurb: 'A shrine to the deep gods. Draws Cultists and raises dread nearby.',
  },
  university: {
    tool: TOOL.UNIVERSITY, label: 'University', cost: 1200, upkeep: 40,
    capacity: 0, radius: 6, dread: -4,
    blurb: 'The campus and its Containment Wing. Draws Scholars, eases dread, holds the Rift at bay.',
  },
  pumphouse: {
    tool: TOOL.PUMPHOUSE, label: 'Pump House', cost: 600, upkeep: 22,
    capacity: 0, radius: 0, dread: 0,
    water: 120, needsPower: true,
    blurb: 'The municipal pump. Drives water into the mains, so long as the grid keeps it turning.',
  },
  wellhouse: {
    tool: TOOL.WELLHOUSE, label: 'Well House', cost: 250, upkeep: 8,
    capacity: 0, radius: 0, dread: 0,
    water: 35, needsPower: false,
    blurb: 'A covered well and a hand pump. Little water, and it asks nothing of the grid.',
  },
  reservoir: {
    tool: TOOL.RESERVOIR, label: 'Reservoir', cost: 450, upkeep: 12,
    capacity: 0, radius: 0, dread: 0,
    water: 0, buffer: 30, needsPower: false,
    blurb: 'A hill cistern. Makes no water of its own, but holds a head against a thirsty month.',
  },
  filterhouse: {
    tool: TOOL.FILTERHOUSE, label: 'Filter House', cost: 750, upkeep: 30,
    capacity: 0, radius: 0, dread: 0,
    water: 0, buffer: 0, filter: 12, needsPower: false,
    blurb: 'Sand beds and a test bench. Cleanses the main it joins, and can name what is in it.',
  },
};

// The structures that feed, steady, or cleanse the water network. Any of them conducts water, so a
// main laid beside a pump or a filter house joins its network.
export const WATER_STRUCTURES = Object.keys(STRUCTURE_INFO)
  .filter((kind) => STRUCTURE_INFO[kind].water > 0 || STRUCTURE_INFO[kind].buffer > 0
    || STRUCTURE_INFO[kind].filter > 0);

// The tool for each structure kind, and the structure kind each structure tool places.
const STRUCTURE_FOR_TOOL = {};
for (const kind of Object.keys(STRUCTURE_INFO)) STRUCTURE_FOR_TOOL[STRUCTURE_INFO[kind].tool] = kind;
export function structureForTool(tool) { return STRUCTURE_FOR_TOOL[tool] || null; }

// Tool costs charged against the treasury. Structures draw their price from STRUCTURE_INFO.
export const TOOL_COST = {
  [TOOL.BULLDOZE]: 1,
  [TOOL.ROAD]: 10,
  [TOOL.POWERLINE]: 5,
  [TOOL.PIPE]: 12, // digging a trench costs more than stringing a wire
  [TOOL.ZONE_R]: 20,
  [TOOL.ZONE_C]: 20,
  [TOOL.ZONE_I]: 20,
  [TOOL.VALVE]: 60, // fitting a valve into a live main; working one already fitted is free
  [TOOL.FLUSH]: 200, // the water carted away and the mains run off for a week
  [TOOL.SEAL]: 900, // a sealing works over a fissure: stone, iron, and a great deal of it
};
for (const kind of Object.keys(STRUCTURE_INFO)) {
  TOOL_COST[STRUCTURE_INFO[kind].tool] = STRUCTURE_INFO[kind].cost;
}

const ZONE_FOR_TOOL = {
  [TOOL.ZONE_R]: ZONE.RESIDENTIAL,
  [TOOL.ZONE_C]: ZONE.COMMERCIAL,
  [TOOL.ZONE_I]: ZONE.INDUSTRIAL,
};

// The 4 grid neighbours and their auto-connect bit. In screen terms:
//   SE = down-right, SW = down-left, NW = up-left, NE = up-right.
export const DIR = {
  SE: { bit: 1, dc: 1, dr: 0 },
  SW: { bit: 2, dc: 0, dr: 1 },
  NW: { bit: 4, dc: -1, dr: 0 },
  NE: { bit: 8, dc: 0, dr: -1 },
};
const DIRS = [DIR.SE, DIR.SW, DIR.NW, DIR.NE];

export function isWaterTerrain(terrain) {
  return terrain === TERRAIN.DEEP || terrain === TERRAIN.SHALLOW;
}

// Is there any water within Chebyshev radius `rad` of (col,row)? Shared by the gods' survey (a wharf
// shrine counts for Dagon) and the Flood Tide's uprising (homes near the new tideline turn).
//
// This lives here, exported, for a structural reason worth stating: gods.js and disasters.js each
// carried a byte-identical private copy, and the single-file build flattens every module into ONE
// scope, so the LAST declaration silently won for every caller in the bundle while node --test used
// each module's own. Identical today, so harmless today; the moment one copy diverged, the built page
// and the test suite would have disagreed with nothing to show for it. Same disease as the duplicate
// `const NB` that shipped a blank page, one notch quieter. test/build.test.js now forbids the shape.
export function waterWithin(map, col, row, rad) {
  for (let dr = -rad; dr <= rad; dr++) {
    for (let dc = -rad; dc <= rad; dc++) {
      const t = map.tileAt(col + dc, row + dr);
      if (t && isWaterTerrain(t.terrain)) return true;
    }
  }
  return false;
}

// Clamp v into [lo, hi]. Shared for the same reason as waterWithin above: camera.js, gods.js and
// sim.js each declared a private `clamp`, three identical copies in one flattened scope.
export function clampRange(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

// Network helpers keep the crossing representation in one place. A crossing is a roadbed with
// the power-line layer drawn over it, and carries an independent auto-connect mask for each layer.
export function hasNetwork(tile, kind) {
  if (!tile || !tile.object) return false;
  if (kind !== 'road' && kind !== 'powerline') return false;
  return tile.object.kind === kind || tile.object.kind === 'crossing';
}

export function networkMask(tile, kind) {
  if (!hasNetwork(tile, kind)) return 0;
  return tile.object.kind === 'crossing'
    ? (tile.object[`${kind}Mask`] | 0)
    : (tile.object.mask | 0);
}

function setNetworkMask(tile, kind, mask) {
  if (!hasNetwork(tile, kind)) return;
  if (tile.object.kind === 'crossing') tile.object[`${kind}Mask`] = mask;
  else tile.object.mask = mask;
}

// --- the underground plane (M-a) ----------------------------------------------------------
// Pipes are stored on their own tile field, so nothing on the surface can conflict with them.

export function hasPipe(tile) {
  return !!(tile && tile.pipe);
}

export function pipeMask(tile) {
  return hasPipe(tile) ? (tile.pipe.mask | 0) : 0;
}

// --- water quality, as it sits on a tile (M-b) ---------------------------------------------
// One number per tile, 0 (sweet) to 100 (the deep is living in it). It is stored HERE, on the tile,
// rather than per network, because that is what lets a single foul branch read foul on the map while
// the trunk beside it stays cold blue, and what lets lifting and re-laying one length of main be a
// real repair. A network's quality is the worst of its own tiles (src/water.js computes it).
//
// The four named states are the spec's; the thresholds are the mapping onto the stored number.
export const QUALITY = {
  CLEAN: 'clean',
  SUSPECT: 'suspect',
  TAINTED: 'tainted',
  INFESTED: 'infested',
};
export const QUALITY_LABEL = {
  clean: 'Clean', suspect: 'Suspect', tainted: 'Tainted', infested: 'Infested',
};
export const TAINT_AT = { suspect: 15, tainted: 40, infested: 70 };
export const TAINT_MAX = 100;
// Worst first: used to compare two readings and to walk severity in order.
export const QUALITY_ORDER = ['clean', 'suspect', 'tainted', 'infested'];

export function qualityFor(taint) {
  const v = taint || 0;
  if (v >= TAINT_AT.infested) return QUALITY.INFESTED;
  if (v >= TAINT_AT.tainted) return QUALITY.TAINTED;
  if (v >= TAINT_AT.suspect) return QUALITY.SUSPECT;
  return QUALITY.CLEAN;
}

// The taint stored on a tile. Absent means sweet, so an old save and fresh ground read the same.
export function taintOf(tile) {
  if (!tile) return 0;
  const v = tile.taint;
  return typeof v === 'number' && v > 0 ? v : 0;
}

// Set a tile's taint, clamped, dropping the field entirely when it comes back to sweet so saves stay
// small and a clean town carries no residue.
export function setTaint(tile, value) {
  if (!tile) return 0;
  const v = value <= 0 ? 0 : (value > TAINT_MAX ? TAINT_MAX : value);
  if (v <= 0) { if (tile.taint !== undefined) delete tile.taint; return 0; }
  tile.taint = v;
  return v;
}

export function addTaint(tile, delta) {
  return setTaint(tile, taintOf(tile) + delta);
}

// The worse of two quality readings.
export function worstQuality(a, b) {
  return QUALITY_ORDER.indexOf(a) >= QUALITY_ORDER.indexOf(b) ? a : b;
}

// Is this a placed water source or reservoir? Source tiles conduct water, so a main laid beside a
// pump joins its network without a pipe under the pump itself.
export function isWaterSource(tile) {
  if (!tile || !tile.structure) return false;
  const info = STRUCTURE_INFO[tile.structure.kind];
  return !!(info && (info.water > 0 || info.buffer > 0));
}

// Is this a filter house? It makes no water and holds none, but it sits ON the main and cleanses it,
// so it must join the network like any other works.
export function isFilterHouse(tile) {
  if (!tile || !tile.structure) return false;
  const info = STRUCTURE_INFO[tile.structure.kind];
  return !!(info && info.filter > 0);
}

// Any water works: a source, a reservoir, or a filter house.
export function isWaterWorks(tile) {
  return isWaterSource(tile) || isFilterHouse(tile);
}

// Is a valve fitted here, and is it shut? A valve lives on the main it is fitted into (M-b). Shut,
// it stops the water: the flood-fill treats the tile as no conductor at all, which is what splits a
// contaminated branch off the clean network.
export function valveState(tile) {
  return hasPipe(tile) && tile.pipe.valve ? tile.pipe.valve : null;
}
export function valveShut(tile) {
  return valveState(tile) === 'shut';
}

// Is there a pipe or works on this tile at all? This is the VISUAL question: the trench art and the
// auto-connect mask both use it, so a run of main still draws as one continuous run through a shut
// valve. The valve's own mark is what tells the player the water stops there.
export function isPipeLink(tile) {
  return hasPipe(tile) || isWaterWorks(tile);
}

// Does water actually pass through this tile? Pipes and water works, minus any shut valve. Buildings
// never conduct water (the spec's central divergence from the power grid).
export function isWaterConductor(tile) {
  return isPipeLink(tile) && !valveShut(tile);
}

// The auto-connect bitmask for the pipe at (col,row): which neighbours it joins underground. A
// pipe connects to other pipes AND to water works, so a main visibly runs into its pump.
export function pipeConnectionMask(map, col, row) {
  const tile = map.tileAt(col, row);
  if (!hasPipe(tile)) return 0;
  let mask = 0;
  for (const d of DIRS) {
    if (isPipeLink(map.tileAt(col + d.dc, row + d.dr))) mask |= d.bit;
  }
  return mask;
}

// Recompute the stored pipe mask on a tile and its 4 neighbours (after any pipe or source change).
export function refreshPipesAround(map, col, row) {
  const cells = [[col, row]];
  for (const d of DIRS) cells.push([col + d.dc, row + d.dr]);
  for (const [c, r] of cells) {
    const t = map.tileAt(c, r);
    if (!hasPipe(t)) continue;
    t.pipe.mask = pipeConnectionMask(map, c, r);
  }
}

// Every tile in the one connected run of main that (col,row) belongs to, in tile-index order. A
// shut valve is not a conductor, so it bounds the walk: this is what makes "close a valve to isolate
// the branch" mean something to flushing as well as to the network. Pure over the map, and the same
// conductor rule computeWater floods with, so a flush can never disagree with the network it flushed.
export function componentTilesFrom(map, col, row) {
  const start = map.tileAt(col, row);
  if (!isWaterConductor(start)) return [];
  const seen = new Set([map.index(col, row)]);
  const out = [];
  const stack = [[col, row]];
  while (stack.length) {
    const [c, r] = stack.pop();
    out.push(map.index(c, r));
    for (const d of DIRS) {
      const nc = c + d.dc;
      const nr = r + d.dr;
      if (!map.inBounds(nc, nr)) continue;
      const ni = map.index(nc, nr);
      if (seen.has(ni)) continue;
      if (!isWaterConductor(map.tiles[ni])) continue;
      seen.add(ni);
      stack.push([nc, nr]);
    }
  }
  out.sort((a, b) => a - b);
  return out;
}

// Remove one named network without disturbing the other layer of a crossing.
export function removeNetwork(tile, kind) {
  if (!hasNetwork(tile, kind)) return false;
  if (tile.object.kind !== 'crossing') {
    tile.object = null;
  } else {
    const other = kind === 'road' ? 'powerline' : 'road';
    const mask = networkMask(tile, other);
    tile.object = { kind: other, mask };
  }
  return true;
}

// --- what a flush actually carries off (M-b) -----------------------------------------------
// Section 3's "Flush Mains" works best if the source is clean and the pressure is good. Source
// cleanliness is read straight off the intake; "pressure is good" is carried instead by the spread
// rule (a low-pressure main re-taints far faster than a pressurized one), so a flush on a starved
// network buys days rather than years without needing the pressure state in here.
export const FLUSH_BASE = 40; // taint one flush carries off a main
export const FLUSH_CLEAN_INTAKE_BONUS = 18; // ...more when the water coming in is sweet
export const FLUSH_NO_SOURCE_FACTOR = 0.5; // ...and half as much with nothing to push water through

export function flushStrength(map, tiles) {
  let capacity = 0;
  let cleanestIntake = null;
  for (const i of tiles) {
    const t = map.tiles[i];
    if (!isWaterSource(t)) continue;
    const info = STRUCTURE_INFO[t.structure.kind];
    if (!info || !(info.water > 0)) continue;
    capacity += info.water;
    const v = taintOf(t);
    if (cleanestIntake === null || v < cleanestIntake) cleanestIntake = v;
  }
  if (capacity <= 0) return Math.round(FLUSH_BASE * FLUSH_NO_SOURCE_FACTOR);
  if (qualityFor(cleanestIntake) === QUALITY.CLEAN) return FLUSH_BASE + FLUSH_CLEAN_INTAKE_BONUS;
  return FLUSH_BASE;
}

// What this tool costs AT this tile. Almost always the flat TOOL_COST, but working a valve that is
// already fitted is free: the fitter is paid once, and the player should never be taxed for shutting
// a branch in an emergency. main.js charges what this reports, so the rule lives in one place.
export function toolCostAt(map, tool, col, row) {
  if (tool === TOOL.VALVE && valveState(map.tileAt(col, row))) return 0;
  return TOOL_COST[tool] || 0;
}

// Can `tool` be applied at (col, row)? Returns { ok, reason } where reason is player-facing
// plain English (period register, no em-dashes) when ok is false. `opts.view` tells the bulldozer
// which plane it is working on: underground it lifts the main and leaves the surface alone.
export function canApply(map, tool, col, row, opts = {}) {
  const tile = map.tileAt(col, row);
  if (!tile) return { ok: false, reason: 'That is beyond the edge of the map.' };

  if (tool === TOOL.QUERY) return { ok: true };

  if (tool === TOOL.BULLDOZE) {
    if (opts.view === VIEW.UNDERGROUND) {
      if (hasPipe(tile)) return { ok: true };
      return { ok: false, reason: 'There is no main here to lift.' };
    }
    if (tile.object || tile.zone || tile.structure || tile.building || tile.scar) return { ok: true };
    return { ok: false, reason: 'There is nothing here to clear.' };
  }

  // All building tools need dry land.
  if (isWaterTerrain(tile.terrain)) {
    return { ok: false, reason: 'The tide will not hold a foundation. Build on dry land.' };
  }

  // A water main runs beneath everything on the surface, so nothing up there blocks it.
  if (tool === TOOL.PIPE) {
    if (hasPipe(tile)) return { ok: false, reason: 'A main already runs beneath this ground.' };
    return { ok: true };
  }

  // --- the M-b works and actions, all of them underground -----------------------------------

  // A valve is fitted into a main, so there must be one here to fit it into.
  if (tool === TOOL.VALVE) {
    if (!hasPipe(tile)) return { ok: false, reason: 'A valve wants a main to sit in. Lay one first.' };
    return { ok: true };
  }

  // Flushing runs a whole connected main off, so it needs a main (or a works) to start from.
  if (tool === TOOL.FLUSH) {
    if (!isPipeLink(tile)) return { ok: false, reason: 'There is no main here to flush.' };
    if (!isWaterConductor(tile)) {
      return { ok: false, reason: 'The valve here is shut. Open it before you flush this branch.' };
    }
    return { ok: true };
  }

  // A sealing works caps a sea fissure, and there is nothing else worth capping.
  if (tool === TOOL.SEAL) {
    if (tile.sealed) return { ok: false, reason: 'This fissure is capped already.' };
    const sub = substrateAt(map, col, row, opts.aquiferOpts);
    if (sub !== SUBSTRATE.FISSURE) {
      return { ok: false, reason: 'The rock is sound here. There is no fissure to cap.' };
    }
    if (tile.structure) return { ok: false, reason: 'A structure already stands here.' };
    return { ok: true };
  }

  // Placed structures need a clear tile: no network, no zone, no other structure.
  if (structureForTool(tool)) {
    if (tile.structure) return { ok: false, reason: 'A structure already stands here.' };
    if (tile.object) {
      if (opts.view === VIEW.UNDERGROUND) {
        if (tile.object.kind === 'powerline') {
          return { ok: false, reason: 'A power line runs above this tile.' };
        }
        return { ok: false, reason: 'A street runs above this tile.' };
      }
      return { ok: false, reason: 'Clear the road or line before you build here.' };
    }
    if (tile.zone) return { ok: false, reason: 'Clear the zoning before you build here.' };
    return { ok: true };
  }

  if (tool === TOOL.ROAD || tool === TOOL.POWERLINE) {
    const kind = tool === TOOL.ROAD ? 'road' : 'powerline';
    if (hasNetwork(tile, kind)) {
      return { ok: false, reason: 'That is already laid here.' };
    }
    return { ok: true };
  }

  if (ZONE_FOR_TOOL[tool]) {
    if (tile.object) return { ok: false, reason: 'Clear the road before you zone this lot.' };
    if (tile.zone === ZONE_FOR_TOOL[tool]) {
      return { ok: false, reason: 'This lot is already zoned so.' };
    }
    return { ok: true };
  }

  return { ok: false, reason: 'Unknown tool.' };
}

// Apply a tool at (col, row). Mutates the map when it can. Returns
// { ok, changed, cost, reason }. Query never changes anything. `opts.view` selects the plane the
// bulldozer works on (see canApply).
export function applyTool(map, tool, col, row, opts = {}) {
  const check = canApply(map, tool, col, row, opts);
  if (!check.ok) return { ok: false, changed: false, cost: 0, reason: check.reason };

  const tile = map.tiles[map.index(col, row)];
  const cost = TOOL_COST[tool] || 0;

  if (tool === TOOL.QUERY) {
    return { ok: true, changed: false, cost: 0, reason: null };
  }

  if (tool === TOOL.BULLDOZE) {
    // Underground the bulldozer lifts the main and nothing else: the surface above is a separate
    // plane and is left exactly as it stands.
    if (opts.view === VIEW.UNDERGROUND) {
      tile.pipe = null;
      // Lifting a length of main takes its contamination away with it: this IS the spec's "Replace
      // Pipe" repair, done with the tools the player already has (lift, then lay again).
      setTaint(tile, 0);
      delete tile.flushed;
      delete tile.backflow;
      refreshPipesAround(map, col, row);
      return { ok: true, changed: true, cost, reason: null };
    }
    // At a crossing the visible power-line layer comes away first; a second pass clears the road.
    // This preserves the reference convention that stacked transport layers are demolished one at
    // a time, while making the result visually predictable regardless of placement order.
    if (tile.object && tile.object.kind === 'crossing') removeNetwork(tile, 'powerline');
    else tile.object = null;
    tile.zone = null;
    const hadWorks = isWaterWorks(tile);
    tile.structure = null;
    tile.building = null;
    tile.scar = null; // clearing the lot also cleans away any disaster scar (M6)
    // A foul intake goes with the pump that drew it. Nothing carries over to what is built next.
    if (hadWorks) setTaint(tile, 0);
    refreshConnectionsAround(map, col, row);
    // A cleared works was a water conductor; the mains around it must re-read their connections.
    if (hadWorks) refreshPipesAround(map, col, row);
    return { ok: true, changed: true, cost, reason: null };
  }

  if (tool === TOOL.PIPE) {
    tile.pipe = { mask: 0 };
    // A newly dug main is sweet, whatever stood here before.
    setTaint(tile, 0);
    // Laying a main never disturbs the surface: the zone, the road, and the house above all stand.
    refreshPipesAround(map, col, row);
    return { ok: true, changed: true, cost, reason: null };
  }

  // A valve: fit one shut on the first turn of the tool, then work it open and shut thereafter. One
  // click, one state, no pressure engineering (anti-goal 1). Fitting is charged; working it is not.
  if (tool === TOOL.VALVE) {
    tile.pipe.valve = valveState(tile) === 'shut' ? 'open' : 'shut';
    refreshPipesAround(map, col, row);
    return { ok: true, changed: true, cost: toolCostAt(map, tool, col, row), reason: null };
  }

  // Flush the whole connected main: the water is run off and the taint carried away with it. It
  // works best behind a clean intake, and barely at all with no source to push water through.
  if (tool === TOOL.FLUSH) {
    const tiles = componentTilesFrom(map, col, row);
    const strength = flushStrength(map, tiles);
    for (const i of tiles) {
      const t = map.tiles[i];
      setTaint(t, taintOf(t) - strength);
      t.flushed = opts.tick || 0;
    }
    return { ok: true, changed: true, cost, reason: null, tiles: tiles.length, strength };
  }

  // A sealing works over a fissure: stone and iron in the rock. Permanent, and the deep notices
  // (sim.noteBuild applies Dagon's displeasure; the map mutation itself stays pure).
  if (tool === TOOL.SEAL) {
    tile.sealed = true;
    return { ok: true, changed: true, cost, reason: null };
  }

  if (structureForTool(tool)) {
    tile.structure = { kind: structureForTool(tool) };
    tile.zone = null;
    tile.object = null;
    // A new works joins the underground network, so neighbouring mains re-read their connections.
    if (isWaterWorks(tile)) refreshPipesAround(map, col, row);
    return { ok: true, changed: true, cost, reason: null };
  }

  if (tool === TOOL.ROAD || tool === TOOL.POWERLINE) {
    const kind = tool === TOOL.ROAD ? 'road' : 'powerline';
    if (tile.object) {
      const oldRoadMask = networkMask(tile, 'road');
      const oldPowerlineMask = networkMask(tile, 'powerline');
      tile.object = {
        kind: 'crossing',
        roadMask: kind === 'road' ? 0 : oldRoadMask,
        powerlineMask: kind === 'powerline' ? 0 : oldPowerlineMask,
      };
    } else {
      tile.object = { kind, mask: 0 };
    }
    tile.zone = null; // laying a network clears zoning on the lot
    refreshConnectionsAround(map, col, row);
    return { ok: true, changed: true, cost, reason: null };
  }

  // Zone paint.
  tile.zone = ZONE_FOR_TOOL[tool];
  return { ok: true, changed: true, cost, reason: null };
}

// The auto-connect bitmask for the network at (col, row): which neighbours share its kind.
export function connectionMask(map, col, row, requestedKind = null) {
  const tile = map.tileAt(col, row);
  if (!tile || !tile.object) return 0;
  const kind = requestedKind || (tile.object.kind === 'crossing' ? 'road' : tile.object.kind);
  if (!hasNetwork(tile, kind)) return 0;
  let mask = 0;
  for (const d of DIRS) {
    const n = map.tileAt(col + d.dc, row + d.dr);
    if (hasNetwork(n, kind)) mask |= d.bit;
  }
  return mask;
}

// Recompute the stored mask on a tile and its 4 neighbours (call after any placement/removal).
export function refreshConnectionsAround(map, col, row) {
  const cells = [[col, row]];
  for (const d of DIRS) cells.push([col + d.dc, row + d.dr]);
  for (const [c, r] of cells) {
    const t = map.tileAt(c, r);
    if (!t || !t.object) continue;
    if (hasNetwork(t, 'road')) setNetworkMask(t, 'road', connectionMask(map, c, r, 'road'));
    if (hasNetwork(t, 'powerline')) setNetworkMask(t, 'powerline', connectionMask(map, c, r, 'powerline'));
  }
}

// A human-readable description of a tile, for the query tool (M2.3). Plain English.
export function describeTile(map, col, row) {
  const tile = map.tileAt(col, row);
  if (!tile) return { title: 'The Void', lines: ['Beyond the edge of the map.'] };
  const terrainName = {
    deep: 'Deep water', shallow: 'Shallow water', beach: 'Wet sand',
    grass: 'Marsh grass', rock: 'Bare rock',
  }[tile.terrain] || tile.terrain;
  const lines = [`Ground: ${terrainName}`, `Elevation: ${tile.elevation}`];
  if (tile.structure) {
    const info = STRUCTURE_INFO[tile.structure.kind];
    if (info) {
      lines.push(info.label + '.');
      lines.push(info.blurb);
      if (info.capacity > 0) lines.push(`Supplies ${info.capacity} of power.`);
      if (info.water > 0) lines.push(`Supplies ${info.water} of water.`);
      if (info.buffer > 0) lines.push(`Holds ${info.buffer} of water in reserve.`);
      if (info.filter > 0) lines.push(`Cleanses ${info.filter} of taint from its main each month.`);
    }
  }
  if (tile.object) {
    if (hasNetwork(tile, 'road')) lines.push('A dirt road runs here.');
    if (hasNetwork(tile, 'powerline')) lines.push('A power line crosses here.');
  }
  if (hasPipe(tile)) lines.push('A water main runs beneath.');
  const valve = valveState(tile);
  if (valve === 'shut') lines.push('A valve is fitted here, and it is shut.');
  else if (valve === 'open') lines.push('A valve is fitted here, standing open.');
  if (tile.sealed) lines.push('A sealing works caps the fissure beneath.');
  if (tile.zone) {
    const zoneName = {
      residential: 'Residential lot', commercial: 'Commercial lot', industrial: 'Industrial lot',
    }[tile.zone];
    lines.push(`Zoned: ${zoneName}`);
  }
  if (tile.building) {
    const clsName = {
      unwary: 'the Unwary', cultist: 'Cultists', deepone: 'Deep Ones', scholar: 'Scholars',
    }[tile.building.cls] || 'residents';
    if (tile.zone === 'residential') lines.push(`Home to ${clsName}. Tier ${tile.building.level}.`);
    else lines.push(`Built up. Tier ${tile.building.level}.`);
  }
  if (tile.scar) {
    const scarLine = {
      burnt: 'Burned out. Blackened ground and charred stubs.',
      overgrown: 'Choked with unnatural growth.',
      rubble: 'Fallen to rubble.',
      flooded: 'Taken by the tide.',
    }[tile.scar.kind];
    if (scarLine) lines.push(scarLine);
  }
  if (!tile.object && !tile.zone && !tile.structure && !isWaterTerrain(tile.terrain) && !tile.scar
      && !hasPipe(tile) && !tile.sealed) {
    lines.push('Unclaimed land.');
  }
  return { title: `Lot ${col}, ${row}`, lines };
}
