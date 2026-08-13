// score.js — THE SCORE (DESIGN-SEED M7). Code-composed tracks for the band kit
// (src/band.js) — zero audio files, the only audio path (hard rule #10). The
// MUSICAL register is chiptune/medieval: a Famicom consort — square-ish leads,
// plucked courtly figures, processional marches — earnest period music on crude
// synthesis, which is itself the register joke. One track per game state, wired
// to march / town / office / combat / report.
//
// Each track is a `{ bpm, len, vol, step(i,t,s) }` the band schedules: `i` is the
// 16th-note step within the loop, `t` the audio time to schedule at, `s.v` the
// voice set { pad, drone, bell, pluck, bass, lead, air, kick, snare, hat }. All
// pitches are D-modal (Dorian/Aeolian) — a plain church-mode palette.
//
// SONG-STRUCTURE LAW (Ray, 2026-08-12; sharpened 2026-08-13): A/B is the floor,
// not the target. Every full song needs 3+ distinct sections with real arrangement
// variation (voicing, density, register movement); per-pass variation so consecutive
// passes differ; section lengths long enough that the full cycle takes minutes, not
// seconds; tempo erring calm. The register stays medieval/chip; this file governs
// STRUCTURE + arrangement depth, not voice.
//
// V3 (2026-08-13): answers the operator's V2 ear — "repeats fairly quickly… not sure
// two parts is enough… might need some more going on and to be slowed down a little."
// Three sections (A/B/C) × 12 bars, slower BPMs, pad/air/countermelody layers beyond
// V2. V2 remains in git history.
//
// V3.1 (2026-08-13): tempo-only notch. Operator ear on V3: "still a little too fast
// and should be slowed down a little bit, otherwise much better." Arrangement,
// voices, and register unchanged; each context BPM dropped ~10%.
//
// Weiss authors final score DIRECTION at this milestone (per the seed); these are
// the builder's tracks, structurally sound and register-correct, for the operator
// to ratify or redirect. Pure data + pure helpers; node-testable via a counting
// voice stub (the density probe), no WebAudio needed.

import { noteFreq } from './band.js';
import { hash2 } from './prng.js';
const N = noteFreq;

// ---- Form constants (V3) ---------------------------------------------------
// 3 sections × 12 bars × 16 sixteenths = 576 steps. At the V3.1 BPMs below,
// a full A→B→C cycle is ~1.5–3.5 minutes depending on the track.
export const SECTION_BARS = 12;
export const SECTION_COUNT = 3;
export const LOOP_LEN = 16 * SECTION_BARS * SECTION_COUNT; // 576

const passOf = (n) => (n / LOOP_LEN) | 0;
const sectionOf = (bar) => (bar / SECTION_BARS) | 0; // 0=A, 1=B, 2=C
const barInSec = (bar) => bar % SECTION_BARS;

// ---- The tracks ------------------------------------------------------------
export const TRACKS = {
  // OFFICE — the docket / intake / orientation. A waiting room that opens onto
  // a second chamber and then a corridor. Almost nothing happens, on purpose —
  // but the stillness now has three rooms and a soft pad bed V2 lacked.
  //   A (bars 0-11): D/A drone + soft pad, high bell, very still.
  //   B (bars 12-23): Bb/G drone, lower bell, sparse triangle lead.
  //   C (bars 24-35): A2/F2 drone, air breath, desk pluck, darker pad.
  //   Pass: bell pairs, pad root, air density, and lead ornaments rotate.
  office: {
    bpm: 45, len: LOOP_LEN, vol: 0.5,
    step(i, t, s) {
      const v = s.v, bar = s.bar, beat = i % 16, pass = passOf(s.n);
      const sec = sectionOf(bar), bi = barInSec(bar);
      const rootsA = ['D2', 'A2', 'D2', 'F2', 'A2', 'D2', 'G2', 'A2', 'D2', 'A2', 'F2', 'A2'];
      const rootsB = ['Bb2', 'G2', 'Bb2', 'F2', 'G2', 'Bb2', 'D2', 'G2', 'Bb2', 'F2', 'G2', 'A2'];
      const rootsC = ['A2', 'F2', 'A2', 'D2', 'F2', 'A2', 'G2', 'F2', 'A2', 'D2', 'F2', 'G2'];
      const root = (sec === 0 ? rootsA : sec === 1 ? rootsB : rootsC)[bi];
      if (beat === 0) {
        v.drone(t, N(root), 5.2, { vol: sec === 0 ? 0.40 : sec === 1 ? 0.34 : 0.30 });
        // Soft pad bed — the new layer beyond V2's drone+bell waiting room.
        const padRoot = pass % 2 === 0
          ? (sec === 0 ? 'D3' : sec === 1 ? 'Bb2' : 'A2')
          : (sec === 0 ? 'A2' : sec === 1 ? 'G2' : 'F2');
        v.pad(t, N(padRoot), 5.0, { vol: sec === 2 ? 0.055 : 0.045, cut: 520 + sec * 40, verb: 0.55 });
      }
      if (sec === 0) {
        const bells = pass % 2 === 0 ? ['F4', 'D4', 'A4', 'D4'] : ['D4', 'F4', 'C4', 'F4'];
        if (beat === 8 && bi % 2 === 0) v.bell(t, N(bells[(bi / 2) % 4]), 2.4, { vol: 0.20 });
        if (beat === 12 && bi === 11 && s.rand(101) < 0.55) v.bell(t, N('A4'), 1.8, { vol: 0.14 });
      } else if (sec === 1) {
        if (beat === 8) v.bell(t, N(bi % 2 ? 'A4' : 'D4'), 2.2, { vol: 0.18 });
        if (beat === 12 && (bi % 3 === pass % 3) && s.rand(111 + bi) < 0.5) {
          v.lead(t, N(bi % 2 ? 'F4' : 'C4'), 1.8, { wave: 'triangle', vol: 0.11 });
        }
      } else {
        if (beat === 0 && bi % 4 === 0) v.air(t, 4.8, { vol: 0.028 + (pass % 2) * 0.008, bp: 380 + bi * 8, verb: 0.6 });
        if (beat === 8) v.bell(t, N(pass % 2 ? 'D4' : 'F3'), 2.6, { vol: 0.16 });
        if (beat === 10 && bi % 2 === (pass % 2) && s.rand(121 + bi) < 0.45) {
          v.pluck(t, N(bi % 3 ? 'A3' : 'D3'), 0.35, { vol: 0.12 });
        }
      }
    },
  },

  // MARCH — a processional. Plucked courtly bass under a square lead, in D
  // Dorian; steady, earnest, faintly absurd. Three rooms of the road, slowed.
  //   A: bass on 1, sparse pluck counter, square melody, soft pad under.
  //   B: denser pluck, longer melody, high harmony on even passes.
  //   C: thinned to bass + countermelody + occasional bell; rebuild cadence.
  //   Pass: harmony voice, cadence ornament, pad root, and C-section counter rotate.
  march: {
    bpm: 77, len: LOOP_LEN, vol: 0.66,
    step(i, t, s) {
      const v = s.v, bar = s.bar, beat = i % 16, pass = passOf(s.n);
      const sec = sectionOf(bar), bi = barInSec(bar);
      const roots = ['D2', 'G2', 'A2', 'D2', 'F2', 'G2', 'A2', 'D2', 'G2', 'A2', 'Bb2', 'D2'];
      const root = roots[bi % 12];

      if (beat === 0 && bi % 4 === 0) {
        v.pad(t, N(pass % 2 ? 'D3' : 'A2'), 7.5, { vol: 0.04, cut: 640, verb: 0.45 });
      }

      if (sec === 0) {
        if (beat % 4 === 0 && !(bi === 11 && beat === 12)) v.bass(t, N(root), 0.6, { vol: 0.52 });
        const courts = [
          ['A3', 'D4', 'F4', 'D4'], ['B3', 'D4', 'G4', 'D4'],
          ['A3', 'C4', 'F4', 'A3'], ['G3', 'D4', 'F4', 'D4'],
        ];
        if (beat % 4 === 2) v.pluck(t, N(courts[bi % 4][(beat / 4) | 0]), 0.44, { vol: 0.36 });
        const melA = [
          { 0: 'D4', 6: 'F4', 8: 'A4', 12: 'G4' },
          { 0: 'G4', 4: 'A4', 8: 'B4', 14: 'A4' },
          { 0: 'F4', 6: 'A4', 10: 'G4', 14: 'F4' },
          { 0: 'A4', 4: 'D5', 8: 'C5', 12: 'A4' },
        ];
        const note = melA[bi % 4][beat];
        if (note) v.lead(t, N(note), 0.55, { wave: 'square', vol: 0.30 });
      } else if (sec === 1) {
        if (beat % 4 === 0) v.bass(t, N(root), 0.55, { vol: 0.54 });
        const courtsB = [
          ['A3', 'E4', 'G4', 'E4'], ['A3', 'D4', 'F4', 'A4'],
          ['G3', 'B3', 'D4', 'G4'], ['A3', 'C4', 'F4', 'A4'],
        ];
        if (beat % 2 === 0) v.pluck(t, N(courtsB[bi % 4][(beat / 4) | 0]), 0.36, { vol: 0.30 });
        if (beat === 14 && pass % 2 === 0) v.pluck(t, N('C5'), 0.24, { vol: 0.22 });
        const melB = [
          { 0: 'A4', 4: 'C5', 8: 'D5' },
          { 0: 'F4', 4: 'A4', 8: 'D5', 10: 'C5', 12: 'A4', 14: 'F4' },
          { 0: 'G4', 4: 'B4', 8: 'D5', 12: 'B4' },
          { 0: 'D5', 4: 'C5', 8: 'A4', 12: 'F4', 14: 'D4' },
        ];
        const note = melB[bi % 4][beat];
        if (note) v.lead(t, N(note), 0.5, { wave: 'square', vol: 0.34 });
        const harm = { 4: pass % 2 ? 'F5' : 'A5', 12: pass % 2 ? 'E5' : 'F5' };
        if (harm[beat] && bi % 2 === 0) v.lead(t, N(harm[beat]), 0.35, { wave: 'square', vol: 0.14 });
      } else {
        // C — thinned processional: bass + triangle countermelody + cadence bell.
        if (beat % 8 === 0) v.bass(t, N(root), 0.7, { vol: 0.48 });
        if (beat % 4 === 2 && bi % 2 === 0) v.pluck(t, N(['A3', 'D4', 'F4', 'A3'][(beat / 4) | 0]), 0.4, { vol: 0.28 });
        const counter = pass % 2 === 0
          ? { 0: 'D5', 8: 'A4', 12: 'F4' }
          : { 0: 'F5', 4: 'D5', 12: 'A4' };
        if (counter[beat] && bi % 3 !== 2) v.lead(t, N(counter[beat]), 0.7, { wave: 'triangle', vol: 0.20 });
        if (beat === 0 && bi % 4 === 3) v.bell(t, N(pass % 2 ? 'A4' : 'D5'), 1.8, { vol: 0.14 });
        if (bi === 11 && beat === 14) {
          const turn = pass % 3 === 0 ? 'C5' : pass % 3 === 1 ? 'D5' : 'F4';
          v.pluck(t, N(turn), 0.28, { vol: 0.26 });
        }
      }
    },
  },

  // TOWN — lighter than the road. A skipping plucked figure, soft pad, and a
  // welcome that promises nothing. Three densities of the same courtesy.
  //   A: pluck melody, sparse bass, bell, soft pad.
  //   B: walking bass, lead counter-melody, denser feel.
  //   C: pad + air room-tone, thinned pluck, triangle reply.
  //   Pass: counter-melody, pad root, C-section air, and phrase endings rotate.
  town: {
    bpm: 68, len: LOOP_LEN, vol: 0.58,
    step(i, t, s) {
      const v = s.v, bar = s.bar, beat = i % 16, pass = passOf(s.n);
      const sec = sectionOf(bar), bi = barInSec(bar);
      const phraseA = ['D4', 'A4', 'F4', 'A4', 'G4', 'A4', 'F4', 'D4'];
      const phraseB = ['G4', 'B4', 'A4', 'F4', 'E4', 'A4', 'C5', 'A4'];
      const phraseC = ['A4', 'F4', 'D4', 'F4', 'G4', 'F4', 'A4', 'D4'];
      const fig = sec === 0 ? (bi % 2 ? phraseB : phraseA)
        : sec === 1 ? (bi % 2 ? phraseA : phraseB)
        : (bi % 2 ? phraseC : phraseA);
      const roots = ['D2', 'G2', 'A2', 'D2', 'F2', 'G2', 'A2', 'D2', 'G2', 'Bb2', 'A2', 'D2'];

      if (beat === 0 && bi % 3 === 0) {
        v.pad(t, N(pass % 2 ? 'D3' : 'G2'), 6.5, { vol: 0.038, cut: 700, verb: 0.5 });
      }

      if (sec === 0) {
        if (beat % 2 === 0) v.pluck(t, N(fig[(beat / 2) | 0]), 0.32, { vol: 0.30 });
        if (beat % 8 === 0) v.bass(t, N(roots[bi]), 0.65, { vol: 0.46 });
        if (beat === 12) v.bell(t, N(bi % 2 ? 'A4' : 'D5'), 1.6, { vol: 0.18 });
      } else if (sec === 1) {
        if (beat % 2 === 0) v.pluck(t, N(fig[(beat / 2) | 0]), 0.28, { vol: 0.28 });
        if (beat % 4 === 0) v.bass(t, N(roots[bi]), 0.55, { vol: 0.50 });
        const counter = bi % 2 === 0
          ? { 0: 'D5', 4: 'F5', 8: 'A5', 12: 'F5' }
          : { 0: 'G5', 4: 'F5', 8: 'D5', 12: 'C5' };
        if (counter[beat] && pass % 2 === (bi % 2)) {
          v.lead(t, N(counter[beat]), 0.3, { wave: 'triangle', vol: 0.16 });
        }
        if (beat === 12) v.bell(t, N(bi % 2 ? 'D5' : 'A4'), 1.5, { vol: 0.16 });
      } else {
        if (beat % 4 === 0) v.pluck(t, N(fig[(beat / 4) | 0]), 0.4, { vol: 0.24 });
        if (beat % 8 === 0) v.bass(t, N(roots[bi]), 0.7, { vol: 0.42 });
        if (beat === 0 && bi % 4 === 0) v.air(t, 5.5, { vol: 0.022 + (pass % 2) * 0.006, bp: 420, verb: 0.55 });
        const reply = pass % 2 === 0
          ? { 4: 'A4', 12: 'F4' }
          : { 4: 'D5', 8: 'A4' };
        if (reply[beat] && bi % 2 === 0) v.lead(t, N(reply[beat]), 0.5, { wave: 'triangle', vol: 0.14 });
        if (beat === 14 && s.rand(307 + bi) < 0.5) v.pluck(t, N(pass % 2 ? 'C5' : 'F4'), 0.22, { vol: 0.18 });
      }
      if (beat === 15 && sec < 2 && s.rand(317 + bar) < 0.5) {
        v.pluck(t, N(bi % 2 ? 'C5' : 'F4'), 0.2, { vol: 0.18 });
      }
    },
  },

  // COMBAT — driving, but no longer frantic. A pulse bass, full kit, square
  // arp, and a soft pad bed V2 never carried. Three shapes of the same fight.
  //   A: full backbeat — kick, snare, hat, bass, arp, pad.
  //   B: breakdown — sparse kit, lower arp, high fill on alternate passes.
  //   C: rebuild — denser kit, rising arp, pad opens, cadence fill.
  //   Pass: fill pitches, pad cut, and B-section lead density rotate.
  combat: {
    bpm: 94, len: LOOP_LEN, vol: 0.72,
    step(i, t, s) {
      const v = s.v, bar = s.bar, beat = i % 16, pass = passOf(s.n);
      const sec = sectionOf(bar), bi = barInSec(bar);
      const live = Number.isFinite(s.params.intensity) ? s.params.intensity : 0.55;
      const sectionForce = [0.78, 0.58, 0.95][sec];
      const force = Math.max(0.45, Math.min(1.2, live * 0.65 + sectionForce));

      if (beat === 0 && bi % 4 === 0) {
        v.pad(t, N(pass % 2 ? 'D2' : 'A1'), 7.0, {
          vol: 0.035 * force, cut: 480 + sec * 80, verb: 0.35,
        });
      }

      const bassA = [['D2', 'D2', 'F2', 'A2'], ['G2', 'D2', 'F2', 'A2']];
      const bassB = [['Bb2', 'F2', 'C2', 'A2'], ['D2', 'F2', 'A2', 'C3']];
      const bassC = [['D2', 'A2', 'F2', 'D2'], ['G2', 'Bb2', 'A2', 'D3']];
      const bassBank = sec === 0 ? bassA : sec === 1 ? bassB : bassC;
      const bass = bassBank[bi % 2];
      if (beat % 2 === 0 && !(sec === 1 && beat === 14 && bi % 2 === 1)) {
        v.bass(t, N(bass[((beat / 2) | 0) % 4]), 0.26, { vol: 0.46 * force });
      }

      if (beat % 4 === 0) v.kick(t, { vol: 0.55 * force });
      if (sec === 0) {
        if (beat % 4 === 2) v.snare(t, { vol: 0.38 * force });
        if (beat % 2 === 1) v.hat(t, { vol: 0.16 * force });
      } else if (sec === 1) {
        if ((bi % 2 === 0 && beat === 2) || (bi % 2 === 1 && beat % 4 === 2)) {
          v.snare(t, { vol: 0.40 * force });
        }
        if (beat % 2 === 1 && (bi % 2 === 1 || beat % 4 === 3)) v.hat(t, { vol: 0.16 * force });
      } else {
        if (beat % 4 === 2) v.snare(t, { vol: 0.40 * force });
        if (beat % 2 === 1) v.hat(t, { vol: 0.17 * force });
        if (beat === 14 && bi % 3 === pass % 3) v.hat(t, { vol: 0.12 * force });
      }

      const arpsA = [
        ['D4', 'F4', 'A4', 'D5', 'A4', 'F4', 'C5', 'A4'],
        ['G4', 'Bb4', 'D5', 'G5', 'D5', 'Bb4', 'A4', 'F4'],
      ];
      const arpsB = [
        ['Bb3', 'D4', 'F4', 'A4', 'F4', 'D4', 'C4', 'A3'],
        ['D4', 'F4', 'A4', 'C5', 'D5', 'C5', 'A4', 'F4'],
      ];
      const arpsC = [
        ['D4', 'F4', 'A4', 'C5', 'D5', 'A4', 'F4', 'D4'],
        ['A4', 'D5', 'F5', 'A5', 'F5', 'D5', 'C5', 'A4'],
      ];
      const arp = (sec === 0 ? arpsA : sec === 1 ? arpsB : arpsC)[bi % 2];
      if (!(sec === 1 && beat % 4 === 3 && bi % 2 === 0)) {
        v.lead(t, N(arp[beat % 8]), 0.2, { wave: 'square', vol: 0.20 * force });
      }
      if (sec === 1 && beat % 4 === 0 && pass % 2 === (bi % 2)) {
        const fill = bi % 2 === 0
          ? ['D5', 'F5', 'A5', 'C5']
          : ['D5', 'F5', 'A5', 'D6'];
        v.lead(t, N(fill[(beat / 4) | 0]), 0.12, { wave: 'square', vol: 0.18 * force });
      }
      if (sec === 2 && bi >= 10 && beat >= 12 && s.rand(401 + beat) < 0.7) {
        const climb = pass % 2 ? ['D5', 'F5', 'A5', 'D6'] : ['A4', 'D5', 'F5', 'A5'];
        v.lead(t, N(climb[beat - 12]), 0.12, { wave: 'square', vol: 0.18 * force });
      }
    },
  },

  // REPORT — the filed report / a reduction. Slow, somber; shifting drone,
  // sparse descending lead, and a pad/air bed V2 never carried. Deadpan grief.
  //   A: mid-register lead over drone + soft pad.
  //   B: lead drops an octave, pluck echo, darker bell.
  //   C: air room, lowest lead, sparse pad breaths, final desk bell.
  //   Pass: pad root, pluck echo, C-section air, and bell pitch rotate.
  report: {
    bpm: 41, len: LOOP_LEN, vol: 0.58,
    step(i, t, s) {
      const v = s.v, bar = s.bar, beat = i % 16, pass = passOf(s.n);
      const sec = sectionOf(bar), bi = barInSec(bar);
      const roots = ['D2', 'Bb2', 'G2', 'A2', 'F2', 'Bb2', 'G2', 'D2', 'A2', 'F2', 'G2', 'A2'];
      if (beat === 0) {
        v.drone(t, N(roots[bi]), 5.5, { vol: 0.40 - sec * 0.03 });
        v.pad(t, N(pass % 2 ? roots[bi] : (sec === 2 ? 'D2' : 'A1')), 5.2, {
          vol: 0.04, cut: 420 + sec * 30, verb: 0.6,
        });
      }
      if (sec === 0) {
        const phrase = bi % 2
          ? { 0: 'Bb3', 8: 'A3', 12: 'D4' }
          : { 0: 'D4', 8: 'C4' };
        const note = phrase[beat];
        if (note) v.lead(t, N(note), 1.9, { wave: 'triangle', vol: 0.26 });
        if (beat === 12 && s.rand(509 + bi) < 0.45) v.bell(t, N('F4'), 2.4, { vol: 0.15 });
      } else if (sec === 1) {
        const phrase = bi % 2
          ? { 0: 'G3', 8: 'F3', 12: 'A3' }
          : { 0: 'D3', 6: 'F3', 10: 'A3' };
        const note = phrase[beat];
        if (note) v.lead(t, N(note), 2.1, { wave: 'triangle', vol: 0.24 });
        const echo = bi % 2 ? { 4: 'D4', 12: 'C4' } : { 4: 'A3', 12: 'F3' };
        if (echo[beat] && pass % 2 === (bi % 2)) v.pluck(t, N(echo[beat]), 0.4, { vol: 0.13 });
        if (beat === 12 && s.rand(519 + bi) < 0.5) v.bell(t, N('D4'), 2.2, { vol: 0.14 });
      } else {
        if (beat === 0 && bi % 4 === 0) {
          v.air(t, 6.0, { vol: 0.025 + (pass % 2) * 0.008, bp: 320 + bi * 6, verb: 0.65 });
        }
        const phrase = pass % 2 === 0
          ? { 0: 'A2', 8: 'G2', 12: 'D3' }
          : { 0: 'D2', 6: 'F2', 12: 'A2' };
        const note = phrase[beat];
        if (note && bi % 2 === 0) v.lead(t, N(note), 2.4, { wave: 'triangle', vol: 0.22 });
        if (beat === 12 && bi === 11) v.bell(t, N(pass % 2 ? 'D4' : 'A3'), 3.0, { vol: 0.16 });
        if (beat === 8 && bi % 3 === pass % 3 && s.rand(529 + bi) < 0.4) {
          v.pluck(t, N('F3'), 0.5, { vol: 0.10 });
        }
      }
    },
  },
};

// STATE_TRACK — which track backs each UI screen. The shell calls setTrack with
// this every frame; the band no-ops when the name is unchanged.
export const STATE_TRACK = {
  march: 'march', combat: 'combat', route: 'march',
  camp: 'town', shop: 'town', deck: 'town',
  docket: 'office', intake: 'office', title: 'office', howto: 'office',
  defeat: 'report', credits: 'office',
};

// trackForScreen: resolve a screen to its track name (office as the quiet default).
export function trackForScreen(screen) {
  return STATE_TRACK[screen] || 'office';
}

// registerScore: register every track on a band instance.
export function registerScore(band) {
  for (const [name, spec] of Object.entries(TRACKS)) band.registerTrack(name, spec);
  return band;
}

// Cycle length in seconds for a track (one full A→B→C pass).
export function cycleSeconds(spec) {
  return spec.len * (60 / spec.bpm / 4);
}

// ---- The audio probe (density metrics — DESIGN-SEED M7) --------------------
// Run a track for `loops` full cycles against a COUNTING voice stub and tally the
// note events per voice. No WebAudio — this measures the COMPOSITION (how busy a
// track is, which voices it uses), so the score is testable + the density gate is
// deterministic. Returns { name, len, steps, notes, perStep, byVoice }.
const VOICE_NAMES = ['pad', 'drone', 'bell', 'pluck', 'bass', 'lead', 'air', 'kick', 'snare', 'hat'];
export function probeTrack(spec, loops = 1) {
  const byVoice = {};
  let notes = 0;
  const v = {};
  for (const name of VOICE_NAMES) v[name] = () => { notes++; byVoice[name] = (byVoice[name] | 0) + 1; };
  const steps = spec.len * loops;
  for (let n = 0; n < steps; n++) {
    const i = n % spec.len;
    spec.step(i, n * 0.1, { v, i, n, bar: (i / 16) | 0, params: {}, rand: (salt = 0) => hash2(n, salt | 0, 0x0ff1ce) });
  }
  return { len: spec.len, steps, notes, perStep: notes / steps, byVoice };
}

// Stable event bytes for the variation regression. Voice arguments are data,
// not audio nodes, so two sections/seeds can be compared byte-for-byte in Node.
export function renderTrackEventBytes(spec, { start = 0, steps = spec.len, seed = 0x0ff1ce, params = {} } = {}) {
  const events = [];
  const v = {};
  for (const name of VOICE_NAMES) v[name] = (...args) => events.push([name, ...args]);
  for (let n = start; n < start + steps; n++) {
    const i = n % spec.len;
    spec.step(i, n * 0.1, { v, i, n, bar: (i / 16) | 0, params, rand: (salt = 0) => hash2(n, salt | 0, seed) });
  }
  return JSON.stringify(events);
}
