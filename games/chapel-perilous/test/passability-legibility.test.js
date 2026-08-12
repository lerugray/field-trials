// M10 A2b — walkable-vs-blocked must read at a glance (within the palette law).
// Ray bounced off the drowned fen because its walkable MUD and impassable POOL were
// both near-black (means ~1.0 vs ~0.9) — indistinguishable. The fix follows the
// game's existing "dark still water = deep / you can't cross" language: a biome's
// WALKABLE dressings must be measurably BRIGHTER than its IMPASSABLE ones. This test
// measures that separation over the biome dressings, so a re-cut that muddies the
// distinction (mud as dark as pool again) fails CI.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTileArt } from '../src/engine/tileart.js';
import { TILES } from '../src/engine/tiles.js';
import biomeData from '../data/world/biomes.json' with { type: 'json' };

const MARGIN = 1.0; // ramp units of brightness the walkable ground must clear

function meanShade(grid) {
  let s = 0, n = 0;
  for (const row of grid) for (const v of row) { if (v < 0) continue; s += v; n += 1; }
  return n ? s / n : 0;
}

test('in any biome that dresses both, walkable ground reads brighter than blocked water', () => {
  const art = createTileArt();
  let checkedABiome = false;
  for (const b of biomeData.biomes) {
    const walkable = [];
    const blocked = [];
    for (const [baseId, artId] of Object.entries(b.dress || {})) {
      const tile = TILES[baseId];
      if (!tile) continue;
      const m = meanShade(art.get(artId));
      (tile.passable ? walkable : blocked).push({ artId, m });
    }
    if (!walkable.length || !blocked.length) continue; // biome has no ambiguity to resolve
    checkedABiome = true;
    const minWalk = Math.min(...walkable.map((x) => x.m));
    const maxBlock = Math.max(...blocked.map((x) => x.m));
    assert.ok(
      minWalk - maxBlock >= MARGIN,
      `biome '${b.id}': walkable dressings (min mean ${minWalk.toFixed(2)}) must clear blocked dressings ` +
      `(max mean ${maxBlock.toFixed(2)}) by >= ${MARGIN}; walkable=${JSON.stringify(walkable)} blocked=${JSON.stringify(blocked)}`,
    );
  }
  assert.ok(checkedABiome, 'expected at least one biome with both walkable + blocked dressings (the fen)');
});
