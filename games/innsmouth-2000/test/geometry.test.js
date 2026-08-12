import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  TILE_W, TILE_H, HALF_W, HALF_H, ELEV_STEP,
  tileToWorld, tileToWorldElevated, worldToTile, worldToTileElevated,
  diamondCorners, visibleTileRange, drawOrder,
} from '../src/geometry.js';
import { makeMap } from '../src/mapgen.js';
import { makeCamera, ZOOM_LEVELS } from '../src/camera.js';

test('tile ratio is 2:1 dimetric', () => {
  assert.equal(TILE_W, 64);
  assert.equal(TILE_H, 32);
  assert.equal(TILE_W, TILE_H * 2);
  assert.equal(HALF_W, 32);
  assert.equal(HALF_H, 16);
});

test('origin tile maps to world origin', () => {
  assert.deepEqual(tileToWorld(0, 0), { x: 0, y: 0 });
});

test('+1 col goes down-right, +1 row goes down-left', () => {
  assert.deepEqual(tileToWorld(1, 0), { x: HALF_W, y: HALF_H }); // down-right
  assert.deepEqual(tileToWorld(0, 1), { x: -HALF_W, y: HALF_H }); // down-left
});

test('worldToTile is the exact inverse of tileToWorld for centers', () => {
  for (let col = 0; col < 40; col++) {
    for (let row = 0; row < 40; row++) {
      const w = tileToWorld(col, row);
      const t = worldToTile(w.x, w.y);
      assert.deepEqual(t, { col, row }, `round-trip failed at ${col},${row}`);
    }
  }
});

test('worldToTile picks the containing tile for interior points', () => {
  // A point nudged toward each diamond corner still resolves to the same tile.
  const col = 5;
  const row = 3;
  const c = tileToWorld(col, row);
  const nudges = [
    { x: c.x, y: c.y }, // center
    { x: c.x + HALF_W - 2, y: c.y }, // near right corner, interior
    { x: c.x - HALF_W + 2, y: c.y }, // near left corner, interior
    { x: c.x, y: c.y + HALF_H - 2 }, // near bottom, interior
    { x: c.x, y: c.y - HALF_H + 2 }, // near top, interior
  ];
  for (const p of nudges) {
    assert.deepEqual(worldToTile(p.x, p.y), { col, row });
  }
});

test('adjacent tiles do not overlap in pick space', () => {
  // Every distinct grid tile must own its center point uniquely.
  const seen = new Set();
  for (let col = 0; col < 20; col++) {
    for (let row = 0; row < 20; row++) {
      const w = tileToWorld(col, row);
      const key = `${w.x},${w.y}`;
      assert.ok(!seen.has(key), `duplicate world center at ${col},${row}`);
      seen.add(key);
    }
  }
});

test('elevation raises the tile by ELEV_STEP per level', () => {
  const base = tileToWorld(4, 4);
  const up2 = tileToWorldElevated(4, 4, 2);
  assert.equal(up2.x, base.x);
  assert.equal(up2.y, base.y - 2 * ELEV_STEP);
  assert.deepEqual(tileToWorldElevated(4, 4, 0), base);
});

test('diamond corners form a 2:1 diamond around the center', () => {
  const [top, right, bottom, left] = diamondCorners(100, 100);
  assert.deepEqual(top, { x: 100, y: 100 - HALF_H });
  assert.deepEqual(right, { x: 100 + HALF_W, y: 100 });
  assert.deepEqual(bottom, { x: 100, y: 100 + HALF_H });
  assert.deepEqual(left, { x: 100 - HALF_W, y: 100 });
  // Width is twice height.
  assert.equal(right.x - left.x, 2 * (bottom.y - top.y));
});

test('visibleTileRange clamps to grid bounds', () => {
  const r = visibleTileRange(-10000, -10000, 10000, 10000, 32, 32, 1);
  assert.equal(r.minCol, 0);
  assert.equal(r.minRow, 0);
  assert.equal(r.maxCol, 31);
  assert.equal(r.maxRow, 31);
});

test('visibleTileRange covers the tiles inside a small window', () => {
  // A window around tile (10,10)'s center must include that tile.
  const c = tileToWorld(10, 10);
  const r = visibleTileRange(c.x - 40, c.y - 20, c.x + 40, c.y + 20, 64, 64, 1);
  assert.ok(r.minCol <= 10 && r.maxCol >= 10);
  assert.ok(r.minRow <= 10 && r.maxRow >= 10);
});

test('drawOrder sorts back-to-front by depth then row', () => {
  const tiles = [
    { col: 2, row: 2 }, // depth 4
    { col: 0, row: 0 }, // depth 0
    { col: 1, row: 0 }, // depth 1
    { col: 0, row: 1 }, // depth 1
  ];
  const sorted = tiles.slice().sort(drawOrder);
  assert.deepEqual(sorted[0], { col: 0, row: 0 });
  assert.equal(sorted[sorted.length - 1].col + sorted[sorted.length - 1].row, 4);
  // Same depth: lower row first.
  const d1 = sorted.filter((t) => t.col + t.row === 1);
  assert.deepEqual(d1, [{ col: 1, row: 0 }, { col: 0, row: 1 }]);
});

// --- pick alignment: pick(project(tile)) === tile, at every zoom, on a REAL generated map -------
// (M9.7, the operator-reported cursor/tile misalignment: "the mouse cursor doesn't line up with
// where features actually place." Root-caused to worldToTile ignoring elevation while render.js
// draws a raised tile's diamond ELEV_STEP*elevation px higher on screen -- so any hill mispicked.
// Ground truth here is the tile's own ACTUAL rendered position: tileToWorldElevated -> the
// camera's forward projection -> worldToTileElevated (the real screen->tile pick path, via
// camera.screenToWorld + this function -- exactly what main.js's tileUnder() calls). See the
// worldToTileElevated doc comment above for the measured cliff-edge limit this suite encodes.)

const PICK_MAP = makeMap({ seed: 'pick-alignment', cols: 96, rows: 96 });

function pick(cam, col, row, elevation) {
  const w = tileToWorldElevated(col, row, elevation);
  const s = cam.worldToScreen(w.x, w.y);
  const back = cam.screenToWorld(s.x, s.y);
  return worldToTileElevated(back.x, back.y, PICK_MAP);
}

test('flat and gently-sloped terrain (elevation 0-1) always round-trips exactly, at every zoom', () => {
  for (const zoom of ZOOM_LEVELS) {
    const cam = makeCamera({ mapCols: 96, mapRows: 96, viewportW: 1280, viewportH: 800, zoom });
    for (let col = 2; col < 94; col += 2) {
      for (let row = 2; row < 94; row += 2) {
        const tile = PICK_MAP.tileAt(col, row);
        if (tile.elevation > 1) continue;
        const got = pick(cam, col, row, tile.elevation);
        assert.deepEqual(got, { col, row }, `zoom ${zoom}: (${col},${row}) elevation ${tile.elevation} mispicked as (${got.col},${got.row})`);
      }
    }
  }
});

test('the naive flat pick (pre-fix) mispicks EVERY elevation-2+ tile -- the regression this guards', () => {
  const cam = makeCamera({ mapCols: 96, mapRows: 96, viewportW: 1280, viewportH: 800, zoom: 1 });
  let sawElevated = false;
  for (let col = 2; col < 94; col += 3) {
    for (let row = 2; row < 94; row += 3) {
      const tile = PICK_MAP.tileAt(col, row);
      if (tile.elevation < 2) continue;
      sawElevated = true;
      const w = tileToWorldElevated(col, row, tile.elevation);
      const s = cam.worldToScreen(w.x, w.y);
      const back = cam.screenToWorld(s.x, s.y);
      const naive = worldToTile(back.x, back.y); // the OLD, unfixed pick
      assert.notDeepEqual(naive, { col, row }, 'expected the naive flat pick to mispick this elevated tile');
    }
  }
  assert.ok(sawElevated, 'test map produced no elevation 2+ tiles to sample -- widen the scan');
});

test('the fixed pick corrects the overwhelming majority of elevated terrain, whole-map', () => {
  const cam = makeCamera({ mapCols: 96, mapRows: 96, viewportW: 1280, viewportH: 800, zoom: 1 });
  let total = 0, fails = 0;
  for (let col = 2; col < 94; col++) {
    for (let row = 2; row < 94; row++) {
      const tile = PICK_MAP.tileAt(col, row);
      total++;
      const got = pick(cam, col, row, tile.elevation);
      if (got.col !== col || got.row !== row) fails++;
    }
  }
  // Measured baseline on this seed: 69/8464 (~0.8%), confined to sheer cliff faces (see the
  // worldToTileElevated doc comment). A generous ceiling well above that catches a real
  // regression without being a flaky exact-count assertion tied to one seed's noise.
  assert.ok(fails / total < 0.02, `mispick rate ${fails}/${total} = ${(100 * fails / total).toFixed(2)}% exceeds the 2% ceiling`);
});

test('the fixed pick is consistent across zoom levels (the error pattern is elevation, not scale)', () => {
  const counts = ZOOM_LEVELS.map((zoom) => {
    const cam = makeCamera({ mapCols: 96, mapRows: 96, viewportW: 1280, viewportH: 800, zoom });
    let fails = 0;
    for (let col = 2; col < 94; col += 2) {
      for (let row = 2; row < 94; row += 2) {
        const tile = PICK_MAP.tileAt(col, row);
        const got = pick(cam, col, row, tile.elevation);
        if (got.col !== col || got.row !== row) fails++;
      }
    }
    return fails;
  });
  // If the residual were a scale bug it would grow with zoom; it doesn't -- same count at every
  // zoom, because the error lives entirely in world space (elevation), before zoom is applied.
  assert.equal(counts[0], counts[1]);
  assert.equal(counts[1], counts[2]);
});

test('picking still works correctly after the camera viewport changes size (a window resize)', () => {
  const cam = makeCamera({ mapCols: 96, mapRows: 96, viewportW: 1280, viewportH: 800, zoom: 1 });
  cam.setViewport(640, 480).clampToBounds(); // simulates main.js's resize()
  let fails = 0, total = 0;
  for (let col = 10; col < 40; col++) {
    for (let row = 10; row < 40; row++) {
      const tile = PICK_MAP.tileAt(col, row);
      if (tile.elevation > 1) continue; // the guaranteed-exact band
      total++;
      const got = pick(cam, col, row, tile.elevation);
      if (got.col !== col || got.row !== row) fails++;
    }
  }
  assert.equal(fails, 0, `${fails}/${total} mispicks after a viewport resize, on flat/gentle terrain`);
});
