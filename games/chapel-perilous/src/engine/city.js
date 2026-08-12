// City mode (M3 CITY): a denser 2D area than the overworld, entered from a city
// site. A seeded grid of building blocks separated by street lanes; each
// building is a solid footprint you walk around and enter through one door.
// Doors expose the live service interactions (shop/inn/rumor/lodge). One gate
// on the border returns to the overworld.
//
// Deterministic like everything else: identical seed => identical city. No
// interior crawl in increment 1 — stepping onto a door opens the service; the
// social-dungeon identity layer (lodges/cells, membership verbs) is M3+ content.
import { hashInt } from './prng.js';

export const SERVICES = ['shop', 'inn', 'rumor', 'lodge', 'shrine', 'bureau'];

// F3 town render differentiation. A per-service door glyph (drawn on the door tile and
// as the interior header silhouette) so a door reads as its trade at a glance, and a
// per-archetype texture offset that varies the wall/street DITHER pattern (grayscale —
// never a hue) so two archetypes read as different PLACES. Both are pure lookups.
export const SERVICE_GLYPH = { shop: '⁂', inn: '☖', rumor: '‽', lodge: '◇', shrine: '✝', bureau: '▤' };
export function serviceGlyph(service) { return SERVICE_GLYPH[service] || '·'; }
const ARCHETYPE_TEXTURE = { port: 0x11, bureau: 0x22, pilgrimage: 0x33, market: 0x44, garrison: 0x55 };
// A dither seed offset per archetype — distinct so each town textures differently.
export function archetypeTexture(archetype) { return (ARCHETYPE_TEXTURE[archetype] || 0x07) * 0x9e3779b1 >>> 0; }
const DIRS = { N: { dx: 0, dy: -1 }, E: { dx: 1, dy: 0 }, S: { dx: 0, dy: 1 }, W: { dx: -1, dy: 0 } };

// Town archetypes (M8 town variety). Each biases which services fill its doors,
// so two towns read as different PLACES, not the same 3x3 grid. Weights are over
// SERVICES; the specialty is over-represented, so a pilgrimage town is mostly
// shrines/lodges while a market town is mostly shops/rumor.
export const ARCHETYPES = ['port', 'bureau', 'pilgrimage', 'market', 'garrison'];
const ARCHETYPE_WEIGHTS = {
  port: { shop: 3, inn: 3, rumor: 3, lodge: 1, shrine: 1, bureau: 1 },
  bureau: { shop: 1, inn: 1, rumor: 2, lodge: 2, shrine: 1, bureau: 5 },
  pilgrimage: { shop: 1, inn: 2, rumor: 1, lodge: 3, shrine: 5, bureau: 1 },
  market: { shop: 5, inn: 2, rumor: 3, lodge: 1, shrine: 1, bureau: 1 },
  garrison: { shop: 2, inn: 2, rumor: 2, lodge: 3, shrine: 1, bureau: 3 },
};

// Guarantee heal access (A3). 'one' = at least one of inn/shrine present (adds an inn
// if neither is — never inflates shrine share, keeping the archetype bias intact);
// 'both' = one inn AND one shrine present. Deterministic: converts the buildings with
// the lowest seeded key among those not already a heal door. Mutates buildings.
export function ensureHealServices(buildings, seed, guarantee = 'one') {
  const has = (svc) => buildings.some((b) => b.service === svc);
  const need = [];
  if (guarantee === 'both') {
    if (!has('inn')) need.push('inn');
    if (!has('shrine')) need.push('shrine');
  } else if (!has('inn') && !has('shrine')) {
    need.push('inn');
  }
  if (!need.length) return buildings;
  // Convert non-heal buildings first (lowest seeded key → stable), falling back to any.
  const pool = buildings
    .filter((b) => b.service !== 'inn' && b.service !== 'shrine')
    .sort((a, b) => hashInt(a.index, 0x9a, seed) - hashInt(b.index, 0x9a, seed));
  for (const svc of need) {
    const target = pool.shift() || buildings.find((b) => b.service !== svc && !need.includes(b.service));
    if (target) target.service = svc;
  }
  return buildings;
}

function pickService(weights, key) {
  const total = SERVICES.reduce((s, v) => s + (weights[v] || 1), 0);
  let r = (key % 1000) / 1000 * total;
  for (const v of SERVICES) { r -= (weights[v] || 1); if (r < 0) return v; }
  return SERVICES[SERVICES.length - 1];
}

// assembleCity(opts): build a city from a seed.
//   seed        integer
//   cols/rows   plot grid (default 3x3) — each plot is one building
//   plot        building footprint edge in tiles (default 4)
// Streets are 1-tile lanes between and around the plots; the border is wall with
// a single gate. Returns tiles (0 street / 1 wall), the building list, the gate,
// and lookups. A door tile is passable and carries its building.
export function assembleCity(opts = {}) {
  const seed = (opts.seed ?? 0) >>> 0;
  // Town variety (M8): size varies with the seed (2..4 per axis) so two towns
  // don't share a footprint, and an archetype biases the service mix.
  const cols = Math.max(1, (opts.cols ?? (2 + (hashInt(0x1, 0x2, seed ^ 0x51ce) % 3))) | 0);
  const rows = Math.max(1, (opts.rows ?? (2 + (hashInt(0x3, 0x4, seed ^ 0x51ce) % 3))) | 0);
  const plot = Math.max(2, (opts.plot ?? 4) | 0);
  const lane = 1;
  const archetype = opts.archetype || ARCHETYPES[hashInt(cols, rows, seed ^ 0x70) % ARCHETYPES.length];
  const weights = ARCHETYPE_WEIGHTS[archetype] || {};

  const width = cols * (plot + lane) + lane;   // border lane + per-plot(plot+lane)
  const height = rows * (plot + lane) + lane;
  const STREET = 0, WALL = 1;
  const tiles = new Array(width * height).fill(STREET);
  const idx = (x, y) => y * width + x;
  const inBounds = (x, y) => x >= 0 && y >= 0 && x < width && y < height;

  // Border wall.
  for (let x = 0; x < width; x++) { tiles[idx(x, 0)] = WALL; tiles[idx(x, height - 1)] = WALL; }
  for (let y = 0; y < height; y++) { tiles[idx(0, y)] = WALL; tiles[idx(width - 1, y)] = WALL; }

  const buildings = [];
  const doorAt = new Map(); // "x,y" -> building

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x0 = c * (plot + lane) + lane;
      const y0 = r * (plot + lane) + lane;
      // Solid footprint.
      for (let yy = 0; yy < plot; yy++) for (let xx = 0; xx < plot; xx++) tiles[idx(x0 + xx, y0 + yy)] = WALL;
      // Door on a seeded side, at the middle of that side, adjacent to an
      // INTERIOR lane. Sides that face the border are excluded so every door
      // opens onto walkable street (edge plots always keep >=1 interior side).
      const bIndex = r * cols + c;
      const valid = [];
      if (r > 0) valid.push('N');
      if (c < cols - 1) valid.push('E');
      if (r < rows - 1) valid.push('S');
      if (c > 0) valid.push('W');
      if (valid.length === 0) valid.push('S'); // degenerate 1x1 city
      const side = valid[hashInt(c, r, seed ^ 0xd001) % valid.length];
      const mid = Math.floor(plot / 2);
      let dx, dy;
      if (side === 'N') { dx = x0 + mid; dy = y0; }
      else if (side === 'S') { dx = x0 + mid; dy = y0 + plot - 1; }
      else if (side === 'W') { dx = x0; dy = y0 + mid; }
      else { dx = x0 + plot - 1; dy = y0 + mid; }
      tiles[idx(dx, dy)] = STREET; // door: passable
      const service = pickService(weights, hashInt(c, r, seed ^ 0x5e12) % 1000);
      const b = { id: `b${bIndex}`, index: bIndex, x0, y0, plot, door: { x: dx, y: dy }, side, service };
      buildings.push(b);
      doorAt.set(`${dx},${dy}`, b);
    }
  }

  // A3 heal-availability guarantee. Every town guarantees at least one of inn/shrine
  // (a real heal source); the STARTING region's town guarantees BOTH (forgiving
  // opening) — opts.guarantee === 'both'. If the seeded service mix already satisfies
  // it, nothing changes; otherwise deterministically retarget the fewest buildings.
  ensureHealServices(buildings, seed, opts.guarantee === 'both' ? 'both' : 'one');

  // Gate: knock one border tile open on a seeded side, aligned to the first
  // interior street lane so it always opens onto walkable ground.
  const gate = pickGate(seed, width, height, plot + lane);
  tiles[idx(gate.x, gate.y)] = STREET;

  const tileAt = (x, y) => (inBounds(x, y) ? tiles[idx(x, y)] : WALL);
  const passable = (x, y) => tileAt(x, y) === STREET;
  const buildingAt = (x, y) => doorAt.get(`${x},${y}`) || null;

  // A guaranteed-walkable spawn: the lane tile just inside the gate.
  const spawn = innerOf(gate, width, height);

  return {
    seed, width, height, cols, rows, plot, archetype,
    tiles, buildings, gate, spawn,
    tileAt, passable, buildingAt, inBounds,
    get buildingCount() { return buildings.length; },
  };
}

// createStroll(city): top-down cardinal movement through the city. Stepping onto
// a door reports the building (open its service); onto the gate, exits.
export function createStroll(city, start = city.spawn) {
  let x = start.x | 0;
  let y = start.y | 0;

  function move(dir) {
    const d = DIRS[dir];
    if (!d) throw new Error(`stroll.move: unknown dir '${dir}'`);
    const nx = x + d.dx, ny = y + d.dy;
    if (nx === city.gate.x && ny === city.gate.y) { x = nx; y = ny; return { moved: true, exited: true, x, y }; }
    if (!city.passable(nx, ny)) return { moved: false, x, y, blocked: { x: nx, y: ny } };
    x = nx; y = ny;
    return { moved: true, exited: false, x, y, building: city.buildingAt(x, y) };
  }

  return {
    get x() { return x; },
    get y() { return y; },
    get pos() { return { x, y }; },
    move,
    buildingHere: () => city.buildingAt(x, y),
  };
}

function pickGate(seed, width, height, laneStride) {
  // Interior street lanes sit at multiples of (plot+lane); the first interior
  // lane is at laneStride. Aligning the gate to it guarantees it opens onto a
  // walkable street column/row (never against a building footprint or a corner).
  const side = ['N', 'E', 'S', 'W'][hashInt(width, height, seed ^ 0x9a1e) % 4];
  const lane = laneStride;
  if (side === 'N') return { x: lane, y: 0 };
  if (side === 'S') return { x: lane, y: height - 1 };
  if (side === 'W') return { x: 0, y: lane };
  return { x: width - 1, y: lane };
}

function innerOf(gate, width, height) {
  if (gate.y === 0) return { x: gate.x, y: 1 };
  if (gate.y === height - 1) return { x: gate.x, y: height - 2 };
  if (gate.x === 0) return { x: 1, y: gate.y };
  return { x: width - 2, y: gate.y };
}
