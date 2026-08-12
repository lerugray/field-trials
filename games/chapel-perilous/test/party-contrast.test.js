import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld } from '../src/engine/world.js';
import { createBiomes } from '../src/engine/biomes.js';
import { createTileArt, terrainArtId } from '../src/engine/tileart.js';
import { createPalettes } from '../src/engine/palette.js';
import { measurePartyLocalContrast, shadeLuminances } from '../src/engine/partycontrast.js';
import { OVERWORLD_PARTY_LUMINANCE, OVERWORLD_TERRAIN_LUMINANCE } from '../src/engine/overworldart.js';
import master from '../data/world/master.json' with { type: 'json' };
import biomeData from '../data/world/biomes.json' with { type: 'json' };
import paletteData from '../data/palettes.json' with { type: 'json' };

// RMS separation in normalized linear luminance, after the restrained CRT model.
// The existing 0.28 threshold is revalidated against the round-1 map ramp; the
// measured halo, hood catch and YOU stack must carry recognition, not a large pool.
export const PARTY_LOCAL_CONTRAST_MIN = 0.28;

function artAt(world, biomes, art, x, y) {
  const tile = world.tileAt(x, y);
  const biome = biomes.biomeAt(x, y);
  const id = biome ? biomes.dressFor(biome, tile.id, terrainArtId(tile.id)) : terrainArtId(tile.id);
  return art.get(id);
}

function sweep(treatment) {
  const art = createTileArt(), biomes = createBiomes(biomeData), palettes = createPalettes(paletteData);
  const offsets = [[-1,-1],[0,-1],[1,-1],[-1,0],[1,0],[-1,1],[0,1],[1,1]];
  const scores = [], terrain = new Set(), dressed = new Set();
  for (const seed of [1, 23, 707, 2323, 0x435048, 0xdecafbad]) {
    const world = createWorld({ ...master, seed, sites: [], gates: [] });
    for (let y = -24; y <= 24; y += 3) for (let x = -24; x <= 24; x += 3) {
      const tile = world.tileAt(x, y), biome = biomes.biomeAt(x, y);
      terrain.add(tile.id);
      dressed.add(biome ? biomes.dressFor(biome, tile.id, terrainArtId(tile.id)) : terrainArtId(tile.id));
      const ground = artAt(world, biomes, art, x, y);
      const neighbours = offsets.map(([dx, dy]) => artAt(world, biomes, art, x + dx, y + dy));
      for (const scheme of ['phosphor-green', 'amber']) {
        const shadeLumas = shadeLuminances(palettes, scheme, OVERWORLD_TERRAIN_LUMINANCE);
        const partyLumas = shadeLuminances(palettes, scheme, OVERWORLD_PARTY_LUMINANCE);
        scores.push(measurePartyLocalContrast({
          ground, neighbours, party: art.get('PARTY'),
          shadeLumas, partyLumas, treatment,
        }).score);
      }
    }
  }
  scores.sort((a, b) => a - b);
  return { min: scores[0], mean: scores.reduce((a, b) => a + b, 0) / scores.length, samples: scores.length, terrain, dressed };
}

test('party tile clears the seeded local-contrast gate on every swept terrain, both approved hues, CRT on', () => {
  const after = sweep('conformed');
  assert.equal(after.samples, 3468, 'six seeded worlds × 17² cells × two hues');
  assert.deepEqual([...after.terrain].sort(), ['DEEP', 'FOREST', 'GRASS', 'HILL', 'MOUNT', 'SAND', 'WATER'], 'every terrain family was swept');
  for (const id of ['VERGE_GROUND', 'PINE_BARRENS', 'PINE_FLOOR', 'SALT_PAN', 'SALT_CRUST', 'FEN_REED', 'FEN_MUD', 'FEN_POOL']) {
    assert.ok(after.dressed.has(id), `seeded sweep includes biome dressing ${id}`);
  }
  assert.ok(after.min >= PARTY_LOCAL_CONTRAST_MIN,
    `minimum local contrast ${after.min.toFixed(4)} must clear ${PARTY_LOCAL_CONTRAST_MIN}`);
});

test('conformed focal stack measurably improves the rejected post-sprite wash', () => {
  const before = sweep('legacy'), after = sweep('conformed');
  assert.ok(after.min > before.min, `minimum ${before.min.toFixed(4)} -> ${after.min.toFixed(4)}`);
  assert.ok(after.mean > before.mean, `mean ${before.mean.toFixed(4)} -> ${after.mean.toFixed(4)}`);
});
