// The mid-run loadout choice (M7) — the standing DESIGN-SEED lean, now owned here.
// At each branch point the player picks ONE loadout option from the currently
// unlocked pool: a small, single-choice version of the genre's boon-pick beat,
// scaled DOWN on purpose so it serves the branch map instead of becoming a separate
// boon economy. A pick is per-run only (it never touches the permanent ledger), and
// it is upside only (a boon, never a curse) so a choice is never a trap.
//
// Two kinds of effect:
//   * persistent mods — additive deltas layered on top of the hangar loadout for the
//     rest of the run (more hull, hotter bolts, quicker charge, a salvage skim, a
//     per-kill score edge). applyLoadout() sums them; main.js folds them into its
//     base constants exactly like the M6 upgrade effects.
//   * instant — resolved once at pick time (a field patch heals to full now). Counted
//     here; main.js does the actual heal.
//
// The "unlocked pool" widens with the ship: a few boons are always offered, and the
// richer ones unlock once the matching base upgrade is fitted in the hangar. Pure +
// deterministic from (run seed, node) so a run always offers the same picks.

import { makeRng } from '../core/rng.js';

// requires: null (always unlocked) or { track, tier } — offered once that base track
// is at least that tier in the hangar. mods are additive deltas; instant is resolved
// at pick time (not a persistent mod).
export const BOONS = [
  { id: 'plating',   name: 'Reinforced Plating', blurb: 'Bolt on spare plate. Two more hull for the run.',            requires: null,                  mods: { bonusHull: 2 } },
  { id: 'patch',     name: 'Field Patch',        blurb: 'Patch the hull back to full, right here, right now.',        requires: null,                  instant: 'healFull' },
  { id: 'scavenger', name: 'Scavenger Rig',      blurb: 'Skim a little extra salvage off every wreck this run.',      requires: null,                  mods: { salvageAdd: 0.10 } },
  { id: 'sights',    name: 'Gun Sights',         blurb: 'Cleaner shots line up. A touch more score per kill.',        requires: null,                  mods: { killScore: 5 } },
  { id: 'coils',     name: 'Overcharged Coils',  blurb: 'Hotter bolts for the run. Needs blaster coils fitted.',      requires: { track: 'blaster', tier: 1 }, mods: { damageBonus: 1 } },
  { id: 'cells',     name: 'Spare Cells',        blurb: 'Quicker charge and a faster second wind. Needs boost cells.', requires: { track: 'boost', tier: 1 },   mods: { chargeAdd: 0.12, regenAdd: 0.10 } },
  { id: 'bulwark',   name: 'Bulwark Frame',      blurb: 'A heavy frame. Three more hull. Needs hull plating fitted.', requires: { track: 'hull', tier: 2 },    mods: { bonusHull: 3 } },
];
export const boonById = (id) => BOONS.find((b) => b.id === id) || null;

export const LOADOUT = { choicesPerBranch: 3 };

// Is a boon unlocked, given the owned base-upgrade tiers { hull, blaster, boost }?
export function boonUnlocked(boon, tiers) {
  if (!boon.requires) return true;
  const t = (tiers || {})[boon.requires.track] || 0;
  return t >= boon.requires.tier;
}

// The boons currently offerable: unlocked by the ship AND not already taken this run.
export function availableBoons(tiers, taken = []) {
  const has = new Set(taken);
  return BOONS.filter((b) => boonUnlocked(b, tiers) && !has.has(b.id));
}

// The choices to show at one branch point — up to choicesPerBranch, drawn
// deterministically from (run seed, node id) out of the available pool. Fewer if the
// pool is nearly exhausted; empty only if every unlocked boon is already taken.
export function drawChoices(runSeed, node, tiers, taken = [], n = LOADOUT.choicesPerBranch) {
  const pool = availableBoons(tiers, taken);
  if (pool.length <= n) return pool.slice();
  const rng = makeRng(String(runSeed) + ':loadout:' + (node && node.id));
  return rng.shuffle(pool.slice()).slice(0, n);
}

// Aggregate the run modifiers from everything taken so far. Persistent mods only;
// instants are resolved at pick time by main.js. Returns additive deltas main.js
// layers onto the hangar loadout (chargeAdd/regenAdd/salvageAdd are fractions added
// to the respective multipliers).
export function applyLoadout(takenIds) {
  const acc = { bonusHull: 0, damageBonus: 0, chargeAdd: 0, regenAdd: 0, salvageAdd: 0, killScore: 0 };
  for (const id of takenIds || []) {
    const b = boonById(id);
    if (!b || !b.mods) continue;
    for (const k of Object.keys(acc)) acc[k] += b.mods[k] || 0;
  }
  return acc;
}

// Is a boon an instant (resolved at pick), and which effect? (null if persistent.)
export function instantOf(id) {
  const b = boonById(id);
  return b && b.instant ? b.instant : null;
}
