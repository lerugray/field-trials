// node --test — debuglog is LOUD on anomaly (hard rule 4).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DebugLog, LEVELS } from '../src/engine/debuglog.js';

test('an error is recorded and counted', () => {
  const log = new DebugLog();
  assert.ok(!log.hasErrors());
  log.error('boot', 'something broke', { code: 7 });
  assert.ok(log.hasErrors());
  assert.equal(log.errorCount, 1);
});

test('subscribers are notified of every entry', () => {
  const log = new DebugLog();
  const seen = [];
  const unsub = log.subscribe((e) => seen.push(e));
  log.info('a', 'one');
  log.warn('b', 'two');
  assert.equal(seen.length, 2);
  assert.equal(seen[1].level, LEVELS.warn);
  unsub();
  log.info('c', 'three');
  assert.equal(seen.length, 2, 'unsubscribe stops notifications');
});

test('guard makes a throwing region loud instead of silent', () => {
  const log = new DebugLog();
  const result = log.guard('risky', () => { throw new Error('kaboom'); });
  assert.equal(result, undefined);
  assert.ok(log.hasErrors());
  assert.match(log.export(), /kaboom/);
});

test('guard can rethrow while still logging', () => {
  const log = new DebugLog();
  assert.throws(() => log.guard('risky', () => { throw new Error('up'); }, { rethrow: true }), /up/);
  assert.ok(log.hasErrors());
});

test('a broken subscriber never masks the log', () => {
  const log = new DebugLog();
  log.subscribe(() => { throw new Error('bad subscriber'); });
  assert.doesNotThrow(() => log.info('x', 'still works'));
});

test('ring buffer respects capacity', () => {
  const log = new DebugLog({ capacity: 5 });
  for (let i = 0; i < 20; i++) log.info('t', `m${i}`);
  assert.equal(log.entries.length, 5);
  assert.equal(log.entries[log.entries.length - 1].msg, 'm19');
});

test('export includes the sim tick stamp', () => {
  const log = new DebugLog();
  log.setTick(123);
  log.warn('sim', 'late');
  assert.match(log.export(), /\[123\] WARN sim: late/);
});
