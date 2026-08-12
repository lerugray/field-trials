// rng.js — seeded, deterministic PRNG for anything sim-relevant (DESIGN-SEED "Determinism").
//
// mulberry32: a fast 32-bit generator with a full 2^32 period and good statistical quality for
// game use. State is a single uint32, so getState/setState round-trips exactly — the headless
// suite can replay a run, and saves can restore the exact stream position.

/** Hash an arbitrary string or number into a uint32 seed (FNV-1a style). */
export function hashSeed(seed) {
  if (typeof seed === 'number') {
    // Fold to uint32; guard against NaN/float.
    return (seed >>> 0) || 0x9e3779b9;
  }
  const str = String(seed);
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Create a seeded RNG.
 * @param {number|string} seed - any seed; strings are hashed deterministically.
 */
export function createRng(seed = 0x9e3779b9) {
  let state = hashSeed(seed) >>> 0;

  function nextU32() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (t ^ (t >>> 14)) >>> 0;
  }

  const rng = {
    /** Float in [0, 1). */
    next() {
      return nextU32() / 0x100000000;
    },
    /** Integer in [min, max] inclusive. */
    int(min, max) {
      if (max < min) [min, max] = [max, min];
      const span = max - min + 1;
      return min + (nextU32() % span);
    },
    /** Float in [min, max). */
    range(min, max) {
      return min + (max - min) * (nextU32() / 0x100000000);
    },
    /** True with probability p (0..1). */
    chance(p) {
      return nextU32() / 0x100000000 < p;
    },
    /** Uniformly pick one element of a non-empty array. */
    pick(arr) {
      return arr[nextU32() % arr.length];
    },
    /** Exact uint32 state, for save/replay. */
    getState() {
      return state >>> 0;
    },
    /** Restore exact state captured by getState(). */
    setState(s) {
      state = s >>> 0;
    },
    /**
     * Derive an independent child stream, deterministically, without disturbing this stream's
     * future beyond one draw. Same parent state → same child seed → reproducible sub-streams.
     */
    fork() {
      return createRng(nextU32());
    },
  };
  return rng;
}
