// score.test.js — THE SCORE (DESIGN-SEED M7 / V3 Song-Structure Law). Density
// metrics + structure over a counting voice stub (no WebAudio): every track
// produces notes, sits in a sane density band, the tracks are distinct, combat
// is the only kit track, and the sharpened structure law holds (3+ sections,
// long cycle, per-pass variation). Also asserts every UI screen maps to a track.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  TRACKS, STATE_TRACK, trackForScreen, probeTrack, registerScore,
  renderTrackEventBytes, SECTION_BARS, SECTION_COUNT, LOOP_LEN, cycleSeconds,
} from '../src/score.js';

const STEPS_PER_SECTION = 16 * SECTION_BARS;

test('every track produces notes and is deterministic', () => {
  for (const [name, spec] of Object.entries(TRACKS)) {
    const a = probeTrack(spec), b = probeTrack(spec);
    assert.ok(a.notes > 0, `${name} produces notes`);
    assert.deepEqual(a, b, `${name} is deterministic`);
    assert.ok(spec.bpm > 0 && spec.len > 0, `${name} has bpm+len`);
  }
});

test('note density sits in a musical band per track (not empty, not a wall)', () => {
  for (const [name, spec] of Object.entries(TRACKS)) {
    const { perStep } = probeTrack(spec);
    assert.ok(perStep > 0.03, `${name} is not near-silent (${perStep.toFixed(2)}/step)`);
    assert.ok(perStep <= 4, `${name} is not a note wall (${perStep.toFixed(2)}/step)`);
  }
});

test('combat is the busiest track and the only one with a drum kit', () => {
  const dens = Object.fromEntries(Object.entries(TRACKS).map(([n, s]) => [n, probeTrack(s).perStep]));
  const kit = (v) => (v.kick | 0) + (v.snare | 0) + (v.hat | 0);
  for (const [name, spec] of Object.entries(TRACKS)) {
    const has = kit(probeTrack(spec).byVoice);
    if (name === 'combat') assert.ok(has > 0, 'combat has percussion');
    else assert.equal(has, 0, `${name} has no percussion (kit is combat-only)`);
  }
  assert.ok(dens.combat >= dens.office, 'combat is busier than the office');
  assert.ok(dens.office <= dens.march, 'the office is the quietest');
});

test('the register uses period voices (pluck/lead/bell/drone), not just tones', () => {
  const m = probeTrack(TRACKS.march).byVoice;
  assert.ok(m.pluck > 0 && m.lead > 0 && m.bass > 0, 'march: plucked courtly figure + square lead + bass');
  const o = probeTrack(TRACKS.office).byVoice;
  assert.ok(o.drone > 0, 'office leans on a drone');
  const r = probeTrack(TRACKS.report).byVoice;
  assert.ok(r.drone > 0 && r.lead > 0, 'report: drone + a sparse lead');
});

test('V3 adds arrangement depth beyond V2 (pad and/or air layers)', () => {
  for (const [name, spec] of Object.entries(TRACKS)) {
    const v = probeTrack(spec).byVoice;
    assert.ok((v.pad | 0) > 0, `${name} uses the pad bed`);
  }
  assert.ok(probeTrack(TRACKS.office).byVoice.air > 0, 'office C carries air texture');
  assert.ok(probeTrack(TRACKS.report).byVoice.air > 0, 'report C carries air texture');
  assert.ok(probeTrack(TRACKS.town).byVoice.air > 0, 'town C carries air texture');
});

test('every UI screen resolves to a registered track', () => {
  const registered = new Set();
  registerScore({ registerTrack: (name) => registered.add(name) });
  assert.ok(Object.keys(TRACKS).every((n) => registered.has(n)), 'registerScore registers all tracks');
  for (const screen of Object.keys(STATE_TRACK)) {
    assert.ok(TRACKS[trackForScreen(screen)], `${screen} -> a real track`);
  }
  assert.equal(trackForScreen('nonesuch'), 'office', 'unknown screen -> the quiet office default');
});

test('Song-Structure Law V3: three sections, long cycle, same-seed byte-identical', () => {
  assert.equal(SECTION_COUNT, 3, 'three sections is the V3 floor');
  assert.equal(LOOP_LEN, 16 * SECTION_BARS * SECTION_COUNT, 'loop length matches form constants');
  for (const [name, spec] of Object.entries(TRACKS)) {
    assert.equal(spec.len, LOOP_LEN, `${name}: full loop is ${LOOP_LEN} steps`);
    const expectedCycle = LOOP_LEN * (60 / spec.bpm / 4);
    assert.equal(cycleSeconds(spec), expectedCycle, `${name}: cycle seconds match bpm (${cycleSeconds(spec).toFixed(3)}s)`);
    assert.ok(cycleSeconds(spec) >= 60, `${name}: full cycle is at least one minute (${cycleSeconds(spec).toFixed(1)}s)`);
    const a = renderTrackEventBytes(spec, { start: 0, steps: STEPS_PER_SECTION, seed: 811 });
    const b = renderTrackEventBytes(spec, { start: STEPS_PER_SECTION, steps: STEPS_PER_SECTION, seed: 811 });
    const c = renderTrackEventBytes(spec, { start: STEPS_PER_SECTION * 2, steps: STEPS_PER_SECTION, seed: 811 });
    assert.notEqual(a, b, `${name}: section A differs from section B`);
    assert.notEqual(b, c, `${name}: section B differs from section C`);
    assert.notEqual(a, c, `${name}: section A differs from section C`);
    assert.equal(a, renderTrackEventBytes(spec, { start: 0, steps: STEPS_PER_SECTION, seed: 811 }), `${name}: same seed repeats exactly`);
  }
});

test('successive score loops differ, not only bars within one loop', () => {
  for (const [name, spec] of Object.entries(TRACKS)) {
    const loopA = renderTrackEventBytes(spec, { start: 0, steps: spec.len, seed: 811 });
    const loopB = renderTrackEventBytes(spec, { start: spec.len, steps: spec.len, seed: 811 });
    assert.notEqual(loopA, loopB, `${name}: loop 2 differs from loop 1`);
  }
});

test('combat params alter intensity without altering the band-kit API', () => {
  const quiet = renderTrackEventBytes(TRACKS.combat, { steps: LOOP_LEN, seed: 811, params: { intensity: 0.1 } });
  const urgent = renderTrackEventBytes(TRACKS.combat, { steps: LOOP_LEN, seed: 811, params: { intensity: 1 } });
  assert.notEqual(quiet, urgent, 'live intensity changes scheduled voice parameters');
});

test('V3.1 tempos are one notch below V3 and keep context contrast', () => {
  // V3 BPMs: office 50, march 86, town 76, combat 104, report 46.
  // V3.1 is ~10% slower (integer), combat still fastest, report still slowest.
  assert.equal(TRACKS.combat.bpm, 94);
  assert.equal(TRACKS.march.bpm, 77);
  assert.equal(TRACKS.town.bpm, 68);
  assert.equal(TRACKS.office.bpm, 45);
  assert.equal(TRACKS.report.bpm, 41);
  assert.ok(TRACKS.combat.bpm > TRACKS.march.bpm);
  assert.ok(TRACKS.march.bpm > TRACKS.town.bpm);
  assert.ok(TRACKS.town.bpm > TRACKS.office.bpm);
  assert.ok(TRACKS.office.bpm > TRACKS.report.bpm);
  assert.equal(cycleSeconds(TRACKS.office), 192);
  assert.equal(cycleSeconds(TRACKS.town), 8640 / 68);
  assert.equal(cycleSeconds(TRACKS.march), 8640 / 77);
  assert.equal(cycleSeconds(TRACKS.report), 8640 / 41);
  assert.equal(cycleSeconds(TRACKS.combat), 8640 / 94);
});
