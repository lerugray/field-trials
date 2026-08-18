// audio-posture.js — POPINJAY'S register tuning for the neutral House Band kit.
// Keep these values at the game call site: band.js stays byte-synced with the
// portable kit while Popinjay retains the room, envelopes, and timbres it shipped.

const voice = (values) => Object.freeze(values);

export const POPINJAY_BAND_OVERRIDES = Object.freeze({
  reverb: Object.freeze({ seconds: 3.4, decay: 2.6 }),
  reverbReturnGain: 0.55,
  fadeOut: 1.1,
  fadeIn: 2.2,
  retireTail: 4.0,
  voiceDefaults: Object.freeze({
    pad: voice({ verb: 0.5, cut: 700, sweep: 1.5, q: 1.2, det: 7, vol: 0.10, wave: 'sawtooth', a: 1.2, d: 1.0, s: 0.7, r: 2.0 }),
    drone: voice({ verb: 0.25, cut: 320, q: 0.8, vol: 0.11, beat: 0, wave: 'sine', a: 2.2, d: 0.8, s: 0.85, r: 3.0 }),
    bell: voice({ verb: 0.8, ratios: Object.freeze([1, 2.01, 3.03, 4.78]), levels: Object.freeze([1, 0.4, 0.22, 0.1]), vol: 0.07, a: 0.006, dScale: 0.85, s: 0.02, r: 1.4, holdScale: 0.4 }),
    pluck: voice({ verb: 0.4, cut: 2400, wave: 'triangle', a: 0.005, dScale: 0.6, s: 0.06, r: 0.3, vol: 0.07, holdScale: 0.5 }),
    bass: voice({ verb: 0.1, cut: 400, q: 2.5, vol: 0.13, wave: 'sawtooth', a: 0.02, dScale: 0.4, s: 0.5, r: 0.25, holdScale: 0.85 }),
    lead: voice({ verb: 0.45, cut: 2000, q: 1.8, wave: 'square', vibrato: 4.8, vibratoDepth: 0.005, a: 0.06, d: 0.2, s: 0.7, r: 0.4, vol: 0.08 }),
    air: voice({ verb: 0.5, type: 'bandpass', bp: 500, sweep: 2.2, q: 1.4, attackScale: 0.4, decayScale: 0.3, s: 0.7, r: 1.6, vol: 0.05 }),
    snare: voice({ verb: 0.35 }),
    hat: voice({ verb: 0.2 }),
  }),
});
