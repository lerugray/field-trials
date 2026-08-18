import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ACTIONS, DEFAULT_BINDINGS, ACTION_LIST, cloneBindings, setKeyBinding, setPadBinding,
  serializeBindings, loadBindings, resolveActions, applyReservedMenuCodes, createPadSession, PAD_BUTTONS,
  BINDS_KEY, RESERVED_MENU_CODES, isRebindCancelCode, keyBindingLabel, keyBindingConflict, padBindingConflict,
} from '../src/engine/input.js';

function fakeStore() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
  };
}

function standardPad(index = 0) {
  return {
    id: 'Synthetic Standard Gamepad',
    index,
    connected: true,
    mapping: 'standard',
    buttons: Array.from({ length: 17 }, () => false),
    axes: [0, 0, 0, 0],
  };
}

test('remap: rebinding a key changes resolution and leaves defaults intact', () => {
  const b = cloneBindings();
  setKeyBinding(b, ACTIONS.FIRE, ['KeyK']);
  assert.ok(resolveActions({ keys: ['KeyK'] }, b).has(ACTIONS.FIRE));
  assert.ok(!resolveActions({ keys: ['KeyZ'] }, b).has(ACTIONS.FIRE));
  assert.ok(DEFAULT_BINDINGS[ACTIONS.FIRE].keys.includes('KeyZ'));
});

test('remap: rebinding a gamepad button changes resolution', () => {
  const b = cloneBindings();
  setPadBinding(b, ACTIONS.SIDEARM, [7]);
  const buttons = []; buttons[7] = true;
  assert.ok(resolveActions({ pad: { buttons } }, b).has(ACTIONS.SIDEARM));
});

test('remap: PERSISTS through serialize → storage → load (keyboard + gamepad)', () => {
  const storage = fakeStore();
  const b = cloneBindings();
  setKeyBinding(b, ACTIONS.TUBA, ['KeyC']);
  setPadBinding(b, ACTIONS.TUBA, [5]);
  storage.setItem(BINDS_KEY, JSON.stringify(serializeBindings(b)));

  const loaded = loadBindings(JSON.parse(storage.getItem(BINDS_KEY)));
  assert.deepEqual(loaded[ACTIONS.TUBA].keys, ['KeyC']);
  assert.deepEqual(loaded[ACTIONS.TUBA].buttons, [5]);
  assert.ok(resolveActions({ keys: ['KeyC'] }, loaded).has(ACTIONS.TUBA));
  const buttons = []; buttons[5] = true;
  assert.ok(resolveActions({ pad: { buttons } }, loaded).has(ACTIONS.TUBA));
});

test('remap: options binding payload round-trips every standard pad array unchanged', () => {
  const storage = fakeStore();
  const before = cloneBindings();
  let button = 0;
  for (const action of ACTION_LIST) setPadBinding(before, action, [button++ % 17]);
  storage.setItem(BINDS_KEY, JSON.stringify(serializeBindings(before)));
  const after = loadBindings(JSON.parse(storage.getItem(BINDS_KEY)));
  assert.deepEqual(serializeBindings(after), serializeBindings(before));
});

test('remap: loadBindings fills missing/corrupt actions from defaults', () => {
  const loaded = loadBindings({ [ACTIONS.FIRE]: { keys: ['KeyK'], buttons: [] } });
  assert.deepEqual(loaded[ACTIONS.FIRE].keys, ['KeyK']);
  assert.deepEqual(loaded[ACTIONS.LEFT].keys, [...DEFAULT_BINDINGS[ACTIONS.LEFT].keys]);
  const g = loadBindings('nonsense');
  assert.deepEqual(g[ACTIONS.SIDEARM].keys, [...DEFAULT_BINDINGS[ACTIONS.SIDEARM].keys]);
});

test('remap: every gallery action is individually rebindable on keyboard AND gamepad', () => {
  const b = cloneBindings();
  for (const a of [ACTIONS.FIRE, ACTIONS.SIDEARM, ACTIONS.TUBA, ACTIONS.PAUSE, ACTIONS.LEFT, ACTIONS.RIGHT, ACTIONS.UP, ACTIONS.DOWN]) {
    setKeyBinding(b, a, ['KeyQ']);
    setPadBinding(b, a, [11]);
    assert.deepEqual(b[a].keys, ['KeyQ']);
    assert.deepEqual(b[a].buttons, [11]);
  }
});

test('remap: pad rebind does not steal the keyboard binding (lockout recovery)', () => {
  const b = cloneBindings();
  setPadBinding(b, ACTIONS.CONFIRM, [5]);
  setPadBinding(b, ACTIONS.CANCEL, [7]);
  setPadBinding(b, ACTIONS.PAUSE, [4]);
  assert.ok(resolveActions({ keys: [RESERVED_MENU_CODES.confirm] }, b).has(ACTIONS.CONFIRM), 'Enter still confirms');
  assert.ok(resolveActions({ keys: [RESERVED_MENU_CODES.cancel] }, b).has(ACTIONS.CANCEL), 'Escape still cancels');
  assert.ok(resolveActions({ keys: [RESERVED_MENU_CODES.cancel] }, b).has(ACTIONS.PAUSE), 'Escape still pauses');
  assert.equal(isRebindCancelCode(RESERVED_MENU_CODES.cancel), true);
});

test('remap: reserved menu arrows survive rebound climb and a poisoned same-key profile', () => {
  const b = cloneBindings();
  setKeyBinding(b, ACTIONS.DOWN, ['KeyS']);
  setKeyBinding(b, ACTIONS.UP, ['KeyW']);
  assert.equal(resolveActions({ keys: ['ArrowDown'] }, b).has(ACTIONS.DOWN), false,
    'resolveActions stays binding-only so play still honours the rebind');
  assert.ok(resolveActions({ keys: ['KeyS'] }, b).has(ACTIONS.DOWN));
  const menuDown = applyReservedMenuCodes(resolveActions({ keys: ['ArrowDown'] }, b), ['ArrowDown']);
  assert.ok(menuDown.has(ACTIONS.DOWN), 'reserved ArrowDown still navigates menus');

  setKeyBinding(b, ACTIONS.UP, ['KeyJ']);
  setKeyBinding(b, ACTIONS.DOWN, ['KeyJ']);
  const frozen = resolveActions({ keys: ['KeyJ'] }, b);
  assert.equal(frozen.has(ACTIONS.UP) && frozen.has(ACTIONS.DOWN), false,
    'exclusive pair must not both fire from one key');
  assert.ok(frozen.has(ACTIONS.DOWN), 'last-listed action (Climb-down) wins the shared key');
  assert.equal(frozen.has(ACTIONS.UP), false);
  // The setters stay dumb: refusal lives at the rebind seam (app.js asks
  // keyBindingConflict and rejects the press). A binding object poisoned directly,
  // as here, still reaches resolveActions with both verbs holding KeyJ — the
  // runtime guard is the belt that keeps the menu usable anyway.
  assert.ok(b[ACTIONS.UP].keys.includes('KeyJ') && b[ACTIONS.DOWN].keys.includes('KeyJ'),
    'setKeyBinding writes exactly what it is given; it never steals from the sibling');
  const arrow = applyReservedMenuCodes(resolveActions({ keys: ['ArrowDown'] }, b), ['ArrowDown']);
  assert.ok(arrow.has(ACTIONS.DOWN));
  assert.equal(arrow.has(ACTIONS.UP), false, 'reserved ArrowDown is DOWN only, so the cursor can move');

  // Same-tick Options evaluation: UP then DOWN used to net zero cursor motion.
  const n = 11;
  let cursor = 3;
  if (frozen.has(ACTIONS.UP)) cursor = (cursor + n - 1) % n;
  if (frozen.has(ACTIONS.DOWN)) cursor = (cursor + 1) % n;
  assert.notEqual(cursor, 3, 'KeyJ itself must move the Options cursor under the runtime guard');
});

test('remap: an exclusive duplicate is refused at the seam, healed on load, belted at runtime', () => {
  const b = cloneBindings();
  setKeyBinding(b, ACTIONS.LEFT, ['KeyA']);
  // First line of defence: the seam refuses before any setter runs.
  assert.equal(keyBindingConflict(b, ACTIONS.RIGHT, 'KeyA'), ACTIONS.LEFT,
    'Walk-right cannot take the key already held by Walk-left');
  // Written anyway (a pre-guard save, or hand-edited storage): motion stays non-zero.
  setKeyBinding(b, ACTIONS.RIGHT, ['KeyA']);
  const step = resolveActions({ keys: ['KeyA'] }, b);
  assert.equal(step.has(ACTIONS.RIGHT), true);
  assert.equal(step.has(ACTIONS.LEFT), false);

  // Space stays shared between Fire and Confirm — not an exclusive pair.
  assert.ok(DEFAULT_BINDINGS[ACTIONS.FIRE].keys.includes('Space'));
  assert.ok(DEFAULT_BINDINGS[ACTIONS.CONFIRM].keys.includes('Space'));
  const space = resolveActions({ keys: ['Space'] });
  assert.ok(space.has(ACTIONS.FIRE) && space.has(ACTIONS.CONFIRM));

  const poison = loadBindings({
    [ACTIONS.UP]: { keys: ['KeyJ'], buttons: [12] },
    [ACTIONS.DOWN]: { keys: ['KeyJ'], buttons: [13] },
  });
  assert.equal(poison[ACTIONS.DOWN].keys.includes('KeyJ'), true);
  assert.equal(poison[ACTIONS.UP].keys.includes('KeyJ'), false,
    'hand-crafted same-key climb profile is sanitized on load');
  const j = resolveActions({ keys: ['KeyJ'] }, poison);
  assert.equal(j.has(ACTIONS.DOWN), true);
  assert.equal(j.has(ACTIONS.UP), false);
});

test('remap: duplicate keys are refused only for mutually exclusive movement actions', () => {
  const b = cloneBindings();
  setKeyBinding(b, ACTIONS.UP, ['KeyJ']);
  assert.equal(keyBindingConflict(b, ACTIONS.DOWN, 'KeyJ'), ACTIONS.UP,
    'Climb-down cannot take the key already held by Climb-up');
  assert.equal(keyBindingConflict(b, ACTIONS.RIGHT, 'ArrowLeft'), ACTIONS.LEFT,
    'opposing walk directions have the same zero-intent guard');
  assert.equal(keyBindingConflict(b, ACTIONS.CONFIRM, 'Space'), null,
    'intentional Fire/Confirm duplicate remains legal');
  assert.equal(keyBindingConflict(b, ACTIONS.CANCEL, 'Escape'), null,
    'intentional Pause/Cancel duplicate remains legal');
});

test('remap: the duplicate refusal covers pad buttons, not just keys', () => {
  const b = cloneBindings();
  setPadBinding(b, ACTIONS.UP, [PAD_BUTTONS.DPAD_UP]);
  assert.equal(padBindingConflict(b, ACTIONS.DOWN, PAD_BUTTONS.DPAD_UP), ACTIONS.UP,
    'Climb-down cannot take the pad button already held by Climb-up');
  assert.equal(padBindingConflict(b, ACTIONS.RIGHT, DEFAULT_BINDINGS[ACTIONS.LEFT].buttons[0]), ACTIONS.LEFT,
    'opposing walk directions are guarded on the pad too');
  assert.equal(padBindingConflict(b, ACTIONS.DOWN, PAD_BUTTONS.B), null,
    'a free button is accepted');
  assert.equal(padBindingConflict(b, ACTIONS.CONFIRM, PAD_BUTTONS.A), null,
    'intentional Fire/Confirm pad duplicate remains legal');

  // A pad-poisoned profile is healed on the way in, same as the keyboard half.
  const healed = loadBindings({
    [ACTIONS.UP]: { keys: ['ArrowUp'], buttons: [PAD_BUTTONS.DPAD_UP] },
    [ACTIONS.DOWN]: { keys: ['ArrowDown'], buttons: [PAD_BUTTONS.DPAD_UP] },
  });
  assert.equal(healed[ACTIONS.DOWN].buttons.includes(PAD_BUTTONS.DPAD_UP), true);
  assert.equal(healed[ACTIONS.UP].buttons.includes(PAD_BUTTONS.DPAD_UP), false,
    'same-button climb profile is sanitized on load');
});

test('remap: key labels stay inside the pixel face (no underscore, no missing glyph bait)', () => {
  const b = cloneBindings();
  setKeyBinding(b, ACTIONS.FIRE, []);
  assert.equal(keyBindingLabel(b, ACTIONS.FIRE), '-');
  assert.equal(keyBindingLabel(DEFAULT_BINDINGS, ACTIONS.FIRE), 'Z/SPC');
});

test('pad session: a standard pad connects with a timed notice', () => {
  const session = createPadSession();
  const pad = standardPad();
  const snapped = session.connect(pad);
  assert.equal(snapped.profile, 'standard');
  assert.equal(session.isConnected(), true);
  assert.equal(session.getNotice().headline, 'CONTROLLER CONNECTED');
});

test('pad session: unknown raw pad is refused with a visible unmapped notice', () => {
  const session = createPadSession();
  const snapped = session.connect({ id: 'Mystery USB Pad', mapping: '', connected: true, index: 0, buttons: [], axes: [] });
  assert.equal(snapped, null);
  assert.equal(session.isConnected(), false);
  assert.equal(session.getNotice().headline, 'CONTROLLER NOT MAPPED');
});

test('pad session: disconnect during play reports interruptedPlay and a persistent pause notice', () => {
  const session = createPadSession();
  const pad = standardPad();
  session.connect(pad);
  const result = session.disconnect(pad, { inPlay: true });
  assert.equal(result.interruptedPlay, true);
  assert.equal(session.isConnected(), false);
  assert.equal(session.getNotice().headline, 'CONTROLLER DISCONNECTED');
  assert.match(session.getNotice().detail, /GAME PAUSED/);
  assert.equal(session.getNotice().ticks, Infinity);
});

test('pad session: disconnect outside play does not claim a gameplay pause', () => {
  const session = createPadSession();
  const pad = standardPad();
  session.connect(pad);
  const result = session.disconnect(pad, { inPlay: false });
  assert.equal(result.interruptedPlay, false);
  assert.match(session.getNotice().detail, /KEYBOARD/);
});

test('pad session: a captured button is suppressed until physical release', () => {
  const session = createPadSession();
  const pad = standardPad();
  pad.buttons[PAD_BUTTONS.RB] = true;
  session.connect(pad, false);
  session.capture(PAD_BUTTONS.RB);
  const first = session.suppressCaptured({ ...pad, buttons: [...pad.buttons] });
  assert.equal(first.buttons[PAD_BUTTONS.RB], false);
  pad.buttons[PAD_BUTTONS.RB] = false;
  const after = session.suppressCaptured({ ...pad, buttons: [...pad.buttons] });
  assert.equal(after.buttons[PAD_BUTTONS.RB], false);
  pad.buttons[PAD_BUTTONS.RB] = true;
  const nextPress = session.suppressCaptured({ ...pad, buttons: [...pad.buttons] });
  assert.equal(nextPress.buttons[PAD_BUTTONS.RB], true, 'a later press of the same button is live again');
});

test('pad session: F310 D-input connect announces the standardized profile', () => {
  const session = createPadSession();
  const pad = session.connect({
    id: 'Logitech F310 Gamepad (Vendor: 046d Product: c216)',
    index: 0,
    connected: true,
    mapping: '',
    buttons: Array.from({ length: 12 }, () => false),
    axes: Array(10).fill(0),
  });
  assert.equal(pad.profile, 'logitech-f310-dinput');
  assert.match(session.getNotice().detail, /F310/);
});
