import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GameMap, TERRAIN } from '../src/mapgen.js';
import { TOOL, applyTool } from '../src/tools.js';
import {
  scanAmbientSites, ambientWorldBounds, computeAmbient, AMBIENT_CAPS, hash01,
} from '../src/ambient.js';

// A small mixed map: a sea band along the top rows, grass below, a road run, and a shrine.
function seaMap(cols = 16, rows = 16) {
  const m = new GameMap(cols, rows);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const terrain = r < 3 ? TERRAIN.DEEP : TERRAIN.GRASS;
      m.tiles[r * cols + c] = { terrain, elevation: 1, object: null, zone: null, building: null, structure: null };
    }
  }
  return m;
}

test('hash01 is deterministic and stays in [0,1)', () => {
  for (let i = 0; i < 50; i++) {
    const v = hash01(i);
    assert.ok(v >= 0 && v < 1, `hash01(${i}) in range`);
    assert.equal(hash01(i), hash01(i), 'same input, same output');
  }
});

test('the site scan finds water, road runs, and shrines', () => {
  const m = seaMap();
  for (let c = 2; c <= 12; c++) applyTool(m, TOOL.ROAD, c, 8);
  applyTool(m, TOOL.SHRINE, 6, 10);
  const sites = scanAmbientSites(m);
  assert.ok(sites.water.length > 0, 'sampled some open-water points');
  assert.ok(sites.roadRuns.length >= 1, 'found the road run');
  assert.ok(sites.roadRuns[0].length >= 2, 'the run has a direction');
  assert.equal(sites.shrines.length, 1, 'found the shrine');
});

test('computeAmbient is deterministic: same sites and time give the same world', () => {
  const m = seaMap();
  for (let c = 2; c <= 12; c++) applyTool(m, TOOL.ROAD, c, 8);
  applyTool(m, TOOL.SHRINE, 6, 10);
  const sites = scanAmbientSites(m);
  const bounds = ambientWorldBounds(m);
  const a = computeAmbient(sites, bounds, 4200);
  const b = computeAmbient(sites, bounds, 4200);
  assert.deepEqual(a, b);
});

test('every ambient bag respects its hard cap', () => {
  const m = seaMap(48, 48);
  for (let c = 2; c <= 44; c++) applyTool(m, TOOL.ROAD, c, 20);
  for (let r = 20; r <= 44; r++) applyTool(m, TOOL.ROAD, 6, r);
  applyTool(m, TOOL.SHRINE, 10, 30);
  applyTool(m, TOOL.SHRINE, 30, 30);
  applyTool(m, TOOL.SHRINE, 40, 40);
  const sites = scanAmbientSites(m);
  const bounds = ambientWorldBounds(m);
  const amb = computeAmbient(sites, bounds, 9000);
  assert.ok(amb.gulls.length <= AMBIENT_CAPS.gulls);
  assert.ok(amb.fog.length <= AMBIENT_CAPS.fog);
  assert.ok(amb.waterShadows.length <= AMBIENT_CAPS.waterShadows);
  assert.ok(amb.carts.length <= AMBIENT_CAPS.carts);
  assert.ok(amb.processions.length <= AMBIENT_CAPS.processions);
});

test('reduced motion stills every moving entity (the low-power path)', () => {
  const m = seaMap();
  for (let c = 2; c <= 12; c++) applyTool(m, TOOL.ROAD, c, 8);
  applyTool(m, TOOL.SHRINE, 6, 10);
  const sites = scanAmbientSites(m);
  const bounds = ambientWorldBounds(m);
  const amb = computeAmbient(sites, bounds, 5000, { reducedMotion: true });
  assert.equal(amb.gulls.length, 0);
  assert.equal(amb.fog.length, 0);
  assert.equal(amb.waterShadows.length, 0);
  assert.equal(amb.carts.length, 0);
  assert.equal(amb.processions.length, 0);
});

test('a landlocked map with no roads or shrines yields no water shadows, carts, or processions', () => {
  const m = new GameMap(12, 12);
  for (let i = 0; i < 12 * 12; i++) {
    m.tiles[i] = { terrain: TERRAIN.GRASS, elevation: 1, object: null, zone: null, building: null, structure: null };
  }
  const sites = scanAmbientSites(m);
  const bounds = ambientWorldBounds(m);
  const amb = computeAmbient(sites, bounds, 3000);
  assert.equal(amb.waterShadows.length, 0, 'no water, no shadows');
  assert.equal(amb.carts.length, 0, 'no roads, no carts');
  assert.equal(amb.processions.length, 0, 'no shrine, no procession');
  // But gulls and fog wander the sky regardless of what stands below.
  assert.ok(amb.gulls.length > 0 && amb.fog.length > 0);
});

test('ambient motion is bounded: a small time step never teleports a gull', () => {
  const m = seaMap();
  const sites = scanAmbientSites(m);
  const bounds = ambientWorldBounds(m);
  const a = computeAmbient(sites, bounds, 6000);
  const b = computeAmbient(sites, bounds, 6050); // +50ms
  for (let i = 0; i < a.gulls.length; i++) {
    const dx = b.gulls[i].x - a.gulls[i].x;
    const dy = b.gulls[i].y - a.gulls[i].y;
    const move = Math.hypot(dx, dy);
    assert.ok(move < 8, `gull ${i} drifts, does not jump (moved ${move.toFixed(2)} in 50ms)`);
  }
});

test('a cart stays on its lane: every cart position lies within the road run bounding box', () => {
  const m = seaMap();
  for (let c = 2; c <= 12; c++) applyTool(m, TOOL.ROAD, c, 8);
  const sites = scanAmbientSites(m);
  const bounds = ambientWorldBounds(m);
  const run = sites.roadRuns[0];
  // World bounding box of the run, with a small tolerance for the tile-centre interpolation.
  let minX = Infinity; let maxX = -Infinity; let minY = Infinity; let maxY = -Infinity;
  for (const tile of run) {
    const w = { x: (tile.col - tile.row) * 32, y: (tile.col + tile.row) * 16 };
    minX = Math.min(minX, w.x); maxX = Math.max(maxX, w.x);
    minY = Math.min(minY, w.y); maxY = Math.max(maxY, w.y);
  }
  for (const ms of [0, 1000, 3000, 7000, 12000]) {
    const amb = computeAmbient(sites, bounds, ms);
    for (const cart of amb.carts) {
      assert.ok(cart.x >= minX - 1 && cart.x <= maxX + 1, `cart x within the lane at ${ms}ms`);
      assert.ok(cart.y >= minY - 1 && cart.y <= maxY + 1, `cart y within the lane at ${ms}ms`);
    }
  }
});
