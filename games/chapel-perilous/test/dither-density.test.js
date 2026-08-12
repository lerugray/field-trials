// M12 G3 — R3 LOCKED 2026-08-03 by Ray: B2 Cyclopean-strength per-family density
// is the shipped default. Unknown / non-terrain ids fall back to DITHER_AMP_DEFAULT.
import test from 'node:test';
import assert from 'node:assert/strict';
import { DITHER_AMP_DEFAULT, ditherDensity } from '../src/engine/dither.js';

const FAMS = ['DEEP', 'WATER', 'SAND', 'GRASS', 'FOREST', 'HILL', 'MOUNT'];
const B2 = { DEEP: 0.08, WATER: 0.12, SAND: 1.4, GRASS: 0.3, FOREST: 1.8, HILL: 2.4, MOUNT: 3.2 };

test('shipped ditherDensity is the locked B2 per-family map', () => {
  for (const id of FAMS) {
    assert.equal(ditherDensity(id), B2[id], `${id} density`);
  }
  assert.equal(DITHER_AMP_DEFAULT, 0.85, 'fallback constant unchanged');
});

test('families have distinct densities; WATER calmer than MOUNT; unknown → fallback', () => {
  const vals = FAMS.map(ditherDensity);
  assert.equal(new Set(vals).size, 7, 'all seven families distinct');
  assert.ok(ditherDensity('WATER') < ditherDensity('MOUNT'), 'WATER < MOUNT');
  assert.equal(ditherDensity('NOPE'), DITHER_AMP_DEFAULT, 'unknown → DITHER_AMP_DEFAULT');
});
