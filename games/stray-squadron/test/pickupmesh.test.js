// Pickup meshes (M4 + M7) — code-generated geometry, headless-buildable. Each kind
// builds real triangles; the M7 rescue beacon is a distinct silhouette from the calm
// heal/score pickups (a11y: told apart by shape, not color alone).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPickupMesh } from '../src/gfx/pickupmesh.js';

const ACCENT = [0.9, 0.7, 0.4];

test('every pickup kind builds a non-empty flat-shaded mesh', () => {
  for (const kind of ['repair', 'score', 'rescue']) {
    const m = createPickupMesh(kind, ACCENT);
    assert.ok(m.triCount > 0, kind + ' should have triangles');
    assert.ok(m.positions && m.positions.length > 0);
  }
});

test('the rescue beacon has a distinct triangle count from the calm pickups', () => {
  const repair = createPickupMesh('repair', ACCENT).triCount;
  const score = createPickupMesh('score', ACCENT).triCount;
  const rescue = createPickupMesh('rescue', ACCENT).triCount;
  assert.notEqual(rescue, repair, 'beacon silhouette differs from the heal cross');
  assert.notEqual(rescue, score, 'beacon silhouette differs from the score gem');
});
