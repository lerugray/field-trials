// Save envelope round-trip, storage guard, and the save-determinism probe.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMarch, step, runTicks } from '../src/engine.js';
import {
  makeSave, parseSave, applySave, createStorage, determinismProbe, SAVE_KEY, SAVE_VERSION,
} from '../src/save.js';
import { TUNING } from '../src/tuning.js';

test('save envelope is plain JSON and round-trips', () => {
  const config = { seed: 12321, speedIndex: 2 };
  const march = createMarch(config.seed);
  runTicks(march, 90);
  const env = makeSave(config, march);
  const str = JSON.stringify(env); // must be serializable
  const back = parseSave(str);
  assert.equal(back.v, SAVE_VERSION);
  assert.equal(back.config.seed, config.seed);
  assert.equal(back.config.speedIndex, 2);
  assert.equal(back.savedAtTick, march.tick);
});

test('applySave reconstructs state that continues identically', () => {
  const config = { seed: 55, speedIndex: 1 };
  const march = createMarch(config.seed);
  runTicks(march, 210); // across at least one leg boundary
  const env = parseSave(JSON.stringify(makeSave(config, march)));
  const restored = applySave(env).march;
  assert.deepEqual(runTicks(restored, 200), runTicks(march, 200));
});

test('parseSave rejects junk and wrong versions (never throws)', () => {
  assert.equal(parseSave(null), null);
  assert.equal(parseSave('not json'), null);
  assert.equal(parseSave('{}'), null);
  assert.equal(parseSave(JSON.stringify({ v: 999, config: {}, march: {} })), null);
  assert.equal(parseSave(JSON.stringify({ v: SAVE_VERSION, config: {}, march: { seed: 1 } })), null);
});

test('storage falls back to memory when localStorage is absent (loud, not fatal)', () => {
  const s = createStorage(null);
  assert.equal(s.available, false);
  assert.equal(s.write(SAVE_KEY, 'hello'), true);
  assert.equal(s.read(SAVE_KEY), 'hello');
  s.clear(SAVE_KEY);
  assert.equal(s.read(SAVE_KEY), null);
});

test('storage uses a working localStorage-like backend', () => {
  const store = new Map();
  const fakeWin = { localStorage: {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  } };
  const s = createStorage(fakeWin);
  assert.equal(s.available, true);
  s.write(SAVE_KEY, 'v');
  assert.equal(s.read(SAVE_KEY), 'v');
});

test('determinism probe passes across many seeds (the M1 guarantee)', () => {
  for (const seed of [1, 2, 777, 31337, 0x0ff1ce]) {
    const r = determinismProbe(seed);
    assert.ok(r.ok, `probe failed for seed ${seed} at tick ${r.firstDiff}`);
    assert.equal(r.probeTicks, TUNING.determinismProbeTicks);
  }
});

test('determinism probe covers a full leg-generation boundary', () => {
  // Prime past a leg so the reload must reproduce a freshly generated legProfile.
  const r = determinismProbe(42, TUNING.legLengthPaces + 30, 200);
  assert.ok(r.ok, `probe failed at tick ${r.firstDiff}`);
});
