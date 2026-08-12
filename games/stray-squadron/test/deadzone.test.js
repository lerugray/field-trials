import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyDeadzone, deadzone1, maybeInvertY, DEFAULT_DEADZONE } from '../src/input/deadzone.js';

const close = (a, b, e = 1e-9) => Math.abs(a - b) <= e;

test('inside the deadzone reads as centered', () => {
  assert.deepEqual(applyDeadzone(0.1, 0.05, 0.15), [0, 0]);
  assert.deepEqual(applyDeadzone(0, 0), [0, 0]);
});

test('full deflection reaches magnitude 1', () => {
  const [x, y] = applyDeadzone(1, 0, 0.15);
  assert.ok(close(Math.hypot(x, y), 1));
});

test('output starts from 0 just past the deadzone edge (no jump)', () => {
  const dz = 0.15;
  const [x, y] = applyDeadzone(dz + 1e-6, 0, dz);
  assert.ok(Math.hypot(x, y) < 1e-4);
});

test('direction is preserved through rescaling', () => {
  const [x, y] = applyDeadzone(0.6, 0.6, 0.15);
  assert.ok(close(x, y)); // 45-degree input stays 45 degrees
});

test('magnitude is monotonic in input magnitude', () => {
  const dz = 0.15;
  let prev = -1;
  for (let m = 0; m <= 1.0001; m += 0.05) {
    const [x, y] = applyDeadzone(m, 0, dz);
    const out = Math.hypot(x, y);
    assert.ok(out >= prev - 1e-9, `non-monotonic at ${m}`);
    prev = out;
  }
});

test('deadzone1 is sign-preserving and bounded to [-1,1]', () => {
  assert.equal(deadzone1(0.1, 0.15), 0);
  assert.ok(deadzone1(-1, 0.15) <= -0.99 && deadzone1(-1, 0.15) >= -1);
  assert.ok(deadzone1(1, 0.15) >= 0.99 && deadzone1(1, 0.15) <= 1);
  assert.ok(Math.sign(deadzone1(-0.5, 0.15)) === -1);
});

test('maybeInvertY only flips when enabled', () => {
  assert.equal(maybeInvertY(0.7, false), 0.7);
  assert.equal(maybeInvertY(0.7, true), -0.7);
});

test('DEFAULT_DEADZONE is a sane exposed constant', () => {
  assert.ok(DEFAULT_DEADZONE > 0 && DEFAULT_DEADZONE < 0.5);
});
