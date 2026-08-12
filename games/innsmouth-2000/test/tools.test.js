import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GameMap, TERRAIN } from '../src/mapgen.js';
import {
  TOOL, ZONE, DIR, canApply, applyTool, connectionMask, refreshConnectionsAround, describeTile,
  STRUCTURE_INFO, structureForTool, TOOL_COST, hasNetwork, networkMask,
} from '../src/tools.js';

// A small flat grass map, with an optional strip of water for buildability tests.
function flatMap(cols = 6, rows = 6) {
  const m = new GameMap(cols, rows);
  for (let i = 0; i < cols * rows; i++) {
    m.tiles[i] = { terrain: TERRAIN.GRASS, elevation: 1, object: null, zone: null, building: null, structure: null };
  }
  return m;
}

test('road can be laid on dry land and records an object', () => {
  const m = flatMap();
  const r = applyTool(m, TOOL.ROAD, 2, 2);
  assert.ok(r.ok && r.changed);
  assert.equal(m.tileAt(2, 2).object.kind, 'road');
  assert.equal(r.cost, 10);
});

test('nothing can be built on water', () => {
  const m = flatMap();
  m.tileAt(2, 2).terrain = TERRAIN.SHALLOW;
  for (const tool of [TOOL.ROAD, TOOL.POWERLINE, TOOL.ZONE_R]) {
    const c = canApply(m, tool, 2, 2);
    assert.equal(c.ok, false);
    assert.match(c.reason, /dry land/);
  }
});

test('bulldoze clears an object and reports nothing-to-clear on empty land', () => {
  const m = flatMap();
  applyTool(m, TOOL.ROAD, 1, 1);
  const r = applyTool(m, TOOL.BULLDOZE, 1, 1);
  assert.ok(r.changed);
  assert.equal(m.tileAt(1, 1).object, null);
  const empty = canApply(m, TOOL.BULLDOZE, 3, 3);
  assert.equal(empty.ok, false);
  assert.match(empty.reason, /nothing here/);
});

test('zone paint sets the zone and is blocked by a road', () => {
  const m = flatMap();
  const r = applyTool(m, TOOL.ZONE_R, 2, 2);
  assert.ok(r.changed);
  assert.equal(m.tileAt(2, 2).zone, ZONE.RESIDENTIAL);
  // Lay a road on another tile, then try to zone it.
  applyTool(m, TOOL.ROAD, 3, 3);
  const blocked = canApply(m, TOOL.ZONE_C, 3, 3);
  assert.equal(blocked.ok, false);
  assert.match(blocked.reason, /Clear the road/);
});

test('laying a network clears any zone on the lot', () => {
  const m = flatMap();
  applyTool(m, TOOL.ZONE_I, 2, 2);
  applyTool(m, TOOL.ROAD, 2, 2);
  assert.equal(m.tileAt(2, 2).zone, null);
  assert.equal(m.tileAt(2, 2).object.kind, 'road');
});

test('the three zone tools paint the three zone types', () => {
  const m = flatMap();
  applyTool(m, TOOL.ZONE_R, 0, 0);
  applyTool(m, TOOL.ZONE_C, 1, 0);
  applyTool(m, TOOL.ZONE_I, 2, 0);
  assert.equal(m.tileAt(0, 0).zone, ZONE.RESIDENTIAL);
  assert.equal(m.tileAt(1, 0).zone, ZONE.COMMERCIAL);
  assert.equal(m.tileAt(2, 0).zone, ZONE.INDUSTRIAL);
});

test('connection mask reflects adjacent roads only', () => {
  const m = flatMap();
  applyTool(m, TOOL.ROAD, 2, 2); // center
  assert.equal(connectionMask(m, 2, 2), 0); // isolated
  applyTool(m, TOOL.ROAD, 3, 2); // SE neighbour
  applyTool(m, TOOL.ROAD, 2, 3); // SW neighbour
  const mask = connectionMask(m, 2, 2);
  assert.equal(mask & DIR.SE.bit, DIR.SE.bit);
  assert.equal(mask & DIR.SW.bit, DIR.SW.bit);
  assert.equal(mask & DIR.NW.bit, 0);
  assert.equal(mask & DIR.NE.bit, 0);
});

test('power lines do not connect to roads (different kinds)', () => {
  const m = flatMap();
  applyTool(m, TOOL.POWERLINE, 2, 2);
  applyTool(m, TOOL.ROAD, 3, 2); // adjacent road
  assert.equal(connectionMask(m, 2, 2), 0);
  applyTool(m, TOOL.POWERLINE, 2, 3); // adjacent power line
  assert.equal(connectionMask(m, 2, 2) & DIR.SW.bit, DIR.SW.bit);
});

test('road and power placements make a two-network crossing in either order', () => {
  for (const [first, second] of [
    [TOOL.ROAD, TOOL.POWERLINE],
    [TOOL.POWERLINE, TOOL.ROAD],
  ]) {
    const m = flatMap();
    applyTool(m, first, 2, 2);
    const r = applyTool(m, second, 2, 2);
    const tile = m.tileAt(2, 2);
    assert.ok(r.ok && r.changed);
    assert.equal(tile.object.kind, 'crossing');
    assert.ok(hasNetwork(tile, 'road'));
    assert.ok(hasNetwork(tile, 'powerline'));
    const desc = describeTile(m, 2, 2).lines.join(' ');
    assert.match(desc, /road/);
    assert.match(desc, /power line/);
  }
});

test('both auto-connect masks run continuously through a crossing', () => {
  const m = flatMap(7, 7);
  // Road runs west-east through the centre; power runs north-south through the same tile.
  for (const c of [2, 3, 4]) applyTool(m, TOOL.ROAD, c, 3);
  for (const r of [2, 3, 4]) applyTool(m, TOOL.POWERLINE, 3, r);
  const crossing = m.tileAt(3, 3);
  assert.equal(networkMask(crossing, 'road'), DIR.SE.bit | DIR.NW.bit);
  assert.equal(networkMask(crossing, 'powerline'), DIR.SW.bit | DIR.NE.bit);
  assert.ok(networkMask(m.tileAt(2, 3), 'road') & DIR.SE.bit);
  assert.ok(networkMask(m.tileAt(3, 2), 'powerline') & DIR.SW.bit);
});

test('bulldozing a crossing removes the power layer first, then the road', () => {
  const m = flatMap();
  applyTool(m, TOOL.ROAD, 2, 2);
  applyTool(m, TOOL.POWERLINE, 2, 2);
  applyTool(m, TOOL.BULLDOZE, 2, 2);
  assert.ok(hasNetwork(m.tileAt(2, 2), 'road'), 'the road still carries traffic');
  assert.equal(hasNetwork(m.tileAt(2, 2), 'powerline'), false, 'the visible pylon layer is gone');
  assert.ok(canApply(m, TOOL.BULLDOZE, 2, 2).ok, 'the remaining road can be cleared');
  applyTool(m, TOOL.BULLDOZE, 2, 2);
  assert.equal(m.tileAt(2, 2).object, null);
});

test('stored masks update on neighbours after placement and bulldoze', () => {
  const m = flatMap();
  applyTool(m, TOOL.ROAD, 2, 2);
  applyTool(m, TOOL.ROAD, 3, 2);
  // Both tiles should now record each other.
  assert.ok(m.tileAt(2, 2).object.mask & DIR.SE.bit);
  assert.ok(m.tileAt(3, 2).object.mask & DIR.NW.bit);
  // Remove one; the survivor's mask drops the connection.
  applyTool(m, TOOL.BULLDOZE, 3, 2);
  assert.equal(m.tileAt(2, 2).object.mask & DIR.SE.bit, 0);
});

test('a straight run of roads reads as a line (opposite bits set)', () => {
  const m = flatMap(8, 8);
  for (let c = 1; c <= 5; c++) applyTool(m, TOOL.ROAD, c, 3);
  // A middle segment connects SE and NW (the col axis), not SW/NE.
  const mid = m.tileAt(3, 3).object.mask;
  assert.ok(mid & DIR.SE.bit);
  assert.ok(mid & DIR.NW.bit);
  assert.equal(mid & DIR.SW.bit, 0);
  assert.equal(mid & DIR.NE.bit, 0);
  // The endpoints have a single connection.
  const endBits = m.tileAt(1, 3).object.mask;
  assert.equal(endBits, DIR.SE.bit);
});

test('describeTile gives plain-English, no em-dashes', () => {
  const m = flatMap();
  applyTool(m, TOOL.ROAD, 2, 2);
  const d = describeTile(m, 2, 2);
  assert.match(d.title, /Lot 2, 2/);
  assert.ok(d.lines.some((l) => /road/.test(l)));
  for (const l of [...d.lines, d.title]) assert.ok(!l.includes('—'), 'no em-dashes');
  // Water and unclaimed land describe themselves.
  m.tileAt(0, 0).terrain = TERRAIN.DEEP;
  assert.ok(describeTile(m, 0, 0).lines.some((l) => /Deep water/.test(l)));
  assert.ok(describeTile(m, 4, 4).lines.some((l) => /Unclaimed/.test(l)));
});

test('a structure can be built on clear dry land and records its kind', () => {
  const m = flatMap();
  const r = applyTool(m, TOOL.GASWORKS, 2, 2);
  assert.ok(r.ok && r.changed);
  assert.equal(m.tileAt(2, 2).structure.kind, 'gasworks');
  assert.equal(r.cost, STRUCTURE_INFO.gasworks.cost);
});

test('structures need dry land and a clear tile', () => {
  const m = flatMap();
  m.tileAt(1, 1).terrain = TERRAIN.SHALLOW;
  assert.match(canApply(m, TOOL.CHAPEL, 1, 1).reason, /dry land/);
  // A road blocks a structure, and a structure blocks another structure.
  applyTool(m, TOOL.ROAD, 2, 2);
  assert.equal(canApply(m, TOOL.SHRINE, 2, 2).ok, false);
  applyTool(m, TOOL.SHRINE, 3, 3);
  assert.match(canApply(m, TOOL.CHAPEL, 3, 3).reason, /already stands/);
});

test('every structure tool maps to a kind, a cost, and coverage info', () => {
  for (const kind of Object.keys(STRUCTURE_INFO)) {
    const info = STRUCTURE_INFO[kind];
    assert.equal(structureForTool(info.tool), kind);
    assert.equal(TOOL_COST[info.tool], info.cost);
    assert.ok(info.capacity >= 0 && info.radius >= 0);
  }
});

test('bulldoze clears a structure and describeTile names it', () => {
  const m = flatMap();
  applyTool(m, TOOL.SHRINE, 2, 2);
  const d = describeTile(m, 2, 2);
  assert.ok(d.lines.some((l) => /Shrine/.test(l)));
  for (const l of d.lines) assert.ok(!l.includes('—'), 'no em-dashes');
  const r = applyTool(m, TOOL.BULLDOZE, 2, 2);
  assert.ok(r.changed);
  assert.equal(m.tileAt(2, 2).structure, null);
});

test('query never mutates the map', () => {
  const m = flatMap();
  const before = JSON.stringify(m.tiles);
  const r = applyTool(m, TOOL.QUERY, 2, 2);
  assert.ok(r.ok);
  assert.equal(r.changed, false);
  assert.equal(JSON.stringify(m.tiles), before);
});
