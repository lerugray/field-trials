import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMesh } from '../src/gfx/mesh.js';
import { createCraftMesh } from '../src/gfx/craft.js';

const unit = (nx, ny, nz, eps = 1e-5) =>
  Math.abs(Math.hypot(nx, ny, nz) - 1) <= eps;

test('a box is 12 triangles (36 vertices) of flat-shaded data', () => {
  const m = createMesh();
  m.box([0, 0, 0], [2, 2, 2], [0.5, 0.5, 0.5]);
  const g = m.build();
  assert.equal(g.triCount, 12);
  assert.equal(g.positions.length, 36 * 3);
  assert.equal(g.normals.length, 36 * 3);
  assert.equal(g.colors.length, 36 * 3);
});

test('box face normals are axis-aligned unit vectors, one per axis sign', () => {
  const m = createMesh();
  m.box([0, 0, 0], [2, 2, 2], [1, 1, 1]);
  const g = m.build();
  const seen = new Set();
  for (let i = 0; i < g.normals.length; i += 3) {
    const nx = g.normals[i], ny = g.normals[i + 1], nz = g.normals[i + 2];
    assert.ok(unit(nx, ny, nz));
    seen.add(`${Math.round(nx)},${Math.round(ny)},${Math.round(nz)}`);
  }
  // exactly the six axis directions
  assert.deepEqual(
    [...seen].sort(),
    ['-1,0,0', '0,-1,0', '0,0,-1', '0,0,1', '0,1,0', '1,0,0'].sort(),
  );
});

test('box is centered where asked, within its extents', () => {
  const m = createMesh();
  m.box([5, 0, 0], [2, 4, 6], [1, 1, 1]);
  const g = m.build();
  for (let i = 0; i < g.positions.length; i += 3) {
    assert.ok(g.positions[i] >= 4 - 1e-9 && g.positions[i] <= 6 + 1e-9);
    assert.ok(g.positions[i + 1] >= -2 - 1e-9 && g.positions[i + 1] <= 2 + 1e-9);
    assert.ok(g.positions[i + 2] >= -3 - 1e-9 && g.positions[i + 2] <= 3 + 1e-9);
  }
});

// --- S13: boxRot — a per-instance tumbled box (asteroid/debris variety) -----------

test('boxRot with zero rotation equals the axis-aligned box exactly', () => {
  const a = createMesh(); a.box([1, 2, 3], [2, 3, 4], [0.4, 0.5, 0.6]);
  const b = createMesh(); b.boxRot([1, 2, 3], [2, 3, 4], [0.4, 0.5, 0.6], [0, 0, 0]);
  const ga = a.build(), gb = b.build();
  assert.equal(gb.triCount, 12);
  for (let i = 0; i < ga.positions.length; i++) {
    assert.ok(Math.abs(ga.positions[i] - gb.positions[i]) < 1e-9, `vertex ${i} drifted`);
  }
});

test('boxRot actually rotates (a rotated cube is not axis-aligned) but stays valid', () => {
  const m = createMesh();
  m.boxRot([0, 0, 0], [2, 2, 2], [1, 1, 1], [0.6, 0.4, 0.9]);
  const g = m.build();
  assert.equal(g.triCount, 12);
  // Normals stay unit length (rotation preserves winding -> valid flat facets)...
  for (let i = 0; i < g.normals.length; i += 3) {
    assert.ok(unit(g.normals[i], g.normals[i + 1], g.normals[i + 2]));
  }
  // ...but they are NO LONGER the six pure axis directions (the box is tumbled).
  let offAxis = 0;
  for (let i = 0; i < g.normals.length; i += 3) {
    const comps = [g.normals[i], g.normals[i + 1], g.normals[i + 2]].map((v) => Math.abs(v));
    if (comps.filter((v) => v > 0.01).length > 1) offAxis++;
  }
  assert.ok(offAxis > 0, 'a rotated box should have off-axis face normals');
});

test('the hero craft mesh is well-formed', () => {
  const g = createCraftMesh();
  // In the low-poly budget: not a trivial cube, not a dense import.
  assert.ok(g.triCount > 40 && g.triCount < 400, `triCount=${g.triCount}`);
  assert.equal(g.positions.length, g.triCount * 9);
  assert.equal(g.normals.length, g.triCount * 9);
  assert.equal(g.colors.length, g.triCount * 9);
});

test('every craft normal is unit length and finite (no degenerate facets)', () => {
  const g = createCraftMesh();
  for (let i = 0; i < g.normals.length; i += 3) {
    const nx = g.normals[i], ny = g.normals[i + 1], nz = g.normals[i + 2];
    assert.ok(Number.isFinite(nx) && Number.isFinite(ny) && Number.isFinite(nz));
    assert.ok(unit(nx, ny, nz), `non-unit normal at ${i}: ${nx},${ny},${nz}`);
  }
});

test('every craft color channel is a valid [0,1] flat color', () => {
  const g = createCraftMesh();
  for (let i = 0; i < g.colors.length; i++) {
    assert.ok(g.colors[i] >= 0 && g.colors[i] <= 1, `color ${g.colors[i]}`);
  }
});

test('craft geometry is deterministic (no RNG, same bytes every build)', () => {
  const a = createCraftMesh();
  const b = createCraftMesh();
  assert.deepEqual([...a.positions], [...b.positions]);
  assert.deepEqual([...a.normals], [...b.normals]);
});

test('craft faces forward: nose extends further in -Z than the tail in +Z', () => {
  const g = createCraftMesh();
  let minZ = Infinity, maxZ = -Infinity;
  for (let i = 2; i < g.positions.length; i += 3) {
    minZ = Math.min(minZ, g.positions[i]);
    maxZ = Math.max(maxZ, g.positions[i]);
  }
  // pointed nose in -Z is the furthest extent
  assert.ok(minZ < -1.0, `nose minZ=${minZ}`);
  assert.ok(maxZ <= 1.1, `tail maxZ=${maxZ}`);
});
