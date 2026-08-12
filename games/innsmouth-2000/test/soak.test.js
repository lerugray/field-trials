// The standing soak test (M8, DIRECTIONS-M7 §M8): step the sim thousands of times across seeds and
// assert the core invariants hold every tick — dread and favor stay in [0,100], the treasury stays a
// finite number, population stays finite and non-negative, the calendar stays sane, and scars remain
// a bounded set of known kinds. Runs from now on at every milestone close. It has caught nothing yet;
// its job is to make sure a future change to the economy, gods, or disasters cannot silently drift a
// value out of range over a long game.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GameMap, TERRAIN } from '../src/mapgen.js';
import { TOOL, applyTool } from '../src/tools.js';
import { makeSim, CLASS_LIST } from '../src/sim.js';
import { GOD_LIST } from '../src/gods.js';
import { scanAmbientSites, ambientWorldBounds, computeAmbient } from '../src/ambient.js';
import { drawAmbient } from '../src/render.js';
import { makeCamera } from '../src/camera.js';

const SCAR_KINDS = new Set(['burnt', 'overgrown', 'rubble', 'flooded', 'rift']);

// A mixed town: a shore, roads, all three zones, generators + lines, and the civic set (so growth,
// power, class shuffling, favor, and every disaster's footprint are all exercised).
function mixedTown(seed) {
  const N = 24;
  const m = new GameMap(N, N);
  for (let i = 0; i < N * N; i++) {
    m.tiles[i] = { terrain: TERRAIN.GRASS, elevation: 1 + ((i * 7) % 4), object: null, zone: null, building: null, structure: null };
  }
  for (let r = 0; r < N; r++) { m.tileAt(0, r).terrain = TERRAIN.DEEP; m.tileAt(1, r).terrain = TERRAIN.SHALLOW; }
  for (let c = 2; c < N - 2; c++) { applyTool(m, TOOL.ROAD, c, 6); applyTool(m, TOOL.ROAD, c, 12); applyTool(m, TOOL.ROAD, c, 18); }
  for (let c = 2; c < N - 2; c++) {
    applyTool(m, TOOL.ZONE_R, c, 5); applyTool(m, TOOL.ZONE_C, c, 11); applyTool(m, TOOL.ZONE_I, c, 17);
  }
  applyTool(m, TOOL.GASWORKS, 3, 8);
  for (let c = 3; c < N - 3; c++) applyTool(m, TOOL.POWERLINE, c, 8);
  applyTool(m, TOOL.SHRINE, 2, 4);        // a wharf shrine (Dagon)
  applyTool(m, TOOL.SHRINE, 20, 20);      // a grove shrine (Shub)
  applyTool(m, TOOL.CONSTABULARY, 10, 9);
  applyTool(m, TOOL.ASYLUM, 14, 9);
  applyTool(m, TOOL.CHAPEL, 6, 15);
  applyTool(m, TOOL.UNIVERSITY, 16, 15);  // Scholars + Yog
  return makeSim(m, { seed });
}

function assertInvariants(sim, where) {
  assert.ok(sim.dread >= 0 && sim.dread <= 100, `${where}: dread out of range (${sim.dread})`);
  assert.ok(Number.isFinite(sim.dread), `${where}: dread not finite`);
  for (const g of GOD_LIST) {
    const f = sim.favor[g];
    assert.ok(Number.isFinite(f) && f >= 0 && f <= 100, `${where}: favor ${g} out of range (${f})`);
  }
  assert.ok(Number.isFinite(sim.treasury), `${where}: treasury not finite (${sim.treasury})`);
  for (const c of CLASS_LIST) {
    assert.ok(Number.isFinite(sim.pop[c]) && sim.pop[c] >= 0, `${where}: pop ${c} bad (${sim.pop[c]})`);
  }
  assert.ok(sim.month >= 0 && sim.month < 12, `${where}: month ${sim.month}`);
  assert.ok(sim.year >= sim.foundedYear, `${where}: year ${sim.year} before founding`);
  assert.ok(sim.awakenings >= 0, `${where}: awakenings ${sim.awakenings}`);
}

// A fuller (and pricier) tile scan for scars: run it periodically rather than every tick.
function assertScars(sim, where) {
  let scarred = 0;
  for (const t of sim.map.tiles) {
    if (t && t.scar) {
      assert.ok(SCAR_KINDS.has(t.scar.kind), `${where}: unknown scar ${t.scar.kind}`);
      scarred++;
    }
  }
  assert.ok(scarred <= sim.map.tiles.length, `${where}: more scars than tiles`);
}

test('soak: economy + growth + favor hold their invariants over 3000 months (no auto-wrath)', () => {
  for (const seed of ['soak-a', 'soak-b', 'soak-c']) {
    const sim = mixedTown(seed); // wrath off by default: a pure long-run economy/growth/favor soak
    for (let i = 0; i < 3000; i++) {
      sim.step();
      assertInvariants(sim, `${seed}@${i}`);
      if (i % 250 === 0) assertScars(sim, `${seed}@${i}`);
    }
    assertScars(sim, `${seed}@end`);
  }
});

test('soak: with the gods loose, disasters and the doom clock keep the invariants (5000 months)', () => {
  for (const seed of ['wrath-a', 'wrath-b']) {
    const sim = mixedTown(seed);
    sim.wrath = true; // gods loose their wrath on the favor floor; the Awakening may end the town
    let endedAt = -1;
    for (let i = 0; i < 5000; i++) {
      sim.step();
      assertInvariants(sim, `${seed}@${i}`);
      if (i % 250 === 0) assertScars(sim, `${seed}@${i}`);
      if (sim.ended && endedAt < 0) endedAt = i;
    }
    // If the town was lost, it must have stayed lost and frozen for the rest of the soak.
    if (endedAt >= 0) {
      const t = sim.tick;
      sim.step();
      assert.equal(sim.tick, t, `${seed}: an ended town kept ticking`);
    }
  }
});

// A no-op recording context, enough for drawAmbient to run its full draw path.
function mockCtx() {
  const noop = () => {};
  const ctx = {
    createRadialGradient: () => ({ addColorStop: noop }),
    createLinearGradient: () => ({ addColorStop: noop }),
  };
  for (const m of [
    'fillRect', 'strokeRect', 'beginPath', 'closePath', 'moveTo', 'lineTo', 'arc', 'ellipse',
    'fill', 'stroke', 'save', 'restore',
  ]) ctx[m] = noop;
  return ctx;
}

test('soak: the ambient living world never mutates game state across a long run (M9)', () => {
  // The M9 safety property: ambient is atmosphere, not simulation. Over a long, evolving game
  // (roads, shrines, water, scars all in play), scanning its sites, computing its entities at many
  // times, and drawing it must leave the map and the sim byte-identical.
  const sim = mixedTown('ambient-soak');
  sim.wrath = true;
  const camera = makeCamera({ mapCols: sim.map.cols, mapRows: sim.map.rows, viewportW: 1280, viewportH: 800 });
  camera.setZoom(1);
  for (let i = 0; i < 400; i++) {
    sim.step();
    // Every so often, exercise the whole ambient path against the current town.
    if (i % 40 === 0) {
      const before = JSON.stringify({ tiles: sim.map.tiles, dread: sim.dread, favor: sim.favor, pop: sim.pop, treasury: sim.treasury, events: sim.events.length });
      const sites = scanAmbientSites(sim.map);
      const bounds = ambientWorldBounds(sim.map);
      const ctx = mockCtx();
      for (const ms of [0, 1234, 5000, 20000, 60000]) {
        for (const rm of [false, true]) {
          const amb = computeAmbient(sites, bounds, ms, { reducedMotion: rm });
          drawAmbient(ctx, amb, camera);
        }
      }
      const after = JSON.stringify({ tiles: sim.map.tiles, dread: sim.dread, favor: sim.favor, pop: sim.pop, treasury: sim.treasury, events: sim.events.length });
      assert.equal(after, before, `ambient mutated game state at month ${i}`);
    }
  }
});
