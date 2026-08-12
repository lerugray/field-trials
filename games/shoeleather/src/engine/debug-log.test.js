import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DebugLog, formatEntry, LEVELS } from './debug-log.js';

test('logs entries with monotonic seq and injected clock', () => {
  let t = 100;
  const log = new DebugLog({ clock: () => t++ });
  const a = log.info('boot', 'engine up');
  const b = log.warn('save', 'slot missing');
  assert.equal(a.seq, 0);
  assert.equal(b.seq, 1);
  assert.equal(a.t, 100);
  assert.equal(b.t, 101);
  assert.equal(log.entries.length, 2);
});

test('level helpers set the level', () => {
  const log = new DebugLog();
  assert.equal(log.trace('t', 'x').level, 'trace');
  assert.equal(log.info('t', 'x').level, 'info');
  assert.equal(log.warn('t', 'x').level, 'warn');
  assert.equal(log.error('t', 'x').level, 'error');
});

test('hasErrors and errorCount track error entries', () => {
  const log = new DebugLog();
  assert.equal(log.hasErrors(), false);
  log.info('a', 'ok');
  assert.equal(log.hasErrors(), false);
  log.error('a', 'boom');
  assert.equal(log.hasErrors(), true);
  assert.equal(log.errorCount(), 1);
});

test('ring buffer evicts oldest and keeps error count correct', () => {
  const log = new DebugLog({ capacity: 3 });
  log.error('x', 'e1');
  log.info('x', 'i1');
  log.info('x', 'i2');
  assert.equal(log.errorCount(), 1);
  log.info('x', 'i3'); // evicts the error
  assert.equal(log.entries.length, 3);
  assert.equal(log.errorCount(), 0);
  assert.equal(log.hasErrors(), false);
});

test('capture records Error message and stack', () => {
  const log = new DebugLog();
  const e = log.capture('render', new Error('nope'), { scene: 'kitchen' });
  assert.equal(e.level, 'error');
  assert.equal(e.message, 'nope');
  assert.equal(e.data.scene, 'kitchen');
  assert.ok(typeof e.data.stack === 'string');
});

test('capture handles non-Error values', () => {
  const log = new DebugLog();
  const e = log.capture('x', 'string failure');
  assert.equal(e.message, 'string failure');
});

test('sinks receive entries and a broken sink cannot break logging', () => {
  const log = new DebugLog();
  const seen = [];
  log.addSink((e) => seen.push(e.message));
  log.addSink(() => { throw new Error('bad sink'); });
  log.info('a', 'one');
  log.error('a', 'two');
  assert.deepEqual(seen, ['one', 'two']);
  // the log itself still recorded both despite the throwing sink
  assert.equal(log.entries.length, 2);
});

test('addSink returns a working unsubscribe', () => {
  const log = new DebugLog();
  const seen = [];
  const off = log.addSink((e) => seen.push(e.message));
  log.info('a', 'one');
  off();
  log.info('a', 'two');
  assert.deepEqual(seen, ['one']);
});

test('filter returns entries at or above a level', () => {
  const log = new DebugLog();
  log.trace('t', 'a');
  log.info('t', 'b');
  log.warn('t', 'c');
  log.error('t', 'd');
  assert.equal(log.filter('warn').length, 2);
  assert.equal(log.filter('trace').length, 4);
});

test('export renders readable text with data', () => {
  const log = new DebugLog({ clock: () => 7 });
  log.info('boot', 'ready');
  log.error('save', 'corrupt', { slot: 2 });
  const text = log.export();
  assert.match(text, /INFO {2}boot: ready/);
  assert.match(text, /ERROR save: corrupt \{"slot":2\}/);
});

test('formatEntry survives unserializable data', () => {
  const cyclic = {};
  cyclic.self = cyclic;
  const s = formatEntry({ t: 0, level: 'info', tag: 'x', message: 'm', data: cyclic });
  assert.match(s, /\[unserializable\]/);
});

test('rejects unknown level and bad capacity', () => {
  const log = new DebugLog();
  assert.throws(() => log.log('fatal', 't', 'x'), /unknown log level/);
  assert.throws(() => new DebugLog({ capacity: 0 }), /positive integer/);
});

test('LEVELS is ordered', () => {
  assert.ok(LEVELS.trace < LEVELS.info && LEVELS.info < LEVELS.warn && LEVELS.warn < LEVELS.error);
});
