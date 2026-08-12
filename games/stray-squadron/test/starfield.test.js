import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStarfield } from '../src/gfx/starfield.js';

test('same seed lays out the identical field', () => {
  const a = createStarfield('run-7', 60);
  const b = createStarfield('run-7', 60);
  assert.deepEqual([...a.positions], [...b.positions]);
  assert.deepEqual([...a.colors], [...b.colors]);
});

test('different seeds produce different fields', () => {
  const a = createStarfield('run-7', 60);
  const b = createStarfield('run-8', 60);
  assert.notDeepEqual([...a.positions], [...b.positions]);
});

test('field is non-empty and every box is well-formed flat-shaded data', () => {
  const g = createStarfield('run-7', 90);
  assert.ok(g.triCount >= 12, `triCount=${g.triCount}`);
  assert.equal(g.positions.length, g.triCount * 9);
  assert.equal(g.normals.length, g.triCount * 9);
  assert.equal(g.colors.length, g.triCount * 9);
});

test('debris stays in front of the camera (negative Z) within the slab', () => {
  const g = createStarfield('run-7', 90);
  for (let i = 2; i < g.positions.length; i += 3) {
    // box half-extent max is ~0.55, slab is [-42,-6]; allow the margin
    assert.ok(g.positions[i] < -5, `z not in front: ${g.positions[i]}`);
    assert.ok(g.positions[i] > -43, `z too far: ${g.positions[i]}`);
  }
});

test('debris keeps a clear bubble around the hero craft', () => {
  const g = createStarfield('run-7', 200);
  // no debris VERTEX inside a tight bubble at the craft origin-ish
  for (let i = 0; i < g.positions.length; i += 3) {
    const x = g.positions[i], y = g.positions[i + 1], z = g.positions[i + 2];
    const d = Math.hypot(x, y, z + 4);
    assert.ok(d > 3.0, `debris too close to hero: d=${d}`);
  }
});
