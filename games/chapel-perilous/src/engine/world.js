// Overworld model: a coordinate grid of chunked tile maps streamed around the
// party (the Cyclopean format, clean-room). Chunks are generated deterministically
// from the master seed via fbm elevation; a chunk cache stands in for the
// reference's on-disk region_x_y files. Dungeon/city sites come from data and are
// always steppable (they overlay whatever terrain sits under them).
import { fbm } from './noise.js';
import { TILES, isTileId } from './tiles.js';

export function createWorld(config) {
  if (!config || typeof config !== 'object') {
    throw new Error('createWorld: config object required');
  }
  const seed = (config.seed >>> 0);
  const chunkSize = config.chunkSize | 0;
  if (chunkSize <= 0) throw new Error('createWorld: chunkSize must be > 0');
  const noiseParams = config.noise || {};
  const bands = config.bands || [];
  if (!bands.length) throw new Error('createWorld: bands required');
  const streamRadius = config.streamRadius ?? 1;

  const sites = new Map();
  for (const s of config.sites || []) sites.set(`${s.x},${s.y}`, s);

  // Terrain gates (M12 E1/E2): COORDINATE records that mirror sites. A gate tile is
  // impassable until OPENED — opening is a permanent WORLD fact (bridge built, ford
  // laid), toggled by spending a tagged work-item at the gate (never a carried key:
  // once opened, no item is ever consulted for passability again). The opened set is
  // world-persistent (survives permadeath; serialized with the save).
  const gatesByCoord = new Map();
  const gatesById = new Map();
  for (const g of config.gates || []) {
    if (g.x == null || g.y == null || !g.id) continue;
    const rec = { id: g.id, x: g.x | 0, y: g.y | 0, requiresTag: g.requiresTag || null, label: g.label || g.id };
    gatesByCoord.set(`${rec.x},${rec.y}`, rec);
    gatesById.set(rec.id, rec);
  }
  const openedGates = new Set();
  const gateAt = (gx, gy) => gatesByCoord.get(`${gx},${gy}`) || null;
  const isGateOpen = (id) => openedGates.has(id);
  function openGate(id) {
    if (!gatesById.has(id) || openedGates.has(id)) return false;
    openedGates.add(id);
    return true;
  }

  const chunkCache = new Map();

  function elevationToTileId(e) {
    for (const b of bands) if (e <= b.max) return b.tile;
    return bands[bands.length - 1].tile;
  }

  function generateChunk(cx, cy) {
    const size = chunkSize;
    const tiles = new Array(size * size);
    for (let ly = 0; ly < size; ly++) {
      for (let lx = 0; lx < size; lx++) {
        const gx = cx * size + lx;
        const gy = cy * size + ly;
        const e = fbm(gx, gy, seed, noiseParams);
        const id = elevationToTileId(e);
        if (!isTileId(id)) throw new Error(`world: band produced unknown tile '${id}'`);
        tiles[ly * size + lx] = id;
      }
    }
    return { cx, cy, size, tiles };
  }

  function chunkCoords(gx, gy) {
    return {
      cx: Math.floor(gx / chunkSize),
      cy: Math.floor(gy / chunkSize),
    };
  }

  function getChunk(cx, cy) {
    const key = `${cx},${cy}`;
    let c = chunkCache.get(key);
    if (!c) {
      c = generateChunk(cx, cy);
      chunkCache.set(key, c);
    }
    return c;
  }

  function tileIdAt(gx, gy) {
    const { cx, cy } = chunkCoords(gx, gy);
    const c = getChunk(cx, cy);
    const lx = gx - cx * chunkSize;
    const ly = gy - cy * chunkSize;
    return c.tiles[ly * chunkSize + lx];
  }

  function tileAt(gx, gy) {
    return TILES[tileIdAt(gx, gy)];
  }

  function siteAt(gx, gy) {
    return sites.get(`${gx},${gy}`) || null;
  }

  // Collision predicate. A gate is consulted BEFORE tile-type (E1): an unopened gate
  // blocks its tile, an opened one is passable. Sites (entrances) are always steppable;
  // otherwise defer to the underlying terrain tile's passability.
  function passable(gx, gy) {
    const g = gateAt(gx, gy);
    if (g) return openedGates.has(g.id);
    if (siteAt(gx, gy)) return true;
    return tileAt(gx, gy).passable;
  }

  // Stream the ring of chunks within `radius` chunks of a world coordinate.
  // Returns the active chunk set (also warms the cache), sliding as the party moves.
  function streamAround(gx, gy, radius = streamRadius) {
    const { cx, cy } = chunkCoords(gx, gy);
    const active = [];
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        active.push(getChunk(cx + dx, cy + dy));
      }
    }
    return active;
  }

  // Spiral out from (gx,gy) to the nearest passable, non-site open tile.
  // Used to place the party on solid ground regardless of what the seed drew.
  function nearestOpen(gx, gy, maxR = 64) {
    if (passable(gx, gy)) return { x: gx, y: gy };
    for (let r = 1; r <= maxR; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue; // ring only
          if (passable(gx + dx, gy + dy)) return { x: gx + dx, y: gy + dy };
        }
      }
    }
    return { x: gx, y: gy };
  }

  return {
    seed,
    chunkSize,
    streamRadius,
    chunkCoords,
    getChunk,
    tileIdAt,
    tileAt,
    siteAt,
    passable,
    streamAround,
    nearestOpen,
    listSites: () => [...sites.values()],
    // Gates (E1/E2) — coordinate lookups + the world-persistent opened state.
    gateAt,
    gateById: (id) => gatesById.get(id) || null,
    isGateOpen,
    openGate,
    listGates: () => [...gatesById.values()],
    openedGateIds: () => [...openedGates],
    serializeGates: () => [...openedGates],
    restoreGates: (ids) => { openedGates.clear(); for (const id of ids || []) if (gatesById.has(id)) openedGates.add(id); },
    get cachedChunkCount() {
      return chunkCache.size;
    },
  };
}
