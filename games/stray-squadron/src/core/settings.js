// Player settings — the accessibility law's persistent state (hard rule 8): master
// mute, reduced-motion, FOV lock (+ FOV value), invert-Y. Live from M2, never an
// afterthought. Pure logic with an INJECTABLE storage (localStorage in the browser,
// a plain object in tests) so the load/clamp/persist rules are headless-testable.
// Pause is a runtime toggle, not a persisted setting, so it lives in main.
//
// The mouse-sensitivity range is imported from input/mouse.js rather than re-typed
// here: the numbers only mean anything in terms of the pointer mapping that consumes
// them, and the two hand-kept copies had already started to read as separate facts.

import { MOUSE_SENS } from '../input/mouse.js';

export const DEFAULT_SETTINGS = {
  muted: false,
  reducedMotion: false,
  fovLock: false,
  fov: 65,       // degrees
  invertY: false,
  deadzone: 0.15, // analog-stick deadzone (the M9 remap-menu option)
  musicVolume: 0.5, // music bed level [0..1] (the M9 audio option)
  mouseAim: true, // pointer aim/steer in flight (M11) — DEFAULT ON since M15 (operator call 2026-08-07): analog easing is the intended way to fly a rail shooter; keyboard remains the fallback
  mouseSensitivity: MOUSE_SENS.default, // canonical default from input/mouse.js (4.0 since v16)
};

export const FOV_MIN = 55;
export const FOV_MAX = 95;
export const DEADZONE_MIN = 0.02;
export const DEADZONE_MAX = 0.40;
export const MOUSE_SENS_MIN = MOUSE_SENS.min;
export const MOUSE_SENS_MAX = MOUSE_SENS.max;
export const MOUSE_SENS_STEP = MOUSE_SENS.step;
const KEY = 'stray.settings';
// Settings-payload version, stamped into every persist. Migrations are keyed off this:
//   • pre-M15 (<15): ambient mouseAim:false (whole-object persist of the old OFF
//     default) is dropped so the M15 ON default applies; stamped v≥15 choices stay.
//   • pre-v16 (<16): mouseSensitivity 1.0, indistinguishable from the old untouched
//     baseline, is dropped so the v16 4.0 default applies; any other pre-v16 value,
//     and every v16 value including an explicit 1.0, is preserved as player intent.
export const SETTINGS_VERSION = 16;
const MOUSE_AIM_ON_SINCE = 15;       // M15: mouse aim default flipped ON
const SENS_DEFAULT_SINCE = 16;       // v16: sensitivity default 1.0 → 4.0
const OLD_SENS_BASELINE = 1.0;       // pre-v16 untouched baseline

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

function sanitize(o) {
  return {
    muted: !!o.muted,
    reducedMotion: !!o.reducedMotion,
    fovLock: !!o.fovLock,
    fov: clamp(Number.isFinite(o.fov) ? o.fov : DEFAULT_SETTINGS.fov, FOV_MIN, FOV_MAX),
    invertY: !!o.invertY,
    deadzone: clamp(
      Number.isFinite(o.deadzone) ? o.deadzone : DEFAULT_SETTINGS.deadzone,
      DEADZONE_MIN, DEADZONE_MAX),
    musicVolume: clamp(
      Number.isFinite(o.musicVolume) ? o.musicVolume : DEFAULT_SETTINGS.musicVolume, 0, 1),
    // Saves from before M15 (no mouseAim key) take the new default; an explicit
    // player choice — either way — is preserved.
    mouseAim: o.mouseAim === undefined ? DEFAULT_SETTINGS.mouseAim : !!o.mouseAim,
    mouseSensitivity: clamp(
      Number.isFinite(o.mouseSensitivity) ? o.mouseSensitivity : DEFAULT_SETTINGS.mouseSensitivity,
      MOUSE_SENS_MIN, MOUSE_SENS_MAX),
  };
}

export function createSettings(storage) {
  const store =
    storage || (typeof localStorage !== 'undefined' ? localStorage : null);

  let s = { ...DEFAULT_SETTINGS };
  if (store) {
    try {
      const raw = store.getItem(KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        const ver = parsed.v ?? 0;
        // Pre-M15 ambient mouseAim:false — drop so the ON default applies. Keyed to
        // MOUSE_AIM_ON_SINCE (15), not SETTINGS_VERSION, so a later version bump does
        // not re-migrate a real stamped M15 opt-out.
        if (ver < MOUSE_AIM_ON_SINCE && parsed.mouseAim === false) delete parsed.mouseAim;
        // Pre-v16 ambient sensitivity baseline 1.0 — drop so the 4.0 default applies.
        // Keyed to SENS_DEFAULT_SINCE (16), not SETTINGS_VERSION, so a later bump does
        // not re-migrate a real stamped v16 choice of 1.0. A non-1.0 pre-v16 value is kept.
        if (ver < SENS_DEFAULT_SINCE && parsed.mouseSensitivity === OLD_SENS_BASELINE) {
          delete parsed.mouseSensitivity;
        }
        s = sanitize({ ...s, ...parsed });
      }
    } catch (e) {
      // corrupt/unavailable storage -> defaults, never throw
    }
  }

  function persist() {
    if (!store) return;
    try {
      store.setItem(KEY, JSON.stringify({ ...s, v: SETTINGS_VERSION }));
    } catch (e) {
      /* storage full/blocked -> keep in-memory */
    }
  }

  return {
    get: (k) => s[k],
    all: () => ({ ...s }),
    set(k, v) {
      s = sanitize({ ...s, [k]: v });
      persist();
      return s[k];
    },
    toggle(k) {
      s = sanitize({ ...s, [k]: !s[k] });
      persist();
      return s[k];
    },
    adjustFov(delta) {
      s.fov = clamp(s.fov + delta, FOV_MIN, FOV_MAX);
      persist();
      return s.fov;
    },
    adjustDeadzone(delta) {
      s.deadzone = clamp(s.deadzone + delta, DEADZONE_MIN, DEADZONE_MAX);
      persist();
      return s.deadzone;
    },
    adjustMusicVolume(delta) {
      s.musicVolume = clamp(s.musicVolume + delta, 0, 1);
      persist();
      return s.musicVolume;
    },
    adjustMouseSensitivity(delta) {
      s.mouseSensitivity = clamp(s.mouseSensitivity + delta, MOUSE_SENS_MIN, MOUSE_SENS_MAX);
      persist();
      return s.mouseSensitivity;
    },
  };
}
