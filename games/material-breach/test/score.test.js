// The SCORE, as behaviour. These tests speak the game's own vocabulary — sections, chords, roots,
// cadences, souring — not the synthesiser's, per hard rule 8.
//
// They exist because the Song-Structure Law and the harmonic-movement requirement are LAWS, and a
// law that is only ever checked by listening gets broken the first time nobody listens. The audio
// half is measured separately by scripts/verify-harmony.mjs against a real render; these are the
// structural half, and they run on every commit.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  FORM,
  CLOSING_FORM,
  SECTIONS,
  CHORDS,
  BPM,
  CLOSING_BPM,
  LOBBY_STEPS,
  CLOSING_STEPS,
  STEPS_PER_BAR,
  voicing,
  midi,
  hz,
  snap,
  paramsFor,
  sceneFor,
  registerScore,
  SCORE_PERFORMANCE,
  LOBBY_BASS,
  CLOSING_BASS,
} from '../src/score.js';
import { normalizePerformance, performanceAdjustment } from '../src/band.js';
import { hash2 } from '../src/prng.js';
import { createFacility } from '../src/model.js';

const pc = (n) => ((n % 12) + 12) % 12;
const rootsOf = (form) => form.map((b) => pc(b.ch.root));

// ---- the Song-Structure Law ---------------------------------------------------------------------

test('the score has three or more distinct sections, above the A/B floor', () => {
  const secs = new Set(FORM.map((b) => b.sec));
  assert.ok(secs.size >= 3, `the lobby has ${secs.size} sections; the sharpened law asks for 3 or more`);
  const closing = new Set(CLOSING_FORM.map((b) => b.sec));
  assert.ok(closing.size >= 3, `the closing cue has ${closing.size} sections`);
});

test('a full cycle of the bed runs for minutes, not seconds', () => {
  const seconds = (LOBBY_STEPS * 60) / BPM / 4;
  assert.ok(seconds > 90, `a cycle is ${seconds.toFixed(0)}s; the law asks for minutes, not seconds`);
});

test('the tempo is slower than instinct', () => {
  // The law names tempo explicitly, and "slower than your instinct" was the operator's own
  // correction on a score that already met the two-part floor. Lounge, not action.
  assert.ok(BPM <= 80, `the bed is ${BPM} BPM`);
  assert.ok(CLOSING_BPM < BPM, 'the closing cue is slower than the bed: the building is empty');
});

test('no section is a single repeated chord: every section moves its roots', () => {
  for (const form of [FORM, CLOSING_FORM]) {
    const bySection = {};
    form.forEach((b) => (bySection[b.sec] = bySection[b.sec] || []).push(pc(b.ch.root)));
    for (const [sec, roots] of Object.entries(bySection)) {
      assert.ok(
        new Set(roots).size >= 3,
        `section ${sec} uses ${new Set(roots).size} distinct roots; a section with one or two is a repeated cell`,
      );
    }
  }
});

test('the whole form is not one chord with texture changes', () => {
  // The exact failure this requirement was written against, as an assertion.
  const roots = rootsOf(FORM);
  const changes = roots.filter((r, i) => i > 0 && r !== roots[i - 1]).length;
  assert.ok(new Set(roots).size >= 6, `the bed visits ${new Set(roots).size} distinct roots`);
  assert.ok(changes / (roots.length - 1) >= 0.6, `roots change on ${changes}/${roots.length - 1} bar boundaries`);
});

test('sections differ in arrangement, not only in harmony', () => {
  // "Real arrangement variation between them" — voicing, density, register movement.
  const shapes = Object.values(SECTIONS).map((s) => `${s.bass}|${s.bell}|${s.comp}|${s.brush}|${s.lead}`);
  assert.equal(new Set(shapes).size, shapes.length, 'two sections share an identical arrangement');
});

test('the harmonic rhythm itself varies between sections', () => {
  // THE HOLD runs two bars a chord where every other section runs one. A section that differs only
  // in which chords it plays is a weaker contrast than one that differs in how fast they move.
  const perSection = {};
  FORM.forEach((b) => (perSection[b.sec] = perSection[b.sec] || []).push(b.ch.name));
  const rates = Object.entries(perSection).map(([sec, names]) => {
    let changes = 0;
    for (let i = 1; i < names.length; i++) if (names[i] !== names[i - 1]) changes++;
    return changes;
  });
  assert.ok(new Set(rates).size >= 2, 'every section changes chords at the same rate');
});

// ---- cadences -------------------------------------------------------------------------------------

test('every section boundary lands a cadence, not a fade', () => {
  // A cadence here means the last chord of a section stands in a real functional relationship to the
  // first chord of the next: a fifth down (authentic), a fourth down (plagal or deceptive), or a
  // step. What is being ruled out is a boundary where the harmony simply stops and restarts.
  const bounds = [];
  for (let i = 0; i < FORM.length; i++) {
    const here = FORM[i];
    const next = FORM[(i + 1) % FORM.length];
    if (here.sec !== next.sec) bounds.push([here, next]);
  }
  assert.ok(bounds.length >= 3, 'expected at least three section boundaries');
  for (const [a, b] of bounds) {
    const interval = pc(b.ch.root - a.ch.root);
    assert.ok(
      [5, 7, 1, 11, 2, 10].includes(interval),
      `${a.ch.name} -> ${b.ch.name} across the ${a.sec}/${b.sec} boundary is an interval of ${interval}, which is not a cadential motion`,
    );
  }
});

test('THE MEZZANINE descends by exactly one semitone a bar, IN THE LINE THAT IS PLAYED', () => {
  // The section's whole identity, and the test that earned its keep: an earlier version asserted
  // this on the chord roots as declared, which passed on pitch class while the bass actually
  // played G, Gb, F, E and then LEAPT AN OCTAVE UP to carry on "descending". A chroma analysis of
  // the render scored that 100%, because every pitch class was correct. It was still not a
  // descending line. So the assertion is on the voice-led bass — the notes a listener hears.
  const idx = FORM.map((b, i) => [b, i]).filter(([b]) => b.sec === 'C');
  assert.equal(idx.length, 8);
  for (let k = 1; k < idx.length; k++) {
    const here = LOBBY_BASS[idx[k][1]];
    const prev = LOBBY_BASS[idx[k - 1][1]];
    assert.equal(here, prev - 1, `bar ${k + 1} of THE MEZZANINE breaks the chromatic descent: ${prev} -> ${here}`);
  }
});

test('the bass never leaps more than a fifth between bars', () => {
  // A walking bass is a LINE. Octave wrapping is the specific way a chord-tone bass stops being
  // one, and it is invisible to any pitch-class check.
  for (const [label, form, line] of [
    ['lobby', FORM, LOBBY_BASS],
    ['closing', CLOSING_FORM, CLOSING_BASS],
  ]) {
    for (let i = 1; i < line.length; i++) {
      const leap = Math.abs(line[i] - line[i - 1]);
      assert.ok(leap <= 7, `${label} bass leaps ${leap} semitones into bar ${i + 1} (${form[i].ch.name})`);
    }
  }
});

// ---- the curdle ------------------------------------------------------------------------------------

test('souring alters chord quality and never moves a root', () => {
  // §10: "the same ensemble, same tempo, the pleasantness souring." A curdle that transposed
  // anything would be a key change, which is a different genre of music and a rule violation.
  for (const chord of Object.values(CHORDS)) {
    const sweet = voicing(chord, 0);
    const sour = voicing(chord, 1);
    assert.equal(sweet.length, sour.length, `${chord.name} changes its voice count when it sours`);
    assert.equal(sweet[0], sour[0], `${chord.name} moves its root when it sours`);
    assert.notDeepEqual(sweet, sour, `${chord.name} does not sour at all`);
  }
});

test('souring is gradual: it comes in from the top down, not as a switch', () => {
  const chord = CHORDS.C7;
  const seen = new Set();
  for (const q of [0, 0.25, 0.5, 0.75, 1]) seen.add(voicing(chord, q).join(','));
  assert.ok(seen.size >= 3, 'the curdle flips between two states instead of arriving by degrees');
  // Monotone: a tone that has already curdled never un-curdles as things get worse.
  let prevAltered = -1;
  for (const q of [0, 0.25, 0.5, 0.75, 1]) {
    const v = voicing(chord, q);
    const altered = v.filter((n, i) => n !== chord.root + chord.sweet[i]).length;
    assert.ok(altered >= prevAltered, 'a soured tone reverted as sourness rose');
    prevAltered = altered;
  }
});

test('a healthy facility sounds sweet and a failing one sounds sour', () => {
  const f = createFacility({ seed: 'sweetness' });
  const view = { facility: f, overlay: null };
  const healthy = paramsFor(view);
  assert.ok(healthy.sour < 0.15, `a fresh facility reads ${healthy.sour.toFixed(2)} sour`);

  const hurt = createFacility({ seed: 'sweetness' });
  hurt.lossObject.condition = 10;
  const sick = paramsFor({ facility: hurt, overlay: null });
  assert.ok(sick.sour > healthy.sour, 'damage to the Cornerstone does not sour the music');
});

test('an incident pins the music sour and reads the party as pressure', () => {
  const f = createFacility({ seed: 'incident' });
  const view = {
    facility: f,
    overlay: 'raid',
    replay: { steps: [{ pos: { x: 0, y: 0 } }, { pos: { x: 1, y: 0 } }, { pos: { x: 2, y: 0 } }], cursor: 2 },
  };
  const p = paramsFor(view);
  assert.ok(p.sour >= 0.55, 'an incident does not sour the bed');
  assert.ok(p.pressure > 0.9, 'pressure does not track the party approaching the Cornerstone');
});

test('sour and pressure are always in range, whatever the facility is doing', () => {
  const f = createFacility({ seed: 'extremes' });
  f.lossObject.condition = -50;
  f.treasury.gold = -900;
  const p = paramsFor({ facility: f, overlay: null });
  assert.ok(p.sour >= 0 && p.sour <= 1, `sour out of range: ${p.sour}`);
  assert.ok(p.pressure >= 0 && p.pressure <= 1, `pressure out of range: ${p.pressure}`);
});

// ---- the scene mapping -------------------------------------------------------------------------------

test('overlays do not cut the music; a closed tenure does', () => {
  const f = createFacility({ seed: 'scenes' });
  for (const overlay of [null, 'checklist', 'pause', 'orientation', 'raid']) {
    assert.equal(sceneFor({ facility: f, overlay }), 'lobby', `overlay ${overlay} changed the track`);
  }
  const done = createFacility({ seed: 'scenes' });
  done.status = 'condemned';
  assert.equal(sceneFor({ facility: done, overlay: 'closed' }), 'closed');
});

// ---- pitch plumbing ------------------------------------------------------------------------------------

test('note names, frequencies and octave snapping agree with themselves', () => {
  assert.equal(midi('A4'), 69);
  assert.equal(midi('C4'), 60);
  assert.equal(midi('F3'), 53);
  assert.ok(Math.abs(hz(69) - 440) < 1e-9);
  assert.ok(Math.abs(hz(81) - 880) < 1e-9);
  // Snapping keeps a melody in one register instead of leaping an octave when the harmony moves.
  for (const n of [30, 45, 60, 75, 90]) {
    const s = snap(n, 67, 79);
    assert.ok(s >= 67 && s <= 79, `snap(${n}) landed at ${s}, outside the register`);
    assert.equal(pc(s), pc(n), 'snapping changed the pitch class');
  }
});

test('registering the score puts both tracks on the band', () => {
  // A minimal stand-in for a band: registerScore only needs registerTrack, and this proves the
  // score registers what it says it does without needing a browser or an audio context.
  const registered = new Map();
  const stub = { registerTrack: (name, spec) => registered.set(name, spec) };
  registerScore(stub);
  assert.deepEqual([...registered.keys()], ['lobby', 'closed']);
  assert.equal(registered.get('lobby').len, LOBBY_STEPS);
  assert.equal(registered.get('closed').len, CLOSING_STEPS);
  assert.equal(LOBBY_STEPS, FORM.length * STEPS_PER_BAR);
});

test('a step never throws, at any point in the form, at any sourness', () => {
  // The band swallows step failures in live mode, so a broken step would be SILENT rather than
  // loud: the one place in this codebase where an exception does not announce itself. This walks
  // every step of both forms and refuses to let that happen quietly.
  const registered = new Map();
  registerScore({ registerTrack: (name, spec) => registered.set(name, spec) });
  const noop = () => {};
  const voices = new Proxy({}, { get: () => noop });
  for (const [name, spec] of registered) {
    for (const sour of [0, 0.5, 1]) {
      for (let i = 0; i < spec.len; i++) {
        const s = { v: voices, i, n: i + spec.len, bar: (i / 16) | 0, params: { sour, pressure: sour }, rand: () => 0.5 };
        assert.doesNotThrow(() => spec.step(i, 0, s), `${name} step ${i} threw at sour ${sour}`);
      }
    }
  }
});

test('two consecutive passes of the form are not identical', () => {
  // The law's per-pass variation clause. Record which voices fire at which step on pass 0 and pass
  // 1; if the two transcripts match, the bed is a loop the ear will memorise and then resent.
  const registered = new Map();
  registerScore({ registerTrack: (name, spec) => registered.set(name, spec) });
  const spec = registered.get('lobby');
  const transcribe = (pass) => {
    const events = [];
    const voices = new Proxy(
      {},
      {
        get:
          (_, voice) =>
          (...args) =>
            events.push(`${voice}@${args[0]}:${Math.round((args[1] || 0) * 10)}`),
      },
    );
    for (let i = 0; i < spec.len; i++) {
      spec.step(i, i, { v: voices, i, n: pass * spec.len + i, bar: (i / 16) | 0, params: { sour: 0, pressure: 0 }, rand: () => 0.5 });
    }
    return events.join('|');
  };
  assert.notEqual(transcribe(0), transcribe(1), 'pass 1 is identical to pass 0');
});

// ---------------------------------------------------------------------------
// THE PERFORMANCE PASS — deterministic, one-sided, and skeleton-invariant.
// The probes drive the authored step() by hand, then apply the same pure
// adjustment the live kit wraps around s.v, so the checks stay independent of
// AudioContext while using the shipped seed/step/voice/call coordinates.
// ---------------------------------------------------------------------------

function recorder() {
  const calls = [];
  const rec = (name) => (t, ...args) => { calls.push({ name, t, args }); };
  const voices = {};
  for (const n of ['pad', 'drone', 'bell', 'pluck', 'bass', 'lead', 'air', 'kick', 'snare', 'hat']) voices[n] = rec(n);
  return { voices, calls };
}

function specs() {
  const registered = new Map();
  registerScore({ registerTrack: (name, spec) => registered.set(name, spec) });
  return registered;
}

function runPass(spec, p, { params = { sour: 0, pressure: 0 }, seed = 7 } = {}) {
  const out = [];
  const bpm = spec.bpm;
  const stepSeconds = 60 / bpm / 4;
  for (let i = 0; i < spec.len; i++) {
    const n = p * spec.len + i;
    const nominal = n * stepSeconds;
    const { voices, calls } = recorder();
    spec.step(i, nominal, {
      v: voices, i, n, bar: (i / 16) | 0, params,
      rand: (k = 0) => hash2(n, k | 0, seed),
    });
    for (const c of calls) {
      const freq = typeof c.args[0] === 'number' ? c.args[0] : null;
      const opts = c.args.find((a) => a && typeof a === 'object') || {};
      out.push({ i, name: c.name, freq: freq === null ? null : Math.round(freq * 10) / 10, t: c.t, nominal, vol: opts.vol, r: opts.r });
    }
  }
  return out;
}

function performedPass(spec, p, opts = {}) {
  const calls = new Map();
  const stepSeconds = 60 / spec.bpm / 4;
  return runPass(spec, p, opts).map((event) => {
    const key = `${event.i}:${event.name}`;
    const call = calls.get(key) || 0;
    calls.set(key, call + 1);
    const adjusted = performanceAdjustment(SCORE_PERFORMANCE, {
      seed: opts.seed ?? 7,
      absoluteStep: p * spec.len + event.i,
      stepIndex: event.i,
      stepSeconds,
      voice: event.name,
      call,
    });
    return {
      ...event,
      authoredT: event.t,
      authoredVol: event.vol,
      authoredR: event.r,
      t: event.t + adjusted.timeSeconds,
      vol: event.vol === undefined ? undefined : event.vol * (1 + adjusted.velocity),
      r: event.r === undefined ? undefined : event.r + adjusted.releaseTail,
    };
  });
}

const skeleton = (ev) => ev.map((e) => `${e.i}:${e.name}@${e.freq}`).join(' ');

test('PERFORMANCE: canonical knobs drag and lift, but keep the walking bass and the desk on-grid', () => {
  assert.deepEqual(normalizePerformance(SCORE_PERFORMANCE).humanize, {
    timingMs: [0, 8], velocity: [-0.05, 0.05], swing: 0.05,
  });
  const registered = specs();
  const ev = [...registered.values()].flatMap((spec) => [0, 1].flatMap((p) => performedPass(spec, p, { params: { sour: 0.4, pressure: 0.3 } })));
  for (const e of ev) assert.ok(e.t >= e.authoredT - 1e-12, `a note was dragged EARLY on step ${e.i}`);
  assert.ok(ev.some((e) => e.t > e.authoredT + 1e-9), 'nothing drags at all — the band is a sequencer');
  for (const e of ev) if (e.name === 'bass') assert.equal(e.t, e.authoredT, 'the walking bass must keep the time');
  for (const e of ev) if (e.name === 'kick' || e.name === 'snare' || e.name === 'hat') {
    assert.equal(e.t, e.authoredT, `${e.name} must not take extra kit jitter (the desk lands on the beat)`);
  }
  assert.ok(ev.some((e) => e.name === 'pad' && e.t > e.authoredT), 'the pad does not lean');
  assert.ok(ev.some((e) => e.name === 'bell' && e.t > e.authoredT), 'the vibraphone does not lean');
  const vols = ev.filter((e) => e.name === 'pluck' && e.vol !== undefined).map((e) => e.vol);
  assert.ok(new Set(vols.map((v) => v.toFixed(5))).size > 1, 'every piano stab is struck at the identical weight');
  for (const v of vols) assert.ok(v > 0 && v < 0.5);
  const pads = ev.filter((e) => e.name === 'pad' && e.r !== undefined);
  assert.ok(pads.length, 'no pad notes to check for release tails');
  for (const e of pads) assert.ok(e.r > e.authoredR, 'pad release was not lengthened');
});

test('PERFORMANCE: the humanize layer leaves the authored skeleton untouched', () => {
  const registered = specs();
  for (const [name, spec] of registered) {
    const a = runPass(spec, 0, { params: { sour: 0.5, pressure: 0.2 }, seed: 4242 });
    const performed = performedPass(spec, 0, { params: { sour: 0.5, pressure: 0.2 }, seed: 4242 });
    assert.equal(skeleton(performed), skeleton(a), `${name}: the performance pass changed which notes were written`);
  }
});

test('DETERMINISM: same seed → identical performance; a new seed moves only time and weight', () => {
  const registered = specs();
  for (const [name, spec] of registered) {
    for (const p of [0, 1]) {
      const a = performedPass(spec, p, { params: { sour: 0.5 }, seed: 4242 });
      const again = performedPass(spec, p, { params: { sour: 0.5 }, seed: 4242 });
      assert.deepEqual(again, a, `${name} pass ${p}: the same seed played differently`);
      const other = performedPass(spec, p, { params: { sour: 0.5 }, seed: 99 });
      // Hats are excluded: the desk typewriter's strike count is authored off s.rand, so a new
      // band seed changes how busy the paperwork is. That is the score, not the performance pass.
      const pitched = (ev) => skeleton(ev.filter((e) => e.name !== 'hat'));
      assert.equal(pitched(other), pitched(a), `${name} pass ${p}: the seed changed the notes, not just the performance`);
    }
  }
  const lobby = specs().get('lobby');
  const one = performedPass(lobby, 0, { seed: 4242 }).map((e) => `${e.t}:${e.vol}`).join(',');
  const two = performedPass(lobby, 0, { seed: 99 }).map((e) => `${e.t}:${e.vol}`).join(',');
  assert.notEqual(one, two, 'the performance ignores the band seed');
});

test('PURITY: live playback and the listen renderer opt into SCORE_PERFORMANCE', () => {
  const scoreSrc = readFileSync(new URL('../src/score.js', import.meta.url), 'utf8');
  const audioSrc = readFileSync(new URL('../src/audio.js', import.meta.url), 'utf8');
  const harness = readFileSync(new URL('../scripts/_listen-harness.html', import.meta.url), 'utf8');
  assert.match(scoreSrc, /performance = SCORE_PERFORMANCE/);
  assert.match(audioSrc, /createScoredBand/);
  assert.match(harness, /createScoredBand/);
  assert.ok(!harness.includes('createBand('), 'the listen renderer bypassed createScoredBand and so skipped the performance pass');
});
