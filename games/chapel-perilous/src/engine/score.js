// score.js — Chapel Perilous' ambient score. The game-specific layer over the
// portable band kit (band.js): nine tracks and the state→track mapping.
//
// REGISTER (DESIGN-SEED: Illuminatus! / RAW, conspiracy-as-architecture, deadpan
// old-school CRPG, one hue at a time). So: AMBIENT, not action. Slow chord
// drift, long attacks and releases, sparse bell events, quartal and suspended
// voicings around a D minor / Phrygian centre — the resolved major triad is
// reserved for town, because warmth is a thing towns have and the country does
// not. Bells belong to the wilderness and the uncanny; the town has none. The
// 23s are load-bearing: bell events land on steps 23 and 46 of a 64-step loop.
//
// STATE-REACTIVE. Every track reads live params through `s.params`, so intensity
// follows game state without restarting the music: biome `weirdness` darkens and
// detunes the country bed, the Chapel flag bends the underground's bell partials
// to a tritone, and combat `pressure` (how hurt the stranger is) opens the
// filter and thickens the pulse. Scene changes crossfade; param changes do not.
//
// SILENCE IS A FEATURE. `sceneFor('journal')` returns HOLD — the journal opens
// over the world, so the world's music keeps playing rather than cutting to a
// menu cue. `setScene(null)` fades to true silence and is the honest way to ask
// for none. Nothing here fetches anything (hard rule 2); before the player's
// first keypress there is no context and therefore no sound, which is the
// browser autoplay policy and also correct.
//
// The DRONE THAT WAS: this score supersedes the two-detuned-sine ambient drone
// that audio.js carried from M10 Part B. Its role — "the unquiet ground" — is
// now the `drone` voice's `beat` option inside these tracks, which is the same
// idea (a slow acoustic beat between near-identical frequencies) with a filter,
// a reverb send and a state to answer to. The old drone is gone rather than
// left running underneath, because two beds is mud.

import { chord, noteFreq } from './band.js';

/** setScene(HOLD) means "whatever is playing, keep playing". */
export const HOLD = 'hold';

/** mode (main.js) -> track id, or HOLD. Pure; the shell calls this every render. */
const SCENE_BY_MODE = {
  title: 'threshold',
  creation: 'augury',
  overworld: 'country',
  city: 'town',
  building: 'room',
  dungeon: 'under',
  dungeonEnc: 'held',
  combat: 'pattern',
  death: 'thread',
  journal: HOLD, // an overlay over the world — do not interrupt the world's bed
};

export function sceneFor(mode) {
  return SCENE_BY_MODE[mode] || 'country';
}

export const SCENE_MODES = Object.keys(SCENE_BY_MODE);
export const TRACK_IDS = [...new Set(Object.values(SCENE_BY_MODE))].filter((v) => v !== HOLD);

/** The track that plays before the shell has told us anything (first gesture is on the title). */
export const DEFAULT_SCENE = 'threshold';

const clamp01 = (v) => (typeof v === 'number' && v === v ? (v < 0 ? 0 : v > 1 ? 1 : v) : 0);

// --- harmony ---------------------------------------------------------------
// Quintal/quartal opens (no third = no verdict), the Dm family for the country,
// a genuine F major / Bb for town, a minor-second cluster underground, and a
// diminished stack for combat.
const OPEN_A = chord(['D3', 'A3', 'E4']);
const OPEN_B = chord(['D3', 'G3', 'C4']);
const COUNTRY = [
  chord(['D3', 'F3', 'A3', 'E4']),   // Dm add9
  chord(['Bb2', 'D3', 'F3', 'A3']),  // Bb maj7
  chord(['F2', 'C3', 'F3', 'A3']),   // F
  chord(['C3', 'G3', 'C4', 'D4']),   // Csus2
];
const TOWN = [
  chord(['F3', 'A3', 'C4']),
  chord(['D3', 'F3', 'A3']),
  chord(['Bb2', 'D3', 'F3']),
  chord(['C3', 'E3', 'G3']),
];
const CLUSTER = chord(['D2', 'Eb2', 'A2']);     // minor second — unease, no melody
const TRITONE = chord(['D2', 'Ab2']);           // the held dissonance
const PATTERN = chord(['D2', 'F2', 'Ab2', 'B2']); // diminished — "the pattern"
const BELL_SCALE = chord(['D5', 'F5', 'G5', 'A5', 'C6']);
const PENT = chord(['D4', 'F4', 'G4', 'A4', 'C5']);

// Bell partials: normal, and the tritone-bent set the Chapel and the deep get.
const BELL_TRUE = [1, 2.01, 3.03, 4.78];
const BELL_BENT = [1, 1.414, 2.83, 4.24];

/**
 * Register every CHP track on a band and return the scene controller.
 * @param {object} o
 * @param {object} o.band  a band from createBand()
 */
export function createScore({ band } = {}) {
  if (!band) throw new Error('createScore: needs a band');

  // ---- threshold — the title. The slowest thing here: one floor, one open
  // voicing drifting between two inversions, a bell at 23 and 46. Mostly space.
  band.registerTrack('threshold', {
    bpm: 36, len: 64, vol: 0.80,
    step(i, t, s) {
      if (i === 0 || i === 32) s.v.drone(t, noteFreq('D1'), 14, { vol: 0.10, beat: 6, cut: 260, r: 4 });
      if (i % 32 === 0) {
        const ch = i === 0 ? OPEN_A : OPEN_B;
        for (const f of ch) s.v.pad(t, f, 12, { vol: 0.055, cut: 620, sweep: 1.7, det: 9, a: 3.2, r: 3.4 });
      }
      if (i === 23 || i === 46) s.v.bell(t, BELL_SCALE[(s.rand(1) * BELL_SCALE.length) | 0], 5, { vol: 0.055 });
    },
  });

  // ---- augury — creation. The threshold bed plus a slow pentatonic pluck
  // figure: the dice being cast over and over while you reroll the stranger.
  band.registerTrack('augury', {
    bpm: 44, len: 32, vol: 0.78,
    step(i, t, s) {
      if (i === 0) {
        s.v.drone(t, noteFreq('D1'), 11, { vol: 0.09, beat: 6, cut: 280, r: 3.5 });
        for (const f of OPEN_A) s.v.pad(t, f, 10, { vol: 0.05, cut: 700, sweep: 1.5, det: 8, a: 2.4, r: 3 });
      }
      if (i % 4 === 0) s.v.pluck(t, PENT[(s.rand(2) * PENT.length) | 0], 0.9, { vol: 0.055, cut: 2200 });
      if (i === 23) s.v.bell(t, noteFreq('A5'), 4, { vol: 0.05 });
    },
  });

  // ---- country — the overworld. The main bed: a four-chord drift, one chord
  // per bar, over a beating floor. Biome weirdness darkens the pads, widens the
  // detune, opens the noise band and (past a threshold) adds bells off the 23s.
  band.registerTrack('country', {
    bpm: 40, len: 64, vol: 0.76,
    step(i, t, s) {
      const w = clamp01(s.params.weirdness === undefined ? 0.3 : s.params.weirdness);
      if (i === 0 || i === 32) s.v.drone(t, noteFreq('D1'), 13, { vol: 0.095, beat: 5 + 6 * w, cut: 300, r: 3.5 });
      if (i % 16 === 0) {
        const ch = COUNTRY[s.bar % COUNTRY.length];
        for (const f of ch) {
          s.v.pad(t, f, 6.4, { vol: 0.05, cut: 820 - 380 * w, sweep: 1.6, det: 6 + 20 * w, a: 1.8, r: 2.6 });
        }
      }
      // The breath of the open country: a slow noise swell twice a loop.
      if (i === 0 || i === 32) s.v.air(t, 9, { vol: 0.030 + 0.022 * w, bp: 380 + 900 * w, sweep: 2.4, q: 1.1 });
      if (i === 23 || i === 46) s.v.bell(t, BELL_SCALE[(s.rand(3) * BELL_SCALE.length) | 0], 5, { vol: 0.05 });
      // Weird country rings more often, and off the beat.
      if (w > 0.55 && (i === 11 || i === 34)) {
        s.v.bell(t, BELL_SCALE[(s.rand(4) * BELL_SCALE.length) | 0], 4, { vol: 0.036, ratios: BELL_BENT });
      }
    },
  });

  // ---- town — the city. Warmer and closer: the floor comes up an octave, the
  // harmony actually moves (a chord every half bar), plucks walk. No bells — a
  // town is the one place in this world that is not listening back.
  band.registerTrack('town', {
    bpm: 52, len: 32, vol: 0.72,
    step(i, t, s) {
      if (i === 0) s.v.drone(t, noteFreq('D2'), 8, { vol: 0.07, cut: 420, r: 2.4 });
      if (i % 8 === 0) {
        const ch = TOWN[((i / 8) | 0) % TOWN.length];
        for (const f of ch) s.v.pad(t, f, 3.2, { vol: 0.045, cut: 1150, sweep: 1.3, det: 5, a: 0.9, r: 1.6 });
      }
      if (i % 4 === 2) s.v.pluck(t, PENT[(s.rand(5) * PENT.length) | 0], 0.7, { vol: 0.045, cut: 2600 });
    },
  });

  // ---- room — a building interior. Deliberately almost nothing: the score
  // steps out of the way of the shop and service text. One hum, one pluck.
  band.registerTrack('room', {
    bpm: 52, len: 32, vol: 0.44,
    step(i, t, s) {
      if (i === 0) {
        s.v.drone(t, noteFreq('D2'), 9, { vol: 0.075, cut: 300, r: 2.6 });
        s.v.pluck(t, noteFreq('A3'), 1.1, { vol: 0.04, cut: 1400 });
      }
      if (i === 16) s.v.air(t, 6, { vol: 0.02, bp: 300, sweep: 1.4, q: 0.9 });
    },
  });

  // ---- under — the dungeon crawl. The floor drops and beats harder, the pad
  // becomes a low minor-second cluster with almost no top, and the noise texture
  // takes over as the loudest voice — you are hearing a room, not music. A
  // single bent bell late in the loop. The Chapel bends it further.
  band.registerTrack('under', {
    bpm: 34, len: 64, vol: 0.70,
    step(i, t, s) {
      const w = clamp01(s.params.weirdness === undefined ? 0.5 : s.params.weirdness);
      const chapel = !!s.params.chapel;
      if (i === 0 || i === 32) {
        s.v.drone(t, noteFreq(chapel ? 'C1' : 'D1'), 16, { vol: 0.10, beat: 8 + 8 * w, cut: 220, r: 4.5 });
      }
      if (i % 32 === 0) {
        for (const f of CLUSTER) {
          s.v.pad(t, f, 13, { vol: 0.04, cut: 380 - 120 * w, sweep: 1.25, det: 12 + 22 * w, a: 4, r: 4, wave: 'sawtooth' });
        }
      }
      // The dominant voice down here: a slow swept band of noise, twice a loop.
      if (i === 0 || i === 24 || i === 48) {
        s.v.air(t, 11, { vol: 0.045 + 0.02 * w, bp: 240 + 420 * w, sweep: 2.8, q: 1.8 });
      }
      if (i === 46) s.v.bell(t, BELL_SCALE[(s.rand(6) * BELL_SCALE.length) | 0], 6, { vol: 0.042, ratios: chapel ? BELL_BENT : BELL_TRUE, r: 2.2 });
    },
  });

  // ---- held — a being seen ahead, sneak-or-confront. Deliberately the SAME
  // harmonic floor as `under` so it reads as escalation rather than a new scene:
  // the cluster is replaced by a sustained tritone and the noise band climbs.
  // No bells — nothing rings while you are deciding.
  band.registerTrack('held', {
    bpm: 34, len: 32, vol: 0.80,
    step(i, t, s) {
      const w = clamp01(s.params.weirdness === undefined ? 0.5 : s.params.weirdness);
      if (i === 0) {
        s.v.drone(t, noteFreq('D1'), 10, { vol: 0.105, beat: 12 + 8 * w, cut: 240, r: 3 });
        for (const f of TRITONE) {
          s.v.pad(t, f, 8, { vol: 0.055, cut: 300, sweep: 3.4, det: 18, a: 2.6, r: 2.6 });
        }
        s.v.air(t, 9, { vol: 0.055, bp: 300, sweep: 4.2, q: 2.4 });
      }
    },
  });

  // ---- pattern — combat. The only track with a pulse, and it is a filtered
  // bass thud on the half bar, not a drum kit. A diminished stack sits over it.
  // `pressure` (how hurt the stranger is) opens the filter, thickens the bass
  // and makes the high bell more likely: the music gets worse as you do.
  band.registerTrack('pattern', {
    bpm: 76, len: 16, vol: 0.80,
    step(i, t, s) {
      const p = clamp01(s.params.pressure);
      if (i === 0) {
        for (const f of PATTERN) {
          s.v.pad(t, f, 3.4, { vol: 0.042, cut: 300 + 520 * p, sweep: 1.5, det: 10 + 16 * p, a: 0.5, r: 1.4 });
        }
      }
      if (i === 0 || i === 8) s.v.bass(t, noteFreq('D2'), 0.7, { vol: 0.10 + 0.05 * p, cut: 340 + 260 * p });
      // A breath on the off beats — pulse without joining a rhythm section.
      if (i === 4 || i === 12) s.v.air(t, 0.5, { vol: 0.022, bp: 900, sweep: 0.6, q: 3, a: 0.02, r: 0.3 });
      if (i === 12 && s.rand(7) < 0.25 + 0.4 * p) {
        s.v.bell(t, BELL_SCALE[(s.rand(8) * BELL_SCALE.length) | 0], 2.4, { vol: 0.035, ratios: BELL_BENT, r: 1.2 });
      }
    },
  });

  // ---- thread — death. One bell, then a single drone gliding down an octave
  // over half a minute, and otherwise nothing. The sparsest track in the game.
  band.registerTrack('thread', {
    bpm: 30, len: 64, vol: 0.66,
    step(i, t, s) {
      if (i === 0) {
        s.v.bell(t, noteFreq('D4'), 8, { vol: 0.06, ratios: BELL_BENT, r: 3.5 });
        s.v.drone(t, noteFreq('D2'), 24, { vol: 0.09, glide: 'D1', beat: 10, cut: 200, a: 3, r: 6 });
      }
      if (i === 32) s.v.air(t, 12, { vol: 0.022, bp: 200, sweep: 1.2, q: 0.9 });
    },
  });

  // ---- the controller ------------------------------------------------------
  let scene = null;

  /**
   * Point the score at a game state. HOLD keeps the current bed (the journal
   * overlay). `null` fades to silence. Params update live without a restart, so
   * intensity layers follow state continuously — call this every render.
   */
  function setScene(id, params = null) {
    if (params) band.setParams(params);
    if (id === HOLD) return false;
    if (id === scene) return false;
    scene = id;
    band.setTrack(id);
    return true;
  }

  return {
    setScene,
    get scene() { return scene; },
    get tracks() { return band.trackNames; },
  };
}
