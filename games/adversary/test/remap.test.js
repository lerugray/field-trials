import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ACTIONS, DEFAULT_BINDINGS, cloneBindings, setKeyBinding, setPadBinding,
  serializeBindings, loadBindings, resolveActions,
} from '../src/core/input.js';
import { createMemoryStorage } from '../src/sim/save.js';

test('remap: rebinding a key changes resolution and leaves defaults intact', () => {
  const b = cloneBindings();
  setKeyBinding(b, ACTIONS.JUMP, ['KeyZ']);
  assert.ok(resolveActions({ keys: ['KeyZ'] }, b).has(ACTIONS.JUMP));
  assert.ok(!resolveActions({ keys: ['KeyK'] }, b).has(ACTIONS.JUMP));
  // The frozen defaults are untouched.
  assert.ok(DEFAULT_BINDINGS[ACTIONS.JUMP].keys.includes('KeyK'));
});

test('remap: rebinding a gamepad button changes resolution', () => {
  const b = cloneBindings();
  setPadBinding(b, ACTIONS.ATTACK, [7]);
  const buttons = []; buttons[7] = true;
  assert.ok(resolveActions({ pad: { buttons } }, b).has(ACTIONS.ATTACK));
});

test('remap: PERSISTS through serialize → storage → load (keyboard + gamepad)', () => {
  const storage = createMemoryStorage();
  const b = cloneBindings();
  setKeyBinding(b, ACTIONS.DODGE, ['KeyC']);   // keyboard remap
  setPadBinding(b, ACTIONS.DODGE, [5]);         // gamepad remap
  storage.setItem('binds', JSON.stringify(serializeBindings(b)));

  // Reload in a fresh "session".
  const loaded = loadBindings(JSON.parse(storage.getItem('binds')));
  assert.deepEqual(loaded[ACTIONS.DODGE].keys, ['KeyC']);
  assert.deepEqual(loaded[ACTIONS.DODGE].buttons, [5]);
  // And it actually resolves.
  assert.ok(resolveActions({ keys: ['KeyC'] }, loaded).has(ACTIONS.DODGE));
  const buttons = []; buttons[5] = true;
  assert.ok(resolveActions({ pad: { buttons } }, loaded).has(ACTIONS.DODGE));
});

test('remap: loadBindings fills missing/corrupt actions from defaults', () => {
  const loaded = loadBindings({ [ACTIONS.JUMP]: { keys: ['KeyZ'], buttons: [] } }); // only jump provided
  assert.deepEqual(loaded[ACTIONS.JUMP].keys, ['KeyZ']);
  // A non-provided action falls back to the default binding.
  assert.deepEqual(loaded[ACTIONS.LEFT].keys, [...DEFAULT_BINDINGS[ACTIONS.LEFT].keys]);
  // Garbage input → all defaults.
  const g = loadBindings('nonsense');
  assert.deepEqual(g[ACTIONS.ATTACK].keys, [...DEFAULT_BINDINGS[ACTIONS.ATTACK].keys]);
});

test('remap: every kit action is individually rebindable on keyboard AND gamepad', () => {
  const b = cloneBindings();
  for (const a of [ACTIONS.JUMP, ACTIONS.ATTACK, ACTIONS.SUBWEAPON, ACTIONS.DODGE, ACTIONS.LEFT, ACTIONS.RIGHT, ACTIONS.UP, ACTIONS.DOWN]) {
    setKeyBinding(b, a, ['KeyQ']);
    setPadBinding(b, a, [11]);
    assert.deepEqual(b[a].keys, ['KeyQ']);
    assert.deepEqual(b[a].buttons, [11]);
  }
});
