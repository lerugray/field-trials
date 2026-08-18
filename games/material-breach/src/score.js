// score.js — MATERIAL BREACH's own score, written over the register-neutral band kit.
//
// REGISTER (DESIGN-SEED §10): LOBBY MUSIC FOR A BUILDING UNDER SIEGE. Institutional light music,
// the hold music of a facility that is on fire. Electric piano and vibraphone, a patient walking
// bass, brushed percussion, unhurried and faintly pleasant: a lobby that does not acknowledge what
// is happening down the corridor. Under it a low fluorescent hum. Over it the percussion of the
// desk itself, typewriter strikes and date stamps landing on the beat. The comedy and the dread are
// both in the refusal to react.
//
// The kit is register-neutral and this game inherits nothing from any prior port. Nothing here is
// borrowed from a sibling game's register.
//
// ============================================================================
// WHY THIS FILE IS FULL OF CHORD NAMES
// ============================================================================
// The binding requirement, added at the M7b directive (2026-08-14) after a sibling game failed the
// operator's ear the same day: A SCORE MUST HAVE REAL HARMONIC MOVEMENT. An actual chord
// progression with MOVING ROOTS in every section, and CADENCES at section boundaries. One chord
// with texture changes over the top is the failure this exists to prevent; a filter sweep is not a
// modulation and a density swap is not a cadence.
//
// So the harmony here is written out as harmony, not as a drifting pad. Every bar names a chord,
// every section's roots move, and every section boundary lands a cadence:
//
//   A  THE LOBBY      Fmaj7  Dm7    Gm7    C7   | Fmaj7 Dm7 Gm7 C7
//                     I - vi - ii - V, twice. The pleasant one. Ends on the dominant and then
//                     side-steps to Bb: a DECEPTIVE cadence, so the section change is audible.
//   B  THE CORRIDOR   Bbmaj7 Bbm6   Fmaj7  D7   | Gm7   C7  Am7 D7
//                     The major-to-minor-fourth sigh, then a circle of fifths that keeps moving.
//                     Ends on D7, which resolves properly into C's opening Gm7.
//   C  THE MEZZANINE  Gm7    Gbdim7 Fmaj7  Em7b5| Ebmaj7 Dm7 Db7 C7
//                     A CHROMATIC DESCENDING BASS: G Gb F E Eb D Db C, one semitone a bar, landing
//                     on the dominant. This is the section with its own unmistakable identity.
//   D  THE HOLD       Dm7 (2 bars) Bbmaj7 (2) Gm7 (2) C7 (2)
//                     HALF the harmonic rhythm of every other section, which is structural
//                     contrast rather than merely different chords. The pedal is exposed here.
//                     Ends C7 -> Fmaj7: a perfect authentic cadence home to A.
//
// Four sections, eight bars each, 32 bars a cycle. At 66 BPM that is a hair under two minutes
// before the form repeats, and per-pass variation (below) means two consecutive passes are never
// identical, so the true repeat is nearer four. The Song-Structure Law asks "would this irritate at
// minute twenty?" — the answer has to be built in, not asserted.
//
// TEMPO IS DELIBERATELY SLOWER THAN INSTINCT (66 BPM). The law names this specifically, and hold
// music is not brisk.
//
// ============================================================================
// THE CURDLE
// ============================================================================
// §10: "the raid section CURDLES rather than changes genre: same ensemble, same tempo, the
// pleasantness souring." So souring is NOT a second track and NOT a key change. It is a live
// parameter that alters the CHORD QUALITIES in place while the ensemble, the tempo, the form and
// the root motion all stay exactly as they were.
//
// Every chord carries two voicings, sweet and sour, as intervals from the same root. `sour` (0..1)
// replaces altered tones FROM THE TOP DOWN: the extensions go first, then the guide tones, which is
// how harmony actually curdles rather than switching. At sour = 1 the same I-vi-ii-V is
// Fm(maj7) - Dm7b5 - Gm7b5 - C7b9: identical roots, identical rhythm, and unmistakably wrong.
//
// It is not driven only by the raid. The lobby sours GRADUALLY across a tenure as the Cornerstone
// degrades and instruments go unanswered, which is the register's whole joke: the music keeps
// insisting everything is fine, slightly less convincingly each cycle.

// ============================================================================
// THE PERFORMANCE PASS
// ============================================================================
// House Band law (Ray, 2026-08-14): humanization is composition, not polish, and pad
// releases default longer than the synth default. This register is warm and institutional
// (lobby music), so it opts IN. A lounge pianist sits a hair behind the beat and never
// anticipates it; no two comps are struck at the same weight; pad chords ring. The walking
// bass and the desk stay on the grid, because DESIGN-SEED §10 puts date stamps and typewriter
// strikes ON the beat. The fluorescent drone already authors a three-second tail, so it takes
// no extra release. The object below is the only new musical input. Notes, patterns, form,
// voicings and arrangement stay as written.

import { createBand } from './band.js';

// ---- pitch arithmetic ---------------------------------------------------------------------------
// Working in MIDI integers rather than note names makes the things this score actually does —
// chromatic approach tones, octave snapping, semitone alterations — into arithmetic instead of
// string surgery.

const SEMI = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

// midi('F3') -> 53. Middle C ('C4') is 60.
export function midi(name) {
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(String(name));
  if (!m) throw new TypeError(`midi: invalid note name "${name}"`);
  const s = SEMI[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
  return (parseInt(m[3], 10) + 1) * 12 + s;
}

// hz(60) -> 261.63. A4 (69) is 440.
export function hz(n) {
  return 440 * Math.pow(2, (n - 69) / 12);
}

// snap(n, lo, hi): move n by whole octaves until it sits inside [lo, hi]. This is what keeps a
// melody built from chord tones in one singable register instead of leaping an octave every time
// the harmony moves. Without it a tune that follows the chords lurches.
export function snap(n, lo, hi) {
  let v = n;
  let guard = 0;
  while (v < lo && guard++ < 12) v += 12;
  while (v > hi && guard++ < 12) v -= 12;
  return v;
}

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

// ---- the chords ---------------------------------------------------------------------------------
// Each chord is a root and two interval sets from that root. `sour` is the same chord with its
// character tones altered; the sets are the same length so souring is a per-degree choice and the
// voice count never changes. The ensemble does not thin out when it curdles: it just goes wrong.

function ch(name, root, sweet, sour) {
  if (sweet.length !== sour.length) throw new Error(`chord ${name}: sweet and sour must voice the same number of notes`);
  return Object.freeze({ name, root: midi(root), sweet: Object.freeze(sweet), sour: Object.freeze(sour) });
}

export const CHORDS = Object.freeze({
  //                    root    sweet          sour
  Fmaj7: ch('Fmaj7', 'F3', [0, 4, 7, 11], [0, 3, 7, 11]), // -> Fm(maj7)
  Dm7: ch('Dm7', 'D3', [0, 3, 7, 10], [0, 3, 6, 10]), // -> Dm7b5
  Gm7: ch('Gm7', 'G3', [0, 3, 7, 10], [0, 3, 6, 10]), // -> Gm7b5
  C7: ch('C7', 'C3', [0, 4, 7, 10], [0, 4, 6, 13]), // -> C7b5b9
  Bbmaj7: ch('Bbmaj7', 'Bb2', [0, 4, 7, 11], [0, 3, 7, 11]), // -> Bbm(maj7)
  Bbm6: ch('Bbm6', 'Bb2', [0, 3, 7, 9], [0, 3, 6, 9]), // -> Bbdim-ish
  D7: ch('D7', 'D3', [0, 4, 7, 10], [0, 4, 6, 13]), // -> D7b5b9
  Am7: ch('Am7', 'A2', [0, 3, 7, 10], [0, 3, 6, 10]), // -> Am7b5
  Gbdim7: ch('Gbdim7', 'Gb2', [0, 3, 6, 9], [0, 3, 6, 8]), // already dim; sinks further
  Em7b5: ch('Em7b5', 'E2', [0, 3, 6, 10], [0, 3, 6, 9]), // -> Edim7
  Ebmaj7: ch('Ebmaj7', 'Eb2', [0, 4, 7, 11], [0, 3, 7, 11]), // -> Ebm(maj7)
  Db7: ch('Db7', 'Db2', [0, 4, 7, 10], [0, 4, 8, 10]), // -> Db7#5
  // the closing cue lives in the parallel minor: the same lobby with the lights off
  Fm_maj7: ch('Fm(maj7)', 'F2', [0, 3, 7, 11], [0, 3, 6, 11]),
  Dbmaj7: ch('Dbmaj7', 'Db2', [0, 4, 7, 11], [0, 3, 7, 11]),
  Bbm7: ch('Bbm7', 'Bb2', [0, 3, 7, 10], [0, 3, 6, 10]),
  Eb7: ch('Eb7', 'Eb2', [0, 4, 7, 10], [0, 4, 6, 13]),
  Abmaj7: ch('Abmaj7', 'Ab2', [0, 4, 7, 11], [0, 3, 7, 11]),
  Gm7b5: ch('Gm7b5', 'G2', [0, 3, 6, 10], [0, 3, 6, 9]),
  C7b9: ch('C7b9', 'C3', [0, 4, 7, 13], [0, 4, 6, 13]),
  Fm7: ch('Fm7', 'F2', [0, 3, 7, 10], [0, 3, 6, 10]),
});

// voicing(chord, sour) -> absolute MIDI notes.
//
// Souring proceeds FROM THE TOP DOWN. At sour = 0.25 only the highest altered degree has moved; at
// sour = 1 every alteration is in. Extensions curdle before guide tones, which is the order in which
// harmony actually goes wrong, and it means the slide is gradual and audible rather than a switch
// that flips.
export function voicing(chord, sour = 0) {
  const q = clamp01(sour);
  const altered = [];
  for (let i = 0; i < chord.sweet.length; i++) if (chord.sweet[i] !== chord.sour[i]) altered.push(i);
  const take = Math.round(q * altered.length);
  const swap = new Set(altered.slice(altered.length - take));
  return chord.sweet.map((iv, i) => chord.root + (swap.has(i) ? chord.sour[i] : iv));
}

// ---- the form -----------------------------------------------------------------------------------

const C = CHORDS;

// Section identity. `arr` is the ARRANGEMENT: which voices play and how densely. This is where the
// law's "real arrangement variation between sections" lives, alongside the harmony.
export const SECTIONS = Object.freeze({
  A: Object.freeze({ id: 'A', name: 'THE LOBBY', bass: 'walk', bell: 'tune', comp: 'full', brush: 'eighths', lead: false }),
  B: Object.freeze({ id: 'B', name: 'THE CORRIDOR', bass: 'walk', bell: 'tune', comp: 'full', brush: 'eighths', lead: true }),
  C: Object.freeze({ id: 'C', name: 'THE MEZZANINE', bass: 'walk', bell: 'sparse', comp: 'sparse', brush: 'half', lead: false }),
  D: Object.freeze({ id: 'D', name: 'THE HOLD', bass: 'half', bell: 'sparse', comp: 'none', brush: 'none', lead: false }),
});

// The 32-bar form, one entry per bar. `sec` names the section; `mel` is the bar's vibraphone figure
// as [stepWithinBar, chordToneIndex] pairs, which follow the voicing and therefore sour with it.
export const FORM = Object.freeze([
  // A — THE LOBBY. I vi ii V, twice.
  Object.freeze({ sec: 'A', ch: C.Fmaj7, mel: [[8, 2], [12, 1]] }),
  Object.freeze({ sec: 'A', ch: C.Dm7, mel: [[0, 0], [8, 2]] }),
  Object.freeze({ sec: 'A', ch: C.Gm7, mel: [[4, 1], [12, 2]] }),
  Object.freeze({ sec: 'A', ch: C.C7, mel: [[0, 3], [8, 1]] }),
  Object.freeze({ sec: 'A', ch: C.Fmaj7, mel: [[8, 1], [12, 2]] }),
  Object.freeze({ sec: 'A', ch: C.Dm7, mel: [[0, 1], [8, 0]] }),
  Object.freeze({ sec: 'A', ch: C.Gm7, mel: [[4, 2], [12, 3]] }),
  Object.freeze({ sec: 'A', ch: C.C7, mel: [[0, 1], [6, 0]] }),
  // B — THE CORRIDOR. The minor-fourth sigh, then a circle that keeps turning.
  Object.freeze({ sec: 'B', ch: C.Bbmaj7, mel: [[0, 2], [10, 3]] }),
  Object.freeze({ sec: 'B', ch: C.Bbm6, mel: [[0, 1], [8, 3]] }),
  Object.freeze({ sec: 'B', ch: C.Fmaj7, mel: [[4, 2], [12, 1]] }),
  Object.freeze({ sec: 'B', ch: C.D7, mel: [[0, 1], [8, 3]] }),
  Object.freeze({ sec: 'B', ch: C.Gm7, mel: [[0, 2], [10, 1]] }),
  Object.freeze({ sec: 'B', ch: C.C7, mel: [[4, 3], [12, 2]] }),
  Object.freeze({ sec: 'B', ch: C.Am7, mel: [[0, 1], [8, 2]] }),
  Object.freeze({ sec: 'B', ch: C.D7, mel: [[0, 3], [8, 1]] }),
  // C — THE MEZZANINE. Chromatic descent: G Gb F E Eb D Db C.
  Object.freeze({ sec: 'C', ch: C.Gm7, mel: [[0, 2]] }),
  Object.freeze({ sec: 'C', ch: C.Gbdim7, mel: [[8, 1]] }),
  Object.freeze({ sec: 'C', ch: C.Fmaj7, mel: [[0, 3]] }),
  Object.freeze({ sec: 'C', ch: C.Em7b5, mel: [[8, 2]] }),
  Object.freeze({ sec: 'C', ch: C.Ebmaj7, mel: [[0, 3]] }),
  Object.freeze({ sec: 'C', ch: C.Dm7, mel: [[8, 1]] }),
  Object.freeze({ sec: 'C', ch: C.Db7, mel: [[0, 2]] }),
  Object.freeze({ sec: 'C', ch: C.C7, mel: [[4, 3], [12, 1]] }),
  // D — THE HOLD. Half the harmonic rhythm; the fluorescent pedal exposed.
  Object.freeze({ sec: 'D', ch: C.Dm7, mel: [[0, 2]] }),
  Object.freeze({ sec: 'D', ch: C.Dm7, mel: [] }),
  Object.freeze({ sec: 'D', ch: C.Bbmaj7, mel: [[0, 1]] }),
  Object.freeze({ sec: 'D', ch: C.Bbmaj7, mel: [] }),
  Object.freeze({ sec: 'D', ch: C.Gm7, mel: [[0, 3]] }),
  Object.freeze({ sec: 'D', ch: C.Gm7, mel: [] }),
  Object.freeze({ sec: 'D', ch: C.C7, mel: [[0, 2]] }),
  Object.freeze({ sec: 'D', ch: C.C7, mel: [[8, 1]] }),
]);

// The closing cue: the same lobby in the parallel minor, with the lights off. Three sections, four
// bars each, and the roots still move: F Db Bb Eb | Ab G C F | Bb Eb Ab C. The last chord is the
// dominant resolving back to Fm, so even the tenure-closed screen keeps cadencing.
export const CLOSING_FORM = Object.freeze([
  Object.freeze({ sec: 'E', ch: C.Fm_maj7, mel: [[0, 2]] }),
  Object.freeze({ sec: 'E', ch: C.Dbmaj7, mel: [[8, 1]] }),
  Object.freeze({ sec: 'E', ch: C.Bbm7, mel: [[0, 3]] }),
  Object.freeze({ sec: 'E', ch: C.Eb7, mel: [[8, 2]] }),
  Object.freeze({ sec: 'F', ch: C.Abmaj7, mel: [[0, 1]] }),
  Object.freeze({ sec: 'F', ch: C.Gm7b5, mel: [[8, 2]] }),
  Object.freeze({ sec: 'F', ch: C.C7b9, mel: [[0, 3]] }),
  Object.freeze({ sec: 'F', ch: C.Fm7, mel: [[8, 0]] }),
  Object.freeze({ sec: 'G', ch: C.Bbm7, mel: [[0, 2]] }),
  Object.freeze({ sec: 'G', ch: C.Eb7, mel: [[8, 1]] }),
  Object.freeze({ sec: 'G', ch: C.Abmaj7, mel: [[0, 3]] }),
  Object.freeze({ sec: 'G', ch: C.C7b9, mel: [[8, 2]] }),
]);

export const BPM = 66; // slower than instinct, per the Song-Structure Law
export const CLOSING_BPM = 54; // slower still: the building is empty
export const STEPS_PER_BAR = 16;
export const LOBBY_STEPS = FORM.length * STEPS_PER_BAR; // 512 steps ~= 116 s a cycle
export const CLOSING_STEPS = CLOSING_FORM.length * STEPS_PER_BAR;

// Complete Performance-Pass posture. Timing is one-sided: the band may lean late, never
// early. Swing is slight because this is hold music, not a shuffle. Percussion and bass keep
// exact time; pad tails are declared on top of the authored 0.9s release.
export const SCORE_PERFORMANCE = Object.freeze({
  humanize: Object.freeze({ timingMs: Object.freeze([0, 8]), velocity: Object.freeze([-0.05, 0.05]), swing: 0.05 }),
  releaseTail: 0.35,
  voices: Object.freeze({
    pad: Object.freeze({ releaseTail: 0.55 }),
    drone: Object.freeze({ releaseTail: 0 }),
    bass: Object.freeze({ humanize: Object.freeze({ timingMs: Object.freeze([0, 0]), swing: 0 }) }),
    kick: Object.freeze({ humanize: Object.freeze({ timingMs: Object.freeze([0, 0]), swing: 0 }) }),
    snare: Object.freeze({ humanize: Object.freeze({ timingMs: Object.freeze([0, 0]), swing: 0 }) }),
    hat: Object.freeze({ humanize: Object.freeze({ timingMs: Object.freeze([0, 0]), swing: 0 }) }),
  }),
});

// The register the vibraphone melody is snapped into, and the bass's own.
const MEL_LO = midi('G4');
const MEL_HI = midi('A5');

// ---- the walking bass ---------------------------------------------------------------------------
// A patient walking bass is four quarter notes a bar: the root, two chord tones, and a CHROMATIC
// APPROACH to the next bar's root. That approach note is what makes the root motion audible as
// motion — it is the single clearest way a listener hears that the harmony is going somewhere,
// which is exactly the property this score is required to have.
//
// THE BASS LINE IS VOICE-LED, AND HAD TO BE. The first version snapped each root independently into
// a fixed one-octave window. Every pitch class came out correct — a chroma analysis of the render
// passed at 100% — and THE MEZZANINE's chromatic descent was still not audible as a descent,
// because a fixed window wraps: the line fell G, Gb, F, E and then leapt an octave upward to
// continue "descending". Pitch-class correctness is not melodic correctness, and only the second
// one is what a listener hears.
//
// So the octave of every bar's bass root is chosen ONCE, ahead of time, by walking the form and
// picking the octave nearest the previous bar's root. Ties fall downward, and the line is held
// inside a real bass register. An eight-bar semitone descent then descends, because it never needs
// to wrap.

// The real register of the instrument: E1 (the low string) to D3. An earlier, narrower window
// (C1 to A2) forced an eight-semitone drop in the closing cue, because the C the line wanted to
// rise to sat above its ceiling and the only C's available were far below. A range too small for
// the music is indistinguishable, in the output, from a line that leaps for no reason.
const BASS_FLOOR = midi('E1');
const BASS_CEIL = midi('D3');

function nearestOctave(target, previous) {
  let best = target;
  let bestDist = Infinity;
  for (let n = target - 48; n <= target + 48; n += 12) {
    if (n < BASS_FLOOR || n > BASS_CEIL) continue;
    // Bias downward on a tie: a bass player resolves an ambiguity by going low.
    const dist = Math.abs(n - previous) + (n > previous ? 0.5 : 0);
    if (dist < bestDist) {
      bestDist = dist;
      best = n;
    }
  }
  return best;
}

/** Choose the octave of every bar's bass root across a whole form, as one connected line. */
export function bassLine(form) {
  const out = [];
  let prev = snap(form[0].ch.root, BASS_FLOOR, BASS_CEIL);
  for (const bar of form) {
    const n = out.length === 0 ? prev : nearestOctave(bar.ch.root, prev);
    out.push(n);
    prev = n;
  }
  return out;
}

export const LOBBY_BASS = Object.freeze(bassLine(FORM));
export const CLOSING_BASS = Object.freeze(bassLine(CLOSING_FORM));

// walkNotes: the four quarter notes of one bar. `root` and `target` are the precomputed, voice-led
// roots of this bar and the next, so the approach note genuinely approaches the note that is about
// to be played rather than some other octave of it.
function walkNotes(chord, root, target, sour, alt) {
  const v = voicing(chord, sour);
  const rel = (iv) => {
    // Place a chord tone just above the root, in the same octave-relative position every time.
    let n = root + ((((v[iv] - v[0]) % 12) + 12) % 12);
    while (n > BASS_CEIL + 7) n -= 12;
    return n;
  };
  const third = rel(1);
  const fifth = rel(2);
  // Approach the next root by a semitone, from whichever side is nearer, so the line stays smooth
  // instead of leaping to reach its approach note. Alternating by pass keeps it from being memorised.
  const from = alt ? 1 : -1;
  const approach = target + (Math.abs(target + from - fifth) <= Math.abs(target - from - fifth) ? from : -from);
  return alt ? [root, fifth, third, approach] : [root, third, fifth, approach];
}

// ---- the tracks ---------------------------------------------------------------------------------

// Build one step function over a form. Shared by the lobby and the closing cue so both get the same
// treatment of harmony, souring and per-pass variation.
function makeStepper(form, totalSteps, opts = {}) {
  const { desk = true, brushBase = 1, padVol = 0.075 } = opts;
  // The voice-led bass roots for this form, computed once rather than per step.
  const bassRoots = opts.bass || bassLine(form);

  return function step(i, t, s) {
    const bar = (i / STEPS_PER_BAR) | 0;
    const inBar = i % STEPS_PER_BAR;
    const beat = (inBar / 4) | 0;
    const sub = inBar % 4;
    const pass = Math.floor(s.n / totalSteps);
    const alt = pass % 2; // per-pass variation: no two consecutive passes are identical
    const p = s.params || {};
    const sour = clamp01(p.sour === undefined ? 0 : p.sour);
    const pressure = clamp01(p.pressure === undefined ? 0 : p.pressure);

    const def = form[bar];
    if (!def) return;
    const sec = SECTIONS[def.sec] || SECTIONS.A;
    const next = form[(bar + 1) % form.length];
    const v = voicing(def.ch, sour);
    const secBpm = opts.bpm || BPM;
    const beatSec = 60 / secBpm;
    const barSec = beatSec * 4;

    // The lights dim as the picture sours: one filter figure the whole ensemble shares, so the
    // curdle reads as the room going wrong rather than as one instrument misbehaving.
    const dim = 1 - sour * 0.45;

    // --- the fluorescent hum -------------------------------------------------------------------
    // A PEDAL: a fixed low F under every chord, indifferent to the harmony above it. That is the
    // joke made audible — under Db7 and Ebmaj7 it rubs, and it never moves to accommodate them.
    // `beat` gives it the slow acoustic beating that makes a hum read as a hum rather than a note.
    if (inBar === 0 && bar % 8 === 0) {
      s.v.drone(t, hz(midi('F1')), barSec * 8, {
        vol: 0.05 + sour * 0.035 + pressure * 0.02,
        beat: 6 + sour * 9,
        cut: 320 * dim,
        a: 2.5,
        d: 3,
        s: 0.85,
        r: 3,
        verb: 0.05,
      });
    }

    // --- the harmonic bed ----------------------------------------------------------------------
    // The pad states the chord on the downbeat of every bar. This is the layer that carries the
    // progression, so it plays in every section without exception: the harmony is never the thing
    // that drops out.
    if (inBar === 0) {
      for (let k = 0; k < v.length; k++) {
        const n = snap(v[k], midi('E3'), midi('E4') + 6);
        s.v.pad(t, hz(n), barSec * 0.92, {
          vol: padVol * (k === 0 ? 1 : 0.72),
          cut: (1500 + k * 120) * dim,
          sweep: 1.05,
          det: 3 + sour * 9, // the ensemble drifts out of tune as it sours
          a: 0.5,
          d: 0.9,
          s: 0.6,
          r: 0.9,
          verb: 0.16,
        });
      }
    }

    // --- the walking bass ------------------------------------------------------------------------
    if (sec.bass === 'walk' && sub === 0) {
      const notes = walkNotes(def.ch, bassRoots[bar], bassRoots[(bar + 1) % form.length], sour, alt);
      s.v.bass(t, hz(notes[beat]), beatSec * 0.82, {
        vol: 0.085,
        cut: 420 * dim,
        q: 1.1,
        wave: 'sawtooth',
        a: 0.012,
        dScale: 0.5,
        s: 0.4,
        r: 0.14,
        verb: 0.04,
      });
    } else if (sec.bass === 'half' && sub === 0 && (beat === 0 || beat === 2)) {
      const notes = walkNotes(def.ch, bassRoots[bar], bassRoots[(bar + 1) % form.length], sour, alt);
      s.v.bass(t, hz(notes[beat === 0 ? 0 : 2]), beatSec * 1.7, {
        vol: 0.08,
        cut: 380 * dim,
        q: 1.0,
        a: 0.02,
        dScale: 0.6,
        s: 0.45,
        r: 0.3,
        verb: 0.05,
      });
    }

    // --- the electric piano, comping -------------------------------------------------------------
    // Syncopated stabs off the beat, which is what makes a lounge trio sound like a trio rather than
    // like a hymn. The placement moves with the pass so the comping is not a loop the ear memorises.
    if (sec.comp !== 'none') {
      const full = sec.comp === 'full';
      const hits = full ? (alt ? [6, 14] : [6, 10]) : alt ? [10] : [6];
      if (hits.indexOf(inBar) !== -1) {
        for (let k = 1; k < v.length; k++) {
          const n = snap(v[k], midi('F3'), midi('F4') + 4);
          s.v.pluck(t, hz(n), beatSec * 0.5, {
            vol: 0.05,
            cut: (2200 - sour * 700) * dim,
            wave: 'triangle',
            a: 0.004,
            dScale: 0.5,
            s: 0.06,
            r: 0.2,
            holdScale: 0.4,
            verb: 0.13,
          });
        }
      }
    }

    // --- the vibraphone ---------------------------------------------------------------------------
    // The melody is written as CHORD-TONE INDICES, not absolute pitches, so it follows the voicing
    // automatically and sours with it: when the harmony curdles the tune curdles with it, in the
    // same motion, which is what "the same ensemble souring" has to mean.
    for (const [at, tone] of def.mel) {
      const shifted = alt && sec.bell === 'tune' ? (at + 2) % STEPS_PER_BAR : at;
      if (inBar !== shifted) continue;
      const n = snap(v[tone % v.length] + (alt ? 12 : 0), MEL_LO, MEL_HI);
      s.v.bell(t, hz(n), beatSec * 2.2, {
        vol: 0.055,
        // Vibraphone: a strong fourth partial and a faint eighth. As it sours the partials go
        // inharmonic, which is how a tuned bar starts sounding like a struck pipe.
        ratios: [1, 4 + sour * 0.35, 8 + sour * 0.9],
        levels: [1, 0.3, 0.09],
        a: 0.006,
        dScale: 0.55,
        s: 0.02,
        r: 0.9,
        holdScale: 0.3,
        verb: 0.24,
      });
    }

    // --- the muzak lead ---------------------------------------------------------------------------
    if (sec.lead && inBar === (alt ? 12 : 4)) {
      const n = snap(v[(bar + 2) % v.length], MEL_LO - 5, MEL_HI - 7);
      s.v.lead(t, hz(n), beatSec * 1.6, {
        vol: 0.032,
        cut: 1900 * dim,
        wave: 'triangle',
        vibrato: 4.2,
        vibratoDepth: 0.004,
        a: 0.18,
        d: 0.4,
        s: 0.55,
        r: 0.5,
        verb: 0.2,
      });
    }

    // --- brushed percussion -----------------------------------------------------------------------
    // Brushes, not a kit: the hat voice run soft and low-ish so it reads as wire on a head. It
    // thins as the picture sours, because the band gets less sure of itself.
    if (sec.brush === 'eighths' && sub % 2 === 0) {
      const accent = sub === 0 && (beat === 1 || beat === 3);
      s.v.hat(t, {
        hp: 5200 + (alt ? 400 : 0),
        dur: accent ? 0.075 : 0.045,
        vol: (accent ? 0.02 : 0.012) * brushBase * (1 - sour * 0.35),
        verb: 0.1,
      });
    } else if (sec.brush === 'half' && sub === 0 && beat % 2 === 1) {
      s.v.hat(t, { hp: 4800, dur: 0.09, vol: 0.015 * brushBase * (1 - sour * 0.35), verb: 0.12 });
    }

    // --- the desk --------------------------------------------------------------------------------
    // The percussion of the office itself: date stamps and typewriter strikes, landing ON the beat
    // as §10 asks. These are the only voices that get BUSIER as things go wrong, because the
    // paperwork does.
    if (desk) {
      // The date stamp: a short heavy thud on the first beat of the section's odd bars. A stamp is
      // an inked block hitting a desk, so it is pitched, brief and dead.
      if (inBar === 0 && bar % 4 === (alt ? 2 : 0)) {
        s.v.kick(t, { f0: 165, f1: 62, dur: 0.16, vol: 0.115 });
        s.v.snare(t + 0.012, { bp: 2600, q: 1.6, dur: 0.055, vol: 0.035, verb: 0.1 });
      }
      // Typewriter strikes: bursts of three or four, on and just after a beat, then nothing. Typing
      // is not a rhythm, it is a flurry and a pause. More of it as the pressure rises.
      const typing = 0.3 + pressure * 0.5 + sour * 0.2;
      if (sub === 0 || sub === 2) {
        if (s.rand(bar * 4 + beat) < typing * 0.5) {
          const strikes = 2 + ((s.rand(bar * 8 + inBar) * 3) | 0);
          for (let k = 0; k < strikes; k++) {
            s.v.hat(t + k * 0.055 + s.rand(k + inBar) * 0.012, {
              hp: 7600,
              dur: 0.016,
              vol: 0.02 + pressure * 0.012,
              verb: 0.05,
            });
          }
        }
      }
    }
  };
}

// ---- registration ---------------------------------------------------------------------------------

export const TRACKS = Object.freeze(['lobby', 'closed']);

/** setScene(HOLD) means "whatever is playing, keep playing" — an overlay must not cut the bed. */
export const HOLD = 'hold';

export function registerScore(band) {
  band.registerTrack('lobby', {
    bpm: BPM,
    len: LOBBY_STEPS,
    vol: 0.8,
    step: makeStepper(FORM, LOBBY_STEPS, { bpm: BPM, desk: true, brushBase: 1, padVol: 0.075, bass: LOBBY_BASS }),
  });
  band.registerTrack('closed', {
    bpm: CLOSING_BPM,
    len: CLOSING_STEPS,
    vol: 0.7,
    step: makeStepper(CLOSING_FORM, CLOSING_STEPS, { bpm: CLOSING_BPM, desk: false, brushBase: 0, padVol: 0.085, bass: CLOSING_BASS }),
  });
  return band;
}

/** Create a band with this game's score already registered. */
export function createScoredBand(o = {}) {
  const { performance = SCORE_PERFORMANCE, ...rest } = o;
  return registerScore(createBand({ ...rest, performance }));
}

// ---- the game's state, as music ---------------------------------------------------------------------

/**
 * sceneFor(view) -> a track id, or HOLD.
 *
 * Overlays HOLD: the checklist, the pause surface and the orientation packet are documents laid on
 * the desk, not another room, so the bed keeps playing under them. Only a closed tenure changes the
 * music, because only a closed tenure changes the building.
 */
export function sceneFor(view) {
  if (!view || !view.facility) return 'lobby';
  if (view.facility.status !== 'active') return 'closed';
  return 'lobby';
}

/**
 * paramsFor(view) -> { sour, pressure }.
 *
 * SOUR is the facility's standing condition, not an event flag: the Cornerstone's damage, served
 * instruments left unanswered, a grieving crew, an overdrawn treasury. The music therefore curdles
 * ACROSS a tenure rather than only during a raid, which is the register — the lobby keeps insisting
 * everything is fine, slightly less convincingly each cycle. An incident pins it to its ceiling
 * while it is on screen.
 *
 * PRESSURE is the raid replay's proximity to the Cornerstone: the desk's typing gets busier as the
 * party gets closer. It is presentation-derived and never feeds back into the sim.
 */
export function paramsFor(view) {
  if (!view || !view.facility) return { sour: 0, pressure: 0 };
  const f = view.facility;
  const damage = 1 - clamp01(f.lossObject.condition / 100);
  const served = (f.notices || []).filter((n) => n.status === 'served').length;
  const crew = (f.staff || []).filter((s) => s.status !== 'gone');
  const grieving = crew.length ? crew.filter((s) => s.status === 'grieving').length / crew.length : 0;
  const broke = f.treasury.gold < 0 ? 1 : f.treasury.gold < 60 ? 0.4 : 0;

  let sour = clamp01(damage * 0.5 + Math.min(served, 2) * 0.18 + grieving * 0.2 + broke * 0.2);

  let pressure = 0;
  if (view.overlay === 'raid' && view.replay) {
    const steps = view.replay.steps || [];
    const n = Math.max(1, steps.length - 1);
    pressure = clamp01(Math.min(view.replay.cursor, n) / n);
    sour = Math.max(sour, 0.55 + pressure * 0.45);
  }
  if (f.status !== 'active') sour = Math.max(sour, 0.8);

  return { sour, pressure };
}
