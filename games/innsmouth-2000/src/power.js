// Power grid for INNSMOUTH 2000 (M5).
//
// A pure, deterministic flood-fill over the map: no canvas, no DOM, so node --test covers every
// rule. Generation comes from placed structures (gasworks, whale-oil works); it travels through a
// conductive network of power lines, generators, and built lots (adjacent buildings pass power,
// the reference's convention). A connected network is powered only when its total generation
// capacity can bear its total demand; short of that the whole network browns out. Built lots draw
// power by their development tier; the empty land a zone sits on draws none until it builds.
//
// A zoned lot can DEVELOP past its first tier only where power reaches it: on an energized tile or
// beside one (so a generator or a live line radiates buildable power to the lots at its edge, and
// a lit lot then carries power on to its neighbours). sim.js reads energizedNear() for that gate.

import { STRUCTURE_INFO, hasNetwork } from './tools.js';

export const POWER_PER_TIER = 2; // a built lot's power demand per development tier

// The 4 grid neighbours (matches tools.DIR, kept local so power.js has no cyclic import).
const NB = [[1, 0], [-1, 0], [0, 1], [0, -1]];

// Is this tile a conductor (it passes power along the network)? Power lines, generators, and any
// built lot conduct; placed service structures conduct too (they are buildings on the grid).
function isConductor(tile) {
  if (!tile) return false;
  if (hasNetwork(tile, 'powerline')) return true;
  if (tile.structure) return true;
  if (tile.building) return true;
  return false;
}

// The generation capacity a tile supplies (only power-source structures do).
function capacityOf(tile) {
  if (tile && tile.structure) {
    const info = STRUCTURE_INFO[tile.structure.kind];
    if (info && info.capacity > 0) return info.capacity;
  }
  return 0;
}

// The power a tile demands (only built lots do, by tier).
function demandOf(tile) {
  if (tile && tile.building) return (tile.building.level || 1) * POWER_PER_TIER;
  return 0;
}

// Compute the power state of the whole map. Returns:
//   energized: Set<index> of conductor tiles that belong to a satisfied network
//   components: [{ tiles:[idx], capacity, demand, satisfied }]
//   totals: { capacity, demand, powered, unpowered } across all networks
// Deterministic: the flood order follows tile index, so results are stable per map.
export function computePower(map) {
  const seen = new Uint8Array(map.cols * map.rows);
  const energized = new Set();
  const components = [];
  let totCap = 0;
  let totDem = 0;
  let poweredNets = 0;
  let unpoweredNets = 0;

  for (let row = 0; row < map.rows; row++) {
    for (let col = 0; col < map.cols; col++) {
      const start = map.index(col, row);
      if (seen[start]) continue;
      const tile = map.tiles[start];
      if (!isConductor(tile)) { seen[start] = 1; continue; }

      // Flood this connected conductor network.
      const tiles = [];
      let capacity = 0;
      let demand = 0;
      const stack = [[col, row]];
      seen[start] = 1;
      while (stack.length) {
        const [c, r] = stack.pop();
        const i = map.index(c, r);
        const t = map.tiles[i];
        tiles.push(i);
        capacity += capacityOf(t);
        demand += demandOf(t);
        for (const [dc, dr] of NB) {
          const nc = c + dc;
          const nr = r + dr;
          if (!map.inBounds(nc, nr)) continue;
          const ni = map.index(nc, nr);
          if (seen[ni]) continue;
          if (!isConductor(map.tiles[ni])) continue;
          seen[ni] = 1;
          stack.push([nc, nr]);
        }
      }

      const satisfied = capacity >= demand && capacity > 0;
      if (satisfied) { for (const i of tiles) energized.add(i); poweredNets++; }
      else unpoweredNets++;
      totCap += capacity;
      totDem += demand;
      components.push({ tiles, capacity, demand, satisfied });
    }
  }

  return {
    energized,
    components,
    totals: { capacity: totCap, demand: totDem, powered: poweredNets, unpowered: unpoweredNets },
  };
}

// Is (col,row) energized, or beside an energized conductor? This is the growth gate: an empty
// zoned lot draws no power itself, but develops where a live line, generator, or lit neighbour
// touches it.
export function energizedNear(map, power, col, row) {
  const here = map.index(col, row);
  if (power.energized.has(here)) return true;
  for (const [dc, dr] of NB) {
    const nc = col + dc;
    const nr = row + dr;
    if (!map.inBounds(nc, nr)) continue;
    if (power.energized.has(map.index(nc, nr))) return true;
  }
  return false;
}
