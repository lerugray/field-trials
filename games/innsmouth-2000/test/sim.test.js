import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GameMap, TERRAIN } from '../src/mapgen.js';
import { TOOL, applyTool, STRUCTURE_INFO } from '../src/tools.js';
import { makeSim, computeDemand, computeBudget, classFor, CLASS, SPEED, SPEED_MS, effectiveTickMs, MAX_LEVEL, explainLot } from '../src/sim.js';
import { serializeSave, deserializeSave } from '../src/save.js';

// A flat grass map with a road row and helpers to zone lots.
function townMap(cols = 8, rows = 8) {
  const m = new GameMap(cols, rows);
  for (let i = 0; i < cols * rows; i++) {
    m.tiles[i] = { terrain: TERRAIN.GRASS, elevation: 1, object: null, zone: null, building: null, structure: null };
  }
  return m;
}

function stepN(sim, n) { for (let i = 0; i < n; i++) sim.step(); return sim; }

test('the calendar advances one month per step and rolls the year', () => {
  const sim = makeSim(townMap(), { year: 1927, month: 0 });
  assert.equal(sim.formatDate(), 'January 1927');
  sim.step();
  assert.equal(sim.formatDate(), 'February 1927');
  stepN(sim, 11);
  assert.equal(sim.formatDate(), 'January 1928');
});

test('a road-connected residential lot grows a population', () => {
  const m = townMap();
  for (let c = 1; c <= 6; c++) applyTool(m, TOOL.ROAD, c, 3);
  applyTool(m, TOOL.ZONE_R, 2, 2);
  applyTool(m, TOOL.ZONE_R, 4, 2);
  const sim = makeSim(m, { seed: 'grow' });
  stepN(sim, 50);
  assert.ok(sim.totalPopulation() > 0, 'connected residential should populate');
  assert.ok(sim.counts.residential > 0);
});

test('a residential lot with no road never develops', () => {
  const m = townMap();
  applyTool(m, TOOL.ZONE_R, 2, 2); // no roads anywhere
  const sim = makeSim(m, { seed: 'noroad' });
  stepN(sim, 80);
  assert.equal(sim.totalPopulation(), 0);
  assert.equal(m.tileAt(2, 2).building, null);
});

test('building levels never exceed the tier cap', () => {
  const m = townMap();
  for (let c = 1; c <= 6; c++) applyTool(m, TOOL.ROAD, c, 3);
  for (let c = 1; c <= 6; c++) applyTool(m, TOOL.ZONE_R, c, 2);
  const sim = makeSim(m, { seed: 'cap' });
  stepN(sim, 200);
  for (let c = 1; c <= 6; c++) {
    const b = m.tileAt(c, 2).building;
    if (b) assert.ok(b.level >= 1 && b.level <= MAX_LEVEL, `level ${b.level} out of range`);
  }
});

test('the simulation is deterministic for the same seed and layout', () => {
  const build = () => {
    const m = townMap();
    for (let c = 1; c <= 6; c++) applyTool(m, TOOL.ROAD, c, 3);
    for (let c = 1; c <= 6; c++) applyTool(m, TOOL.ZONE_R, c, 2);
    applyTool(m, TOOL.ZONE_I, 1, 5);
    return m;
  };
  const a = makeSim(build(), { seed: 'det' });
  const b = makeSim(build(), { seed: 'det' });
  stepN(a, 60);
  stepN(b, 60);
  assert.deepEqual(a.pop, b.pop);
  assert.equal(a.dread, b.dread);
  assert.deepEqual(a.counts, b.counts);
});

test('waterfront lots draw Deep Ones once dread rises', () => {
  const m = townMap();
  // Water column at col 0; a road and residential lots beside it.
  for (let r = 0; r < m.rows; r++) m.tileAt(0, r).terrain = TERRAIN.DEEP;
  for (let r = 1; r <= 6; r++) applyTool(m, TOOL.ROAD, 2, r);
  applyTool(m, TOOL.ZONE_R, 1, 2); // adjacent to the water column and the road
  const sim = makeSim(m, { seed: 'deep', dreadBase: 60 });
  stepN(sim, 40);
  assert.ok(sim.pop.deepone > 0, 'waterfront + high dread should host Deep Ones');
  assert.equal(sim.pop.cultist, 0);
});

test('high dread inland turns the Unwary into Cultists', () => {
  const m = townMap();
  for (let c = 1; c <= 6; c++) applyTool(m, TOOL.ROAD, c, 3);
  applyTool(m, TOOL.ZONE_R, 4, 5); // inland, away from any water
  const sim = makeSim(m, { seed: 'cult', dreadBase: 70 });
  stepN(sim, 40);
  assert.ok(sim.pop.cultist > 0);
  assert.equal(sim.pop.deepone, 0);
});

test('low dread keeps residents Unwary', () => {
  const m = townMap();
  for (let c = 1; c <= 6; c++) applyTool(m, TOOL.ROAD, c, 3);
  applyTool(m, TOOL.ZONE_R, 4, 2);
  const sim = makeSim(m, { seed: 'unwary', dread: 5 });
  stepN(sim, 30);
  assert.ok(sim.pop.unwary > 0);
  assert.equal(sim.pop.cultist, 0);
  assert.equal(sim.pop.deepone, 0);
});

test('industry pushes the dread meter up over time', () => {
  const m = townMap();
  for (let c = 1; c <= 6; c++) applyTool(m, TOOL.ROAD, c, 3);
  for (let c = 1; c <= 6; c++) applyTool(m, TOOL.ZONE_I, c, 5);
  const sim = makeSim(m, { seed: 'ind', dread: 8 });
  const before = sim.dread;
  stepN(sim, 60);
  assert.ok(sim.dread > before + 2, `dread should climb with industry (was ${before}, now ${sim.dread})`);
  assert.ok(sim.counts.industrial > 0);
});

test('classFor honours waterfront and dread thresholds', () => {
  const m = townMap();
  m.tileAt(0, 2).terrain = TERRAIN.SHALLOW;
  const sim = makeSim(m, {});
  sim.dread = 60;
  assert.equal(classFor(sim, 1, 2), CLASS.DEEP_ONE); // waterfront + high dread
  assert.equal(classFor(sim, 5, 5), CLASS.CULTIST); // inland + high dread
  sim.dread = 10;
  assert.equal(classFor(sim, 5, 5), CLASS.UNWARY); // low dread inland
});

test('computeDemand returns sane in-range values', () => {
  const sim = makeSim(townMap(), {});
  const d = computeDemand(sim);
  for (const v of Object.values(d)) assert.ok(v >= 0 && v <= 1);
});

test('power lets lots climb past the first tier; unpowered lots cap at tier 1', () => {
  const build = (withPower) => {
    const m = townMap(10, 10);
    for (let c = 1; c <= 6; c++) applyTool(m, TOOL.ROAD, c, 3);
    for (let c = 1; c <= 6; c++) applyTool(m, TOOL.ZONE_R, c, 2);
    // Both towns are watered from a well house on a main below the road (M-a made water a second
    // growth gate), so power stays the single variable this test measures.
    applyTool(m, TOOL.WELLHOUSE, 0, 4);
    for (let c = 1; c <= 6; c++) applyTool(m, TOOL.PIPE, c, 4);
    if (withPower) {
      applyTool(m, TOOL.GASWORKS, 1, 1);
      for (let c = 2; c <= 6; c++) applyTool(m, TOOL.POWERLINE, c, 1);
    }
    const sim = makeSim(m, { seed: 'pow' });
    stepN(sim, 120);
    let max = 0;
    for (let c = 1; c <= 6; c++) {
      const b = sim.map.tileAt(c, 2).building;
      if (b) max = Math.max(max, b.level);
    }
    return { sim, max };
  };
  const dark = build(false);
  const lit = build(true);
  assert.ok(dark.sim.totalPopulation() > 0, 'unpowered lots still put up first-tier homes');
  assert.equal(dark.max, 1, 'but never climb past tier 1 without power');
  assert.ok(lit.max > 1, 'powered lots climb higher');
});

test('a chapel eases the dread meter and a shrine raises it', () => {
  const meter = (tool) => {
    const m = townMap(14, 14);
    if (tool) applyTool(m, tool, 6, 6);
    const sim = makeSim(m, { seed: 'd', dread: 30, dreadBase: 30 });
    stepN(sim, 40);
    return sim.dread;
  };
  const base = meter(null);
  assert.ok(meter(TOOL.CHAPEL) < base - 1, 'chapel presses dread down');
  assert.ok(meter(TOOL.SHRINE) > base + 1, 'shrine presses dread up');
});

test('a shrine draws Cultists where a matching chapel holds the Unwary', () => {
  const m = townMap(18, 18);
  applyTool(m, TOOL.SHRINE, 8, 8);
  const sim = makeSim(m, {});
  sim.dread = 25; // below the ambient Cultist threshold of 50
  assert.equal(classFor(sim, 9, 8), CLASS.CULTIST, 'the shrine converts at low dread');
  applyTool(m, TOOL.CHAPEL, 10, 8); // its radius also reaches (9,8)
  assert.equal(classFor(sim, 9, 8), CLASS.UNWARY, 'a matching chapel holds the Old Faith');
});

test('structure upkeep shows in the monthly budget', () => {
  const m = townMap(8, 8);
  applyTool(m, TOOL.CONSTABULARY, 4, 4);
  const sim = makeSim(m, {});
  sim.step();
  const b = computeBudget(sim);
  assert.equal(b.lines.services, STRUCTURE_INFO.constabulary.upkeep);
  assert.ok(b.expenses >= STRUCTURE_INFO.constabulary.upkeep);
});

test('speed control and speed table', () => {
  const sim = makeSim(townMap(), {});
  assert.equal(sim.speed, SPEED.PAUSED);
  sim.setSpeed(SPEED.FAST);
  assert.equal(sim.speed, SPEED.FAST);
  assert.equal(SPEED_MS[SPEED.PAUSED], Infinity);
  assert.ok(SPEED_MS[SPEED.FAST] < SPEED_MS[SPEED.SLOW]);
});

test('the finer CREEP speed is the slowest running step (M9)', () => {
  assert.ok(SPEED_MS[SPEED.CREEP] > SPEED_MS[SPEED.SLOW], 'creep is slower than slow');
  assert.ok(Number.isFinite(SPEED_MS[SPEED.CREEP]), 'but still a running speed, not a pause');
  const sim = makeSim(townMap(), {});
  sim.setSpeed(SPEED.CREEP);
  assert.equal(sim.speed, SPEED.CREEP, 'the sim accepts the creep speed');
});

test('disaster auto-slow holds a fast clock back to no faster than SLOW while a wrath is loose (M9)', () => {
  // No disaster: the chosen speed runs at its own rate.
  assert.equal(effectiveTickMs(SPEED.FAST, false, true), SPEED_MS[SPEED.FAST]);
  // A wrath loose, auto-slow on: FAST and MEDIUM are held back to SLOW's interval.
  assert.equal(effectiveTickMs(SPEED.FAST, true, true), SPEED_MS[SPEED.SLOW]);
  assert.equal(effectiveTickMs(SPEED.MEDIUM, true, true), SPEED_MS[SPEED.SLOW]);
  // An already-slower speed is never sped up; SLOW and CREEP keep their own rate.
  assert.equal(effectiveTickMs(SPEED.SLOW, true, true), SPEED_MS[SPEED.SLOW]);
  assert.equal(effectiveTickMs(SPEED.CREEP, true, true), SPEED_MS[SPEED.CREEP]);
  // Auto-slow off: a wrath does not touch the clock.
  assert.equal(effectiveTickMs(SPEED.FAST, true, false), SPEED_MS[SPEED.FAST]);
  // Paused stays paused regardless.
  assert.equal(effectiveTickMs(SPEED.PAUSED, true, true), Infinity);
});

test('auto-slow is on by default and survives a save/load round-trip (M9)', () => {
  const sim = makeSim(townMap(), {});
  assert.equal(sim.autoSlow, true);
  sim.autoSlow = false;
  const reloaded = deserializeSave(serializeSave(sim));
  assert.equal(reloaded.autoSlow, false, 'the auto-slow choice round-trips');
});

// --- the query "why" diagnostics (M7) ------------------------------------------------------

test('explainLot names why a zoned lot stalls without a road', () => {
  const m = townMap(8, 8);
  applyTool(m, TOOL.ZONE_R, 4, 4); // zoned, but no road anywhere
  const sim = makeSim(m, {});
  const why = explainLot(sim, 4, 4);
  assert.ok(why.some((l) => /no road/i.test(l)), why.join(' | '));
});

test('explainLot reports a built lot as growing or fully built', () => {
  const m = townMap(8, 8);
  applyTool(m, TOOL.ROAD, 3, 4);
  applyTool(m, TOOL.ZONE_R, 4, 4);
  const sim = makeSim(m, {});
  for (let i = 0; i < 40; i++) sim.step(); // grow it (unpowered -> caps at tier 1)
  const why = explainLot(sim, 4, 4);
  assert.ok(why.length > 0);
  // Unpowered, so it should note the missing grid and a resident-class reason.
  assert.ok(why.some((l) => /power/i.test(l)), why.join(' | '));
  assert.ok(why.some((l) => /Unwary|cult|Deep Ones|Old Faith/i.test(l)), why.join(' | '));
});

test('explainLot is empty for unzoned ground', () => {
  const sim = makeSim(townMap(8, 8), {});
  assert.deepEqual(explainLot(sim, 1, 1), []);
});

// --- The Innsmouth Courier event log (M7) --------------------------------------------------

test('a summoned wrath files a front-page headline', () => {
  const m = townMap(12, 12);
  for (let c = 1; c <= 6; c++) applyTool(m, TOOL.ROAD, c, 3);
  applyTool(m, TOOL.ZONE_R, 4, 2);
  const sim = makeSim(m, { seed: 'news' });
  for (let i = 0; i < 10; i++) sim.step();
  const before = sim.events.length;
  sim.summonWrath('shub');
  assert.equal(sim.events.length, before + 1);
  const ev = sim.events[sim.events.length - 1];
  assert.equal(ev.kind, 'wrath');
  assert.ok(ev.headline && ev.headline === ev.headline.toUpperCase(), 'a headline in broadsheet caps');
  assert.ok(ev.sub);
});

test('a population milestone files a growth headline', () => {
  const m = townMap(16, 16);
  for (let c = 1; c <= 12; c++) applyTool(m, TOOL.ROAD, c, 3);
  for (let c = 1; c <= 12; c++) { applyTool(m, TOOL.ZONE_R, c, 2); applyTool(m, TOOL.ZONE_R, c, 4); }
  const sim = makeSim(m, { seed: 'milestone' });
  for (let i = 0; i < 60; i++) sim.step();
  assert.ok(sim.totalPopulation() >= 50, 'the town crosses the first milestone');
  assert.ok(sim.events.some((e) => e.kind === 'growth' && /50 SOULS/.test(e.headline)), 'files the 50-souls headline');
});

test('a god sliding into the omen stage files an omen headline', () => {
  const sim = makeSim(townMap(8, 8), { dread: 40 });
  sim.favor.yog = 32; // one step of decay drops it past the omen threshold (30)
  for (let i = 0; i < 3 && !sim.events.some((e) => e.kind === 'omen'); i++) sim.step();
  assert.ok(sim.events.some((e) => e.kind === 'omen'), 'the Courier warns of the omen');
});

// --- first-contact onboarding (M7) ---------------------------------------------------------

test('onboarding hints fire once, tied to the first shrine and class shifts', () => {
  const m = townMap(16, 16);
  for (let c = 1; c <= 10; c++) applyTool(m, TOOL.ROAD, c, 3);
  applyTool(m, TOOL.ZONE_R, 5, 5); // inland
  applyTool(m, TOOL.SHRINE, 5, 4); // a shrine near the lot
  const sim = makeSim(m, { seed: 'onboard', dreadBase: 60, dread: 60 });
  for (let i = 0; i < 40; i++) sim.step();
  assert.ok(sim.onboarded.shrine, 'the shrine prompt fired');
  assert.ok(sim.hints.length > 0, 'at least one hint was queued');
  // A shrine hint appears exactly once even across many months.
  const shrineHits = sim.hints.filter((h) => /shrine/i.test(h)).length;
  assert.ok(shrineHits <= 1, 'the shrine prompt does not repeat');
});

test('a calm empty town raises no onboarding prompts', () => {
  const sim = makeSim(townMap(8, 8), { dread: 5, dreadBase: 5 });
  for (let i = 0; i < 20; i++) sim.step();
  assert.equal(sim.hints.length, 0);
});

// --- the Cthulhu doom clock (M8) ---------------------------------------------------------

import { DOOM_AWAKENINGS, cthulhuRecovery } from '../src/gods.js';

function builtTown(seed = 'doom') {
  const m = townMap(10, 10);
  for (let c = 1; c <= 8; c++) applyTool(m, TOOL.ROAD, c, 4);
  for (let c = 1; c <= 8; c++) { applyTool(m, TOOL.ZONE_R, c, 3); applyTool(m, TOOL.ZONE_C, c, 5); }
  const sim = makeSim(m, { seed });
  stepN(sim, 30);
  return sim;
}

test('cthulhu recovery shrinks with each Awakening (the clock tightens)', () => {
  assert.ok(cthulhuRecovery(1) > cthulhuRecovery(2), '2nd recovers less than 1st');
  assert.ok(cthulhuRecovery(2) > cthulhuRecovery(3), '3rd recovers less than 2nd');
  const sim = builtTown();
  sim.summonWrath('cthulhu'); const r1 = sim.favor.cthulhu;
  sim.summonWrath('cthulhu'); const r2 = sim.favor.cthulhu;
  assert.ok(r2 < r1, `favor recovers less after the 2nd Awakening (${r2} vs ${r1})`);
});

test('the Awakenings culminate in a true end, and the ended sim is frozen', () => {
  const sim = builtTown('end');
  for (let i = 0; i < DOOM_AWAKENINGS; i++) {
    assert.equal(sim.ended, null, 'not ended before the final Awakening');
    sim.summonWrath('cthulhu');
  }
  assert.ok(sim.ended, 'the town is lost after the doom-th Awakening');
  assert.equal(sim.ended.kind, 'doom');
  assert.equal(sim.awakenings, DOOM_AWAKENINGS);
  // The world is still: step() is a no-op and no further wrath can be loosed.
  const tick = sim.tick; const dread = sim.dread;
  sim.step();
  assert.equal(sim.tick, tick, 'step is frozen after the end');
  assert.equal(sim.dread, dread);
  assert.equal(sim.summonWrath('dagon'), null, 'nothing more can be loosed');
});

test('the town endures: survival milestones fire from years survived', () => {
  const sim = builtTown('survive');
  assert.ok(!sim.survivalNoted[25]);
  sim.year = sim.foundedYear + 25;
  sim.step();
  assert.equal(sim.survivalNoted[25], true);
  assert.ok(sim.events.some((e) => e.kind === 'survival' && /25 YEARS/.test(e.headline)),
    'the Courier files the survival milestone');
});

// --- Scholars wired to the university (M8) ------------------------------------------------

import { EXPOSURE_MIN_SCHOLARS } from '../src/sim.js';

function campusTown(seed = 'campus', dreadBase = 6) {
  const m = townMap(14, 14);
  applyTool(m, TOOL.UNIVERSITY, 6, 6);
  for (let c = 2; c <= 10; c++) applyTool(m, TOOL.ROAD, c, 5);
  for (let c = 2; c <= 10; c++) applyTool(m, TOOL.ZONE_R, c, 4); // within the campus radius
  const sim = makeSim(m, { seed, dreadBase });
  stepN(sim, 50);
  return sim;
}

test('the university draws Scholars to a low-dread campus', () => {
  const sim = campusTown();
  assert.ok(sim.pop.scholar > 0, 'a campus should populate with Scholars');
  assert.equal(classFor(sim, 4, 4), CLASS.SCHOLAR, 'a covered residential lot is Scholar');
  const why = explainLot(sim, 4, 4).join(' ');
  assert.match(why, /Scholars/, 'the query explains the Scholar draw');
});

test('a dread-soaked campus risks Exposure events', () => {
  const sim = campusTown('expose', 55); // mid dread: Scholars still settle, but the delving turns
  assert.ok(sim.pop.scholar >= EXPOSURE_MIN_SCHOLARS, 'a big enough campus to loose something');
  // Exposure is a rare, dramatic beat (retuned in M8.12); over a long stretch it must still occur.
  let fired = sim.events.some((e) => e.kind === 'exposure');
  for (let i = 0; i < 400 && !fired; i++) { sim.step(); if (sim.events.some((e) => e.kind === 'exposure')) fired = true; }
  assert.ok(fired, 'an Exposure eventually fires on a large, dread-soaked campus');
});

test('no Scholars means no Exposure (and no dead class)', () => {
  const m = townMap();
  for (let c = 1; c <= 6; c++) applyTool(m, TOOL.ROAD, c, 3);
  for (let c = 1; c <= 6; c++) applyTool(m, TOOL.ZONE_R, c, 2);
  const sim = makeSim(m, { seed: 'noscholar' });
  stepN(sim, 40);
  assert.equal(sim.pop.scholar, 0, 'no university, no Scholars');
  assert.ok(!sim.events.some((e) => e.kind === 'exposure'));
});

// --- multi-god collision: two wraths due the same month (M8) ------------------------------

test('two gods flooring the same month both loose their wrath (none lost to the single slot)', () => {
  const m = townMap(12, 12);
  for (let r = 0; r < 12; r++) m.tileAt(0, r).terrain = TERRAIN.SHALLOW; // a shore for the Flood Tide
  for (let c = 2; c <= 9; c++) applyTool(m, TOOL.ROAD, c, 6);
  for (let c = 2; c <= 9; c++) { applyTool(m, TOOL.ZONE_R, c, 5); applyTool(m, TOOL.ZONE_R, c, 7); }
  const sim = makeSim(m, { seed: 'collide', wrath: true });
  stepN(sim, 20);
  // Force Dagon and Shub to the floor the same month; keep the other three safe from wrath.
  sim.favor.dagon = 0.1; sim.favor.shub = 0.1;
  sim.favor.cthulhu = 95; sim.favor.nyarlathotep = 95; sim.favor.yog = 95;
  const headlines = new Set();
  for (let i = 0; i < 40; i++) {
    sim.step();
    for (const e of sim.events) if (e.kind === 'wrath') headlines.add(e.headline);
  }
  assert.ok(headlines.has('THE TIDE TAKES THE LOWER WARD'), 'Dagon\'s Flood Tide fired');
  assert.ok(headlines.has('UNNATURAL GROWTH CHOKES THE LANES'), 'Shub\'s Greening fired too, not lost');
});

// --- town titles (M8 genre checklist) ----------------------------------------------------

import { townTitle, TOWN_TITLES } from '../src/sim.js';

test('the town earns a growing title by population', () => {
  assert.equal(townTitle(0), 'Landing');
  assert.equal(townTitle(49), 'Landing');
  assert.equal(townTitle(50), 'Hamlet');
  assert.equal(townTitle(200), 'Village');
  assert.equal(townTitle(500), 'Town');
  assert.equal(townTitle(1500), 'Port');
  assert.equal(townTitle(9999), 'City');
  // Monotonic, and every rung has a plain one-word title.
  let last = -1;
  for (const s of TOWN_TITLES) { assert.ok(s.at > last); last = s.at; assert.match(s.title, /^[A-Z][a-z]+$/); }
});
