// Seeded deterministic PRNG for INNSMOUTH 2000.
//
// Every stochastic system in the game (map generation, growth, disasters) draws from a
// seeded RNG so runs are reproducible and the node --test battery can assert on outcomes.
// Algorithm: mulberry32, a small, fast, well-distributed 32-bit generator. Seeds are hashed
// through splitmix32 first so nearby integer seeds (0, 1, 2...) still produce unrelated
// streams.

// Hash an arbitrary 32-bit integer seed into a well-mixed 32-bit state.
function splitmix32(a) {
  a |= 0;
  a = (a + 0x9e3779b9) | 0;
  let t = a ^ (a >>> 16);
  t = Math.imul(t, 0x21f0aaad);
  t = t ^ (t >>> 15);
  t = Math.imul(t, 0x735a2d97);
  return (t ^ (t >>> 15)) >>> 0;
}

// Convert a string seed to a 32-bit integer (FNV-1a). Lets us seed from a town name.
function hashString(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// Create a seeded RNG. seed may be a number or a string.
export function makeRng(seed = 0) {
  const initial = typeof seed === 'string' ? hashString(seed) : (seed >>> 0);
  let state = splitmix32(initial);

  // Core: next float in [0, 1).
  function next() {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  const rng = {
    // Float in [0, 1).
    next,
    // Float in [min, max).
    range(min, max) {
      return min + next() * (max - min);
    },
    // Integer in [min, max] inclusive.
    int(min, max) {
      return min + Math.floor(next() * (max - min + 1));
    },
    // Boolean true with probability p (default 0.5).
    chance(p = 0.5) {
      return next() < p;
    },
    // A uniformly chosen element of a non-empty array.
    pick(arr) {
      return arr[Math.floor(next() * arr.length)];
    },
    // Fisher-Yates shuffle returning a NEW array; input is not mutated.
    shuffle(arr) {
      const out = arr.slice();
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        const tmp = out[i];
        out[i] = out[j];
        out[j] = tmp;
      }
      return out;
    },
    // Fork a child RNG whose seed derives from this stream. Lets subsystems have
    // independent, reproducible streams without correlating.
    fork() {
      return makeRng(Math.floor(next() * 0xffffffff));
    },
    // Expose the internal state so a saved game can resume the exact stream (M8 save/load).
    getState() { return state >>> 0; },
    setState(s) { state = s | 0; return rng; },
  };
  return rng;
}

export { hashString, splitmix32 };
