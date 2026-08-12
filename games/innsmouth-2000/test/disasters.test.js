import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GameMap, TERRAIN } from '../src/mapgen.js';
import { TOOL, applyTool } from '../src/tools.js';
import { makeSim } from '../src/sim.js';
import { GOD } from '../src/gods.js';
import { triggerWrath, advanceDisaster, canGreeningTakeHold } from '../src/disasters.js';

function blankTile(terrain = TERRAIN.GRASS, elevation = 1) {
  return { terrain, elevation, object: null, zone: null, building: null, structure: null, scar: null };
}

// A land map. Optionally a water column at col 0 with a beach (elev 0) at col 1.
function landMap(cols = 20, rows = 20, coast = false) {
  const m = new GameMap(cols, rows);
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      m.tiles[m.index(col, row)] = blankTile();
    }
  }
  if (coast) {
    for (let r = 0; r < rows; r++) {
      m.tileAt(0, r).terrain = TERRAIN.DEEP; m.tileAt(0, r).elevation = 0;
      m.tileAt(1, r).terrain = TERRAIN.BEACH; m.tileAt(1, r).elevation = 0;
    }
  }
  return m;
}

// Build a small developed block: a road row and buildings on it.
function buildTown(m, c0 = 4, r0 = 4, w = 6) {
  for (let d = 0; d < w; d++) applyTool(m, TOOL.ROAD, c0 + d, r0);
  for (let d = 0; d < w; d++) {
    const t = m.tileAt(c0 + d, r0 - 1);
    t.zone = 'residential';
    t.building = { level: 2, cls: 'unwary' };
  }
}

function countScar(m, kind) {
  let n = 0;
  for (const t of m.tiles) if (t.scar && t.scar.kind === kind) n++;
  return n;
}

test('the Flood Tide drowns the low shore and rouses the Deep Ones', () => {
  const m = landMap(20, 20, true);
  // Homes along the second land column, near the water.
  for (let r = 4; r < 10; r++) {
    const t = m.tileAt(2, r); t.zone = 'residential'; t.building = { level: 1, cls: 'unwary' };
  }
  const sim = makeSim(m, { seed: 'flood', dread: 10 });
  const ev = triggerWrath(sim, GOD.DAGON);
  assert.equal(ev.kind, 'flood');
  assert.ok(ev.count > 0, 'some lots drowned');
  assert.equal(countScar(m, 'flooded'), ev.count);
  assert.ok(m.tileAt(1, 5).terrain === TERRAIN.SHALLOW, 'the beach became sea');
  assert.ok(sim.dread > 10, 'the flood drives dread up');
});

test('the Awakening wrecks most of the town and unseats every mind', () => {
  const m = landMap(24, 24);
  // A dense grid of buildings.
  for (let row = 2; row < 20; row++) {
    for (let col = 2; col < 20; col++) {
      const t = m.tileAt(col, row); t.zone = 'residential'; t.building = { level: 2, cls: 'unwary' };
    }
  }
  const before = 18 * 18;
  const sim = makeSim(m, { seed: 'wake', dread: 20 });
  const ev = triggerWrath(sim, GOD.CTHULHU);
  assert.equal(ev.kind, 'awakening');
  const rubble = countScar(m, 'rubble');
  assert.ok(rubble > before * 0.4, `most buildings fall (rubble=${rubble})`);
  assert.ok(sim.dread >= 78, 'city-wide madness spikes dread');
});

test('the Greening takes root and crawls outward over months', () => {
  const m = landMap(24, 24);
  buildTown(m, 6, 8, 8);
  const sim = makeSim(m, { seed: 'green' });
  const ev = triggerWrath(sim, GOD.SHUB);
  assert.equal(ev.kind, 'greening');
  const seeded = countScar(m, 'overgrown');
  assert.equal(seeded, 1, 'one lot at the seed');
  for (let i = 0; i < 6; i++) advanceDisaster(sim);
  assert.ok(countScar(m, 'overgrown') > seeded, 'the growth spread');
  // It devours what it reaches (buildings under it are gone).
  assert.ok(sim.disaster === null || sim.disaster.consumed > 1);
});

test('the Greening requires damp land and never takes hold on bare rock', () => {
  const m = landMap(18, 18);
  for (const t of m.tiles) t.terrain = TERRAIN.ROCK;
  applyTool(m, TOOL.GASWORKS, 9, 9);
  const sim = makeSim(m, { seed: 'rock-resists' });
  const ev = triggerWrath(sim, GOD.SHUB);
  for (let i = 0; i < 10; i++) advanceDisaster(sim);
  assert.equal(ev.count, 0, 'no eligible seed exists on the rock');
  assert.equal(countScar(m, 'overgrown'), 0);
  assert.equal(canGreeningTakeHold(m.tileAt(9, 9)), false);
});

test('the Greening may cross developed marsh grass but stops at a rock barrier', () => {
  const m = landMap(15, 9);
  // A solid north-south rock wall divides the damp substrate.
  for (let r = 0; r < m.rows; r++) m.tileAt(7, r).terrain = TERRAIN.ROCK;
  applyTool(m, TOOL.GASWORKS, 4, 4);
  const sim = makeSim(m, { seed: 'rock-wall' });
  triggerWrath(sim, GOD.SHUB);
  for (let i = 0; i < 10; i++) advanceDisaster(sim);
  assert.ok(countScar(m, 'overgrown') > 1, 'growth spreads on marsh grass');
  for (let r = 0; r < m.rows; r++) {
    assert.notEqual(m.tileAt(7, r).scar?.kind, 'overgrown', `rock at row ${r} resists`);
  }
  for (let r = 0; r < m.rows; r++) {
    for (let c = 8; c < m.cols; c++) assert.notEqual(m.tileAt(c, r).scar?.kind, 'overgrown');
  }
});

test('the Burning spreads along the streets; a constabulary damps it', () => {
  const run = (withWatch) => {
    const m = landMap(30, 30);
    buildTown(m, 3, 15, 20); // a long built row for the fire to run
    if (withWatch) applyTool(m, TOOL.CONSTABULARY, 12, 13);
    const sim = makeSim(m, { seed: 'fire' });
    triggerWrath(sim, GOD.NYARLATHOTEP);
    for (let i = 0; i < 8; i++) advanceDisaster(sim);
    return countScar(m, 'burnt');
  };
  const wild = run(false);
  const guarded = run(true);
  assert.ok(wild > 1, 'fire spreads');
  assert.ok(guarded < wild, `the constabulary damps the spread (${guarded} < ${wild})`);
});

test('the Rift scrambles a district but conserves what it holds', () => {
  const m = landMap(20, 20);
  // A recognisable district: some roads and buildings in a block.
  for (let d = 0; d < 6; d++) applyTool(m, TOOL.ROAD, 4 + d, 6);
  for (let d = 0; d < 4; d++) {
    const t = m.tileAt(5 + d, 5); t.zone = 'commercial'; t.building = { level: 3, cls: 'unwary' };
  }
  const tally = () => {
    let roads = 0; let builds = 0;
    for (const t of m.tiles) { if (t.object && t.object.kind === 'road') roads++; if (t.building) builds++; }
    return { roads, builds };
  };
  const before = tally();
  const sim = makeSim(m, { seed: 'rift' });
  const ev = triggerWrath(sim, GOD.YOG);
  assert.equal(ev.kind, 'rift');
  const after = tally();
  assert.deepEqual(after, before, 'the Rift moves things but destroys nothing');
});

test('a wrath is deterministic for the same seed and layout', () => {
  const make = () => { const m = landMap(24, 24); buildTown(m, 6, 8, 10); return m; };
  const a = makeSim(make(), { seed: 'det' });
  const b = makeSim(make(), { seed: 'det' });
  triggerWrath(a, GOD.NYARLATHOTEP);
  triggerWrath(b, GOD.NYARLATHOTEP);
  for (let i = 0; i < 8; i++) { advanceDisaster(a); advanceDisaster(b); }
  assert.equal(countScar(a.map, 'burnt'), countScar(b.map, 'burnt'));
  assert.equal(a.dread, b.dread);
});

test('summonWrath sates the god and records the herald line', () => {
  const m = landMap(); buildTown(m);
  const sim = makeSim(m, { seed: 's' });
  sim.favor.yog = 3;
  const ev = sim.summonWrath(GOD.YOG);
  assert.ok(ev, 'a wrath fired');
  assert.ok(sim.favor.yog > 3, 'the god is sated');
  assert.ok(sim.lastWrath && sim.lastWrath.god === GOD.YOG);
});

test('an active spreading wrath ends and clears after its span', () => {
  const m = landMap(); buildTown(m);
  const sim = makeSim(m, { seed: 'span' });
  triggerWrath(sim, GOD.SHUB);
  assert.ok(sim.disaster, 'a disaster is active');
  for (let i = 0; i < 20; i++) advanceDisaster(sim);
  assert.equal(sim.disaster, null, 'it spends itself and clears');
});

test('a floor-triggered wrath fires through a stepped sim', () => {
  const m = landMap(); buildTown(m);
  const sim = makeSim(m, { seed: 'fire2', dread: 60, wrath: true });
  // Neglect Nyarlathotep to the brink; the next step should loose his wrath.
  sim.favor.nyarlathotep = 1;
  sim.step();
  assert.ok(sim.lastWrath, 'a wrath was heralded');
});
