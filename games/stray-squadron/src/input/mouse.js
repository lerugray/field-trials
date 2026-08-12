// Mouse pointer aim/steer for the rail-flight sections (operator-directed M11).
//
// This is PURE mapping only: pointer position within the viewport -> a screen-space
// steer vector in the SAME range and meaning as the stick and keyboard steer ([-1,1]
// on each axis, (0,0) = neutral/centered). main.js adds this vector into the existing
// steerX/steerY sum, so the mouse reuses the one movement model — it never forks a
// second one (DIRECTIONS-M11 §1). The mapping is ABSOLUTE: a centered pointer reads
// neutral, so it never fights the stick/keys, and the mouse is purely additive
// (DIRECTIONS-M11 §2 — additive, never required).
//
// Headless-testable: no DOM, no listeners, just the math. The live pointer listener
// and the enable/sensitivity settings live in main.js and settings.js.

// The sensitivity range. Because the mapping is absolute, sensitivity has an exact
// physical meaning: at S, the cursor reaches FULL deflection after travelling 1/S of
// the half-viewport-width from center. S=1 needs the whole half-width (640px on a
// 1280-wide window) — what the operator called "pretty subtle" (2026-08-07). The
// ceiling of 8.0 reaches full deflection inside 12.5% of the half-width (80px at
// 1280): a wrist movement. The DEFAULT is 4.0 (full deflection at a quarter of the
// half-width / 160px at 1280) so a fresh profile feels usable without touching the
// slider; 1.0 remains reachable for anyone who wants the gentler end.
// The one definition. settings.js aliases min/max/step off this object (and consumes
// `.default` for DEFAULT_SETTINGS) rather than re-exporting names, because the
// single-file build refuses `export { ... }` blocks — see test/build-contract.test.js.
export const MOUSE_SENS = { min: 0.25, max: 8.0, step: 0.25, default: 4.0 };

export const MOUSE_SENS_MIN = MOUSE_SENS.min;
export const MOUSE_SENS_MAX = MOUSE_SENS.max;
export const MOUSE_SENS_STEP = MOUSE_SENS.step;  // one nudge; keeps the grid round
export const MOUSE_SENS_DEFAULT = MOUSE_SENS.default; // full deflection at 1/4 of half-width

// The fraction of the half-viewport-width the cursor must travel from center to reach
// full deflection at sensitivity `s`. Stated as a function so the menu copy and the
// tests read the same number the mapping actually uses. A result above 1 means full
// deflection is unreachable inside the viewport at that setting (sensitivity below 1).
export function fullDeflectionFraction(s) {
  const v = clamp(Number.isFinite(s) ? s : MOUSE_SENS_DEFAULT, MOUSE_SENS_MIN, MOUSE_SENS_MAX);
  return 1 / v;
}

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

// pointer: { x, y } in CSS pixels (0,0 = top-left of the viewport), or null before the
// mouse has moved. viewport: { w, h } in CSS pixels. sensitivity scales how quickly the
// deflection reaches full: at 1.0 the viewport edge is full stick; >1 reaches full
// before the edge (more responsive), <1 never quite reaches full (gentler).
// Y is positive-downward (pointer-down => steer-down), matching the keyboard/stick raw
// axis BEFORE invert-Y is applied by the caller.
export function mouseSteer(pointer, viewport, sensitivity = MOUSE_SENS_DEFAULT) {
  if (!pointer || !viewport) return { x: 0, y: 0 };
  const w = viewport.w, h = viewport.h;
  if (!(w > 0) || !(h > 0)) return { x: 0, y: 0 };
  const s = clamp(
    Number.isFinite(sensitivity) ? sensitivity : MOUSE_SENS_DEFAULT,
    MOUSE_SENS_MIN, MOUSE_SENS_MAX);
  const nx = (pointer.x / w) * 2 - 1; // [-1..1] across the width, 0 at center
  const ny = (pointer.y / h) * 2 - 1; // [-1..1] across the height, 0 at center
  return {
    x: clamp(nx * s, -1, 1),
    y: clamp(ny * s, -1, 1),
  };
}
