// Music band-selection + settings persistence (M9.6), plus the DOM runtime's retrigger safety
// (M9.6.1). Most of this file stays pure (bandFor, tracksForBand, the settings [de]serializers) —
// the same way save.js's localStorage calls live only in main.js while its pure serialize/
// deserialize are what's covered — but initMusic's actual <audio> churn under a wobbling dread
// value is exactly the bug class that shipped silently (a real operator-reported lag+crackle), so
// it gets a fake-window/fake-Audio harness below (mirrors the fakeCanvas/mockCtx pattern used
// elsewhere in this suite) rather than staying untested.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  TRACKS, BAND, DREAD_UNEASY, DREAD_HIGH, BAND_HYSTERESIS,
  bandFor, tracksForBand, playlistFor, loopsNatively,
  VOLUME_LEVELS, DEFAULT_VOLUME_IDX,
  defaultMusicSettings, serializeMusicSettings, deserializeMusicSettings,
  loadMusicSettings, saveMusicSettings,
  initMusic,
} from '../src/music.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// --- every catalogued track actually exists on disk (guards a typo silently going silent) -----

test('every track in the catalog exists in assets/music/', () => {
  for (const [key, filename] of Object.entries(TRACKS)) {
    assert.ok(existsSync(join(ROOT, 'assets', 'music', filename)), `${key} -> ${filename} is missing`);
  }
});

// --- band selection ---------------------------------------------------------------------------

test('the title screen wins regardless of dread', () => {
  assert.equal(bandFor({ screen: 'title', dread: 0 }), BAND.TITLE);
  assert.equal(bandFor({ screen: 'title', dread: 95 }), BAND.TITLE);
});

test('the title screen playlist uses the calm recovery-scenario track', () => {
  const pl = playlistFor({ screen: 'title', dread: 95 });
  assert.equal(pl.band, BAND.TITLE);
  assert.deepEqual(pl.tracks, [TRACKS.recoveryCalm]);
});

test('doom wins over the title screen and over dread', () => {
  assert.equal(bandFor({ doom: true, dread: 0 }), BAND.DOOM);
  assert.equal(bandFor({ doom: true, screen: 'title' }), BAND.DOOM);
});

test('dread bands from the meter: calm below 30, uneasy 30-59, dread 60+', () => {
  assert.equal(bandFor({ dread: 0 }), BAND.CALM);
  assert.equal(bandFor({ dread: DREAD_UNEASY - 1 }), BAND.CALM);
  assert.equal(bandFor({ dread: DREAD_UNEASY }), BAND.UNEASY);
  assert.equal(bandFor({ dread: DREAD_HIGH - 1 }), BAND.UNEASY);
  assert.equal(bandFor({ dread: DREAD_HIGH }), BAND.DREAD);
  assert.equal(bandFor({ dread: 100 }), BAND.DREAD);
});

test('a missing dread reads as 0 (calm), not a crash', () => {
  assert.equal(bandFor({}), BAND.CALM);
});

// --- hysteresis: a boundary wobble can't flap the band once entered ----------------------------
// (M9.6.1, the operator-reported lag+crackle fix: sim.js's updateDread() eases dread toward a
// target that drifts with population/structure counts and can sit almost exactly on 30 or 60 for
// a long stretch of real play; every flap used to mean a brand-new <audio> + crossfade.)

test('omitting prevBand reproduces the old stateless, exact-threshold behaviour', () => {
  assert.equal(bandFor({ dread: DREAD_UNEASY - 1 }), BAND.CALM);
  assert.equal(bandFor({ dread: DREAD_UNEASY }), BAND.UNEASY);
  assert.equal(bandFor({ dread: DREAD_HIGH - 1 }), BAND.UNEASY);
  assert.equal(bandFor({ dread: DREAD_HIGH }), BAND.DREAD);
});

test('entry thresholds are exact regardless of hysteresis (only exiting gets a margin)', () => {
  assert.equal(bandFor({ dread: DREAD_UNEASY }, BAND.CALM), BAND.UNEASY);
  assert.equal(bandFor({ dread: DREAD_HIGH }, BAND.UNEASY), BAND.DREAD);
});

test('once uneasy, a wobble back below 30 (but within the margin) stays uneasy', () => {
  assert.equal(bandFor({ dread: DREAD_UNEASY - 1 }, BAND.UNEASY), BAND.UNEASY);
  assert.equal(bandFor({ dread: DREAD_UNEASY - BAND_HYSTERESIS }, BAND.UNEASY), BAND.UNEASY);
});

test('once uneasy, only a wobble that clears the full margin drops back to calm', () => {
  assert.equal(bandFor({ dread: DREAD_UNEASY - BAND_HYSTERESIS - 1 }, BAND.UNEASY), BAND.CALM);
});

test('once dread, a wobble back below 60 (but within the margin) stays dread', () => {
  assert.equal(bandFor({ dread: DREAD_HIGH - 1 }, BAND.DREAD), BAND.DREAD);
  assert.equal(bandFor({ dread: DREAD_HIGH - BAND_HYSTERESIS }, BAND.DREAD), BAND.DREAD);
});

test('once dread, only a wobble that clears the full margin drops back (to uneasy, or calm if it clears both)', () => {
  assert.equal(bandFor({ dread: DREAD_HIGH - BAND_HYSTERESIS - 1 }, BAND.DREAD), BAND.UNEASY);
  assert.equal(bandFor({ dread: 5 }, BAND.DREAD), BAND.CALM); // a real drop (e.g. a fresh scenario) still lands correctly
});

test('doom and the title screen still override hysteresis outright', () => {
  assert.equal(bandFor({ doom: true, dread: 80 }, BAND.UNEASY), BAND.DOOM);
  assert.equal(bandFor({ screen: 'title', dread: 80 }, BAND.DREAD), BAND.TITLE);
});

// --- playlists per band, including the recovery-scenario override -----------------------------

test('title, dread, and doom each hold exactly one track', () => {
  assert.deepEqual(tracksForBand(BAND.TITLE), [TRACKS.recoveryCalm]);
  assert.deepEqual(tracksForBand(BAND.DREAD), [TRACKS.dread]);
  assert.deepEqual(tracksForBand(BAND.DOOM), [TRACKS.doom]);
});

test('calm and uneasy each rotate two tracks on the standard start', () => {
  assert.deepEqual(tracksForBand(BAND.CALM), [TRACKS.calmA, TRACKS.calmB]);
  assert.deepEqual(tracksForBand(BAND.UNEASY), [TRACKS.uneasyA, TRACKS.uneasyB]);
});

test('the After the Tide (recovery) scenario swaps its own calm-band track', () => {
  assert.deepEqual(tracksForBand(BAND.CALM, 'recovery'), [TRACKS.recoveryCalm]);
});

test('recovery only touches the calm band; uneasy and dread are unaffected', () => {
  assert.deepEqual(tracksForBand(BAND.UNEASY, 'recovery'), [TRACKS.uneasyA, TRACKS.uneasyB]);
  assert.deepEqual(tracksForBand(BAND.DREAD, 'recovery'), [TRACKS.dread]);
  assert.deepEqual(tracksForBand(BAND.TITLE, 'recovery'), [TRACKS.recoveryCalm]);
});

test('a non-recovery scenario (or none) gets the standard calm rotation', () => {
  assert.deepEqual(tracksForBand(BAND.CALM, 'standard'), [TRACKS.calmA, TRACKS.calmB]);
  assert.deepEqual(tracksForBand(BAND.CALM, null), [TRACKS.calmA, TRACKS.calmB]);
});

test('playlistFor combines bandFor + tracksForBand from one game-state object', () => {
  assert.deepEqual(playlistFor({ dread: 10, scenario: 'recovery' }), { band: BAND.CALM, tracks: [TRACKS.recoveryCalm] });
  assert.deepEqual(playlistFor({ dread: 80 }), { band: BAND.DREAD, tracks: [TRACKS.dread] });
  assert.deepEqual(playlistFor({ doom: true, dread: 80, scenario: 'recovery' }), { band: BAND.DOOM, tracks: [TRACKS.doom] });
});

// --- the doom sting plays once, everything else loops within its band -------------------------

test('single-track bands loop natively, except doom', () => {
  assert.equal(loopsNatively(BAND.DREAD, tracksForBand(BAND.DREAD)), true);
  assert.equal(loopsNatively(BAND.TITLE, tracksForBand(BAND.TITLE)), true);
  assert.equal(loopsNatively(BAND.CALM, tracksForBand(BAND.CALM, 'recovery')), true);
  assert.equal(loopsNatively(BAND.DOOM, tracksForBand(BAND.DOOM)), false);
});

test('two-track bands do not loop natively (they rotate instead)', () => {
  assert.equal(loopsNatively(BAND.CALM, tracksForBand(BAND.CALM)), false);
  assert.equal(loopsNatively(BAND.UNEASY, tracksForBand(BAND.UNEASY)), false);
});

// --- settings: default, round-trip, and tolerance of bad input ---------------------------------

test('default settings are music on, at the default volume step', () => {
  assert.deepEqual(defaultMusicSettings(), { enabled: true, volumeIdx: DEFAULT_VOLUME_IDX });
});

test('settings round-trip through serialize/deserialize', () => {
  const s = { enabled: false, volumeIdx: 3 };
  assert.deepEqual(deserializeMusicSettings(serializeMusicSettings(s)), s);
});

test('a missing or corrupt settings string falls back to defaults, not a crash', () => {
  assert.deepEqual(deserializeMusicSettings(null), defaultMusicSettings());
  assert.deepEqual(deserializeMusicSettings(''), defaultMusicSettings());
  assert.deepEqual(deserializeMusicSettings('{not json'), defaultMusicSettings());
});

test('an out-of-range volume index is clamped into VOLUME_LEVELS, not left dangling', () => {
  assert.equal(deserializeMusicSettings(JSON.stringify({ enabled: true, volumeIdx: 99 })).volumeIdx, VOLUME_LEVELS.length - 1);
  assert.equal(deserializeMusicSettings(JSON.stringify({ enabled: true, volumeIdx: -5 })).volumeIdx, 0);
  assert.equal(deserializeMusicSettings(JSON.stringify({ enabled: true })).volumeIdx, DEFAULT_VOLUME_IDX);
});

// --- storage IO: a fake localStorage, and the file:// case where storage refuses ---------------

function fakeStorage() {
  const data = {};
  return { getItem: (k) => (k in data ? data[k] : null), setItem: (k, v) => { data[k] = String(v); } };
}

test('settings persist across a save/load cycle through a storage-shaped object', () => {
  const storage = fakeStorage();
  saveMusicSettings(storage, { enabled: false, volumeIdx: 0 });
  assert.deepEqual(loadMusicSettings(storage), { enabled: false, volumeIdx: 0 });
});

test('with no storage available, load falls back to defaults and save is a silent no-op', () => {
  assert.deepEqual(loadMusicSettings(null), defaultMusicSettings());
  assert.doesNotThrow(() => saveMusicSettings(null, { enabled: false, volumeIdx: 1 }));
});

test('a storage that throws (private mode / refused file:// storage) never breaks the game', () => {
  const angry = {
    getItem() { throw new Error('storage refused'); },
    setItem() { throw new Error('storage refused'); },
  };
  assert.deepEqual(loadMusicSettings(angry), defaultMusicSettings());
  assert.doesNotThrow(() => saveMusicSettings(angry, { enabled: true, volumeIdx: 1 }));
});

// --- the DOM runtime: a boundary wobble must not stack/retrigger <audio> (M9.6.1) --------------
// A fake window with a counting fake Audio, in the same spirit as this suite's mockCtx/fakeCanvas.
// Real HTMLAudioElement construction+decode is expensive; every extra one across a wobble is a
// real cost (the reported lag+crackle), so the assertion is a hard cap on constructor calls.

function fakeMusicWindow() {
  let audioCtor = 0;
  class FakeAudio {
    constructor(src) { audioCtor++; this.src = src; this.volume = 0; this.loop = false; this._l = {}; }
    addEventListener(evt, fn) { this._l[evt] = fn; }
    play() { return Promise.resolve(); }
    pause() {}
  }
  const listeners = {};
  const win = {
    Audio: FakeAudio,
    localStorage: null,
    performance: { now: () => win._t },
    _t: 0,
    addEventListener(evt, fn) { listeners[evt] = fn; },
    removeEventListener(evt, fn) { if (listeners[evt] === fn) delete listeners[evt]; },
  };
  return { win, listeners, audioCtorCount: () => audioCtor };
}

test('a dread wobble at the 30 boundary retargets once, not per tick', () => {
  const { win, listeners, audioCtorCount } = fakeMusicWindow();
  const music = initMusic(win);
  listeners.pointerdown(); // the gesture that unlocks audio, as main.js's real boot flow does
  // Ramp up to the boundary, then wobble 29/30 for 20 simulated sim-ticks (main.js calls
  // music.update() every animation frame; here one call == one tick, which is the worst case).
  for (let d = 0; d <= 30; d += 3) { win._t += 16.7; music.update({ screen: 'play', dread: Math.min(d, 30) }); }
  const afterRamp = audioCtorCount();
  for (let i = 0; i < 20; i++) { win._t += 16.7; music.update({ screen: 'play', dread: i % 2 === 0 ? 29 : 30 }); }
  assert.equal(audioCtorCount(), afterRamp, 'no new <audio> should be constructed while dread wobbles inside the hysteresis margin');
});

test('a dread wobble at the 60 boundary (DREAD_HIGH) retargets once, not per tick', () => {
  const { win, listeners, audioCtorCount } = fakeMusicWindow();
  const music = initMusic(win);
  listeners.pointerdown();
  for (let d = 0; d <= 60; d += 6) { win._t += 16.7; music.update({ screen: 'play', dread: Math.min(d, 60) }); }
  const afterRamp = audioCtorCount();
  for (let i = 0; i < 20; i++) { win._t += 16.7; music.update({ screen: 'play', dread: i % 2 === 0 ? 59 : 60 }); }
  assert.equal(audioCtorCount(), afterRamp, 'no new <audio> should be constructed while dread wobbles inside the hysteresis margin');
});

test('a genuine, sustained recovery still leaves the band (hysteresis does not get stuck)', () => {
  const { win, listeners, audioCtorCount } = fakeMusicWindow();
  const music = initMusic(win);
  listeners.pointerdown();
  music.update({ screen: 'play', dread: 65 }); // straight into dread
  const enteredDread = audioCtorCount();
  win._t += 16.7;
  music.update({ screen: 'play', dread: 5 }); // a real, sustained drop
  assert.ok(audioCtorCount() > enteredDread, 'a real recovery past the margin must still retarget');
});
