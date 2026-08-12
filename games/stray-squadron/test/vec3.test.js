import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as v from '../src/math/vec3.js';

const close = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;
const vclose = (a, b, eps = 1e-9) =>
  close(a[0], b[0], eps) && close(a[1], b[1], eps) && close(a[2], b[2], eps);

test('add / sub / scale / negate', () => {
  assert.deepEqual(v.add([1, 2, 3], [4, 5, 6]), [5, 7, 9]);
  assert.deepEqual(v.sub([4, 5, 6], [1, 2, 3]), [3, 3, 3]);
  assert.deepEqual(v.scale([1, 2, 3], 2), [2, 4, 6]);
  assert.deepEqual(v.negate([1, -2, 3]), [-1, 2, -3]);
});

test('dot product', () => {
  assert.equal(v.dot([1, 0, 0], [0, 1, 0]), 0);
  assert.equal(v.dot([1, 2, 3], [4, 5, 6]), 32);
});

test('cross product is right-handed', () => {
  assert.deepEqual(v.cross([1, 0, 0], [0, 1, 0]), [0, 0, 1]);
  assert.deepEqual(v.cross([0, 1, 0], [0, 0, 1]), [1, 0, 0]);
  assert.deepEqual(v.cross([0, 0, 1], [1, 0, 0]), [0, 1, 0]);
});

test('length and normalize', () => {
  assert.equal(v.length([3, 4, 0]), 5);
  const n = v.normalize([0, 3, 4]);
  assert.ok(close(v.length(n), 1));
  assert.ok(vclose(n, [0, 0.6, 0.8]));
});

test('normalize of zero vector is zero (no NaN)', () => {
  assert.deepEqual(v.normalize([0, 0, 0]), [0, 0, 0]);
});

test('lerp endpoints and midpoint', () => {
  assert.deepEqual(v.lerp([0, 0, 0], [10, 20, 30], 0), [0, 0, 0]);
  assert.deepEqual(v.lerp([0, 0, 0], [10, 20, 30], 1), [10, 20, 30]);
  assert.deepEqual(v.lerp([0, 0, 0], [10, 20, 30], 0.5), [5, 10, 15]);
});

test('distance', () => {
  assert.equal(v.distance([0, 0, 0], [3, 4, 0]), 5);
});
