import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GameMap, TERRAIN } from '../src/mapgen.js';
import { TOOL, applyTool } from '../src/tools.js';
import { makeSim } from '../src/sim.js';
import {
  GOD, GOD_LIST, GOD_INFO, makeFavor, surveyTown, favorDelta, stepFavor,
  FAVOR_START, FAVOR_MAX, WRATH_AT, diminishing, STACK_RATIO,
  favorStage, dangerFraction, wrathForecast, FAVOR_STAGE, OMEN_AT, DIRE_AT,
} from '../src/gods.js';

// A flat grass map; a strip of deep water down col 0 so shrines can be "by the water".
function townMap(cols = 16, rows = 16, withWater = false) {
  const m = new GameMap(cols, rows);
  for (let i = 0; i < cols * rows; i++) {
    m.tiles[i] = { terrain: TERRAIN.GRASS, elevation: 1, object: null, zone: null, building: null, structure: null };
  }
  if (withWater) for (let r = 0; r < rows; r++) m.tileAt(0, r).terrain = TERRAIN.DEEP;
  return m;
}

// --- appeasement diminishing returns (M8) ------------------------------------------------

test('diminishing() saturates: each further structure gives less, total stays under linear', () => {
  const per = 5;
  const d1 = diminishing(1, per);
  const d2 = diminishing(2, per);
  const d3 = diminishing(3, per);
  assert.equal(d1, per, 'the first structure gives its full value');
  assert.ok(d2 - d1 < d1, 'the second gives less than the first');
  assert.ok(d3 - d2 < d2 - d1, 'each marginal structure gives less than the last');
  assert.ok(d3 < 3 * per, 'a stack never reaches the linear sum');
  assert.ok(diminishing(100, per) < per / (1 - STACK_RATIO) + 1e-6, 'it approaches the ceiling');
});

test('stacked appeasement is sublinear: two universities appease less than twice one', () => {
  const sim = makeSim(townMap(), { dread: 0 });
  const base = { shrineWater: 0, shrineGrove: 0, constabulary: 0, university: 0, asylum: 0, chapel: 0 };
  const d0 = favorDelta(GOD.YOG, { ...base, university: 0 }, sim);
  const d1 = favorDelta(GOD.YOG, { ...base, university: 1 }, sim);
  const d2 = favorDelta(GOD.YOG, { ...base, university: 2 }, sim);
  assert.ok(d1 - d0 > d2 - d1, `the 2nd campus adds less favor than the 1st (${d1 - d0} vs ${d2 - d1})`);
  assert.ok(d2 - d0 < 2 * (d1 - d0), 'two campuses appease less than twice one (sublinear)');
});

test('carpeting the map is pointless: the marginal structure vanishes', () => {
  // The tenth shrine adds almost nothing over the ninth, so a rich town cannot brute-force favor by
  // covering the map: the tax-base-vs-favor dial stays live (DIRECTIONS-M7 §M8).
  const first = diminishing(1, 3);
  const tenthMarginal = diminishing(10, 3) - diminishing(9, 3);
  assert.ok(tenthMarginal < 0.05 * first,
    `the 10th shrine adds almost nothing (${tenthMarginal.toFixed(3)} vs first ${first})`);
});

test('every god has info and a starting favor', () => {
  assert.equal(GOD_LIST.length, 5);
  for (const g of GOD_LIST) {
    assert.ok(GOD_INFO[g], `info for ${g}`);
    assert.ok(GOD_INFO[g].wrath && GOD_INFO[g].appease, `${g} names its wrath and appeasement`);
  }
  const f = makeFavor();
  for (const g of GOD_LIST) assert.equal(f[g], FAVOR_START);
});

test('surveyTown classifies wharf shrines by water and grove shrines inland', () => {
  const m = townMap(16, 16, true);
  applyTool(m, TOOL.SHRINE, 1, 4); // beside the water column -> wharf (Dagon)
  applyTool(m, TOOL.SHRINE, 10, 10); // inland -> grove (Shub)
  applyTool(m, TOOL.CONSTABULARY, 6, 6);
  applyTool(m, TOOL.UNIVERSITY, 8, 8);
  const s = surveyTown(m);
  assert.equal(s.shrineWater, 1);
  assert.equal(s.shrineGrove, 1);
  assert.equal(s.constabulary, 1);
  assert.equal(s.university, 1);
});

test('neglect drives favor down; the right appeasement holds it', () => {
  const bare = makeSim(townMap(), {});
  // With nothing built, Dagon's track only falls.
  assert.ok(favorDelta(GOD.DAGON, surveyTown(bare.map), bare) < 0);

  const m = townMap(16, 16, true);
  applyTool(m, TOOL.SHRINE, 1, 4); // a wharf shrine
  const sim = makeSim(m, {});
  sim.ordinances.harborTithes = true;
  // Harbor Tithes (+4) and a wharf shrine (+3) beat the base hunger (~2 at low dread): Dagon rises.
  assert.ok(favorDelta(GOD.DAGON, surveyTown(m), sim) > 0);
});

test('Yog-Sothoth is appeased only by the university', () => {
  const m = townMap();
  const sim = makeSim(m, {});
  assert.ok(favorDelta(GOD.YOG, surveyTown(m), sim) < 0, 'no campus: Yog is neglected');
  applyTool(m, TOOL.UNIVERSITY, 8, 8);
  assert.ok(favorDelta(GOD.YOG, surveyTown(m), sim) > 0, 'the university appeases Yog');
});

test('Cthulhu can only be delayed, never appeased', () => {
  const m = townMap(16, 16, true);
  // Pile on every holy work; the creep still points down.
  applyTool(m, TOOL.ASYLUM, 4, 4);
  applyTool(m, TOOL.UNIVERSITY, 8, 8);
  applyTool(m, TOOL.SHRINE, 1, 4);
  applyTool(m, TOOL.SHRINE, 12, 12);
  const sim = makeSim(m, {});
  const withWorks = favorDelta(GOD.CTHULHU, surveyTown(m), sim);
  const bare = favorDelta(GOD.CTHULHU, surveyTown(townMap()), makeSim(townMap(), {}));
  assert.ok(withWorks < 0, 'Cthulhu still falls');
  assert.ok(withWorks > bare, 'but the works slow the fall');
});

test('high dread deepens the gods hunger', () => {
  const calm = makeSim(townMap(), { dread: 5 });
  const dire = makeSim(townMap(), { dread: 80 });
  const s = surveyTown(calm.map);
  assert.ok(favorDelta(GOD.NYARLATHOTEP, s, dire) < favorDelta(GOD.NYARLATHOTEP, s, calm));
});

test('stepFavor decays the tracks and flags a track that hits the floor', () => {
  const sim = makeSim(townMap(), { dread: 40 });
  const before = { ...sim.favor };
  const fired = stepFavor(sim);
  for (const g of GOD_LIST) assert.ok(sim.favor[g] < before[g], `${g} decayed`);
  assert.equal(fired.length, 0, 'no wrath from a single step at full favor');

  // Drive one track to the floor and confirm it is flagged.
  sim.favor.shub = 0.5;
  const fired2 = stepFavor(sim);
  assert.ok(fired2.includes(GOD.SHUB), 'a floored track fires');
});

test('favor never leaves [0, 100]', () => {
  const m = townMap(16, 16, true);
  applyTool(m, TOOL.SHRINE, 1, 4);
  const sim = makeSim(m, {});
  sim.ordinances.harborTithes = true;
  sim.favor.dagon = 99;
  for (let i = 0; i < 30; i++) stepFavor(sim);
  for (const g of GOD_LIST) {
    assert.ok(sim.favor[g] >= 0 && sim.favor[g] <= FAVOR_MAX, `${g}=${sim.favor[g]} in range`);
  }
});

test('the sim steps favor each month', () => {
  const sim = makeSim(townMap(), { dread: 30 });
  const before = sim.favor.yog;
  sim.step();
  assert.ok(sim.favor.yog < before, 'stepping the sim decays favor');
  assert.ok(Array.isArray(sim.pendingWrath));
});

// --- the wrath forecast ritual (M7) --------------------------------------------------------

test('favor stages progress from calm to dire as a track sinks', () => {
  assert.equal(favorStage(70), FAVOR_STAGE.CALM);
  assert.equal(favorStage(55), FAVOR_STAGE.CALM);
  assert.equal(favorStage(50), FAVOR_STAGE.UNEASY);
  assert.equal(favorStage(31), FAVOR_STAGE.UNEASY);
  assert.equal(favorStage(30), FAVOR_STAGE.OMEN);
  assert.equal(favorStage(13), FAVOR_STAGE.OMEN);
  assert.equal(favorStage(12), FAVOR_STAGE.DIRE);
  assert.equal(favorStage(0), FAVOR_STAGE.DIRE);
});

test('danger fraction is 0 above the uneasy line and 1 at the floor', () => {
  assert.equal(dangerFraction(60), 0);
  assert.equal(dangerFraction(50), 0);
  assert.equal(dangerFraction(0), 1);
  assert.ok(dangerFraction(25) > 0 && dangerFraction(25) < 1);
});

test('a fresh town has no omens (the player is not warned before there is danger)', () => {
  const sim = makeSim(townMap(), {});
  const fc = wrathForecast(sim);
  assert.equal(fc.omens.length, 0);
  assert.equal(fc.omenLine, null);
  assert.equal(fc.gods.length, GOD_LIST.length);
});

test('an omen surfaces a herald line before the wrath, worst god first', () => {
  const sim = makeSim(townMap(), {});
  sim.favor.dagon = 25; // omen stage
  sim.favor.shub = 8; // dire stage: more urgent, should sort first and drive the omen line
  const fc = wrathForecast(sim);
  assert.equal(fc.worst.god, 'shub');
  assert.equal(fc.gods[0].god, 'shub');
  assert.equal(fc.omens.length, 2);
  assert.equal(fc.omenLine, GOD_INFO.shub.dire);
  const dagonReading = fc.gods.find((g) => g.god === 'dagon');
  assert.equal(dagonReading.herald, GOD_INFO.dagon.omen);
});

test('every god names an omen and a dire herald line', () => {
  for (const g of GOD_LIST) {
    assert.ok(GOD_INFO[g].omen, `${g} names an omen`);
    assert.ok(GOD_INFO[g].dire, `${g} names a dire warning`);
  }
});
