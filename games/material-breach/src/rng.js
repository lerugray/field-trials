// rng.js — seeded, named RNG streams. This is the determinism contract (DESIGN-SEED §5,
// hard rule 4). `Math.random` is BANNED in game logic; a standing test greps for it. Every
// draw comes from a named stream so the raid resolver replays exactly from a seed.
//
// A stream is derived deterministically from (streamName, masterSeed): re-creating the RNG
// with the same seed and requesting the same stream, in the same draw order, yields identical
// output. Streams are independent, so drawing from "raid" never perturbs "morale".

// FNV-1a, 32-bit. Turns a seed string (or a stream name) into a 32-bit integer.
function hash32(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// mulberry32 — a small, fast, well-distributed 32-bit PRNG. Uses Math.imul, never Math.random.
function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A single stream: a floating generator plus the convenience draws the sim actually speaks.
function makeStream(seed) {
  const next = mulberry32(seed);
  return {
    // Uniform float in [0, 1).
    float() {
      return next();
    },
    // Integer in [minInclusive, maxExclusive).
    int(minInclusive, maxExclusive) {
      return minInclusive + Math.floor(next() * (maxExclusive - minInclusive));
    },
    // Integer in [min, max], inclusive both ends.
    between(min, max) {
      return min + Math.floor(next() * (max - min + 1));
    },
    // Uniform pick from a non-empty array.
    pick(arr) {
      return arr[Math.floor(next() * arr.length)];
    },
    // True with probability p (0..1).
    chance(p) {
      return next() < p;
    },
  };
}

// Normalise any seed (number or string) to a 32-bit master.
function toMaster(seed) {
  if (typeof seed === 'number' && Number.isFinite(seed)) return seed >>> 0;
  return hash32(String(seed));
}

// createRng(masterSeed) -> a registry of named streams. stream(name) is memoised, so repeated
// calls within one run return the same advancing generator; a fresh createRng with the same seed
// reproduces every stream from the start.
export function createRng(masterSeed) {
  const master = toMaster(masterSeed);
  const streams = new Map();
  return {
    seed: masterSeed,
    stream(name) {
      let s = streams.get(name);
      if (!s) {
        s = makeStream((hash32(name) ^ master) >>> 0);
        streams.set(name, s);
      }
      return s;
    },
  };
}

// Exposed for tests and for deriving per-cycle sub-seeds (raid replay).
export { hash32 };
