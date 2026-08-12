// Seeded name generation — a JS port of Veridian Contraption's name_gen.rs (VC
// is Ray's own game; copy freely, clean-room binds Cyclopean only). Phoneme sets
// live in data/register/phonemes.json; syllables are assembled from onset /
// nucleus / coda pools by pattern, then filtered against unfortunate English
// collisions. Used for site, region, and NPC names — all seeded off the world
// PRNG so a coordinate always yields the same name.
import { mulberry32, hashInt } from './prng.js';

// Words too short, English function words, or awkward collisions phoneme
// combinations can produce. Ported from VC's FORBIDDEN_NAMES.
const FORBIDDEN = new Set([
  'I', 'A', 'AN', 'THE', 'BOTH', 'ALL', 'NO', 'OR', 'AND', 'IF', 'SO',
  'HE', 'SHE', 'IT', 'WE', 'BE', 'DO', 'AM', 'IS', 'IN', 'ON', 'AT',
  'TO', 'OF', 'AS', 'BY', 'UP', 'OH', 'US', 'ME', 'MY', 'GO',
  'ASS', 'CUM', 'DIE', 'DICK', 'FAT', 'GAY', 'GOD', 'GUN', 'HAD',
  'HELL', 'HIT', 'HOE', 'NAG', 'NUT', 'PEE', 'PIG', 'POO',
  'PUS', 'RAG', 'RAT', 'SAD', 'SIN', 'SOB', 'TIT', 'WET',
]);

const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);

export function createNames(phonemes) {
  if (!Array.isArray(phonemes) || !phonemes.length) {
    throw new Error('createNames: non-empty phoneme set array required');
  }
  for (const set of phonemes) {
    if (!set.onset?.length || !set.nucleus?.length || !set.coda?.length || !set.syllable_patterns?.length) {
      throw new Error('createNames: phoneme set missing onset/nucleus/coda/patterns');
    }
  }

  const pick = (arr, rng) => arr[Math.floor(rng() * arr.length)];
  const rint = (rng, lo, hiInclusive) => lo + Math.floor(rng() * (hiInclusive - lo + 1));

  // Assemble one syllable: C before the vowel draws from onset, C after from coda.
  function syllable(set, pattern, rng) {
    const chars = [...pattern];
    const vPos = chars.indexOf('V') === -1 ? chars.length : chars.indexOf('V');
    let out = '';
    for (let i = 0; i < chars.length; i++) {
      const ch = chars[i];
      if (ch === 'C') out += i < vPos ? pick(set.onset, rng) : pick(set.coda, rng);
      else if (ch === 'V') out += pick(set.nucleus, rng);
    }
    return out;
  }

  // One word: minSyl..maxSyl syllables, >=2 chars, not a forbidden collision.
  function namePart(set, minSyl, maxSyl, rng) {
    for (let attempt = 0; attempt < 10; attempt++) {
      const count = minSyl === maxSyl ? minSyl : rint(rng, minSyl, maxSyl);
      let name = '';
      for (let i = 0; i < count; i++) name += syllable(set, pick(set.syllable_patterns, rng), rng);
      const result = cap(name);
      if (result.length >= 2 && !FORBIDDEN.has(result.toUpperCase())) return result;
    }
    // Fallback: guarantee a 2-syllable word.
    let name = '';
    for (let i = 0; i < 2; i++) name += syllable(set, pick(set.syllable_patterns, rng), rng);
    return cap(name);
  }

  // A personal (NPC) name for a given phoneme set.
  function personalName(setIdx, rng) {
    const idx = ((setIdx % phonemes.length) + phonemes.length) % phonemes.length;
    const set = phonemes[idx];
    if (set.compound) {
      return `${namePart(set, 1, 2, rng)}-${namePart(set, 1, 2, rng)}`;
    }
    const spec = { 0: [1, 1, 1, 2], 1: [2, 3, 2, 3], 2: [2, 2, 2, 2] }[idx] || [1, 2, 1, 2];
    const [fMin, fMax, lMin, lMax] = spec;
    return `${namePart(set, fMin, fMax, rng)} ${namePart(set, lMin, lMax, rng)}`;
  }

  // A settlement / region name (suffix-based, or hyphen-compound for compound sets).
  function settlementName(setIdx, rng) {
    const idx = ((setIdx % phonemes.length) + phonemes.length) % phonemes.length;
    const set = phonemes[idx];
    if (set.compound || !set.settlement_suffixes?.length) {
      return `${namePart(set, 1, 2, rng)}-${namePart(set, 1, 1, rng)}`;
    }
    const sylCount = idx === 0 ? rint(rng, 1, 2) : 2;
    const base = namePart(set, sylCount, sylCount, rng).toLowerCase();
    return cap(base + pick(set.settlement_suffixes, rng));
  }

  // A grander world name: 2-3 syllables.
  function worldName(rng) {
    const idx = Math.floor(rng() * phonemes.length);
    const set = phonemes[idx];
    if (set.compound) return `${namePart(set, 1, 2, rng)}-${namePart(set, 1, 2, rng)}`;
    return namePart(set, 2, 3, rng);
  }

  // --- coordinate-seeded convenience wrappers (deterministic in the world) ---
  function rngFor(gx, gy, worldSeed, salt) {
    return mulberry32(hashInt(gx | 0, gy | 0, (worldSeed >>> 0) ^ salt));
  }

  // Deterministic region name for a coordinate — the "loc" the prose engine cites.
  function regionAt(gx, gy, worldSeed) {
    const rng = rngFor(gx, gy, worldSeed, 0x2e610);
    return `the ${settlementName(hashInt(gx | 0, gy | 0, worldSeed >>> 0) % phonemes.length, rng)} district`;
  }

  // Deterministic NPC name for a coordinate.
  function npcAt(gx, gy, worldSeed) {
    const rng = rngFor(gx, gy, worldSeed, 0x9c1a);
    return personalName(hashInt(gx | 0, gy | 0, (worldSeed >>> 0) ^ 0x11) % phonemes.length, rng);
  }

  return {
    count: phonemes.length,
    namePart,
    personalName,
    settlementName,
    worldName,
    regionAt,
    npcAt,
  };
}
