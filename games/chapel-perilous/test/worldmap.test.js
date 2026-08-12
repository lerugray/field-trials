// cp-020 — worldmap state and renderer.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld } from '../src/engine/world.js';
import { createWorldMapState, gatherWorldmap, worldKey, FEATURE_SITE, FEATURE_GATE, FEATURE_GATE_OPEN } from '../src/engine/worldmap.js';
import { createBiomes } from '../src/engine/biomes.js';
import master from '../data/world/master.json' with { type: 'json' };
import biomeData from '../data/world/biomes.json' with { type: 'json' };

function makeWorld() {
  const world = createWorld(master);
  const biomes = createBiomes(biomeData);
  const mapState = createWorldMapState();
  const party = { x: master.start.x, y: master.start.y };
  return { world, biomes, mapState, party };
}

test('createWorldMapState tracks visited cells and biomes', () => {
  const { world, biomes, mapState, party } = makeWorld();
  const b = biomes.biomeAt(party.x, party.y);
  mapState.visit(party.x, party.y);
  if (b) mapState.knowBiome(b.id);
  assert.equal(mapState.isVisited(party.x, party.y), true);
  if (b) assert.equal(mapState.hasBiome(b.id), true);
});

test('createWorldMapState remembers discovered sites and gates', () => {
  const { world, mapState } = makeWorld();
  const site = world.listSites()[0];
  const gate = world.listGates()[0];
  assert.ok(site || gate, 'fixture has a site or gate');
  if (site) {
    mapState.knowSite(site);
    assert.equal(mapState.hasSite(site.x, site.y), true);
    assert.ok(mapState.labels.some((l) => l.x === site.x && l.y === site.y));
  }
  if (gate) {
    mapState.knowGate(gate);
    assert.equal(mapState.hasGate(gate.id), true);
    assert.ok(mapState.labels.some((l) => l.x === gate.x && l.y === gate.y));
  }
});

test('createWorldMapState stores per-site dungeon memory', () => {
  const { world, mapState } = makeWorld();
  const site = world.listSites().find((s) => s.kind === 'dungeon') || world.listSites()[0];
  const minimap = { serialize: () => ({ explored: ['1,2', '2,2'], features: [['2,2', { kind: 'cache' }]] }) };
  mapState.setDungeon(site, minimap);
  const back = mapState.getDungeon(site);
  assert.ok(back.explored.includes('1,2'));
  assert.equal(back.features[0][1].kind, 'cache');
});

test('worldmap state serializes and restores', () => {
  const { world, biomes, mapState, party } = makeWorld();
  const site = world.listSites()[0];
  mapState.visit(party.x, party.y);
  if (site) mapState.knowSite(site);
  const s = mapState.serialize();
  const m2 = createWorldMapState(s);
  assert.equal(m2.isVisited(party.x, party.y), true);
  if (site) assert.equal(m2.hasSite(site.x, site.y), true);
});

test('worldmap state tolerates an old save without map fields', () => {
  const m = createWorldMapState({});
  assert.equal(m.isVisited(0, 0), false);
  assert.equal(m.labels.length, 0);
});

test('gatherWorldmap only shows visited cells plus discovered features', () => {
  const { world, biomes, mapState, party } = makeWorld();
  const data = gatherWorldmap({ world, biomes, mapState, party, start: master.start });
  assert.equal(data.tiles.length, 0, 'no tiles known before visiting');

  mapState.visit(party.x, party.y);
  const data2 = gatherWorldmap({ world, biomes, mapState, party, start: master.start });
  assert.ok(data2.tiles.length > 0, 'visited cells appear');
  assert.ok(data2.tiles.some((t) => t.x === party.x && t.y === party.y), 'party cell is present');
});

test('gatherWorldmap marks cleared/known routes between adjacent open cells', () => {
  const { world, biomes, mapState, party } = makeWorld();
  // Find any two adjacent passable cells so a route actually exists.
  let ax = 0, ay = 0, bx = 0, by = 0;
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  outer: for (let r = 0; r < 8; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const cx = master.start.x + dx, cy = master.start.y + dy;
        if (!world.passable(cx, cy)) continue;
        for (const [ddx, ddy] of dirs) {
          if (world.passable(cx + ddx, cy + ddy)) { ax = cx; ay = cy; bx = cx + ddx; by = cy + ddy; break outer; }
        }
      }
    }
  }
  party.x = ax; party.y = ay;
  mapState.visit(ax, ay);
  mapState.visit(bx, by);
  const data = gatherWorldmap({ world, biomes, mapState, party, start: master.start });
  assert.ok(data.routes.length > 0, 'adjacent open cells connect');
});

test('gatherWorldmap shows opened gates differently from closed gates', () => {
  const { world, biomes, mapState, party } = makeWorld();
  const gate = world.listGates()[0];
  if (!gate) return;
  world.openGate(gate.id);
  mapState.knowGate(gate);
  party.x = gate.x; party.y = gate.y;
  mapState.visit(gate.x, gate.y);
  const data = gatherWorldmap({ world, biomes, mapState, party, start: master.start });
  const gf = data.features.find((f) => f.kind === FEATURE_GATE_OPEN || f.kind === FEATURE_GATE);
  assert.ok(gf, 'gate feature is visible');
  assert.equal(gf.kind, FEATURE_GATE_OPEN, 'opened gate renders as open');
});
