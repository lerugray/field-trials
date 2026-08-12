// Character generation — "deal a person, not a spreadsheet"
// (CHARACTER-DESIGN-2026-08-02). Each roll deals a complete stranger: a seeded
// word-rank statline + a random omen + one starting oddment (the item that is
// your weapon). Rerolls are unlimited; there is no "good" roll because a
// statline is a playstyle, not a power level, so ranks are drawn uniformly.
import { mulberry32 } from './prng.js';
import { createCharacter, RANKS, STATS } from './character.js';
import { HERO_PORTRAITS } from './bustart.js';

// opts.names: the name engine (optional). When present, each dealt stranger gets a
// seeded generated NAME and a seeded PORTRAIT (M10 A10 — the stranger no longer
// reads as a static "Initiate" with one face). Pure unit tests may omit it and get
// the static placeholder name; the shell always injects it.
export function createChargen(data, opts = {}) {
  const omens = (data && data.omens) || [];
  const oddments = (data && data.oddments) || [];
  if (omens.length === 0 || oddments.length === 0) throw new Error('createChargen: needs omens + oddments');
  const names = opts.names || null;

  // roll(rng): deal a stranger. Deterministic in the PRNG stream, so a seed
  // reproduces a specific stranger (and a fresh seed deals a fresh one — the
  // reroll loop just advances the seed).
  function roll(rng) {
    const pick = (arr) => arr[Math.floor(rng() * arr.length)];
    const spec = {};
    for (const s of STATS) spec[s] = pick(RANKS);
    spec.fnord = pick(RANKS); // hidden; consulted only by the tail system
    spec.omen = pick(omens);
    const odd = pick(oddments);
    spec.oddment = odd;
    // Name + face randomize (seeded) when the name engine is wired; otherwise the
    // static placeholder. Draw both from the same rng stream so a seed reproduces
    // the whole stranger. personalName mods the set index internally.
    spec.name = names ? names.personalName(Math.floor(rng() * 97), rng) : '[SEED] Initiate';
    spec.portrait = HERO_PORTRAITS[Math.floor(rng() * HERO_PORTRAITS.length)];
    return spec;
  }

  // rollCharacter: roll a spec and build the live character in one step.
  function rollCharacter(rng) {
    return createCharacter(roll(rng));
  }

  // rollSeeded: reproducible stranger from an integer seed.
  function rollSeeded(seed) {
    return rollCharacter(mulberry32(seed >>> 0));
  }

  return { roll, rollCharacter, rollSeeded, omenCount: omens.length, oddmentCount: oddments.length };
}
