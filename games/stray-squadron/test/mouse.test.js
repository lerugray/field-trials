import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mouseSteer, MOUSE_SENS_MIN, MOUSE_SENS_MAX, MOUSE_SENS_DEFAULT, fullDeflectionFraction,
} from '../src/input/mouse.js';

const close = (a, b, e = 1e-9) => Math.abs(a - b) <= e;
const VP = { w: 1280, h: 800 };

test('a centered pointer reads neutral (never fights the stick)', () => {
  const s = mouseSteer({ x: 640, y: 400 }, VP, 1.0);
  assert.ok(close(s.x, 0));
  assert.ok(close(s.y, 0));
});

test('the four edges reach full deflection at sensitivity 1.0', () => {
  assert.ok(close(mouseSteer({ x: 0, y: 400 }, VP, 1).x, -1));
  assert.ok(close(mouseSteer({ x: 1280, y: 400 }, VP, 1).x, 1));
  assert.ok(close(mouseSteer({ x: 640, y: 0 }, VP, 1).y, -1));
  assert.ok(close(mouseSteer({ x: 640, y: 800 }, VP, 1).y, 1));
});

test('Y is positive-downward (pre-invert), matching the stick/keyboard raw axis', () => {
  assert.ok(mouseSteer({ x: 640, y: 700 }, VP, 1).y > 0); // pointer below center -> steer down
  assert.ok(mouseSteer({ x: 640, y: 100 }, VP, 1).y < 0); // pointer above center -> steer up
});

test('output stays within [-1,1] on every axis, even past the edge', () => {
  const s = mouseSteer({ x: 5000, y: -3000 }, VP, MOUSE_SENS_MAX);
  assert.ok(s.x >= -1 && s.x <= 1);
  assert.ok(s.y >= -1 && s.y <= 1);
  assert.equal(s.x, 1);
  assert.equal(s.y, -1);
});

test('higher sensitivity reaches full deflection before the viewport edge', () => {
  const p = { x: 960, y: 400 }; // three-quarters across -> nx = 0.5
  assert.ok(close(mouseSteer(p, VP, 1).x, 0.5));
  assert.ok(close(mouseSteer(p, VP, 2).x, 1)); // 0.5 * 2 clamps to full
  assert.ok(mouseSteer(p, VP, 0.5).x < 0.5); // gentler: 0.25
});

test('sensitivity is clamped to the documented range', () => {
  const p = { x: 800, y: 400 }; // nx = 0.25
  // Absurdly high sensitivity clamps to MAX, not infinity.
  assert.ok(close(mouseSteer(p, VP, 999).x, Math.min(1, 0.25 * MOUSE_SENS_MAX)));
  // Zero/negative clamps up to MIN (still a small positive scale, never a flip).
  assert.ok(close(mouseSteer(p, VP, 0).x, 0.25 * MOUSE_SENS_MIN));
  assert.ok(mouseSteer(p, VP, -5).x > 0);
});

test('a non-finite sensitivity falls back to the default', () => {
  const p = { x: 960, y: 400 }; // nx = 0.5
  const expected = Math.min(1, 0.5 * MOUSE_SENS_DEFAULT);
  assert.ok(close(mouseSteer(p, VP, NaN).x, expected));
  assert.ok(close(mouseSteer(p, VP, undefined).x, expected));
});

test('a null pointer or a degenerate viewport reads neutral (never NaN)', () => {
  assert.deepEqual(mouseSteer(null, VP, 1), { x: 0, y: 0 });
  assert.deepEqual(mouseSteer({ x: 1, y: 1 }, null, 1), { x: 0, y: 0 });
  assert.deepEqual(mouseSteer({ x: 1, y: 1 }, { w: 0, h: 800 }, 1), { x: 0, y: 0 });
  assert.deepEqual(mouseSteer({ x: 1, y: 1 }, { w: 1280, h: 0 }, 1), { x: 0, y: 0 });
});

test('MIN < DEFAULT < MAX (a sane conservative default)', () => {
  assert.ok(MOUSE_SENS_MIN < MOUSE_SENS_DEFAULT);
  assert.ok(MOUSE_SENS_DEFAULT < MOUSE_SENS_MAX);
});

// ---- Sensitivity headroom (operator, 2026-08-07: "the mouse movement is pretty
// subtle right now"). Because the mapping is absolute, sensitivity has an exact
// physical meaning — full deflection arrives after 1/S of the half-viewport-width of
// cursor travel — so "subtle" is measurable, not a matter of taste. These hold the
// ceiling to a setting that is genuinely quick, and prove the slider's ends actually
// steer differently rather than just printing different numbers.

const HALF_W = VP.w / 2;
// Cursor travel from center, as a fraction of the half-viewport-width, needed to
// reach full deflection. Measured off mouseSteer itself, not assumed from the formula.
function travelToFullDeflection(sens) {
  for (let px = 1; px <= HALF_W; px++) {
    if (mouseSteer({ x: 640 + px, y: 400 }, VP, sens).x >= 1) return px / HALF_W;
  }
  return 1;
}

test('the ceiling reaches full deflection in a wrist movement, not a drag', () => {
  const frac = travelToFullDeflection(MOUSE_SENS_MAX);
  assert.ok(frac <= 0.15,
    `at max sensitivity full deflection still needs ${(frac * 100).toFixed(1)}% of the half-width`);
  assert.ok(frac * HALF_W <= 100,
    `${Math.round(frac * HALF_W)}px of travel at 1280 wide is still a drag`);
});

test('the ceiling is real headroom over the old 3.0, not a token bump', () => {
  const now = travelToFullDeflection(MOUSE_SENS_MAX);
  const old = travelToFullDeflection(3.0); // the previous ceiling
  assert.ok(old / now >= 2.5,
    `only ${(old / now).toFixed(2)}x quicker than the old ceiling`);
});

test('the default is 4.0 — full deflection in a quarter of the half-width', () => {
  assert.equal(MOUSE_SENS_DEFAULT, 4.0);
  assert.ok(close(travelToFullDeflection(MOUSE_SENS_DEFAULT), 0.25));
});

test('the slider ends produce proportionally different steering, same pointer', () => {
  // 10% of half-width stays unclamped at default 4.0 and at max 8.0, so ratios are honest.
  const frac = 0.1;
  const p = { x: 640 + frac * HALF_W, y: 400 };
  const at = (s) => mouseSteer(p, VP, s).x;
  const lo = at(MOUSE_SENS_MIN), mid = at(MOUSE_SENS_DEFAULT), hi = at(MOUSE_SENS_MAX);
  assert.ok(close(lo, frac * MOUSE_SENS_MIN));
  assert.ok(close(mid, frac * MOUSE_SENS_DEFAULT));
  assert.ok(close(hi, frac * MOUSE_SENS_MAX));
  assert.ok(mid / lo >= 3, `min->default is only ${(mid / lo).toFixed(2)}x`);
  assert.ok(hi / mid >= 1.5, `default->max is only ${(hi / mid).toFixed(2)}x`);
});

test('fullDeflectionFraction states the same number the mapping measures', () => {
  for (const s of [MOUSE_SENS_MIN, 1, 2, 4, MOUSE_SENS_MAX]) {
    // Below sensitivity 1 the stated fraction exceeds 1 — full deflection is simply
    // unreachable inside the viewport — so the measurement caps where the screen does.
    const stated = Math.min(1, fullDeflectionFraction(s));
    assert.ok(Math.abs(stated - travelToFullDeflection(s)) < 0.01,
      `stated vs measured travel disagree at sensitivity ${s}`);
  }
  // out-of-range asks clamp rather than lying
  assert.equal(fullDeflectionFraction(999), 1 / MOUSE_SENS_MAX);
  assert.equal(fullDeflectionFraction(0), 1 / MOUSE_SENS_MIN);
});

test('the settings module and the input module state ONE range, not two', async () => {
  const s = await import('../src/core/settings.js');
  assert.equal(s.MOUSE_SENS_MIN, MOUSE_SENS_MIN);
  assert.equal(s.MOUSE_SENS_MAX, MOUSE_SENS_MAX);
});

test('the slider step walks the whole range in a sane number of presses', async () => {
  const { MOUSE_SENS_STEP } = await import('../src/input/mouse.js');
  const presses = (MOUSE_SENS_MAX - MOUSE_SENS_MIN) / MOUSE_SENS_STEP;
  assert.ok(presses <= 40, `${presses} presses to cross the slider`);
  // the default lands exactly on the step grid, so nudging never strands an odd value
  assert.ok(close((MOUSE_SENS_DEFAULT - MOUSE_SENS_MIN) / MOUSE_SENS_STEP % 1, 0));
});
