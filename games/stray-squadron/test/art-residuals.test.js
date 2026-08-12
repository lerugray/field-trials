// The three refuter residuals the art migration had to close, as checks.
//
// docs/art-poc/approval-record/README.md lists them: "hero pale/flat (needs
// shadow/contrast), edge-on ally shard read, right-edge cluster heap". Two of the three
// are properties of the MESHES, which means they are checkable here rather than only in
// a capture — and a residual that is only ever checked by eye is a residual that comes
// back. (The third, cluster heaps, is a scene property: it lives in
// test/instrument.test.js and scripts/instrument.mjs.)

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCraftMesh, CRAFT_PALETTE } from '../src/gfx/craft.js';
import { createEnemyMesh } from '../src/gfx/enemymesh.js';
import { createBossMesh } from '../src/gfx/bossmesh.js';

// Perceptual-ish value of a flat face colour.
const value = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];

const faceColors = (m) => {
  const out = [];
  for (let t = 0; t < m.triCount; t++) {
    const i = t * 9;
    out.push([m.colors[i], m.colors[i + 1], m.colors[i + 2]]);
  }
  return out;
};

// ---- Residual 1: "hero pale/flat" --------------------------------------------------

test('the hero craft spans a real value range — not one pale note', () => {
  const cols = faceColors(createCraftMesh());
  const vals = cols.map(value);
  const lo = Math.min(...vals), hi = Math.max(...vals);
  // The pre-migration ramp spanned about 0.28 -> 0.50 in value, which is what read as
  // flat. A flat-shaded ship needs enough internal range for its own facets to step.
  assert.ok(hi - lo > 0.5,
    `hero value range is only ${(hi - lo).toFixed(2)} (${lo.toFixed(2)}..${hi.toFixed(2)})`);
  assert.ok(lo < 0.12, `the hero's darkest face is ${lo.toFixed(2)} — it has no true shadow`);
});

test('the hero has a genuine underside, darker than its shadowed hull step', () => {
  assert.ok(value(CRAFT_PALETTE.keel) < value(CRAFT_PALETTE.hullDark),
    'the keel should be the darkest thing on the ship');
  assert.ok(value(CRAFT_PALETTE.wing) > value(CRAFT_PALETTE.hull),
    'the top plane should catch more key than the fuselage');
});

test('the hero mesh actually paints its dark steps — a palette entry is not a face', () => {
  // A dark colour that never reaches a triangle fixes nothing. Both dark steps must
  // appear on real geometry.
  const cols = faceColors(createCraftMesh());
  for (const [name, want] of [['keel', CRAFT_PALETTE.keel], ['hullDark', CRAFT_PALETTE.hullDark]]) {
    const used = cols.some((c) =>
      Math.abs(c[0] - want[0]) < 1e-6 && Math.abs(c[1] - want[1]) < 1e-6 && Math.abs(c[2] - want[2]) < 1e-6);
    assert.ok(used, `${name} is declared but never painted onto a face`);
  }
});

// ---- Residual 2: "edge-on shard read" ----------------------------------------------

// A zero-thickness blade is built as the SAME triangle twice with opposite winding.
// Viewed near its own plane it collapses to a lit sliver that reads as an explosion
// shard rather than as part of a ship. Find them by looking for coincident vertex sets.
function coincidentPairs(m) {
  const key = (t) => {
    const i = t * 9;
    const v = [];
    for (let k = 0; k < 3; k++) {
      v.push([m.positions[i + k * 3], m.positions[i + k * 3 + 1], m.positions[i + k * 3 + 2]]
        .map((n) => n.toFixed(4)).join(','));
    }
    return v.sort().join('|');   // order-independent: catches the reversed winding
  };
  const seen = new Map();
  let pairs = 0;
  for (let t = 0; t < m.triCount; t++) {
    const k = key(t);
    if (seen.has(k)) pairs++;
    else seen.set(k, t);
  }
  return pairs;
}

for (const variant of ['drone', 'turret', 'elite', 'heavy']) {
  test(`the ${variant} has no zero-thickness blades (edge-on shard read)`, () => {
    assert.equal(coincidentPairs(createEnemyMesh(variant)), 0,
      'a double-sided coincident triangle pair is a blade with no volume');
  });
}

test('the hero and the capital have no zero-thickness blades either', () => {
  assert.equal(coincidentPairs(createCraftMesh()), 0, 'hero tailfin');
  assert.equal(coincidentPairs(createBossMesh()), 0, 'capital wings');
});

test('every fin still has area — no degenerate triangles anywhere', () => {
  const meshes = [createCraftMesh(), createBossMesh(),
    ...['drone', 'turret', 'elite', 'heavy'].map(createEnemyMesh)];
  for (const m of meshes) {
    for (let i = 0; i < m.normals.length; i += 3) {
      const len = Math.hypot(m.normals[i], m.normals[i + 1], m.normals[i + 2]);
      assert.ok(Math.abs(len - 1) < 1e-3, `degenerate face: normal length ${len}`);
    }
  }
});

// ---- Capital mass -------------------------------------------------------------------

test('the capital reads as MASS: long, broad, and low, not a scaled-up fighter', () => {
  const m = createBossMesh();
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity,
    minZ = Infinity, maxZ = -Infinity;
  for (let i = 0; i < m.positions.length; i += 3) {
    minX = Math.min(minX, m.positions[i]); maxX = Math.max(maxX, m.positions[i]);
    minY = Math.min(minY, m.positions[i + 1]); maxY = Math.max(maxY, m.positions[i + 1]);
    minZ = Math.min(minZ, m.positions[i + 2]); maxZ = Math.max(maxZ, m.positions[i + 2]);
  }
  const w = maxX - minX, h = maxY - minY, d = maxZ - minZ;
  assert.ok(d > w * 1.5, `capital is ${d.toFixed(1)} deep vs ${w.toFixed(1)} wide — not long enough to read as a ship`);
  assert.ok(w > h * 2.2, `capital is ${w.toFixed(1)} wide vs ${h.toFixed(1)} tall — not broad and low`);
});

test('the capital gained its mass AFT, never at the front where you aim', () => {
  // Bolts converge on the core at the origin and hits resolve on a radius-3.4 sphere
  // scaled the same 3.6x as the mesh, so the hit sphere reaches 0.944 in local units.
  // The muzzle bores already stood at 1.02 BEFORE this migration — a 0.28-world-unit
  // overhang on a boss whose collision the code calls deliberately generous. That is
  // pre-existing and not this change's to move; what matters is that the migration's
  // added mass went aft and below, and that the nose did not creep further out. Pinned
  // at the pre-migration value so a future edit that pushes it forward fails here.
  const PRE_MIGRATION_NOSE = 1.02;
  const m = createBossMesh();
  let maxZ = -Infinity, minZ = Infinity;
  for (let i = 2; i < m.positions.length; i += 3) {
    maxZ = Math.max(maxZ, m.positions[i]);
    minZ = Math.min(minZ, m.positions[i + 0 * 3]);
  }
  minZ = Infinity;
  for (let i = 2; i < m.positions.length; i += 3) minZ = Math.min(minZ, m.positions[i]);
  assert.ok(maxZ <= PRE_MIGRATION_NOSE + 1e-6,
    `the capital's nose reaches ${maxZ.toFixed(2)}, past the pre-migration ${PRE_MIGRATION_NOSE}`);
  assert.ok(minZ < -4, `the added mass should run aft; tail only reaches ${minZ.toFixed(2)}`);
});

test('the capital has separable planes — four value steps, not two dark ones', () => {
  const vals = faceColors(createBossMesh()).map(value);
  const lo = Math.min(...vals), hi = Math.max(...vals);
  assert.ok(hi - lo > 0.55,
    `capital value range is only ${(hi - lo).toFixed(2)} — its form will silhouette away`);
  // Its brightest large surface must beat the sector skies it is seen against, or the
  // whole hull reads as one black clump (which is what the first migration capture showed).
  const bright = vals.filter((v) => v > 0.45).length;
  assert.ok(bright > 8, `only ${bright} faces are light enough to read against a lit horizon`);
});
