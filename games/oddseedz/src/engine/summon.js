// Summoning: a phrase becomes a creature. Deterministic end to end — the same
// phrase always summons the same creature (species, rarity, stats, temperament,
// name, and art variant), so a favorite can be re-summoned from memory.
//
// The law: summoning ALWAYS gives. Every phrase yields SOMETHING; rarity is a
// weighted roll biased toward common, never a denial.

import { seedFromPhrase, normalizePhrase } from './hash.js';
import { makeRng, rngInt, rngPick, rngWeighted } from './rng.js';
import { RARITIES, RARITY_WEIGHTS, SPECIES_BY_RARITY } from '../data/roster.js';

// The five legible stats. Kept small on purpose (battle legibility is
// non-negotiable): power, defense, speed, stamina, focus.
export const STAT_KEYS = ['pow', 'def', 'spd', 'sta', 'foc'];

export const STAT_LABELS = {
  pow: 'Power',
  def: 'Defense',
  spd: 'Speed',
  sta: 'Stamina',
  foc: 'Focus',
};

// Per-rarity stat bands [min, max]. Higher rarity trends stronger but the bands
// OVERLAP, so a beloved common can still matter and a lucky rare is not a lock.
// Exported so the balance pass can assert the overlap property directly.
export const STAT_BANDS = {
  common: [20, 46],
  uncommon: [25, 52],
  rare: [30, 58],
  epic: [36, 66],
  legendary: [42, 74],
};

// Temperaments bias behavior later (obedience theater, care reactions). Bands +
// theater, not hidden psychology — the name is the tell.
export const TEMPERAMENTS = [
  'Bold',
  'Timid',
  'Loyal',
  'Wild',
  'Calm',
  'Cheeky',
  'Stoic',
  'Curious',
];

// A tiny syllable name coiner so every pet arrives already feeling like a
// someone. Player renaming lands in M8; this is the friendly default.
const NAME_HEADS = ['Bo', 'Zi', 'Mo', 'Ka', 'Fen', 'Gru', 'Pip', 'No', 'Wex', 'Tam', 'Ru', 'Ves', 'Jori', 'Hux', 'Cly', 'Ombu'];
const NAME_TAILS = ['bble', 'nk', 'zzo', 'mp', 'la', 'gus', 'x', 'ley', 'do', 'squa', 'rt', 'fin', 'wick', 'na', 'boo', 'zz'];

export function coinName(rng) {
  const head = rngPick(rng, NAME_HEADS);
  const tail = rngPick(rng, NAME_TAILS);
  return head + tail;
}

// The longest a player-chosen name may be (keeps cards/log lines from clipping —
// the legibility floor). Names past this are trimmed.
export const NAME_MAX = 16;

// The longest phrase summon will honor. A phrase is a seed, not prose; an
// unbounded phrase is a crash vector (giant hash input, giant stored string).
// Anything past this is truncated before hashing, so summoning stays bounded.
export const PHRASE_MAX = 200;

// Sanitize a player's rename into a safe display name: strip control chars,
// collapse whitespace, cap length. An all-blank entry keeps the current name (or
// falls back to a plain default) so a pet is never left nameless.
export function sanitizeName(raw, fallback = 'Buddy') {
  const cleaned = String(raw == null ? '' : raw)
    .replace(/[\u0000-\u001f\u007f]/g, '') // strip control + DEL chars
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, NAME_MAX)
    .trim();
  return cleaned || String(fallback || 'Buddy');
}

// Return a copy of the creature under a new player-chosen name. Pure; the caller
// persists. The old name is the fallback so a blank submit is a no-op rename.
export function renameCreature(creature, raw) {
  if (!creature) return creature;
  return { ...creature, name: sanitizeName(raw, creature.name) };
}

const rarityEntries = RARITIES.map((r) => ({ value: r, weight: RARITY_WEIGHTS[r] }));

// Summon a creature from a phrase. Draw order is fixed so the output is stable.
// The phrase is length-capped first so an oversized paste can never blow up the
// hash or the stored save.
export function summon(rawPhrase) {
  const phrase = String(rawPhrase == null ? '' : rawPhrase).slice(0, PHRASE_MAX);
  const normalized = normalizePhrase(phrase);
  const seed = seedFromPhrase(phrase);
  const rng = makeRng(seed);

  const rarity = rngWeighted(rng, rarityEntries);
  const pool = SPECIES_BY_RARITY[rarity];
  const species = rngPick(rng, pool);

  const [lo, hi] = STAT_BANDS[rarity];
  const stats = {};
  for (const key of STAT_KEYS) stats[key] = rngInt(rng, lo, hi);

  const temperament = rngPick(rng, TEMPERAMENTS);
  const name = coinName(rng);

  // Art variant knobs, drawn after everything gameplay-relevant so tweaking art
  // never shifts stats. hueShift nudges the species base hue; variant seeds
  // silhouette/pattern choices in the renderer.
  const hueShift = rngInt(rng, -14, 14);
  const variant = Math.floor(rng() * 1e6);

  return {
    phrase,
    normalized,
    seed,
    name,
    species: {
      id: species.id,
      name: species.name,
      archetype: species.archetype,
      hue: (species.hue + hueShift + 360) % 360,
      tellClarity: species.tellClarity,
      traits: species.traits ? { ...species.traits } : undefined,
    },
    rarity,
    stats,
    temperament,
    variant,
  };
}
