// rng.js — NAMED RNG STREAMS (DESIGN-SEED M1, baked into the spine).
//
// Law: an intervention that consumes randomness in one stream must NOT shift
// another. So each named stream is an independent mulberry32 sequence, seeded
// from the master seed via a per-stream salt. Drawing from `encounter` never
// perturbs `terrain`, `shuffle`, or `loot`.
//
// Every stream's state is a single uint32 — fully serializable, so a save can
// capture exact mid-expedition RNG position and a reload resumes byte-identically
// (the save-determinism probe depends on this).
//
// Pure logic — no DOM, no Math.random. Importable by node --test.

import { hashInt } from './prng.js';

// The canonical stream names. Adding a stream = adding a salt here; existing
// streams keep their salts so old saves stay valid.
export const STREAM_NAMES = ['terrain', 'encounter', 'shuffle', 'loot', 'combat', 'mandate'];

// Per-stream salts. Arbitrary distinct constants; NEVER reuse or reorder — a
// salt is part of the save format. (Values are just fixed 32-bit primes-ish.)
// `combat` is its own stream so that card plays (which draw from `shuffle` at
// M3) can never shift a fight's resolution, and vice-versa.
const STREAM_SALTS = {
  terrain: 0x7e1a11d,
  encounter: 0x3c0de5,
  shuffle: 0x5caff1e,
  loot: 0x1007ab1e,
  combat: 0xc0ba77, // distinct salt for combat resolution
  mandate: 0x3a9da7e, // M4: mandate/town/shop/route generation — never perturbs combat
};

// One independent, serializable mulberry32 stream.
export class Stream {
  constructor(state) {
    this.a = state >>> 0;
  }
  // next: advance and return a float in [0,1). Same algorithm as prng.mulberry32,
  // but with the state held explicitly so it can be serialized/restored.
  next() {
    let a = this.a | 0;
    a = (a + 0x6d2b79f5) | 0;
    this.a = a >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  // int: integer in [0, n) (pure-ish — advances the stream).
  int(n) {
    return Math.floor(this.next() * n);
  }
  // range: integer in [lo, hi] inclusive.
  range(lo, hi) {
    return lo + this.int(hi - lo + 1);
  }
  // chance: true with probability p in [0,1].
  chance(p) {
    return this.next() < p;
  }
  // pick: a uniform element of a non-empty array.
  pick(arr) {
    return arr[this.int(arr.length)];
  }
  getState() {
    return this.a >>> 0;
  }
  setState(s) {
    this.a = s >>> 0;
  }
}

// makeStreams: build the full named-stream set from a master seed.
export function makeStreams(masterSeed) {
  const streams = {};
  for (const name of STREAM_NAMES) {
    const salt = STREAM_SALTS[name];
    // Derive each stream's initial state independently from (salt, masterSeed).
    streams[name] = new Stream(hashInt(salt, 0, masterSeed));
  }
  return streams;
}

// serializeStreams: capture every stream's exact position (save format).
export function serializeStreams(streams) {
  const out = {};
  for (const name of STREAM_NAMES) out[name] = streams[name].getState();
  return out;
}

// restoreStreams: rebuild streams at saved positions. Unknown/missing names are
// re-seeded from the master seed so a forward-compatible save never crashes.
export function restoreStreams(masterSeed, saved) {
  const streams = makeStreams(masterSeed);
  if (saved) {
    for (const name of STREAM_NAMES) {
      if (Object.prototype.hasOwnProperty.call(saved, name)) {
        streams[name].setState(saved[name]);
      }
    }
  }
  return streams;
}
