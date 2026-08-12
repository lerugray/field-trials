// Keyboard remapping (M9). Proves the remap model's invariants: defaults, the
// steal-on-conflict rule (one physical key never triggers two actions), clearing a
// slot, reset, persistence, corrupt-storage safety, and the isDown/actionFor reads
// the browser input path relies on.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BINDINGS_VERSION, INPUT_CLASSES, createBindings, REMAP_ACTIONS,
  inputLabel, keyLabel,
} from '../src/input/bindings.js';

function fakeStore(initial) {
  const map = new Map(initial ? [['stray.bindings', initial]] : []);
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, v),
    _dump: () => map.get('stray.bindings'),
  };
}

test('defaults: every remappable action has its shipped binds', () => {
  const b = createBindings(fakeStore());
  assert.equal(b.primary('fire'), 'KeyJ');
  assert.deepEqual(b.slots('steerUp'), ['KeyW', 'ArrowUp']);
  assert.deepEqual(b.slots('rollLeft'), ['KeyQ', null]);
});

test('actionFor is the reverse lookup used by the input read', () => {
  const b = createBindings(fakeStore());
  assert.equal(b.actionFor('KeyW'), 'steerUp');
  assert.equal(b.actionFor('ArrowUp'), 'steerUp');
  assert.equal(b.actionFor('Space'), 'boost');
  assert.equal(b.actionFor('KeyZ'), null);
});

test('isDown reads either slot via an injected key predicate', () => {
  const b = createBindings(fakeStore());
  const held = new Set(['ArrowUp']);
  assert.equal(b.isDown('steerUp', (c) => held.has(c)), true); // alternate slot
  assert.equal(b.isDown('fire', (c) => held.has(c)), false);
});

test('rebind to a free key just sets the slot, no steal', () => {
  const b = createBindings(fakeStore());
  const r = b.rebind('fire', 0, 'KeyZ');
  assert.deepEqual(r, { ok: true, stole: null });
  assert.equal(b.primary('fire'), 'KeyZ');
  assert.equal(b.actionFor('KeyZ'), 'fire');
});

test('rebind STEALS a key already bound elsewhere — no key triggers two actions', () => {
  const b = createBindings(fakeStore());
  // Bind boost's slot0 to KeyJ, which fire currently owns.
  const r = b.rebind('boost', 0, 'KeyJ');
  assert.equal(r.ok, true);
  assert.deepEqual(r.stole, { action: 'fire', slot: 0, inputClass: 'keyboard' });
  assert.equal(b.primary('boost'), 'KeyJ');
  assert.equal(b.slots('fire')[0], null); // fire lost its primary
  // Invariant: KeyJ resolves to exactly one action.
  assert.equal(b.actionFor('KeyJ'), 'boost');
});

test('no physical key is ever double-bound after arbitrary rebinds', () => {
  const b = createBindings(fakeStore());
  const moves = [
    ['fire', 0, 'KeyK'], ['boost', 1, 'KeyK'], ['brake', 0, 'KeyK'],
    ['steerUp', 0, 'ArrowUp'], ['rollLeft', 1, 'KeyW'], ['fire', 1, 'KeyW'],
  ];
  for (const [a, s, c] of moves) b.rebind(a, s, c);
  const seen = new Map();
  for (const act of REMAP_ACTIONS) {
    for (const code of b.slots(act.id)) {
      if (!code) continue;
      assert.ok(!seen.has(code), `${code} double-bound to ${seen.get(code)} and ${act.id}`);
      seen.set(code, act.id);
    }
  }
});

test('rebind to null clears a slot', () => {
  const b = createBindings(fakeStore());
  b.rebind('boost', 1, null);
  assert.equal(b.slots('boost')[1], null);
  assert.equal(b.primary('boost'), 'Space');
});

test('rebinding a key onto the slot it already holds is a harmless no-op', () => {
  const b = createBindings(fakeStore());
  const r = b.rebind('fire', 0, 'KeyJ');
  assert.deepEqual(r, { ok: true, stole: null });
  assert.equal(b.primary('fire'), 'KeyJ');
});

test('reset restores shipped defaults', () => {
  const b = createBindings(fakeStore());
  b.rebind('fire', 0, 'KeyZ');
  b.reset();
  assert.equal(b.primary('fire'), 'KeyJ');
});

test('persistence: rebinds survive a reload from the same storage', () => {
  const store = fakeStore();
  const a = createBindings(store);
  a.rebind('fire', 0, 'KeyL');
  const b = createBindings(store);
  assert.equal(b.primary('fire'), 'KeyL');
});

test('corrupt storage falls back to defaults without throwing', () => {
  const b = createBindings(fakeStore('{ not json'));
  assert.equal(b.primary('fire'), 'KeyJ');
});

test('stored garbage shape is sanitized to two-slot-per-action', () => {
  const b = createBindings(fakeStore(JSON.stringify({ fire: 'nope', junkAction: ['KeyX'] })));
  assert.deepEqual(b.slots('fire'), ['KeyJ', 'KeyF']); // bad value -> defaults
  assert.equal(b.actionFor('KeyX'), null); // unknown action dropped
});

test('rebind rejects unknown actions and out-of-range slots', () => {
  const b = createBindings(fakeStore());
  assert.equal(b.rebind('nope', 0, 'KeyX').ok, false);
  assert.equal(b.rebind('fire', 5, 'KeyX').ok, false);
});

test('keyLabel renders friendly names for the UI', () => {
  assert.equal(keyLabel('KeyW'), 'W');
  assert.equal(keyLabel('ArrowUp'), 'Up');
  assert.equal(keyLabel('Space'), 'Space');
  assert.equal(keyLabel('ShiftLeft'), 'L-Shift');
  assert.equal(keyLabel(null), '—');
});

test('all three input classes expose shipped defaults for every game action', () => {
  const b = createBindings(fakeStore());
  assert.deepEqual(INPUT_CLASSES, ['keyboard', 'mouse', 'controller']);
  for (const action of REMAP_ACTIONS) {
    for (const inputClass of INPUT_CLASSES) {
      assert.equal(b.slots(action.id, inputClass).length, 2, `${action.id}/${inputClass}`);
    }
  }
  assert.deepEqual(b.slots('fire', 'mouse'), [0, null]);
  assert.deepEqual(b.slots('fire', 'controller'), [2, 3]);
  assert.deepEqual(b.slots('boost', 'controller'), [0, 7]);
  assert.deepEqual(b.slots('brake', 'controller'), [1, 6]);
  assert.deepEqual(b.slots('rollLeft', 'controller'), [4, null]);
  assert.deepEqual(b.slots('rollRight', 'controller'), [5, null]);
});

test('mouse and controller inputs bind and resolve game actions', () => {
  const b = createBindings(fakeStore());
  assert.deepEqual(b.rebind('boost', 0, 2, 'mouse'), { ok: true, stole: null });
  assert.equal(b.actionFor(2, 'mouse'), 'boost');
  assert.equal(b.isDown('boost', (button) => button === 2, 'mouse'), true);

  assert.deepEqual(b.rebind('fire', 0, 9, 'controller'), { ok: true, stole: null });
  assert.equal(b.actionFor(9, 'controller'), 'fire');
  assert.equal(b.isDown('fire', (button) => button === 9, 'controller'), true);
});

test('conflicts steal within one input class without disturbing the other classes', () => {
  const b = createBindings(fakeStore());
  const result = b.rebind('boost', 0, 0, 'mouse');
  assert.deepEqual(result, { ok: true, stole: { action: 'fire', slot: 0, inputClass: 'mouse' } });
  assert.equal(b.primary('fire', 'mouse'), null);
  assert.equal(b.primary('boost', 'mouse'), 0);
  assert.equal(b.primary('fire', 'keyboard'), 'KeyJ');
  assert.equal(b.primary('fire', 'controller'), 2);
});

test('versioned persistence round-trips keyboard, mouse, and controller bindings', () => {
  const store = fakeStore();
  const a = createBindings(store);
  a.rebind('fire', 0, 'KeyL', 'keyboard');
  a.rebind('fire', 0, 2, 'mouse');
  a.rebind('fire', 0, 8, 'controller');
  const saved = JSON.parse(store._dump());
  assert.equal(saved.v, BINDINGS_VERSION);
  assert.deepEqual(Object.keys(saved).sort(), ['controller', 'keyboard', 'mouse', 'v']);

  const b = createBindings(store);
  assert.equal(b.primary('fire', 'keyboard'), 'KeyL');
  assert.equal(b.primary('fire', 'mouse'), 2);
  assert.equal(b.primary('fire', 'controller'), 8);
});

test('legacy unversioned keyboard bindings migrate without losing new-class defaults', () => {
  const legacy = JSON.stringify({
    fire: ['KeyZ', null],
    boost: ['Space', 'ShiftLeft'],
  });
  const b = createBindings(fakeStore(legacy));
  assert.deepEqual(b.slots('fire', 'keyboard'), ['KeyZ', null]);
  assert.deepEqual(b.slots('fire', 'mouse'), [0, null]);
  assert.deepEqual(b.slots('fire', 'controller'), [2, 3]);
});

test('reset restores defaults for every input class and persists the versioned payload', () => {
  const store = fakeStore();
  const b = createBindings(store);
  b.rebind('fire', 0, 'KeyZ', 'keyboard');
  b.rebind('fire', 0, 2, 'mouse');
  b.rebind('fire', 0, 8, 'controller');
  b.reset();
  assert.equal(b.primary('fire', 'keyboard'), 'KeyJ');
  assert.equal(b.primary('fire', 'mouse'), 0);
  assert.equal(b.primary('fire', 'controller'), 2);
  assert.equal(JSON.parse(store._dump()).v, BINDINGS_VERSION);
});

test('input labels are plain and class-specific', () => {
  assert.equal(inputLabel('keyboard', 'KeyF'), 'F');
  assert.equal(inputLabel('mouse', 0), 'Left');
  assert.equal(inputLabel('mouse', 1), 'Middle');
  assert.equal(inputLabel('mouse', 2), 'Right');
  assert.equal(inputLabel('controller', 0), 'A');
  assert.equal(inputLabel('controller', 5), 'RB');
  assert.equal(inputLabel('controller', null), '—');
});
