// M9 BIOMES — guaranteed overworld areas (DIRECTIONS-2026-08-02-BIOMES).
//
// A small, hand-placed set of named regions that are present in EVERY run
// alongside the procedural terrain, each carrying its own identity across four
// channels (terrain dressing, monster/NPC mix, ambient events, register/vibe).
// The banked "fixed landmark locations" item folds in here: biomes are placed by
// ABSOLUTE world coordinate (the same model as data/world sites), so a given
// world always reads the same and a player can name a place ("the salt flats").
//
// A biome is a chebyshev SQUARE region: a cell (gx,gy) belongs to a biome when
// max(|gx-cx|,|gy-cy|) <= radius. Regions MUST NOT overlap — the constructor
// validates disjointness by construction (two square regions overlap iff both
// axis gaps are within the summed radii), so biomeAt() is unambiguous and needs
// no priority rule. Everything here is pure + deterministic in the world coords.

export function createBiomes(defs, opts = {}) {
  const list = (defs && defs.biomes) || (Array.isArray(defs) ? defs : []);
  if (!Array.isArray(list) || list.length === 0) throw new Error('createBiomes: no biomes');

  const biomes = list.map(normalizeBiome);

  const byId = new Map();
  for (const b of biomes) {
    if (byId.has(b.id)) throw new Error(`createBiomes: duplicate biome id '${b.id}'`);
    byId.set(b.id, b);
  }

  // Disjointness: no two square regions may share a cell.
  for (let i = 0; i < biomes.length; i++) {
    for (let j = i + 1; j < biomes.length; j++) {
      if (regionsOverlap(biomes[i], biomes[j])) {
        throw new Error(`createBiomes: biome '${biomes[i].id}' overlaps '${biomes[j].id}'`);
      }
    }
  }

  // Optional cross-validation against the rest of the stack. Only runs when the
  // caller injects the collaborators, so pure unit tests stay dependency-free.
  if (opts.bestiary) {
    for (const b of biomes) {
      for (const id of b.wanderers) {
        if (!opts.bestiary.has(id)) throw new Error(`createBiomes: biome '${b.id}' wanderer '${id}' not in bestiary`);
      }
    }
  }
  if (opts.tileArt) {
    for (const b of biomes) {
      for (const [base, art] of Object.entries(b.dress)) {
        if (!opts.tileArt.has(art)) throw new Error(`createBiomes: biome '${b.id}' dress '${base}'->'${art}' has no tile art`);
      }
    }
  }
  if (opts.encounters) {
    const known = new Set(opts.encounters.tables);
    for (const b of biomes) {
      if (!known.has(b.table)) throw new Error(`createBiomes: biome '${b.id}' table '${b.table}' unknown`);
    }
  }

  // The biome containing (gx,gy), or null for the open (procedural) country.
  function biomeAt(gx, gy) {
    for (const b of biomes) {
      if (Math.max(Math.abs(gx - b.center.x), Math.abs(gy - b.center.y)) <= b.radius) return b;
    }
    return null;
  }

  // The art id a tile of `tileId` should draw as inside biome `b` (its dressing),
  // falling back to the plain terrain art when the biome does not re-dress it.
  function dressFor(b, tileId, fallback) {
    if (b && b.dress[tileId]) return b.dress[tileId];
    return fallback;
  }

  return {
    biomeAt,
    dressFor,
    get: (id) => byId.get(id) || null,
    has: (id) => byId.has(id),
    list: () => biomes.map((b) => ({ ...b })),
    ids: () => biomes.map((b) => b.id),
    get count() { return biomes.length; },
  };
}

function normalizeBiome(raw) {
  if (!raw || typeof raw !== 'object') throw new Error('createBiomes: biome must be an object');
  if (!raw.id) throw new Error('createBiomes: biome missing id');
  const c = raw.center || {};
  if (!Number.isInteger(c.x) || !Number.isInteger(c.y)) {
    throw new Error(`createBiomes: biome '${raw.id}' needs integer center {x,y}`);
  }
  const radius = raw.radius | 0;
  if (!(radius >= 0)) throw new Error(`createBiomes: biome '${raw.id}' needs radius >= 0`);
  const weirdness = raw.weirdness ?? 0.5;
  if (!(weirdness >= 0 && weirdness <= 1)) throw new Error(`createBiomes: biome '${raw.id}' weirdness out of [0,1]`);
  return {
    id: raw.id,
    name: raw.name || raw.id,
    blurb: raw.blurb || '',
    center: { x: c.x, y: c.y },
    radius,
    weirdness,
    register: raw.register || null,
    wanderers: Array.isArray(raw.wanderers) ? raw.wanderers.slice() : [],
    table: raw.table || 'overworld',
    dress: raw.dress && typeof raw.dress === 'object' ? { ...raw.dress } : {},
  };
}

// Two chebyshev square regions overlap iff their centers are within the summed
// radii on BOTH axes (a shared cell exists). Used to enforce disjoint biomes.
function regionsOverlap(a, b) {
  const r = a.radius + b.radius;
  return Math.abs(a.center.x - b.center.x) <= r && Math.abs(a.center.y - b.center.y) <= r;
}
