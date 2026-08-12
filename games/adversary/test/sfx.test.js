import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SFX, MUSIC_CUES, sfxForEvent, createAudio } from '../src/audio/sfx.js';

test('sfx: every core game event maps to a defined sound', () => {
  for (const type of ['hit', 'kill', 'boss-defeat', 'hurt', 'pickup', 'unlock', 'levelup', 'death', 'respawn', 'checkpoint', 'rest', 'recover']) {
    const key = sfxForEvent(type);
    assert.ok(key, `${type} has an sfx key`);
    assert.ok(SFX[key], `sfx '${key}' is defined`);
  }
});

test('sfx: double-jump reuses the existing jump sound', () => {
  assert.equal(sfxForEvent('double-jump'), 'jump');
  assert.ok(SFX.jump, 'jump recipe already exists');
});

test('sfx: every spec is well-formed (wave + duration + gain)', () => {
  for (const [k, s] of Object.entries(SFX)) {
    assert.ok(['square', 'triangle', 'sawtooth', 'sine', 'noise'].includes(s.wave), `${k} wave`);
    assert.ok(s.dur > 0 && s.dur <= 1, `${k} duration sane`);
    assert.ok(s.gain > 0 && s.gain <= 0.4, `${k} gain in a safe range`);
  }
});

test('sfx: music cue names are wired (silent hook)', () => {
  assert.ok(MUSIC_CUES.includes('boss') && MUSIC_CUES.includes('title'));
  const audio = createAudio(null); // headless — no AudioContext
  assert.equal(audio.musicCue('boss'), false, 'silent until bound');
});

test('sfx: headless audio is API-complete and a no-op without a context', () => {
  const audio = createAudio(null);
  assert.equal(audio._hasContext(), false);
  assert.equal(audio.play('hit'), false, 'no-op without a context');
  assert.equal(audio.playEvent('kill'), false);
  assert.equal(audio.playEvent('nope'), false);
  audio.setMuted(true); assert.ok(audio.isMuted());
});

test('sfx: a fake AudioContext receives oscillator/noise calls', () => {
  const calls = { osc: 0, noise: 0, gain: 0 };
  class FakeCtx {
    constructor() { this.currentTime = 0; this.sampleRate = 44100; this.destination = {}; }
    createGain() { calls.gain++; return { gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {} }; }
    createOscillator() { calls.osc++; return { frequency: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {}, start() {}, stop() {} }; }
    createBuffer() { return { getChannelData: () => new Float32Array(10) }; }
    createBufferSource() { calls.noise++; return { connect() {}, start() {}, stop() {} }; }
  }
  const audio = createAudio(FakeCtx);
  assert.ok(audio.play('hit'), 'tonal sfx played');
  assert.equal(calls.osc, 1);
  audio.play('boss'); // noise
  assert.equal(calls.noise, 1);
  audio.setMuted(true);
  assert.equal(audio.play('hit'), false, 'muted → no play');
});
