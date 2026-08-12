// Music system for INNSMOUTH 2000 (M9.6, operator-directed).
//
// The operator supplies the music: eight .ogg tracks land in assets/music/ from an external
// pipeline (see assets/music/README.md). This module GENERATES and FETCHES no audio itself. It
// bands the game's state (title screen, the dread meter, the doom ending) into a mood, picks the
// track(s) for that mood, and crossfades between them. If assets/music/ is absent (a bare
// single-file open with no folder alongside it), the game runs silent — never an error.
//
// Two halves, deliberately separated:
//   - Pure logic (bandFor, tracksForBand, the settings [de]serializers): no DOM, node-testable.
//   - The DOM runtime (initMusic): <audio> elements, fades, localStorage. Browser-only, like the
//     rest of main.js's glue; mirrors main.js's own save/load try/catch around storage.

// --- the track catalog (operator-supplied filenames; see assets/music/README.md) --------------

export const TRACKS = {
  calmA: 'calm-zoning-day.ogg',
  calmB: 'calm-b-falcon-point-morning.ogg',
  uneasyA: 'uneasy-marsh-refinery-at-dusk.ogg',
  uneasyB: 'uneasy-b-the-esoteric-order-hall.ogg',
  dread: 'dread-shadows-under-the-water.ogg',
  recoveryCalm: 'recovery-the-scarred-shore.ogg',
  doom: 'doom-the-fourth-awakening.ogg',
};

// --- band selection (pure) ----------------------------------------------------------------
// Two thresholds on the dread meter (0..100), chosen to land on sim.js's own dread lines: 30 is
// where the waterfront turns to the Deep Ones, 60 is where Scholars stop coming. Below 30 the town
// still reads calm; 30-59 it's uneasy; 60+ it's openly dreadful. The title screen and the doom
// ending both override the meter outright.
export const DREAD_UNEASY = 30;
export const DREAD_HIGH = 60;

// Hysteresis margin (dread points) on the EXIT side of a band only. sim.js's updateDread() eases
// dread toward a target that drifts with population/structure counts (updateDread(), sim.js
// ~line 524-533) and can sit almost exactly on 30 or 60 for a long real-play stretch; without a
// margin, a one-tick wobble across the line called retarget() -> a brand-new <audio> + crossfade
// every tick it flipped (empirically: ~1 Audio() construction per tick of wobble, verified via a
// fake-Audio probe — see PROGRESS.md "music retrigger fix"). Entry thresholds stay exact (30/60
// still means "enter" precisely there); only leaving a dread band requires crossing back past the
// threshold by this margin, so a boundary wobble smaller than the margin cannot retrigger.
export const BAND_HYSTERESIS = 4;

export const BAND = { TITLE: 'title', CALM: 'calm', UNEASY: 'uneasy', DREAD: 'dread', DOOM: 'doom' };

// state: { screen: 'title'|'play', dread: number, doom: boolean }. `doom` wins over everything
// (the ending is scored regardless of where the meter sits); `screen === 'title'` wins over dread
// (the picker has its own theme); otherwise the meter decides.
//
// `prevBand` (optional, defaults to null) is the band the caller was in a moment ago. Passing it
// enables hysteresis on the dread thresholds: once IN the uneasy or dread band, dread must fall
// back past DREAD_UNEASY/DREAD_HIGH minus BAND_HYSTERESIS to leave it, not just past the raw line.
// Omitting it (the default) reproduces the old stateless, exact-threshold behaviour exactly —
// every existing caller/test that doesn't pass a second argument is unaffected.
export function bandFor(state = {}, prevBand = null) {
  if (state.doom) return BAND.DOOM;
  if (state.screen === 'title') return BAND.TITLE;
  const d = state.dread ?? 0;
  if (prevBand === BAND.DREAD) {
    if (d >= DREAD_HIGH - BAND_HYSTERESIS) return BAND.DREAD;
    return d >= DREAD_UNEASY ? BAND.UNEASY : BAND.CALM;
  }
  if (prevBand === BAND.UNEASY) {
    if (d >= DREAD_HIGH) return BAND.DREAD;
    return d >= DREAD_UNEASY - BAND_HYSTERESIS ? BAND.UNEASY : BAND.CALM;
  }
  if (d >= DREAD_HIGH) return BAND.DREAD;
  if (d >= DREAD_UNEASY) return BAND.UNEASY;
  return BAND.CALM;
}

// A band's playlist. Calm and uneasy each rotate two tracks (see initMusic's rotation); the rest
// hold one track. The After the Tide scenario (`recovery`) swaps its own calm-band track in place
// of the usual rotation — every other band is unaffected by the scenario.
export function tracksForBand(band, scenario = null) {
  switch (band) {
    case BAND.TITLE: return [TRACKS.recoveryCalm];
    case BAND.DOOM: return [TRACKS.doom];
    case BAND.DREAD: return [TRACKS.dread];
    case BAND.UNEASY: return [TRACKS.uneasyA, TRACKS.uneasyB];
    case BAND.CALM:
    default:
      return scenario === 'recovery' ? [TRACKS.recoveryCalm] : [TRACKS.calmA, TRACKS.calmB];
  }
}

// The band + playlist for a game state in one call (what update() below acts on).
export function playlistFor(state = {}) {
  const band = bandFor(state);
  return { band, tracks: tracksForBand(band, state.scenario || null) };
}

// Whether a playlist should loop its single track natively (a clean, seamless loop point — the
// tracks were rendered for it) rather than rotate. Doom never loops (the ending plays once); any
// band with more than one track rotates instead of looping one file.
export function loopsNatively(band, tracks) {
  return band !== BAND.DOOM && tracks.length === 1;
}

// --- settings: on/off + a bed-volume level, persisted (pure serialize half) ----------------

export const VOLUME_LEVELS = [0.12, 0.22, 0.32, 0.42];
export const DEFAULT_VOLUME_IDX = 2;
const SETTINGS_KEY = 'innsmouth2000-music-settings';
const CROSSFADE_MS = 2000;

export function defaultMusicSettings() {
  return { enabled: true, volumeIdx: DEFAULT_VOLUME_IDX };
}

function clampVolumeIdx(i) {
  const n = Number.isInteger(i) ? i : DEFAULT_VOLUME_IDX;
  return Math.max(0, Math.min(VOLUME_LEVELS.length - 1, n));
}

export function serializeMusicSettings(settings) {
  const s = settings || {};
  return JSON.stringify({ enabled: s.enabled !== false, volumeIdx: clampVolumeIdx(s.volumeIdx) });
}

export function deserializeMusicSettings(text) {
  if (!text) return defaultMusicSettings();
  try {
    const obj = JSON.parse(text);
    return { enabled: obj.enabled !== false, volumeIdx: clampVolumeIdx(obj.volumeIdx) };
  } catch {
    return defaultMusicSettings();
  }
}

// Storage IO, wrapped the way main.js wraps its own save/load: a double-clicked file:// page may
// refuse storage outright, and that must never break the game, only skip persistence for the
// session. `storage` is anything shaped like localStorage (getItem/setItem); tests pass a fake.
export function loadMusicSettings(storage) {
  if (!storage) return defaultMusicSettings();
  try {
    return deserializeMusicSettings(storage.getItem(SETTINGS_KEY));
  } catch {
    return defaultMusicSettings();
  }
}

export function saveMusicSettings(storage, settings) {
  if (!storage) return;
  try {
    storage.setItem(SETTINGS_KEY, serializeMusicSettings(settings));
  } catch {
    // storage refused (private mode, quota, file://); music still plays for this session
  }
}

// --- the DOM runtime (browser-only) ---------------------------------------------------------

export function initMusic(win = typeof window !== 'undefined' ? window : null) {
  const settings = loadMusicSettings(win && win.localStorage);
  const active = !!(win && typeof win.Audio !== 'undefined');

  const state = {
    enabled: settings.enabled,
    volumeIdx: settings.volumeIdx,
    hasAssets: null, // null = unknown/not yet attempted; false = confirmed absent (stay silent)
    gestureReceived: false,
    band: null,
    scenario: null,
    tracks: [],
    idx: 0,
    cur: null,  // { audio, filename, fadeStart }
    prev: null, // { audio, fadeStart } fading out
  };

  if (!active) return makeApi(state, null, null, null);

  const nowMs = () => (win.performance && win.performance.now ? win.performance.now() : Date.now());
  const level = () => (state.enabled ? VOLUME_LEVELS[state.volumeIdx] : 0);

  function stopAll() {
    if (state.cur) { try { state.cur.audio.pause(); } catch { /* already gone */ } state.cur = null; }
    if (state.prev) { try { state.prev.audio.pause(); } catch { /* already gone */ } state.prev = null; }
  }

  function onEnded() {
    if (state.hasAssets === false) return;
    if (state.band === BAND.DOOM || !state.tracks.length) return; // the sting plays once, then quiet
    state.idx = (state.idx + 1) % state.tracks.length;
    beginTrack(state.tracks[state.idx]);
  }

  function playSlot(filename, loop) {
    const audio = new win.Audio(`assets/music/${filename}`);
    audio.loop = loop;
    audio.volume = 0;
    audio.addEventListener('error', () => { state.hasAssets = false; stopAll(); }, { once: true });
    if (!loop) audio.addEventListener('ended', onEnded, { once: true });
    const p = audio.play();
    if (p && p.catch) p.catch(() => {}); // autoplay still blocked: resumed on the next gesture
    return audio;
  }

  function beginTrack(filename) {
    if (!filename) return;
    const loop = loopsNatively(state.band, state.tracks);
    const audio = playSlot(filename, loop);
    if (state.cur) {
      if (state.prev) { try { state.prev.audio.pause(); } catch { /* already gone */ } }
      state.prev = { audio: state.cur.audio, fadeStart: nowMs() };
    }
    state.cur = { audio, filename, fadeStart: nowMs() };
  }

  function retarget(band, scenario) {
    state.band = band;
    state.scenario = scenario;
    state.tracks = tracksForBand(band, scenario);
    state.idx = 0;
    if (state.gestureReceived) beginTrack(state.tracks[0]);
  }

  function stepFade(nowT) {
    if (state.cur) {
      const t = Math.min(1, (nowT - state.cur.fadeStart) / CROSSFADE_MS);
      state.cur.audio.volume = level() * t;
    }
    if (state.prev) {
      const t = Math.min(1, (nowT - state.prev.fadeStart) / CROSSFADE_MS);
      state.prev.audio.volume = Math.max(0, level() * (1 - t));
      if (t >= 1) { try { state.prev.audio.pause(); } catch { /* already gone */ } state.prev = null; }
    }
  }

  function update(gameState = {}) {
    if (state.hasAssets === false) return; // confirmed absent this session; stay silent
    const band = bandFor(gameState, state.band); // hysteresis: pass the current band as context
    const scenario = gameState.scenario || null;
    if (band !== state.band || (band === BAND.CALM && scenario !== state.scenario)) retarget(band, scenario);
    stepFade(nowMs());
  }

  function setEnabled(next) {
    state.enabled = next;
    if (state.cur) {
      if (!next) { try { state.cur.audio.pause(); } catch { /* already gone */ } }
      else { const p = state.cur.audio.play(); if (p && p.catch) p.catch(() => {}); }
    }
    if (state.prev && !next) { try { state.prev.audio.pause(); } catch { /* already gone */ } }
    saveMusicSettings(win.localStorage, { enabled: state.enabled, volumeIdx: state.volumeIdx });
  }

  // Browsers gate autoplay behind a user gesture; the moment one arrives, start whatever band the
  // sim is already in (retarget may have run before the gesture and left tracks queued but silent).
  const kick = () => {
    state.gestureReceived = true;
    win.removeEventListener('pointerdown', kick);
    if (!state.cur && state.tracks.length) beginTrack(state.tracks[0]);
  };
  win.addEventListener('pointerdown', kick);

  return makeApi(state, setEnabled, update, win);
}

function makeApi(state, setEnabled, update, win) {
  return {
    isMuted: () => !state.enabled,
    // Optimistic until a real load fails: before the first gesture nothing has been attempted yet,
    // so we assume present rather than flash a false "not found" on a perfectly good folder.
    hasTrack: () => state.hasAssets !== false,
    toggleMute() {
      const next = !state.enabled;
      if (setEnabled) setEnabled(next); else state.enabled = next;
      return !state.enabled;
    },
    cycleVolume() {
      state.volumeIdx = (state.volumeIdx + 1) % VOLUME_LEVELS.length;
      if (win) saveMusicSettings(win.localStorage, { enabled: state.enabled, volumeIdx: state.volumeIdx });
      return state.volumeIdx;
    },
    volumeIndex: () => state.volumeIdx,
    volumeLevels: () => VOLUME_LEVELS.length,
    update(gameState) { if (update) update(gameState); },
  };
}
