import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createSettings, DEFAULT_SETTINGS, FOV_MIN, FOV_MAX,
  DEADZONE_MIN, DEADZONE_MAX, MOUSE_SENS_MIN, MOUSE_SENS_MAX, SETTINGS_VERSION,
} from '../src/core/settings.js';

// Minimal injectable storage.
function fakeStore(initial) {
  const map = new Map(initial ? [['stray.settings', initial]] : []);
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, v),
    _dump: () => map.get('stray.settings'),
  };
}

test('defaults when storage is empty', () => {
  const s = createSettings(fakeStore());
  assert.deepEqual(s.all(), DEFAULT_SETTINGS);
});

test('toggle flips a flag and persists it', () => {
  const store = fakeStore();
  const s = createSettings(store);
  assert.equal(s.toggle('muted'), true);
  assert.equal(s.get('muted'), true);
  const saved = JSON.parse(store._dump());
  assert.equal(saved.muted, true);
});

test('fov adjust clamps to [FOV_MIN, FOV_MAX]', () => {
  const s = createSettings(fakeStore());
  for (let i = 0; i < 50; i++) s.adjustFov(5);
  assert.equal(s.get('fov'), FOV_MAX);
  for (let i = 0; i < 50; i++) s.adjustFov(-5);
  assert.equal(s.get('fov'), FOV_MIN);
});

test('deadzone adjust clamps to [DEADZONE_MIN, DEADZONE_MAX]', () => {
  const s = createSettings(fakeStore());
  for (let i = 0; i < 50; i++) s.adjustDeadzone(0.02);
  assert.equal(s.get('deadzone'), DEADZONE_MAX);
  for (let i = 0; i < 50; i++) s.adjustDeadzone(-0.02);
  assert.equal(s.get('deadzone'), DEADZONE_MIN);
});

test('music volume adjust clamps to [0,1] and persists', () => {
  const store = fakeStore();
  const s = createSettings(store);
  for (let i = 0; i < 20; i++) s.adjustMusicVolume(0.1);
  assert.equal(s.get('musicVolume'), 1);
  for (let i = 0; i < 30; i++) s.adjustMusicVolume(-0.1);
  assert.equal(s.get('musicVolume'), 0);
  assert.equal(JSON.parse(store._dump()).musicVolume, 0);
});

test('out-of-range deadzone/musicVolume from storage are clamped', () => {
  const s = createSettings(fakeStore(JSON.stringify({ deadzone: 9, musicVolume: -5 })));
  assert.equal(s.get('deadzone'), DEADZONE_MAX);
  assert.equal(s.get('musicVolume'), 0);
});

test('loads and sanitizes stored values (out-of-range fov clamped)', () => {
  const s = createSettings(fakeStore(JSON.stringify({ fov: 999, reducedMotion: true })));
  assert.equal(s.get('fov'), FOV_MAX);
  assert.equal(s.get('reducedMotion'), true);
});

test('corrupt storage falls back to defaults without throwing', () => {
  const s = createSettings(fakeStore('{not valid json'));
  assert.deepEqual(s.all(), DEFAULT_SETTINGS);
});

test('booleans are coerced, not passed through raw', () => {
  const s = createSettings(fakeStore(JSON.stringify({ muted: 1, fovLock: 'yes' })));
  assert.strictEqual(s.get('muted'), true);
  assert.strictEqual(s.get('fovLock'), true);
});

test('works with no storage at all (returns null store path)', () => {
  const s = createSettings(null);
  assert.equal(s.toggle('invertY'), true); // no throw
  assert.equal(s.get('invertY'), true);
});

test('mouse aim defaults ON and mouse sensitivity defaults to the canonical 4.0', async () => {
  const { MOUSE_SENS_DEFAULT } = await import('../src/input/mouse.js');
  const s = createSettings(null);
  assert.strictEqual(s.get('mouseAim'), true);
  assert.equal(MOUSE_SENS_DEFAULT, 4.0);
  assert.equal(DEFAULT_SETTINGS.mouseSensitivity, MOUSE_SENS_DEFAULT);
  assert.equal(s.get('mouseSensitivity'), 4.0);
  assert.ok(s.get('mouseSensitivity') > MOUSE_SENS_MIN && s.get('mouseSensitivity') < MOUSE_SENS_MAX);
});

test('SETTINGS_VERSION is 16 (sensitivity default bump)', () => {
  assert.equal(SETTINGS_VERSION, 16);
});

test('pre-M15 saves migrate to the ON default; stamped post-M15 choices are preserved (M15)', () => {
  // A save written before mouseAim existed: key absent -> new default applies.
  const legacy = createSettings(fakeStore(JSON.stringify({ muted: true, fov: 70 })));
  assert.strictEqual(legacy.get('mouseAim'), true);
  // Pre-M15 payloads persisted mouseAim:false ambiently (whole-object persist, no
  // version stamp) — that is NOT a choice, so it migrates to ON.
  const ambient = createSettings(fakeStore(JSON.stringify({ mouseAim: false, muted: true })));
  assert.strictEqual(ambient.get('mouseAim'), true);
  // A stamped M15 opt-out (v:15) is a real choice and stays off — must not be
  // re-migrated just because SETTINGS_VERSION moved past 15.
  const optedOutV15 = createSettings(fakeStore(JSON.stringify({ mouseAim: false, v: 15 })));
  assert.strictEqual(optedOutV15.get('mouseAim'), false);
  // A stamped current-version opt-out stays off too.
  const optedOut = createSettings(fakeStore(JSON.stringify({ mouseAim: false, v: SETTINGS_VERSION })));
  assert.strictEqual(optedOut.get('mouseAim'), false);
  // Explicit ON is preserved either way.
  const optedIn = createSettings(fakeStore(JSON.stringify({ mouseAim: true })));
  assert.strictEqual(optedIn.get('mouseAim'), true);
});

test('pre-v16 ambient mouseSensitivity 1.0 migrates to 4.0; chosen and v16 values are preserved', () => {
  // Old ambient baseline (never touched the slider): 1.0 under a pre-v16 stamp.
  const ambientV15 = createSettings(fakeStore(JSON.stringify({ mouseSensitivity: 1.0, v: 15 })));
  assert.equal(ambientV15.get('mouseSensitivity'), 4.0);
  // Unversioned payload with the old baseline likewise migrates.
  const ambientLegacy = createSettings(fakeStore(JSON.stringify({ mouseSensitivity: 1.0, muted: true })));
  assert.equal(ambientLegacy.get('mouseSensitivity'), 4.0);
  // A pre-v16 non-1.0 value was a real slider choice — keep it.
  const chosen = createSettings(fakeStore(JSON.stringify({ mouseSensitivity: 2.5, v: 15 })));
  assert.equal(chosen.get('mouseSensitivity'), 2.5);
  // A v16 payload with explicit 1.0 is a deliberate post-bump choice — keep it.
  const gentle = createSettings(fakeStore(JSON.stringify({ mouseSensitivity: 1.0, v: 16 })));
  assert.equal(gentle.get('mouseSensitivity'), 1.0);
  // Missing key takes the new default.
  const absent = createSettings(fakeStore(JSON.stringify({ muted: true, v: 15 })));
  assert.equal(absent.get('mouseSensitivity'), 4.0);
});

test('persist stamps the settings version so future choices survive default changes', () => {
  const store = fakeStore(null);
  const s = createSettings(store);
  s.toggle('mouseAim'); // ON -> OFF, a real post-M15 choice
  const written = JSON.parse(store.getItem('stray.settings'));
  assert.equal(written.v, SETTINGS_VERSION);
  assert.strictEqual(written.mouseAim, false);
  // Round-trip: the stamped OFF survives a reload.
  const s2 = createSettings(store);
  assert.strictEqual(s2.get('mouseAim'), false);
});

test('mouse sensitivity adjusts and clamps to its range (M11)', () => {
  const store = fakeStore(null);
  const s = createSettings(store);
  s.adjustMouseSensitivity(-100);
  assert.equal(s.get('mouseSensitivity'), MOUSE_SENS_MIN);
  s.adjustMouseSensitivity(+100);
  assert.equal(s.get('mouseSensitivity'), MOUSE_SENS_MAX);
  // persisted
  const s2 = createSettings(store);
  assert.equal(s2.get('mouseSensitivity'), MOUSE_SENS_MAX);
});

test('out-of-range mouse sensitivity from storage is clamped; mouseAim coerced (M11)', () => {
  const s = createSettings(fakeStore(JSON.stringify({ mouseSensitivity: 99, mouseAim: 1 })));
  assert.equal(s.get('mouseSensitivity'), MOUSE_SENS_MAX);
  assert.strictEqual(s.get('mouseAim'), true);
});
