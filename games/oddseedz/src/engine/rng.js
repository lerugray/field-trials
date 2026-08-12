// Seeded pseudo-random generator. Deterministic: a seed fully determines the
// stream, so summons, stat rolls, and art are reproducible and testable.

// mulberry32 — a compact, decent 32-bit PRNG. Returns a function yielding
// floats in [0, 1).
export function makeRng(seed) {
  let a = (seed >>> 0) || 1;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Integer in [min, max] inclusive.
export function rngInt(rng, min, max) {
  return min + Math.floor(rng() * (max - min + 1));
}

// Pick one element from a non-empty array.
export function rngPick(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}

// Weighted pick: entries is an array of { value, weight } (weights > 0).
export function rngWeighted(rng, entries) {
  let total = 0;
  for (const e of entries) total += e.weight;
  let roll = rng() * total;
  for (const e of entries) {
    roll -= e.weight;
    if (roll < 0) return e.value;
  }
  return entries[entries.length - 1].value;
}
