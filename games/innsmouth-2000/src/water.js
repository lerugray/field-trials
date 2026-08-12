// Water network for INNSMOUTH 2000 (M-a of the underground system).
//
// The town's second utility, modelled on power.js: a pure, deterministic flood-fill over the map
// with no canvas and no DOM, so node --test covers every rule. It diverges from power exactly where
// the ratified spec says it must:
//
//   - Buildings do NOT conduct. Pipes are the network; a lot is served because a live pipe runs
//     NEAR it, not because the house next door passes water along. (Power conducts through built
//     lots; water never does.)
//   - Pipes live on their own underground plane (tile.pipe), so a main can run beneath a road, a
//     power line, a zone, or a house with no surface conflict at all.
//   - Service is not a simple on/off. A network is DRY (no working source), LOW (its sources cannot
//     meet what the served lots draw), or GOOD (pressurized).
//   - Coverage is a radius, not adjacency: a live pipe waters every tile within Chebyshev
//     COVERAGE_RADIUS, so the player lays trunk mains along the roads instead of a pipe per lot.
//
// Sources are the placed water structures, and they are the only other conductor, so a pipe laid
// beside a pump joins its network. A Pump House wants power for its output (an unpowered pump
// gives nothing, which is the spec's "all pumps unpowered" road to DRY); a Well House works on its
// own; a Reservoir makes no water at all and instead holds a head of pressure that covers a
// shortfall, which is what keeps it a forgiving, teachable object.

import {
  STRUCTURE_INFO, hasPipe, isWaterConductor, isWaterSource, isWaterWorks, isFilterHouse,
  QUALITY, QUALITY_LABEL, TAINT_AT, qualityFor, taintOf,
} from './tools.js';

// What a built lot draws each month, by zone and development tier (spec: residential and
// commercial level x 1, industrial level x 2). Empty zoned land draws nothing until it builds.
export const WATER_PER_TIER = { residential: 1, commercial: 1, industrial: 2 };

// A live pipe waters every tile within this Chebyshev radius (spec's SC2K-borrowed convention).
export const COVERAGE_RADIUS = 2;

// The three service states a network can be in.
export const PRESSURE = { DRY: 'dry', LOW: 'low', GOOD: 'good' };

// Plain-English names for the query and the advisor.
export const PRESSURE_LABEL = { dry: 'Dry', low: 'Low', good: 'Good' };

// M-b: what the Deep Ones do to a network's ability to hold pressure. Both are set by the monthly
// deep step (src/deep.js) as timers on the map, and read here, so the flood-fill itself stays a pure
// function of the map and the grid with no RNG of its own.
export const SABOTAGE_FACTOR = 0.35; // a sabotaged pump's remaining output
export const CHOKE_FACTOR = 0.45; // an infested main's remaining capacity while it knocks

// The growth gate needs a name for foul water. Tainted or worse will still water a lot for survival
// but will not let it build up (spec section 2: level 2 and 3 want "potable or at least non-tainted").
const FOUL_QUALITIES = new Set([QUALITY.TAINTED, QUALITY.INFESTED]);
export function isFoulQuality(q) { return FOUL_QUALITIES.has(q); }

// The 4 grid neighbours (matches tools.DIR, kept local so water.js has no cyclic import).
// (Named apart from power.js's own neighbour table: the single-file build concatenates every
// module into one scope, so top-level identifiers must be unique across all of src/.)
const WATER_NB = [[1, 0], [-1, 0], [0, 1], [0, -1]];

// The water a source tile supplies. A Pump House wants power: unpowered, it draws nothing at all.
// A sabotaged works (M-b) is running on a wrecked engine and gives a fraction of its rating until
// the fitters have had their months with it.
function outputOf(tile, powered) {
  if (!tile || !tile.structure) return 0;
  const info = STRUCTURE_INFO[tile.structure.kind];
  if (!info || !(info.water > 0)) return 0;
  if (info.needsPower && !powered) return 0;
  if (tile.structure.sabotage > 0) return Math.floor(info.water * SABOTAGE_FACTOR);
  return info.water;
}

// Is this works out of action from sabotage this month?
function sabotaged(tile) {
  return !!(tile && tile.structure && tile.structure.sabotage > 0);
}

// Is this length of main choked (an infested network's intermittent pressure loss)?
function choked(tile) {
  return !!(tile && tile.pipe && tile.pipe.choke > 0);
}

// The stored head a source tile holds (the Reservoir, which makes no water of its own).
function bufferOf(tile) {
  if (!tile || !tile.structure) return 0;
  const info = STRUCTURE_INFO[tile.structure.kind];
  return info && info.buffer > 0 ? info.buffer : 0;
}

// What a built lot draws. Empty zoned land draws nothing until it builds.
export function demandOfTile(tile) {
  if (!tile || !tile.building || !tile.zone) return 0;
  const per = WATER_PER_TIER[tile.zone] || 0;
  return (tile.building.level || 1) * per;
}

// Compute the water state of the whole map. `power` is the sim's power state (from computePower);
// it decides whether each Pump House is running. Returns:
//   served:    Set<index> of tiles inside a PRESSURIZED network's coverage
//   lowServed: Set<index> of tiles inside a LOW-pressure network's coverage (and no better)
//   pipes:     Map<index, pressure> for every conductor tile, so the renderer can colour it
//   taints:    Map<index, taint> for every conductor tile, so one foul branch reads foul on its own
//   owner:     Map<index, componentId> for every covered tile, so the query names its network
//   byId:      Map<componentId, component>, so a per-tile lookup never scans the component list
//   components: [{ id, tiles, capacity, rating, buffer, demand, satisfied, pressure, sources,
//                  unpoweredPumps, coverage, taint, quality, choked, sabotaged, filters, surveyed,
//                  lastFlush, lastBackflow }]
//   totals:    { capacity, demand, pressurized, low, dry, suspect, tainted, infested }
// Deterministic: the flood order follows tile index, so results are stable per map.
export function computeWater(map, power = null) {
  const seen = new Uint8Array(map.cols * map.rows);
  const claimed = new Uint8Array(map.cols * map.rows); // a lot is billed to one network only
  const served = new Set();
  const lowServed = new Set();
  const pipes = new Map();
  const taints = new Map();
  const owner = new Map();
  const byId = new Map();
  const components = [];
  // Where the town's campuses stand. A network a university reaches is SURVEYED: the town can put a
  // name to what is in its water. Gathered once, because a per-tile scan would be quadratic.
  const campuses = campusesOf(map);
  let totCap = 0;
  let totDem = 0;
  let pressurized = 0;
  let low = 0;
  let dry = 0;
  const badNets = { suspect: 0, tainted: 0, infested: 0 };

  for (let row = 0; row < map.rows; row++) {
    for (let col = 0; col < map.cols; col++) {
      const start = map.index(col, row);
      if (seen[start]) continue;
      const tile = map.tiles[start];
      if (!isWaterConductor(tile)) { seen[start] = 1; continue; }

      // Flood this connected run of pipe and works. A shut valve is no conductor, so it bounds the
      // flood: that is the whole of "close a valve to isolate the branch".
      const tiles = [];
      let rating = 0; // what the working sources are rated at, before sabotage or a choke
      let capacity = 0;
      let buffer = 0;
      let unpoweredPumps = 0;
      let sabotagedWorks = 0;
      let chokedMains = 0;
      let filters = 0;
      let taint = 0;
      let lastFlush = 0;
      let lastBackflow = 0;
      const sources = {};
      const stack = [[col, row]];
      seen[start] = 1;
      while (stack.length) {
        const [c, r] = stack.pop();
        const i = map.index(c, r);
        const t = map.tiles[i];
        tiles.push(i);
        const tv = taintOf(t);
        if (tv > taint) taint = tv;
        if (t.flushed > lastFlush) lastFlush = t.flushed;
        if (t.backflow > lastBackflow) lastBackflow = t.backflow;
        if (choked(t)) chokedMains++;
        if (isFilterHouse(t)) filters++;
        if (isWaterSource(t)) {
          const kind = t.structure.kind;
          sources[kind] = (sources[kind] || 0) + 1;
          const info = STRUCTURE_INFO[kind];
          const powered = !!(power && power.energized && power.energized.has(i));
          capacity += outputOf(t, powered);
          if (info && info.water > 0 && (!info.needsPower || powered)) rating += info.water;
          buffer += bufferOf(t);
          if (info && info.needsPower && info.water > 0 && !powered) unpoweredPumps++;
          if (sabotaged(t)) sabotagedWorks++;
        }
        for (const [dc, dr] of WATER_NB) {
          const nc = c + dc;
          const nr = r + dr;
          if (!map.inBounds(nc, nr)) continue;
          const ni = map.index(nc, nr);
          if (seen[ni]) continue;
          if (!isWaterConductor(map.tiles[ni])) continue;
          seen[ni] = 1;
          stack.push([nc, nr]);
        }
      }
      tiles.sort((a, b) => a - b); // stable order regardless of the flood's stack order

      // A choked main cannot hold its head: the network delivers a fraction of what its works make
      // until the knocking stops. This is the spec's "intermittent low pressure", carried as a timer
      // on the map so this function stays a deterministic read of the map and the grid.
      if (chokedMains > 0) capacity = Math.floor(capacity * CHOKE_FACTOR);

      // The tiles this network reaches: Chebyshev COVERAGE_RADIUS around every conductor.
      const coverage = coverageOf(map, tiles);

      // What the network is asked for: every built lot in its coverage, billed once. An earlier
      // network (lower tile index) claims a shared lot, so no demand is ever counted twice.
      let demand = 0;
      for (const i of coverage) {
        if (claimed[i]) continue;
        const d = demandOfTile(map.tiles[i]);
        if (d <= 0) continue;
        claimed[i] = 1;
        demand += d;
      }

      // Dry with no working source; pressurized when the sources (plus any stored head) meet the
      // draw; low otherwise.
      let pressure = PRESSURE.DRY;
      if (capacity > 0) pressure = (capacity + buffer >= demand) ? PRESSURE.GOOD : PRESSURE.LOW;

      // The network's quality is the worst reading on any of its own lengths of main.
      const quality = qualityFor(taint);
      // Detection (section 3): the town sees symptoms everywhere, but it can only NAME what is in
      // the water where it has a test bench (a filter house on the main) or a campus in reach.
      const surveyed = filters > 0 || coveredByCampus(map, tiles, campuses);

      const id = components.length + 1;
      for (const i of tiles) {
        pipes.set(i, pressure);
        taints.set(i, taintOf(map.tiles[i]));
      }
      if (pressure !== PRESSURE.DRY) {
        for (const i of coverage) {
          if (!owner.has(i)) owner.set(i, id);
          if (pressure === PRESSURE.GOOD) served.add(i);
          else lowServed.add(i);
        }
      }

      if (pressure === PRESSURE.GOOD) pressurized++;
      else if (pressure === PRESSURE.LOW) low++;
      else dry++;
      if (badNets[quality] !== undefined) badNets[quality]++;
      totCap += capacity;
      totDem += demand;
      const component = {
        id, tiles, capacity, rating, buffer, demand, satisfied: pressure === PRESSURE.GOOD,
        pressure, sources, unpoweredPumps, coverage,
        taint, quality, choked: chokedMains, sabotaged: sabotagedWorks, filters, surveyed,
        lastFlush, lastBackflow,
      };
      components.push(component);
      byId.set(id, component);
    }
  }

  // Good water wins wherever two networks overlap: a lot on a pressurized main is not low.
  for (const i of served) lowServed.delete(i);

  return {
    served,
    lowServed,
    pipes,
    taints,
    owner,
    byId,
    components,
    totals: {
      capacity: totCap, demand: totDem, pressurized, low, dry,
      suspect: badNets.suspect, tainted: badNets.tainted, infested: badNets.infested,
    },
  };
}

// Every university on the map, with its coverage radius. A campus surveys the water it reaches.
function campusesOf(map) {
  const out = [];
  const info = STRUCTURE_INFO.university;
  const radius = info ? info.radius : 0;
  if (radius <= 0) return out;
  for (let i = 0; i < map.tiles.length; i++) {
    const t = map.tiles[i];
    if (!t || !t.structure || t.structure.kind !== 'university') continue;
    const col = i % map.cols;
    out.push({ col, row: (i - col) / map.cols, radius });
  }
  return out;
}

// Does any campus reach any length of this main? Early-exits, and the conductor count is small.
function coveredByCampus(map, tiles, campuses) {
  if (campuses.length === 0) return false;
  for (const i of tiles) {
    const col = i % map.cols;
    const row = (i - col) / map.cols;
    for (const c of campuses) {
      if (Math.max(Math.abs(c.col - col), Math.abs(c.row - row)) <= c.radius) return true;
    }
  }
  return false;
}

// Every tile within COVERAGE_RADIUS (Chebyshev) of any tile in `tiles`.
function coverageOf(map, tiles) {
  const out = new Set();
  for (const i of tiles) {
    const col = i % map.cols;
    const row = (i - col) / map.cols;
    for (let dr = -COVERAGE_RADIUS; dr <= COVERAGE_RADIUS; dr++) {
      for (let dc = -COVERAGE_RADIUS; dc <= COVERAGE_RADIUS; dc++) {
        const nc = col + dc;
        const nr = row + dr;
        if (!map.inBounds(nc, nr)) continue;
        out.add(map.index(nc, nr));
      }
    }
  }
  return out;
}

// The service a tile receives: 'good', 'low', or 'dry'. Pure lookup over a computed water state.
export function waterAt(water, index) {
  if (!water) return PRESSURE.DRY;
  if (water.served.has(index)) return PRESSURE.GOOD;
  if (water.lowServed.has(index)) return PRESSURE.LOW;
  return PRESSURE.DRY;
}

// Is (col,row) watered at all (good or low)? The plain "Watered: yes/no" the lot query asks for.
export function wateredAt(map, water, col, row) {
  return waterAt(water, map.index(col, row)) !== PRESSURE.DRY;
}

// The quality of the water reaching a tile, from the network that serves it. Ground nothing serves
// reads CLEAN, because there is no foul water on it either.
export function qualityAt(water, index) {
  if (!water || !water.owner) return QUALITY.CLEAN;
  const id = water.owner.get(index);
  if (!id) return QUALITY.CLEAN;
  const comp = water.byId ? water.byId.get(id) : water.components.find((c) => c.id === id);
  return comp ? comp.quality : QUALITY.CLEAN;
}

// How tall water lets a lot grow (the growth gate, per the ratified spec):
//   good water, clean or merely suspect -> the full tier cap, alongside power
//   low pressure -> capped at tier 2
//   tainted or infested water -> capped at the first tier, whatever the pressure
//   no water -> capped at the first tier
// Power applies its own cap on top of this; sim.js takes the lower of the two.
export function waterCapAt(map, water, col, row, maxLevel) {
  const index = map.index(col, row);
  const state = waterAt(water, index);
  if (state === PRESSURE.DRY) return 1;
  // Foul water keeps a lot alive but nobody builds up over a main that runs like that (M-b).
  if (isFoulQuality(qualityAt(water, index))) return 1;
  if (state === PRESSURE.GOOD) return maxLevel;
  return Math.min(2, maxLevel);
}

// The component serving a tile (or the component a pipe belongs to), or null.
export function componentAt(water, index) {
  if (!water) return null;
  for (const c of water.components) {
    if (c.tiles.includes(index)) return c;
  }
  const id = water.owner.get(index);
  if (!id) return null;
  if (water.byId) return water.byId.get(id) || null;
  return water.components.find((c) => c.id === id) || null;
}

// The query's water readout for a tile: what runs beneath it, and what the network is doing.
// Plain English, period register, no em-dashes. Returns [] where there is nothing to say.
export function explainWater(sim, col, row) {
  const { map, water } = sim;
  const tile = map.tileAt(col, row);
  if (!tile || !water) return [];
  const index = map.index(col, row);
  const onNetwork = hasPipe(tile) || isWaterWorks(tile);
  const comp = componentAt(water, index);
  const lines = [];

  if (onNetwork && comp) {
    lines.push(`Main ${comp.id}. Pressure: ${PRESSURE_LABEL[comp.pressure]}.`);
    lines.push(`Draws ${comp.demand} of water from ${comp.capacity} on hand.`);
    if (comp.buffer > 0) lines.push(`A reservoir holds ${comp.buffer} more against a dry month.`);
    const named = sourceSummary(comp);
    lines.push(named ? `Fed by ${named}.` : 'No source feeds this main.');
    if (comp.unpoweredPumps > 0) {
      lines.push(comp.unpoweredPumps === 1
        ? 'The pump house stands idle for want of power.'
        : `${comp.unpoweredPumps} pump houses stand idle for want of power.`);
    }
    // Quality (M-b). A surveyed main is NAMED; an unsurveyed one is described by its symptoms only,
    // which is the spec's partial detection, and it never hides that something is wrong.
    lines.push(qualityLine(comp));
    if (comp.sabotaged > 0) {
      lines.push(comp.sabotaged === 1
        ? 'A works here is wrecked and runs at a fraction. The fitters are at it.'
        : `${comp.sabotaged} works are wrecked and run at a fraction.`);
    }
    if (comp.choked > 0) lines.push('The mains knock, and the pressure comes and goes.');
    if (isWaterWorks(tile)) {
      const intake = taintOf(tile);
      if (intake >= TAINT_AT.suspect) {
        lines.push(intake >= TAINT_AT.infested
          ? 'The intake is fouled through. Something lives in it.'
          : 'The intake tastes of salt and something older.');
      }
    }
    const recent = recentEventLine(sim, comp);
    if (recent) lines.push(recent);
    return lines;
  }

  // Not on the network: say what service, if any, reaches this ground.
  const state = waterAt(water, index);
  const quality = qualityAt(water, index);
  if (state === PRESSURE.GOOD) lines.push('Watered: yes. Pressure is good.');
  else if (state === PRESSURE.LOW) lines.push('Watered: yes, but the pressure is low.');
  else if (water.components.length > 0) lines.push('Watered: no. No main runs within reach.');
  if (state !== PRESSURE.DRY && quality !== QUALITY.CLEAN) {
    const comp2 = componentAt(water, index);
    lines.push(comp2 ? qualityLine(comp2) : 'The water that reaches here is not right.');
  }
  return lines;
}

// One line naming, or describing, a network's water. A surveyed main gets the plain word for it; an
// unsurveyed main gets the symptom and an invitation to build the thing that can name it.
function qualityLine(comp) {
  if (comp.quality === QUALITY.CLEAN) {
    return comp.surveyed ? 'Quality: Clean. The water is sweet.' : 'The water runs clear.';
  }
  if (comp.surveyed) return `Quality: ${QUALITY_LABEL[comp.quality]}.`;
  if (comp.quality === QUALITY.SUSPECT) return 'The water carries an odd taste. A test would say more.';
  if (comp.quality === QUALITY.TAINTED) {
    return 'The water runs green and sour. A filter house could tell you how bad.';
  }
  return 'Something is living in this main. It should have been tested long ago.';
}

// "Flushed two months ago." / "Backflow last month." Only the more recent of the two is worth a line.
function recentEventLine(sim, comp) {
  const tick = sim.tick || 0;
  const flush = comp.lastFlush || 0;
  const back = comp.lastBackflow || 0;
  if (flush <= 0 && back <= 0) return null;
  const useBack = back >= flush;
  const at = useBack ? back : flush;
  const months = Math.max(0, tick - at);
  const when = months <= 0 ? 'this month' : months === 1 ? 'last month' : `${months} months ago`;
  return useBack ? `Backflow ${when}.` : `Flushed ${when}.`;
}

// "a well house and two pump houses", or '' where a network has no source at all.
function sourceSummary(comp) {
  const parts = [];
  for (const kind of Object.keys(comp.sources)) {
    const info = STRUCTURE_INFO[kind];
    if (!info) continue;
    const n = comp.sources[kind];
    parts.push(n === 1 ? `a ${info.label.toLowerCase()}` : `${n} ${info.label.toLowerCase()}s`);
  }
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0];
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}
