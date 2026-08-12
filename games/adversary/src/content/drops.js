// drops.js — where the rule-bending uniques enter the campaign (DIRECTIONS-20260806-M11). The 10
// uniques exist + equip + test since M7 but were unobtainable in-campaign. The operator's call:
// FIRST-KILL BOSS DROPS, not a vendor. Each boss node grants ONE specific unique the first time it
// dies; a re-armed (un-beaten) boss never drops twice, and the guarantee is enforced by the fact
// that the granted id already sits in the inventory (the source of truth). Uniques past the boss
// count are placed as guarded exploration pickups in later stages — NOT vendor stock.
//
// The mapping is deterministic and fits each unique to its stage arc. It is recorded here (and in a
// PROGRESS.md table) so the acquisition path is auditable, not scattered through stage defs.

// Boss node id → the unique granted on that boss's FIRST kill.
// Node ids come from CAMPAIGN_NODES (s1, s2, the s3 fork s3l/s3r, s4, the s5 fork s5l/s5r, s6).
export const BOSS_DROPS = Object.freeze({
  s1:  'unique-9',   // swift needle    — a fast, forgiving early gift for the exemplar first boss
  s2:  'unique-3',   // leeching edge   — sustain to carry the mid-run
  s3l: 'unique-1',   // twin reach blade— reach for the platforming (left) route's spacing
  s3r: 'unique-7',   // glass fang      — an aggressive reward for the combat-gauntlet (right) route
  s4:  'unique-8',   // guard pike      — a defensive tool at the convergence
  s5l: 'unique-10',  // quake hammer    — downthrust synergy for the vertical climb (left)
  s5r: 'unique-2',   // slow heavy maul — a heavy-hitter reward for the dense gauntlet (right)
  s6:  'unique-4',   // coiled brand    — always-charged, the finale prize
});

// Guarded exploration pickups: uniques with no boss to hang on, placed in later stages. Each is a
// {node, id, col} — col is the tile column where the pickup sits (on that stage's surface). These
// are the two remainders (10 uniques − 8 boss nodes).
export const EXPLORATION_DROPS = Object.freeze([
  { node: 's4', id: 'unique-5', col: 44 }, // beam edge — tucked past Stage 4's second pit
  { node: 's6', id: 'unique-6', col: 30 }, // free sling — mid-Stage-6, guarded by trash
]);

/** Every unique id obtainable in the campaign (boss drops ∪ exploration pickups). */
export function allObtainableUniques() {
  return new Set([...Object.values(BOSS_DROPS), ...EXPLORATION_DROPS.map((d) => d.id)]);
}

/** Exploration pickups placed in a given node ([] if none). */
export function explorationDropsFor(nodeId) {
  return EXPLORATION_DROPS.filter((d) => d.node === nodeId).map((d) => ({ id: d.id, col: d.col }));
}
