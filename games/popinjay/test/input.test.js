import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ACTIONS, DEFAULT_BINDINGS, PAD_BUTTONS, PAD_BUTTON_LABELS, GAMEPAD_DEADZONE,
  cloneBindings, resolveActions, applyReservedMenuCodes, createInputState, normalizeGamepad, simIntent,
  isLogitechF310DInput, isRebindCancelCode, RESERVED_MENU_CODES, pauseControlLines,
} from '../src/engine/input.js';

test('input: resolves keyboard codes to actions', () => {
  const a = resolveActions({ keys: ['ArrowLeft', 'KeyZ'] });
  assert.ok(a.has(ACTIONS.LEFT));
  assert.ok(a.has(ACTIONS.FIRE));
  assert.ok(!a.has(ACTIONS.RIGHT));
});

test('input: resolves gamepad buttons to actions', () => {
  const buttons = [];
  buttons[0] = true;  // A → fire
  buttons[15] = true; // dpad-right → right
  const a = resolveActions({ pad: { buttons } });
  assert.ok(a.has(ACTIONS.FIRE));
  assert.ok(a.has(ACTIONS.RIGHT));
});

test('input: left stick maps to d-pad with a deadzone', () => {
  assert.ok(resolveActions({ pad: { axes: [-0.9, 0] } }).has(ACTIONS.LEFT));
  assert.ok(resolveActions({ pad: { axes: [0.9, 0] } }).has(ACTIONS.RIGHT));
  assert.ok(resolveActions({ pad: { axes: [0, 0.9] } }).has(ACTIONS.DOWN));
  const none = resolveActions({ pad: { axes: [0.2, -0.2] } });
  assert.ok(!none.has(ACTIONS.LEFT) && !none.has(ACTIONS.RIGHT));
});

test('input: standard mapping table keeps gallery actions on canonical positions', () => {
  assert.equal(PAD_BUTTON_LABELS.length, 17);
  assert.equal(new Set(Object.values(PAD_BUTTONS)).size, 17, 'standard indices are unique');
  assert.deepEqual(Object.values(PAD_BUTTONS), Array.from({ length: 17 }, (_, i) => i));
  assert.deepEqual(DEFAULT_BINDINGS[ACTIONS.FIRE].buttons, [PAD_BUTTONS.A]);
  assert.deepEqual(DEFAULT_BINDINGS[ACTIONS.SIDEARM].buttons, [PAD_BUTTONS.X]);
  assert.deepEqual(DEFAULT_BINDINGS[ACTIONS.CANCEL].buttons, [PAD_BUTTONS.B]);
  assert.deepEqual(DEFAULT_BINDINGS[ACTIONS.TUBA].buttons, [PAD_BUTTONS.Y]);
  assert.deepEqual(DEFAULT_BINDINGS[ACTIONS.OPTIONS].buttons, [PAD_BUTTONS.BACK]);
  assert.deepEqual(DEFAULT_BINDINGS[ACTIONS.PAUSE].buttons, [PAD_BUTTONS.START]);
  assert.deepEqual(DEFAULT_BINDINGS[ACTIONS.QUIT].buttons, [PAD_BUTTONS.LB]);
  assert.ok(GAMEPAD_DEADZONE > 0 && GAMEPAD_DEADZONE < 1);
});

test('input: F310 D-input raw HID snapshot normalizes to standard buttons and POV d-pad', () => {
  const buttons = Array.from({ length: 12 }, () => ({ pressed: false, value: 0 }));
  buttons[1] = { pressed: true, value: 1 }; // raw D-input A
  buttons[9] = { pressed: true, value: 1 }; // raw Start
  const axes = Array(10).fill(0);
  axes[0] = 0.6;
  axes[9] = -1; // raw POV up
  const pad = normalizeGamepad({
    id: 'Logitech F310 Gamepad (Vendor: 046d Product: c216)',
    index: 2,
    connected: true,
    mapping: '',
    buttons,
    axes,
  });
  assert.equal(pad.profile, 'logitech-f310-dinput');
  assert.equal(pad.buttons[PAD_BUTTONS.A], true);
  assert.equal(pad.buttons[PAD_BUTTONS.START], true);
  assert.equal(pad.buttons[PAD_BUTTONS.DPAD_UP], true);
  assert.equal(pad.buttons[PAD_BUTTONS.X], false, 'raw button 0, not 1, is physical X');
  const actions = resolveActions({ pad });
  assert.ok(actions.has(ACTIONS.FIRE));
  assert.ok(actions.has(ACTIONS.PAUSE));
  assert.ok(actions.has(ACTIONS.UP));
  assert.ok(actions.has(ACTIONS.RIGHT), 'normalized left-stick axis remains active');
});

test('input: unknown raw layouts are not guessed', () => {
  assert.equal(normalizeGamepad({ id: 'Mystery USB Pad', mapping: '', connected: true }), null);
  assert.equal(isLogitechF310DInput({ id: 'Generic USB Joystick' }), false);
});

test('input: remap scaffold — rebinding a key changes resolution', () => {
  const b = cloneBindings();
  assert.notEqual(b, DEFAULT_BINDINGS);
  b[ACTIONS.FIRE].keys = ['KeyK'];
  assert.ok(resolveActions({ keys: ['KeyK'] }, b).has(ACTIONS.FIRE));
  assert.ok(!resolveActions({ keys: ['KeyZ'] }, b).has(ACTIONS.FIRE));
});

test('input: edge detection — pressed only on the press tick', () => {
  const st = createInputState();
  st.update(new Set([ACTIONS.FIRE]), 0);
  assert.ok(st.pressed(ACTIONS.FIRE));
  assert.ok(st.isDown(ACTIONS.FIRE));
  st.update(new Set([ACTIONS.FIRE]), 1);
  assert.ok(!st.pressed(ACTIONS.FIRE), 'not pressed while merely held');
  assert.ok(st.isDown(ACTIONS.FIRE));
});

test('input: edge detection — released only on the release tick, heldTicks tracks', () => {
  const st = createInputState();
  st.update(new Set([ACTIONS.SIDEARM]), 0);
  st.update(new Set([ACTIONS.SIDEARM]), 1);
  st.update(new Set([ACTIONS.SIDEARM]), 2);
  assert.equal(st.heldTicks(ACTIONS.SIDEARM), 3);
  st.update(new Set(), 3);
  assert.ok(st.released(ACTIONS.SIDEARM));
  assert.equal(st.heldTicks(ACTIONS.SIDEARM), 0);
  assert.equal(st.releaseHeldTicks(ACTIONS.SIDEARM), 3);
});

test('input: reset clears every held action immediately', () => {
  const input = createInputState();
  input.update(new Set([ACTIONS.RIGHT, ACTIONS.FIRE]), 1);
  assert.equal(input.isDown(ACTIONS.RIGHT), true);
  input.reset();
  assert.equal(input.isDown(ACTIONS.RIGHT), false);
  assert.equal(input.isDown(ACTIONS.FIRE), false);
  assert.equal(input.heldTicks(ACTIONS.RIGHT), 0);
});

test('input: simIntent only exposes walker verbs', () => {
  const a = resolveActions({ keys: ['ArrowLeft', 'KeyZ', 'Escape'] });
  assert.deepEqual(simIntent(a), {
    left: true, right: false, up: false, down: false,
    fire: true, sidearm: false, tuba: false,
  });
});

test('input: Escape is reserved as the rebind-cancel / menu-recovery key', () => {
  assert.equal(isRebindCancelCode('Escape'), true);
  assert.equal(isRebindCancelCode('KeyZ'), false);
  assert.equal(RESERVED_MENU_CODES.cancel, 'Escape');
  assert.equal(RESERVED_MENU_CODES.confirm, 'Enter');
});

test('input: reserved menu codes restore arrows without changing resolveActions', () => {
  const b = cloneBindings();
  b[ACTIONS.DOWN].keys = ['KeyS'];
  b[ACTIONS.UP].keys = ['KeyJ'];
  assert.equal(resolveActions({ keys: ['ArrowDown'] }, b).has(ACTIONS.DOWN), false);
  const menu = applyReservedMenuCodes(resolveActions({ keys: ['ArrowDown'] }, b), ['ArrowDown']);
  assert.ok(menu.has(ACTIONS.DOWN));
  assert.equal(menu.has(ACTIONS.UP), false);
});

test('input: pause control model is eight KEY>PAD rows', () => {
  const lines = pauseControlLines(DEFAULT_BINDINGS);
  assert.equal(lines.length, 8);
  assert.ok(lines.includes('FIRE:Z/SPC>A'));
  assert.ok(lines.includes('PAUSE:ESC/P>START'));
});
