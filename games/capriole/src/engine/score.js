// score.js — CAPRIOLE's code-composed House Band score. This is the only music
// consumer: no audio files, samples, fonts, fetches, or CDN paths. The register is
// bouncy toybox synth-funk — a springy bass spine, bright square/FM figures, major-key
// carnival harmony, and a lightly swung sixteenth grid. Acts add layers as the ascent
// rises; title and scorecard use the same themes as a gentler music-box miniature.

import { createBand, noteFreq } from './band.js';

export const SCORE_TRACKS = Object.freeze([
  'title', 'ascent-1', 'boss-1', 'ascent-2',
  'boss-2', 'ascent-3', 'boss-3', 'scorecard',
]);

const ACTS = [
  {
    bpm: 112,
    roots: ['C2', 'F2', 'A2', 'G2'],
    chords: [['C5', 'E5', 'G5'], ['F5', 'A5', 'C6'], ['A4', 'C5', 'E5'], ['G4', 'B4', 'D5']],
    melody: ['E5', 'G5', 'A5', 'G5', 'E5', 'D5', 'C5', 'G5'],
  },
  {
    bpm: 118,
    roots: ['D2', 'G2', 'B2', 'A2'],
    chords: [['D5', 'F#5', 'A5'], ['G5', 'B5', 'D6'], ['B4', 'D5', 'F#5'], ['A4', 'C#5', 'E5']],
    melody: ['F#5', 'A5', 'B5', 'A5', 'D6', 'C#6', 'A5', 'F#5'],
  },
  {
    bpm: 124,
    roots: ['E2', 'A2', 'C#3', 'B2'],
    chords: [['E5', 'G#5', 'B5'], ['A5', 'C#6', 'E6'], ['C#5', 'E5', 'G#5'], ['B4', 'D#5', 'F#5']],
    melody: ['G#5', 'B5', 'C#6', 'B5', 'E6', 'D#6', 'B5', 'G#5'],
  },
];

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

// Delay the back eighth of each beat by a small fraction of a sixteenth. The scheduler
// stays deterministic; only the absolute WebAudio note time shifts.
function swung(t, i, bpm, amount = 0.18) {
  return t + (i % 4 === 2 ? (60 / bpm / 4) * amount : 0);
}

function registerMusicBox(band, name, scorecard = false) {
  const notes = scorecard
    ? ['C6', 'G5', 'E5', 'D5', 'F5', 'A5', 'G5', 'E5']
    : ['C5', 'E5', 'G5', 'C6', 'A5', 'F5', 'G5', 'E5'];
  band.registerTrack(name, {
    bpm: scorecard ? 72 : 78,
    len: 64,
    vol: 0.66,
    step(i, t, s) {
      const k = i % 8;
      if (i % 4 === 0) {
        s.v.bell(t, noteFreq(notes[k]), 0.34, {
          vol: scorecard ? 0.042 : 0.050,
          ratios: [1, 2, 3.01, 4.02], verb: 0.72, r: 0.9,
        });
      }
      if (i % 16 === 0) {
        const root = scorecard ? (i % 32 ? 'F3' : 'C3') : (i % 32 ? 'G3' : 'C3');
        s.v.pluck(t, noteFreq(root), 0.42, { vol: 0.034, wave: 'triangle', cut: 1500, verb: 0.5, r: 0.7 });
      }
      // A tiny high answer gives the title its wind-up-box sparkle; the scorecard keeps
      // more air between notes without falling into a minor or funereal register.
      if (!scorecard && i % 16 === 10) {
        s.v.fm(t, noteFreq(notes[(k + 3) % notes.length]), 0.18, { vol: 0.024, ratio: 3, index: 1.1, verb: 0.62 });
      }
    },
  });
}

function registerAscent(band, actIndex, boss = false) {
  const act = ACTS[actIndex];
  const name = `${boss ? 'boss' : 'ascent'}-${actIndex + 1}`;
  band.registerTrack(name, {
    bpm: act.bpm + (boss ? 8 : 0),
    len: 64,
    vol: boss ? 0.78 : 0.72,
    step(i, t, s) {
      const bpm = act.bpm + (boss ? 8 : 0);
      const at = swung(t, i, bpm, boss ? 0.13 : 0.18);
      const bar = Math.floor(i / 16) % 4;
      const beat = i % 16;
      const intensity = clamp01(Number(s.params.intensity) || 0);
      const root = act.roots[bar];

      // Layer 1 (all acts): the springy syncopated bass-led groove.
      const bassSteps = boss ? [0, 3, 6, 8, 10, 12, 14] : [0, 3, 6, 8, 11, 14];
      if (bassSteps.includes(beat)) {
        const octavePop = beat === 6 || beat === 14;
        s.v.bass(at, noteFreq(root) * (octavePop ? 2 : 1), 0.13, {
          vol: boss ? 0.105 : 0.082, wave: 'square', cut: 620 + actIndex * 130, q: 3.2, r: 0.14,
        });
      }
      if (beat === 0 || beat === 8 || (boss && beat === 10)) s.v.kick(at, { vol: boss ? 0.18 : 0.12, f0: 160, f1: 52 });
      if (beat === 4 || beat === 12) s.v.snare(at, { vol: boss ? 0.075 : 0.052, bp: 2100 });

      // The major-key call: compact square lead phrases, with a different contour per act.
      if ([2, 6, 10, 14].includes(beat)) {
        const n = act.melody[(bar * 2 + beat / 4) % act.melody.length | 0];
        s.v.lead(at, noteFreq(n), 0.14, {
          vol: 0.030 + actIndex * 0.006 + intensity * 0.012,
          wave: 'square', cut: 2600 + actIndex * 450, verb: 0.26, vibrato: 5.4,
        });
      }

      // Layer 2 (act II onward, or a closing act-I fair): bright hats and chord stabs.
      if ((actIndex >= 1 || intensity >= 0.48) && beat % 2 === 0) {
        s.v.hat(at, { vol: beat % 4 === 2 ? 0.030 : 0.020, hp: 6600, dur: 0.045 });
      }
      if ((actIndex >= 1 || intensity >= 0.58) && (beat === 5 || beat === 13)) {
        const chord = act.chords[bar];
        chord.forEach((n, k) => s.v.pluck(at + k * 0.006, noteFreq(n), 0.11, {
          vol: 0.020, wave: 'triangle', cut: 3100, verb: 0.30,
        }));
      }

      // Layer 3 (act III / high pressure): the glassy FM carnival counterline.
      if ((actIndex >= 2 || intensity >= 0.80 || boss) && (beat === 1 || beat === 9)) {
        const chord = act.chords[bar];
        const n = chord[(bar + (beat === 9 ? 1 : 0)) % chord.length];
        s.v.fm(at, noteFreq(n) * 2, 0.16, {
          vol: boss ? 0.038 : 0.028, ratio: boss ? 2.5 : 2, index: 1.45 + intensity * 0.5,
          cut: 5200, verb: 0.32,
        });
      }
      if (boss && (beat === 7 || beat === 15)) s.v.snare(at, { vol: 0.045, bp: 3100, dur: 0.09 });
    },
  });
}

export function registerCaprioleScore(band) {
  registerMusicBox(band, 'title', false);
  for (let act = 0; act < 3; act++) {
    registerAscent(band, act, false);
    registerAscent(band, act, true);
  }
  registerMusicBox(band, 'scorecard', true);
  return SCORE_TRACKS.slice();
}

export function trackForScene(scene, { act = 0, boss = false } = {}) {
  if (scene === 'title') return 'title';
  if (scene === 'scorecard' || scene === 'meta') return 'scorecard';
  const n = Math.max(0, Math.min(2, act | 0)) + 1;
  return `${boss ? 'boss' : 'ascent'}-${n}`;
}

export function createScore({ seed = 1, ctx = null } = {}) {
  let audioCtx = ctx;
  let band = null;
  let ready = false;
  let volume = 0.7;
  let request = { scene: 'title', act: 0, boss: false, intensity: 0 };

  function applyRequest(fadeIn) {
    if (!ready || !band) return false;
    band.setParams({ intensity: clamp01(request.intensity), act: request.act, boss: !!request.boss });
    return band.setTrack(trackForScene(request.scene, request), fadeIn == null ? {} : { fadeIn });
  }

  function resume() {
    try { if (audioCtx && audioCtx.state === 'suspended' && audioCtx.resume) audioCtx.resume(); } catch (_) { /* gesture retry later */ }
  }

  function enable() {
    if (ready) { resume(); return true; }
    if (!audioCtx) {
      const AC = (typeof window !== 'undefined') && (window.AudioContext || window.webkitAudioContext);
      if (!AC) return false;
      try { audioCtx = new AC(); } catch (_) { return false; }
    }
    try {
      band = createBand({
        ctx: audioCtx, seed, gain: volume,
        reverb: { seconds: 2.2, decay: 2.35 },
        fadeOut: 0.65, fadeIn: 0.9,
      });
      registerCaprioleScore(band);
      ready = true;
      resume();
      applyRequest(0.08);
      band.start();
      return true;
    } catch (_) { return false; }
  }

  return {
    enable,
    resume,
    setScene(scene, state = {}) {
      request = { ...request, ...state, scene };
      applyRequest();
      return trackForScene(request.scene, request);
    },
    setIntensity(v) {
      request.intensity = clamp01(Number(v) || 0);
      if (band) band.setParams({ intensity: request.intensity });
    },
    setVolume(v) {
      volume = clamp01(Number(v) || 0);
      if (band) band.setGain(volume);
    },
    tick(now) { return band ? band.tick(now) : 0; },
    dispose() { if (band) band.dispose(); band = null; ready = false; },
    get enabled() { return ready; },
    get context() { return audioCtx; },
    get volume() { return volume; },
    get scene() { return request.scene; },
    get track() { return band ? band.track : trackForScene(request.scene, request); },
    get trackNames() { return band ? band.trackNames : SCORE_TRACKS.slice(); },
  };
}

export default { createScore, registerCaprioleScore, trackForScene, SCORE_TRACKS };
