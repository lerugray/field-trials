// Seeded, deterministic RNG for STRAY SQUADRON.
// Every run is defined by a seed; the same seed must always produce the same
// world (encounter grammar, wingmate draws, etc.). No Math.random anywhere in
// game logic — that would break run reproducibility and the seeded test suite.
//
// mulberry32: a small, fast, well-distributed 32-bit generator. Not
// cryptographic (never used for anything security-bearing), just a stable,
// portable stream of numbers we fully control.

// Turn an arbitrary string or number into a 32-bit unsigned seed.
export function hashSeed(input) {
  if (typeof input === 'number') {
    // Fold to a well-mixed uint32.
    let h = input >>> 0;
    h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
    h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
    return (h ^ (h >>> 16)) >>> 0;
  }
  const s = String(input);
  let h = 0x811c9dc5; // FNV-1a offset basis
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

// Create an RNG bound to a seed. Returns an object of typed draws so callers
// never have to remember the raw float contract.
export function makeRng(seed) {
  let a = hashSeed(seed);

  // Core mulberry32 step -> float in [0, 1).
  function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  return {
    seed: hashSeed(seed),
    // float in [0, 1)
    next,
    // float in [min, max)
    range(min, max) {
      return min + next() * (max - min);
    },
    // integer in [min, max] inclusive
    int(min, max) {
      return min + Math.floor(next() * (max - min + 1));
    },
    // true with probability p (default 0.5)
    chance(p = 0.5) {
      return next() < p;
    },
    // uniform pick from a non-empty array
    pick(arr) {
      return arr[Math.floor(next() * arr.length)];
    },
    // in-place Fisher-Yates shuffle (deterministic for the seed)
    shuffle(arr) {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        const tmp = arr[i];
        arr[i] = arr[j];
        arr[j] = tmp;
      }
      return arr;
    },
    // fork a child RNG whose stream is independent but reproducible from this
    // one — used so one subsystem drawing numbers cannot desync another.
    fork(salt) {
      return makeRng(hashSeed(String(a) + ':' + String(salt)));
    },
  };
}
