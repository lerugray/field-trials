// Water QUALITY as the network reports it and the player reads it (M-b): what computeWater derives
// per network, how the query words it (including the spec's partial detection), and that the
// underground view can draw every one of the new states without a browser-only reference error.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GameMap, TERRAIN } from '../src/mapgen.js';
import {
  TOOL, VIEW, applyTool, describeTile, setTaint, taintOf, qualityFor, worstQuality,
  QUALITY, QUALITY_LABEL, QUALITY_ORDER, TAINT_AT, TAINT_MAX, STRUCTURE_INFO,
  isWaterWorks, isFilterHouse, isPipeLink, isWaterConductor, valveShut,
} from '../src/tools.js';
import { computePower } from '../src/power.js';
import {
  computeWater, explainWater, qualityAt, waterAt, waterCapAt, isFoulQuality,
  PRESSURE, SABOTAGE_FACTOR, CHOKE_FACTOR,
} from '../src/water.js';
import { computeAquifer } from '../src/aquifer.js';
import { makeSim, MAX_LEVEL } from '../src/sim.js';
import { drawMap } from '../src/render.js';
import { RAMP } from '../src/palette.js';
import { makeCamera } from '../src/camera.js';

function townMap(cols = 24, rows = 14) {
  const m = new GameMap(cols, rows);
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      let terrain = TERRAIN.GRASS;
      let elevation = Math.min(3, Math.max(0, col - 2));
      if (col === 0) { terrain = TERRAIN.DEEP; elevation = 0; }
      else if (col === 1) { terrain = TERRAIN.SHALLOW; elevation = 0; }
      m.tiles[m.index(col, row)] = {
        terrain, elevation, object: null, zone: null, building: null,
        structure: null, scar: null, pipe: null,
      };
    }
  }
  return m;
}

function pipeRun(map, row, from, to) {
  for (let col = from; col <= to; col++) applyTool(map, TOOL.PIPE, col, row);
}

// A single main with a well house, plus whatever taint the caller wants on it.
function onePipedTown({ taint = 0, filter = false, campus = false } = {}) {
  const map = townMap();
  pipeRun(map, 5, 10, 16);
  applyTool(map, TOOL.WELLHOUSE, 17, 5);
  if (filter) applyTool(map, TOOL.FILTERHOUSE, 9, 5);
  if (campus) applyTool(map, TOOL.UNIVERSITY, 13, 9); // radius 6, so it reaches the main
  if (taint > 0) for (let c = 10; c <= 16; c++) setTaint(map.tiles[map.index(c, 5)], taint);
  const power = computePower(map);
  return { map, water: computeWater(map, power), power };
}

// A sim wrapping that town, so explainWater has a sim to read.
//
// The taint is applied AFTER the step and the water state recomputed by hand, deliberately: a step
// runs the whole deep month, and a filter house or a sweet intake at good pressure would take some of
// the taint straight back off again. These tests are about what the QUERY says for a given reading,
// so the reading has to be the one the assertion names.
function simFor({ taint = 0, ...rest } = {}) {
  const { map } = onePipedTown(rest);
  const sim = makeSim(map, { seed: 'quality', deepStart: 0 });
  sim.step();
  if (taint > 0) {
    for (let c = 10; c <= 16; c++) setTaint(map.tiles[map.index(c, 5)], taint);
    sim.water = computeWater(map, sim.power);
  }
  return { map, sim };
}

// --- the stored reading -----------------------------------------------------------------------

test('the quality thresholds map a stored taint onto the four named states', () => {
  assert.equal(qualityFor(0), QUALITY.CLEAN);
  assert.equal(qualityFor(TAINT_AT.suspect - 0.01), QUALITY.CLEAN);
  assert.equal(qualityFor(TAINT_AT.suspect), QUALITY.SUSPECT);
  assert.equal(qualityFor(TAINT_AT.tainted), QUALITY.TAINTED);
  assert.equal(qualityFor(TAINT_AT.infested), QUALITY.INFESTED);
  assert.equal(qualityFor(TAINT_MAX), QUALITY.INFESTED);
  assert.equal(qualityFor(undefined), QUALITY.CLEAN, 'no reading means sweet');
  assert.deepEqual(QUALITY_ORDER, ['clean', 'suspect', 'tainted', 'infested'], 'best to worst');
  for (const q of QUALITY_ORDER) assert.ok(QUALITY_LABEL[q], `${q} has no plain-English name`);
  assert.equal(worstQuality(QUALITY.CLEAN, QUALITY.TAINTED), QUALITY.TAINTED);
  assert.equal(worstQuality(QUALITY.INFESTED, QUALITY.SUSPECT), QUALITY.INFESTED);
  assert.equal(isFoulQuality(QUALITY.SUSPECT), false, 'suspect water is not yet foul');
  assert.equal(isFoulQuality(QUALITY.TAINTED), true);
  assert.equal(isFoulQuality(QUALITY.INFESTED), true);
});

test('taint is stored on the tile, clamped, and dropped entirely when it comes back to sweet', () => {
  const tile = {};
  assert.equal(taintOf(tile), 0);
  assert.equal(setTaint(tile, 40), 40);
  assert.equal(tile.taint, 40);
  assert.equal(setTaint(tile, 500), TAINT_MAX, 'clamped at the top');
  assert.equal(setTaint(tile, -20), 0, 'and at the bottom');
  assert.equal('taint' in tile, false, 'a sweet tile carries no residue, so saves stay small');
  assert.equal(taintOf(null), 0, 'and the reader is null-safe');
});

test('a network quality is the worst reading on any of its own lengths of main', () => {
  const map = townMap();
  pipeRun(map, 5, 10, 16);
  applyTool(map, TOOL.WELLHOUSE, 17, 5);
  setTaint(map.tiles[map.index(12, 5)], 80); // one bad length in an otherwise sweet run
  const comp = computeWater(map, computePower(map)).components[0];
  assert.equal(comp.taint, 80);
  assert.equal(comp.quality, QUALITY.INFESTED, 'one infested length makes an infested network');
});

test('the coverage carries the network quality, so a served lot knows what it is drinking', () => {
  const { map, water } = onePipedTown({ taint: 50 });
  const lot = map.index(13, 7); // two rows from the main: inside the coverage radius
  assert.notEqual(waterAt(water, lot), PRESSURE.DRY, 'the lot is watered');
  assert.equal(qualityAt(water, lot), QUALITY.TAINTED);
  const far = map.index(13, 12); // well outside the coverage
  assert.equal(waterAt(water, far), PRESSURE.DRY);
  assert.equal(qualityAt(far ? water : null, far), QUALITY.CLEAN,
    'unserved ground reads clean, because there is no foul water on it either');
  assert.equal(qualityAt(null, 0), QUALITY.CLEAN, 'and the lookup is null-safe');
});

test('the per-tile taint map lets one foul branch read foul on its own', () => {
  const map = townMap();
  pipeRun(map, 5, 10, 16);
  applyTool(map, TOOL.WELLHOUSE, 17, 5);
  setTaint(map.tiles[map.index(10, 5)], 90);
  const water = computeWater(map, computePower(map));
  assert.equal(water.taints.get(map.index(10, 5)), 90, 'the fouled length');
  assert.equal(water.taints.get(map.index(14, 5)), 0, 'the sweet length beside it');
  assert.equal(water.taints.has(map.index(14, 9)), false, 'and nothing that is not a conductor');
});

test('byId resolves a network without scanning the component list', () => {
  const { water } = onePipedTown({ taint: 20 });
  for (const comp of water.components) {
    assert.equal(water.byId.get(comp.id), comp, `component ${comp.id} is not in byId`);
  }
});

test('sabotage and a choke cut what a network can deliver', () => {
  const map = townMap();
  pipeRun(map, 5, 10, 16);
  applyTool(map, TOOL.WELLHOUSE, 17, 5);
  const full = computeWater(map, computePower(map)).components[0];
  const rated = STRUCTURE_INFO.wellhouse.water;
  assert.equal(full.capacity, rated);
  assert.equal(full.rating, rated);

  map.tiles[map.index(17, 5)].structure.sabotage = 3;
  const wrecked = computeWater(map, computePower(map)).components[0];
  assert.equal(wrecked.capacity, Math.floor(rated * SABOTAGE_FACTOR));
  assert.equal(wrecked.rating, rated, 'the rating still says what the works is FOR');
  delete map.tiles[map.index(17, 5)].structure.sabotage;

  map.tiles[map.index(12, 5)].pipe.choke = 2;
  const knocking = computeWater(map, computePower(map)).components[0];
  assert.equal(knocking.capacity, Math.floor(rated * CHOKE_FACTOR));
  assert.equal(knocking.choked, 1);
});

// --- detection: the town can see symptoms, but it can only NAME what it can test ---------------

test('a network is surveyed by a filter house on it, or a campus in reach, and not otherwise', () => {
  assert.equal(onePipedTown({}).water.components[0].surveyed, false, 'no bench, no name');
  assert.equal(onePipedTown({ filter: true }).water.components[0].surveyed, true, 'a test bench');
  assert.equal(onePipedTown({ campus: true }).water.components[0].surveyed, true, 'a campus survey');
});

test('the query names the water where the town can test it, and describes it where it cannot', () => {
  const surveyed = simFor({ taint: 50, filter: true });
  const named = explainWater(surveyed.sim, 12, 5);
  assert.ok(named.some((l) => l === `Quality: ${QUALITY_LABEL.tainted}.`),
    `a surveyed main should be named: ${named.join(' | ')}`);

  const blind = simFor({ taint: 50 });
  const described = explainWater(blind.sim, 12, 5);
  assert.equal(described.some((l) => /^Quality:/.test(l)), false,
    'an unsurveyed main must not be given a name the town has not earned');
  assert.ok(described.some((l) => /green and sour/.test(l)),
    `but it must still show the symptom: ${described.join(' | ')}`);
  assert.ok(described.some((l) => /filter house/i.test(l)), 'and say what would tell them more');
});

test('the query never hides that something is wrong, at any quality', () => {
  for (const [taint, expect] of [
    [TAINT_AT.suspect + 2, /odd taste/],
    [TAINT_AT.tainted + 2, /green and sour/],
    [TAINT_AT.infested + 2, /living in this main/],
  ]) {
    const { sim } = simFor({ taint });
    const lines = explainWater(sim, 12, 5);
    assert.ok(lines.some((l) => expect.test(l)),
      `taint ${taint} should surface a symptom matching ${expect}: ${lines.join(' | ')}`);
    for (const l of lines) assert.ok(!/—/.test(l), `em-dash in player-facing text: ${l}`);
  }
  // A sweet main says so plainly and does not invent a worry.
  const { sim } = simFor({ taint: 0 });
  const clean = explainWater(sim, 12, 5);
  assert.ok(clean.some((l) => /runs clear|is sweet/.test(l)), clean.join(' | '));
  assert.equal(clean.some((l) => /green|salt|living/.test(l)), false);
});

test('a works reports its own intake, which is where the player must look first', () => {
  const map = townMap();
  pipeRun(map, 5, 10, 16);
  applyTool(map, TOOL.PUMPHOUSE, 17, 5);
  setTaint(map.tiles[map.index(17, 5)], TAINT_AT.tainted + 5);
  const sim = makeSim(map, { seed: 'intake-query', deepStart: 0 });
  sim.step();
  const lines = explainWater(sim, 17, 5);
  assert.ok(lines.some((l) => /intake tastes of salt/.test(l)), lines.join(' | '));
  setTaint(map.tiles[map.index(17, 5)], TAINT_MAX);
  sim.step();
  assert.ok(explainWater(sim, 17, 5).some((l) => /fouled through/.test(l)));
});

test('the query says when a main was last flushed, and when it last took a backflow', () => {
  const map = townMap();
  pipeRun(map, 5, 10, 16);
  applyTool(map, TOOL.WELLHOUSE, 17, 5);
  const sim = makeSim(map, { seed: 'recent', deepStart: 0 });
  for (let i = 0; i < 6; i++) sim.step();
  assert.equal(explainWater(sim, 12, 5).some((l) => /Flushed|Backflow/.test(l)), false,
    'a main with no history says nothing about one');

  setTaint(map.tiles[map.index(12, 5)], 60);
  applyTool(map, TOOL.FLUSH, 12, 5, { tick: sim.tick });
  // The query reads the water state the last STEP computed, so a flush this instant does not appear
  // in it until the month turns. That is the same one-tick lag pressure has had since M-a, and it is
  // covered in the moment by main.js's own status line ("the mains are run off: N lengths flushed"),
  // so the player is never left wondering what their money bought.
  assert.equal(explainWater(sim, 12, 5).some((l) => /^Flushed/.test(l)), false,
    'the flush is not in the cached water state yet');
  sim.step();
  assert.ok(explainWater(sim, 12, 5).some((l) => l === 'Flushed last month.'),
    'and it is there from the next month on');
  sim.step();
  sim.step();
  assert.ok(explainWater(sim, 12, 5).some((l) => l === 'Flushed 3 months ago.'));
  // A backflow is the more recent event, so it takes the line.
  map.tiles[map.index(12, 5)].backflow = sim.tick;
  sim.step();
  assert.ok(explainWater(sim, 12, 5).some((l) => /^Backflow/.test(l)));
});

test('the query reports a wrecked works and a knocking main in plain English', () => {
  const map = townMap();
  pipeRun(map, 5, 10, 16);
  applyTool(map, TOOL.WELLHOUSE, 17, 5);
  const sim = makeSim(map, { seed: 'events-query', deepStart: 0 });
  sim.step();
  map.tiles[map.index(17, 5)].structure.sabotage = 3;
  map.tiles[map.index(12, 5)].pipe.choke = 2;
  sim.water = computeWater(map, sim.power);
  const lines = explainWater(sim, 12, 5);
  assert.ok(lines.some((l) => /wrecked/.test(l)), lines.join(' | '));
  assert.ok(lines.some((l) => /knock/.test(l)), lines.join(' | '));
  for (const l of lines) assert.ok(!/—/.test(l), `em-dash: ${l}`);
});

// --- the growth gate --------------------------------------------------------------------------

test('the growth cap follows pressure and quality together', () => {
  const map = townMap();
  pipeRun(map, 5, 10, 16);
  applyTool(map, TOOL.WELLHOUSE, 17, 5);
  const lot = { col: 13, row: 7 };
  const cap = () => waterCapAt(map, computeWater(map, computePower(map)), lot.col, lot.row, MAX_LEVEL);

  assert.equal(cap(), MAX_LEVEL, 'clean water at good pressure lets a lot reach its full height');
  for (let c = 10; c <= 16; c++) setTaint(map.tiles[map.index(c, 5)], TAINT_AT.suspect + 1);
  assert.equal(cap(), MAX_LEVEL, 'merely suspect water is still "at least non-tainted"');
  for (let c = 10; c <= 16; c++) setTaint(map.tiles[map.index(c, 5)], TAINT_AT.tainted + 1);
  assert.equal(cap(), 1, 'tainted water caps it at a poor first tier');
  for (let c = 10; c <= 16; c++) setTaint(map.tiles[map.index(c, 5)], 0);

  // Dry ground caps at 1 whatever the quality.
  const dry = waterCapAt(map, computeWater(map, computePower(map)), 13, 13, MAX_LEVEL);
  assert.equal(dry, 1);
});

// --- the tile model ----------------------------------------------------------------------------

test('the works predicates tell a source, a filter, and a shut valve apart', () => {
  const map = townMap();
  applyTool(map, TOOL.PUMPHOUSE, 4, 4);
  applyTool(map, TOOL.FILTERHOUSE, 5, 4);
  applyTool(map, TOOL.PIPE, 6, 4);
  applyTool(map, TOOL.VALVE, 6, 4); // fits it shut
  const pump = map.tileAt(4, 4);
  const filter = map.tileAt(5, 4);
  const valve = map.tileAt(6, 4);
  assert.ok(isWaterWorks(pump) && isWaterWorks(filter), 'both are works');
  assert.equal(isFilterHouse(filter), true);
  assert.equal(isFilterHouse(pump), false);
  assert.equal(valveShut(valve), true);
  assert.equal(isPipeLink(valve), true, 'a shut valve is still a link, so the trench art runs through');
  assert.equal(isWaterConductor(valve), false, 'but no water passes it, which is the point');
});

test('describeTile names a valve, a cap, and a filter house', () => {
  const map = townMap();
  applyTool(map, TOOL.PIPE, 8, 4);
  applyTool(map, TOOL.VALVE, 8, 4);
  const shut = describeTile(map, 8, 4).lines;
  assert.ok(shut.some((l) => /valve is fitted here, and it is shut/.test(l)), shut.join(' | '));
  applyTool(map, TOOL.VALVE, 8, 4); // open it
  assert.ok(describeTile(map, 8, 4).lines.some((l) => /standing open/.test(l)));

  map.tiles[map.index(9, 4)].sealed = true;
  const capped = describeTile(map, 9, 4).lines;
  assert.ok(capped.some((l) => /sealing works caps/.test(l)), capped.join(' | '));
  assert.equal(capped.some((l) => /Unclaimed land/.test(l)), false,
    'a capped fissure is not unclaimed land');

  applyTool(map, TOOL.FILTERHOUSE, 10, 4);
  const bench = describeTile(map, 10, 4).lines;
  assert.ok(bench.some((l) => /Cleanses \d+ of taint/.test(l)), bench.join(' | '));
  for (const l of [...shut, ...capped, ...bench]) assert.ok(!/—/.test(l), `em-dash: ${l}`);
});

// --- drawing ----------------------------------------------------------------------------------

function mockCtx() {
  const noop = () => {};
  const ctx = {
    measureText: (s) => ({ width: (s ? String(s).length : 0) * 7 }),
    createLinearGradient: () => ({ addColorStop: noop }),
    createRadialGradient: () => ({ addColorStop: noop }),
    createPattern: () => ({}),
  };
  for (const m of [
    'fillRect', 'strokeRect', 'clearRect', 'fillText', 'strokeText',
    'beginPath', 'closePath', 'moveTo', 'lineTo', 'arc', 'arcTo', 'ellipse',
    'rect', 'quadraticCurveTo', 'bezierCurveTo', 'fill', 'stroke', 'clip',
    'save', 'restore', 'translate', 'rotate', 'scale', 'setTransform',
    'setLineDash', 'drawImage',
  ]) ctx[m] = noop;
  return ctx;
}
function mockSprites() {
  const out = {};
  for (const key of Object.keys(RAMP)) out[key] = { width: 64, height: 32 };
  return out;
}

// A town carrying EVERY M-b state at once, so one draw exercises all of the new art.
function everyStateTown() {
  const map = townMap(28, 16);
  // Four separate mains, one at each quality.
  const rows = [4, 6, 8, 10];
  const taints = [0, TAINT_AT.suspect + 2, TAINT_AT.tainted + 2, TAINT_AT.infested + 2];
  rows.forEach((row, k) => {
    pipeRun(map, row, 14, 22);
    applyTool(map, TOOL.WELLHOUSE, 23, row);
    for (let c = 14; c <= 22; c++) setTaint(map.tiles[map.index(c, row)], taints[k]);
    setTaint(map.tiles[map.index(23, row)], taints[k]); // the intake too, for the works marks
  });
  // A works of every kind, a valve open and a valve shut, a choke, a sabotage, and damp ground.
  applyTool(map, TOOL.PUMPHOUSE, 5, 4);
  applyTool(map, TOOL.RESERVOIR, 5, 6);
  applyTool(map, TOOL.FILTERHOUSE, 5, 8);
  pipeRun(map, 12, 4, 10);
  applyTool(map, TOOL.VALVE, 6, 12); // shut
  applyTool(map, TOOL.VALVE, 8, 12);
  applyTool(map, TOOL.VALVE, 8, 12); // open
  map.tiles[map.index(9, 12)].pipe.choke = 3;
  map.tiles[map.index(5, 4)].structure.sabotage = 4;
  map.tiles[map.index(16, 12)].damp = 4;
  // Surface things to ghost, and a dry stub joined to nothing.
  for (let c = 6; c <= 20; c++) applyTool(map, TOOL.ROAD, c, 13);
  applyTool(map, TOOL.ZONE_R, 10, 14);
  map.tiles[map.index(10, 14)].building = { level: 2, cls: 'deepone' };
  applyTool(map, TOOL.PIPE, 26, 15);
  return map;
}

test('the underground view draws every quality, works, valve, cap, sign and glimpse', () => {
  const map = everyStateTown();
  const sim = makeSim(map, {
    seed: 'draw-every-state',
    aquifer: { brackishReach: 4, fissureReach: 2, fissureRate: 1 },
    deepStart: 90, // teeming, so the glimpses and the marks are all live
  });
  sim.step();
  // Cap a fissure so the iron plate draws too.
  if (sim.aquifer.fissures.length) map.tiles[sim.aquifer.fissures[0]].sealed = true;
  sim.step();

  // The fixture really does carry the whole range, or this test proves nothing.
  const qualities = new Set(sim.water.components.map((c) => c.quality));
  for (const q of QUALITY_ORDER) {
    assert.ok(qualities.has(q), `the fixture should carry a ${q} network, got ${[...qualities]}`);
  }
  assert.ok(sim.deep.marks.size > 0, 'and some signs on the mains');
  assert.ok(sim.deep.glimpses.length > 0, 'and at least one glimpse in a teeming void');
  assert.ok(sim.deep.totals.damp > 0, 'and some seeped ground');

  const ctx = mockCtx();
  const camera = makeCamera({ mapCols: map.cols, mapRows: map.rows, viewportW: 900, viewportH: 700 });
  const opts = { view: VIEW.UNDERGROUND, water: sim.water, aquifer: sim.aquifer, deep: sim.deep };
  assert.doesNotThrow(() => drawMap(ctx, map, camera, mockSprites(), sim.power, null, opts),
    'the underground view draws');
  assert.doesNotThrow(
    () => drawMap(ctx, map, camera, mockSprites(), sim.power, null, { ...opts, now: 12345 }),
    'and draws again with the clock running, which is what moves the void edges and the glimpses',
  );
  // It must also survive being handed nothing but a view, as the very first frame does.
  assert.doesNotThrow(() => drawMap(ctx, map, camera, mockSprites(), sim.power, null,
    { view: VIEW.UNDERGROUND }), 'and with no water, aquifer or deep state at all');
});

test('the surface view draws the same town, seeped ground included', () => {
  const map = everyStateTown();
  const sim = makeSim(map, { seed: 'draw-surface', deepStart: 20 });
  sim.step();
  const ctx = mockCtx();
  const camera = makeCamera({ mapCols: map.cols, mapRows: map.rows, viewportW: 900, viewportH: 700 });
  assert.doesNotThrow(() => drawMap(ctx, map, camera, mockSprites(), sim.power, null,
    { view: VIEW.SURFACE, water: sim.water, aquifer: sim.aquifer, deep: sim.deep }));
  // And the filter house's own surface art, drawn as part of that town.
  assert.equal(isFilterHouse(map.tileAt(5, 8)), true);
});

test('a town saves and loads with its taint, valves, caps and presence intact', async () => {
  const { saveGame, loadGame } = await import('../src/save.js');
  const map = everyStateTown();
  const sim = makeSim(map, {
    seed: 'save-quality',
    aquifer: { brackishReach: 4, fissureReach: 2, fissureRate: 1 },
    deepStart: 55,
  });
  sim.step();
  if (sim.aquifer.fissures.length) map.tiles[sim.aquifer.fissures[0]].sealed = true;
  sim.step();

  const loaded = loadGame(saveGame(sim));
  const infested = map.index(14, 10);
  assert.equal(taintOf(loaded.map.tiles[infested]), taintOf(map.tiles[infested]), 'the taint survives');
  assert.equal(valveShut(loaded.map.tiles[loaded.map.index(6, 12)]), true, 'the shut valve survives');
  assert.equal(loaded.map.tiles[loaded.map.index(8, 12)].pipe.valve, 'open', 'and the open one');
  if (sim.aquifer.fissures.length) {
    assert.equal(loaded.map.tiles[sim.aquifer.fissures[0]].sealed, true, 'the cap survives');
  }
  assert.deepEqual(loaded.presence, sim.presence, 'and the Deep Presence ledger');
  assert.deepEqual(loaded.aquiferOpts, sim.aquiferOpts, 'and the scenario subsurface settings');
  assert.ok(loaded.aquifer, 'the derived aquifer is recomputed on load');
  assert.deepEqual([...loaded.aquifer.substrate], [...sim.aquifer.substrate], 'and it matches');
  // The two sims now step identically, which is the real contract.
  loaded.step();
  sim.step();
  assert.equal(taintOf(loaded.map.tiles[infested]), taintOf(map.tiles[infested]));
  assert.deepEqual(
    loaded.deep.regions.map((r) => Math.round(r.presence * 1000)),
    sim.deep.regions.map((r) => Math.round(r.presence * 1000)),
    'a loaded town and its original walk the same future',
  );
});
