// M12 G1 — widen base-ramp value gaps between adjacent terrain types (art voice, pure
// value work). The named concern: WATER must read 1-2 shades off the walkable ground it
// borders (SAND beach / GRASS) so the coastline is legible — SAND used to share water's
// shade exactly (both repr 2). Measured, not eyeballed.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createTileArt, terrainArtId } from '../src/engine/tileart.js';
import { reprShade } from '../src/engine/tiledraw.js';

const art = createTileArt();
const shadeOf = (id) => reprShade(art.get(terrainArtId(id)));

test('water clears a value gap from the walkable ground it borders', () => {
  const water = shadeOf('WATER');
  assert.ok(Math.abs(water - shadeOf('SAND')) >= 2, 'water is 2 shades off the sand beach');
  assert.ok(Math.abs(water - shadeOf('GRASS')) >= 1, 'water is off the grass too');
  assert.notEqual(water, shadeOf('SAND'), 'water and sand are never the same shade (the regression)');
});

test('the deep/shallow water pair still reads as distinct depth', () => {
  assert.ok(Math.abs(shadeOf('DEEP') - shadeOf('WATER')) >= 1, 'deep vs shallow water is legible');
});
