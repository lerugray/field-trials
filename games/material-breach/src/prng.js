// Deterministic PRNG + coordinate hashing. No global state; everything seeded.
// Seeded helpers keep procedural score decisions reproducible.

// mulberry32: fast, seedable stream RNG. Returns a function -> float in [0,1).
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// hash2: stateless spatial hash of an integer coordinate pair + seed -> [0,1).
// Same (x,y,seed) always yields the same value; independent of call order.
export function hash2(x, y, seed) {
  let h = (seed >>> 0) ^ 0x9e3779b9;
  h = Math.imul(h ^ (x | 0), 0x27d4eb2d);
  h ^= h >>> 15;
  h = Math.imul(h ^ (y | 0), 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

// hashInt: same as hash2 but returns a uint32 (handy for picking from tables).
export function hashInt(x, y, seed) {
  return Math.floor(hash2(x, y, seed) * 4294967296) >>> 0;
}
