// score.js — THE HOUSE BAND'S POPINJAY REGISTER (hard rule 10). Fairground
// ragtime/oompah composed on the portable band kit: brisk 2/4 two-steps with
// tuba-pattern downbeats and bright cornet leads, a courteous waltz for the draft
// and the scorecard, and an accelerating galop for past-par pressure and the Panic
// Finale. Zero audio files — every note is a synthesised voice (hard rule 10).
//
// SONG-STRUCTURE LAW. Every track here is a MULTI-STRAIN form, because that is what
// a two-step, a rag and a galop actually are: the band plays a first strain, then a
// SECOND strain that moves somewhere else harmonically and sings a different figure,
// then turns back. `strainAt` maps the absolute step count onto that plan (AABB —
// `bars` loop-passes of A, then `bars` of B, forever). A track that cycles one cell
// forever is a defect, not a loop.
//
// PERFORMANCE PASS. A fairground band is people, not a sequencer: melodic and
// chordal voices lean a hair late and no two hits land at exactly the same weight.
// The canonical kit applies the declared SCORE_PERFORMANCE from its own seeded PRNG.
// The tuba and percussion keep exact time, while retaining a modest velocity lift.
//
// Everything here is PURE: the track defs are data + a step(i, t, s) that only calls
// the passed voices (s.v) at the passed time (t); the SFX map only fires voices on a
// band. Nothing reads a wall clock or a sim stream — the band keeps its OWN seeded
// PRNG, and every gameplay window stays TICK-denominated, so audio never perturbs the
// sim (DESIGN-SEED audio-sim isolation). That purity also makes the whole register
// node-testable without a browser (the beat-grid probe drives step() by hand).

import { noteFreq, chord } from './band.js';

// Popinjay's complete Performance-Pass posture. Timing is deliberately one-sided:
// the band may lean behind the beat but never anticipate it. Swing is slight because
// these are crisp fairground two-steps rather than a modern shuffle. Pad/drone tails
// are declared for any future harmonic-bed use; today's score voices its chords on
// pluck, whose longer releases remain authored in the note options below.
export const SCORE_PERFORMANCE = Object.freeze({
  humanize: Object.freeze({ timingMs: Object.freeze([0, 6]), velocity: Object.freeze([-0.04, 0.04]), swing: 0.04 }),
  releaseTail: 0.25,
  voices: Object.freeze({
    // Chords own their seeded hand drag + ordered string spread below. Keeping
    // generic pluck timing neutral makes that ascending order a hard guarantee.
    pluck: Object.freeze({ humanize: Object.freeze({ timingMs: Object.freeze([0, 0]), swing: 0 }) }),
    bass: Object.freeze({ humanize: Object.freeze({ timingMs: Object.freeze([0, 0]), swing: 0 }) }),
    snare: Object.freeze({ humanize: Object.freeze({ timingMs: Object.freeze([0, 0]), swing: 0 }) }),
    hat: Object.freeze({ humanize: Object.freeze({ timingMs: Object.freeze([0, 0]), swing: 0 }) }),
  }),
});

// A fairground key — bright major. The stage two-step walks a I–IV–V–I over its loop;
// the second strains walk further afield, so the tuba needs a few more roots.
const OOM = {
  C2: noteFreq('C2'), G2: noteFreq('G2'), F2: noteFreq('F2'),
  Bb2: noteFreq('Bb2'), A2: noteFreq('A2'), D2: noteFreq('D2'),
  // The galop's B strain walks DOWN, so its line starts an octave up — a tuba walks
  // a descending tetrachord in its middle, not by falling off the bottom of itself.
  C3: noteFreq('C3'),
};
const CHORDS = {
  I:  chord(['C4', 'E4', 'G4']),
  IV: chord(['C4', 'F4', 'A4']),
  V:  chord(['B3', 'D4', 'G4']),
  // --- second-strain colours -------------------------------------------------
  bVII: chord(['Bb3', 'D4', 'F4']),   // Bb — the title trio's own subdominant
  V7t:  chord(['Bb3', 'C4', 'E4']),   // C7 — the dominant OF the trio's F
  vi:   chord(['A3', 'C4', 'E4']),    // Am — the minor turn
  II7:  chord(['D4', 'F#4', 'C5']),   // D7 — secondary dominant, pulls to G
  V7:   chord(['B3', 'D4', 'F4']),    // G7 — sends the rag strain home
  ii:   chord(['D4', 'F4', 'A4']),    // Dm — the waltz trio's step down
};
// A jaunty cornet phrase (scale degrees over the two-step), read by the bar.
const CORNET = [
  noteFreq('G4'), noteFreq('E4'), noteFreq('C5'), noteFreq('G4'),
  noteFreq('A4'), noteFreq('F4'), noteFreq('A4'), noteFreq('C5'),
];
// The title's TRIO figure — the B strain sits in F (the subdominant), the march and
// rag convention, and sings longer, calmer notes than the A strain's arpeggio.
const TRIO = chord(['A4', 'C5', 'A4', 'F4', 'G4', 'Bb4', 'A4', 'F4']);
// The stage's RAG figure — a syncopated line for the B strain, carrying the D7's F#
// as the strain's colour tone.
const RAG = chord(['A4', 'C5', 'B4', 'D5', 'C5', 'A4', 'F#4', 'B4']);
// Where the rag figure falls: the secondary-rag grouping 3+3+3+3+2+2 across the bar,
// which is a completely different placement from the A strain's even upbeats.
const RAG_STEPS = { 0: 0, 3: 1, 6: 2, 9: 3, 12: 4, 14: 5 };
// The waltz's gentle melody (3/4, one note per beat-ish).
const WALTZ_MEL = [noteFreq('E5'), noteFreq('G4'), noteFreq('C5'), noteFreq('D5'), noteFreq('B4'), noteFreq('G4')];
// The waltz's TRIO — one note per beat across four bars (vi–ii–V–I), so it flows
// where the A strain lilts and pauses.
const WALTZ_B = chord(['A4', 'C5', 'E5', 'F5', 'D5', 'A4', 'B4', 'D5', 'B4', 'C5', 'B4', 'G4']);
// The galop's chase figure — the B strain's cornet, doubled in rate against A's.
const GALOP_B = chord(['C5', 'B4', 'A4', 'G4', 'A4', 'B4', 'C5', 'D5']);

// ---------------------------------------------------------------------------
// STRAIN SCHEDULING. `n` is the band's absolute step count (never wraps), `len` the
// loop length in steps, `bars` how many loop-passes one strain holds. Returns which
// strain is playing (0 = A, 1 = B) and which bar OF that strain. Pure — the beat-grid
// probe drives it by hand.
// ---------------------------------------------------------------------------
export function strainAt(n, len, bars = 2) {
  const pass = ((n / len) | 0);
  return { pass, strain: ((pass / bars) | 0) & 1, bar: pass % bars };
}

// One deterministic drag moves the player's hand; then strings sound strictly low
// to high. The caller chooses a 2–5 ms spread to suit the cue. The kit still owns
// velocity humanization, but SCORE_PERFORMANCE leaves pluck timing untouched so it
// cannot weaken or reverse this ordering.
const RND = (s, salt) => (s && typeof s.rand === 'function' ? s.rand(salt) : 0.5);
function strum(s, v, t, notes, dur, o, salt = 3, spread = 0.0035) {
  const handDrag = RND(s, salt) * 0.005;
  for (let string = 0; string < notes.length; string++) {
    v(t + handDrag + string * spread, notes[string], dur, o);
  }
}

// The four tracks. bpm sets the step (a sixteenth); len is one loop in steps.
export const TRACKS = {
  // TITLE — a warm, unhurried entry two-step (soft, welcoming the fair). AABB with
  // two-bar strains: A settles on the tonic, B is the TRIO — it steps down to F, the
  // subdominant, the way a march or a rag does, and sings a calmer, longer figure.
  title: {
    bpm: 104, len: 16, vol: 0.62,
    step(i, t, s) {
      const { strain, bar } = strainAt(s.n, 16, 2);
      const cell = (bar << 1) | (i >> 3); // four half-bar cells across the strain
      if (strain === 0) {
        // --- A: the welcome. I – I – IV – V, tuba alternating tonic and dominant.
        const prog = [CHORDS.I, CHORDS.I, CHORDS.IV, CHORDS.V][cell];
        if (i === 0 || i === 8) s.v.bass(t, i === 0 ? OOM.C2 : OOM.G2, 0.22, { vol: 0.5, cut: 700 });
        if (i === 4 || i === 12) strum(s, s.v.pluck, t, prog, 0.2, { vol: 0.16, wave: 'triangle', r: 0.55 });
        if (i === 2 || i === 10) s.v.lead(t, CORNET[(s.n >> 1) % CORNET.length], 0.3, { vol: 0.14, wave: 'triangle', r: 0.5 });
        if (i === 14) s.v.bell(t, noteFreq('C6'), 0.4, { vol: 0.06 });
      } else {
        // --- B (the trio): F – Bb – C7 – F, a whole strain away from home. The tuba
        // answers itself late in the bar instead of on 3, so the trio LILTS where the
        // A strain marched, and a bell opens the strain instead of closing it.
        const prog = [CHORDS.IV, CHORDS.bVII, CHORDS.V7t, CHORDS.IV][cell];
        const root = [OOM.F2, OOM.Bb2, OOM.C2, OOM.F2][cell];
        if (i === 0) s.v.bass(t, root, 0.26, { vol: 0.46, cut: 660 });
        if (i === 10) s.v.bass(t, root, 0.2, { vol: 0.34, cut: 640 });
        if (i === 4 || i === 12) strum(s, s.v.pluck, t, prog, 0.24, { vol: 0.15, wave: 'triangle', r: 0.6 });
        if (i === 2 || i === 6 || i === 12) s.v.lead(t, TRIO[((bar << 2) + (i >> 2)) % TRIO.length], 0.34, { vol: 0.13, wave: 'triangle', r: 0.55 });
        if (i === 0 && bar === 0) s.v.bell(t, noteFreq('F5'), 0.5, { vol: 0.05 });
      }
    },
  },
  // STAGE — the brisk 2/4 two-step: tuba OOM on the beats, banjo PAH on the offbeats,
  // a cornet lead, a light ragtime backbeat. The engine of the fairground. Four bars
  // of A (I–IV–V–I), then four of B — the RAG strain, which circles home the long way
  // round (vi–II7–V–V7) under a syncopated figure.
  stage: {
    bpm: 132, len: 16, vol: 0.7,
    step(i, t, s) {
      const { strain, bar } = strainAt(s.n, 16, 4);
      if (i % 4 === 0) s.v.hat(t, { vol: 0.05 });
      if (i === 8) s.v.snare(t, { vol: 0.09 });                         // backbeat
      if (strain === 0) {
        const prog = [CHORDS.I, CHORDS.IV, CHORDS.V, CHORDS.I][bar];
        const root = [OOM.C2, OOM.F2, OOM.G2, OOM.C2][bar];
        if (i === 0 || i === 8) s.v.bass(t, root, 0.2, { vol: 0.5, cut: 780 });          // OOM
        if (i === 4 || i === 12) strum(s, s.v.pluck, t, prog, 0.16, { vol: 0.17, wave: 'triangle', r: 0.42 }, 2); // PAH
        if (i === 2 || i === 6 || i === 10 || i === 14) s.v.lead(t, CORNET[(s.n >> 1) % CORNET.length], 0.22, { vol: 0.15, wave: 'square' });
      } else {
        // --- B (the rag): Am – D7 – G – G7. The minor turn and the secondary dominant
        // are what make it a second strain and not a louder first one; the cornet moves
        // off the even upbeats onto the 3+3+3+3+2+2 rag grouping, and a second snare
        // lifts the band over the barline.
        const prog = [CHORDS.vi, CHORDS.II7, CHORDS.V, CHORDS.V7][bar];
        const root = [OOM.A2, OOM.D2, OOM.G2, OOM.G2][bar];
        if (i === 0 || i === 8) s.v.bass(t, root, 0.2, { vol: 0.5, cut: 780 });
        if (i === 4 || i === 12) strum(s, s.v.pluck, t, prog, 0.18, { vol: 0.17, wave: 'triangle', r: 0.46 }, 2);
        if (i === 14) s.v.snare(t, { vol: 0.07 });
        if (RAG_STEPS[i] !== undefined) s.v.lead(t, RAG[(bar * 6 + RAG_STEPS[i]) % RAG.length], 0.2, { vol: 0.15, wave: 'square' });
      }
    },
  },
  // DRAFT / SCORECARD — a courteous waltz (3/4): a low root on 1, chord on 2 and 3,
  // a wistful cornet line. Untimed screens, so it breathes. Four bars of A, then its
  // own trio: the bass leaves the tonic and walks vi–ii–V–I while the melody stops
  // lilting and flows, one note per beat.
  waltz: {
    bpm: 120, len: 12, vol: 0.6, // 12 sixteenths = 4 groups; treat as a lilting 3
    step(i, t, s) {
      const { strain, bar } = strainAt(s.n, 12, 4);
      if (strain === 0) {
        const prog = [CHORDS.I, CHORDS.V, CHORDS.IV, CHORDS.I][bar];
        if (i === 0) s.v.bass(t, OOM.C2, 0.28, { vol: 0.4, cut: 620 });
        if (i === 4 || i === 8) strum(s, s.v.pluck, t, prog, 0.24, { vol: 0.12, wave: 'triangle', r: 0.7 }, 3, 0.005);
        if (i === 0 || i === 6) s.v.lead(t, WALTZ_MEL[(s.n / 6 | 0) % WALTZ_MEL.length], 0.42, { vol: 0.12, wave: 'triangle', r: 0.8 });
      } else {
        // --- B (the trio): Am – Dm – G – C. The root moves every bar where the A
        // strain sat on C throughout, and the line runs on all three beats.
        const prog = [CHORDS.vi, CHORDS.ii, CHORDS.V, CHORDS.I][bar];
        const root = [OOM.A2, OOM.D2, OOM.G2, OOM.C2][bar];
        if (i === 0) s.v.bass(t, root, 0.3, { vol: 0.38, cut: 600 });
        if (i === 4 || i === 8) strum(s, s.v.pluck, t, prog, 0.26, { vol: 0.115, wave: 'triangle', r: 0.75 }, 3, 0.005);
        if (i === 0 || i === 4 || i === 8) s.v.lead(t, WALTZ_B[(bar * 3 + (i >> 2)) % WALTZ_B.length], 0.36, { vol: 0.115, wave: 'triangle', r: 0.8 });
        if (i === 8 && bar === 3) s.v.bell(t, noteFreq('C6'), 0.5, { vol: 0.05 }); // the turn back
      }
    },
  },
  // PANIC — the accelerating galop: driving eighth-note tuba, a snare on every beat,
  // stabs that intensify with s.params.heat (0..1, the finale clock). It never changes
  // tempo mid-track (that would restart the loop); heat adds density + lifts the octave.
  // Four bars of A (I–V–IV–V, planted), then four of B: the bass walks a descending
  // tetrachord C–Bb–A–G and the cornet doubles into a chase. Heat still rides on top of
  // both strains, so the structure and the pressure are independent.
  panic: {
    bpm: 152, len: 16, vol: 0.72,
    step(i, t, s) {
      const heat = Math.max(0, Math.min(1, (s.params && s.params.heat) || 0));
      const { strain, bar } = strainAt(s.n, 16, 4);
      const prog = strain === 0
        ? [CHORDS.I, CHORDS.V, CHORDS.IV, CHORDS.V][bar]
        : [CHORDS.I, CHORDS.bVII, CHORDS.vi, CHORDS.V][bar];
      const root = strain === 0
        ? [OOM.C2, OOM.G2, OOM.F2, OOM.G2][bar]
        : [OOM.C3, OOM.Bb2, OOM.A2, OOM.G2][bar];
      if (i % 4 === 0) s.v.bass(t, root, 0.14, { vol: 0.46, cut: 900 });   // driving beat
      if (heat > 0.4 && i % 4 === 2) s.v.bass(t, root * 2, 0.1, { vol: 0.3, cut: 1100 });     // offbeat push
      if (i % 4 === 0) s.v.snare(t, { vol: 0.11 });
      if (heat > 0.7 && i % 2 === 1) s.v.hat(t, { vol: 0.05 });
      if (i % 8 === 0) strum(s, s.v.pluck, t, prog, 0.12, { vol: 0.14, wave: 'square', r: 0.3 }, 2, 0.002);
      if (strain === 0) {
        if (i === 4 || i === 12) s.v.lead(t, CORNET[(s.n >> 1) % CORNET.length] * (heat > 0.6 ? 2 : 1), 0.16, { vol: 0.14 + heat * 0.05, wave: 'square' });
      } else {
        if (i % 4 === 2) s.v.lead(t, GALOP_B[(bar * 4 + (i >> 2)) % GALOP_B.length] * (heat > 0.6 ? 2 : 1), 0.13, { vol: 0.13 + heat * 0.05, wave: 'square' });
        if (i === 14) s.v.snare(t, { vol: 0.08 }); // the galop's lift
      }
    },
  },
};

// Which track a game mode wants. PLAYING picks stage vs panic by the world's mode.
export function trackForMode(mode, world) {
  if (mode === 'title' || mode === 'trunk') return 'title';
  if (mode === 'draft' || mode === 'tourmap') return 'waltz';
  if (mode === 'scorecard') return 'waltz';
  if (mode === 'playing' || mode === 'rehearsal') {
    if (world && world.stage && world.stage.meta && (world.stage.meta.finale || world.stage.meta.endless)) return 'panic';
    if (world && world.tick > world.parTicks) return 'panic'; // past par → the galop
    return 'stage';
  }
  return 'title';
}

export function registerTracks(band) {
  for (const name of Object.keys(TRACKS)) band.registerTrack(name, TRACKS[name]);
  return band;
}

// Quantize a fire time to the band's step grid so pops/chains "land ON the beat where
// cheap" (a brass stab on the beat). Pure — the beat-grid probe asserts the snap.
export function quantizeToBeat(now, bpm) {
  const spb = 60 / bpm / 4;
  return Math.ceil(now / spb - 1e-9) * spb;
}

// SFX — a sim EVENT to a synthesised one-shot on the band's voices. Called by the app
// as it drains the event queue; never touches sim state. `now` is ctx.currentTime.
// Pops/chains climb a brass stab; the denied fire is a polite muted click (wire law).
const POP_ROOT = { grand: 'C4', parade: 'E4', fair: 'G4', penny: 'C5' };
export function sfxFor(ev, band, now, quantized = now) {
  const v = band.voices;
  switch (ev.type) {
    case 'pop': {
      const base = noteFreq(POP_ROOT[ev.cls] || 'G4');
      const chain = Math.max(1, ev.chain || 1);
      const semis = Math.min(chain - 1, 6); // the stab climbs the chain
      v.pluck(quantized, base * Math.pow(2, semis / 12), 0.16, { vol: 0.2 + Math.min(chain, 5) * 0.02, wave: 'square' });
      if (chain >= 3) v.bell(quantized, base * 2, 0.24, { vol: 0.08 }); // a bright topping on a big chain
      break;
    }
    case 'cascadeSplit': v.pluck(quantized, noteFreq('A4'), 0.1, { vol: 0.12, wave: 'square' }); break;
    case 'cleared': case 'finaleWin': {
      const flourish = chord(['C4', 'E4', 'G4', 'C5']);
      flourish.forEach((f, k) => v.lead(now + k * 0.06, f, 0.3, { vol: 0.16, wave: 'triangle' }));
      break;
    }
    case 'hit': v.bass(now, noteFreq('F2'), 0.18, { vol: 0.34, cut: 500 }); break;
    case 'dead': v.bass(now, noteFreq('C2'), 0.5, { vol: 0.4, cut: 380, glide: noteFreq('G1') }); break;
    case 'encore': v.bell(now, noteFreq('E6'), 0.5, { vol: 0.12 }); break;
    case 'denied': v.hat(now, { vol: 0.06 }); break;                       // the polite click
    case 'fire': v.hat(now, { vol: 0.03 }); break;
    case 'sidearm': v.pluck(now, noteFreq('E5'), 0.06, { vol: 0.12, wave: 'square' }); break;
    case 'break': v.snare(now, { vol: 0.08 }); break;
    case 'pickup': v.bell(now, noteFreq('G5'), 0.3, { vol: 0.1 }); break;
    case 'shieldBreak': v.bell(now, noteFreq('D5'), 0.24, { vol: 0.1 }); break;
    case 'dynamiteBoom': { v.bass(now, noteFreq('C2'), 0.3, { vol: 0.4, cut: 700 }); v.snare(now, { vol: 0.14 }); break; }
    case 'tuba': v.bass(now, noteFreq('G2'), 0.3, { vol: 0.4, cut: 900, glide: noteFreq('G3') }); break;
    default: return false;
  }
  return true;
}

// The set of event types that carry an SFX (so the app can skip the rest cheaply).
export const SFX_EVENTS = new Set(['pop', 'cascadeSplit', 'cleared', 'finaleWin', 'hit', 'dead',
  'encore', 'denied', 'fire', 'sidearm', 'break', 'pickup', 'shieldBreak', 'dynamiteBoom', 'tuba']);
