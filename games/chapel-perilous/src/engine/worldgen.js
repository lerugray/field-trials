// Per-world seeding + procedural site placement (chp-worldgen lane).
// All procedural placement flows through the seeded RNG; no Math.random.
// The constants below are the operator-tunable dials — tweak counts/spacing without
// touching the algorithm.

import { mulberry32, hashInt } from './prng.js';

/** Tunable dials: counts by site kind. */
export const DUNGEON_SITE_COUNT = 5;
export const CITY_SITE_COUNT = 3;

/** Tunable dials: spacing and margin constraints. */
export const MIN_SITE_SPACING = 4;     // Chebyshev distance between any two sites
export const MIN_START_DISTANCE = 4;   // Chebyshev distance from the party start
export const EDGE_MARGIN = 2;          // padding added around the biome-derived bounds
export const MAX_PLACEMENT_ATTEMPTS = 200;

/**
 * Generate a fresh random uint32 seed.
 * Uses the browser/WebCrypto `crypto.getRandomValues` when available (Node 18+
 * provides this on `globalThis.crypto`). Callers that need a synchronous seed in
 * a headless/no-crypto environment should pass one explicitly.
 */
export function generateSeed() {
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    return crypto.getRandomValues(new Uint32Array(1))[0] >>> 0;
  }
  throw new Error('generateSeed: no synchronous entropy available (pass a seed explicitly)');
}

/** Chebyshev distance — the square-region metric the rest of the engine uses. */
function cheby(ax, ay, bx, by) {
  return Math.max(Math.abs(ax - bx), Math.abs(ay - by));
}

/**
 * Derive a placement bounding box from absolute biome regions.
 * The box covers every biome (center +/- radius) plus the edge margin, so
 * procedural sites live in the same coordinate neighborhood as the hand-tuned
 * biomes rather than floating in an arbitrary void.
 */
export function deriveBoundsFromBiomes(biomes, edgeMargin = EDGE_MARGIN) {
  const list = (biomes && biomes.biomes) || (Array.isArray(biomes) ? biomes : []);
  if (!list.length) throw new Error('deriveBoundsFromBiomes: no biome definitions');
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const b of list) {
    const r = (b.radius | 0) + edgeMargin;
    minX = Math.min(minX, b.center.x - r);
    minY = Math.min(minY, b.center.y - r);
    maxX = Math.max(maxX, b.center.x + r);
    maxY = Math.max(maxY, b.center.y + r);
  }
  if (!(minX <= maxX && minY <= maxY)) throw new Error('deriveBoundsFromBiomes: empty bounds');
  return { minX, minY, maxX, maxY };
}

/**
 * Place sites deterministically for a world.
 * @param {number} seed — world seed
 * @param {{x:number,y:number}} start — party start coordinate
 * @param {object} biomes — biome definitions ({ biomes: [...] }) or array
 * @param {object} opts — overrides for DUNGEON_SITE_COUNT, CITY_SITE_COUNT, etc.
 * @param {function} namer — optional (rng) => name string; used to name sites
 * @returns {{id:string, x:number, y:number, kind:string, name:string}[]}
 */
export function placeSites(seed, start, biomes, opts = {}, namer = null) {
  const dungeonCount = opts.dungeonCount ?? DUNGEON_SITE_COUNT;
  const cityCount = opts.cityCount ?? CITY_SITE_COUNT;
  const minSpacing = opts.minSpacing ?? MIN_SITE_SPACING;
  const minStartDistance = opts.minStartDistance ?? MIN_START_DISTANCE;
  const edgeMargin = opts.edgeMargin ?? EDGE_MARGIN;
  const maxAttempts = opts.maxAttempts ?? MAX_PLACEMENT_ATTEMPTS;

  const bounds = deriveBoundsFromBiomes(biomes, edgeMargin);
  const rng = mulberry32((seed ^ 0x5154e) >>> 0);
  const nameRng = mulberry32((seed ^ 0x8e9a) >>> 0);

  const sites = [];
  let idCounter = 0;

  function withinBounds(p) {
    return p.x >= bounds.minX && p.x <= bounds.maxX && p.y >= bounds.minY && p.y <= bounds.maxY;
  }

  function farEnough(p) {
    if (cheby(p.x, p.y, start.x, start.y) < minStartDistance) return false;
    for (const s of sites) {
      if (cheby(p.x, p.y, s.x, s.y) < minSpacing) return false;
    }
    return true;
  }

  function candidate() {
    const w = bounds.maxX - bounds.minX + 1;
    const h = bounds.maxY - bounds.minY + 1;
    return {
      x: bounds.minX + Math.floor(rng() * w),
      y: bounds.minY + Math.floor(rng() * h),
    };
  }

  function tryPlace() {
    for (let i = 0; i < maxAttempts; i++) {
      const p = candidate();
      if (withinBounds(p) && farEnough(p)) return p;
    }
    return null;
  }

  function siteName(kind) {
    if (!namer) return `[SEED] ${kind} ${idCounter}`;
    const base = namer(nameRng);
    return formatSiteName(kind, base, opts.templates);
  }

  for (let i = 0; i < dungeonCount; i++) {
    const p = tryPlace();
    if (!p) throw new Error(`placeSites: could not place dungeon ${i} within bounds`);
    sites.push({ id: `dungeon-${idCounter++}`, x: p.x, y: p.y, kind: 'dungeon', name: siteName('dungeon') });
  }
  for (let i = 0; i < cityCount; i++) {
    const p = tryPlace();
    if (!p) throw new Error(`placeSites: could not place city ${i} within bounds`);
    sites.push({ id: `city-${idCounter++}`, x: p.x, y: p.y, kind: 'city', name: siteName('city') });
  }

  return sites;
}

/**
 * Format a site name from a register template + a generated root.
 * Templates live in data/register/sites.json and are [SEED]-marked.
 */
export function formatSiteName(kind, root, templates = null) {
  if (!templates || !templates[kind] || !templates[kind].length) {
    return `[SEED] the ${root}`;
  }
  const idx = hashInt(root.length, kind.length, 0x9a7e) % templates[kind].length;
  const tpl = templates[kind][idx];
  return tpl.replace(/%s/g, root);
}

/**
 * Build a fresh world config for a new game.
 * Keeps the base world's terrain/biome/bands/chunkSize but swaps in a fresh seed
 * and procedurally placed sites. The old hardcoded master seed is NOT used on the
 * live New Game path — master.json remains a deterministic test fixture only.
 */
export function generateWorldConfig(baseConfig, opts = {}) {
  if (!baseConfig || typeof baseConfig !== 'object') {
    throw new Error('generateWorldConfig: base config required');
  }
  const seed = opts.seed ?? generateSeed();
  const biomes = opts.biomes ?? baseConfig.biomes;
  if (!biomes) throw new Error('generateWorldConfig: biome definitions required');
  const config = {
    ...baseConfig,
    seed,
    sites: opts.sites ?? placeSites(seed, baseConfig.start, biomes, opts, opts.namer),
  };
  return config;
}
