// stats.js — XP / level / stat model (DESIGN-SEED M2: XP/level tables per the study).
//
// Anchored to the only first-party numbers we have (docs/STUDY.md §2): level-0 stats
// Str 14 / Def 5 / Mag 14 / Energy 5 / Max Power(HP) 37, and "Next Lev 50" to reach level 1.
// Max level stays single-digit (§1.5). Everything beyond the L0 anchor is ADVERSARY's own
// retuned curve (STUDY.md §3.4.6: give XP a clear expected curve, don't force grind) — labeled
// RE-DERIVED. Stat labels (Strength/Defence/Magic/Energy/Power) are the study's mechanical terms,
// not flavor names.

export const MAX_LEVEL = 9; // single-digit, per §1.5

// Level-0 baseline (OBSERVED, §2.3).
export const BASE_STATS = Object.freeze({ maxHP: 37, str: 14, def: 5, mag: 14, energy: 5 });

// Per-level stat gains (RE-DERIVED). Applied cumulatively from L0 → target level.
const GROWTH = Object.freeze({ maxHP: 8, str: 3, def: 2, mag: 2, energy: 2 });

// Cumulative XP required to REACH each level. L1 = 50 is OBSERVED (§2.5); the rest is a gentle
// escalating curve (RE-DERIVED) so the "expected level" is legible and grind-light.
export const XP_TO_REACH = Object.freeze([
  0,     // L0
  50,    // L1  (OBSERVED anchor)
  120,   // L2
  220,   // L3
  360,   // L4
  550,   // L5
  800,   // L6
  1120,  // L7
  1520,  // L8
  2010,  // L9 (cap)
]);

/** Clamp a level into [0, MAX_LEVEL]. */
function clampLevel(l) {
  return Math.max(0, Math.min(MAX_LEVEL, l | 0));
}

/** Full stat block at a given level. */
export function statsForLevel(level) {
  const l = clampLevel(level);
  const s = { ...BASE_STATS };
  for (const k of Object.keys(GROWTH)) s[k] = BASE_STATS[k] + GROWTH[k] * l;
  return s;
}

/** Highest level whose XP threshold is satisfied by totalXp. */
export function levelForXp(totalXp) {
  let lvl = 0;
  for (let l = 1; l <= MAX_LEVEL; l++) {
    if (totalXp >= XP_TO_REACH[l]) lvl = l;
    else break;
  }
  return lvl;
}

/** XP remaining until the next level; 0 at cap. */
export function xpToNextLevel(totalXp) {
  const l = levelForXp(totalXp);
  if (l >= MAX_LEVEL) return 0;
  return XP_TO_REACH[l + 1] - totalXp;
}

/**
 * Create a progression state. XP is a running total; current HP tracks separately so damage and
 * healing are independent of the max derived from level.
 */
export function createProgress(totalXp = 0) {
  const level = levelForXp(totalXp);
  const stats = statsForLevel(level);
  return { totalXp, level, stats, hp: stats.maxHP };
}

/**
 * Award XP. Returns {leveledUp:boolean, from:level, to:level, healedToFull:boolean}. On level-up,
 * stats are recomputed; HP tops up by the maxHP delta (a level-up feels rewarding) — never reduces
 * current HP.
 */
export function gainXp(prog, amount) {
  if (!(amount > 0)) return { leveledUp: false, from: prog.level, to: prog.level, healedToFull: false };
  const from = prog.level;
  prog.totalXp += amount;
  const to = levelForXp(prog.totalXp);
  if (to !== from) {
    const oldMax = prog.stats.maxHP;
    prog.level = to;
    prog.stats = statsForLevel(to);
    prog.hp = Math.min(prog.stats.maxHP, prog.hp + (prog.stats.maxHP - oldMax));
    return { leveledUp: true, from, to, healedToFull: prog.hp === prog.stats.maxHP };
  }
  return { leveledUp: false, from, to, healedToFull: false };
}
