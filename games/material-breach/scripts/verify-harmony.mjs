// verify-harmony.mjs — proves, from the RENDERED AUDIO, that the score has real harmonic movement.
//
// WHY THIS EXISTS. The binding requirement added at M7b is that the score must have an actual chord
// progression with moving roots and cadences, because a sibling game failed Ray's ear the same day
// for being one chord with texture changes over the top. A builder cannot hear its own output, so
// "it has a progression" is a claim, and the claim and the audio are exactly the two things that
// can come apart. A chord table in a source file proves the composer's intent; only the waveform
// proves what was played.
//
// So this measures the audio. It computes a CHROMA PROFILE (energy per pitch class) for every bar
// of the render with a Goertzel filter bank, then asks two questions the directive actually cares
// about:
//
//   1. IS THE WRITTEN CHORD THE SOUNDING CHORD? Correlate each bar's chroma against the pitch-class
//      set score.js says should be playing there, and against all 11 transpositions of it. If the
//      written chord wins, the harmony on the page is the harmony in the air.
//   2. DO THE ROOTS ACTUALLY MOVE? Count bar-to-bar root changes and distinct roots per section. A
//      score that is one chord with texture changes scores near zero here no matter how it sounds.
//
// Run:  node scripts/verify-harmony.mjs [listenDir]

import { readFileSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FORM, CLOSING_FORM, voicing, BPM, CLOSING_BPM } from '../src/score.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIR = process.argv[2] || join(ROOT, 'docs', 'listen', '2026-08-14-M7b');

const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

// ---- wav ------------------------------------------------------------------------------------------

function readWav(path) {
  const b = readFileSync(path);
  if (b.toString('ascii', 0, 4) !== 'RIFF') throw new Error(`not a wav: ${path}`);
  let off = 12;
  let fmt = null;
  let data = null;
  while (off + 8 <= b.length) {
    const id = b.toString('ascii', off, off + 4);
    const size = b.readUInt32LE(off + 4);
    if (id === 'fmt ') fmt = { channels: b.readUInt16LE(off + 10), rate: b.readUInt32LE(off + 12), bits: b.readUInt16LE(off + 22) };
    if (id === 'data') data = b.subarray(off + 8, off + 8 + size);
    off += 8 + size + (size % 2);
  }
  if (!fmt || !data) throw new Error(`malformed wav: ${path}`);
  const frames = data.length / (fmt.channels * (fmt.bits / 8));
  const mono = new Float32Array(frames);
  for (let i = 0; i < frames; i++) {
    let s = 0;
    for (let c = 0; c < fmt.channels; c++) s += data.readInt16LE((i * fmt.channels + c) * 2) / 32768;
    mono[i] = s / fmt.channels;
  }
  return { rate: fmt.rate, samples: mono };
}

// ---- chroma ----------------------------------------------------------------------------------------
// Goertzel: the energy at one frequency, cheaply, without a full FFT. One bin per semitone across
// five octaves, folded into twelve pitch classes.

function goertzel(x, from, to, freq, rate) {
  const w = (2 * Math.PI * freq) / rate;
  const c = 2 * Math.cos(w);
  let s0 = 0;
  let s1 = 0;
  let s2 = 0;
  for (let i = from; i < to; i++) {
    s0 = x[i] + c * s1 - s2;
    s2 = s1;
    s1 = s0;
  }
  return Math.sqrt(Math.max(0, s1 * s1 + s2 * s2 - c * s1 * s2));
}

// C2 (midi 36) through B6 (midi 95). Low enough to catch the bass's own fundamental, high enough for
// the vibraphone, and it deliberately EXCLUDES the sub-60Hz region where the fluorescent pedal sits:
// the pedal is a fixed F under everything by design, so counting it would smear every bar toward F
// and hide the very movement being measured.
const LO_MIDI = 36;
const HI_MIDI = 95;

function chromaOf(x, from, to, rate) {
  const v = new Float64Array(12);
  for (let m = LO_MIDI; m <= HI_MIDI; m++) {
    const f = 440 * Math.pow(2, (m - 69) / 12);
    // Weight the octaves down as they rise so a bright vibraphone partial cannot outvote the chord.
    const weight = 1 / (1 + (m - LO_MIDI) / 24);
    v[m % 12] += goertzel(x, from, to, f, rate) * weight;
  }
  const sum = v.reduce((a, n) => a + n, 0) || 1;
  return Array.from(v, (n) => n / sum);
}

function correlate(chroma, pcs) {
  const mask = new Array(12).fill(0);
  for (const pc of pcs) mask[((pc % 12) + 12) % 12] = 1;
  const n = mask.reduce((a, b) => a + b, 0) || 1;
  let inSet = 0;
  for (let i = 0; i < 12; i++) if (mask[i]) inSet += chroma[i];
  // Mean energy on chord tones vs mean energy off them: above 1 means the written chord is sounding.
  const outSet = 1 - inSet;
  return inSet / n / Math.max(1e-9, outSet / Math.max(1, 12 - n));
}

// ---- the check ---------------------------------------------------------------------------------------

// `sour` must match the level the file was RENDERED at. Getting this wrong is not a detail: the
// first run of this script compared the fully-soured closing cue against its sweet voicings and
// reported a 33% failure for a render that was note-for-note correct. The altered tones ARE the
// chord at that sour level, so the reference has to be taken at the same level as the audio.
function analyse(label, wavPath, form, bpm, sour = 0) {
  const { rate, samples } = readWav(wavPath);
  const barSec = (60 / bpm) * 4;
  const results = [];
  let matched = 0;
  let rootMoves = 0;

  for (let bar = 0; bar < form.length; bar++) {
    // Read the second half of each bar: the pad's attack has landed and the previous chord's
    // release has decayed, so the window holds this bar's harmony rather than the seam.
    const t0 = bar * barSec + barSec * 0.45;
    const t1 = bar * barSec + barSec * 0.95;
    const from = Math.floor(t0 * rate);
    const to = Math.min(samples.length, Math.floor(t1 * rate));
    if (to - from < 1000) break;
    const chroma = chromaOf(samples, from, to, rate);
    const def = form[bar];
    const pcs = voicing(def.ch, sour).map((n) => n % 12);

    // Score the written chord against every transposition of itself. If the written one wins, the
    // sounding harmony is the written harmony; if a transposition wins, something is off by an
    // interval and the score is lying about itself.
    const scores = [];
    for (let shift = 0; shift < 12; shift++) scores.push(correlate(chroma, pcs.map((p) => p + shift)));
    const best = scores.indexOf(Math.max(...scores));
    const ok = best === 0;
    if (ok) matched++;
    if (bar > 0 && form[bar - 1].ch.root % 12 !== def.ch.root % 12) rootMoves++;

    results.push({
      bar: bar + 1,
      section: def.sec,
      chord: def.ch.name,
      written: scores[0].toFixed(2),
      bestShift: best,
      ok,
      top: chroma
        .map((v, i) => [NAMES[i], v])
        .sort((a, b) => b[1] - a[1])
        .slice(0, 4)
        .map(([n, v]) => `${n}${(v * 100).toFixed(0)}`)
        .join(' '),
    });
  }

  const roots = new Set(form.map((b) => b.ch.root % 12));
  const bySection = {};
  for (const b of form) (bySection[b.sec] = bySection[b.sec] || new Set()).add(b.ch.root % 12);

  console.log(`\n=== ${label} ===`);
  console.log(`bars analysed:        ${results.length}`);
  console.log(`written chord sounds: ${matched}/${results.length} bars (${((matched / results.length) * 100).toFixed(0)}%)`);
  console.log(`bar-to-bar root moves:${rootMoves}/${results.length - 1}`);
  console.log(`distinct roots:       ${roots.size} (${[...roots].map((r) => NAMES[r]).join(' ')})`);
  for (const [sec, set] of Object.entries(bySection)) {
    console.log(`  section ${sec}: ${set.size} distinct roots — ${[...set].map((r) => NAMES[r]).join(' ')}`);
  }
  const bad = results.filter((r) => !r.ok);
  if (bad.length) {
    console.log(`  bars whose sounding chord is not the written one:`);
    for (const r of bad) console.log(`    bar ${r.bar} (${r.section}) ${r.chord}: best shift +${r.bestShift}, written score ${r.written}, top ${r.top}`);
  }
  return { label, bars: results.length, matched, rootMoves, roots: roots.size, results };
}

const lobbyWav = join(DIR, '_wav', '01-the-lobby-two-full-cycles.wav');
const sourWav = join(DIR, '_wav', '03-the-lobby-during-an-incident.wav');
const closedWav = join(DIR, '_wav', '04-tenure-closed.wav');
if (!existsSync(lobbyWav)) throw new Error(`render the listen set first: ${lobbyWav} not found`);

// Three checks, each at the sour level its file was rendered at.
//   sweet   — the progression as written, with the facility in good order.
//   soured  — THE CURDLE LAW, measured. Same form, same tempo, pinned fully sour. If the roots
//             still move here, the score sours WITHOUT changing genre, which is what §10 requires;
//             a "curdle" that quietly abandoned the progression would show up as collapsed root
//             motion, and this is the only way to tell those two apart without ears.
//   closing — the parallel-minor cue, at its own 0.8.
const a = analyse('THE LOBBY (sweet, sour=0)', lobbyWav, FORM, BPM, 0);
const c = analyse('THE LOBBY (curdled, sour=1)', sourWav, FORM, BPM, 1);
const b = analyse('TENURE CLOSED (sour=0.8)', closedWav, CLOSING_FORM, CLOSING_BPM, 0.8);

console.log('\n---- verdict ----');
let fail = false;
for (const r of [a, c, b]) {
  const pct = (r.matched / r.bars) * 100;
  const moving = r.rootMoves / (r.bars - 1);
  const okChord = pct >= 80;
  const okMove = moving >= 0.6 && r.roots >= 4;
  if (!okChord || !okMove) fail = true;
  console.log(
    `${r.label}: written-chord-sounds ${pct.toFixed(0)}% ${okChord ? 'PASS' : 'FAIL'}; ` +
      `root motion ${(moving * 100).toFixed(0)}% of bars over ${r.roots} distinct roots ${okMove ? 'PASS' : 'FAIL'}`,
  );
}
console.log(fail ? '\nHARMONY CHECK FAILED' : '\nHARMONY CHECK PASSED — the written progression is the sounding progression, and the roots move.');
process.exit(fail ? 1 : 0);
