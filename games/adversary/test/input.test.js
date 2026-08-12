import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ACTIONS, DEFAULT_BINDINGS, cloneBindings, resolveActions, createInputState,
} from '../src/core/input.js';
import { FEEL } from '../src/config/feel.js';

test('input: resolves keyboard codes to actions', () => {
  const a = resolveActions({ keys: ['ArrowLeft', 'KeyK'] });
  assert.ok(a.has(ACTIONS.LEFT));
  assert.ok(a.has(ACTIONS.JUMP));
  assert.ok(!a.has(ACTIONS.RIGHT));
});

test('input: resolves gamepad buttons to actions', () => {
  const buttons = [];
  buttons[0] = true;  // A → jump
  buttons[15] = true; // dpad-right → right
  const a = resolveActions({ pad: { buttons } });
  assert.ok(a.has(ACTIONS.JUMP));
  assert.ok(a.has(ACTIONS.RIGHT));
});

test('input: left stick maps to d-pad with a deadzone', () => {
  assert.ok(resolveActions({ pad: { axes: [-0.9, 0] } }).has(ACTIONS.LEFT));
  assert.ok(resolveActions({ pad: { axes: [0.9, 0] } }).has(ACTIONS.RIGHT));
  assert.ok(resolveActions({ pad: { axes: [0, 0.9] } }).has(ACTIONS.DOWN));
  // Inside the deadzone → nothing.
  const none = resolveActions({ pad: { axes: [0.2, -0.2] } });
  assert.ok(!none.has(ACTIONS.LEFT) && !none.has(ACTIONS.RIGHT));
});

test('input: remap scaffold — rebinding a key changes resolution', () => {
  const b = cloneBindings();
  assert.notEqual(b, DEFAULT_BINDINGS); // deep clone, not shared
  b[ACTIONS.JUMP].keys = ['KeyZ'];
  assert.ok(resolveActions({ keys: ['KeyZ'] }, b).has(ACTIONS.JUMP));
  assert.ok(!resolveActions({ keys: ['KeyK'] }, b).has(ACTIONS.JUMP));
});

test('input: edge detection — pressed only on the press tick', () => {
  const st = createInputState();
  st.update(new Set([ACTIONS.JUMP]), 0);
  assert.ok(st.pressed(ACTIONS.JUMP));
  assert.ok(st.isDown(ACTIONS.JUMP));
  st.update(new Set([ACTIONS.JUMP]), 1);
  assert.ok(!st.pressed(ACTIONS.JUMP), 'not pressed while merely held');
  assert.ok(st.isDown(ACTIONS.JUMP));
});

test('input: edge detection — released only on the release tick, heldTicks tracks', () => {
  const st = createInputState();
  st.update(new Set([ACTIONS.ATTACK]), 0);
  st.update(new Set([ACTIONS.ATTACK]), 1);
  st.update(new Set([ACTIONS.ATTACK]), 2);
  assert.equal(st.heldTicks(ACTIONS.ATTACK), 3);
  st.update(new Set(), 3);
  assert.ok(st.released(ACTIONS.ATTACK));
  assert.equal(st.heldTicks(ACTIONS.ATTACK), 0);
  assert.equal(st.releaseHeldTicks(ACTIONS.ATTACK), 3);
});

test('input: double-tap within the window triggers, outside does not', () => {
  const st = createInputState();
  // Tap 1 at tick 0 (press then release).
  st.update(new Set([ACTIONS.LEFT]), 0);
  st.update(new Set(), 1);
  // Tap 2 within DOUBLE_TAP_TICKS → double-tap on that press tick.
  const t2 = FEEL.DOUBLE_TAP_TICKS; // boundary: gap == window is allowed
  st.update(new Set([ACTIONS.LEFT]), t2);
  assert.ok(st.doubleTapped(ACTIONS.LEFT), 'double tap at the window boundary');
  st.update(new Set(), t2 + 1);

  // A late second tap → no double-tap.
  const st2 = createInputState();
  st2.update(new Set([ACTIONS.RIGHT]), 0);
  st2.update(new Set(), 1);
  st2.update(new Set([ACTIONS.RIGHT]), FEEL.DOUBLE_TAP_TICKS + 5);
  assert.ok(!st2.doubleTapped(ACTIONS.RIGHT), 'gap beyond window is not a double tap');
});

test('input: chargeRatio ramps from 0 to 1 across the charge window', () => {
  const st = createInputState();
  // Below CHARGE_MIN → 0.
  st.update(new Set([ACTIONS.ATTACK]), 0);
  assert.equal(st.chargeRatio(ACTIONS.ATTACK), 0);
  // Hold to full.
  for (let t = 1; t < FEEL.CHARGE_FULL_TICKS; t++) st.update(new Set([ACTIONS.ATTACK]), t);
  assert.equal(st.chargeRatio(ACTIONS.ATTACK), 1);
  // Just past min but not full → between 0 and 1.
  const st2 = createInputState();
  for (let t = 0; t < FEEL.CHARGE_MIN_TICKS + 1; t++) st2.update(new Set([ACTIONS.ATTACK]), t);
  const r = st2.chargeRatio(ACTIONS.ATTACK);
  assert.ok(r > 0 && r < 1, `partial charge ${r}`);
});
