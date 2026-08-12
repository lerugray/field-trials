// rng.js — named, seeded RNG streams. NO Math.random in game logic (stack law):
// every stochastic decision draws from a named stream derived deterministically
// from the run's world seed. Streams are independent so adding a draw in one
// system (e.g. decor) never shifts another (e.g. layout) — critical for the
// reachability validator and save-round-trip determinism.
//
// Save/resume law (systems fold): a stream's position is serializable and
// restorable, so a reloaded run cannot re-roll anything.

import { mulberry32 } from '../engine/prng.js';

// The canonical stream names. Adding one here is the only place new streams are declared.
export const STREAM_NAMES = ['layout', 'decor', 'enemies', 'caprices', 'hazard'];

// Derive a distinct 32-bit sub-seed per stream name from the world seed, so each
// name gets an independent sequence. String hash (FNV-1a-ish) folded with the seed.
function subSeed(worldSeed, name) {
  let h = 0x811c9dc5 ^ (worldSeed >>> 0);
  for (let i = 0; i < name.length; i++) {
    h ^= name.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// A single named stream: wraps a mulberry32 generator and counts draws so its
// position can be saved and restored exactly.
export class Stream {
  constructor(seed, count = 0) {
    this.seed = seed >>> 0;
    this.count = count >>> 0;
    this._gen = mulberry32(this.seed);
    // Fast-forward to the saved position (resume).
    for (let i = 0; i < this.count; i++) this._gen();
  }
  // float in [0,1)
  next() {
    this.count = (this.count + 1) >>> 0;
    return this._gen();
  }
  // integer in [lo, hi) — half-open
  int(lo, hi) {
    return lo + Math.floor(this.next() * (hi - lo));
  }
  // float in [lo, hi)
  range(lo, hi) {
    return lo + this.next() * (hi - lo);
  }
  // pick an element of arr
  pick(arr) {
    return arr[this.int(0, arr.length)];
  }
  // serializable position
  save() {
    return { seed: this.seed, count: this.count };
  }
}

// A bundle of all named streams for one world seed. This is what the sim carries.
export class Rng {
  constructor(worldSeed) {
    this.worldSeed = worldSeed >>> 0;
    this.streams = {};
    for (const name of STREAM_NAMES) {
      this.streams[name] = new Stream(subSeed(this.worldSeed, name));
    }
  }
  stream(name) {
    const s = this.streams[name];
    if (!s) throw new Error(`rng: unknown stream "${name}" (declared streams: ${STREAM_NAMES.join(', ')})`);
    return s;
  }
  // Serialize every stream position — resume cannot re-roll (save-scum-proof law).
  save() {
    const out = { worldSeed: this.worldSeed, streams: {} };
    for (const name of STREAM_NAMES) out.streams[name] = this.streams[name].save();
    return out;
  }
  // Restore exact positions.
  static load(data) {
    const rng = new Rng(data.worldSeed);
    for (const name of STREAM_NAMES) {
      const saved = data.streams[name];
      if (saved) rng.streams[name] = new Stream(saved.seed, saved.count);
    }
    return rng;
  }
}

export default Rng;
