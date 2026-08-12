import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GameMap, TERRAIN } from '../src/mapgen.js';
import { TOOL, applyTool } from '../src/tools.js';
import {
  buildMinimap, overMinimap, minimapToTile, tileToMinimap, drawMinimap,
} from '../src/overlays.js';

// The recording mock-ctx (mirrors test/draw-smoke): every draw call is a no-op so we catch
// browser-only reference errors, and a click/drag regression can exercise the draw path.
function mockCtx() {
  const noop = () => {};
  const ctx = { measureText: (s) => ({ width: (s ? String(s).length : 0) * 7 }) };
  for (const m of [
    'fillRect', 'strokeRect', 'clearRect', 'fillText', 'beginPath', 'closePath',
    'moveTo', 'lineTo', 'arc', 'ellipse', 'rect', 'fill', 'stroke', 'clip',
    'save', 'restore', 'translate', 'rotate', 'scale', 'setLineDash',
  ]) ctx[m] = noop;
  return ctx;
}

function townMap(cols = 24, rows = 24) {
  const m = new GameMap(cols, rows);
  for (let i = 0; i < cols * rows; i++) {
    m.tiles[i] = { terrain: TERRAIN.GRASS, elevation: 1, object: null, zone: null, building: null, structure: null };
  }
  for (let r = 0; r < rows; r++) m.tileAt(0, r).terrain = TERRAIN.DEEP;
  return m;
}

test('the minimap fits inside its frame and above the reserved bottom inset', () => {
  const mm = buildMinimap(1280, 800, 96, 96, { bottomInset: 48 });
  assert.ok(mm.inner.x >= mm.frame.x && mm.inner.y >= mm.frame.y);
  assert.ok(mm.inner.x + mm.inner.w <= mm.frame.x + mm.frame.w);
  assert.ok(mm.inner.y + mm.inner.h <= mm.frame.y + mm.frame.h);
  assert.ok(mm.frame.y + mm.frame.h <= 800 - 48, 'clears the reserved bottom inset');
  assert.ok(mm.frame.x + mm.frame.w <= 1280);
});

test('minimapToTile clamps in bounds and round-trips near a tile centre', () => {
  const mm = buildMinimap(1280, 800, 96, 96);
  assert.deepEqual(minimapToTile(mm, mm.inner.x - 100, mm.inner.y - 100), { col: 0, row: 0 });
  assert.deepEqual(minimapToTile(mm, mm.inner.x + mm.inner.w + 100, mm.inner.y + mm.inner.h + 100), { col: 95, row: 95 });
  const p = tileToMinimap(mm, 40, 60);
  assert.deepEqual(minimapToTile(mm, p.x, p.y), { col: 40, row: 60 });
});

test('overMinimap detects clicks on the frame and misses outside', () => {
  const mm = buildMinimap(1280, 800, 96, 96);
  assert.equal(overMinimap(mm, mm.frame.x + 2, mm.frame.y + 2), true);
  assert.equal(overMinimap(mm, mm.frame.x - 50, mm.frame.y - 50), false);
});

test('drawMinimap renders a live map and a viewport quad without error', () => {
  const m = townMap();
  applyTool(m, TOOL.ROAD, 5, 5);
  applyTool(m, TOOL.ZONE_R, 6, 5);
  applyTool(m, TOOL.SHRINE, 8, 8);
  m.tileAt(10, 10).scar = { kind: 'burnt' };
  const mm = buildMinimap(1280, 800, m.cols, m.rows);
  const corners = [{ col: 2, row: 2 }, { col: 12, row: 2 }, { col: 12, row: 12 }, { col: 2, row: 12 }];
  assert.doesNotThrow(() => drawMinimap(mockCtx(), mm, m, corners));
});

// --- the demand indicator ------------------------------------------------------------------
import { buildDemand, overDemand, drawDemand } from '../src/overlays.js';
import { makeSim } from '../src/sim.js';

test('the demand indicator sits bottom-left above its inset and hit-tests', () => {
  const d = buildDemand(1280, 800, { bottomInset: 28 });
  assert.equal(d.frame.x, 8);
  assert.ok(d.frame.y + d.frame.h <= 800 - 28);
  assert.equal(overDemand(d, d.frame.x + 4, d.frame.y + 4), true);
  assert.equal(overDemand(d, d.frame.x + d.frame.w + 40, d.frame.y), false);
});

test('drawDemand renders R/C/I bars and a class mix for a live sim without error', () => {
  const m = townMap();
  for (let c = 1; c <= 8; c++) applyTool(m, TOOL.ROAD, c, 3);
  applyTool(m, TOOL.ZONE_R, 4, 2);
  const sim = makeSim(m, { seed: 'demand' });
  for (let i = 0; i < 20; i++) sim.step();
  assert.doesNotThrow(() => drawDemand(mockCtx(), buildDemand(1280, 800), sim));
  // and an empty town (no residents) must not divide by zero.
  const empty = makeSim(townMap(), {});
  assert.doesNotThrow(() => drawDemand(mockCtx(), buildDemand(1280, 800), empty));
});

// --- The Innsmouth Courier overlays --------------------------------------------------------
import {
  buildCourierTicker, overCourierTicker, drawCourierTicker,
  buildCourierWindow, courierHit, overCourier, drawCourierWindow,
  buildEndScreen, endScreenHit, drawEndScreen,
} from '../src/overlays.js';

test('the Courier ticker spans the width under the top bar and hit-tests', () => {
  const tk = buildCourierTicker(1280, 26);
  assert.equal(tk.frame.x, 0);
  assert.equal(tk.frame.y, 26);
  assert.equal(tk.frame.w, 1280);
  assert.equal(overCourierTicker(tk, 40, 26 + 4), true);
  assert.equal(overCourierTicker(tk, 40, 26 + tk.frame.h + 40), false);
});

test('the ticker draws with and without a latest headline', () => {
  const tk = buildCourierTicker(1280, 26);
  assert.doesNotThrow(() => drawCourierTicker(mockCtx(), tk, null));
  assert.doesNotThrow(() => drawCourierTicker(mockCtx(), tk, { headline: 'THE TIDE TAKES THE LOWER WARD' }));
});

test('the Courier window centres, hit-tests its close, and draws headlines', () => {
  const w = buildCourierWindow(1280, 800);
  assert.deepEqual(courierHit(w, w.close.x + 2, w.close.y + 2), { type: 'close' });
  assert.equal(courierHit(w, w.frame.x + w.frame.w / 2, w.frame.y + w.frame.h / 2), null);
  assert.equal(overCourier(w, w.frame.x + 4, w.frame.y + 4), true);
  const events = [
    { kind: 'wrath', headline: 'FIRE AND RIOT RUN THE STREETS', sub: 'The mob has the torches.', year: 1929, month: 5 },
    { kind: 'growth', headline: 'INNSMOUTH NUMBERS 100 SOULS', sub: 'The town grows.', year: 1928, month: 2 },
  ];
  assert.doesNotThrow(() => drawCourierWindow(mockCtx(), w, events));
  assert.doesNotThrow(() => drawCourierWindow(mockCtx(), w, [])); // the quiet-town case
});

test('the loss plate offers New Game and hit-tests it', () => {
  const es = buildEndScreen(1280, 800);
  assert.ok(es.restart, 'the plate carries a restart control');
  assert.ok(es.restart.y + es.restart.h <= es.frame.y + es.frame.h);
  assert.ok(es.restart.x >= es.frame.x);
  assert.deepEqual(endScreenHit(es, es.restart.x + 4, es.restart.y + 4), { type: 'new' });
  assert.equal(endScreenHit(es, es.frame.x + 2, es.frame.y + 2), null);
  assert.doesNotThrow(() => drawEndScreen(mockCtx(), es, { kind: 'doom', year: 1954, month: 3, awakenings: 4 }, 1927));
});
