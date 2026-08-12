import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeSettings,
  defaultSettings,
  shouldReduceMotion,
  loadSettings,
  saveSettings,
  MOTION_MODES,
  DEFAULT_SETTINGS,
  SETTINGS_KEY,
} from '../src/engine/settings.js';

// A minimal in-memory storage adapter, like the save tests use.
function memStore(initial = {}) {
  const m = new Map(Object.entries(initial));
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    _map: m,
  };
}

test('defaults are complete and legal', () => {
  const d = defaultSettings();
  assert.equal(typeof d.sound, 'boolean');
  assert.ok(MOTION_MODES.includes(d.motion));
  assert.equal(typeof d.flashes, 'boolean');
  // a fresh copy, not the frozen singleton
  d.sound = false;
  assert.equal(DEFAULT_SETTINGS.sound, true);
});

test('normalize coerces garbage to a full legal object', () => {
  assert.deepEqual(normalizeSettings(null), { ...DEFAULT_SETTINGS });
  assert.deepEqual(normalizeSettings('nope'), { ...DEFAULT_SETTINGS });
  assert.deepEqual(normalizeSettings({ motion: 'sideways', sound: 'yes' }), {
    ...DEFAULT_SETTINGS,
  });
});

test('normalize keeps valid values and drops unknown keys', () => {
  const s = normalizeSettings({ sound: false, motion: 'reduced', flashes: false, bogus: 9 });
  assert.deepEqual(s, { sound: false, motion: 'reduced', flashes: false });
  assert.equal('bogus' in s, false);
});

test('shouldReduceMotion: auto follows the OS', () => {
  assert.equal(shouldReduceMotion({ motion: 'auto' }, true), true);
  assert.equal(shouldReduceMotion({ motion: 'auto' }, false), false);
});

test('shouldReduceMotion: explicit modes override the OS', () => {
  assert.equal(shouldReduceMotion({ motion: 'reduced' }, false), true);
  assert.equal(shouldReduceMotion({ motion: 'full' }, true), false);
});

test('save then load round-trips', () => {
  const store = memStore();
  const saved = saveSettings(store, { sound: false, motion: 'full', flashes: false });
  assert.deepEqual(saved, { sound: false, motion: 'full', flashes: false });
  assert.deepEqual(loadSettings(store), { sound: false, motion: 'full', flashes: false });
});

test('load returns defaults when nothing is stored', () => {
  assert.deepEqual(loadSettings(memStore()), { ...DEFAULT_SETTINGS });
});

test('load survives corrupt stored json', () => {
  const store = memStore({ [SETTINGS_KEY]: '{not json' });
  assert.deepEqual(loadSettings(store), { ...DEFAULT_SETTINGS });
});

test('save normalizes before persisting (no garbage lands in storage)', () => {
  const store = memStore();
  saveSettings(store, { motion: 'diagonal', sound: 1, flashes: 'meh' });
  assert.deepEqual(loadSettings(store), { ...DEFAULT_SETTINGS });
});

test('storage that throws degrades gracefully', () => {
  const boom = {
    getItem() {
      throw new Error('nope');
    },
    setItem() {
      throw new Error('nope');
    },
  };
  assert.deepEqual(loadSettings(boom), { ...DEFAULT_SETTINGS });
  // saveSettings must not throw even if the store does
  assert.deepEqual(saveSettings(boom, { sound: false }), normalizeSettings({ sound: false }));
});
