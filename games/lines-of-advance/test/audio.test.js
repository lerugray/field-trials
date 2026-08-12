import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AudioEngine, SLOTS, isReducedMotion } from '../src/audio.js';

test('AudioEngine exposes expected sound hooks', () => {
  const audio = new AudioEngine();
  assert.equal(typeof audio.playSelect, 'function');
  assert.equal(typeof audio.playMove, 'function');
  assert.equal(typeof audio.playError, 'function');
  assert.equal(typeof audio.playCapture, 'function');
  assert.equal(typeof audio.playReset, 'function');
});

test('AudioEngine default settings match spec', () => {
  const audio = new AudioEngine();
  assert.equal(audio.settings.sfx, true);
  assert.equal(audio.settings.music, false);
  // In Node there is no reduced-motion media query, so default is false.
  assert.equal(audio.settings.reducedEffects, false);
});

test('AudioEngine toggles update settings', () => {
  const audio = new AudioEngine();
  audio.setSfx(false);
  assert.equal(audio.settings.sfx, false);
  audio.toggleMusic(true);
  assert.equal(audio.settings.music, true);
  audio.setReducedEffects(true);
  assert.equal(audio.settings.reducedEffects, true);
});

test('SLOTS map names the expected board events', () => {
  assert.ok(SLOTS.select);
  assert.ok(SLOTS.move);
  assert.ok(SLOTS.error);
  assert.ok(SLOTS.capture);
  assert.ok(SLOTS.reset);
});

test('isReducedMotion is safe in Node', () => {
  assert.equal(isReducedMotion(), false);
});
