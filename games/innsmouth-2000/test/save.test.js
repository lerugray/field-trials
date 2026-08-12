// Save / load, with the milestone's gating case: a mid-disaster round-trip (M8).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GameMap, TERRAIN } from '../src/mapgen.js';
import { TOOL, applyTool } from '../src/tools.js';
import { makeSim } from '../src/sim.js';
import { saveGame, loadGame, serializeSave, deserializeSave, SAVE_VERSION } from '../src/save.js';

function townMap(cols = 12, rows = 12) {
  const m = new GameMap(cols, rows);
  for (let i = 0; i < cols * rows; i++) {
    m.tiles[i] = { terrain: TERRAIN.GRASS, elevation: 1, object: null, zone: null, building: null, structure: null };
  }
  for (let r = 0; r < rows; r++) m.tileAt(0, r).terrain = TERRAIN.SHALLOW;
  return m;
}

function builtTown(seed = 'save') {
  const m = townMap();
  for (let c = 2; c <= 9; c++) applyTool(m, TOOL.ROAD, c, 6);
  for (let c = 2; c <= 9; c++) { applyTool(m, TOOL.ZONE_R, c, 5); applyTool(m, TOOL.ZONE_C, c, 7); }
  const sim = makeSim(m, { seed });
  for (let i = 0; i < 30; i++) sim.step();
  return sim;
}

test('a save round-trips the whole state', () => {
  const sim = builtTown();
  sim.scenario = 'recovery';
  const loaded = loadGame(saveGame(sim));
  assert.equal(loaded.treasury, sim.treasury);
  assert.equal(loaded.dread, sim.dread);
  assert.equal(loaded.tick, sim.tick);
  assert.deepEqual(loaded.pop, sim.pop);
  assert.deepEqual(loaded.favor, sim.favor);
  assert.deepEqual(loaded.map.tiles, sim.map.tiles);
  assert.equal(loaded.rng.getState(), sim.rng.getState());
  assert.equal(loaded.scenario, 'recovery');
});

test('a loaded game resumes to a bit-identical future (the seeded stream continues)', () => {
  const sim = builtTown('future');
  const loaded = loadGame(saveGame(sim));
  for (let i = 0; i < 40; i++) { sim.step(); loaded.step(); }
  assert.equal(loaded.treasury, sim.treasury, 'treasury diverged');
  assert.equal(loaded.dread, sim.dread, 'dread diverged');
  assert.deepEqual(loaded.pop, sim.pop, 'population diverged');
  assert.deepEqual(loaded.favor, sim.favor, 'favor diverged');
  assert.deepEqual(loaded.map.tiles, sim.map.tiles, 'the map diverged');
});

test('a mid-disaster save round-trips clean (the milestone gate)', () => {
  const sim = builtTown('disaster');
  sim.summonWrath('shub'); // a Greening: crawls a ring per month
  sim.step(); sim.step(); // let it spread — now mid-crawl
  assert.ok(sim.disaster && !sim.disaster.done, 'a wrath is mid-crawl');
  assert.ok(sim.disaster.age > 0 && sim.disaster.age < sim.disaster.maxAge, 'genuinely mid-crawl');

  const loaded = loadGame(saveGame(sim));
  assert.deepEqual(loaded.disaster, sim.disaster, 'disaster.{age,maxAge,front} survive the trip');
  // And the crawl continues identically from the saved moment.
  for (let i = 0; i < 8; i++) { sim.step(); loaded.step(); }
  assert.deepEqual(loaded.disaster, sim.disaster, 'the crawl resumes identically');
  assert.deepEqual(loaded.map.tiles, sim.map.tiles, 'the scars land on the same tiles');
});

test('a mid-doom save (an ended town) round-trips and stays ended', () => {
  const sim = builtTown('doom');
  for (let i = 0; i < 4 && !sim.ended; i++) sim.summonWrath('cthulhu');
  assert.ok(sim.ended);
  const loaded = loadGame(saveGame(sim));
  assert.deepEqual(loaded.ended, sim.ended);
  assert.equal(loaded.awakenings, sim.awakenings);
  const tick = loaded.tick;
  loaded.step();
  assert.equal(loaded.tick, tick, 'a loaded ended game stays frozen');
});

test('the string round-trip (localStorage form) works, and a bad version is refused', () => {
  const sim = builtTown('str');
  const restored = deserializeSave(serializeSave(sim));
  assert.equal(restored.treasury, sim.treasury);
  assert.throws(() => loadGame({ version: SAVE_VERSION + 99, sim: {}, map: {} }), /another version/);
});
