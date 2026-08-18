// Collection contract v0, item 2: namespaced persistence under `material-breach:`, surviving
// storage being unavailable. A round-trip preserves the facility; a broken storage degrades to a
// result object rather than throwing into game logic.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFacility } from '../src/model.js';
import { commitCycle } from '../src/cycle.js';
import { save, load, clear, SAVE_KEY, KEY_PREFIX } from '../src/persistence.js';

// A Map-backed stand-in for localStorage.
function memStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, v),
    removeItem: (k) => m.delete(k),
    _map: m,
  };
}

test('save/load round-trips a facility, mid-tenure', () => {
  const store = memStorage();
  let f = createFacility({ seed: 'save-test' });
  f = commitCycle(f);
  f = commitCycle(f);
  assert.equal(save(f, store).ok, true);
  const res = load(store);
  assert.equal(res.ok, true);
  assert.equal(res.facility.cycle.number, f.cycle.number);
  assert.equal(res.facility.lossObject.condition, f.lossObject.condition);
  assert.equal(res.facility.seed, f.seed);
});

test('every persistence key is namespaced material-breach:', () => {
  const store = memStorage();
  save(createFacility({ seed: 'ns' }), store);
  for (const key of store._map.keys()) {
    assert.ok(key.startsWith(KEY_PREFIX), `key ${key} is not namespaced`);
  }
  assert.ok(store._map.has(SAVE_KEY));
});

test('the game survives storage being entirely unavailable', () => {
  const f = createFacility({ seed: 'no-storage' });
  // No storage passed and no ambient localStorage in node: everything degrades to { ok: false }.
  assert.equal(save(f, null).ok, false);
  assert.equal(load(null).ok, false);
  assert.equal(clear(null).ok, false);
});

test('a throwing storage degrades gracefully, it does not throw into game logic', () => {
  const hostile = {
    getItem: () => {
      throw new Error('storage disabled');
    },
    setItem: () => {
      throw new Error('storage disabled');
    },
    removeItem: () => {
      throw new Error('storage disabled');
    },
  };
  const f = createFacility({ seed: 'hostile' });
  const s = save(f, hostile);
  assert.equal(s.ok, false);
  assert.match(s.reason, /storage disabled/);
  assert.equal(load(hostile).ok, false);
});

test('loading with no save present returns a graceful miss', () => {
  const res = load(memStorage());
  assert.equal(res.ok, false);
  assert.match(res.reason, /no save/);
});
