// M10 A4 / item 12 — the MEASURED entity-visibility gate (Ray's highest Part-A
// priority; two consecutive playtests failed on "enemies/npcs are incredibly
// difficult to see on the map"). The directive is explicit: the contrast gate is
// measured, not eyeballed. Every overworld entity now wears a silhouette halo
// (tiledraw contrastOutlineShade) chosen at the FAR end of the 0..6 ramp from the
// ground it stands on. This test proves that halo clears a large brightness delta
// against EVERY ground an entity can stand on — plain terrain AND every biome's
// dressing — for every entity icon (both layers: NPCs and beasts, plus the party).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTileArt, terrainArtId } from '../src/engine/tileart.js';
import { reprShade, contrastOutlineShade, dimOutlineShade } from '../src/engine/tiledraw.js';
import { TILES } from '../src/engine/tiles.js';
import biomeData from '../data/world/biomes.json' with { type: 'json' };

const SHADE_MAX = 6;
const MIN_DELTA = 3; // half the ramp — the guaranteed floor the halo enforces
const ENTITIES = ['WANDERER_NPC', 'WANDERER_BEAST', 'PARTY'];

// Every ground an entity can stand on: plain terrain art for each passable tile,
// plus every biome's dressing art. Labeled so a failure names the exact ground.
function allGrounds(art) {
  const grounds = [];
  for (const id of Object.keys(TILES)) {
    grounds.push({ label: `terrain:${id}`, grid: art.get(terrainArtId(id)) });
  }
  for (const b of biomeData.biomes) {
    for (const [base, artId] of Object.entries(b.dress)) {
      grounds.push({ label: `${b.id}:${base}->${artId}`, grid: art.get(artId) });
    }
  }
  return grounds;
}

test('every entity halo clears a >=half-ramp contrast delta on every ground, all biomes', () => {
  const art = createTileArt();
  const grounds = allGrounds(art);
  assert.ok(grounds.length >= Object.keys(TILES).length, 'grounds enumerated');

  for (const g of grounds) {
    const groundShade = reprShade(g.grid);
    const halo = contrastOutlineShade(groundShade, SHADE_MAX);
    const delta = Math.abs(halo - groundShade);
    for (const e of ENTITIES) {
      // the halo is entity-independent (it's the ring shade), but assert per
      // entity so the failure message names which sprite would vanish.
      assert.ok(
        delta >= MIN_DELTA,
        `${e} on ${g.label}: halo shade ${halo} vs ground ${groundShade} = delta ${delta} < ${MIN_DELTA}`,
      );
    }
  }
});

test('G4 tiered halos: danger keeps full contrast, common folk read dimmer but still clear', () => {
  const art = createTileArt();
  for (const g of allGrounds(art)) {
    const gs = reprShade(g.grid);
    const full = Math.abs(contrastOutlineShade(gs, SHADE_MAX) - gs);
    const dim = Math.abs(dimOutlineShade(gs, SHADE_MAX) - gs);
    assert.ok(full >= MIN_DELTA, `${g.label}: danger halo clears the floor (${full})`);
    assert.ok(dim >= 1, `${g.label}: the dim halo still reads (delta ${dim})`);
    assert.ok(dim <= full, `${g.label}: common folk are dimmer than danger (dim ${dim} <= full ${full})`);
  }
});

test('the naked sprite REALLY would blend — the halo is doing measurable work', () => {
  // Regression proof (the pattern the M8 orange-box + display-gate tests use):
  // show that without the halo, at least one entity/ground pair has body pixels
  // that match the ground shade (delta 0), i.e. the sprite genuinely disappears —
  // so the halo isn't cosmetic, it's the fix.
  const art = createTileArt();
  const TRANSPARENT = -1;
  const bodyShades = (grid) => {
    const s = new Set();
    for (const row of grid) for (const v of row) if (v !== TRANSPARENT) s.add(v);
    return s;
  };
  let foundBlend = false;
  for (const g of allGrounds(art)) {
    const gs = reprShade(g.grid);
    for (const e of ENTITIES) {
      if (bodyShades(art.get(e)).has(gs)) { foundBlend = true; break; }
    }
    if (foundBlend) break;
  }
  assert.ok(foundBlend, 'expected at least one sprite whose body shade equals a ground shade (would vanish without the halo)');
});
