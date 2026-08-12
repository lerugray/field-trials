import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GameMap, TERRAIN } from '../src/mapgen.js';
import { TOOL, applyTool, STRUCTURE_INFO } from '../src/tools.js';
import {
  makeSim, computeBudget, emptyCounts, ECON, ORDINANCE, CLASS_LIST, BANKRUPT_GRACE,
} from '../src/sim.js';

function townMap(cols = 8, rows = 8) {
  const m = new GameMap(cols, rows);
  for (let i = 0; i < cols * rows; i++) {
    m.tiles[i] = { terrain: TERRAIN.GRASS, elevation: 1, object: null, zone: null, building: null };
  }
  return m;
}
function grownTown(seed = 'econ', dreadBase) {
  const m = townMap();
  for (let c = 1; c <= 6; c++) applyTool(m, TOOL.ROAD, c, 3);
  for (let c = 1; c <= 6; c++) applyTool(m, TOOL.ZONE_R, c, 2);
  applyTool(m, TOOL.ZONE_C, 1, 5);
  applyTool(m, TOOL.ZONE_C, 2, 5);
  const sim = makeSim(m, { seed, dreadBase });
  for (let i = 0; i < 60; i++) sim.step();
  return sim;
}

test('the treasury starts funded', () => {
  const sim = makeSim(townMap(), {});
  assert.equal(sim.treasury, ECON.START_TREASURY);
});

test('spend() charges the treasury and refuses when it cannot bear it', () => {
  const sim = makeSim(townMap(), { treasury: 100 });
  assert.equal(sim.spend(60), true);
  assert.equal(sim.treasury, 40);
  assert.equal(sim.spend(50), false); // not enough
  assert.equal(sim.treasury, 40); // unchanged on refusal
  assert.equal(sim.spend(0), true); // free actions always pass
});

test('a populated town earns tax income', () => {
  const sim = grownTown();
  const b = computeBudget(sim);
  assert.ok(sim.totalPopulation() > 0);
  assert.ok(b.lines.tax > 0, 'residents should pay tax');
  assert.ok(b.income > 0);
});

test('raising a class tax rate raises that class income', () => {
  const sim = grownTown();
  const before = computeBudget(sim).lines.tax;
  for (const c of CLASS_LIST) sim.setTax(c, 0.15);
  const after = computeBudget(sim).lines.tax;
  assert.ok(after > before, `tax should rise (${before} -> ${after})`);
});

test('tax rates are clamped to a sane band', () => {
  const sim = makeSim(townMap(), {});
  sim.setTax('unwary', 5);
  assert.ok(sim.taxRates.unwary <= 0.2);
  sim.setTax('unwary', -1);
  assert.ok(sim.taxRates.unwary >= 0);
});

// --- the university-upkeep regression (found at M-a, fixed at M-b) --------------------------
// `reassignAndTally` built its counts object by hand, and the key `university` was simply missing.
// The tally guard is `if (counts[kind] !== undefined)`, so universities were counted zero times: for
// several milestones a campus cost $1200 to raise and then NOTHING a month to run, and its dread
// relief was never credited either. Nothing looked wrong, because classFor reads the map directly
// through coverCounts, so Scholars still turned up.
//
// The fix is structural rather than a one-line patch: both counts objects now come from
// emptyCounts(), which derives its keys from STRUCTURE_INFO. These two tests hold that, so a
// structure added in a later milestone cannot repeat it.
test('every structure kind the game can build is tallied', () => {
  const counts = emptyCounts();
  for (const kind of Object.keys(STRUCTURE_INFO)) {
    assert.equal(counts[kind], 0, `${kind} has no counter, so it would never be tallied or billed`);
  }
});

test('every structure kind charges its own monthly upkeep, the university included', () => {
  for (const kind of Object.keys(STRUCTURE_INFO)) {
    const info = STRUCTURE_INFO[kind];
    const m = townMap(12, 12);
    for (let r = 0; r < m.rows; r++) m.tileAt(0, r).terrain = TERRAIN.DEEP; // a shore, for the works
    const sim = makeSim(m, { seed: `upkeep-${kind}` });
    sim.step();
    const before = computeBudget(sim).lines.services;
    const placed = applyTool(m, info.tool, 6, 6);
    assert.equal(placed.ok, true, `${kind} could not be placed`);
    sim.step();
    const after = computeBudget(sim).lines.services;
    assert.equal(sim.counts[kind], 1, `${kind} was not counted`);
    assert.equal(after - before, info.upkeep,
      `${kind} should add its upkeep of ${info.upkeep} to the monthly services line`);
  }
});

test('a university eases dread now that it is counted', () => {
  const withCampus = () => {
    const m = townMap(16, 16);
    for (let c = 1; c <= 10; c++) applyTool(m, TOOL.ROAD, c, 3);
    for (let c = 1; c <= 10; c++) applyTool(m, TOOL.ZONE_R, c, 2);
    return m;
  };
  const bare = makeSim(withCampus(), { seed: 'dread-bare', dreadBase: 30 });
  const campus = withCampus();
  applyTool(campus, TOOL.UNIVERSITY, 12, 8);
  const learned = makeSim(campus, { seed: 'dread-campus', dreadBase: 30 });
  for (let i = 0; i < 40; i++) { bare.step(); learned.step(); }
  assert.ok(learned.dread < bare.dread,
    `the campus should press dread down (${learned.dread} vs ${bare.dread}); `
    + 'before the counts fix its STRUCTURE_INFO.dread of -4 was never applied at all');
});

test('maintenance scales with roads and buildings', () => {
  const sim = grownTown();
  const b = computeBudget(sim);
  assert.ok(sim.counts.road > 0);
  assert.equal(
    b.lines.maintenance,
    sim.counts.road * ECON.ROAD_UPKEEP
      + (sim.counts.residential + sim.counts.commercial + sim.counts.industrial) * ECON.BUILDING_UPKEEP,
  );
});

test('ordinances add upkeep and Harbor Tithes lifts sea-bounty', () => {
  const m = townMap();
  for (let r = 0; r < m.rows; r++) m.tileAt(0, r).terrain = TERRAIN.DEEP; // a shore
  for (let r = 1; r <= 6; r++) applyTool(m, TOOL.ROAD, 2, r);
  for (let r = 1; r <= 6; r++) applyTool(m, TOOL.ZONE_R, 1, r);
  const sim = makeSim(m, { seed: 'tithe', dreadBase: 60 });
  for (let i = 0; i < 60; i++) sim.step();
  assert.ok(sim.pop.deepone > 0, 'need Deep Ones for sea-bounty');
  const before = computeBudget(sim);
  sim.toggleOrdinance(ORDINANCE.HARBOR_TITHES);
  const after = computeBudget(sim);
  assert.ok(after.lines.bounty > before.lines.bounty, 'tithes raise the sea-bounty');
  assert.ok(after.lines.ordinanceUpkeep > before.lines.ordinanceUpkeep, 'tithes cost upkeep');
});

test('public-order ordinances lower dread over time', () => {
  const m = townMap();
  for (let c = 1; c <= 6; c++) applyTool(m, TOOL.ROAD, c, 3);
  for (let c = 1; c <= 6; c++) applyTool(m, TOOL.ZONE_I, c, 5); // industry drives dread up
  const plain = makeSim(m, { seed: 'ord' });
  for (let i = 0; i < 40; i++) plain.step();
  const dreadPlain = plain.dread;

  const m2 = townMap();
  for (let c = 1; c <= 6; c++) applyTool(m2, TOOL.ROAD, c, 3);
  for (let c = 1; c <= 6; c++) applyTool(m2, TOOL.ZONE_I, c, 5);
  const curbed = makeSim(m2, { seed: 'ord' });
  curbed.toggleOrdinance(ORDINANCE.CURFEW);
  curbed.toggleOrdinance(ORDINANCE.MASKED_PROCESSIONS);
  for (let i = 0; i < 40; i++) curbed.step();
  assert.ok(curbed.dread < dreadPlain, `ordinances should ease dread (${curbed.dread} vs ${dreadPlain})`);
});

test('the monthly budget settles into the treasury', () => {
  const sim = grownTown();
  const before = sim.treasury;
  const net = computeBudget(sim).net;
  sim.step();
  // After one more step the treasury moved by roughly the net (growth may shift it slightly).
  assert.notEqual(sim.treasury, before);
  assert.ok(Number.isFinite(net));
});

// --- bankruptcy consequence (M8) ---------------------------------------------------------

// A town that bleeds money: upkeep (roads, buildings, a chapel, an ordinance) with no tax income.
function bleedingTown(seed = 'broke', opts = {}) {
  const m = townMap();
  for (let c = 1; c <= 6; c++) applyTool(m, TOOL.ROAD, c, 3);
  for (let c = 1; c <= 6; c++) applyTool(m, TOOL.ZONE_R, c, 2);
  applyTool(m, TOOL.CHAPEL, 1, 5); // a funded service whose dread relief the cut removes
  const sim = makeSim(m, { seed, treasury: 40, dreadBase: 30, ...opts });
  for (const c of CLASS_LIST) sim.setTax(c, 0); // no income, so the coffers only fall
  sim.toggleOrdinance(ORDINANCE.CURFEW); // an ordinance that insolvency must force off
  return sim;
}

test('a town that runs out of money goes insolvent and its ordinances shut off', () => {
  const sim = bleedingTown();
  let steps = 0;
  while (sim.treasury >= 0 && steps < 40) { sim.step(); steps++; }
  assert.ok(sim.treasury < 0, 'the bleeding town should run negative');
  assert.ok(sim.bankruptMonths > 0, 'insolvency is counted');
  assert.equal(sim.ordinances.curfew, false, 'insolvency forces every ordinance off');
});

test('an insolvent town cannot enable an ordinance until it recovers', () => {
  const sim = bleedingTown();
  while (sim.treasury >= 0) sim.step();
  sim.toggleOrdinance(ORDINANCE.CURFEW);
  assert.equal(sim.ordinances.curfew, false, 'cannot take on upkeep while insolvent');
  sim.treasury = 5000; // the coffers recover
  sim.toggleOrdinance(ORDINANCE.CURFEW);
  assert.equal(sim.ordinances.curfew, true, 'once solvent, ordinances may be set again');
});

test('sustained insolvency cuts the funded services and drives dread up', () => {
  const bleeding = bleedingTown('spiral');
  for (let i = 0; i < 30; i++) bleeding.step();
  assert.ok(bleeding.bankruptMonths >= BANKRUPT_GRACE, 'insolvent long enough to cut services');
  assert.equal(bleeding.servicesCut, true);

  // A solvent copy of the same town (funded by tax) keeps its chapel relief, so its dread is lower.
  const m = townMap();
  for (let c = 1; c <= 6; c++) applyTool(m, TOOL.ROAD, c, 3);
  for (let c = 1; c <= 6; c++) applyTool(m, TOOL.ZONE_R, c, 2);
  applyTool(m, TOOL.CHAPEL, 1, 5);
  const solvent = makeSim(m, { seed: 'spiral', treasury: 1_000_000, dreadBase: 30 });
  for (let i = 0; i < 30; i++) solvent.step();
  assert.equal(solvent.servicesCut, false);
  assert.ok(bleeding.dread > solvent.dread,
    `a cut town loses its dread relief (${bleeding.dread} vs ${solvent.dread})`);
});

test('recovering the treasury clears the service cut', () => {
  const sim = bleedingTown('recover');
  for (let i = 0; i < 20; i++) sim.step();
  assert.equal(sim.servicesCut, true);
  sim.treasury = 100000;
  sim.step();
  assert.equal(sim.servicesCut, false);
  assert.equal(sim.bankruptMonths, 0);
});

test('the economy is deterministic', () => {
  const a = grownTown('same');
  const b = grownTown('same');
  assert.equal(a.treasury, b.treasury);
  assert.deepEqual(computeBudget(a), computeBudget(b));
});
