import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  sfxSpec,
  sfxSchedule,
  VOICES,
  WAVEFORMS,
  SFX_EVENTS,
  allEvents,
  allArchetypes,
} from '../src/engine/sfx.js';
import { ARCHETYPES } from '../src/data/roster.js';

test('every archetype has a voice with a legal waveform', () => {
  for (const a of ARCHETYPES) {
    const v = VOICES[a];
    assert.ok(v, `missing voice for ${a}`);
    assert.ok(WAVEFORMS.includes(v.wave), `${a} has illegal waveform ${v.wave}`);
    assert.ok(v.base > 0);
    assert.ok(v.wobble >= 0);
  }
});

test('a spec has non-empty tones and a bounded total duration', () => {
  for (const a of ARCHETYPES) {
    for (const ev of SFX_EVENTS) {
      const spec = sfxSpec(a, ev, 7);
      assert.ok(spec.tones.length >= 1, `${a}/${ev} produced no tones`);
      assert.ok(spec.duration > 0);
      // Nothing should drone: keep the whole phrase under a second and a half.
      assert.ok(spec.duration < 1.5, `${a}/${ev} too long: ${spec.duration}`);
    }
  }
});

test('all frequencies land in the safe audible band', () => {
  for (const a of ARCHETYPES) {
    for (const ev of SFX_EVENTS) {
      for (const s of [0, 1, 99, 40000]) {
        const spec = sfxSpec(a, ev, s);
        for (const t of spec.tones) {
          assert.ok(t.freq >= 80 && t.freq <= 5000, `${a}/${ev} freq ${t.freq} out of band`);
          assert.ok(t.slide >= 80 && t.slide <= 5000, `${a}/${ev} slide ${t.slide} out of band`);
          assert.ok(t.gain > 0 && t.gain <= 1);
          assert.ok(t.dur > 0);
          assert.ok(WAVEFORMS.includes(t.type));
        }
      }
    }
  }
});

test('same (archetype, event, seed) is deterministic', () => {
  const a = sfxSpec('blob', 'summon', 12345);
  const b = sfxSpec('blob', 'summon', 12345);
  assert.deepEqual(a, b);
});

test('the seed detunes the voice (different seeds shift pitch)', () => {
  const a = sfxSpec('avian', 'pet', 1);
  const b = sfxSpec('avian', 'pet', 2);
  // At least one tone frequency should differ once the seeds diverge.
  const differs = a.tones.some((t, i) => Math.abs(t.freq - b.tones[i].freq) > 0.01);
  assert.ok(differs, 'seed had no effect on pitch');
});

test('different archetypes have distinguishable base voices', () => {
  const blob = sfxSpec('blob', 'ui', 0).tones[0].freq;
  const orb = sfxSpec('orb', 'ui', 0).tones[0].freq;
  assert.notEqual(blob, orb);
});

test('unknown archetype falls back to a default voice without throwing', () => {
  const spec = sfxSpec('not-a-thing', 'pet', 3);
  assert.ok(spec.tones.length >= 1);
});

test('unknown event falls back to the ui blip', () => {
  const fallback = sfxSpec('blob', 'no-such-event', 0);
  const ui = sfxSpec('blob', 'ui', 0);
  assert.deepEqual(fallback, ui);
});

test('a slide note actually bends pitch (start != end)', () => {
  const spec = sfxSpec('critter', 'summon', 0);
  const slid = spec.tones.find((t) => Math.abs(t.freq - t.slide) > 0.5);
  assert.ok(slid, 'expected at least one gliding note in the summon jingle');
});

test('schedule lays tones back-to-back with no gaps or overlaps', () => {
  const spec = sfxSpec('critter', 'win', 3);
  const sched = sfxSchedule(spec, 10);
  assert.equal(sched.length, spec.tones.length);
  assert.equal(sched[0].start, 10);
  for (let i = 1; i < sched.length; i++) {
    // each note starts exactly where the previous stopped
    assert.ok(Math.abs(sched[i].start - sched[i - 1].stop) < 1e-9);
  }
  const last = sched[sched.length - 1];
  assert.ok(Math.abs(last.stop - (10 + spec.duration)) < 1e-9);
});

test('schedule preserves per-tone timbre and pitch', () => {
  const spec = sfxSpec('orb', 'act', 1);
  const sched = sfxSchedule(spec, 0);
  sched.forEach((s, i) => {
    assert.equal(s.freq, spec.tones[i].freq);
    assert.equal(s.slide, spec.tones[i].slide);
    assert.equal(s.type, spec.tones[i].type);
    assert.ok(s.stop > s.start);
  });
});

test('menu helpers enumerate the tables', () => {
  assert.deepEqual(allEvents(), SFX_EVENTS);
  assert.deepEqual(allArchetypes(), ARCHETYPES);
});
