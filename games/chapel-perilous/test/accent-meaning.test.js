// M12 G2 — the single accent hue aimed at MEANING. Dense on water (the Cyclopean
// coloured element), subtler on deep water, and ZERO on mundane walkable ground — so
// the accent reads as "something worth noticing here," never as decoration.
import test from 'node:test';
import assert from 'node:assert/strict';
import { terrainAccentSpec } from '../src/engine/tileart.js';

test('water carries a dense accent glint; deep water a subtler one', () => {
  const water = terrainAccentSpec('WATER');
  const deep = terrainAccentSpec('DEEP');
  assert.ok(water && water.chance > 0, 'water glints');
  assert.ok(deep && deep.chance > 0, 'deep water glints');
  assert.ok(water.chance > deep.chance, 'water reads denser than the deep');
});

test('mundane walkable ground carries ZERO accent', () => {
  for (const id of ['SAND', 'GRASS', 'FOREST', 'HILL', 'MOUNT']) {
    assert.equal(terrainAccentSpec(id), null, `${id} has no accent (nothing to say)`);
  }
});
