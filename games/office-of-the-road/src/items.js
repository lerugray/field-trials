// items.js — QUARTERMASTER ISSUE (DESIGN-SEED M4). Equipment is the gold-economy
// power axis: standardized kit the party buys at towns and assigns to frames.
// Orthogonal to jobs (a job is a fixed verb set; equipment is a stat overlay) and
// to the deck (run-scoped cards). Two slots per frame keep it legible:
//   arm   — the working instrument (offence: ATK or MAG)
//   guard — the standing protection (defence: DEF, sometimes HP/SPD)
//
// Register law 2: gear is STANDARDIZED ISSUE, never a relic or blessing. Names
// are quartermaster tags; text reads as a safety warning or a depreciating asset.
// Clean-room: original names, no reference's items. Pure data + pure helpers.
//
// An item: { id, name, slot, mods:{atk?,def?,mag?,hp?,spd?}, price, minLeg, tier, tag }
//   price  — gold to purchase at the quartermaster (sell returns a fraction)
//   minLeg — the earliest leg a shop may stock it (the no-early-power-spike curve)

import { TUNING } from './tuning.js';

export const SLOTS = ['arm', 'guard'];

export const ITEMS = {
  // ---- Tier 1 — issue kit (available from the first town) ------------------
  issue_billhook: { id: 'issue_billhook', name: 'Issue Billhook', slot: 'arm', mods: { atk: 3 }, price: 20, minLeg: 0, tier: 1,
    tag: 'Standard cutting instrument. Depreciates with use; not to be re-sharpened by the bearer.' },
  clerks_stylus: { id: 'clerks_stylus', name: "Clerk's Stylus", slot: 'arm', mods: { mag: 3 }, price: 20, minLeg: 0, tier: 1,
    tag: 'For the entering of findings at range. Nib is a consumable; replacements are billed.' },
  regulation_jerkin: { id: 'regulation_jerkin', name: 'Regulation Jerkin', slot: 'guard', mods: { def: 2, hp: 6 }, price: 22, minLeg: 0, tier: 1,
    tag: 'Padded to specification. Rated against ordinary deductions; not certified against jurisdictions.' },
  patrol_greaves: { id: 'patrol_greaves', name: 'Patrol Greaves', slot: 'guard', mods: { def: 1, spd: 2 }, price: 24, minLeg: 0, tier: 1,
    tag: 'Regulation leg-issue. Improves attendance; offers minimal cover.' },

  // ---- Tier 2 — requisitioned kit (mid-run) --------------------------------
  weighted_maul: { id: 'weighted_maul', name: 'Weighted Maul', slot: 'arm', mods: { atk: 6 }, price: 52, minLeg: 3, tier: 2,
    tag: 'Heavier issue for obstinate obstructions. The Office is not liable for over-application.' },
  sealed_seal: { id: 'sealed_seal', name: 'Sealed Signet', slot: 'arm', mods: { mag: 6 }, price: 52, minLeg: 3, tier: 2,
    tag: 'Impresses an injunction with force of instrument. To be returned on completion of the mandate.' },
  reinforced_tabard: { id: 'reinforced_tabard', name: 'Reinforced Tabard', slot: 'guard', mods: { def: 4, hp: 10 }, price: 58, minLeg: 3, tier: 2,
    tag: 'Reinforced to a higher schedule. Rated against contested crossings; inspect seams after each.' },

  // ---- Tier 3 — sealed stores (late-run, town-gated) -----------------------
  distraint_warhammer: { id: 'distraint_warhammer', name: 'Distraint Warhammer', slot: 'arm', mods: { atk: 10 }, price: 96, minLeg: 6, tier: 3,
    tag: 'Sealed stores. Seizes against the sturdiest party present. Handle bears a recall notice.' },
  notarial_scepter: { id: 'notarial_scepter', name: 'Notarial Scepter', slot: 'arm', mods: { mag: 10 }, price: 96, minLeg: 6, tier: 3,
    tag: 'Sealed stores. Binds at a distance. Warranty void if the instrument is described as magic.' },
  warden_plate: { id: 'warden_plate', name: 'Warden Plate', slot: 'guard', mods: { def: 7, hp: 16 }, price: 104, minLeg: 6, tier: 3,
    tag: 'Full standing protection. Heavy; attendance may suffer. Rated against jurisdictions, briefly.' },
};

// Stable id order (shops, inventory, and tests read from it).
export const ITEM_IDS = Object.keys(ITEMS);

export function getItem(id) {
  const it = ITEMS[id];
  if (!it) throw new Error('unknown item: ' + id);
  return it;
}

// itemsUnlockedBy: the ids a shop MAY stock at a given leg (minLeg gate — the
// no-early-power-spike curve). Stable order.
export function itemsUnlockedBy(legIndex) {
  return ITEM_IDS.filter((id) => ITEMS[id].minLeg <= legIndex);
}

// applyMods: fold a set of equip-slot item ids into a base stat block, returning
// a NEW block. Missing slots contribute nothing. Used to derive a frame's live
// stats (job weighting + equipment overlay). Pure.
export function applyMods(baseStats, equip) {
  const out = { ...baseStats };
  if (!equip) return out;
  for (const slot of SLOTS) {
    const id = equip[slot];
    if (!id) continue;
    const mods = getItem(id).mods;
    for (const k in mods) out[k] = (out[k] || 0) + mods[k];
  }
  return out;
}

// sellValue: what the quartermaster returns for a sold item (a fraction, floored).
export function sellValue(id) {
  return Math.max(1, Math.floor(getItem(id).price * TUNING.shopSellFraction));
}

// modsLine: a compact, exact instrument string for an item's stat mods
// (e.g. "+6 atk"). Register law 6 — the numeric neighbour to the prose tag.
export function modsLine(id) {
  const m = getItem(id).mods;
  return Object.keys(m).map((k) => `+${m[k]} ${k}`).join(' ');
}
