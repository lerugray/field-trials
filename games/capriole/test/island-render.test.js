// node --test — the rendered grass cap and strata body share one seam on every
// island shape. Pure measurements: no WebGL required.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateSphere } from '../src/sim/generate.js';
import { makeTestArchipelago } from '../src/sim/islands.js';
import { islandSurfaceProfile } from '../src/render/islandgeometry.js';

test('grass caps meet their strata bodies across handcrafted and generated islands', () => {
  const islands = [
    ...makeTestArchipelago(),
    ...[0, 1, 4, 8].flatMap((sphere) => generateSphere(17, sphere).islands),
  ];
  assert.ok(new Set(islands.map((isl) => isl.radius)).size > 4, 'covers varied platform radii');
  assert.ok(new Set(islands.map((isl) => isl.topY)).size > 4, 'covers varied platform heights');
  for (const isl of islands) {
    const profile = islandSurfaceProfile(isl);
    assert.equal(profile.bodyTopY, profile.capY, `closed seam at (${isl.cx}, ${isl.cz}) r=${isl.radius}`);
    assert.ok(profile.depth > 0, 'body still extends beneath the cap');
  }
});
