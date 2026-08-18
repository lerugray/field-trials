// GATE 7 — failures are loud (DESIGN-SEED §8.7). A forced error must be SURFACED (recorded and
// re-thrown), never swallowed. Plus the debug log is exportable.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDebugLog, surface } from '../src/debuglog.js';

test('a forced error is recorded AND re-thrown, never swallowed', () => {
  const log = createDebugLog();
  let rethrew = false;
  try {
    surface(log, 'sign the cycle over', () => {
      throw new Error('boom in the resolver');
    });
  } catch (err) {
    rethrew = true;
    assert.match(err.message, /boom/);
  }
  assert.ok(rethrew, 'surface() swallowed the error instead of re-throwing it');
  const errs = log.entries().filter((e) => e.level === 'error');
  assert.equal(errs.length, 1);
  assert.match(errs[0].message, /sign the cycle over failed/);
});

test('surface() returns the value on success and logs nothing', () => {
  const log = createDebugLog();
  const out = surface(log, 'ok path', () => 42);
  assert.equal(out, 42);
  assert.equal(log.size(), 0);
});

test('the debug log is exportable as text', () => {
  const log = createDebugLog();
  log.info('facility founded', 'seed=test');
  log.warn('storage unavailable');
  log.error('resolver threw');
  const text = log.exportText();
  assert.match(text, /MATERIAL BREACH debug log/);
  assert.match(text, /\[INFO\] facility founded \| seed=test/);
  assert.match(text, /\[WARN\] storage unavailable/);
  assert.match(text, /\[ERROR\] resolver threw/);
});

test('the log is a bounded ring buffer', () => {
  const log = createDebugLog(3);
  for (let i = 0; i < 10; i++) log.info(`entry ${i}`);
  assert.equal(log.size(), 3);
  // The oldest are dropped; the newest survive.
  assert.match(log.exportText(), /entry 9/);
  assert.doesNotMatch(log.exportText(), /entry 0/);
});
