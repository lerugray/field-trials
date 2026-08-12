import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as m from '../src/math/mat4.js';

const close = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;
const vclose = (a, b, eps = 1e-6) =>
  close(a[0], b[0], eps) && close(a[1], b[1], eps) && close(a[2], b[2], eps);

test('identity is the multiplicative unit', () => {
  const I = m.identity();
  const t = m.translation(3, 4, 5);
  assert.deepEqual(m.multiply(I, t), t);
  assert.deepEqual(m.multiply(t, I), t);
});

test('translation moves a point', () => {
  const t = m.translation(3, -2, 7);
  assert.ok(vclose(m.transformPoint(t, [1, 1, 1]), [4, -1, 8]));
});

test('scaling scales a point', () => {
  const s = m.scaling(2, 3, 4);
  assert.ok(vclose(m.transformPoint(s, [1, 1, 1]), [2, 3, 4]));
});

test('rotationZ by 90 degrees maps +x to +y', () => {
  const r = m.rotationZ(Math.PI / 2);
  assert.ok(vclose(m.transformPoint(r, [1, 0, 0]), [0, 1, 0]));
});

test('rotationY by 90 degrees maps +z to +x', () => {
  const r = m.rotationY(Math.PI / 2);
  assert.ok(vclose(m.transformPoint(r, [0, 0, 1]), [1, 0, 0]));
});

test('chain composes in left-to-right order (translate after rotate)', () => {
  // Rotate a point onto +y, then translate up: expect the rotation applied
  // first (inner), translation second (outer) => chain(T, R).
  const R = m.rotationZ(Math.PI / 2);
  const T = m.translation(0, 10, 0);
  const composed = m.chain(T, R);
  assert.ok(vclose(m.transformPoint(composed, [1, 0, 0]), [0, 11, 0]));
});

test('perspective maps near plane center to NDC z = -1 and far to +1', () => {
  const near = 0.5;
  const far = 100;
  const p = m.perspective(Math.PI / 3, 16 / 9, near, far);
  const atNear = m.transformPoint(p, [0, 0, -near]);
  const atFar = m.transformPoint(p, [0, 0, -far]);
  assert.ok(close(atNear[2], -1), `near z=${atNear[2]}`);
  assert.ok(close(atFar[2], 1), `far z=${atFar[2]}`);
  // center of the view stays centered
  assert.ok(close(atNear[0], 0) && close(atNear[1], 0));
});

test('lookAt places eye at origin and target down -z of view space', () => {
  const view = m.lookAt([0, 0, 5], [0, 0, 0], [0, 1, 0]);
  assert.ok(vclose(m.transformPoint(view, [0, 0, 5]), [0, 0, 0]), 'eye -> origin');
  assert.ok(vclose(m.transformPoint(view, [0, 0, 0]), [0, 0, -5]), 'target -> -z');
});

test('basis maps local axes onto the given world axes', () => {
  const R = [0, 0, -1], U = [0, 1, 0], B = [1, 0, 0]; // a yaw of -90 degrees
  const b = m.basis(R, U, B);
  assert.ok(vclose(m.transformPoint(b, [1, 0, 0]), R));
  assert.ok(vclose(m.transformPoint(b, [0, 1, 0]), U));
  assert.ok(vclose(m.transformPoint(b, [0, 0, 1]), B));
});

test('basis of the standard axes is identity', () => {
  assert.deepEqual(m.basis([1, 0, 0], [0, 1, 0], [0, 0, 1]), m.identity());
});

test('transpose is its own inverse', () => {
  const t = m.chain(m.translation(1, 2, 3), m.rotationX(0.7));
  assert.deepEqual(m.transpose(m.transpose(t)), t);
});

test('normalMatrix3 of a pure rotation equals its rotation 3x3', () => {
  // For an orthonormal rotation the inverse-transpose is the rotation itself.
  const r = m.rotationY(0.9);
  const n = m.normalMatrix3(r);
  const expected = [r[0], r[1], r[2], r[4], r[5], r[6], r[8], r[9], r[10]];
  for (let i = 0; i < 9; i++) assert.ok(close(n[i], expected[i]), `idx ${i}`);
});

test('normalMatrix3 undoes non-uniform scale (unit normal stays unit after)', () => {
  // A normal along +x on a surface scaled 2x in x should, after the normal
  // matrix, still point along +x (direction preserved), unlike the naive
  // model-matrix transform which would stretch it.
  const s = m.scaling(2, 1, 1);
  const n = m.normalMatrix3(s);
  // apply 3x3 to [1,0,0]
  const nx = n[0] * 1 + n[3] * 0 + n[6] * 0;
  const ny = n[1] * 1 + n[4] * 0 + n[7] * 0;
  const nz = n[2] * 1 + n[5] * 0 + n[8] * 0;
  const len = Math.hypot(nx, ny, nz);
  assert.ok(vclose([nx / len, ny / len, nz / len], [1, 0, 0]));
});
