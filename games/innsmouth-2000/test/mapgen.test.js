import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeMap, mapStats, TERRAIN, MAX_ELEV } from '../src/mapgen.js';

const VALID = new Set(Object.values(TERRAIN));

test('same seed produces an identical map', () => {
  const a = makeMap({ seed: 1234, cols: 64, rows: 64 });
  const b = makeMap({ seed: 1234, cols: 64, rows: 64 });
  assert.equal(a.cols, b.cols);
  assert.equal(a.rows, b.rows);
  for (let i = 0; i < a.tiles.length; i++) {
    assert.equal(a.tiles[i].terrain, b.tiles[i].terrain, `terrain differs at ${i}`);
    assert.equal(a.tiles[i].elevation, b.tiles[i].elevation, `elevation differs at ${i}`);
  }
});

test('different seeds produce different maps', () => {
  const a = makeMap({ seed: 1, cols: 64, rows: 64 });
  const b = makeMap({ seed: 2, cols: 64, rows: 64 });
  let diffs = 0;
  for (let i = 0; i < a.tiles.length; i++) {
    if (a.tiles[i].terrain !== b.tiles[i].terrain) diffs++;
  }
  assert.ok(diffs > 100, `expected many differing tiles, got ${diffs}`);
});

test('every tile is fully populated and valid', () => {
  const map = makeMap({ seed: 7, cols: 48, rows: 48 });
  assert.equal(map.tiles.length, 48 * 48);
  for (const t of map.tiles) {
    assert.ok(t, 'missing tile');
    assert.ok(VALID.has(t.terrain), `bad terrain ${t.terrain}`);
    assert.ok(Number.isInteger(t.elevation));
    assert.ok(t.elevation >= 0 && t.elevation <= MAX_ELEV, `elevation ${t.elevation} out of range`);
    assert.equal(t.object, null, 'object slot should start empty');
  }
});

test('water tiles are always at elevation 0', () => {
  const map = makeMap({ seed: 99, cols: 64, rows: 64 });
  for (const t of map.tiles) {
    if (t.terrain === TERRAIN.DEEP || t.terrain === TERRAIN.SHALLOW) {
      assert.equal(t.elevation, 0);
    }
  }
});

test('the map has a real coast (a meaningful water body)', () => {
  const stats = mapStats(makeMap({ seed: 42, cols: 96, rows: 96 }));
  assert.ok(stats.waterFraction > 0.1, `too little water: ${stats.waterFraction}`);
  assert.ok(stats.waterFraction < 0.75, `too much water: ${stats.waterFraction}`);
  assert.ok(stats.landFraction > 0.2, `too little land: ${stats.landFraction}`);
});

test('the seaward front is water; the inland corner is land', () => {
  // Sea is toward larger (col+row); inland is the (0,0) corner.
  const map = makeMap({ seed: 3, cols: 80, rows: 80 });
  // Sample the far seaward corner region.
  let seawardWater = 0;
  let seawardTotal = 0;
  for (let col = map.cols - 6; col < map.cols; col++) {
    for (let row = map.rows - 6; row < map.rows; row++) {
      seawardTotal++;
      if (map.isWater(col, row)) seawardWater++;
    }
  }
  assert.ok(seawardWater / seawardTotal > 0.7, 'seaward front should be mostly water');
  // Inland corner should be mostly land.
  let inlandLand = 0;
  let inlandTotal = 0;
  for (let col = 0; col < 6; col++) {
    for (let row = 0; row < 6; row++) {
      inlandTotal++;
      if (!map.isWater(col, row)) inlandLand++;
    }
  }
  assert.ok(inlandLand / inlandTotal > 0.7, 'inland corner should be mostly land');
});

test('a river reaches from inland to the sea', () => {
  // A carved river means shallow water appears well inland (low depth), not only at the shore.
  const map = makeMap({ seed: 42, cols: 96, rows: 96 });
  const maxDepth = map.cols + map.rows - 2;
  let inlandShallow = 0;
  for (let row = 0; row < map.rows; row++) {
    for (let col = 0; col < map.cols; col++) {
      const t = map.tileAt(col, row);
      const depth = (col + row) / maxDepth;
      if (t.terrain === TERRAIN.SHALLOW && depth < 0.45) inlandShallow++;
    }
  }
  assert.ok(inlandShallow > 3, `expected an inland river channel, found ${inlandShallow} shallow tiles`);
});

test('there are hills (rock at elevation) and beaches', () => {
  const stats = mapStats(makeMap({ seed: 5, cols: 96, rows: 96 }));
  assert.ok(stats.counts.rock > 0, 'expected some hill rock');
  assert.ok(stats.counts.beach > 0, 'expected a beach strip');
  assert.ok(stats.counts.grass > 0, 'expected buildable grass');
});

test('beaches border water', () => {
  const map = makeMap({ seed: 8, cols: 64, rows: 64 });
  for (let row = 0; row < map.rows; row++) {
    for (let col = 0; col < map.cols; col++) {
      if (map.tileAt(col, row).terrain !== TERRAIN.BEACH) continue;
      const bordersWater =
        map.isWater(col + 1, row) || map.isWater(col - 1, row) ||
        map.isWater(col, row + 1) || map.isWater(col, row - 1);
      assert.ok(bordersWater, `beach at ${col},${row} does not border water`);
    }
  }
});

test('inBounds and tileAt guard the grid edges', () => {
  const map = makeMap({ seed: 1, cols: 32, rows: 32 });
  assert.equal(map.inBounds(-1, 0), false);
  assert.equal(map.inBounds(0, 32), false);
  assert.equal(map.tileAt(-1, -1), null);
  assert.ok(map.tileAt(0, 0));
  assert.ok(map.tileAt(31, 31));
});

test('default map size is 96x96', () => {
  const map = makeMap({ seed: 1 });
  assert.equal(map.cols, 96);
  assert.equal(map.rows, 96);
});
