// SHOELEATHER — the HOUSE BAND (code-composed score model; DESIGN-SEED register law).
//
// "NOT clean jazz pastiche: swung tempo with harmonic ambiguity, dropped 3rds, bass
// dragging behind the snare — the music shuffles, hesitates, resolves late. Worn tape
// surface over period instrumentation (upright bass, brushed kit, wah stabs,
// flute/vibes)."
//
// This is the pure, node-testable COMPOSITION: it emits a timed event list (the score)
// that the WebAudio player schedules. The register laws are encoded here as data:
//   - SWING: offbeats delayed toward a triplet feel.
//   - DROPPED 3rds: chord voicings omit or flatten the 3rd -> harmonic ambiguity.
//   - BASS DRAG: bass hits land a hair LATE, behind the brushed snare.
//   - LATE RESOLUTION: the progression avoids a clean tonic cadence.
// The tape surface (wow/flutter/hiss) is applied at playback, not here.

export const TEMPO_BPM = 84;              // slow, tired shuffle
export const SWING = 0.62;                // 0.5 straight .. 0.667 triplet; between = worn
export const BASS_DRAG = 0.035;           // fraction of a beat the bass lands late
export const HAT_GAINS = Object.freeze({ onbeat: 0.25, offbeat: 0.14 });

const A4 = 440;
const NOTE = { C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5, 'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11 };

// note name like "A2" -> frequency (Hz).
export function noteFreq(name) {
  const m = /^([A-G]#?)(-?\d)$/.exec(name);
  if (!m) throw new RangeError(`bad note "${name}"`);
  const midi = NOTE[m[1]] + (parseInt(m[2], 10) + 1) * 12;
  return A4 * Math.pow(2, (midi - 69) / 12);
}

export function beatDur(bpm = TEMPO_BPM) { return 60 / bpm; }

// The progression: A-minor modal, harmonically ambiguous, resolves late. Each bar is a
// root + a voicing built with DROPPED 3rds (the 3rd omitted or flattened), so no chord
// commits to major/minor — the smoke never clears.
const PROGRESSION = [
  { root: 'A2', voicing: 'sus' },   // Am with no 3rd (sus-ish)
  { root: 'D2', voicing: 'm9no3' }, // Dm9 minus the 3rd
  { root: 'F2', voicing: 'maj7no3' },
  { root: 'E2', voicing: 'dom9no3' }, // dominant tension, never resolves cleanly
];

// Voicing -> semitone offsets from the root (3rd dropped for ambiguity).
const VOICINGS = {
  sus:      [0, 5, 7, 10],   // root, 4th, 5th, b7  (no 3rd)
  m9no3:    [0, 7, 10, 14],  // root, 5th, b7, 9th  (no 3rd)
  maj7no3:  [0, 7, 11, 14],  // root, 5th, maj7, 9th
  dom9no3:  [0, 7, 10, 14],  // root, 5th, b7, 9th
};

const SECTIONS = Object.freeze({
  A: PROGRESSION,
  "A'": [PROGRESSION[0], PROGRESSION[2], PROGRESSION[1], PROGRESSION[3]],
  B: [PROGRESSION[2], PROGRESSION[1], PROGRESSION[0], PROGRESSION[3]],
});

function hashSeed(value) {
  const text = String(value);
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

export function sessionSeed(caseId, entropy) { return hashSeed(`${caseId}:${entropy}`); }

export function passPlan(seed = 0, passIndex = 0, intensity = 0) {
  const sections = ['A', "A'", 'B'];
  const offset = hashSeed(seed) % sections.length;
  const section = sections[(offset + passIndex) % sections.length];
  const inversion = (hashSeed(`${seed}:voicing`) + passIndex) % 3;
  return { section, inversion, intensity: Math.max(0, Math.min(1, Number(intensity) || 0)) };
}

export function modulationPhases(t, phaseOffset = 0) {
  return { wow: phaseOffset + t * 1.7, flutter: phaseOffset * 1.93 + t * 6.31 };
}

export function flutterMultiplier(t, phaseOffset = 0) {
  const phase = modulationPhases(t, phaseOffset);
  return 1 + Math.sin(phase.wow) * 0.0032 + Math.sin(phase.flutter) * 0.0011;
}

function transpose(freq, semitones) { return freq * Math.pow(2, semitones / 12); }

// Compose one bar (4 beats) at absolute start time `t0`. Emits events for four voices.
export function composeBar(barIndex, t0, { bpm = TEMPO_BPM, swing = SWING, section = 'A', inversion = 0, intensity = 0 } = {}) {
  const bd = beatDur(bpm);
  const progression = SECTIONS[section] || SECTIONS.A;
  const chord = progression[barIndex % progression.length];
  const rootF = noteFreq(chord.root);
  const events = [];
  const energy = 0.78 + Math.max(0, Math.min(1, intensity)) * 0.42;

  // Swung eighth time within a beat: onbeat at 0, offbeat delayed toward triplet.
  const off = swing * bd;

  for (let beat = 0; beat < 4; beat++) {
    const beatT = t0 + beat * bd;

    // BASS (upright): root on 1 and 3, walking a little; lands LATE (drag).
    if (beat === 0 || beat === 2) {
      const walk = beat === 2 ? 7 : 0; // step to the 5th on beat 3
      events.push({ voice: 'bass', t: beatT + BASS_DRAG * bd, freq: transpose(rootF, walk), dur: bd * 1.1, gain: 0.9 * energy });
    }

    // BRUSHED KIT: soft pulse on every beat; a swung offbeat ghost note.
    events.push({ voice: 'kit', t: beatT, freq: 0, dur: 0.08, gain: HAT_GAINS.onbeat, brushed: true });
    events.push({ voice: 'kit', t: beatT + off, freq: 0, dur: 0.06, gain: HAT_GAINS.offbeat, brushed: true });

    // WAH STAB (comp): the ambiguous chord, hit on the swung offbeat of 2 and 4.
    if (beat === 1 || beat === 3) {
      const voiced = VOICINGS[chord.voicing].map((semi, i, notes) => i < (inversion % notes.length) ? semi + 12 : semi);
      for (const semi of voiced) {
        events.push({ voice: 'stab', t: beatT + off, freq: transpose(rootF, semi) * 2, dur: bd * 0.5, gain: 0.16 * energy, wah: true });
      }
    }
  }

  // LEAD (flute/vibes): a hesitant two-note phrase per bar, entering late, resolving
  // later. Sits an octave up, picks colour tones (9th, 5th) so it never states the 3rd.
  events.push({ voice: 'lead', t: t0 + bd * 2.5 + off, freq: transpose(rootF, 14 + (section === 'B' ? 3 : 0)) * 2, dur: bd * 0.8, gain: 0.22 * energy });
  events.push({ voice: 'lead', t: t0 + bd * 3.5 + off, freq: transpose(rootF, 7 + (section === "A'" ? 5 : 0)) * 2, dur: bd * 1.2, gain: 0.2 * energy });

  return events;
}

// Compose a whole passage of `bars` bars starting at time 0.
export function composeProgression(bars = 4, opts = {}) {
  const bd = beatDur(opts.bpm);
  const plan = passPlan(opts.seed, opts.passIndex, opts.intensity);
  const composed = { ...opts, ...plan };
  const all = [];
  for (let b = 0; b < bars; b++) all.push(...composeBar(b, b * 4 * bd, composed));
  return all.map((event) => ({ ...event, section: plan.section, inversion: plan.inversion, passIndex: opts.passIndex || 0 }))
    .sort((a, b) => a.t - b.t);
}
