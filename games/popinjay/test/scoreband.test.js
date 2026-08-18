// scoreband.test.js — THE HOUSE BAND'S POPINJAY REGISTER (score.js). Drives the pure
// track defs + the SFX map by hand (no browser, no AudioContext) to assert the beat
// grid, the SONG STRUCTURE (every track has a real second strain, and the strains
// alternate across loop passes), the canonical deterministic performance pass, the
// mode→track routing, the beat quantization, and —
// the load-bearing one — AUDIO-SIM ISOLATION: observing the event queue for SFX never
// perturbs the sim.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { SCORE_PERFORMANCE, TRACKS, trackForMode, registerTracks, quantizeToBeat, sfxFor, SFX_EVENTS, strainAt } from '../src/engine/score.js';
import { NEUTRAL_DEFAULTS, normalizePerformance, performanceAdjustment } from '../src/engine/band.js';
import { POPINJAY_BAND_OVERRIDES } from '../src/engine/audio-posture.js';
import { hash2 } from '../src/engine/prng.js';
import { World } from '../src/sim/world.js';
import { Balloon } from '../src/sim/balloon.js';

// A recording stand-in for the band's voices — every call is logged, nothing sounds.
function recorder() {
  const calls = [];
  const rec = (name) => (t, ...args) => { calls.push({ name, t, args }); };
  const voices = {};
  for (const n of ['pad', 'drone', 'bell', 'pluck', 'bass', 'lead', 'air', 'kick', 'snare', 'hat']) voices[n] = rec(n);
  return { voices, calls };
}

// Run one loop of a track's step() by hand and collect, per step index, which voices fired.
function runLoop(track, params = {}) {
  const grid = [];
  for (let i = 0; i < track.len; i++) {
    const { voices, calls } = recorder();
    track.step(i, i * 0.1, { v: voices, i, n: i, bar: (i / 16) | 0, params, rand: () => 0 });
    grid[i] = calls.map((c) => c.name);
  }
  return grid;
}

test('the STAGE two-step lays a tuba OOM on the beats and a banjo PAH on the offbeats', () => {
  const g = runLoop(TRACKS.stage);
  assert.ok(g[0].includes('bass'), 'OOM on beat 1');
  assert.ok(g[8].includes('bass'), 'OOM on beat 3');
  assert.ok(g[4].includes('pluck'), 'PAH offbeat');
  assert.ok(g[12].includes('pluck'), 'PAH offbeat');
  assert.ok(g[8].includes('snare'), 'ragtime backbeat');
  // The cornet lead appears on the odd upbeats.
  assert.ok(g[2].includes('lead') && g[14].includes('lead'), 'cornet lead');
});

test('the WALTZ puts a root on beat 1 and chords on 2 and 3 (courteous 3/4)', () => {
  const g = runLoop(TRACKS.waltz);
  assert.ok(g[0].includes('bass'), 'root on 1');
  assert.ok(g[4].includes('pluck') && g[8].includes('pluck'), 'chords on 2 and 3');
  assert.ok(!g[0].includes('snare'), 'no ragtime backbeat in the waltz');
});

test('the PANIC galop drives every beat and INTENSIFIES with heat', () => {
  const cool = runLoop(TRACKS.panic, { heat: 0 });
  const hot = runLoop(TRACKS.panic, { heat: 1 });
  // A driving bass on every beat (steps 0,4,8,12) in both.
  for (const i of [0, 4, 8, 12]) assert.ok(cool[i].includes('bass'), `beat ${i} drives`);
  // Heat adds offbeat pushes + hats → strictly more voice events than cool.
  const count = (grid) => grid.reduce((c, s) => c + s.length, 0);
  assert.ok(count(hot) > count(cool), 'heat thickens the galop');
});

test('the TITLE two-step is softer (fewer hits than the stage engine)', () => {
  const stage = runLoop(TRACKS.stage).reduce((c, s) => c + s.length, 0);
  const title = runLoop(TRACKS.title).reduce((c, s) => c + s.length, 0);
  assert.ok(title < stage, 'the title breathes more than the stage');
});

// ---------------------------------------------------------------------------
// SONG-STRUCTURE LAW — every track is a multi-strain form, not one repeating cell.
// These probes drive one LOOP PASS at a time with the real absolute step count `n`
// (which is what selects the strain) and a real seeded rand, then compare the notes
// the band actually EMITS. Nothing here reads a label off the track def.
// ---------------------------------------------------------------------------

// How many loop passes one strain holds, per track (matches the step() defs).
const STRAIN_BARS = { title: 2, stage: 4, waltz: 4, panic: 4 };

// Run loop pass `p` of a track and return every emitted note as a plain record.
function runPass(track, p, { params = {}, seed = 7 } = {}) {
  const out = [];
  for (let i = 0; i < track.len; i++) {
    const n = p * track.len + i;
    const nominal = n * 0.25;                       // the step's un-humanized grid time
    const { voices, calls } = recorder();
    track.step(i, nominal, {
      v: voices, i, n, bar: (i / 16) | 0, params,
      rand: (k = 0) => hash2(n, k | 0, seed),       // the BAND's PRNG, exactly as band.js supplies it
    });
    for (const c of calls) {
      const freq = typeof c.args[0] === 'number' ? c.args[0] : null;
      const opts = c.args.find((a) => a && typeof a === 'object') || {};
      out.push({ i, name: c.name, freq: freq === null ? null : Math.round(freq * 10) / 10, t: c.t, nominal, vol: opts.vol, r: opts.r });
    }
  }
  return out;
}

// Apply the same pure adjustment that band.js wraps around s.v during live playback.
// This keeps the authored track probe independent from AudioContext while exercising
// the exact seed/step/voice/call coordinates used by the shipped scheduler.
function performedPass(track, p, { params = {}, seed = 7 } = {}) {
  const calls = new Map();
  return runPass(track, p, { params, seed }).map((event) => {
    const key = `${event.i}:${event.name}`;
    const call = calls.get(key) || 0;
    calls.set(key, call + 1);
    const adjusted = performanceAdjustment(SCORE_PERFORMANCE, {
      seed,
      absoluteStep: p * track.len + event.i,
      stepIndex: event.i,
      stepSeconds: 60 / track.bpm / 4,
      voice: event.name,
      call,
    });
    return {
      ...event,
      authoredT: event.t,
      authoredVol: event.vol,
      t: event.t + adjusted.timeSeconds,
      vol: event.vol === undefined ? undefined : event.vol * (1 + adjusted.velocity),
      r: event.r === undefined ? undefined : event.r + adjusted.releaseTail,
    };
  });
}
// The musical skeleton of a pass: which voice sounded which pitch on which step.
// Deliberately EXCLUDES time and level, which is what the performance pass varies.
const skeleton = (ev) => ev.map((e) => `${e.i}:${e.name}@${e.freq}`).join(' ');
const pitches = (ev, name) => ev.filter((e) => e.name === name && e.freq !== null).map((e) => e.freq);
const stepsOf = (ev, name) => [...new Set(ev.filter((e) => e.name === name).map((e) => e.i))];

test('strainAt schedules AABB: `bars` passes of A, then `bars` of B, forever', () => {
  const seen = [];
  for (let p = 0; p < 8; p++) seen.push(strainAt(p * 16, 16, 2).strain);
  assert.deepEqual(seen, [0, 0, 1, 1, 0, 0, 1, 1], 'two-bar strains alternate AABB');
  // The bar index runs 0..bars-1 WITHIN each strain, and the pass count never wraps.
  assert.deepEqual(strainAt(5 * 12, 12, 4), { pass: 5, strain: 1, bar: 1 });
  assert.equal(strainAt(0, 16, 4).strain, 0, 'a track always opens on its A strain');
});

test('SONG STRUCTURE: every track emits a genuinely different second strain', () => {
  for (const [name, track] of Object.entries(TRACKS)) {
    const bars = STRAIN_BARS[name];
    const a = runPass(track, 0, { params: { heat: 0.5 } });          // first A bar
    const b = runPass(track, bars, { params: { heat: 0.5 } });       // the matching B bar
    assert.equal(strainAt(0, track.len, bars).strain, 0);
    assert.equal(strainAt(bars * track.len, track.len, bars).strain, 1);
    // The load-bearing assertion: the EMITTED notes differ, not a label.
    assert.notEqual(skeleton(a), skeleton(b), `${name}: the B strain emits the same notes as the A strain`);
    // And it differs HARMONICALLY — over the WHOLE strain, the tuba goes somewhere
    // else. (Both strains may legitimately OPEN on the tonic, so one bar proves nothing.)
    const roots = (from) => [...new Set([...Array(bars).keys()]
      .flatMap((k) => pitches(runPass(track, from + k, { params: { heat: 0.5 } }), 'bass')))].sort((x, y) => x - y);
    assert.notDeepEqual(roots(0), roots(bars), `${name}: the B strain sits on the same bass roots as A`);
  }
});

test('SONG STRUCTURE: no track is a single repeating cell over a full A+B cycle', () => {
  for (const [name, track] of Object.entries(TRACKS)) {
    const sigs = new Set();
    for (let p = 0; p < STRAIN_BARS[name] * 2; p++) sigs.add(skeleton(runPass(track, p, { params: { heat: 0.5 } })));
    assert.ok(sigs.size >= 3, `${name}: only ${sigs.size} distinct passes in a full cycle — that is a loop, not a tune`);
  }
});

test('the TITLE trio (B) steps down to the subdominant and sings a calmer figure', () => {
  const a = runPass(TRACKS.title, 0);
  const b = runPass(TRACKS.title, 2);
  // A's tuba alternates the tonic C2 and the dominant G2; the trio's is F/Bb.
  assert.ok(pitches(a, 'bass').every((f) => f === 65.4 || f === 98), 'A stays on C2/G2');
  assert.ok(pitches(b, 'bass').includes(87.3), 'the trio drops onto F2 — a whole strain from home');
  // The trio answers late in the bar (step 10) where A marched on 3 (step 8).
  assert.deepEqual(stepsOf(a, 'bass'), [0, 8]);
  assert.deepEqual(stepsOf(b, 'bass'), [0, 10]);
  // A different melodic figure, not a transposition: different pitches AND placement.
  assert.notDeepEqual(stepsOf(a, 'lead'), stepsOf(b, 'lead'), 'the trio phrases differently');
  assert.notDeepEqual(pitches(a, 'lead'), pitches(b, 'lead'));
});

test('the STAGE rag (B) turns to the minor with a secondary dominant, on the rag grouping', () => {
  const a = runPass(TRACKS.stage, 0);
  const b = runPass(TRACKS.stage, 4);
  // A's cornet rides the even upbeats; the rag strain moves onto 3+3+3+3+2+2.
  assert.deepEqual(stepsOf(a, 'lead'), [2, 6, 10, 14], 'A: even upbeats');
  assert.deepEqual(stepsOf(b, 'lead'), [0, 3, 6, 9, 12, 14], 'B: the secondary-rag grouping');
  // Am under the rag strain — a chord tone A3 that the A strain never plays.
  assert.ok(pitches(b, 'pluck').includes(220), 'the rag strain opens on Am');
  assert.ok(!pitches(a, 'pluck').includes(220));
  // The D7's F# is the strain's colour tone, and it exists nowhere in A.
  const fSharp = runPass(TRACKS.stage, 5);
  assert.ok(pitches(fSharp, 'pluck').includes(370), 'D7 brings the F# that makes it a rag turn');
  // The extra snare lifts the band over the barline.
  assert.ok(stepsOf(b, 'snare').includes(14) && !stepsOf(a, 'snare').includes(14));
});

test('the WALTZ trio (B) walks its root every bar where the A strain sat on the tonic', () => {
  const bars = [0, 1, 2, 3];
  const aRoots = bars.map((k) => pitches(runPass(TRACKS.waltz, k), 'bass')[0]);
  const bRoots = bars.map((k) => pitches(runPass(TRACKS.waltz, 4 + k), 'bass')[0]);
  assert.equal(new Set(aRoots).size, 1, 'A keeps a pedal C2 under the whole strain');
  assert.equal(new Set(bRoots).size, 4, 'the trio moves its root every bar (vi–ii–V–I)');
  // The line flows on all three beats in the trio where A lilts on two.
  assert.deepEqual(stepsOf(runPass(TRACKS.waltz, 0), 'lead'), [0, 6]);
  assert.deepEqual(stepsOf(runPass(TRACKS.waltz, 4), 'lead'), [0, 4, 8]);
  // Twelve bars of trio melody, not one cell repeated: every bar sings new pitches.
  const lines = bars.map((k) => pitches(runPass(TRACKS.waltz, 4 + k), 'lead').join(','));
  assert.equal(new Set(lines).size, 4, 'the trio melody develops across its four bars');
});

test('the PANIC galop (B) walks a descending tetrachord and doubles the cornet', () => {
  const aRoots = [0, 1, 2, 3].map((k) => pitches(runPass(TRACKS.panic, k, { params: { heat: 0 } }), 'bass')[0]);
  const bRoots = [4, 5, 6, 7].map((k) => pitches(runPass(TRACKS.panic, k, { params: { heat: 0 } }), 'bass')[0]);
  for (let k = 1; k < bRoots.length; k++) assert.ok(bRoots[k] < bRoots[k - 1], 'the B strain walks strictly DOWN (C–Bb–A–G)');
  assert.ok(!aRoots.every((f, k) => k === 0 || f < aRoots[k - 1]), 'the A strain does not');
  // The chase: the cornet doubles its rate against A's two hits a bar.
  assert.equal(stepsOf(runPass(TRACKS.panic, 0, { params: { heat: 0 } }), 'lead').length, 2);
  assert.equal(stepsOf(runPass(TRACKS.panic, 4, { params: { heat: 0 } }), 'lead').length, 4);
  // Heat still rides on TOP of the structure — it thickens either strain.
  const dens = (p, heat) => runPass(TRACKS.panic, p, { params: { heat } }).length;
  assert.ok(dens(0, 1) > dens(0, 0), 'heat thickens the A strain');
  assert.ok(dens(4, 1) > dens(4, 0), 'heat thickens the B strain too');
});

// ---------------------------------------------------------------------------
// THE PERFORMANCE PASS — deterministic, one-sided, and skeleton-invariant.
// ---------------------------------------------------------------------------

test('PERFORMANCE: canonical knobs drag and lift, but keep the rhythm section on-grid', () => {
  assert.deepEqual(normalizePerformance(SCORE_PERFORMANCE).humanize, {
    timingMs: [0, 6], velocity: [-0.04, 0.04], swing: 0.04,
  });
  const ev = Object.values(TRACKS).flatMap((tr) => [0, 1, 4, 5].flatMap((p) => performedPass(tr, p, { params: { heat: 0.5 } })));
  // Drag is ONE-SIDED: a note may lean late, never early — nothing is ever
  // scheduled into the past (band.js hands step() a time barely ahead of `now`).
  for (const e of ev) assert.ok(e.t >= e.nominal - 1e-12, `a note was dragged EARLY on step ${e.i}`);
  assert.ok(ev.some((e) => e.t > e.nominal + 1e-9), 'nothing drags at all — the band is a sequencer');
  // The rhythm section stays dead on the grid; only melodic/chordal voices breathe.
  for (const e of ev) if (e.name === 'snare' || e.name === 'hat') assert.equal(e.t, e.nominal, 'percussion must not drag');
  for (const e of ev) if (e.name === 'bass') assert.equal(e.t, e.nominal, 'the tuba keeps the time');
  assert.ok(ev.some((e) => e.name === 'lead' && e.t > e.nominal), 'the cornet leans late');
  // Velocity varies, and no lift ever inverts or silences a voice.
  const vols = ev.filter((e) => e.name === 'pluck' && e.vol !== undefined).map((e) => e.vol);
  assert.ok(new Set(vols).size > 1, 'every chord is struck at the identical weight');
  for (const v of vols) assert.ok(v > 0 && v < 0.5);
});

test('PERFORMANCE: Popinjay overrides resolve away from the neutral kit posture', () => {
  const { voiceDefaults, ...bandOverrides } = POPINJAY_BAND_OVERRIDES;
  const resolved = {
    band: { ...NEUTRAL_DEFAULTS.band, ...bandOverrides },
    voices: Object.fromEntries(Object.entries(NEUTRAL_DEFAULTS.voices).map(([name, defaults]) => [
      name, { ...defaults, ...(voiceDefaults[name] || {}) },
    ])),
  };

  assert.deepEqual(resolved.band.reverb, { seconds: 3.4, decay: 2.6 });
  assert.equal(resolved.band.reverbReturnGain, 0.55);
  assert.deepEqual(
    [resolved.band.fadeOut, resolved.band.fadeIn, resolved.band.retireTail],
    [1.1, 2.2, 4.0],
  );
  assert.notDeepEqual(resolved.band, NEUTRAL_DEFAULTS.band, 'the app silently fell back to the neutral room');
  assert.deepEqual(resolved.voices.bell.ratios, [1, 2.01, 3.03, 4.78]);
  assert.deepEqual(resolved.voices.bell.levels, [1, 0.4, 0.22, 0.1]);
  for (const name of Object.keys(voiceDefaults)) {
    assert.notDeepEqual(resolved.voices[name], NEUTRAL_DEFAULTS.voices[name], `${name}: override did not change the resolved voice`);
  }
});

test('PERFORMANCE: chordal parts ring on with a seeded hand drag and ordered 2–5ms string spread', () => {
  for (const [name, track] of Object.entries(TRACKS)) {
    const ev = performedPass(track, 0).filter((e) => e.name === 'pluck');
    assert.ok(ev.length >= 3, `${name}: no chordal part found`);
    if (name !== 'panic') {
      for (const e of ev) assert.ok(e.r > 0.3, `${name}: chord release ${e.r} is still the abrupt default`);
    }
    for (const step of new Set(ev.map((e) => e.i))) {
      const chord = ev.filter((e) => e.i === step);
      const handDrag = chord[0].t - chord[0].nominal;
      assert.ok(handDrag >= -1e-12 && handDrag <= 0.005 + 1e-12, `${name}: hand drag escaped 0–5ms`);
      for (let string = 1; string < chord.length; string++) {
        const spread = chord[string].t - chord[string - 1].t;
        assert.ok(spread >= 0.002 - 1e-12 && spread <= 0.005 + 1e-12,
          `${name}: string ${string} spread was ${(spread * 1000).toFixed(3)}ms`);
      }
    }
  }
});

test('DETERMINISM: same seed → identical performance; a new seed moves only time and weight', () => {
  for (const [name, track] of Object.entries(TRACKS)) {
    for (let p = 0; p < STRAIN_BARS[name] * 2; p++) {
      const a = performedPass(track, p, { params: { heat: 0.5 }, seed: 4242 });
      const again = performedPass(track, p, { params: { heat: 0.5 }, seed: 4242 });
      assert.deepEqual(again, a, `${name} pass ${p}: the same seed played differently`);
      // A different band seed is a different NIGHT, never a different TUNE.
      const other = performedPass(track, p, { params: { heat: 0.5 }, seed: 99 });
      assert.equal(skeleton(other), skeleton(a), `${name} pass ${p}: the seed changed the notes, not just the performance`);
    }
  }
  // ...and the humanization genuinely responds to the seed (it is not a no-op).
  const one = performedPass(TRACKS.stage, 0, { seed: 4242 }).map((e) => `${e.t}:${e.vol}`).join(',');
  const two = performedPass(TRACKS.stage, 0, { seed: 99 }).map((e) => `${e.t}:${e.vol}`).join(',');
  assert.notEqual(one, two, 'the performance ignores the band seed');
});

test('PURITY: the register never reads a wall clock and never calls Math.random', () => {
  const src = readFileSync(new URL('../src/engine/score.js', import.meta.url), 'utf8');
  const kit = readFileSync(new URL('../src/engine/band.js', import.meta.url), 'utf8');
  const app = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  // Strip comments first — the header legitimately NAMES the banned APIs to forbid
  // them, and a grep that cannot tell code from prose would fail on its own rule.
  const strip = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
  // Guard the guard: the stripper must remove prose and keep code, or this whole
  // test is a rubber stamp.
  assert.equal(strip('// never Math.random\nconst x = Math.random();').trim(), 'const x = Math.random();');
  const code = strip(`${src}\n${kit}`);
  for (const banned of ['Math.random', 'Date.now', 'performance.now', 'new Date']) {
    assert.ok(!code.includes(banned), `score.js reaches for ${banned} — the score must be seeded and tick-denominated`);
  }
  assert.match(kit, /performanceAdjustment[\s\S]*hash2/, 'the performance pass is not tied to the band seed');
  assert.match(app, /\.\.\.POPINJAY_BAND_OVERRIDES/, 'live playback did not apply Popinjay tuning over the neutral kit');
  assert.match(app, /performance:\s*SCORE_PERFORMANCE/, 'live playback did not opt into the score performance posture');
});

test('trackForMode routes each screen to its register', () => {
  assert.equal(trackForMode('title'), 'title');
  assert.equal(trackForMode('trunk'), 'title');
  assert.equal(trackForMode('draft'), 'waltz');
  assert.equal(trackForMode('tourmap'), 'waltz');
  assert.equal(trackForMode('scorecard'), 'waltz');
  // A normal stage under par → the two-step; past par → the galop.
  assert.equal(trackForMode('playing', { tick: 10, parTicks: 100, stage: { meta: {} } }), 'stage');
  assert.equal(trackForMode('playing', { tick: 200, parTicks: 100, stage: { meta: {} } }), 'panic');
  // The finale/endless arena → the galop regardless of par.
  assert.equal(trackForMode('playing', { tick: 0, parTicks: 9999, stage: { meta: { finale: true } } }), 'panic');
});

test('registerTracks installs all four registers on a band', () => {
  const names = [];
  const fakeBand = { registerTrack: (n) => { names.push(n); } };
  registerTracks(fakeBand);
  assert.deepEqual(names.sort(), ['panic', 'stage', 'title', 'waltz']);
});

test('quantizeToBeat snaps a fire time UP onto the step grid (a stab on the beat)', () => {
  const bpm = 132, spb = 60 / bpm / 4;
  for (const off of [0.0, 0.3, 0.7, 0.999]) {
    const now = 5 * spb + off * spb;
    const q = quantizeToBeat(now, bpm);
    assert.ok(q >= now - 1e-9, 'never snaps into the past');
    const k = q / spb;
    assert.ok(Math.abs(k - Math.round(k)) < 1e-6, 'lands exactly on a grid multiple');
  }
  // An exact grid time stays put.
  assert.ok(Math.abs(quantizeToBeat(6 * spb, bpm) - 6 * spb) < 1e-9);
});

test('sfxFor: a pop is a brass stab that CLIMBS the chain; a denied fire is a polite click', () => {
  const { voices, calls } = recorder();
  const band = { voices };
  sfxFor({ type: 'pop', cls: 'penny', chain: 1 }, band, 0, 0);
  const lowChain = calls.find((c) => c.name === 'pluck');
  calls.length = 0;
  sfxFor({ type: 'pop', cls: 'penny', chain: 5 }, band, 0, 0);
  const highChain = calls.find((c) => c.name === 'pluck');
  assert.ok(highChain.args[0] > lowChain.args[0], 'a longer chain stabs higher');

  calls.length = 0;
  const handled = sfxFor({ type: 'denied' }, band, 0, 0);
  assert.ok(handled && calls.some((c) => c.name === 'hat'), 'the denied fire is a muted click');
  // A hit is a low thud (bass); an unknown event is ignored.
  calls.length = 0; sfxFor({ type: 'hit' }, band, 0, 0);
  assert.ok(calls.some((c) => c.name === 'bass'));
  assert.equal(sfxFor({ type: 'nonsense' }, band, 0, 0), false);
});

test('every SFX_EVENTS type is actually handled by sfxFor', () => {
  const { voices, calls } = recorder();
  for (const type of SFX_EVENTS) {
    calls.length = 0;
    const ok = sfxFor({ type, cls: 'grand', chain: 2 }, { voices }, 0, 0);
    assert.ok(ok && calls.length > 0, `${type} makes a sound`);
  }
});

// ---- the load-bearing probe: audio observation NEVER perturbs the sim ----------
test('AUDIO-SIM ISOLATION: draining events for SFX leaves the sim fingerprint identical', () => {
  const tape = [];
  for (let i = 0; i < 300; i++) tape.push({ fire: i % 37 === 0, left: i % 5 === 0, right: i % 7 === 0 });

  function run(observeAudio) {
    const w = new World({ seed: 4242 });
    // A live roster so pops/chains/scoring actually fire events during the tape.
    const gTop = w.stage.floorBelow ? w.stage.floorBelow(0, 0).y : 700;
    w.balloons = [new Balloon({ cls: 'grand', x: w.player.x, floorY: gTop, y: 220, vy: 0, id: 1 })];
    const { voices } = recorder();
    for (const input of tape) {
      w.step(input);
      const events = w.drainEvents();
      if (observeAudio) for (const ev of events) if (SFX_EVENTS.has(ev.type)) sfxFor(ev, { voices }, 0, 0);
    }
    return w.fingerprint();
  }

  assert.equal(run(true), run(false), 'audio on vs suppressed → identical sim fingerprint');
});
