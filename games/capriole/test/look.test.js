// node --test — the pure look() function (pointer-lock-reality fold). No WebGL.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLook, applyLook } from '../src/sim/look.js';
import { tuning } from '../src/sim/tuning.js';

const clampRad = tuning.camera.pitchClampDeg * Math.PI / 180;

test('mouse right turns the view right (yaw decreases)', () => {
  const s = createLook(0, 0);
  applyLook(s, 100, 0, { sensitivity: 1 });
  assert.ok(s.yaw < 0, 'yaw decreased');
});

test('mouse down looks down (pitch decreases) by default', () => {
  const s = createLook(0, 0);
  applyLook(s, 0, 100);
  assert.ok(s.pitch < 0, 'pitch decreased looking down');
});

test('invert-Y flips vertical look', () => {
  const s = createLook(0, 0);
  applyLook(s, 0, 100, { invertY: true });
  assert.ok(s.pitch > 0, 'inverted: down delta raises pitch');
});

test('pitch is clamped to ±pitchClampDeg', () => {
  const s = createLook(0, 0);
  for (let i = 0; i < 1000; i++) applyLook(s, 0, -100); // keep looking up
  assert.ok(s.pitch <= clampRad + 1e-9 && s.pitch >= clampRad - 1e-6, 'clamped up');
  for (let i = 0; i < 2000; i++) applyLook(s, 0, 100); // keep looking down
  assert.ok(s.pitch >= -clampRad - 1e-9 && s.pitch <= -clampRad + 1e-6, 'clamped down');
});

test('sensitivity scales the turn rate', () => {
  const a = createLook(0, 0); applyLook(a, 100, 0, { sensitivity: 1 });
  const b = createLook(0, 0); applyLook(b, 100, 0, { sensitivity: 2 });
  assert.ok(Math.abs(b.yaw) > Math.abs(a.yaw), 'higher sensitivity turns more');
});

test('yaw wraps into (-PI, PI]', () => {
  const s = createLook(0, 0);
  for (let i = 0; i < 100; i++) applyLook(s, 500, 0);
  assert.ok(s.yaw > -Math.PI - 1e-9 && s.yaw <= Math.PI + 1e-9, `yaw ${s.yaw} in range`);
});

test('look is deterministic — same deltas, same result', () => {
  const a = createLook(0.3, -0.2), b = createLook(0.3, -0.2);
  const deltas = [[12, -4], [-30, 8], [5, 5], [100, -100]];
  for (const [dx, dy] of deltas) { applyLook(a, dx, dy); applyLook(b, dx, dy); }
  assert.deepEqual(a, b);
});
