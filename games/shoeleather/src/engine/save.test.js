import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SaveManager, MemoryStore, SaveError, SAVE_VERSION } from './save.js';

test('save then load round-trips a snapshot', () => {
  const mgr = new SaveManager(new MemoryStore());
  mgr.save('auto', { scene: 'kitchen', sweep: { kitchen: ['stove'] } }, 'Kitchen @12');
  const loaded = mgr.load('auto');
  assert.deepEqual(loaded.data, { scene: 'kitchen', sweep: { kitchen: ['stove'] } });
  assert.equal(loaded.stamp, 'Kitchen @12');
});

test('load absent slot returns null', () => {
  const mgr = new SaveManager(new MemoryStore());
  assert.equal(mgr.load('nope'), null);
});

test('has reflects presence', () => {
  const mgr = new SaveManager(new MemoryStore());
  assert.equal(mgr.has('auto'), false);
  mgr.save('auto', { a: 1 });
  assert.equal(mgr.has('auto'), true);
});

test('list returns named access points sorted', () => {
  const mgr = new SaveManager(new MemoryStore());
  mgr.save('slot-b', {});
  mgr.save('auto', {});
  mgr.save('slot-a', {});
  assert.deepEqual(mgr.list(), ['auto', 'slot-a', 'slot-b']);
});

test('delete removes a slot', () => {
  const mgr = new SaveManager(new MemoryStore());
  mgr.save('auto', { a: 1 });
  mgr.delete('auto');
  assert.equal(mgr.has('auto'), false);
  assert.deepEqual(mgr.list(), []);
});

test('corrupt JSON throws SaveError (loud, not silent blank)', () => {
  const store = new MemoryStore();
  store.set('shoeleather:save:auto', '{not json');
  const mgr = new SaveManager(store);
  assert.throws(() => mgr.load('auto'), (e) => e instanceof SaveError && /corrupt/.test(e.message));
});

test('version mismatch throws SaveError', () => {
  const store = new MemoryStore();
  store.set('shoeleather:save:auto', JSON.stringify({ version: 999, data: {} }));
  const mgr = new SaveManager(store);
  assert.throws(() => mgr.load('auto'), (e) => e instanceof SaveError && /version/.test(e.message));
});

test('missing version field is treated as corrupt', () => {
  const store = new MemoryStore();
  store.set('shoeleather:save:auto', JSON.stringify({ data: {} }));
  const mgr = new SaveManager(store);
  assert.throws(() => mgr.load('auto'), /missing version/);
});

test('unserializable snapshot throws SaveError on save', () => {
  const mgr = new SaveManager(new MemoryStore());
  const cyclic = {}; cyclic.self = cyclic;
  assert.throws(() => mgr.save('auto', cyclic), (e) => e instanceof SaveError);
});

test('custom prefix isolates slots and version is exposed', () => {
  const store = new MemoryStore();
  const a = new SaveManager(store, { prefix: 'a:' });
  const b = new SaveManager(store, { prefix: 'b:' });
  a.save('x', { who: 'a' });
  assert.equal(b.has('x'), false);
  assert.equal(SAVE_VERSION >= 1, true);
});

test('rejects a store lacking the interface', () => {
  assert.throws(() => new SaveManager({}), /needs a store/);
});
