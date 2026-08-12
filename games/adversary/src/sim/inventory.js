// inventory.js — what the player owns (DESIGN-SEED M3: the action-menu inventory). Owned weapons,
// owned armor, and stackable consumables. Pure model; the menu (menu.js) drives equip/use through
// it. Item/weapon labels are placeholder descriptors (NAMES-PENDING.md).

import { WEAPONS, ARMOR, BARE_HANDS, STARTING_WEAPON_ID } from './equipment.js';
import { UNIQUES } from './uniques.js';

/** Consumable item table (placeholder descriptors). */
export const ITEMS = Object.freeze({
  heal: Object.freeze({ id: 'heal', name: 'healing item', heal: 15 }),
});

/** Create an inventory. Starting kit: the auto-equipped starter weapon, no armor, one heal. */
export function createInventory(init = {}) {
  return {
    weapons: init.weapons ? [...init.weapons] : [STARTING_WEAPON_ID],
    armors: init.armors ? [...init.armors] : ['none'],
    items: { heal: 1, ...(init.items || {}) },
  };
}

export function addWeapon(inv, weaponId) {
  if ((WEAPONS[weaponId] || UNIQUES[weaponId]) && !inv.weapons.includes(weaponId)) inv.weapons.push(weaponId);
  return inv;
}

export function addArmor(inv, armorId) {
  if (ARMOR[armorId] && !inv.armors.includes(armorId)) inv.armors.push(armorId);
  return inv;
}

export function addItem(inv, itemId, n = 1) {
  if (!ITEMS[itemId]) return inv;
  inv.items[itemId] = (inv.items[itemId] || 0) + n;
  return inv;
}

/** True if at least one of the item is held. */
export function hasItem(inv, itemId) {
  return (inv.items[itemId] || 0) > 0;
}

/** Consume one item; returns the item def if consumed, else null. */
export function consumeItem(inv, itemId) {
  if (!hasItem(inv, itemId)) return null;
  inv.items[itemId]--;
  return ITEMS[itemId];
}

/** Resolve a weapon id (incl. bare hands and uniques) to its def. */
export function weaponDef(id) {
  if (id === BARE_HANDS.id) return BARE_HANDS;
  return WEAPONS[id] || UNIQUES[id] || null;
}
