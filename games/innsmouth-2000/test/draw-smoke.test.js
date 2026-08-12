import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GameMap, TERRAIN } from '../src/mapgen.js';
import { TOOL, applyTool } from '../src/tools.js';
import { makeSim } from '../src/sim.js';
import { makeCamera } from '../src/camera.js';
import { drawAmbient } from '../src/render.js';
import { scanAmbientSites, ambientWorldBounds, computeAmbient } from '../src/ambient.js';
import {
  buildToolbar, drawToolbar, TOOLBAR_TOOLS,
  buildTopBar, drawTopBar,
  buildBudgetWindow, drawBudgetWindow,
  buildFavorWindow, drawFavorWindow,
  buildDisasterMenu, drawDisasterMenu,
  buildQueryWindow, drawQueryWindow,
  buildTitleScreen, drawTitleScreen,
} from '../src/ui.js';

// A recording mock of a 2D canvas context: every draw method is a no-op, measureText returns a
// width, and the style/font properties are plain assignable fields. Its purpose is to catch the
// browser-only reference errors that node --test would otherwise miss (an unimported palette
// constant used inside a draw call, a bad property, a missing method).
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

function townMap(cols = 20, rows = 20) {
  const m = new GameMap(cols, rows);
  for (let i = 0; i < cols * rows; i++) {
    m.tiles[i] = { terrain: TERRAIN.GRASS, elevation: 1, object: null, zone: null, building: null, structure: null };
  }
  for (let r = 0; r < rows; r++) m.tileAt(0, r).terrain = TERRAIN.DEEP; // a waterfront
  return m;
}

test('the toolbar and every tool icon draw without a reference error', () => {
  const ctx = mockCtx();
  const tb = buildToolbar({ y: 34 });
  for (const t of TOOLBAR_TOOLS) {
    assert.doesNotThrow(() => drawToolbar(ctx, tb, t.tool), `drawing with ${t.tool} active`);
  }
});

test('the top bar and its meters draw for a live sim (both motion states)', () => {
  const ctx = mockCtx();
  const sim = makeSim(townMap(), { dread: 42 });
  sim.step();
  assert.doesNotThrow(() => drawTopBar(ctx, buildTopBar(1280), sim, sim.speed, false, false));
  assert.doesNotThrow(() => drawTopBar(ctx, buildTopBar(1280), sim, sim.speed, true, true));
});

test('the ambient living world draws over a town without a reference error', () => {
  const ctx = mockCtx();
  const m = townMap(24, 24);
  for (let c = 2; c <= 20; c++) applyTool(m, TOOL.ROAD, c, 10);
  applyTool(m, TOOL.SHRINE, 8, 12);
  const sites = scanAmbientSites(m);
  const bounds = ambientWorldBounds(m);
  const camera = makeCamera({ mapCols: 24, mapRows: 24, viewportW: 1280, viewportH: 800 });
  for (const zoom of [0.5, 1, 2]) {
    camera.setZoom(zoom);
    const amb = computeAmbient(sites, bounds, 7000);
    assert.doesNotThrow(() => drawAmbient(ctx, amb, camera), `ambient at ${zoom}x`);
  }
  // The stilled world (reduced motion) draws nothing, but must not throw either.
  const still = computeAmbient(sites, bounds, 7000, { reducedMotion: true });
  assert.doesNotThrow(() => drawAmbient(ctx, still, camera));
  assert.doesNotThrow(() => drawAmbient(ctx, null, camera)); // and a null guard
});

test('all chrome windows draw without error, including omen states', () => {
  const ctx = mockCtx();
  const m = townMap();
  applyTool(m, TOOL.SHRINE, 5, 5);
  const sim = makeSim(m, {});
  sim.step();
  sim.favor.dagon = 8; // dire; drives the omen branch in the favor window
  sim.favor.shub = 25; // omen
  assert.doesNotThrow(() => drawBudgetWindow(ctx, buildBudgetWindow(1280, 800), sim));
  assert.doesNotThrow(() => drawFavorWindow(ctx, buildFavorWindow(1280, 800), sim));
  assert.doesNotThrow(() => drawDisasterMenu(ctx, buildDisasterMenu(1280, 800)));
  const desc = { title: 'Lot', lines: ['Ground: Marsh grass', 'Growing.'] };
  assert.doesNotThrow(() => drawQueryWindow(ctx, buildQueryWindow(40, 40, { lines: desc.lines.length }), desc));
  assert.doesNotThrow(() => drawTitleScreen(ctx, buildTitleScreen(1280, 800, { canContinue: true })));
});
