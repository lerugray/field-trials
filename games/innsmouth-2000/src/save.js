// Save / load for INNSMOUTH 2000 (M8).
//
// A save is a plain JSON-safe snapshot: the map tiles, the full sim state, and the RNG's internal
// state, so a loaded game resumes to a bit-identical future (the same seeded stream continues). The
// non-serialized power grid is recomputed on load (it is derived, refreshed every step anyway). The
// contract the milestone gates: a mid-disaster save (sim.disaster.{age,maxAge,front} mid-crawl)
// round-trips clean. Pure of DOM; main.js handles the storage and the player feedback.

import { GameMap } from './mapgen.js';
import { makeSim } from './sim.js';
import { computePower } from './power.js';
import { computeWater } from './water.js';
import { computeAquifer } from './aquifer.js';

export const SAVE_VERSION = 1;

// The sim fields that carry the game's state. Everything stochastic is captured (rngState below);
// `map`, `rng`, and the derived `power` are handled separately.
const SIM_FIELDS = [
  'year', 'foundedYear', 'month', 'tick', 'speed', 'scenario', 'dreadBase', 'dread',
  'pop', 'counts', 'treasury', 'taxRates', 'ordinances', 'bankruptMonths', 'servicesCut',
  'favor', 'pendingWrath', 'disaster', 'lastWrath', 'events', 'hints', 'onboarded',
  'wrath', 'wrathPace', 'awakenings', 'survivalNoted', 'ended', 'flavorIndex', 'lastFlavorTick', 'autoSlow',
  // The underground (M-b). `presence` is the Deep Presence ledger, keyed by tile index; the rest are
  // the scenario's own subsurface settings, which must survive a reload or a saved Quiet Cove would
  // come back as a standard town. `aquifer` and `deep` are deliberately absent: both are derived, and
  // loadGame recomputes them below.
  'presence', 'aquiferOpts', 'deepStart', 'deepPace', 'deepGrace', 'deepNoted',
];

// Snapshot a sim to a JSON-safe object. The JSON round-trip both decouples the save from live state
// (no aliasing) and guarantees nothing un-serializable slipped in.
export function saveGame(sim) {
  const data = {
    version: SAVE_VERSION,
    rngState: sim.rng.getState(),
    map: { cols: sim.map.cols, rows: sim.map.rows, tiles: sim.map.tiles },
    sim: {},
  };
  for (const f of SIM_FIELDS) data.sim[f] = sim[f];
  // A crawling Greening/Burning carries a Set of consumed tiles (JSON drops Sets); store it as an
  // array so a mid-crawl disaster survives the trip, and rebuild the Set on load.
  if (sim.disaster && sim.disaster.consumedSet instanceof Set) {
    data.sim.disaster = { ...sim.disaster, consumedSet: [...sim.disaster.consumedSet] };
  }
  return JSON.parse(JSON.stringify(data));
}

// Rebuild a sim from a snapshot. Throws on a missing or version-mismatched save.
export function loadGame(input) {
  if (!input || input.version !== SAVE_VERSION) {
    throw new Error('This save is from another version of Innsmouth and cannot be read.');
  }
  const data = JSON.parse(JSON.stringify(input)); // decouple from the caller's object
  const map = new GameMap(data.map.cols, data.map.rows);
  map.tiles = data.map.tiles;
  const sim = makeSim(map, { seed: 0 });
  for (const f of SIM_FIELDS) if (data.sim[f] !== undefined) sim[f] = data.sim[f];
  if (sim.disaster && Array.isArray(sim.disaster.consumedSet)) {
    sim.disaster.consumedSet = new Set(sim.disaster.consumedSet);
  }
  sim.rng.setState(data.rngState);
  // The derived utility states are not serialized (they carry Sets and Maps, and every step
  // rebuilds them anyway); recompute all three, water after power so the pumps read the live grid. A
  // save written before the underground plane existed simply loads with no mains, which is true, and
  // one written before the aquifer existed gets a correct aquifer here, because the aquifer is read
  // out of the terrain rather than stored on the tiles.
  sim.power = computePower(map);
  sim.aquifer = computeAquifer(map, sim.aquiferOpts);
  sim.water = computeWater(map, sim.power);
  return sim;
}

// Convenience for the browser: serialize to / from a string for localStorage.
export function serializeSave(sim) { return JSON.stringify(saveGame(sim)); }
export function deserializeSave(text) { return loadGame(JSON.parse(text)); }
