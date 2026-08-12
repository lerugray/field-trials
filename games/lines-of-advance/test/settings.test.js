import test from 'node:test';
import assert from 'node:assert/strict';

import { createState, parseState, serializeState } from '../src/state.js';
import {
  ENGINE_SIDES,
  PIECE_STYLES,
  readPreferences,
  resolveStorage,
  writePreferences
} from '../src/main.js';

function memoryStorage() {
  const values = new Map();
  return {
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) { values.set(key, String(value)); }
  };
}

test('piece style and engine side defaults preserve hotseat and original pieces', () => {
  const state = createState();
  assert.deepEqual(PIECE_STYLES, ['default', 'nato', 'chess']);
  assert.deepEqual(ENGINE_SIDES, ['None', 'North', 'South']);
  assert.equal(state.settings.pieceStyle, 'default');
  assert.equal(state.settings.engineSide, 'None');
});

test('piece style and engine side persist in preferences and save files', () => {
  const storage = memoryStorage();
  const settings = { pieceStyle: 'nato', engineSide: 'South' };
  writePreferences(storage, settings);
  assert.deepEqual(readPreferences(storage), settings);

  const state = createState();
  state.settings = { ...state.settings, ...settings };
  const restored = parseState(serializeState(state));
  assert.equal(restored.settings.pieceStyle, 'nato');
  assert.equal(restored.settings.engineSide, 'South');
});

test('file privacy storage failure falls back to page-lifetime storage', () => {
  const scope = {};
  Object.defineProperty(scope, 'localStorage', {
    get() { throw new Error('denied'); }
  });
  const access = resolveStorage(scope);
  assert.equal(access.persistent, false);
  access.storage.setItem('save', 'value');
  assert.equal(access.storage.getItem('save'), 'value');
});
