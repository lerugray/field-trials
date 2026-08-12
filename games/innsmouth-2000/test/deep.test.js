// The Deep Ones layer (M-b): Deep Presence, contamination, and what the deep does about the town.
//
// The spec's own "Testable" list for M-b is the spine of this file: taint spreads along connected
// pipes only, valves isolate contamination, a filter house reduces taint, low pressure increases the
// spread, and the scenario pressure scaling works. Everything else here holds a rule the spec states
// in prose (the intake risk by ground, the sabotage, the backflow, the seepage bridge to the
// Greening, Dagon's ratified reading) so a tuning pass cannot quietly invert one.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GameMap, TERRAIN } from '../src/mapgen.js';
import {
  TOOL, VIEW, applyTool, canApply, taintOf, setTaint, qualityFor, QUALITY,
  TAINT_AT, componentTilesFrom, toolCostAt, valveState, flushStrength,
} from '../src/tools.js';
import { computePower } from '../src/power.js';
import { computeWater, PRESSURE, qualityAt } from '../src/water.js';
import { computeAquifer, SUBSTRATE } from '../src/aquifer.js';
import { makeSim, MAX_LEVEL, SEAL_DAGON_COST, explainLot } from '../src/sim.js';
import { canGreeningTakeHold } from '../src/disasters.js';
import { DIRE_AT, OMEN_AT } from '../src/gods.js';
import {
  stepDeep, presenceDelta, presenceStage, presenceAt, intakeRisk, explainDeep, deepAdvice,
  spikePresenceFrom, PRESENCE_STAGE, PRESENCE_AT, PRESENCE_MAX, PRESENCE_RATE, PRESENCE_SIGN,
  INTAKE_RISK, SPREAD_MIN, NEWS_COOLDOWN, intakeCeiling, INTAKE_BRINE_CEILING,
} from '../src/deep.js';

// A coast with the water on the west and the land climbing east. Elevation stays low enough near the
// shore for fissures and high enough inland for sweet ground.
function coast(cols = 26, rows = 10) {
  const m = new GameMap(cols, rows);
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      let terrain = TERRAIN.GRASS;
      let elevation = Math.min(3, Math.max(0, col - 2));
      if (col === 0) { terrain = TERRAIN.DEEP; elevation = 0; }
      else if (col === 1) { terrain = TERRAIN.SHALLOW; elevation = 0; }
      else if (col === 2) { terrain = TERRAIN.BEACH; elevation = 0; }
      m.tiles[m.index(col, row)] = {
        terrain, elevation, object: null, zone: null, building: null,
        structure: null, scar: null, pipe: null,
      };
    }
  }
  return m;
}

// A town with one main and one source, positioned by the caller. Returns the sim, already stepped
// once so the aquifer, the water state, and sim.deep all exist.
function watered(opts = {}) {
  const map = coast(opts.cols, opts.rows);
  const sim = makeSim(map, {
    seed: opts.seed || 'deep-test',
    aquifer: opts.aquifer || { brackishReach: 3, fissureReach: 1, fissureRate: 0 },
    deepStart: opts.deepStart ?? 0,
    deepPace: opts.deepPace,
    deepGrace: opts.deepGrace,
    ...opts.sim,
  });
  if (opts.lay) opts.lay(map, sim);
  sim.step();
  return { map, sim };
}

// Lay a run of main along a row.
function main(map, row, from, to) {
  for (let col = from; col <= to; col++) applyTool(map, TOOL.PIPE, col, row);
}

const taintsOf = (map, tiles) => tiles.map((i) => Math.round(taintOf(map.tiles[i])));

// --- Deep Presence ---------------------------------------------------------------------------

test('presence stages read off the value, and each has a sign the player is shown instead', () => {
  assert.equal(presenceStage(0), PRESENCE_STAGE.DORMANT);
  assert.equal(presenceStage(PRESENCE_AT.stirring), PRESENCE_STAGE.STIRRING);
  assert.equal(presenceStage(PRESENCE_AT.present), PRESENCE_STAGE.PRESENT);
  assert.equal(presenceStage(PRESENCE_AT.teeming), PRESENCE_STAGE.TEEMING);
  assert.equal(presenceStage(PRESENCE_MAX), PRESENCE_STAGE.TEEMING);
  for (const stage of Object.values(PRESENCE_STAGE)) {
    const sign = PRESENCE_SIGN[stage];
    assert.ok(sign && sign.length > 10, `${stage} has no sign`);
    assert.ok(!/—/.test(sign), `${stage}: em-dash in player-facing text`);
    assert.ok(!/\d/.test(sign), `${stage}: the sign gives a number away (${sign})`);
  }
});

test('an open fissure raises presence and a sealed one lowers it', () => {
  const sim = { dread: 0, pop: { deepone: 0 }, favor: { dagon: 60 }, counts: {}, servicesCut: false };
  const survey = { cleanShare: 0, filters: 0 };
  const base = { seaConnected: true, openFissures: 0, sealedFissures: 0 };
  const local = { foulMains: 0 };
  const none = presenceDelta(sim, base, local, survey);
  const oneMouth = presenceDelta(sim, { ...base, openFissures: 1 }, local, survey);
  const sealed = presenceDelta(sim, { ...base, sealedFissures: 2 }, local, survey);
  assert.ok(oneMouth > none, 'an open fissure is a door');
  assert.equal(Math.round((oneMouth - none) * 1000) / 1000, PRESENCE_RATE.PER_MOUTH);
  assert.ok(sealed < none, 'a capped fissure is a door shut');
  // And the mouths cap, so a fissured shore cannot run away with it (anti-goal 2).
  const many = presenceDelta(sim, { ...base, openFissures: 50 }, local, survey);
  const atCap = presenceDelta(sim, { ...base, openFissures: PRESENCE_RATE.MOUTH_CAP }, local, survey);
  assert.equal(many, atCap, 'past the cap, more mouths add nothing');
});

test('a region with no road to the sea only ever fades', () => {
  const sim = { dread: 90, pop: { deepone: 400 }, favor: { dagon: 0 }, counts: {}, servicesCut: false };
  const delta = presenceDelta(sim, { seaConnected: false, openFissures: 4, sealedFissures: 0 },
    { foulMains: 9 }, { cleanShare: 0, filters: 0 });
  assert.equal(delta, -PRESENCE_RATE.FADE,
    'high dread, a foul network and an angry Dagon cannot fill a pocket the sea cannot reach');
});

test('Dagon neglected presses the deep in; Dagon content only eases it, and never empties it', () => {
  const base = { seaConnected: true, openFissures: 1, sealedFissures: 0 };
  const local = { foulMains: 0 };
  const survey = { cleanShare: 0, filters: 0 };
  const at = (dagon) => presenceDelta(
    { dread: 20, pop: { deepone: 0 }, favor: { dagon }, counts: {}, servicesCut: false },
    base, local, survey,
  );
  const dire = at(DIRE_AT);
  const omen = at(OMEN_AT);
  const uneasy = at(60);
  const content = at(PRESENCE_RATE.DAGON_CALM_AT + 10);
  assert.ok(dire > omen, 'a god about to break loose presses hardest');
  assert.ok(omen > uneasy, 'and an omen presses harder than mere unease');
  assert.ok(content < uneasy, 'an orderly pact eases the pressure');
  // The ratified reading: high favor does NOT mean no Deep Ones. It must not drive presence to a
  // floor on its own; the town still has to seal, filter, and source cleanly.
  assert.ok(content > -PRESENCE_RATE.FADE,
    'high Dagon favor alone should not empty the void, only stop the pushing');
});

test('the town own works press back: filters, civic works, and clean sourcing', () => {
  const base = { seaConnected: true, openFissures: 2, sealedFissures: 0 };
  const local = { foulMains: 0 };
  const bare = { dread: 20, pop: { deepone: 0 }, favor: { dagon: 60 }, counts: {}, servicesCut: false };
  const nothing = presenceDelta(bare, base, local, { cleanShare: 0, filters: 0 });
  assert.ok(presenceDelta(bare, base, local, { cleanShare: 0, filters: 2 }) < nothing, 'filter houses');
  assert.ok(presenceDelta(bare, base, local, { cleanShare: 1, filters: 0 }) < nothing, 'sweet sourcing');
  const civic = { ...bare, counts: { chapel: 1, asylum: 1, constabulary: 1 } };
  assert.ok(presenceDelta(civic, base, local, { cleanShare: 0, filters: 0 }) < nothing, 'civic works');
  // An insolvent town has stopped paying for all of it.
  const cut = { ...civic, servicesCut: true };
  assert.ok(
    presenceDelta(cut, base, local, { cleanShare: 0, filters: 3 })
    > presenceDelta(civic, base, local, { cleanShare: 0, filters: 3 }),
    'unfunded filter houses and constables stop pressing back',
  );
  // A main left foul over the region is an invitation.
  assert.ok(presenceDelta(bare, base, { foulMains: 5 }, { cleanShare: 0, filters: 0 }) > nothing);
});

test('presence accumulates month over month and clamps at both ends', () => {
  const { sim } = watered({ deepStart: 0, aquifer: { brackishReach: 3, fissureReach: 1, fissureRate: 1 } });
  const region = sim.deep.regions.find((r) => r.seaConnected);
  assert.ok(region, 'the coast raises a sea-connected region');
  const first = region.presence;
  for (let i = 0; i < 6; i++) sim.step();
  const later = sim.deep.regions.find((r) => r.id === region.id) || sim.deep.regions[0];
  assert.ok(later.presence > first, `presence should climb (${first} -> ${later.presence})`);
  for (let i = 0; i < 400; i++) sim.step();
  for (const r of sim.deep.regions) {
    assert.ok(r.presence >= 0 && r.presence <= PRESENCE_MAX, `presence out of range: ${r.presence}`);
  }
});

test('a flood spike carries into the region the water reached', () => {
  const { map, sim } = watered({ deepStart: 0 });
  const region = sim.deep.regions.find((r) => r.seaConnected);
  const before = region.presence;
  spikePresenceFrom(sim, [map.index(2, 4)], 30);
  sim.step();
  const after = (sim.deep.regions.find((r) => r.id === region.id) || sim.deep.regions[0]).presence;
  assert.ok(after > before + 20, `the spike should land (${before} -> ${after})`);
  spikePresenceFrom(sim, [], 30); // and an empty flood is a no-op
  spikePresenceFrom(sim, null, 30);
});

// The ledger is keyed by tile index precisely so a region that changes shape keeps its reading.
test('presence survives the region it lives in changing shape', () => {
  const { map, sim } = watered({ deepStart: 0 });
  const summary = sim.deep.regions.find((r) => r.seaConnected);
  const region = sim.aquifer.regions.find((r) => r.id === summary.id);
  // Write a high reading onto one of its tiles, as a flood would. (The tile ARRAY lives on the
  // aquifer's regions; the deep's summary carries only a tileCount.)
  assert.ok(Array.isArray(region.tiles) && region.tiles.length > 1);
  sim.presence[region.tiles[region.tiles.length - 1]] = 80;
  // Now change the ground so the region is a different shape and has a different anchor.
  map.tileAt(2, 0).terrain = TERRAIN.SHALLOW;
  sim.step();
  const worst = Math.max(...sim.deep.regions.map((r) => r.presence));
  assert.ok(worst >= 75, `the high reading should carry through the reshape, got ${worst}`);
});

// --- the intake -----------------------------------------------------------------------------

test('the ground a works stands in sets its intake risk, and presence adds to it', () => {
  const { map, sim } = watered({
    aquifer: { brackishReach: 3, fissureReach: 1, fissureRate: 1 },
  });
  const freshTile = map.index(20, 5);
  const brackishTile = map.index(3, 5);
  assert.equal(sim.aquifer.substrate[freshTile], SUBSTRATE.FRESH);
  assert.equal(sim.aquifer.substrate[brackishTile], SUBSTRATE.BRACKISH);
  assert.equal(intakeRisk(sim, freshTile), INTAKE_RISK.fresh, 'sweet ground carries no risk at all');
  assert.ok(intakeRisk(sim, brackishTile) >= INTAKE_RISK.brackish, 'brine does');
  const fissure = sim.aquifer.fissures[0];
  assert.ok(intakeRisk(sim, fissure) > intakeRisk(sim, brackishTile), 'and open rock is worse still');
  // Presence pushes it up, and the whole thing stays in [0,1].
  const byTile = new Map([[brackishTile, PRESENCE_MAX]]);
  assert.ok(intakeRisk(sim, brackishTile, byTile) > intakeRisk(sim, brackishTile, new Map()));
  for (const i of [freshTile, brackishTile, fissure]) {
    const v = intakeRisk(sim, i, byTile);
    assert.ok(v >= 0 && v <= 1, `risk out of range at ${i}: ${v}`);
  }
});

test('a well sunk in sweet ground stays sweet for a lifetime (the cure that stays cured)', () => {
  const { map, sim } = watered({
    seed: 'sweet-well',
    lay: (m) => {
      main(m, 5, 18, 22);
      applyTool(m, TOOL.WELLHOUSE, 20, 6);
      applyTool(m, TOOL.PIPE, 20, 6 - 1);
    },
  });
  const well = map.index(20, 6);
  assert.equal(sim.aquifer.substrate[well], SUBSTRATE.FRESH);
  for (let i = 0; i < 240; i++) sim.step();
  assert.equal(taintOf(map.tiles[well]), 0, 'twenty years and the intake is still sweet');
  for (const comp of sim.water.components) {
    assert.equal(comp.quality, QUALITY.CLEAN, `main ${comp.id} went off with no reason to`);
  }
});

// The staging the spec asks for, and anti-goal 4's whole point: brine alone can only make the water
// taste wrong. Tainted and infested need the void beneath to have filled up, so the player always gets
// suspect and then tainted as a warning before anything is lost.
test('brine alone tops out at suspect; only the deep carries an intake past it', () => {
  assert.equal(intakeCeiling(0), INTAKE_BRINE_CEILING);
  assert.equal(qualityFor(intakeCeiling(0)), QUALITY.SUSPECT, 'brine alone tastes wrong, no worse');
  assert.equal(intakeCeiling(PRESENCE_MAX), 100, 'a teeming void can foul it through');
  assert.ok(intakeCeiling(50) > intakeCeiling(20), 'and the ceiling climbs with the presence');
  assert.equal(qualityFor(intakeCeiling(PRESENCE_AT.stirring)), QUALITY.SUSPECT,
    'a void merely stirring still only makes the water taste wrong');
  assert.equal(qualityFor(intakeCeiling(PRESENCE_AT.present)), QUALITY.TAINTED,
    'a void with something in it taints the water');
  assert.equal(qualityFor(intakeCeiling(PRESENCE_AT.teeming)), QUALITY.INFESTED,
    'and a genuinely crowded one puts something living in it');

  // Played out: an intake in brine with nothing beneath it stays merely suspect indefinitely.
  const { map, sim } = watered({
    seed: 'brine-ceiling',
    lay: (m) => {
      main(m, 5, 3, 12);
      applyTool(m, TOOL.PUMPHOUSE, 3, 6);
      applyTool(m, TOOL.PIPE, 3, 6);
    },
  });
  const pump = map.index(3, 6);
  // Hold the void empty (a shore sealed and well tended) and run a long time.
  for (let i = 0; i < 200; i++) {
    for (const k of Object.keys(sim.presence)) sim.presence[k] = 0;
    sim.step();
  }
  assert.equal(qualityFor(taintOf(map.tiles[pump])), QUALITY.SUSPECT,
    `with nothing below, the brine should never get past suspect (${taintOf(map.tiles[pump])})`);
});

// And the filter house is a mitigation, not immunity: it thins over a long main, and it never touches
// the intake, because a filter sits downstream of the works and cannot clean the ground it stands in.
test('a filter house thins over a long main, and never cleanses the intake itself', async () => {
  const { FILTER_REACH } = await import('../src/deep.js');
  const runOf = (from, to) => {
    const { map, sim } = watered({
      seed: 'filter-reach',
      lay: (m) => {
        main(m, 5, from, to);
        applyTool(m, TOOL.FILTERHOUSE, to + 1, 5);
      },
    });
    const probe = map.index(from + 1, 5);
    setTaint(map.tiles[probe], 50);
    sim.step();
    return 50 - taintOf(map.tiles[probe]);
  };
  const short = runOf(14, 14 + 3); // a handful of lengths: well inside one filter's reach
  const long = runOf(4, 4 + FILTER_REACH * 2); // twice its reach
  assert.ok(short > long,
    `one set of sand beds should cleanse a short main harder than a sprawling one (${short} vs ${long})`);

  // The intake is the ground's business, so a filter house on the network must make NO difference to
  // it at all. Measured as a difference between two otherwise identical towns, so the intake's own
  // month (which eases it back toward what the ground and the void can manage) is held constant.
  const intakeAfterAMonth = (withFilter) => {
    const { map, sim } = watered({
      seed: 'filter-not-intake',
      lay: (m) => {
        main(m, 5, 3, 10);
        applyTool(m, TOOL.PUMPHOUSE, 3, 6);
        applyTool(m, TOOL.PIPE, 3, 6);
        if (withFilter) applyTool(m, TOOL.FILTERHOUSE, 11, 5);
      },
    });
    const pump = map.index(3, 6);
    setTaint(map.tiles[pump], 60);
    sim.step();
    return taintOf(map.tiles[pump]);
  };
  assert.equal(intakeAfterAMonth(true), intakeAfterAMonth(false),
    'a filter house must not touch the intake, or moving the source inland stops being the real cure');
});

test('a pump sunk in brackish ground fouls itself, and then its network', () => {
  const { map, sim } = watered({
    seed: 'brackish-pump',
    lay: (m) => {
      main(m, 5, 3, 12);
      applyTool(m, TOOL.PUMPHOUSE, 3, 6);
      applyTool(m, TOOL.PIPE, 3, 6);
    },
  });
  const pump = map.index(3, 6);
  assert.equal(sim.aquifer.substrate[pump], SUBSTRATE.BRACKISH);
  let sawSuspect = false;
  for (let i = 0; i < 40; i++) {
    sim.step();
    if (!sawSuspect && qualityFor(taintOf(map.tiles[pump])) !== QUALITY.CLEAN) sawSuspect = true;
  }
  assert.ok(sawSuspect, 'the intake should have gone off inside four years');
  assert.ok(taintOf(map.tiles[pump]) >= TAINT_AT.suspect, 'and stayed off');
  // And it does not stop at the intake: the run of main took it on too.
  assert.ok(taintOf(map.tiles[map.index(8, 5)]) > 0, 'the taint reached down the main');
});

// --- the spread ------------------------------------------------------------------------------

test('taint spreads along connected mains, and only along connected mains', () => {
  const { map, sim } = watered({
    seed: 'spread',
    lay: (m) => {
      main(m, 5, 10, 16); // the run that will be fouled
      main(m, 8, 10, 16); // an entirely separate run, three rows away
      applyTool(m, TOOL.WELLHOUSE, 18, 5);
      applyTool(m, TOOL.PIPE, 17, 5);
    },
  });
  setTaint(map.tiles[map.index(10, 5)], 100);
  const fouled = [12, 14, 16].map((c) => map.index(c, 5));
  const separate = [10, 12, 14, 16].map((c) => map.index(c, 8));
  for (let i = 0; i < 12; i++) sim.step();
  for (const i of fouled) assert.ok(taintOf(map.tiles[i]) > 0, `the taint should reach ${i}`);
  for (const i of separate) {
    assert.equal(taintOf(map.tiles[i]), 0, 'a main that is not connected takes nothing');
  }
  // Nor does it leap to a lot, a road, or bare ground.
  assert.equal(taintOf(map.tiles[map.index(12, 6)]), 0, 'nor does the ground beside the main');
});

test('the taint moves outward from its source and never further than the pipe', () => {
  const { map, sim } = watered({
    seed: 'gradient',
    lay: (m) => { main(m, 5, 10, 20); },
  });
  setTaint(map.tiles[map.index(10, 5)], 100);
  for (let i = 0; i < 5; i++) sim.step();
  const line = [];
  for (let c = 10; c <= 20; c++) line.push(Math.round(taintOf(map.tiles[map.index(c, 5)])));
  for (let k = 1; k < line.length; k++) {
    assert.ok(line[k] <= line[k - 1] + 0.001,
      `taint should fall away from the source, got ${line.join(', ')}`);
  }
  assert.ok(line[1] > 0, 'the neighbour took some');
});

test('a shut valve stops the taint dead; opening it lets it through', () => {
  const build = (shut) => {
    const { map, sim } = watered({
      seed: 'valve',
      lay: (m) => {
        main(m, 5, 10, 20);
        applyTool(m, TOOL.VALVE, 15, 5); // fits it SHUT on the first turn of the tool
        if (!shut) applyTool(m, TOOL.VALVE, 15, 5); // a second turn opens it
      },
    });
    setTaint(map.tiles[map.index(10, 5)], 100);
    for (let i = 0; i < 20; i++) sim.step();
    return { map, sim, beyond: [17, 19].map((c) => map.index(c, 5)) };
  };
  const closed = build(true);
  assert.equal(valveState(closed.map.tiles[closed.map.index(15, 5)]), 'shut');
  for (const i of closed.beyond) {
    assert.equal(taintOf(closed.map.tiles[i]), 0, 'nothing passes a shut valve');
  }
  assert.ok(taintOf(closed.map.tiles[closed.map.index(14, 5)]) > 0, 'but the near side is fouled');
  // Shutting it also splits the network in two, which is what the isolation is FOR.
  assert.ok(closed.sim.water.components.length >= 2, 'a shut valve makes two networks of one');

  const open = build(false);
  assert.equal(valveState(open.map.tiles[open.map.index(15, 5)]), 'open');
  assert.ok(taintOf(open.map.tiles[open.beyond[0]]) > 0, 'an open valve passes the water, and the taint');
});

test('taint spreads faster where the pressure is down', () => {
  // Two identical runs of main. One has a source that can meet its draw; the other cannot.
  const build = (sourceTool) => {
    const map = coast();
    const sim = makeSim(map, {
      seed: 'pressure-spread',
      aquifer: { brackishReach: 3, fissureReach: 1, fissureRate: 0 },
      deepStart: 0,
    });
    main(map, 5, 10, 20);
    applyTool(map, sourceTool, 21, 5);
    // Enough built lots inside the coverage that a well house cannot keep up but a pump can.
    for (let c = 10; c <= 20; c++) {
      const t = map.tileAt(c, 6);
      t.zone = 'industrial';
      t.building = { level: 3, cls: 'unwary' };
    }
    // A grid, so the pump house can actually run.
    applyTool(map, TOOL.GASWORKS, 22, 4);
    for (let c = 21; c >= 10; c--) applyTool(map, TOOL.POWERLINE, c, 4);
    sim.step();
    setTaint(map.tiles[map.index(10, 5)], 100);
    for (let i = 0; i < 4; i++) sim.step();
    return { map, sim, far: taintOf(map.tiles[map.index(16, 5)]) };
  };
  const strong = build(TOOL.PUMPHOUSE);
  const weak = build(TOOL.WELLHOUSE);
  const strongState = strong.sim.water.components[0].pressure;
  const weakState = weak.sim.water.components.find((c) => c.tiles.length > 1).pressure;
  assert.equal(strongState, PRESSURE.GOOD, 'the pump should hold its pressure');
  assert.equal(weakState, PRESSURE.LOW, 'the well house should not');
  assert.ok(weak.far > strong.far,
    `taint should run further on a starved main (${weak.far} vs ${strong.far})`);
});

// --- taking it back off ----------------------------------------------------------------------

test('a filter house cleanses its own main, and only its own', () => {
  const { map, sim } = watered({
    seed: 'filter',
    lay: (m) => {
      main(m, 5, 10, 16);
      applyTool(m, TOOL.FILTERHOUSE, 17, 5);
      main(m, 8, 10, 16); // a second, separate main with no filter
      applyTool(m, TOOL.WELLHOUSE, 18, 8);
      applyTool(m, TOOL.PIPE, 17, 8);
    },
  });
  const filtered = [12, 14, 16].map((c) => map.index(c, 5));
  const unfiltered = [12, 14, 16].map((c) => map.index(c, 8));
  for (const i of [...filtered, ...unfiltered]) setTaint(map.tiles[i], 50);
  sim.step();
  for (const i of filtered) {
    assert.ok(taintOf(map.tiles[i]) < 50, `the filtered main should be cleaner at ${i}`);
  }
  const dirtier = unfiltered.some((i) => taintOf(map.tiles[i]) >= 50);
  assert.ok(dirtier, 'the unfiltered main is not helped by a filter house on another network');
});

test('a filter house barely touches an infested main, which is the spec own caution', () => {
  const run = (startTaint) => {
    const { map, sim } = watered({
      seed: 'filter-strength',
      lay: (m) => { main(m, 5, 10, 16); applyTool(m, TOOL.FILTERHOUSE, 17, 5); },
    });
    const tiles = [12, 14, 16].map((c) => map.index(c, 5));
    for (const i of tiles) setTaint(map.tiles[i], startTaint);
    sim.step();
    return startTaint - taintOf(map.tiles[tiles[0]]);
  };
  const onTainted = run(50);
  const onInfested = run(90);
  assert.ok(onTainted > onInfested,
    `a filter should take more off a tainted main than an infested one (${onTainted} vs ${onInfested})`);
  assert.ok(onInfested > 0, 'but it is not useless either');
});

test('an insolvent town filter houses stop working, like every other funded service', () => {
  const { map, sim } = watered({
    seed: 'insolvent-filter',
    lay: (m) => { main(m, 5, 10, 16); applyTool(m, TOOL.FILTERHOUSE, 17, 5); },
  });
  const tile = map.index(12, 5);
  setTaint(map.tiles[tile], 50);
  sim.servicesCut = true;
  sim.step();
  assert.ok(taintOf(map.tiles[tile]) >= 50, 'nothing is cleansed while the beds are unfunded');
});

test('suspect water clears itself behind a sweet intake at good pressure, and worse water does not', () => {
  const run = (startTaint) => {
    const { map, sim } = watered({
      seed: 'self-clear',
      lay: (m) => {
        main(m, 5, 18, 22);
        applyTool(m, TOOL.WELLHOUSE, 20, 6);
        applyTool(m, TOOL.PIPE, 20, 6 - 1);
      },
    });
    const tile = map.index(19, 5);
    setTaint(map.tiles[tile], startTaint);
    const before = taintOf(map.tiles[tile]);
    for (let i = 0; i < 3; i++) sim.step();
    return { before, after: taintOf(map.tiles[tile]), comp: sim.water.components[0] };
  };
  const suspect = run(TAINT_AT.suspect + 5);
  assert.equal(suspect.comp.pressure, PRESSURE.GOOD);
  assert.ok(suspect.after < suspect.before, 'suspect water clears on a sound main');
  const tainted = run(TAINT_AT.tainted + 10);
  assert.ok(tainted.after >= tainted.before - 0.001,
    'tainted water does not clear itself: that wants a filter, a flush, or new pipe');
});

test('a flush carries taint off the whole connected main and nothing beyond it', () => {
  const { map, sim } = watered({
    seed: 'flush',
    lay: (m) => {
      main(m, 5, 10, 16);
      applyTool(m, TOOL.WELLHOUSE, 17, 5);
      main(m, 8, 10, 16); // a separate main
    },
  });
  const flushed = [10, 13, 16].map((c) => map.index(c, 5));
  const other = [10, 13, 16].map((c) => map.index(c, 8));
  for (const i of [...flushed, ...other]) setTaint(map.tiles[i], 60);
  const result = applyTool(map, TOOL.FLUSH, 13, 5, { tick: sim.tick });
  assert.equal(result.ok, true);
  assert.ok(result.tiles >= 7, 'the flush ran the whole main');
  for (const i of flushed) assert.ok(taintOf(map.tiles[i]) < 60, `flushed at ${i}`);
  for (const i of other) assert.equal(taintOf(map.tiles[i]), 60, 'the other main is untouched');
  // And it records when, so the query can say so.
  assert.equal(map.tiles[flushed[0]].flushed, sim.tick);
});

test('a flush works best behind a clean intake and barely at all with no source', () => {
  const strength = (build) => {
    const map = coast();
    build(map);
    return flushStrength(map, componentTilesFrom(map, 13, 5));
  };
  const clean = strength((m) => { main(m, 5, 10, 16); applyTool(m, TOOL.PUMPHOUSE, 17, 5); });
  const foul = strength((m) => {
    main(m, 5, 10, 16);
    applyTool(m, TOOL.PUMPHOUSE, 17, 5);
    setTaint(m.tiles[m.index(17, 5)], 90);
  });
  const none = strength((m) => { main(m, 5, 10, 16); });
  assert.ok(clean > foul, `a sweet intake flushes harder (${clean} vs ${foul})`);
  assert.ok(foul > none, `and any source beats none (${foul} vs ${none})`);
});

test('lifting a length of main takes its contamination with it (the Replace Pipe repair)', () => {
  const map = coast();
  main(map, 5, 10, 16);
  const tile = map.index(13, 5);
  setTaint(map.tiles[tile], 95);
  map.tiles[tile].flushed = 4;
  applyTool(map, TOOL.BULLDOZE, 13, 5, { view: VIEW.UNDERGROUND });
  assert.equal(taintOf(map.tiles[tile]), 0, 'the foul length is gone');
  assert.equal(map.tiles[tile].flushed, undefined, 'and so is its history');
  applyTool(map, TOOL.PIPE, 13, 5);
  assert.equal(taintOf(map.tiles[tile]), 0, 'the new length is sweet');
});

// --- what the deep does ----------------------------------------------------------------------

test('a sabotaged works runs at a fraction, and repairs itself over its months', () => {
  const map = coast();
  main(map, 5, 10, 16);
  applyTool(map, TOOL.WELLHOUSE, 17, 5);
  const well = map.index(17, 5);
  const full = computeWater(map, computePower(map)).components[0].capacity;
  map.tiles[well].structure.sabotage = 2;
  const wrecked = computeWater(map, computePower(map)).components[0];
  assert.ok(wrecked.capacity < full, `sabotage should cut the output (${wrecked.capacity} of ${full})`);
  assert.equal(wrecked.sabotaged, 1, 'and the network reports it');
  assert.equal(wrecked.rating, full, 'while still reporting what the works is rated at');
  // The timer runs down over the months and the works comes back.
  const sim = makeSim(map, { seed: 'sabotage-repair', deepStart: 0 });
  sim.step();
  sim.step();
  sim.step();
  assert.equal(map.tiles[well].structure.sabotage, undefined, 'the fitters finish');
});

test('a choked main loses its head, which can drop a sound network to low pressure', () => {
  const map = coast();
  main(map, 5, 10, 20);
  applyTool(map, TOOL.WELLHOUSE, 21, 5);
  // A well house makes 35. The draw is set to 20: comfortably met at full output, and NOT met once
  // the knocking cuts the network to CHOKE_FACTOR of it. That band is the whole point of the test.
  for (let c = 11; c <= 20; c++) {
    const t = map.tileAt(c, 6);
    t.zone = 'residential';
    t.building = { level: 2, cls: 'unwary' };
  }
  const sound = computeWater(map, computePower(map)).components[0];
  assert.equal(sound.pressure, PRESSURE.GOOD);
  assert.equal(sound.choked, 0);
  map.tiles[map.index(14, 5)].pipe.choke = 3;
  const knocking = computeWater(map, computePower(map)).components[0];
  assert.equal(knocking.choked, 1, 'the network reports the knocking');
  assert.equal(knocking.pressure, PRESSURE.LOW, 'and cannot hold its pressure through it');
});

test('an infested network draws the deep events; a sweet one draws none of them', () => {
  const build = (foul) => {
    const { map, sim } = watered({
      seed: 'events',
      deepStart: 60,
      aquifer: { brackishReach: 3, fissureReach: 1, fissureRate: 1 },
      lay: (m) => {
        // The foul run draws off the shore; the control draws from sweet ground well inland, so the
        // control is genuinely a clean network rather than one that fouls itself over the run.
        if (foul) {
          main(m, 5, 3, 16);
          applyTool(m, TOOL.PUMPHOUSE, 3, 6);
          applyTool(m, TOOL.PIPE, 3, 6);
          applyTool(m, TOOL.GASWORKS, 4, 7);
        } else {
          main(m, 5, 16, 22);
          applyTool(m, TOOL.WELLHOUSE, 20, 6);
          applyTool(m, TOOL.PIPE, 20, 6);
        }
      },
    });
    if (foul) for (let c = 3; c <= 16; c++) setTaint(map.tiles[map.index(c, 5)], 95);
    let chokes = 0;
    let sabotages = 0;
    for (let i = 0; i < 60; i++) {
      sim.step();
      chokes += sim.deep.totals.choked;
      sabotages += sim.deep.totals.sabotaged;
      if (foul) for (let c = 3; c <= 16; c++) setTaint(map.tiles[map.index(c, 5)], 95);
    }
    return { chokes, sabotages, sim, map };
  };
  const infested = build(true);
  assert.ok(infested.chokes > 0, 'an infested main should knock and lose pressure');
  assert.ok(infested.sabotages > 0, 'and a pump over a teeming void should be got at');
  const clean = build(false);
  assert.equal(taintOf(clean.map.tiles[clean.map.index(20, 6)]), 0, 'the control intake stayed sweet');
  assert.equal(clean.chokes, 0, 'a sweet main never knocks');
});

test('backflow fouls a clean stretch of a foul network, and a filter house prevents it', () => {
  const build = (withFilter) => {
    const { map, sim } = watered({
      seed: 'backflow',
      lay: (m) => {
        main(m, 5, 6, 20);
        applyTool(m, TOOL.WELLHOUSE, 21, 5);
        if (withFilter) applyTool(m, TOOL.FILTERHOUSE, 5, 5);
      },
    });
    let events = 0;
    for (let i = 0; i < 80; i++) {
      // Hold one end foul and the far end sweet, so a backflow has somewhere to go.
      for (let c = 6; c <= 9; c++) setTaint(map.tiles[map.index(c, 5)], 95);
      for (let c = 17; c <= 20; c++) setTaint(map.tiles[map.index(c, 5)], 0);
      sim.step();
      for (let c = 17; c <= 20; c++) {
        if (map.tiles[map.index(c, 5)].backflow !== undefined) { events++; break; }
      }
    }
    return events;
  };
  assert.ok(build(false) > 0, 'a foul network should push into its own clean stretch');
  assert.equal(build(true), 0, 'a working filter house prevents it');
});

test('seepage damps the ground above a foul main, and that is the Greening bridge inland', () => {
  const map = coast();
  // Bare hill rock: the Greening cannot normally take it at all.
  const rock = map.tileAt(20, 5);
  rock.terrain = TERRAIN.ROCK;
  rock.elevation = 5;
  assert.equal(canGreeningTakeHold(rock), false, 'rock resists the growth');
  const sim = makeSim(map, { seed: 'seepage', deepStart: 0 });
  main(map, 5, 16, 22);
  sim.step();
  let damped = false;
  for (let i = 0; i < 120 && !damped; i++) {
    for (let c = 16; c <= 22; c++) setTaint(map.tiles[map.index(c, 5)], 95);
    sim.step();
    if (rock.damp > 0) damped = true;
  }
  assert.ok(damped, 'an infested main should seep into the ground above it');
  assert.equal(canGreeningTakeHold(rock), true, 'and damp rock WILL take the growth');
  // The damp is temporary: it dries out once the main is sound again.
  for (let c = 16; c <= 22; c++) setTaint(map.tiles[map.index(c, 5)], 0);
  for (let i = 0; i < 12; i++) sim.step();
  assert.ok(!(rock.damp > 0), 'and it dries once the leak is dealt with');
  assert.equal(canGreeningTakeHold(rock), false);
});

// --- the growth gate -------------------------------------------------------------------------

test('foul water caps a lot at the first tier even with power and good pressure', () => {
  const build = (taint) => {
    const map = coast(24, 12);
    const sim = makeSim(map, { seed: 'growth-gate', deepStart: 0, wrath: false });
    // Geometry that matters: the main runs two rows from the lots, which is exactly the water
    // coverage radius, and the power line runs directly beside them. Both utilities reach, so the
    // ONLY variable between the two runs below is what is in the water.
    main(map, 6, 10, 20);
    for (let c = 10; c <= 20; c++) applyTool(map, TOOL.ROAD, c, 7);
    for (let c = 11; c <= 18; c++) applyTool(map, TOOL.ZONE_R, c, 8);
    for (let c = 10; c <= 20; c++) applyTool(map, TOOL.POWERLINE, c, 9);
    applyTool(map, TOOL.GASWORKS, 21, 9);
    applyTool(map, TOOL.WELLHOUSE, 21, 6); // makes 35; eight level-3 homes draw 24
    for (let i = 0; i < 60; i++) {
      if (taint > 0) for (let c = 10; c <= 20; c++) setTaint(map.tiles[map.index(c, 6)], taint);
      sim.step();
    }
    let best = 0;
    for (let c = 11; c <= 18; c++) {
      const t = map.tileAt(c, 8);
      if (t.building) best = Math.max(best, t.building.level);
    }
    return { best, sim, map };
  };
  const sweet = build(0);
  assert.equal(sweet.best, MAX_LEVEL, 'clean water and power let a lot reach its full height');
  const foul = build(95);
  assert.equal(foul.best, 1, 'foul water caps it at a poor first tier however good the pressure');
  assert.equal(qualityAt(foul.sim.water, foul.map.index(14, 8)), QUALITY.INFESTED,
    'the network serving those lots reads infested');
  assert.equal(qualityAt(sweet.sim.water, sweet.map.index(14, 8)), QUALITY.CLEAN,
    'and the control network reads clean');
  // And the lot itself says why, in the spec's own words.
  const why = explainLot(foul.sim, 14, 8);
  assert.ok(why.some((l) => /Tainted water/.test(l)), `expected the blocker named: ${why}`);
  assert.ok(!why.some((l) => /—/.test(l)), 'no em-dashes in player-facing text');
});

// --- the player-facing readouts --------------------------------------------------------------

test('the query names the ground and the signs, and never gives the number away', () => {
  const { map, sim } = watered({
    aquifer: { brackishReach: 3, fissureReach: 1, fissureRate: 1 },
  });
  const brackish = explainDeep(sim, 3, 5);
  assert.ok(brackish.some((l) => /brackish/i.test(l)), `expected the brine named: ${brackish}`);
  const fresh = explainDeep(sim, 20, 5);
  assert.ok(fresh.some((l) => /fresh/i.test(l)), `expected sweet ground named: ${fresh}`);
  // A high presence adds a SIGN, not a reading.
  const region = sim.deep.regions.find((r) => r.seaConnected);
  for (const i of sim.aquifer.regions.find((r) => r.id === region.id).tiles) sim.presence[i] = 90;
  sim.step();
  const teeming = explainDeep(sim, 3, 5);
  assert.ok(teeming.some((l) => l === PRESENCE_SIGN.teeming), `expected the teeming sign: ${teeming}`);
  for (const line of [...brackish, ...fresh, ...teeming]) {
    assert.ok(!/—/.test(line), `em-dash in player-facing text: ${line}`);
    assert.ok(!/\b\d+(\.\d+)?\b/.test(line), `a number leaked into a sign: ${line}`);
  }
  // A sealed fissure says so, and off-map is empty rather than a crash.
  const fissure = sim.aquifer.fissures[0];
  map.tiles[fissure].sealed = true;
  sim.step();
  const col = fissure % map.cols;
  const capped = explainDeep(sim, col, (fissure - col) / map.cols);
  assert.ok(capped.some((l) => /cap/i.test(l)), `expected the cap named: ${capped}`);
  assert.deepEqual(explainDeep(sim, -5, -5), []);
});

test('the Old Priest counsel on the water is urgent-first, plain, and never a lecture', () => {
  const { map, sim } = watered({
    seed: 'advice',
    lay: (m) => {
      main(m, 5, 10, 16);
      applyTool(m, TOOL.WELLHOUSE, 17, 5);
    },
  });
  assert.deepEqual(deepAdvice({}), [], 'a sim with no water state says nothing');
  const clean = deepAdvice(sim);
  for (let c = 10; c <= 16; c++) setTaint(map.tiles[map.index(c, 5)], 95);
  sim.step();
  const foul = deepAdvice(sim);
  assert.ok(foul.length > clean.length, 'a foul network earns counsel');
  assert.ok(/living in the mains|Filter House cannot/.test(foul[0]),
    `the worst thing should lead: ${foul[0]}`);
  for (const line of foul) {
    assert.ok(!/—/.test(line), `em-dash in player-facing text: ${line}`);
    assert.ok(line.length < 130, `counsel too long to fit the window: ${line}`);
  }
});

test('the Courier reports the water, and does not become a water bulletin', () => {
  const { map, sim } = watered({
    seed: 'courier',
    deepStart: 40,
    aquifer: { brackishReach: 3, fissureReach: 1, fissureRate: 1 },
    lay: (m) => {
      main(m, 5, 3, 16);
      applyTool(m, TOOL.PUMPHOUSE, 3, 6);
      applyTool(m, TOOL.PIPE, 3, 6);
      applyTool(m, TOOL.GASWORKS, 4, 7);
    },
  });
  for (let i = 0; i < 90; i++) {
    for (let c = 3; c <= 16; c++) setTaint(map.tiles[map.index(c, 5)], 95);
    sim.step();
  }
  const water = sim.events.filter((e) => e.kind === 'water');
  assert.ok(water.length > 0, 'the water should reach the front page');
  for (const e of water) {
    assert.equal(e.headline, e.headline.toUpperCase(), 'headlines are set in caps like every other');
    assert.ok(!/—/.test(e.headline + e.sub), `em-dash in the Courier: ${e.headline}`);
  }
  // Each sort of headline honours its cooldown, so 90 months cannot have produced 90 of them.
  const byHeadline = new Map();
  for (const e of water) byHeadline.set(e.headline, (byHeadline.get(e.headline) || 0) + 1);
  for (const [headline, n] of byHeadline) {
    assert.ok(n <= Math.ceil(90 / NEWS_COOLDOWN) + 1,
      `"${headline}" was filed ${n} times in 90 months, past its cooldown of ${NEWS_COOLDOWN}`);
  }
});

// --- the scenario pressure scales ------------------------------------------------------------

test('the Quiet Cove really is quieter: less brine, fewer mouths, slower taint', async () => {
  const { SCENARIOS } = await import('../src/scenarios.js');
  const easy = SCENARIOS.easy.opts;
  const standard = SCENARIOS.standard.opts;
  const hard = SCENARIOS.hard.opts;
  assert.ok(easy.aquifer.brackishReach < standard.aquifer.brackishReach);
  assert.ok(hard.aquifer.brackishReach > standard.aquifer.brackishReach);
  assert.ok(easy.aquifer.fissureRate < standard.aquifer.fissureRate);
  assert.ok(hard.aquifer.fissureRate > standard.aquifer.fissureRate);
  assert.ok(easy.deepPace.contam < standard.deepPace.contam);
  assert.ok(hard.deepPace.contam > standard.deepPace.contam);
  assert.ok(easy.deepStart < standard.deepStart, 'the cove starts dormant');
  assert.ok(easy.deepGrace >= 18, 'and gets the spec first 18 to 24 months');

  // And it plays out that way: the same town on the easy start fouls slower than on the standard.
  const run = (opts) => {
    const map = coast();
    const sim = makeSim(map, { seed: 'pace', ...opts });
    main(map, 5, 3, 16);
    applyTool(map, TOOL.PUMPHOUSE, 3, 6);
    applyTool(map, TOOL.PIPE, 3, 6);
    applyTool(map, TOOL.GASWORKS, 4, 7);
    for (let c = 3; c <= 16; c++) applyTool(map, TOOL.POWERLINE, c, 7);
    // Ten months, not two years: past that the standard and hard starts both saturate at 100 and the
    // comparison stops measuring anything.
    for (let i = 0; i < 10; i++) sim.step();
    return taintOf(map.tiles[map.index(3, 6)]);
  };
  const onEasy = run(easy);
  const onStandard = run(standard);
  const onHard = run(hard);
  assert.ok(onEasy < onStandard, `the cove should foul slower (${onEasy} vs ${onStandard})`);
  assert.ok(onHard > onStandard, `the blighted shore faster (${onHard} vs ${onStandard})`);
});

// --- the sealing works -----------------------------------------------------------------------

test('a sealing works only caps a real fissure, and Dagon takes it personally', () => {
  const { map, sim } = watered({
    aquifer: { brackishReach: 3, fissureReach: 1, fissureRate: 1 },
  });
  const fissure = sim.aquifer.fissures[0];
  const col = fissure % map.cols;
  const row = (fissure - col) / map.cols;
  const opts = { aquiferOpts: sim.aquiferOpts, view: VIEW.UNDERGROUND };
  // Sweet ground refuses it, in plain English.
  const sound = canApply(map, TOOL.SEAL, 20, 5, opts);
  assert.equal(sound.ok, false);
  assert.match(sound.reason, /no fissure/i);
  assert.ok(!/—/.test(sound.reason));
  // The fissure accepts it.
  assert.equal(canApply(map, TOOL.SEAL, col, row, opts).ok, true);
  const favorBefore = sim.favor.dagon;
  applyTool(map, TOOL.SEAL, col, row, opts);
  sim.noteBuild(TOOL.SEAL, col, row);
  assert.equal(map.tiles[fissure].sealed, true);
  assert.equal(sim.favor.dagon, favorBefore - SEAL_DAGON_COST, 'the deep notices a door shut');
  // And it cannot be capped twice.
  const again = canApply(map, TOOL.SEAL, col, row, opts);
  assert.equal(again.ok, false);
  assert.match(again.reason, /already/i);
  // Sealing every mouth turns the presence around.
  for (const i of sim.aquifer.fissures) map.tiles[i].sealed = true;
  sim.step();
  const rising = sim.deep.regions.find((r) => r.seaConnected);
  const was = rising.presence;
  for (let i = 0; i < 12; i++) sim.step();
  const now = sim.deep.regions.find((r) => r.id === rising.id).presence;
  assert.ok(now <= was, `with every mouth capped the presence should not climb (${was} -> ${now})`);
});

// --- the whole thing, over a long run --------------------------------------------------------

test('stepDeep holds its invariants over a long game on a real generated coast', async () => {
  const { makeMap } = await import('../src/mapgen.js');
  for (const seed of ['deep-soak-a', 'deep-soak-b']) {
    const map = makeMap({ seed, cols: 40, rows: 40 });
    const sim = makeSim(map, { seed, wrath: true, deepStart: 20 });
    for (let i = 0; i < 300; i++) {
      sim.step();
      for (const r of sim.deep.regions) {
        assert.ok(Number.isFinite(r.presence) && r.presence >= 0 && r.presence <= PRESENCE_MAX,
          `${seed}@${i}: presence out of range (${r.presence})`);
      }
      for (const t of map.tiles) {
        const v = taintOf(t);
        assert.ok(Number.isFinite(v) && v >= 0 && v <= 100, `${seed}@${i}: taint out of range (${v})`);
      }
    }
    // The presence ledger must not grow without bound: it is rebuilt each month, one entry per region.
    assert.ok(Object.keys(sim.presence).length <= sim.aquifer.regions.length,
      'the presence ledger should carry one entry per region, not a month of history');
  }
});

test('stepDeep is deterministic: the same seed and the same town give the same month', () => {
  const run = () => {
    const { map, sim } = watered({
      seed: 'determinism',
      deepStart: 30,
      aquifer: { brackishReach: 3, fissureReach: 1, fissureRate: 1 },
      lay: (m) => {
        main(m, 5, 3, 16);
        applyTool(m, TOOL.PUMPHOUSE, 3, 6);
        applyTool(m, TOOL.PIPE, 3, 6);
        applyTool(m, TOOL.GASWORKS, 4, 7);
      },
    });
    for (let i = 0; i < 40; i++) sim.step();
    return {
      taints: taintsOf(map, map.tiles.map((_, i) => i)),
      presence: sim.deep.regions.map((r) => Math.round(r.presence * 100)),
      news: sim.events.map((e) => e.headline),
    };
  };
  assert.deepEqual(run(), run(), 'two identical runs must agree exactly');
});

test('stepDeep survives a town with no water at all, and a map with no brine', () => {
  const map = coast();
  // Push the water off the map entirely: all land, no sea.
  for (const t of map.tiles) { t.terrain = TERRAIN.GRASS; t.elevation = 3; }
  const sim = makeSim(map, { seed: 'no-water', deepStart: 40 });
  assert.doesNotThrow(() => { for (let i = 0; i < 12; i++) sim.step(); });
  assert.equal(sim.aquifer.regions.length, 0, 'no sea, no brine, no regions');
  assert.deepEqual(sim.presence, {}, 'and nothing for the ledger to hold');
  assert.equal(sim.deep.totals.presence, 0);
  assert.equal(presenceAt(sim, 0), 0);
  assert.deepEqual(deepAdvice(sim).filter((l) => /main/.test(l)), [], 'and no counsel about mains');
});

test('working a fitted valve is free; fitting one is not', () => {
  const map = coast();
  main(map, 5, 10, 16);
  const fit = toolCostAt(map, TOOL.VALVE, 13, 5);
  assert.ok(fit > 0, 'the fitter is paid to cut a valve into a live main');
  applyTool(map, TOOL.VALVE, 13, 5);
  assert.equal(toolCostAt(map, TOOL.VALVE, 13, 5), 0,
    'but shutting it in an emergency must never cost the town anything');
  // Fitting needs a main to sit in.
  const bare = canApply(map, TOOL.VALVE, 20, 5);
  assert.equal(bare.ok, false);
  assert.match(bare.reason, /main/i);
  // A flush cannot start from behind a shut valve.
  const behind = canApply(map, TOOL.FLUSH, 13, 5);
  assert.equal(behind.ok, false);
  assert.match(behind.reason, /shut/i);
});

test('componentTilesFrom walks the run of main and stops at a shut valve', () => {
  const map = coast();
  main(map, 5, 10, 20);
  assert.equal(componentTilesFrom(map, 13, 5).length, 11, 'the whole run');
  applyTool(map, TOOL.VALVE, 15, 5); // shut
  const west = componentTilesFrom(map, 13, 5);
  const east = componentTilesFrom(map, 17, 5);
  assert.equal(west.length, 5, 'cols 10 to 14');
  assert.equal(east.length, 5, 'cols 16 to 20');
  assert.equal(west.some((i) => east.includes(i)), false, 'and they share nothing');
  assert.deepEqual(componentTilesFrom(map, 15, 5), [], 'the shut valve itself conducts nothing');
  assert.deepEqual(componentTilesFrom(map, 22, 5), [], 'bare ground is no network');
});
