import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GameMap, TERRAIN } from '../src/mapgen.js';
import { TOOL, applyTool } from '../src/tools.js';
import { computePower, energizedNear, POWER_PER_TIER } from '../src/power.js';

// A flat grass map with every tile field present.
function flatMap(cols = 10, rows = 10) {
  const m = new GameMap(cols, rows);
  for (let i = 0; i < cols * rows; i++) {
    m.tiles[i] = { terrain: TERRAIN.GRASS, elevation: 1, object: null, zone: null, building: null, structure: null };
  }
  return m;
}

test('an isolated map has no power', () => {
  const p = computePower(flatMap());
  assert.equal(p.energized.size, 0);
  assert.equal(p.totals.capacity, 0);
});

test('a lone generator energizes itself and radiates to adjacent lots', () => {
  const m = flatMap();
  applyTool(m, TOOL.GASWORKS, 5, 5);
  const p = computePower(m);
  assert.ok(p.energized.has(m.index(5, 5)), 'the generator tile is energized');
  assert.ok(energizedNear(m, p, 5, 6), 'an adjacent lot can draw power');
  assert.ok(energizedNear(m, p, 4, 5), 'an adjacent lot can draw power');
  assert.equal(energizedNear(m, p, 8, 8), false, 'a far lot cannot');
  assert.equal(p.totals.capacity, 60);
});

test('power travels along a line from a generator but stops where the line stops', () => {
  const m = flatMap();
  applyTool(m, TOOL.GASWORKS, 1, 1);
  for (let c = 2; c <= 6; c++) applyTool(m, TOOL.POWERLINE, c, 1);
  const p = computePower(m);
  for (let c = 1; c <= 6; c++) assert.ok(p.energized.has(m.index(c, 1)), `col ${c} energized`);
  // A disconnected line elsewhere stays dark.
  applyTool(m, TOOL.POWERLINE, 8, 8);
  const p2 = computePower(m);
  assert.equal(p2.energized.has(m.index(8, 8)), false);
});

test('power conducts through a road crossing without breaking either network', () => {
  const m = flatMap();
  applyTool(m, TOOL.GASWORKS, 3, 1);
  for (let r = 2; r <= 7; r++) applyTool(m, TOOL.POWERLINE, 3, r);
  for (let c = 1; c <= 7; c++) applyTool(m, TOOL.ROAD, c, 4);
  const crossing = m.tileAt(3, 4);
  assert.equal(crossing.object.kind, 'crossing');
  const p = computePower(m);
  assert.ok(p.energized.has(m.index(3, 7)), 'power reaches the far side of the road');
  // Road access also sees the shared tile as road; the independent mask assertion lives in tools.
  assert.ok(crossing.object.roadMask, 'the road layer remains connected');
  assert.ok(crossing.object.powerlineMask, 'the power layer remains connected');
});

test('a network browns out when demand exceeds capacity', () => {
  const m = flatMap();
  // A gasworks (cap 60) feeding a line to many tall buildings.
  applyTool(m, TOOL.GASWORKS, 0, 0);
  for (let c = 1; c <= 8; c++) applyTool(m, TOOL.POWERLINE, c, 0);
  // Hang 20 tier-3 buildings off the line (demand 20*3*POWER_PER_TIER = 120 > 60).
  let placed = 0;
  for (let c = 1; c <= 8 && placed < 20; c++) {
    for (const r of [1, 2, 3]) {
      if (placed >= 20) break;
      m.tiles[m.index(c, r)].building = { level: 3, cls: 'unwary' };
      placed++;
    }
  }
  const p = computePower(m);
  assert.ok(p.totals.demand > p.totals.capacity);
  assert.equal(p.energized.size, 0, 'an over-taxed network browns out entirely');
});

test('a bigger generator carries a load the small one cannot', () => {
  const build = (tool) => {
    const m = flatMap();
    applyTool(m, tool, 0, 0);
    for (let c = 1; c <= 5; c++) applyTool(m, TOOL.POWERLINE, c, 0);
    // demand 5 tiles * tier 3 * 2 = 30
    for (let c = 1; c <= 5; c++) m.tiles[m.index(c, 0)].building = { level: 3, cls: 'unwary' };
    return computePower(m);
  };
  assert.equal(build(TOOL.GASWORKS).totals.demand, 5 * 3 * POWER_PER_TIER);
  assert.ok(build(TOOL.GASWORKS).energized.size > 0, 'gasworks (60) bears a load of 30');
  assert.ok(build(TOOL.WHALEOIL).energized.size > 0, 'whale-oil (140) bears it too');
});

test('computePower is deterministic for the same map', () => {
  const build = () => {
    const m = flatMap();
    applyTool(m, TOOL.GASWORKS, 2, 2);
    for (let c = 3; c <= 7; c++) applyTool(m, TOOL.POWERLINE, c, 2);
    return m;
  };
  const a = computePower(build());
  const b = computePower(build());
  assert.equal(a.energized.size, b.energized.size);
  assert.deepEqual(a.totals, b.totals);
});

test('a built lot conducts power onward to its neighbours', () => {
  const m = flatMap();
  applyTool(m, TOOL.GASWORKS, 0, 0);
  // A run of built lots chained off the generator (each conducts to the next).
  for (let c = 1; c <= 4; c++) m.tiles[m.index(c, 0)].building = { level: 1, cls: 'unwary' };
  const p = computePower(m);
  assert.ok(p.energized.has(m.index(4, 0)), 'the far lot is powered through the chain');
  assert.ok(energizedNear(m, p, 5, 0), 'and the next empty lot can develop');
});
