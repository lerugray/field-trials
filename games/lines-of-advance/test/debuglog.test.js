import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { DEBUG_MIRROR_KEY, createDebugLog } from '../src/debuglog.js';

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  let writes = 0;
  return {
    get writes() { return writes; },
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) {
      writes += 1;
      values.set(key, String(value));
    }
  };
}

function eventScope() {
  const listeners = new Map();
  return {
    addEventListener(type, listener) { listeners.set(type, listener); },
    removeEventListener(type, listener) {
      if (listeners.get(type) === listener) listeners.delete(type);
    },
    dispatch(type, event) { listeners.get(type)?.(event); }
  };
}

test('debug log ring evicts the oldest entry at capacity', () => {
  let time = 100;
  const log = createDebugLog({ capacity: 3, now: () => time++ });
  log.record('one');
  log.record('two');
  log.record('three');
  log.record('four');

  assert.deepEqual(log.entries().map(entry => [entry.seq, entry.type]), [
    [2, 'two'],
    [3, 'three'],
    [4, 'four']
  ]);
});

test('debug log captures window errors, rejected promises, and guarded failures', () => {
  const scope = eventScope();
  const log = createDebugLog({ scope });
  const windowError = new Error('window failed');
  const rejection = new Error('promise failed');
  scope.dispatch('error', { error: windowError, filename: 'game.js', lineno: 7, colno: 4 });
  scope.dispatch('unhandledrejection', { reason: rejection });
  assert.throws(() => log.guard('engine-entry', { purpose: 'test' }, () => {
    throw new Error('guard failed');
  }), /guard failed/);

  const errors = log.entries();
  assert.deepEqual(errors.map(entry => entry.data.source || entry.data.seam), [
    'window.onerror',
    'unhandledrejection',
    'engine-entry'
  ]);
  assert.ok(errors.every(entry => typeof entry.data.message === 'string'));
  assert.ok(errors.every(entry => typeof entry.data.stack === 'string'));
});

test('debug export has the field-play header, current entries, and previous session', () => {
  const previous = {
    header: { version: 'old', entryCount: 1 },
    entries: [{ seq: 1, t: 0, type: 'old', data: {} }]
  };
  const storage = memoryStorage({ [DEBUG_MIRROR_KEY]: JSON.stringify(previous) });
  const log = createDebugLog({
    version: '1.0.0-rc.1',
    buildStamp: 'test-build',
    userAgent: 'test-agent',
    storageMode: 'localStorage',
    storage,
    wallNow: () => Date.UTC(2026, 7, 8, 12, 0, 0)
  });
  log.record('session-start', { scenario: 'test' });
  const exported = log.exportData();

  assert.deepEqual(exported.header, {
    version: '1.0.0-rc.1',
    buildStamp: 'test-build',
    timestamp: '2026-08-08T12:00:00.000Z',
    userAgent: 'test-agent',
    storageMode: 'localStorage',
    entryCount: 1
  });
  assert.equal(exported.entries[0].type, 'session-start');
  assert.deepEqual(exported.previousSession, previous);
  assert.deepEqual(JSON.parse(log.exportJson()), exported);
});

test('debug storage mirror writes only at the throttle and retains its recent tail', () => {
  const storage = memoryStorage();
  const log = createDebugLog({ storage, mirrorEvery: 20, mirrorLimit: 3 });
  for (let i = 1; i <= 19; i += 1) log.record('event', { i });
  assert.equal(storage.writes, 0);
  log.record('event', { i: 20 });
  assert.equal(storage.writes, 1);
  for (let i = 21; i <= 40; i += 1) log.record('event', { i });
  assert.equal(storage.writes, 2);

  const mirror = JSON.parse(storage.getItem(DEBUG_MIRROR_KEY));
  assert.deepEqual(mirror.entries.map(entry => entry.seq), [38, 39, 40]);
  assert.equal(mirror.header.entryCount, 3);
});

test('the pre-debug game test inventory has not regressed', () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const files = readdirSync(here)
    .filter(name => name.endsWith('.test.js') && name !== 'debuglog.test.js');
  const count = files.reduce((sum, name) => {
    const source = readFileSync(resolve(here, name), 'utf8');
    return sum + (source.match(/\btest\s*\(/g) || []).length;
  }, 0);
  assert.equal(count, 147); // +7 search/arsenal regressions +4 draw/termination tests +4 share-fix regressions; harness tests live separately
});
