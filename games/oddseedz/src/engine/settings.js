// Player settings (M10) — the accessibility + preferences panel's data model.
// Pure and storage-adapter based (same shape as save.js): normalize, migrate,
// round-trip through any getItem/setItem store. The UI panel and the audio/render
// layers read these; nothing here touches the DOM or WebAudio, so it is fully
// unit-tested.

export const SETTINGS_KEY = 'oddseedz.settings.v1';

// MOTION has three values: 'auto' defers to the OS prefers-reduced-motion pref;
// 'full' and 'reduced' are explicit player overrides of it. This is why the
// accessibility panel can offer a real choice instead of only mirroring the OS.
export const MOTION_MODES = ['auto', 'full', 'reduced'];

// The defaults a fresh player gets. Sound ON (but mute is one tap away and
// mandatory-present), motion AUTO (respect the OS), flashes ON (bright battle
// VFX / KO flash — off is the photosensitivity-safe path).
export const DEFAULT_SETTINGS = Object.freeze({
  sound: true,
  motion: 'auto',
  flashes: true,
});

const asBool = (v, fallback) => (typeof v === 'boolean' ? v : fallback);
const asMotion = (v) => (MOTION_MODES.includes(v) ? v : DEFAULT_SETTINGS.motion);

// Coerce any partial/garbage object into a complete, legal settings object.
// Never throws; unknown keys are dropped, bad values fall back to the default.
export function normalizeSettings(raw) {
  const s = raw && typeof raw === 'object' ? raw : {};
  return {
    sound: asBool(s.sound, DEFAULT_SETTINGS.sound),
    motion: asMotion(s.motion),
    flashes: asBool(s.flashes, DEFAULT_SETTINGS.flashes),
  };
}

export function defaultSettings() {
  return { ...DEFAULT_SETTINGS };
}

// Resolve whether motion should be REDUCED right now, given the settings and the
// live OS preference (osReduced = window.matchMedia('(prefers-reduced-motion)')).
// 'auto' follows the OS; explicit modes win.
export function shouldReduceMotion(settings, osReduced) {
  const s = normalizeSettings(settings);
  if (s.motion === 'reduced') return true;
  if (s.motion === 'full') return false;
  return !!osReduced;
}

// --- persistence (storage = anything with getItem/setItem[/removeItem]) -------

export function loadSettings(storage) {
  let raw = null;
  try {
    raw = storage.getItem(SETTINGS_KEY);
  } catch {
    return defaultSettings();
  }
  if (typeof raw !== 'string' || raw.length === 0) return defaultSettings();
  try {
    return normalizeSettings(JSON.parse(raw));
  } catch {
    return defaultSettings();
  }
}

export function saveSettings(storage, settings) {
  const clean = normalizeSettings(settings);
  try {
    storage.setItem(SETTINGS_KEY, JSON.stringify(clean));
  } catch {
    /* storage full / unavailable — settings just don't persist this session */
  }
  return clean;
}
