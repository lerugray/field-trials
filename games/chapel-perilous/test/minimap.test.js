// cp-019 — grid-based dungeon minimap with progressive reveal and world persistence.
//
// The minimap is driven from the real explored Set the crawl tracks. These tests
// cover the model logic (explored-set → drawn cells, fog, features, exit marker,
// facing) without needing a browser canvas.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createDungeonKit, assembleDungeon, createCrawl, VEC } from '../src/engine/dungeon.js';
import {
  createMinimap, minimapKey, exploreCurrent, gatherMinimap,
  facingArrow, drawMinimap, featureGlyph,
} from '../src/engine/minimap.js';
import kit from '../data/dungeon/kit.json' with { type: 'json' };

function makeRun(seed = 20260803, cells = 4) {
  const dk = createDungeonKit(kit);
  const dungeon = assembleDungeon(dk, { seed, cells });
  const crawl = createCrawl(dungeon);
  const minimap = createMinimap();
  minimap.markAround(dungeon, crawl.x, crawl.y);
  return { dungeon, crawl, minimap };
}

test('createMinimap tracks explored tiles by coordinate key', () => {
  const m = createMinimap();
  assert.equal(m.isExplored(1, 2), false);
  m.mark(1, 2);
  assert.equal(m.isExplored(1, 2), true);
  assert.equal(m.isExplored(2, 2), false);
});

test('createMinimap restores from serialized state', () => {
  const m = createMinimap();
  m.mark(1, 2);
  m.markFeature(1, 2, 'stairs', 'out');
  const s = m.serialize();
  const m2 = createMinimap(s);
  assert.equal(m2.isExplored(1, 2), true);
  assert.equal(m2.featureAt(1, 2).kind, 'stairs');
});

test('createMinimap tolerates an empty/old save', () => {
  const m = createMinimap(null);
  assert.equal(m.isExplored(0, 0), false);
  const m2 = createMinimap({});
  assert.equal(m2.isExplored(0, 0), false);
});

test('markAround reveals only floor tiles within radius, not walls', () => {
  const { dungeon, crawl, minimap } = makeRun();
  const floorKey = minimapKey(crawl.x, crawl.y);
  assert.ok(minimap.explored.has(floorKey), 'starting tile is explored');

  let wallSeen = false;
  let floorSeen = false;
  for (const key of minimap.explored) {
    const [x, y] = key.split(',').map(Number);
    if (dungeon.floorAt(x, y)) floorSeen = true;
    else wallSeen = true;
  }
  assert.ok(floorSeen, 'some floor was revealed');
  assert.equal(wallSeen, false, 'no wall was revealed by markAround');
});

test('gatherMinimap includes only explored cells and marks fog for the rest', () => {
  const { dungeon, crawl, minimap } = makeRun();
  const data = gatherMinimap(dungeon, minimap, crawl);

  for (const f of data.floors) {
    assert.ok(minimap.isExplored(f.x, f.y), 'every drawn floor tile is explored');
    assert.ok(dungeon.floorAt(f.x, f.y), 'every drawn floor tile is really floor');
  }

  // Some floor should still be hidden (fog) on a fresh dungeon.
  const totalFloor = dungeon.floorCount;
  assert.ok(data.floors.length > 0, 'at least one floor cell is shown');
  assert.ok(data.floors.length < totalFloor, 'unexplored floor stays in fog');
});

test('gatherMinimap reports discovered features', () => {
  const { dungeon, crawl, minimap } = makeRun();
  minimap.markFeature(crawl.x, crawl.y, 'cache');
  const data = gatherMinimap(dungeon, minimap, crawl);
  assert.ok(data.features.some((f) => f.x === crawl.x && f.y === crawl.y && f.kind === 'cache'));
});

test('exit marker is only reported once the exit tile has been explored', () => {
  const { dungeon, crawl, minimap } = makeRun();
  const data = gatherMinimap(dungeon, minimap, crawl);
  if (minimap.isExplored(dungeon.entrance.x, dungeon.entrance.y)) {
    assert.equal(data.exit.seen, true);
  } else {
    assert.equal(data.exit.seen, false);
  }

  minimap.mark(dungeon.entrance.x, dungeon.entrance.y);
  const data2 = gatherMinimap(dungeon, minimap, crawl);
  assert.equal(data2.exit.seen, true);
  assert.equal(data2.exit.x, dungeon.entrance.x);
  assert.equal(data2.exit.y, dungeon.entrance.y);
});

test('player marker carries the crawl position and facing', () => {
  const { dungeon, crawl, minimap } = makeRun();
  const data = gatherMinimap(dungeon, minimap, crawl);
  assert.equal(data.player.x, crawl.x);
  assert.equal(data.player.y, crawl.y);
  assert.equal(data.player.facing, crawl.facing);

  crawl.turnRight();
  const data2 = gatherMinimap(dungeon, minimap, crawl);
  assert.equal(data2.player.facing, crawl.facing);
});

test('facingArrow points in each cardinal direction', () => {
  const north = facingArrow('N', 10, 10, 4);
  const south = facingArrow('S', 10, 10, 4);
  const east = facingArrow('E', 10, 10, 4);
  const west = facingArrow('W', 10, 10, 4);

  // The tip of the arrow should be furthest in the facing direction.
  assert.ok(north[0][1] < south[0][1], 'N arrow tip is above S arrow tip');
  assert.ok(east[0][0] > west[0][0], 'E arrow tip is right of W arrow tip');

  for (const pts of [north, south, east, west]) {
    assert.equal(pts.length, 3, 'arrow is a triangle');
  }
});

test('featureGlyph returns a glyph for known feature kinds', () => {
  assert.equal(typeof featureGlyph('stairs'), 'string');
  assert.equal(typeof featureGlyph('cache'), 'string');
});

test('drawMinimap emits the expected number of floor rectangles for the explored set', () => {
  const { dungeon, crawl, minimap } = makeRun();
  const rects = [];
  const ctx = {
    save() {}, restore() {},
    beginPath() {}, closePath() {}, moveTo() {}, lineTo() {}, fill() {}, stroke() {}, fillText() {},
    set fillStyle(_) {}, set strokeStyle(_) {}, set globalAlpha(_) {}, set lineWidth(_) {}, set font(_) {},
    set textAlign(_) {}, set textBaseline(_) {},
    fillRect(x, y, w, h) { rects.push({ x, y, w, h }); },
    strokeRect(x, y, w, h) { rects.push({ x, y, w, h, stroke: true }); },
  };
  const shade = (s) => s;
  drawMinimap(ctx, { dungeon, crawl, minimap, shadeColor: shade, x: 0, y: 0, maxSize: 120 });

  const data = gatherMinimap(dungeon, minimap, crawl);
  // Each explored floor gets a filled rect; walls do too. Filter to floor cells only.
  const floorRects = rects.filter((r) => !r.stroke && data.floors.some((f) =>
    r.x === 1 + f.x * r.w && r.y === 1 + f.y * r.h));
  assert.ok(floorRects.length >= data.floors.length, 'at least one rect per explored floor');
  assert.ok(rects.some((r) => r.stroke), 'panel border is drawn');
});

test('exploreCurrent updates the minimap from the crawl position', () => {
  const { dungeon, crawl, minimap } = makeRun();
  const before = gatherMinimap(dungeon, minimap, crawl).floors.length;
  const run = { dungeon, crawl, minimap };

  // Walk forward if possible; the explored set should grow or stay the same.
  const res = crawl.forward();
  if (!res.exited) {
    exploreCurrent(run);
    const after = gatherMinimap(dungeon, minimap, crawl).floors.length;
    assert.ok(after >= before, 'moving into a new tile does not shrink the map');
  }
});
