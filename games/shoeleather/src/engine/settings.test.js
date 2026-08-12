import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Settings, DEFAULT_SETTINGS, FONTS } from './settings.js';
import { MemoryStore } from './save.js';

test('starts at defaults', () => {
  const s = new Settings();
  assert.equal(s.get('textScale'), 1.0);
  assert.equal(s.get('dyslexiaFont'), false);
  assert.equal(s.get('photosensitivitySafe'), true);
});

test('clamps numeric settings to safe ranges', () => {
  const s = new Settings();
  assert.equal(s.set('textScale', 9), 2.0);   // max
  assert.equal(s.set('textScale', 0.1), 0.8); // min
  assert.equal(s.set('textSpeedCps', -5), 0);
  assert.equal(s.set('textSpeedCps', 9999), 200);
});

test('coerces booleans', () => {
  const s = new Settings();
  assert.equal(s.set('dyslexiaFont', 1), true);
  assert.equal(s.set('reducedMotion', ''), false);
});

test('rejects unknown keys', () => {
  const s = new Settings();
  assert.throws(() => s.get('nope'), /unknown setting/);
  assert.throws(() => s.set('nope', 1), /unknown setting/);
});

test('toCss reflects font + scale', () => {
  const s = new Settings();
  assert.deepEqual(s.toCss(), { fontFamily: FONTS.period, fontScalePct: 100 });
  s.set('dyslexiaFont', true); s.set('textScale', 1.5);
  assert.deepEqual(s.toCss(), { fontFamily: FONTS.dyslexic, fontScalePct: 150 });
});

test('persists and reloads through a store', () => {
  const store = new MemoryStore();
  const a = new Settings(store);
  a.set('textScale', 1.25); a.set('reducedMotion', true); a.save();
  const b = new Settings(store).load();
  assert.equal(b.get('textScale'), 1.25);
  assert.equal(b.get('reducedMotion'), true);
});

test('corrupt stored settings fall back to defaults without throwing', () => {
  const store = new MemoryStore();
  store.set('shoeleather:settings', '{broken');
  const s = new Settings(store);
  assert.doesNotThrow(() => s.load());
  assert.equal(s.get('textScale'), 1.0);
});

test('reset restores defaults', () => {
  const s = new Settings();
  s.set('textScale', 2); s.set('dyslexiaFont', true);
  s.reset();
  assert.deepEqual(s.values, { ...DEFAULT_SETTINGS });
});
