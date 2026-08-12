// S13: the enemy mesh ships three distinct silhouettes (drone / turret / elite) so a
// wave is not one repeated dart. This guards that each variant builds a well-formed
// flat-shaded mesh and that the silhouettes actually DIFFER (different triangle counts),
// so a future edit can't silently collapse them back to one shape.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createEnemyMesh, enemyVisualVariant } from '../src/gfx/enemymesh.js';

const wellFormed = (g) => {
  assert.ok(g.triCount > 8, `too few triangles: ${g.triCount}`);
  assert.equal(g.positions.length, g.triCount * 9);
  assert.equal(g.normals.length, g.triCount * 9);
  assert.equal(g.colors.length, g.triCount * 9);
  for (let i = 0; i < g.normals.length; i += 3) {
    const l = Math.hypot(g.normals[i], g.normals[i + 1], g.normals[i + 2]);
    assert.ok(Math.abs(l - 1) < 1e-5, 'non-unit face normal (degenerate facet)');
  }
  for (const c of g.colors) assert.ok(c >= 0 && c <= 1, 'color channel out of [0,1]');
};

// Four since the art migration (2026-08-10): the approved frames carry four distinct
// enemy reads rather than one repeated dart. The simulation still knows two kinds.
const VARIANTS = ['drone', 'turret', 'elite', 'heavy'];

test('every enemy variant builds a well-formed mesh', () => {
  for (const v of VARIANTS) wellFormed(createEnemyMesh(v));
});

test('the four silhouettes are genuinely distinct (different triangle counts)', () => {
  const counts = VARIANTS.map((v) => createEnemyMesh(v).triCount);
  assert.equal(new Set(counts).size, VARIANTS.length,
    `not all distinct: ${VARIANTS.map((v, i) => `${v}=${counts[i]}`).join(' ')}`);
});

test('the visual variant map is deterministic, and never invents a sim kind', () => {
  // It is a pure look-up on the enemy's own id: same id, same silhouette, every frame
  // and every machine. Anything it returns must be a mesh that exists.
  const seen = new Set();
  for (let id = 0; id < 200; id++) {
    for (const kind of ['drone', 'gunner']) {
      const v = enemyVisualVariant(kind, id);
      assert.ok(VARIANTS.includes(v), `unknown variant ${v}`);
      assert.equal(v, enemyVisualVariant(kind, id), 'not deterministic');
      seen.add(v);
    }
  }
  assert.equal(seen.size, 4, 'all four silhouettes should appear across a realistic id range');
  // Lopsided on purpose: a wave is mostly its base shape with an occasional standout.
  // An even split across four would make every wave look like a scrapyard, which is the
  // read the operator flagged on the key art.
  let base = 0, standout = 0;
  for (let id = 0; id < 200; id++) {
    for (const kind of ['drone', 'gunner']) {
      const v = enemyVisualVariant(kind, id);
      if (v === 'drone' || v === 'turret') base++; else standout++;
    }
  }
  assert.ok(base > standout * 2, `standouts are too common: ${standout} of ${base + standout}`);
});

test('an unknown variant falls back to the drone silhouette', () => {
  assert.equal(createEnemyMesh('nonsense').triCount, createEnemyMesh('drone').triCount);
  assert.equal(createEnemyMesh().triCount, createEnemyMesh('drone').triCount);
});
