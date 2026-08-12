// The lineage loop (M6, the gate): retire → Memory Meadow → inherit → heir.
//
// This is the module that makes the estate a BLOODLINE instead of a single pet.
// When a pet's time is up it RETIRES — alive — into the Memory Meadow: a frozen,
// read-only record that stays visible and pettable but never fights again
// (retirement is graduation, not loss; the Meadow is a museum, not a bench). Two
// retirees (or one retiree + a "wild seed" fallback in generation one) then
// INHERIT into the next egg: it carries 1-2 boosted stats, a temperament
// tendency, the look of a parent, and parent badges, while the estate (money,
// toys, the whole Meadow) persists. The clock never resets; the line gets
// stronger.
//
// Everything here is PURE and DETERMINISTIC. Given the same parents and salt the
// same egg hatches every time (an heir can be reasoned about and tested); no RNG
// closure escapes, no clock is read. The design law it serves: inheritance is
// VISIBLE and simple — no genetics charts, no fusion maze.

import { fnv1a } from './hash.js';
import { makeRng, rngInt, rngPick } from './rng.js';
import { STAT_KEYS, STAT_BANDS, coinName } from './summon.js';
import { RARITIES } from '../data/roster.js';
import { STAT_FLOOR, STAT_CAP, LIFESPAN_WEEKS } from './raise.js';

export const MEADOW_CAP = 12; // retirees kept visible; the oldest rolls off past this
export const BADGE_CAP = 4; // lineage badges shown on an heir (keeps the tooltip legible)

// How the next generation "starts stronger": an heir inherits a FRACTION of its
// parents' final stats (a young pet inherits potential, not a champion's peak),
// and its 1-2 boosted stats get a flat head-start on top.
//
// M12 (operator directive): the old 0.42/9 with a 40 ceiling produced a first
// heir WEAKER than a fresh summon — the lineage payoff was invisible. These
// raise the transmitted legacy and the boost, lift the ceiling so a strong
// parent's suit actually carries, and (below) weight the lone real parent far
// above the wild drifter in generation one. A first heir now sits meaningfully
// above a fresh summon of its rarity, with its parent's suit clearly stamped.
export const INHERIT_FRACTION = 0.66;
export const INHERIT_BOOST = 14;
// Generation one blends a lone retiree against the wild seed; the real parent is
// weighted this heavily so the heir carries the parent it actually had.
export const REAL_PARENT_WEIGHT = 0.72;
// Inherited base stats are floored per-rarity at the fresh-summon LOW band (never
// below what a fresh pet of that tier could roll) and may climb to this ceiling;
// the boost can push a boosted stat above it.
const BASE_MAX = 74;

// The fresh-summon baseline an heir is measured against: the midpoint of a fresh
// summon of the heir's own rarity (apples to apples). The per-stat delta from
// this baseline is what makes "this heir carries its parent" legible on the egg.
export function freshBaseline(rarity) {
  const band = STAT_BANDS[rarity] || STAT_BANDS.common;
  return Math.round((band[0] + band[1]) / 2);
}

// The heir's inherited stats paired with their delta vs the fresh-summon
// baseline — consumed by the hatch screen to show what the bloodline bought.
export function inheritedDeltas(egg) {
  const base = freshBaseline(egg.rarity);
  return STAT_KEYS.map((k) => ({ key: k, value: egg.baseStats[k], delta: egg.baseStats[k] - base }));
}

function rarityIndex(r) {
  const i = RARITIES.indexOf(r);
  return i < 0 ? 0 : i;
}
function betterRarity(a, b) {
  return rarityIndex(a) >= rarityIndex(b) ? a : b;
}
function bumpRarity(r) {
  const i = rarityIndex(r);
  return i < RARITIES.length - 1 ? RARITIES[i + 1] : r;
}
const clampLin = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

// --- retirement --------------------------------------------------------------
// Retirement becomes DUE once the pet has lived out its lifespan (the twilight
// stage). The player may retire earlier by choice — this is graduation, always
// available — but the UI only nudges once a pet is past its prime.
export function isRetirementDue(creature) {
  return !!creature && (creature.age || 0) >= LIFESPAN_WEEKS;
}

// Freeze a living creature into a Meadow retiree: a permanent, read-only sheet.
// Snapshots the identity, the FINAL trained stats (the legacy that feeds
// inheritance), the rank the pet reached, and the weeks it lived. Its own
// lineage badges carry forward so a deepening bloodline stays visible.
export function makeRetiree(creature, career) {
  const c = creature || {};
  const car = career || {};
  const lin = c.lineage || {};
  return {
    id: `${c.seed || 0}:${c.age || 0}`,
    name: c.name || 'Someone',
    species: c.species ? { ...c.species } : { id: 'slime', name: 'Slime', archetype: 'blob', hue: 120 },
    rarity: c.rarity || 'common',
    stats: { ...(c.stats || {}) },
    temperament: c.temperament || 'Calm',
    variant: c.variant || 0,
    seed: c.seed || 0,
    retiredAtAge: c.age || 1,
    rank: car.rank || 'E',
    badges: Array.isArray(lin.badges) ? lin.badges.slice(0, BADGE_CAP) : [],
  };
}

// Retire the current pet: append its frozen record to the Meadow (capped, oldest
// rolls off) and hand back the estate with NO active creature — the estate now
// sits between generations, waiting on an heir. Pure: returns { estate, retiree }.
export function retireCreature(state) {
  const creature = state.creature;
  const estate = state.estate || {};
  const retiree = makeRetiree(creature, estate.career);
  const meadow = Array.isArray(estate.meadow) ? estate.meadow : [];
  const nextMeadow = [...meadow, retiree].slice(-MEADOW_CAP);
  return { estate: { ...estate, meadow: nextMeadow }, retiree };
}

// --- inheritance -------------------------------------------------------------
// The generation-one fallback: when the Meadow holds only ONE retiree, it breeds
// against a "wild seed" — a plain drifter from beyond the estate, so inheritance
// ALWAYS gives (the same law as summoning). It is deliberately common and modest;
// the real parent carries the line.
export const WILD_SEED = {
  id: 'wild-seed',
  name: 'a wild seed',
  species: { id: 'slime', name: 'Slime', archetype: 'blob', hue: 110 },
  rarity: 'common',
  stats: { pow: 30, def: 30, spd: 30, sta: 30, foc: 30 },
  temperament: 'Wild',
  variant: 0,
  seed: 0x5eed,
  rank: 'E',
  wild: true,
};

// The single strongest stat of a parent (ties break by STAT_KEYS order) — the
// trait a parent is most likely to pass on.
function topStat(stats) {
  let best = STAT_KEYS[0];
  for (const k of STAT_KEYS) if ((stats[k] || 0) > (stats[best] || 0)) best = k;
  return best;
}

// Build the egg from up to two parents. parentB may be null → the wild-seed
// fallback fills in. `salt` lets the UI re-roll a distinct heir from the same
// parents (deterministic per salt). Returns a plain, inspectable egg: the
// inheritance screen renders it BEFORE hatching, so the promise is visible.
export function breedEgg(parentA, parentB, salt = 0) {
  const pA = parentA;
  const pB = parentB || WILD_SEED;
  const realParents = [pA, parentB].filter((p) => p && !p.wild);

  const seed = fnv1a(`${pA.seed || 0}|${pB.seed || 0}|${salt}`) >>> 0;
  const rng = makeRng(seed);

  // Rarity: the line holds at its best parent, and now and then strengthens a
  // tier — "the next generation starts stronger."
  let rarity = betterRarity(pA.rarity || 'common', pB.rarity || 'common');
  if (rng() < 0.25) rarity = bumpRarity(rarity);

  // The heir LOOKS like a parent (the clearest visible sign of lineage). Bias to
  // the higher-rarity parent's silhouette; the wild seed rarely stamps the child.
  const faceA = pA.species;
  const faceB = pB.species;
  const preferA = rarityIndex(pA.rarity || 'common') >= rarityIndex(pB.rarity || 'common');
  const pick = rng();
  const face = preferA ? (pick < 0.7 ? faceA : faceB) : (pick < 0.7 ? faceB : faceA);
  const species = { ...face };
  // Blend a motif hue from both parents so even a re-used silhouette reads as new.
  const hueA = (faceA.hue || 0);
  const hueB = (faceB.hue || 0);
  species.hue = Math.round((hueA + hueB) / 2 + rngInt(rng, -10, 10) + 360) % 360;

  // Temperament tendency: inherited from one parent.
  const temperament = rng() < 0.5 ? (pA.temperament || 'Calm') : (pB.temperament || 'Calm');

  // Boosted stats: each parent's strongest suit, unioned (1-2 unique keys).
  const boostedSet = new Set([topStat(pA.stats || {}), topStat(pB.stats || {})]);
  const boosted = STAT_KEYS.filter((k) => boostedSet.has(k));

  // Base stats: a fraction of the parents' legacy, floored at a fresh summon of
  // the heir's rarity so the heir is never below a fresh pet, with the boosted
  // stats given a flat head-start on top. When one parent is the wild seed, the
  // real parent is weighted heavily so its trained suit visibly carries forward.
  const baseStats = {};
  const floor = (STAT_BANDS[rarity] || STAT_BANDS.common)[0];
  const oneWild = !!pA.wild !== !!pB.wild;
  for (const k of STAT_KEYS) {
    const a = pA.stats?.[k] || 0;
    const b = pB.stats?.[k] || 0;
    let legacy;
    if (oneWild) {
      const real = pA.wild ? b : a;
      const wild = pA.wild ? a : b;
      legacy = real * REAL_PARENT_WEIGHT + wild * (1 - REAL_PARENT_WEIGHT);
    } else {
      legacy = (a + b) / 2;
    }
    let v = Math.round(legacy * INHERIT_FRACTION) + rngInt(rng, -2, 2);
    v = clampLin(v, floor, BASE_MAX);
    if (boostedSet.has(k)) v = clampLin(v + INHERIT_BOOST, STAT_FLOOR, STAT_CAP);
    baseStats[k] = v;
  }

  const badges = buildBadges(pA, parentB);
  const name = coinName(rng);
  const variant = Math.floor(rng() * 1e6);

  return {
    seed,
    salt,
    name,
    species,
    rarity,
    temperament,
    variant,
    boosted,
    baseStats,
    badges,
    parents: [describeParent(pA), parentB ? describeParent(pB) : describeParent(WILD_SEED)],
    generationOne: realParents.length < 2,
  };
}

function describeParent(p) {
  return {
    name: p.name,
    species: p.species ? p.species.name : 'Slime',
    rarity: p.rarity || 'common',
    rank: p.rank || 'E',
    wild: !!p.wild,
  };
}

// Compose the heir's lineage badges: a "Child of ..." mark per real parent, a
// rank-line badge from the best-ranked parent, then one carried-forward
// grandparent badge if room remains — a bloodline you can read at a glance.
function buildBadges(pA, pB) {
  const badges = [];
  const real = [pA, pB].filter((p) => p && !p.wild);
  for (const p of real) badges.push(`Child of ${p.name}`);
  if (real.length) {
    const bestRank = real.reduce((r, p) => (rankHeight(p.rank) > rankHeight(r) ? p.rank : r), 'E');
    badges.push(`${bestRank}-rank line`);
  } else {
    badges.push('Wild-seed foundling');
  }
  // Carry one grandparent badge forward so depth shows.
  for (const p of real) {
    if (badges.length >= BADGE_CAP) break;
    const inherited = Array.isArray(p.badges) ? p.badges : [];
    const gp = inherited.find((b) => b.startsWith('Child of'));
    if (gp && !badges.includes(gp)) badges.push(gp);
  }
  return badges.slice(0, BADGE_CAP);
}

function rankHeight(rank) {
  return { E: 0, D: 1, C: 2, B: 3, A: 4, S: 5 }[rank] ?? 0;
}

// Hatch an egg into a living heir: a summon-shaped creature (so every downstream
// system — raising, care, battle, save — treats it identically), tagged with a
// `lineage` block that the UI reads for the heir tooltip.
export function hatchEgg(egg) {
  return {
    phrase: '',
    normalized: `(heir of ${egg.parents.map((p) => p.name).join(' & ')})`,
    seed: egg.seed,
    name: egg.name,
    species: { ...egg.species },
    rarity: egg.rarity,
    stats: { ...egg.baseStats },
    temperament: egg.temperament,
    variant: egg.variant,
    lineage: {
      parents: egg.parents,
      badges: egg.badges,
      boosted: egg.boosted,
    },
  };
}
