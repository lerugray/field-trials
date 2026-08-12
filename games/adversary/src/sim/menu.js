// menu.js — the action menu (DESIGN-SEED M3 + study §2.6): Items / Weapons / Equipment / Strength.
// The menu PAUSES play (enforced by the loop; DESIGN-SEED menu-vs-realtime rule). Weapons/Equipment
// tabs surface the equip-comparison delta before equipping (the M2/M3 equip-comparison requirement,
// STUDY.md §3.4.4). Pure state machine over a ctx {loadout, progress, inventory, gold}; the renderer
// reads entries()/compareAt(), the input layer calls move*/confirm.

import {
  WEAPONS, ARMOR, BARE_HANDS, equipWeapon, equipArmor, compareEquip,
} from './equipment.js';
import { ITEMS, consumeItem, weaponDef } from './inventory.js';
import { KIT_MOVES, moveUnlocked } from './kit.js';

export const TABS = Object.freeze(['items', 'weapons', 'equipment', 'moves', 'strength']);
export const TAB_LABEL = Object.freeze({
  items: 'ITEMS', weapons: 'WEAPONS', equipment: 'EQUIPMENT', moves: 'MOVES', strength: 'STRENGTH',
});

export function createMenu() {
  return { open: false, tab: 0, cursor: 0 };
}

export function openMenu(m) { m.open = true; m.tab = 0; m.cursor = 0; }
export function closeMenu(m) { m.open = false; }
export function toggleMenu(m) { m.open ? closeMenu(m) : openMenu(m); }

const wrap = (i, n) => (n <= 0 ? 0 : ((i % n) + n) % n);

export function currentTab(m) { return TABS[m.tab]; }

export function moveTab(m, dir) {
  m.tab = wrap(m.tab + dir, TABS.length);
  m.cursor = 0;
}

/** Rows shown for the current tab. */
export function entries(m, ctx) {
  const tab = currentTab(m);
  if (tab === 'items') {
    return Object.keys(ITEMS)
      .filter((id) => (ctx.inventory.items[id] || 0) > 0)
      .map((id) => ({ id, name: ITEMS[id].name, count: ctx.inventory.items[id] }));
  }
  if (tab === 'weapons') {
    const ids = [...ctx.inventory.weapons, BARE_HANDS.id];
    return ids.map((id) => ({
      id, name: weaponDef(id).name, equipped: ctx.loadout.weapon.id === id,
    }));
  }
  if (tab === 'equipment') {
    return ctx.inventory.armors.map((id) => ({
      id, name: ARMOR[id].name, equipped: ctx.loadout.armor.id === id,
    }));
  }
  if (tab === 'moves') {
    // The MOVE LIST screen — unlocked moves show their input; locked ones read LOCKED.
    return KIT_MOVES.map((mv) => {
      const unlocked = moveUnlocked(ctx.kit, mv.id);
      return { id: mv.id, name: mv.name, unlocked, value: unlocked ? mv.input : 'LOCKED' };
    });
  }
  // strength — read-only stat rows (the study's Strength screen)
  const s = ctx.progress.stats;
  return [
    { id: 'level', name: 'Level', value: ctx.progress.level },
    { id: 'maxHP', name: 'Max Power', value: s.maxHP },
    { id: 'str', name: 'Strength', value: s.str },
    { id: 'def', name: 'Defence', value: s.def },
    { id: 'mag', name: 'Magic', value: s.mag },
    { id: 'energy', name: 'Energy', value: s.energy },
    { id: 'gold', name: 'Gold', value: ctx.gold },
  ];
}

export function moveCursor(m, dir, ctx) {
  const n = entries(m, ctx).length;
  m.cursor = wrap(m.cursor + dir, n);
}

/**
 * Equip-comparison for the cursor row on weapons/equipment tabs (null otherwise).
 * @returns {null|{dmgDelta:number, defDelta:number, kindChange:boolean}}
 */
export function compareAt(m, ctx) {
  const tab = currentTab(m);
  const rows = entries(m, ctx);
  const row = rows[m.cursor];
  if (!row) return null;
  if (tab === 'weapons') return compareEquip(ctx.loadout.weapon, weaponDef(row.id), ctx.progress.stats);
  if (tab === 'equipment') return compareEquip(ctx.loadout.armor, ARMOR[row.id], ctx.progress.stats);
  return null;
}

/**
 * Act on the current cursor row. Returns an event describing what happened (or null).
 */
export function confirm(m, ctx) {
  const tab = currentTab(m);
  const rows = entries(m, ctx);
  const row = rows[m.cursor];
  if (!row) return null;

  if (tab === 'weapons') {
    equipWeapon(ctx.loadout, weaponDef(row.id) || row.id);
    return { type: 'equip-weapon', id: row.id };
  }
  if (tab === 'equipment') {
    equipArmor(ctx.loadout, row.id);
    return { type: 'equip-armor', id: row.id };
  }
  if (tab === 'items') {
    const def = consumeItem(ctx.inventory, row.id);
    if (!def) return null;
    if (def.heal) {
      const before = ctx.progress.hp;
      ctx.progress.hp = Math.min(ctx.progress.stats.maxHP, ctx.progress.hp + def.heal);
      return { type: 'use-item', id: row.id, healed: ctx.progress.hp - before };
    }
    return { type: 'use-item', id: row.id };
  }
  return null; // strength is read-only
}
