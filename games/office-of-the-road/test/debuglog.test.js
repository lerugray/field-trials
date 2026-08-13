// debuglog.js: loud failures land in the log, fire subscribers, and export.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DebugLog } from '../src/debuglog.js';

test('levels record and count errors', () => {
  const log = new DebugLog();
  log.info('a');
  log.warn('b');
  log.error('c');
  assert.equal(log.entries.length, 3);
  assert.equal(log.errorCount, 1);
});

test('onError fires only for errors, onAny for all', () => {
  const log = new DebugLog();
  let errs = 0, any = 0;
  log.onError(() => errs++);
  log.onAny(() => any++);
  log.info('x');
  log.warn('y');
  log.error('z');
  assert.equal(errs, 1);
  assert.equal(any, 3);
});

test('guard turns a throw into a loud logged error, never propagates', () => {
  const log = new DebugLog();
  const r = log.guard('unit', () => { throw new Error('boom'); });
  assert.equal(r, undefined);
  assert.equal(log.errorCount, 1);
  assert.match(log.entries.at(-1).msg, /unit: boom/);
});

test('guard returns the value when fn succeeds', () => {
  const log = new DebugLog();
  assert.equal(log.guard('ok', () => 7), 7);
  assert.equal(log.errorCount, 0);
});

test('a throwing subscriber never breaks logging (logging must never throw)', () => {
  const log = new DebugLog();
  log.onAny(() => { throw new Error('bad subscriber'); });
  assert.doesNotThrow(() => log.info('still fine'));
  assert.equal(log.entries.length, 1);
});

test('ring buffer is bounded by capacity', () => {
  const log = new DebugLog({ capacity: 10 });
  for (let i = 0; i < 50; i++) log.info('n' + i);
  assert.equal(log.entries.length, 10);
  assert.equal(log.entries.at(-1).msg, 'n49');
});

test('tick stamping and export text', () => {
  const log = new DebugLog();
  log.setTick(42);
  log.error('failure', { code: 3 });
  const text = log.exportText();
  assert.match(text, /1 errors/);
  assert.match(text, /t    42/);
  assert.match(text, /failure/);
});
