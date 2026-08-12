import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GameMap, TERRAIN } from '../src/mapgen.js';
import {
  TOOL, VIEW, applyTool, canApply, describeTile, hasPipe, pipeMask, isWaterConductor,
  STRUCTURE_INFO,
} from '../src/tools.js';
import { computePower } from '../src/power.js';
import {
  computeWater, waterAt, wateredAt, waterCapAt, explainWater,
  PRESSURE, COVERAGE_RADIUS, WATER_PER_TIER,
} from '../src/water.js';
import { makeSim, MAX_LEVEL, computeBudget, explainLot } from '../src/sim.js';
import { serializeSave, deserializeSave } from '../src/save.js';

// A flat grass map with every tile field present (mirrors the power/sim test helpers).
function flatMap(cols = 12, rows = 12) {
  const m = new GameMap(cols, rows);
  for (let i = 0; i < cols * rows; i++) {
    m.tiles[i] = {
      terrain: TERRAIN.GRASS, elevation: 1, object: null, zone: null,
      building: null, structure: null, scar: null, pipe: null,
    };
  }
  return m;
}

// Put a built lot on a tile directly (the convention power.test.js uses to load a network).
function build(m, col, row, zone, level) {
  const t = m.tiles[m.index(col, row)];
  t.zone = zone;
  t.building = { level, cls: 'unwary' };
}

function waterOf(m) { return computeWater(m, computePower(m)); }

// --- the network itself --------------------------------------------------------------------

test('an untouched map has no water network at all', () => {
  const w = waterOf(flatMap());
  assert.equal(w.components.length, 0);
  assert.equal(w.served.size, 0);
  assert.equal(w.totals.capacity, 0);
});

test('computeWater is deterministic for the same map', () => {
  const make = () => {
    const m = flatMap();
    applyTool(m, TOOL.WELLHOUSE, 2, 2);
    for (let c = 3; c <= 8; c++) applyTool(m, TOOL.PIPE, c, 2);
    build(m, 4, 4, 'residential', 2);
    return m;
  };
  const a = waterOf(make());
  const b = waterOf(make());
  assert.deepEqual(a.totals, b.totals);
  assert.equal(a.components.length, b.components.length);
  assert.deepEqual(a.components.map((c) => c.tiles), b.components.map((c) => c.tiles));
  assert.deepEqual([...a.served].sort((x, y) => x - y), [...b.served].sort((x, y) => x - y));
});

test('a main floods along its own run and stops where the pipe stops', () => {
  const m = flatMap();
  applyTool(m, TOOL.WELLHOUSE, 1, 1);
  for (let c = 2; c <= 6; c++) applyTool(m, TOOL.PIPE, c, 1);
  applyTool(m, TOOL.PIPE, 9, 9); // a stray length, joined to nothing
  const w = waterOf(m);
  assert.equal(w.components.length, 2, 'the run and the stray length are separate networks');
  const run = w.components.find((c) => c.tiles.includes(m.index(1, 1)));
  assert.equal(run.tiles.length, 6, 'the well house and its five lengths of main');
  const stray = w.components.find((c) => c.tiles.includes(m.index(9, 9)));
  assert.equal(stray.capacity, 0);
  assert.equal(stray.pressure, PRESSURE.DRY, 'a main with no source is dry');
});

// The central divergence from the power grid, called out in the spec: power passes through built
// lots, water never does. Pipes are the network.
test('buildings do not conduct water, so a row of houses never joins two mains', () => {
  const m = flatMap();
  applyTool(m, TOOL.WELLHOUSE, 1, 5);
  applyTool(m, TOOL.PIPE, 2, 5);
  for (let c = 3; c <= 5; c++) build(m, c, 5, 'residential', 1); // houses between the two mains
  applyTool(m, TOOL.PIPE, 6, 5);
  const w = waterOf(m);
  assert.equal(w.components.length, 2, 'the houses do not carry water onward');
  const fed = w.components.find((c) => c.tiles.includes(m.index(1, 5)));
  const orphan = w.components.find((c) => c.tiles.includes(m.index(6, 5)));
  assert.ok(fed.capacity > 0);
  assert.equal(orphan.capacity, 0, 'the far main is fed by nothing');
});

test('a water source conducts, so a main laid beside a pump joins its network', () => {
  const m = flatMap();
  applyTool(m, TOOL.WELLHOUSE, 4, 4);
  applyTool(m, TOOL.PIPE, 5, 4);
  const w = waterOf(m);
  assert.equal(w.components.length, 1);
  assert.ok(isWaterConductor(m.tileAt(4, 4)), 'the well house is a conductor');
  assert.ok(pipeMask(m.tileAt(5, 4)) !== 0, 'the main draws a connection into the pump');
});

// --- coverage radius -----------------------------------------------------------------------

test('a live main waters every tile within the coverage radius and nothing beyond it', () => {
  const m = flatMap();
  applyTool(m, TOOL.WELLHOUSE, 5, 5);
  const w = waterOf(m);
  assert.equal(w.components[0].pressure, PRESSURE.GOOD);
  // Chebyshev: the full square out to the radius is served.
  for (let dr = -COVERAGE_RADIUS; dr <= COVERAGE_RADIUS; dr++) {
    for (let dc = -COVERAGE_RADIUS; dc <= COVERAGE_RADIUS; dc++) {
      assert.ok(wateredAt(m, w, 5 + dc, 5 + dr), `(${5 + dc},${5 + dr}) should be watered`);
    }
  }
  // One tile further in any direction is dry.
  assert.equal(wateredAt(m, w, 5 + COVERAGE_RADIUS + 1, 5), false, 'east of the radius is dry');
  assert.equal(wateredAt(m, w, 5, 5 - COVERAGE_RADIUS - 1), false, 'north of the radius is dry');
  assert.equal(wateredAt(m, w, 5 + COVERAGE_RADIUS + 1, 5 + COVERAGE_RADIUS + 1), false,
    'the diagonal beyond the corner is dry');
});

test('a dry main waters nothing, however long it runs', () => {
  const m = flatMap();
  for (let c = 1; c <= 8; c++) applyTool(m, TOOL.PIPE, c, 5); // no source anywhere
  const w = waterOf(m);
  assert.equal(w.components[0].pressure, PRESSURE.DRY);
  assert.equal(w.served.size, 0);
  assert.equal(w.lowServed.size, 0);
  assert.equal(wateredAt(m, w, 4, 5), false);
});

// --- capacity, demand, and the pump's dependence on power ------------------------------------

test('a lot draws water by zone and tier, and empty zoned land draws none', () => {
  const m = flatMap();
  applyTool(m, TOOL.WELLHOUSE, 5, 5);
  m.tiles[m.index(4, 5)].zone = 'residential'; // zoned, never built
  build(m, 6, 5, 'industrial', 2);
  const w = waterOf(m);
  assert.equal(w.components[0].demand, 2 * WATER_PER_TIER.industrial,
    'only the built industrial lot draws, at level x 2');
});

test('a pump house meets a load a well house cannot', () => {
  const load = (sourceTool) => {
    const m = flatMap();
    applyTool(m, TOOL.GASWORKS, 0, 0);
    applyTool(m, sourceTool, 1, 0); // beside the works, so the pump is on a live grid
    // A block of tall works inside the coverage: 8 lots at level 3, industry drawing double.
    for (let c = 0; c <= 3; c++) for (let r = 1; r <= 2; r++) build(m, c, r, 'industrial', 3);
    return waterOf(m).components.find((x) => x.tiles.includes(m.index(1, 0)));
  };
  const well = load(TOOL.WELLHOUSE);
  const pump = load(TOOL.PUMPHOUSE);
  assert.equal(well.demand, pump.demand, 'the same town is asking for the same water');
  assert.ok(well.capacity < well.demand, 'the well house cannot bear it');
  assert.equal(well.pressure, PRESSURE.LOW, 'so its main runs at low pressure');
  assert.ok(pump.capacity >= pump.demand, 'the pump house can');
  assert.equal(pump.pressure, PRESSURE.GOOD);
  assert.equal(pump.satisfied, true);
});

test('an unpowered pump house gives nothing and its main goes dry', () => {
  const m = flatMap();
  applyTool(m, TOOL.PUMPHOUSE, 5, 5); // no generator anywhere
  for (let c = 6; c <= 8; c++) applyTool(m, TOOL.PIPE, c, 5);
  const w = waterOf(m);
  const comp = w.components[0];
  assert.equal(comp.capacity, 0, 'an idle pump draws no water at all');
  assert.equal(comp.pressure, PRESSURE.DRY);
  assert.equal(comp.unpoweredPumps, 1);
  assert.equal(w.served.size, 0, 'and waters nothing');
  // The same pump on a live grid does its work.
  applyTool(m, TOOL.GASWORKS, 4, 5);
  const lit = waterOf(m);
  assert.equal(lit.components[0].capacity, STRUCTURE_INFO.pumphouse.water);
  assert.equal(lit.components[0].pressure, PRESSURE.GOOD);
  assert.ok(lit.served.size > 0);
});

test('a well house needs no grid at all', () => {
  const m = flatMap();
  applyTool(m, TOOL.WELLHOUSE, 5, 5);
  const comp = waterOf(m).components[0];
  assert.equal(comp.capacity, STRUCTURE_INFO.wellhouse.water);
  assert.equal(comp.unpoweredPumps, 0);
  assert.equal(comp.pressure, PRESSURE.GOOD);
});

test('a reservoir makes no water but its stored head carries a shortfall', () => {
  const withReservoir = (place) => {
    const m = flatMap();
    applyTool(m, TOOL.WELLHOUSE, 1, 1);
    for (let c = 2; c <= 4; c++) applyTool(m, TOOL.PIPE, c, 1);
    if (place) applyTool(m, TOOL.RESERVOIR, 5, 1);
    // A draw past what the well house alone can bear, but inside its head plus the reservoir's.
    for (let c = 1; c <= 4; c++) for (let r = 2; r <= 3; r++) build(m, c, r, 'industrial', 3);
    return waterOf(m).components.find((x) => x.tiles.includes(m.index(1, 1)));
  };
  const bare = withReservoir(false);
  const held = withReservoir(true);
  assert.equal(held.capacity, bare.capacity, 'the reservoir generates nothing');
  assert.equal(held.demand, bare.demand, 'and the town is asking for the same water either way');
  assert.equal(held.buffer, STRUCTURE_INFO.reservoir.buffer);
  assert.equal(bare.pressure, PRESSURE.LOW, 'the well house alone falls short');
  assert.equal(held.pressure, PRESSURE.GOOD, 'the stored head covers the shortfall');
});

test('a lot in reach of two mains is billed to one of them only', () => {
  const m = flatMap();
  applyTool(m, TOOL.WELLHOUSE, 3, 5);
  applyTool(m, TOOL.WELLHOUSE, 6, 5); // both cover (4,5) and (5,5)
  build(m, 4, 5, 'residential', 3);
  build(m, 5, 5, 'residential', 3);
  const w = waterOf(m);
  assert.equal(w.components.length, 2);
  assert.equal(w.totals.demand, 6, 'the two houses are counted once between them, not twice');
});

// --- the growth gate ------------------------------------------------------------------------

test('water caps how tall a lot may grow: none at tier 1, low at tier 2, good at the full cap', () => {
  // Dry: no main within reach.
  const dry = flatMap();
  assert.equal(waterCapAt(dry, waterOf(dry), 5, 5, MAX_LEVEL), 1);

  // Good: a well house with capacity to spare.
  const good = flatMap();
  applyTool(good, TOOL.WELLHOUSE, 5, 5);
  assert.equal(waterAt(waterOf(good), good.index(5, 6)), PRESSURE.GOOD);
  assert.equal(waterCapAt(good, waterOf(good), 5, 6, MAX_LEVEL), MAX_LEVEL);

  // Low: the same well house, asked for far more than it has.
  const low = flatMap();
  applyTool(low, TOOL.WELLHOUSE, 5, 5);
  for (let c = 3; c <= 7; c++) {
    for (let r = 3; r <= 7; r++) {
      if (c === 5 && r === 5) continue;
      build(low, c, r, 'residential', 3);
    }
  }
  const lowWater = waterOf(low);
  assert.equal(lowWater.components[0].pressure, PRESSURE.LOW);
  assert.equal(waterCapAt(low, lowWater, 4, 4, MAX_LEVEL), 2, 'low pressure caps growth at tier 2');
});

test('an unwatered town builds first-tier shacks and no more, even on a live grid', () => {
  const grow = (watered) => {
    const m = flatMap(12, 12);
    for (let c = 1; c <= 6; c++) applyTool(m, TOOL.ROAD, c, 3);
    for (let c = 1; c <= 6; c++) applyTool(m, TOOL.ZONE_R, c, 2);
    applyTool(m, TOOL.GASWORKS, 1, 1);
    for (let c = 2; c <= 6; c++) applyTool(m, TOOL.POWERLINE, c, 1);
    if (watered) {
      applyTool(m, TOOL.WELLHOUSE, 0, 4);
      for (let c = 1; c <= 6; c++) applyTool(m, TOOL.PIPE, c, 4);
    }
    const sim = makeSim(m, { seed: 'wet' });
    for (let i = 0; i < 120; i++) sim.step();
    let max = 0;
    for (let c = 1; c <= 6; c++) {
      const b = sim.map.tileAt(c, 2).building;
      if (b) max = Math.max(max, b.level);
    }
    return { sim, max };
  };
  const dry = grow(false);
  const wet = grow(true);
  assert.ok(dry.sim.totalPopulation() > 0, 'a dry town still puts up first-tier homes');
  assert.equal(dry.max, 1, 'but nothing climbs past the first tier without water');
  assert.ok(wet.max > 1, 'power and clean water together let the town build up');
  assert.equal(wet.max, MAX_LEVEL, 'to the full density');
});

// --- the query ------------------------------------------------------------------------------

test('the query names the main, its pressure, and what feeds it', () => {
  const m = flatMap();
  applyTool(m, TOOL.WELLHOUSE, 4, 4);
  for (let c = 5; c <= 7; c++) applyTool(m, TOOL.PIPE, c, 4);
  const sim = makeSim(m, { seed: 'q' });
  sim.step();
  const lines = explainWater(sim, 6, 4).join(' | ');
  assert.match(lines, /Main \d+/, 'the network is named');
  assert.match(lines, /Pressure: Good/);
  assert.match(lines, /Fed by a well house/);
  assert.ok(!/—|--/.test(lines), 'player-facing text carries no em-dashes');
});

test('the query says plainly when a pump stands idle for want of power', () => {
  const m = flatMap();
  applyTool(m, TOOL.PUMPHOUSE, 4, 4);
  const sim = makeSim(m, { seed: 'idle' });
  sim.step();
  const lines = explainWater(sim, 4, 4).join(' | ');
  assert.match(lines, /Pressure: Dry/);
  assert.match(lines, /idle for want of power/);
});

test('the query tells unserved ground it has no water, once a network exists', () => {
  const m = flatMap();
  applyTool(m, TOOL.WELLHOUSE, 1, 1);
  const sim = makeSim(m, { seed: 'far' });
  sim.step();
  assert.match(explainWater(sim, 9, 9).join(' '), /Watered: no/);
  assert.match(explainWater(sim, 2, 2).join(' '), /Watered: yes/);
});

test('the lot query names water as the growth blocker, in plain English', () => {
  const m = flatMap();
  for (let c = 1; c <= 4; c++) applyTool(m, TOOL.ROAD, c, 3);
  applyTool(m, TOOL.ZONE_R, 2, 2);
  applyTool(m, TOOL.GASWORKS, 1, 1);
  applyTool(m, TOOL.POWERLINE, 2, 1);
  const sim = makeSim(m, { seed: 'block' });
  for (let i = 0; i < 40; i++) sim.step();
  const why = explainLot(sim, 2, 2).join(' | ');
  assert.match(why, /No water: cannot grow beyond a poor first tier\./);
  assert.ok(!/—/.test(why), 'no em-dashes in player-facing text');
});

test('describeTile reports a main beneath the ground', () => {
  const m = flatMap();
  applyTool(m, TOOL.PIPE, 3, 3);
  const lines = describeTile(m, 3, 3).lines.join(' | ');
  assert.match(lines, /A water main runs beneath\./);
  assert.ok(!/Unclaimed land/.test(lines), 'ground with a main under it is not unclaimed');
});

// --- the underground plane and the layer-aware bulldozer --------------------------------------

test('a main runs beneath a road and a power line with no conflict either way', () => {
  const m = flatMap();
  applyTool(m, TOOL.ROAD, 4, 4);
  applyTool(m, TOOL.POWERLINE, 4, 4); // a surface crossing
  assert.equal(canApply(m, TOOL.PIPE, 4, 4).ok, true, 'the surface never blocks a main');
  applyTool(m, TOOL.PIPE, 4, 4);
  const tile = m.tileAt(4, 4);
  assert.equal(tile.object.kind, 'crossing', 'the surface crossing is untouched');
  assert.ok(hasPipe(tile), 'and the main is laid below it');
  // The reverse order works the same.
  const n = flatMap();
  applyTool(n, TOOL.PIPE, 2, 2);
  applyTool(n, TOOL.ROAD, 2, 2);
  assert.ok(hasPipe(n.tileAt(2, 2)) && n.tileAt(2, 2).object.kind === 'road');
});

test('a main runs beneath a zoned lot without disturbing the zoning', () => {
  const m = flatMap();
  applyTool(m, TOOL.ZONE_R, 3, 3);
  applyTool(m, TOOL.PIPE, 3, 3);
  assert.equal(m.tileAt(3, 3).zone, 'residential', 'laying a main never clears the lot above');
  assert.ok(hasPipe(m.tileAt(3, 3)));
});

test('the bulldozer works one plane at a time', () => {
  const m = flatMap();
  applyTool(m, TOOL.ROAD, 5, 5);
  applyTool(m, TOOL.PIPE, 5, 5);
  // Underground it lifts the main and leaves the street alone.
  applyTool(m, TOOL.BULLDOZE, 5, 5, { view: VIEW.UNDERGROUND });
  assert.equal(hasPipe(m.tileAt(5, 5)), false, 'the main is lifted');
  assert.ok(m.tileAt(5, 5).object, 'the road above still stands');
  // On the surface it clears the street and leaves any main below alone.
  applyTool(m, TOOL.PIPE, 5, 5);
  applyTool(m, TOOL.BULLDOZE, 5, 5, { view: VIEW.SURFACE });
  assert.equal(m.tileAt(5, 5).object, null, 'the road is cleared');
  assert.ok(hasPipe(m.tileAt(5, 5)), 'and the main below is untouched');
});

test('a water works refused on a street below names the street above, not a surface order', () => {
  const m = flatMap();
  applyTool(m, TOOL.ROAD, 4, 4);
  const road = canApply(m, TOOL.PUMPHOUSE, 4, 4, { view: VIEW.UNDERGROUND });
  assert.equal(road.ok, false);
  assert.match(road.reason, /street runs above/i);
  assert.ok(!/Clear the road/.test(road.reason));
  applyTool(m, TOOL.POWERLINE, 5, 5);
  const line = canApply(m, TOOL.WELLHOUSE, 5, 5, { view: VIEW.UNDERGROUND });
  assert.equal(line.ok, false);
  assert.match(line.reason, /power line runs above/i);
  const surface = canApply(m, TOOL.PUMPHOUSE, 4, 4, { view: VIEW.SURFACE });
  assert.match(surface.reason, /Clear the road or line/);
});

test('the underground bulldozer refuses ground with no main under it, in plain English', () => {
  const m = flatMap();
  applyTool(m, TOOL.ROAD, 2, 2);
  const check = canApply(m, TOOL.BULLDOZE, 2, 2, { view: VIEW.UNDERGROUND });
  assert.equal(check.ok, false);
  assert.match(check.reason, /no main here/i);
  assert.ok(!/—/.test(check.reason));
});

test('clearing a pump house re-reads the mains that ran into it', () => {
  const m = flatMap();
  applyTool(m, TOOL.WELLHOUSE, 4, 4);
  applyTool(m, TOOL.PIPE, 5, 4);
  assert.ok(pipeMask(m.tileAt(5, 4)) !== 0);
  applyTool(m, TOOL.BULLDOZE, 4, 4, { view: VIEW.SURFACE });
  assert.equal(pipeMask(m.tileAt(5, 4)), 0, 'the main no longer connects to anything');
  assert.equal(waterOf(m).components[0].pressure, PRESSURE.DRY);
});

test('a main cannot be laid twice, nor out over the tide', () => {
  const m = flatMap();
  applyTool(m, TOOL.PIPE, 3, 3);
  assert.equal(canApply(m, TOOL.PIPE, 3, 3).ok, false);
  m.tiles[m.index(8, 8)].terrain = TERRAIN.DEEP;
  const check = canApply(m, TOOL.PIPE, 8, 8);
  assert.equal(check.ok, false, 'no main runs out under deep water in this milestone');
});

// --- economy and save -------------------------------------------------------------------------

test('the water works carry their construction cost and their monthly upkeep', () => {
  const m = flatMap();
  applyTool(m, TOOL.PUMPHOUSE, 3, 3);
  applyTool(m, TOOL.WELLHOUSE, 6, 6);
  applyTool(m, TOOL.RESERVOIR, 9, 9);
  for (let c = 4; c <= 5; c++) applyTool(m, TOOL.PIPE, c, 3);
  const sim = makeSim(m, { seed: 'money' });
  sim.step();
  assert.equal(sim.counts.pumphouse, 1);
  assert.equal(sim.counts.wellhouse, 1);
  assert.equal(sim.counts.reservoir, 1);
  assert.equal(sim.counts.pipe, 2);
  const expected = STRUCTURE_INFO.pumphouse.upkeep
    + STRUCTURE_INFO.wellhouse.upkeep + STRUCTURE_INFO.reservoir.upkeep;
  assert.equal(computeBudget(sim).lines.services, expected, 'all three works are funded monthly');
});

test('a town saves and loads with its mains and its pressure intact', () => {
  const m = flatMap();
  applyTool(m, TOOL.WELLHOUSE, 2, 2);
  for (let c = 3; c <= 6; c++) applyTool(m, TOOL.PIPE, c, 2);
  build(m, 4, 4, 'residential', 2);
  const sim = makeSim(m, { seed: 'save' });
  sim.step();
  const back = deserializeSave(serializeSave(sim));
  assert.ok(hasPipe(back.map.tileAt(5, 2)), 'the mains survive the round trip');
  assert.equal(back.water.components.length, sim.water.components.length);
  assert.deepEqual(back.water.totals, sim.water.totals);
  assert.equal(waterAt(back.water, back.map.index(4, 4)), waterAt(sim.water, sim.map.index(4, 4)));
});

test('a save written before the underground plane existed still loads, with no mains', () => {
  const m = flatMap();
  applyTool(m, TOOL.ROAD, 1, 1);
  const sim = makeSim(m, { seed: 'old' });
  sim.step();
  const snapshot = JSON.parse(serializeSave(sim));
  for (const t of snapshot.map.tiles) delete t.pipe; // as an older save would have been written
  const back = deserializeSave(JSON.stringify(snapshot));
  assert.equal(back.water.components.length, 0);
  assert.equal(hasPipe(back.map.tileAt(1, 1)), false);
});
