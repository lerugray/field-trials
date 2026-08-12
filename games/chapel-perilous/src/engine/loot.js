// M10 Part B — loot. The genre table-stakes Ray flagged first ("not sure if there's
// any loot if you kill something"). A slain foe MOSTLY drops nothing (mundane —
// faithful to the ENCOUNTERS LOCK: the roll reads only (foe, seed), never a party
// level or a miss-counter, so there is no scaling and no pity); occasionally it
// leaves a salvaged weapon or a small trinket. Caches yield their named artifact as
// a relic. Pure + deterministic; items carry no uid (the session assigns one).
import { mulberry32 } from './prng.js';
import { normalizeItem } from './items.js';

const KILL_DROP_CHANCE = 0.30;    // most kills are mundane
const SALVAGE_SHARE = 0.6;        // of weapon-bearing drops, salvage vs consumable/trinket
const CONSUMABLE_SHARE = 0.25;    // of non-salvage drops, a consumable rather than a trinket

export function createLoot(data = {}) {
  const trinkets = (data && data.trinkets) || [];
  const traversal = (data && data.traversal) || {};

  // E3 — a traversal WORK-ITEM for a biome that seeds one (biomes adjacent to a gate).
  // Deterministic in (biome, seed); returns a consumable, tag-carrying work-item (never
  // equipment) or null. The tag matches the gate's requiresTag so spending it opens it.
  function rollTraversal(biomeId, seed) {
    const spec = biomeId ? traversal[biomeId] : null;
    if (!spec) return null;
    const rng = mulberry32((seed >>> 0) || 1);
    if (rng() >= (spec.chance ?? 0)) return null;
    return normalizeItem({ kind: 'work', name: spec.name || '[SEED] a means to cross', tags: [spec.tag] });
  }

  // Roll loot for one felled foe. `foe` is a combatant/being with {name, weapon}.
  // Returns an item or null. Deterministic in `seed` plus the current Operation's
  // fixed loot profile; it never reads level, stats, or a miss counter.
  function rollKill(foe, seed, { dropChance = KILL_DROP_CHANCE } = {}) {
    const rng = mulberry32((seed >>> 0) || 1);
    const chance = Math.max(0, Math.min(1, Number(dropChance) || 0));
    if (rng() >= chance) return null;
    if (foe && foe.weapon && Array.isArray(foe.weapon.dmg) && rng() < SALVAGE_SHARE) {
      return normalizeItem({
        kind: 'weapon',
        name: `[SEED] salvaged ${cleanName(foe.weapon.name || 'weapon')}`,
        weapon: { name: foe.weapon.name || '[SEED] salvage', dmg: foe.weapon.dmg.slice() },
      });
    }
    const cons = (data.consumables || []);
    if (cons.length && rng() < CONSUMABLE_SHARE) {
      const spec = cons[Math.floor(rng() * cons.length)];
      return normalizeItem({ ...spec, kind: 'consumable' });
    }
    const t = trinkets.length ? trinkets[Math.floor(rng() * trinkets.length)] : '[SEED] a curious oddment';
    return normalizeItem({ kind: 'trinket', name: t });
  }

  // A cache's payoff as a relic item (the named unique from the encounter tables).
  function fromCache(artifactId, description) {
    return normalizeItem({ kind: 'relic', name: description || artifactId || '[SEED] a relic', artifact: artifactId || null });
  }

  return { rollKill, rollTraversal, fromCache };
}

// Strip a leading marker so "salvaged X" doesn't double the [SEED] tag mid-string
// (the whole item name is re-marked and then stripped at draw anyway).
function cleanName(s) {
  return String(s).replace(/^\[SEED\]\s*/i, '');
}
