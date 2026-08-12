// kit.js — the combat kit + its unlock gating (DESIGN-SEED "COMBAT KIT"). The base melee is always
// available; the rest are found/earned across stages and grow the kit Metroid-style. This module
// decides, per tick, what attack the current input produces given which moves are unlocked. Kept
// additive over the M3 press-swing so unlocking a move never changes the feel of the base attack:
//   • press            → normal swing
//   • hold to full + release → charged strike (stronger), if unlocked
//   • air + down + press → downthrust (downward strike that bounces on hit), if unlocked
//
// Projectile (full-health) and sub-weapon (up+B, resource-consuming) resolve here too and are wired
// by the stage. All multipliers/values are RE-DERIVED tuning targets.

import { FEEL } from '../config/feel.js';
import { weaponMod } from './uniques.js';

// Kit move catalogue for the MOVE LIST screen + unlock pickups. `base` moves are always available;
// the rest unlock across stages. `input` strings are the how-to shown to the player (placeholder
// key hints; remap-aware text is an M9 concern).
export const KIT_MOVES = Object.freeze([
  { id: 'dodge', name: 'dodge step', input: 'double-tap ←/→ (or H)', base: true },
  { id: 'charged', name: 'charged strike', input: 'hold J, then release' },
  { id: 'downthrust', name: 'downthrust', input: 'in air: ↓ + J' },
  { id: 'doubleJump', name: 'double jump', input: 'in air: press jump again' },
  { id: 'projectile', name: 'full-health shot', input: 'J at full HP' },
  { id: 'subweapon', name: 'sub-weapon', input: '↑ + L' },
]);

/** True if a move id is available given the kit (base moves always are). */
export function moveUnlocked(kit, id) {
  const m = KIT_MOVES.find((x) => x.id === id);
  if (!m) return false;
  return m.base || !!(kit && kit[id]);
}

export const CHARGED_MULT = 2.0;
export const DOWNTHRUST_MULT = 1.4;
export const DOWNTHRUST_BOUNCE = 5.0; // upward px/tick on a successful downthrust

/** The set of unlocked kit moves. Base melee + dodge are always on; the rest unlock across stages. */
export function createKit(unlocks = {}) {
  return {
    charged: !!unlocks.charged,
    downthrust: !!unlocks.downthrust,
    doubleJump: !!unlocks.doubleJump,
    projectile: !!unlocks.projectile,
    subweapon: !!unlocks.subweapon,
  };
}

/**
 * Decide the melee swing produced this tick. Advances the charge meter (mutated on `charge`).
 * @param {object} intent - {attackPressed, attackDown, down}
 * @param {object} player - needs {onGround}
 * @param {object} kit
 * @param {object} charge - {ticks} charge meter (mutated)
 * @returns {null|{type:'normal'|'charged'|'downthrust', mul:number, downward:boolean}}
 */
export function decideMelee(intent, player, kit, charge, weapon) {
  const { attackPressed = false, attackDown = false, down = false } = intent || {};
  const mod = weaponMod(weapon);

  // Charge meter (only meaningful if unlocked): builds while attack is held, releases a charged
  // strike when it was held to full. Independent of the press-swing below.
  let charged = null;
  if (kit.charged) {
    if (attackDown) {
      charge.ticks = Math.min(FEEL.CHARGE_FULL_TICKS, charge.ticks + 1);
    } else {
      if (charge.ticks >= FEEL.CHARGE_FULL_TICKS) charged = { type: 'charged', mul: CHARGED_MULT, downward: false };
      charge.ticks = 0;
    }
  }
  if (charged) return charged;

  if (attackPressed) {
    if (kit.downthrust && !player.onGround && down) {
      return { type: 'downthrust', mul: DOWNTHRUST_MULT, downward: true };
    }
    // A unique that makes every swing a charged strike (build-changer).
    if (mod.alwaysCharged) return { type: 'charged', mul: CHARGED_MULT, downward: false };
    return { type: 'normal', mul: 1, downward: false };
  }
  return null;
}
