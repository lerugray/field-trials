// Procedural creature voices (M10). Every sound in the game is a short sequence
// of oscillator tones described HERE as a pure spec — no WebAudio in this module,
// so the whole thing is unit-testable and deterministic. The UI player
// (src/ui/audio.js) is the only thing that touches an AudioContext, and it
// simply reads these specs. Mute is mandatory and lives in the player.
//
// The design goal is the cheap-charming squeak/blip vocabulary of a late-90s
// virtual pet: tiny, round, a little silly, never a sustained tone. Each of the
// ten archetypes has a distinct VOICE (a base pitch + timbre + wobble character);
// each game EVENT reshapes that voice into a two-or-three-note phrase.

import { makeRng } from './rng.js';
import { ARCHETYPES } from '../data/roster.js';

// The four oscillator shapes a WebAudio OscillatorNode understands. 'sine' is
// round and soft, 'triangle' is a hollow beep, 'square' is a chippy blip,
// 'sawtooth' is buzzy/mechanical.
export const WAVEFORMS = ['sine', 'triangle', 'square', 'sawtooth'];

// The events that make a sound. Kept small and player-facing: the summon jingle,
// the three care taps, a battle swing and its landing, the two match verdicts,
// and a generic UI blip for menu clicks.
export const SFX_EVENTS = ['summon', 'pet', 'feed', 'play', 'act', 'hit', 'win', 'lose', 'ui'];

// Per-archetype VOICE. `base` is the middle pitch in Hz the voice sits around,
// `wave` its timbre, `wobble` how much the seed is allowed to detune it (in
// semitone-ish cents fraction). Ooze is low and round; Spark is high and chippy;
// Phantom is a hollow wisp; Scrap is a buzzy machine; and so on — the timbres are
// chosen to echo each archetype's element without any sampled audio.
export const VOICES = {
  blob: { base: 220, wave: 'sine', wobble: 0.06 }, // Ooze — low, gloopy, round
  critter: { base: 340, wave: 'triangle', wobble: 0.10 }, // Beast — chirpy yip
  avian: { base: 560, wave: 'triangle', wobble: 0.14 }, // Gale — high tweet
  bug: { base: 480, wave: 'square', wobble: 0.16 }, // Swarm — buzzy chitter
  aquatic: { base: 300, wave: 'sine', wobble: 0.08 }, // Tide — bubbly bloop
  humanoid: { base: 260, wave: 'triangle', wobble: 0.05 }, // Grit — grounded hum
  orb: { base: 640, wave: 'square', wobble: 0.12 }, // Spark — bright chip
  object: { base: 200, wave: 'sawtooth', wobble: 0.04 }, // Scrap — buzzy clank
  plant: { base: 380, wave: 'sine', wobble: 0.07 }, // Bloom — soft whistle
  spectral: { base: 420, wave: 'sine', wobble: 0.18 }, // Phantom — floaty wisp
};

const DEFAULT_VOICE = { base: 320, wave: 'triangle', wobble: 0.08 };

// Every emitted frequency is clamped into a safe, pleasant band so a bad seed can
// never produce a subsonic rumble or an ear-splitting whine.
const MIN_HZ = 80;
const MAX_HZ = 5000;
const clampHz = (hz) => Math.max(MIN_HZ, Math.min(MAX_HZ, hz));

// Convert a signed semitone offset into a frequency multiplier.
const semis = (n) => Math.pow(2, n / 12);

// Each event is a small phrase RECIPE: a list of notes, each a semitone offset
// from the voice's base pitch, a duration (seconds), a peak gain (0..1), and an
// optional `slide` (end-pitch semitone offset — a portamento within the note).
// The recipe is deterministic; the seed only nudges pitch by ±wobble so two pets
// of the same archetype sound like cousins, not clones.
const RECIPES = {
  // A happy little three-note rise: the birth chirp.
  summon: [
    { d: 0, dur: 0.09, gain: 0.5 },
    { d: 4, dur: 0.09, gain: 0.5 },
    { d: 9, dur: 0.16, gain: 0.55, slide: 12 },
  ],
  // A soft two-note coo when petted.
  pet: [
    { d: 5, dur: 0.07, gain: 0.4 },
    { d: 9, dur: 0.11, gain: 0.45, slide: 12 },
  ],
  // A round "nom" bloop when fed — dips then lifts.
  feed: [
    { d: 2, dur: 0.08, gain: 0.45, slide: -3 },
    { d: 7, dur: 0.12, gain: 0.45, slide: 4 },
  ],
  // A bouncy play squeak.
  play: [
    { d: 7, dur: 0.06, gain: 0.45 },
    { d: 12, dur: 0.06, gain: 0.45 },
    { d: 7, dur: 0.09, gain: 0.4 },
  ],
  // A short down-swing whoosh when the pet attacks.
  act: [
    { d: 10, dur: 0.06, gain: 0.4, slide: -8 },
    { d: 2, dur: 0.08, gain: 0.45, slide: -6 },
  ],
  // A blunt low thud when hit.
  hit: [
    { d: -7, dur: 0.11, gain: 0.55, slide: -12 },
  ],
  // A triumphant four-note fanfare.
  win: [
    { d: 0, dur: 0.10, gain: 0.5 },
    { d: 4, dur: 0.10, gain: 0.5 },
    { d: 7, dur: 0.10, gain: 0.5 },
    { d: 12, dur: 0.20, gain: 0.55 },
  ],
  // A gentle two-note descent, never a harsh loss buzzer.
  lose: [
    { d: 0, dur: 0.14, gain: 0.4, slide: -2 },
    { d: -5, dur: 0.22, gain: 0.4, slide: -7 },
  ],
  // The tiny generic menu blip.
  ui: [
    { d: 7, dur: 0.04, gain: 0.3 },
  ],
};

/**
 * Build a deterministic sound spec for one archetype + event.
 * @param {string} archetype one of ARCHETYPES (unknown falls back to a default voice)
 * @param {string} event one of SFX_EVENTS (unknown falls back to 'ui')
 * @param {number} [seed=0] detunes the voice within its wobble band; same seed => same spec
 * @returns {{ tones: Array<{freq:number,dur:number,type:string,gain:number,slide:number}>, duration:number }}
 */
export function sfxSpec(archetype, event, seed = 0) {
  const voice = VOICES[archetype] || DEFAULT_VOICE;
  const recipe = RECIPES[event] || RECIPES.ui;
  // One deterministic detune for the whole phrase, so all notes shift together
  // and the pet keeps a consistent "pitch of voice".
  const rng = makeRng((seed >>> 0) ^ 0x5f3a);
  const detune = (rng() * 2 - 1) * voice.wobble; // fraction of an octave, ±wobble
  const shift = semis(detune * 12);

  const tones = recipe.map((n) => {
    const freq = clampHz(voice.base * semis(n.d) * shift);
    const end = n.slide != null ? clampHz(voice.base * semis(n.d + n.slide) * shift) : freq;
    return {
      freq,
      slide: end,
      dur: n.dur,
      gain: n.gain,
      type: voice.wave,
    };
  });

  const duration = tones.reduce((s, t) => s + t.dur, 0);
  return { tones, duration };
}

/**
 * Turn a spec into an absolute-time schedule the WebAudio player can walk: each
 * note gets a start/stop time (seconds, offset from `startTime`) so tones play
 * back-to-back as one phrase. Pure timing math — no audio nodes — so it is
 * testable without a browser.
 * @param {{tones:Array}} spec from sfxSpec
 * @param {number} [startTime=0] the AudioContext time to begin at
 * @returns {Array<{start:number,stop:number,freq:number,slide:number,gain:number,type:string}>}
 */
export function sfxSchedule(spec, startTime = 0) {
  let t = startTime;
  return spec.tones.map((tone) => {
    const start = t;
    const stop = t + tone.dur;
    t = stop;
    return { start, stop, freq: tone.freq, slide: tone.slide, gain: tone.gain, type: tone.type };
  });
}

// The full menu of specs the player might preload/warm. Handy for tests and for
// a settings-panel "test sound" button.
export function allEvents() {
  return SFX_EVENTS.slice();
}

export function allArchetypes() {
  return ARCHETYPES.slice();
}
