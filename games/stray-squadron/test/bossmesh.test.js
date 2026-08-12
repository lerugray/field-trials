// The boss mesh (M8) — code-generated dreadnought geometry, headless-buildable and a
// distinct read from the small enemy dart (broad + blocky vs compact + swept).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBossMesh } from '../src/gfx/bossmesh.js';
import { createEnemyMesh } from '../src/gfx/enemymesh.js';

test('the boss builds a substantial flat-shaded mesh', () => {
  const m = createBossMesh();
  assert.ok(m.triCount > 40, 'a dreadnought is many triangles, not a cube');
  assert.equal(m.positions.length, m.triCount * 9);
  assert.equal(m.normals.length, m.triCount * 9);
  assert.equal(m.colors.length, m.triCount * 9);
});

test('the boss is far heavier geometry than a fighter (distinct read)', () => {
  assert.ok(createBossMesh().triCount > createEnemyMesh().triCount * 2);
});

test('the boss mesh has an exposed hot core (a bright warm face present)', () => {
  const m = createBossMesh();
  let hotFace = false;
  for (let i = 0; i < m.colors.length; i += 3) {
    const r = m.colors[i], g = m.colors[i + 1], b = m.colors[i + 2];
    if (r > 0.9 && g > 0.45 && b < 0.4) { hotFace = true; break; } // the core amber
  }
  assert.ok(hotFace, 'the weak-point core reads as a hot amber facet');
});

test('all boss geometry is finite', () => {
  const m = createBossMesh();
  for (const v of m.positions) assert.ok(Number.isFinite(v));
  for (const v of m.normals) assert.ok(Number.isFinite(v));
});
