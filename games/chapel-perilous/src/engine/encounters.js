// Encounters, placed by data (M2 FIGHT). Enforces the ENCOUNTERS LOCK: rare +
// genuinely unfair, mostly-mundane tables with fat tails, NO level-scaling and
// NO pity gates.
//
// The lock is enforced BY CONSTRUCTION, not by convention: the roller never
// sees party level, stats, or a miss/streak counter, so odds cannot scale with
// power and cannot be nudged by pity. The one live modifier is pattern exposure:
// an explicit run clock whose conservative tiers raise FIGHT entry weight while
// leaving the authored fat-tail entries and trigger chances intact.
import { mulberry32 } from './prng.js';

export const EXPOSURE_TIERS = Object.freeze([
  Object.freeze({ min: 0, fightWeight: 1 }),
  Object.freeze({ min: 0.25, fightWeight: 1.12 }),
  Object.freeze({ min: 0.5, fightWeight: 1.25 }),
  Object.freeze({ min: 0.75, fightWeight: 1.4 }),
]);

export function exposureTier(value = 0) {
  const exposure = Math.max(0, Math.min(1, Number(value) || 0));
  let tier = 0;
  for (let i = 1; i < EXPOSURE_TIERS.length; i++) {
    if (exposure >= EXPOSURE_TIERS[i].min) tier = i;
  }
  return tier;
}

export function createEncounters(tablesData, bestiary) {
  const tables = (tablesData && tablesData.tables) || {};
  const artifacts = (tablesData && tablesData.artifacts) || {};
  const names = Object.keys(tables);
  if (names.length === 0) throw new Error('createEncounters: no tables');

  for (const name of names) validateTable(name, tables[name], bestiary, artifacts);

  // Roll ONCE on a table: weighted pick over its entries, then materialize.
  // Deterministic in the passed rng. Returns a resolved encounter descriptor.
  function roll(tableName, rng, opts = {}) {
    const t = table(tableName);
    const entry = weightedPick(weightedEntries(t.entries, opts.exposure), rng);
    return materialize(entry, rng);
  }

  // Per-step gate + roll: first the rare trigger, then the table. Returns null
  // when nothing happens (the common case) or the 'none' entry is drawn.
  function maybe(tableName, rng, opts = {}) {
    const t = table(tableName);
    if (rng() >= t.triggerChance) return null;
    const enc = roll(tableName, rng, opts);
    return enc.kind === 'none' ? null : enc;
  }

  // Convenience for deterministic placement: derive the rng from a seed so the
  // same (table, seed) always yields the same encounter — used to key an
  // encounter to a dungeon cell/step from the world seed.
  function rollSeeded(tableName, seed, opts = {}) {
    return roll(tableName, mulberry32(seed >>> 0), opts);
  }
  function maybeSeeded(tableName, seed, opts = {}) {
    return maybe(tableName, mulberry32(seed >>> 0), opts);
  }

  function materialize(entry, rng) {
    if (entry.kind === 'none') return { kind: 'none' };
    if (entry.kind === 'cache') {
      return { kind: 'cache', artifact: entry.artifact, description: artifacts[entry.artifact] || null };
    }
    // fight: expand each { being, count:[min,max] } group into combatant specs.
    const foes = [];
    for (const group of entry.foes) {
      const [lo, hi] = group.count || [1, 1];
      const n = lo + Math.floor(rng() * (hi - lo + 1));
      for (let i = 0; i < n; i++) foes.push(bestiary.toCombatantSpec(group.being, i + 1));
    }
    return { kind: 'fight', unfair: !!entry.unfair, foes };
  }

  function table(name) {
    const t = tables[name];
    if (!t) throw new Error(`encounters: unknown table '${name}'`);
    return t;
  }

  return {
    roll,
    maybe,
    rollSeeded,
    maybeSeeded,
    tables: names,
    triggerChance: (name) => table(name).triggerChance,
    totalWeight: (name) => table(name).entries.reduce((s, e) => s + e.weight, 0),
    entryWeights: (name, exposure = 0) => weightedEntries(table(name).entries, exposure)
      .map((e) => ({ kind: e.kind, unfair: !!e.unfair, weight: e.weight })),
    lootChance: (name) => table(name).lootChance ?? 0.30,
  };
}

function weightedEntries(entries, exposure) {
  const mult = EXPOSURE_TIERS[exposureTier(exposure)].fightWeight;
  if (mult === 1) return entries;
  return entries.map((entry) => entry.kind === 'fight'
    ? { ...entry, weight: entry.weight * mult }
    : entry);
}

// Weighted pick over entries with positive integer weights. rng in [0,1).
function weightedPick(entries, rng) {
  const total = entries.reduce((s, e) => s + e.weight, 0);
  let r = rng() * total;
  for (const e of entries) {
    r -= e.weight;
    if (r < 0) return e;
  }
  return entries[entries.length - 1];
}

function validateTable(name, t, bestiary, artifacts) {
  if (!t || !Array.isArray(t.entries) || t.entries.length === 0) {
    throw new Error(`encounters: table '${name}' has no entries`);
  }
  if (!(t.triggerChance >= 0 && t.triggerChance <= 1)) {
    throw new Error(`encounters: table '${name}' triggerChance out of [0,1]`);
  }
  if (t.lootChance != null && !(t.lootChance >= 0 && t.lootChance <= 1)) {
    throw new Error(`encounters: table '${name}' lootChance out of [0,1]`);
  }
  for (const e of t.entries) {
    if (!(e.weight > 0)) throw new Error(`encounters: table '${name}' entry needs weight > 0`);
    if (!['none', 'fight', 'cache'].includes(e.kind)) {
      throw new Error(`encounters: table '${name}' bad entry kind '${e.kind}'`);
    }
    if (e.kind === 'fight') {
      if (!Array.isArray(e.foes) || e.foes.length === 0) throw new Error(`encounters: '${name}' fight entry has no foes`);
      for (const g of e.foes) {
        if (!bestiary.has(g.being)) throw new Error(`encounters: '${name}' references unknown being '${g.being}'`);
        const c = g.count || [1, 1];
        if (!(c[0] >= 1 && c[1] >= c[0])) throw new Error(`encounters: '${name}' bad count for '${g.being}'`);
      }
    }
    if (e.kind === 'cache' && !(e.artifact in artifacts)) {
      throw new Error(`encounters: '${name}' cache references unknown artifact '${e.artifact}'`);
    }
  }
}
