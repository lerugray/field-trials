// uniques.js — the rule-bending unique weapons (DESIGN-SEED spine addition 1: ~8-12 NAMED UNIQUES
// each break ONE rule of the kit — build-changers, never stat sticks). Names are NEUTRAL
// DESCRIPTIVE PLACEHOLDERS (naming law); each carries a one-line `rule` describing what it bends and
// a `mod` object the sim reads. All numbers are RE-DERIVED. The commons/uncommons in equipment.js
// stay situationally competitive — M7's weapon-usage probe checks that.

import { WEAPON_KIND, RARITY } from './equipment.js';

// Each unique is a weapon with the usual fields plus `rule` (player-facing descriptor) and `mod`
// flags: lifesteal (0..1 of damage healed), dmgMul, alwaysCharged, projectileAnyHp, freeSub,
// fragile (incoming-damage multiplier), defenseBonus (flat incoming reduction), downthrustPower.
export const UNIQUES = Object.freeze({
  'unique-1': mk('unique-1', 'twin reach blade', 'reach doubled, damage halved',
    { damage: 3, reach: 40, cooldownTicks: 12 }, {}),
  'unique-2': mk('unique-2', 'slow heavy maul', 'huge damage, very slow swing',
    { damage: 30, reach: 16, cooldownTicks: 34 }, {}),
  'unique-3': mk('unique-3', 'leeching edge', 'heals a share of damage dealt',
    { damage: 6, reach: 18, cooldownTicks: 12 }, { lifesteal: 0.3 }),
  'unique-4': mk('unique-4', 'coiled brand', 'every swing hits as a charged strike',
    { damage: 5, reach: 18, cooldownTicks: 18 }, { alwaysCharged: true }),
  'unique-5': mk('unique-5', 'beam edge', 'fires the shot at ANY health, not just full',
    { damage: 6, reach: 18, cooldownTicks: 12 }, { projectileAnyHp: true }),
  'unique-6': mk('unique-6', 'free sling', 'sub-weapon costs no resource',
    { damage: 6, reach: 18, cooldownTicks: 12 }, { freeSub: true }),
  'unique-7': mk('unique-7', 'glass fang', 'double damage, but you take double damage',
    { damage: 6, reach: 18, cooldownTicks: 12 }, { dmgMul: 2, fragile: 2 }),
  'unique-8': mk('unique-8', 'guard pike', 'weak hits, but blunts incoming damage',
    { damage: 3, reach: 26, cooldownTicks: 14 }, { defenseBonus: 5 }),
  'unique-9': mk('unique-9', 'swift needle', 'blazing fast, tiny per-hit damage',
    { damage: 2, reach: 14, cooldownTicks: 5 }, {}),
  'unique-10': mk('unique-10', 'quake hammer', 'downthrust lands harder and bounces higher',
    { damage: 8, reach: 16, cooldownTicks: 18 }, { downthrustPower: 1.6 }),
});

function mk(id, name, rule, stats, mod) {
  return Object.freeze({
    id, name, rule, kind: WEAPON_KIND.MELEE, rarity: RARITY.UNIQUE,
    ...stats, mod: Object.freeze(mod),
  });
}

export const UNIQUE_IDS = Object.freeze(Object.keys(UNIQUES));

/** Resolve a unique by id (or null). */
export function uniqueDef(id) { return UNIQUES[id] || null; }

/** A weapon's mod object (uniques carry one; commons/uncommons have none → {}). */
export function weaponMod(weapon) { return (weapon && weapon.mod) || {}; }
