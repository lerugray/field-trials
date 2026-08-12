import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDebugLog, DEBUGLOG_CAP } from '../src/engine/debuglog.js';

test('debuglog records log, warn, error and event levels', () => {
  const dl = createDebugLog({ cap: 10 });
  dl.log('hello', { a: 1 });
  dl.warn('careful', { b: 2 });
  dl.error('boom', { c: 3 });
  dl.event('summon', { name: 'Zirt' });

  const entries = dl.entries();
  assert.equal(entries.length, 4);
  assert.equal(entries[0].level, 'log');
  assert.equal(entries[1].level, 'warn');
  assert.equal(entries[2].level, 'error');
  assert.equal(entries[3].level, 'event');
  assert.equal(entries[3].message, 'summon');
  assert.equal(entries[3].meta.name, 'Zirt');
});

test('debuglog is a ring buffer that evicts old entries', () => {
  const dl = createDebugLog({ cap: 3 });
  dl.log('a');
  dl.log('b');
  dl.log('c');
  dl.log('d');
  const entries = dl.entries();
  assert.equal(entries.length, 3);
  assert.deepEqual(entries.map((e) => e.message), ['b', 'c', 'd']);
});

test('debuglog tracks error count', () => {
  const dl = createDebugLog({ cap: 10 });
  assert.equal(dl.errorCount, 0);
  dl.error('one');
  dl.error('two');
  dl.warn('not an error');
  assert.equal(dl.errorCount, 2);
});

test('debuglog text export contains every entry', () => {
  const dl = createDebugLog({ cap: 10 });
  dl.log('alpha');
  dl.error('beta', { x: 7 });
  const text = dl.toText();
  assert.ok(text.includes('alpha'));
  assert.ok(text.includes('beta'));
  assert.ok(text.includes('"x":7'));
});

test('debuglog json export contains version, error count and entries', () => {
  const dl = createDebugLog({ cap: 10, version: '0.9.9' });
  dl.warn('gamma');
  const json = JSON.parse(dl.toJson());
  assert.equal(json.version, '0.9.9');
  assert.equal(json.errorCount, 0);
  assert.equal(json.entries.length, 1);
  assert.equal(json.entries[0].level, 'warn');
  assert.equal(json.entries[0].message, 'gamma');
  assert.ok(json.exportedAt);
});

test('debuglog default cap is exported constant', () => {
  const dl = createDebugLog();
  assert.equal(dl.cap, DEBUGLOG_CAP);
});
