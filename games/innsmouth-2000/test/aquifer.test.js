// The subsurface substrate (M-b): what the ground beneath each tile holds, and the sea-connected
// regions the Deep Ones dwell in. Pure over the map, so every rule is asserted directly.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GameMap, TERRAIN, makeMap } from '../src/mapgen.js';
import { TOOL, applyTool } from '../src/tools.js';
import { makeSim } from '../src/sim.js';
import {
  SUBSTRATE, AQUIFER_DEFAULTS, aquiferOptions, aquiferHash,
  computeAquifer, substrateAt, substrateOf, regionOfTile, isOpenFissure,
} from '../src/aquifer.js';

// A coast: a column of deep water on the west, then shallows, then land climbing inland. Elevation
// rises with distance from the water, so the low shore can fissure and the hills cannot.
function coastMap(cols = 20, rows = 12) {
  const m = new GameMap(cols, rows);
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      let terrain = TERRAIN.GRASS;
      // Kept at or below brackishMaxElev inland, so DISTANCE is the variable these tests vary;
      // the one test about height raises a tile itself.
      let elevation = Math.min(3, Math.max(0, col - 2));
      if (col === 0) { terrain = TERRAIN.DEEP; elevation = 0; }
      else if (col === 1) { terrain = TERRAIN.SHALLOW; elevation = 0; }
      else if (col === 2) { terrain = TERRAIN.BEACH; elevation = 0; }
      m.tiles[m.index(col, row)] = {
        terrain, elevation, object: null, zone: null, building: null,
        structure: null, scar: null, pipe: null,
      };
    }
  }
  return m;
}

// A whole map of one substrate, for the region tests: an inland pond makes a brackish pocket with no
// road to the sea at all.
function pondMap() {
  const m = coastMap(24, 12);
  // A little inland pond at col 14, far past any brackish reach from the coast.
  for (const [c, r] of [[14, 5], [14, 6], [15, 5], [15, 6]]) {
    const t = m.tileAt(c, r);
    t.terrain = TERRAIN.SHALLOW;
    t.elevation = 0;
  }
  return m;
}

// --- the reading itself -----------------------------------------------------------------------

test('open water reads as sea, and ground far enough inland reads as fresh', () => {
  const map = coastMap();
  const aq = computeAquifer(map);
  assert.equal(aq.substrate[map.index(0, 5)], SUBSTRATE.SEA, 'deep water');
  assert.equal(aq.substrate[map.index(1, 5)], SUBSTRATE.SEA, 'shallow water is still the sea');
  assert.equal(aq.substrate[map.index(19, 5)], SUBSTRATE.FRESH, 'the far inland hill runs sweet');
  assert.equal(substrateOf(aq, map.index(19, 5)), SUBSTRATE.FRESH, 'and the lookup agrees');
  assert.equal(substrateOf(null, 0), null, 'a lookup before the sim has computed one is null-safe');
});

test('the brine reaches exactly as far inland as brackishReach, and no further', () => {
  const map = coastMap();
  for (const reach of [1, 2, 3, 5]) {
    const aq = computeAquifer(map, { brackishReach: reach, fissureRate: 0 });
    // Water sits at cols 0-1, so the first land tile (col 2) is one step from the sea.
    for (let col = 2; col < 12; col++) {
      const distance = col - 1;
      const sub = aq.substrate[map.index(col, 5)];
      const tile = map.tileAt(col, 5);
      const expected = (distance <= reach && tile.elevation <= AQUIFER_DEFAULTS.brackishMaxElev)
        ? SUBSTRATE.BRACKISH : SUBSTRATE.FRESH;
      assert.equal(sub, expected, `reach ${reach}: col ${col} (${distance} from the sea)`);
    }
  }
});

test('a wider brine band means strictly more brackish ground (the hard scenario)', () => {
  const map = coastMap();
  const count = (reach) => computeAquifer(map, { brackishReach: reach, fissureRate: 0 })
    .substrate.filter((s) => s === SUBSTRATE.BRACKISH).length;
  const narrow = count(2);
  const wide = count(5);
  assert.ok(wide > narrow, `a reach of 5 should brine more ground than 2 (${wide} vs ${narrow})`);
});

test('height beats distance: the hill above brackishMaxElev runs sweet however near the water', () => {
  const map = coastMap();
  // Raise the tile one step from the water to a hilltop.
  map.tileAt(2, 3).elevation = 6;
  const aq = computeAquifer(map, { brackishReach: 6, fissureRate: 0 });
  assert.equal(aq.substrate[map.index(2, 3)], SUBSTRATE.FRESH, 'the raised tile is sweet');
  assert.equal(aq.substrate[map.index(2, 4)], SUBSTRATE.BRACKISH, 'its low neighbour is not');
});

test('fissures only open in low ground within fissureReach, and the rate scatters them', () => {
  const map = coastMap(40, 40);
  const aq = computeAquifer(map, { fissureReach: 1, fissureRate: 1 });
  for (const i of aq.fissures) {
    const col = i % map.cols;
    const row = (i - col) / map.cols;
    const tile = map.tileAt(col, row);
    assert.ok(tile.elevation <= 1, `fissure at ${col},${row} is above the low shore`);
    assert.ok(aq.seaDistance[i] <= 1, `fissure at ${col},${row} is not against the water`);
  }
  assert.ok(aq.fissures.length > 0, 'a rate of 1 should open every eligible tile');
  // And a rate of 0 opens none, while a middling rate opens some but not all.
  assert.equal(computeAquifer(map, { fissureRate: 0 }).fissures.length, 0);
  const some = computeAquifer(map, { fissureReach: 1, fissureRate: 0.5 }).fissures.length;
  assert.ok(some > 0 && some < aq.fissures.length,
    `a rate of 0.5 should open some of the ${aq.fissures.length} eligible tiles, got ${some}`);
});

test('the fissure scatter is a positional hash, so it never blinks between two reads', () => {
  const map = coastMap(40, 40);
  const a = computeAquifer(map, { fissureRate: 0.3 });
  const b = computeAquifer(map, { fissureRate: 0.3 });
  assert.deepEqual(a.fissures, b.fissures, 'two reads of the same map must agree exactly');
  // The hash itself is stable and in range, and different tiles differ.
  const values = [0, 1, 2, 99, 5000].map((i) => aquiferHash(i, 1));
  for (const v of values) assert.ok(v >= 0 && v < 1, `hash out of range: ${v}`);
  assert.equal(new Set(values).size, values.length, 'the hash should not collide on nearby indexes');
  assert.equal(aquiferHash(77, 1), aquiferHash(77, 1), 'and it is a function, not a stream');
});

// The equivalence pin: the whole-map flood and the single-tile box scan are two implementations of
// one rule, and this is what keeps them honest. The sealing works asks the single-tile version.
test('the whole-map pass and the single-tile query agree on every tile of a real coast', () => {
  const map = makeMap({ seed: 'aquifer-pin', cols: 48, rows: 48 });
  for (const opts of [undefined, { brackishReach: 5, fissureReach: 2, fissureRate: 0.22 },
    { brackishReach: 1, fissureReach: 1, fissureRate: 0.04 }]) {
    const aq = computeAquifer(map, opts);
    for (let row = 0; row < map.rows; row++) {
      for (let col = 0; col < map.cols; col++) {
        const i = map.index(col, row);
        assert.equal(substrateAt(map, col, row, opts), aq.substrate[i],
          `disagreement at ${col},${row} with ${JSON.stringify(aq.options)}`);
      }
    }
  }
  assert.equal(substrateAt(map, -1, -1), null, 'off the map is null');
});

test('sea distance is zero on the water and grows inland', () => {
  const map = coastMap();
  const aq = computeAquifer(map);
  assert.equal(aq.seaDistance[map.index(0, 5)], 0);
  assert.equal(aq.seaDistance[map.index(1, 5)], 0);
  assert.equal(aq.seaDistance[map.index(2, 5)], 1);
  assert.equal(aq.seaDistance[map.index(6, 5)], 5);
});

test('aquiferOptions fills in the defaults and honours an override', () => {
  assert.deepEqual(aquiferOptions(), AQUIFER_DEFAULTS);
  assert.deepEqual(aquiferOptions(null), AQUIFER_DEFAULTS);
  const o = aquiferOptions({ brackishReach: 9 });
  assert.equal(o.brackishReach, 9);
  assert.equal(o.fissureRate, AQUIFER_DEFAULTS.fissureRate, 'the rest of the defaults survive');
});

// --- regions ---------------------------------------------------------------------------------

test('a run of brine-bearing ground along the coast is one region, named by its lowest tile', () => {
  const map = coastMap();
  const aq = computeAquifer(map, { brackishReach: 2, fissureRate: 0 });
  const region = regionOfTile(aq, map.index(2, 5));
  assert.ok(region, 'the shore tile belongs to a region');
  assert.equal(region.seaConnected, true, 'and that region touches the sea');
  assert.equal(region.id, Math.min(...region.tiles), 'the id is the region lowest tile index');
  // Every brackish tile on this map is in that one connected run.
  const brackish = aq.substrate.reduce((n, s) => n + (s === SUBSTRATE.BRACKISH ? 1 : 0), 0);
  assert.equal(region.tiles.length, brackish, 'the whole coastal band is one region');
  assert.equal(regionOfTile(aq, map.index(19, 5)), null, 'sweet ground belongs to no region');
  assert.equal(regionOfTile(null, 0), null, 'and the lookup is null-safe');
});

// The open sea and any old puddle are different things, and only the first is a door.
test('an inland brine pocket raises a region that is NOT sea-connected', () => {
  const map = pondMap();
  const aq = computeAquifer(map, { brackishReach: 1, fissureRate: 0 });
  const coastal = regionOfTile(aq, map.index(2, 5));
  const inland = regionOfTile(aq, map.index(13, 5));
  assert.ok(coastal, 'the shore raises a region');
  assert.ok(inland, 'and so does the ground round the pond, because a pool does leave salt');
  assert.notEqual(coastal.id, inland.id, 'but they are not the same region');
  assert.equal(coastal.seaConnected, true, 'the shore is open to the sea');
  assert.equal(inland.seaConnected, false, 'the pond has no road to the sea');
  // The sea is the water body reaching the edge of the map; the pond touches no edge.
  assert.equal(aq.isSea[map.index(0, 5)], 1, 'the deep water on the coast is the sea');
  assert.equal(aq.isSea[map.index(14, 5)], 0, 'the inland pond is not');
});

test('a river cut from an inland pool to the coast makes that pool part of the sea', () => {
  const map = pondMap();
  // Cut a channel from the pond out to the shore: now the tide reaches it.
  for (let col = 2; col <= 14; col++) {
    const t = map.tileAt(col, 5);
    t.terrain = TERRAIN.SHALLOW;
    t.elevation = 0;
  }
  const aq = computeAquifer(map, { brackishReach: 1, fissureRate: 0 });
  assert.equal(aq.isSea[map.index(14, 6)], 1, 'the pool is now open water on the sea');
  const beside = regionOfTile(aq, map.index(13, 6));
  assert.ok(beside, 'the ground beside it is still brine-bearing');
  assert.equal(beside.seaConnected, true, 'and now it IS a door, because the channel is tidal');
});

test('sealing a fissure lowers its region open mouths without removing the fissure', () => {
  const map = coastMap(40, 40);
  const opts = { fissureReach: 1, fissureRate: 1 };
  const before = computeAquifer(map, opts);
  const target = before.fissures[0];
  const region = regionOfTile(before, target);
  const openBefore = region.openFissures;
  assert.equal(region.sealedFissures, 0);
  assert.equal(isOpenFissure(map, before, target), true);

  map.tiles[target].sealed = true;
  const after = computeAquifer(map, opts);
  const same = regionOfTile(after, target);
  assert.equal(same.fissures.length, region.fissures.length, 'the fissure is still in the rock');
  assert.equal(same.openFissures, openBefore - 1, 'but it is no longer a mouth');
  assert.equal(same.sealedFissures, 1);
  assert.equal(isOpenFissure(map, after, target), false, 'and it no longer reads open');
});

test('every region tile maps back to its own region, and to no other', () => {
  const map = makeMap({ seed: 'aquifer-regions', cols: 40, rows: 40 });
  const aq = computeAquifer(map, { brackishReach: 3, fissureRate: 0.15 });
  assert.ok(aq.regions.length > 0, 'a generated coast should raise at least one region');
  const seen = new Set();
  for (let pos = 0; pos < aq.regions.length; pos++) {
    for (const i of aq.regions[pos].tiles) {
      assert.equal(aq.regionOf[i], pos, `tile ${i} points at the wrong region`);
      assert.equal(seen.has(i), false, `tile ${i} is in two regions`);
      seen.add(i);
      const sub = aq.substrate[i];
      assert.ok(sub === SUBSTRATE.BRACKISH || sub === SUBSTRATE.FISSURE,
        `region tile ${i} is ${sub}, which is not brine-bearing ground`);
    }
  }
});

// --- the reason it is derived rather than stored ----------------------------------------------

test('a Flood Tide pushes the brine inland with no flood-to-aquifer code at all', () => {
  const map = coastMap(24, 12);
  const sim = makeSim(map, { seed: 'flood-brine', aquifer: { brackishReach: 2, fissureRate: 0 } });
  sim.step();
  const inland = map.index(5, 5);
  assert.equal(sim.aquifer.substrate[inland], SUBSTRATE.FRESH, 'this ground starts sweet');
  const wasDistance = sim.aquifer.seaDistance[inland];

  // The sea takes the low shore. Nothing writes to the aquifer; the terrain simply changes.
  sim.summonWrath('dagon');
  sim.step();
  // The tide climbed, so ground that was well inland is now within reach of the brine.
  assert.ok(sim.aquifer.seaDistance[inland] < wasDistance,
    `the flood should have brought the water closer (was ${wasDistance}, `
    + `now ${sim.aquifer.seaDistance[inland]})`);
  assert.equal(sim.aquifer.substrate[inland], SUBSTRATE.BRACKISH,
    'and the ground it left behind now reads brackish, which is saltwater intrusion for free');
});

test('a save written before the aquifer existed still gets a correct one on load', async () => {
  const { saveGame, loadGame } = await import('../src/save.js');
  const map = coastMap();
  const sim = makeSim(map, { seed: 'old-save' });
  sim.step();
  const snapshot = saveGame(sim);
  // Strip everything M-b, as an M-a save would have: no presence, no options, and (critically) no
  // per-tile substrate, because the substrate was never stored on a tile in the first place.
  delete snapshot.sim.presence;
  delete snapshot.sim.aquiferOpts;
  delete snapshot.sim.deepPace;
  const loaded = loadGame(snapshot);
  assert.ok(loaded.aquifer, 'the loaded town has a subsurface');
  assert.equal(loaded.aquifer.substrate[map.index(0, 5)], SUBSTRATE.SEA);
  assert.equal(loaded.aquifer.substrate[map.index(2, 5)], SUBSTRATE.BRACKISH);
  assert.deepEqual(loaded.presence, {}, 'with no Deep Presence recorded, which is true of it');
});

test('placing a works does not disturb the ground it stands in', () => {
  const map = coastMap();
  const before = computeAquifer(map);
  applyTool(map, TOOL.PUMPHOUSE, 3, 5);
  applyTool(map, TOOL.PIPE, 4, 5);
  const after = computeAquifer(map);
  assert.deepEqual([...after.substrate], [...before.substrate],
    'the aquifer is a fact about the ground, not about what the town built on it');
});
