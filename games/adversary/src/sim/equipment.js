// equipment.js — weapons, armor, the equip loadout, and the damage formula (DESIGN-SEED M2: melee
// with equip system — auto-equip, bare-hands state; equip-comparison UI). All names here are
// NEUTRAL DESCRIPTIVE PLACEHOLDERS tracked in docs/NAMES-PENDING.md; the builder invents no flavor.
//
// The damage formula is the labeled RE-DERIVATION from docs/STUDY.md §3 — the source never revealed
// a player→enemy formula. Shape honored: floor-clamped like the source's unsigned HP counter;
// contact damage stays flat-per-enemy (§5.3) and lives on enemies, not here.

// Weapon kinds. 'melee' hits within reach; 'ranged' spawns a projectile (wired in M5).
export const WEAPON_KIND = Object.freeze({ MELEE: 'melee', RANGED: 'ranged' });

// Rarity ladder scaffold (DESIGN-SEED spine addition 1). Uniques (rule-benders) land in M7.
export const RARITY = Object.freeze({ COMMON: 'common', UNCOMMON: 'uncommon', UNIQUE: 'unique' });

/**
 * Bare hands — the unmistakable unarmed state (DESIGN-SEED "Equip trap fixed"). A legal
 * challenge-run state, never a silent default: feeble damage, tiny reach, its own empty-hand id so
 * the renderer can show an empty hand and play a feeble thud.
 */
export const BARE_HANDS = Object.freeze({
  id: 'bare-hands',
  name: 'bare hands',           // placeholder descriptor
  kind: WEAPON_KIND.MELEE,
  rarity: RARITY.COMMON,
  damage: 1,                    // feeble
  reach: 8,                     // px — barely past the body
  cooldownTicks: 18,            // slow, unsatisfying on purpose
  bare: true,
});

// Starter weapon table — commons/uncommons filling an arc/speed/range variety table
// (DESIGN-SEED spine addition 1). Descriptive placeholder names only.
export const WEAPONS = Object.freeze({
  'short-blade': Object.freeze({
    id: 'short-blade', name: 'short blade', kind: WEAPON_KIND.MELEE, rarity: RARITY.COMMON,
    damage: 6, reach: 18, cooldownTicks: 10,
  }),
  'long-blade': Object.freeze({
    id: 'long-blade', name: 'long blade', kind: WEAPON_KIND.MELEE, rarity: RARITY.UNCOMMON,
    damage: 10, reach: 28, cooldownTicks: 16,
  }),
  'ranged-sidearm': Object.freeze({
    id: 'ranged-sidearm', name: 'ranged sidearm', kind: WEAPON_KIND.RANGED, rarity: RARITY.UNCOMMON,
    damage: 8, reach: 160, cooldownTicks: 22,
  }),
  // Variety table (DESIGN-SEED spine addition 1: commons/uncommons fill an arc/speed/range table).
  'short-dagger': Object.freeze({
    id: 'short-dagger', name: 'short dagger', kind: WEAPON_KIND.MELEE, rarity: RARITY.COMMON,
    damage: 4, reach: 14, cooldownTicks: 6, // fastest, shortest
  }),
  'heavy-club': Object.freeze({
    id: 'heavy-club', name: 'heavy club', kind: WEAPON_KIND.MELEE, rarity: RARITY.COMMON,
    damage: 12, reach: 16, cooldownTicks: 20, // hardest single hit, slow
  }),
  'long-spear': Object.freeze({
    id: 'long-spear', name: 'long spear', kind: WEAPON_KIND.MELEE, rarity: RARITY.UNCOMMON,
    damage: 7, reach: 36, cooldownTicks: 15, // longest melee reach
  }),
});

// Armor table — defense sources. Placeholder descriptors.
export const ARMOR = Object.freeze({
  none: Object.freeze({ id: 'none', name: 'no armor', defense: 0 }),
  'light-armor': Object.freeze({ id: 'light-armor', name: 'light armor', defense: 3 }),
  'heavy-armor': Object.freeze({ id: 'heavy-armor', name: 'heavy armor', defense: 7 }),
});

/** The starting weapon is auto-equipped (never bare hands by default). */
export const STARTING_WEAPON_ID = 'short-blade';

/**
 * Create a loadout with the starting weapon auto-equipped (DESIGN-SEED "starting weapon
 * auto-equipped").
 */
export function createLoadout({ weaponId = STARTING_WEAPON_ID, armorId = 'none' } = {}) {
  return { weapon: weaponId === BARE_HANDS.id ? BARE_HANDS : WEAPONS[weaponId], armor: ARMOR[armorId] };
}

/** Equip a weapon by id (or bare hands), or a resolved weapon def object. Returns the loadout. */
export function equipWeapon(loadout, weaponIdOrDef) {
  if (weaponIdOrDef && typeof weaponIdOrDef === 'object') { loadout.weapon = weaponIdOrDef; return loadout; }
  loadout.weapon = weaponIdOrDef === BARE_HANDS.id ? BARE_HANDS : (WEAPONS[weaponIdOrDef] || loadout.weapon);
  return loadout;
}

/** Equip armor by id. */
export function equipArmor(loadout, armorId) {
  loadout.armor = ARMOR[armorId] || loadout.armor;
  return loadout;
}

/**
 * Base outgoing damage (before variance). RE-DERIVED (STUDY.md §3):
 *   max(1, attackerStr + weaponDamage − targetDefense).
 * Floor-clamped to 1 so an attack always chips (never a whiff on stat inversion), mirroring the
 * source's floor-clamped HP counter.
 */
export function computeDamage(attackerStats, weapon, targetDefense = 0) {
  const raw = (attackerStats?.str ?? 0) + (weapon?.damage ?? 0) - targetDefense;
  return Math.max(1, raw);
}

/**
 * Damage with a deterministic ±variance band, given a seeded rng. Keeps the floor clamp. Variance
 * is small (±15%) so builds read clearly.
 */
export function computeDamageVaried(attackerStats, weapon, targetDefense, rng) {
  const base = computeDamage(attackerStats, weapon, targetDefense);
  const factor = 0.85 + (rng ? rng.next() : 0.5) * 0.30; // [0.85, 1.15)
  return Math.max(1, Math.round(base * factor));
}

/**
 * Equip-comparison deltas for the UI (DESIGN-SEED "equipment deltas readable", STUDY.md §3.4.4).
 * Positive = the candidate is better. Damage delta uses a neutral target defense of 0.
 * @returns {{dmgDelta:number, defDelta:number, kindChange:boolean}}
 */
export function compareEquip(current, candidate, attackerStats) {
  const curDmg = computeDamage(attackerStats, current, 0);
  const candDmg = computeDamage(attackerStats, candidate, 0);
  return {
    dmgDelta: candDmg - curDmg,
    defDelta: (candidate?.defense ?? 0) - (current?.defense ?? 0),
    kindChange: (current?.kind ?? null) !== (candidate?.kind ?? null),
  };
}
