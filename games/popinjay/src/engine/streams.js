// streams.js — named, serializable RNG streams for the SIM (hard rule 6).
//
// The sim uses ONLY these named streams — never Math.random. Every stream exposes
// its integer position so it can be serialized into a save and restored to produce
// a byte-identical continuation (DESIGN-SEED verification bar: save round-trip).
//
// AUDIO-SIM ISOLATION LAW (DESIGN-SEED §Score). The band keeps its OWN private
// streams and is seeded independently (see audioSeed below); nothing in the audio
// path touches these sim streams, and nothing gameplay-visible reads the audio
// clock. Probe target: audio-on vs audio-suppressed sim hashes are identical.

import { hash2 } from './prng.js';

// The canonical sim stream names. Adding a stream here is the ONLY way to get sim
// randomness — a reviewer can grep this list to audit every entropy source.
export const STREAM_NAMES = ['layout', 'roster', 'drops', 'draft'];

// A single mulberry32 stream with an EXPOSED, serializable position. The stepping
// is byte-identical to prng.js `mulberry32` for the same seed, but `state` is
// readable/writable so it can ride in a save.
export class Stream {
  constructor(seed) { this.state = seed >>> 0; }

  // Advance and return a float in [0,1). Identical sequence to mulberry32(seed).
  next() {
    let a = this.state | 0;
    a = (a + 0x6d2b79f5) | 0;
    this.state = a >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  // Integer in [0, n). Rejection-free (fine for gameplay-scale n).
  int(n) { return Math.floor(this.next() * n); }

  // Pick from an array.
  pick(arr) { return arr[this.int(arr.length)]; }
}

// A named-stream bundle derived deterministically from one master seed. Each named
// stream gets an independent seed via hash2(masterSeed, nameIndex) so advancing one
// stream never perturbs another (order-independence across subsystems).
export class Streams {
  constructor(masterSeed) {
    this.masterSeed = masterSeed >>> 0;
    this.byName = {};
    for (let i = 0; i < STREAM_NAMES.length; i++) {
      const name = STREAM_NAMES[i];
      const seed = Math.floor(hash2(i + 1, 0, this.masterSeed) * 4294967296) >>> 0;
      this.byName[name] = new Stream(seed || 1);
    }
  }

  get(name) {
    const s = this.byName[name];
    if (!s) throw new Error(`Streams.get: unknown stream "${name}"`);
    return s;
  }

  // Serialize every stream position (+ master seed) for a save. Plain JSON.
  serialize() {
    const pos = {};
    for (const name of STREAM_NAMES) pos[name] = this.byName[name].state >>> 0;
    return { masterSeed: this.masterSeed, pos };
  }

  // Restore positions from a serialized bundle. Master seed must match (a mismatch
  // is a LOUD error — never a silent re-roll; DESIGN-SEED death discipline).
  restore(data) {
    if (!data || (data.masterSeed >>> 0) !== this.masterSeed) {
      throw new Error('Streams.restore: master seed mismatch — refusing silent re-roll');
    }
    for (const name of STREAM_NAMES) {
      if (typeof data.pos?.[name] === 'number') this.byName[name].state = data.pos[name] >>> 0;
    }
    return this;
  }

  static fromSerialized(data) {
    return new Streams(data.masterSeed).restore(data);
  }
}

// The band's seed is derived from the master seed but kept ARCHITECTURALLY SEPARATE
// (a distinct salt), so audio entropy can never collide with a sim stream. The band
// owns its own PRNG internally (see band.js `createBand({ seed })`); this only picks
// the number to hand it.
export function audioSeed(masterSeed) {
  return Math.floor(hash2(0xa0d10, 0, masterSeed >>> 0) * 4294967296) >>> 0 || 1;
}
