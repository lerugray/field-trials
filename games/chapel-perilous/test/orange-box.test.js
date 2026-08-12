// M8 REOPEN regression — the "orange box" defect.
//
// Ray, playing an earlier build: "there was a random orange box around the PC."
// Orchestrator capture confirmed bare accent-hue rectangles stroked around the PC
// AND around faint beast sprites (reading as boxes on apparently-empty tiles).
// The cause was two raw `strokeRect(...)` calls in the world render — a party
// "you are here" ring and a beast danger ring — both in the accent hue.
//
// The fix removed both. Entity accent is now a DESIGNED sprite element painted
// through the deterministic `accentPixel` FILL channel (tiledraw.js), which only
// ever paints pixels a sprite actually has. This test locks it: (1) the accent
// channel is a fill, never a stroke, and never touches an empty pixel; (2) no
// accent-hue strokeRect draw path is reachable in the world (overworld/city)
// render — so a re-introduced bare accent box fails CI, not just the eye.
import test from 'node:test';
import assert from 'node:assert/strict';
import { drawArt } from '../src/engine/tiledraw.js';
import { createPalettes } from '../src/engine/palette.js';
import palettesData from '../data/palettes.json' with { type: 'json' };

// The full set of accent-hue strings any scheme can produce (the render might be
// on any palette). A world strokeRect matching one of these is the defect.
function accentColorSet() {
  const pal = createPalettes(palettesData);
  const set = new Set();
  for (const id of pal.ids()) {
    for (const t of [1, 0.95, 0.85, 0.8]) set.add(pal.accentColor(id, t));
  }
  return set;
}

// A 2D ctx that records strokeRect (with the live strokeStyle) and fillRect
// (with the live fillStyle) and no-ops everything else the pipeline calls.
function recordingCtx() {
  const noop = () => {};
  const strokes = [];
  const fills = [];
  const ctx = {
    fillStyle: '#000', strokeStyle: '#000', lineWidth: 1, globalAlpha: 1, font: '14px monospace',
    save: noop, restore: noop, translate: noop, scale: noop, clip: noop,
    strokeRect(x, y, w, h) { strokes.push({ x, y, w, h, style: this.strokeStyle }); },
    fillRect(x, y, w, h) { fills.push({ x, y, w, h, style: this.fillStyle }); },
    clearRect: noop,
    beginPath: noop, rect: noop, moveTo: noop, lineTo: noop, closePath: noop, stroke: noop, fill: noop, arc: noop,
    fillText: noop, strokeText: noop,
    measureText: (t) => ({ width: String(t).length * 7 }),
    createRadialGradient: () => ({ addColorStop: noop }),
    createLinearGradient: () => ({ addColorStop: noop }),
  };
  return { ctx, strokes, fills };
}

test('the accentPixel channel is a solid FILL that only paints the sprite (never a stroked box)', () => {
  const { ctx, strokes, fills } = recordingCtx();
  // A 3x3 grid: a single shade-4 pixel in the centre, transparent (-1) around it.
  const grid = [[-1, -1, -1], [-1, 4, -1], [-1, -1, -1]];
  const shadeColor = (s) => `rgb(${s * 10},${s * 10},${s * 10})`;
  drawArt(ctx, grid, 0, 0, 4, shadeColor, null, { shade: 4, color: '#ff8800' });
  // No box was stroked; exactly one accent fill landed, on the one lit pixel.
  assert.equal(strokes.length, 0, 'accent must never stroke a rectangle');
  const accentFills = fills.filter((f) => f.style === '#ff8800');
  assert.equal(accentFills.length, 1, 'exactly the one shade-4 pixel lights accent');
  // It painted a cell, not a full-tile frame, and only where the sprite had a pixel.
  assert.deepEqual(
    { x: accentFills[0].x, y: accentFills[0].y },
    { x: 4, y: 4 },
    'accent lands on the centre sprite pixel, not an empty one',
  );
});

// ---- Behavioural: boot the real shell and render the world through a recorder.

async function bootWorldRecorder() {
  delete global.window;
  const { boot } = await import('../src/main.js');
  const { ctx, strokes, fills } = recordingCtx();
  const canvas = { width: 0, height: 0, style: {}, getContext: () => ctx, addEventListener: () => {} };
  const stub = { textContent: '', style: {} };
  global.window = { innerWidth: 1440, innerHeight: 900, addEventListener: () => {} };
  global.document = {
    readyState: 'complete',
    getElementById: (id) => (id === 'screen' ? canvas : (id === 'title' ? null : stub)),
  };
  const store = {};
  global.localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } };
  const api = boot();
  return { api, strokes, fills };
}

function teardown() { delete global.window; delete global.document; delete global.localStorage; }

test('no accent-hue strokeRect is reachable in the overworld or city world render', async () => {
  const accents = accentColorSet();
  const { api, strokes } = await bootWorldRecorder();
  try {
    for (const mode of ['overworld', 'city']) {
      strokes.length = 0;
      api.renderMode(mode);
      const bareAccentBoxes = strokes.filter((s) => accents.has(s.style));
      assert.equal(
        bareAccentBoxes.length, 0,
        `world render "${mode}" stroked ${bareAccentBoxes.length} accent-hue rectangle(s) — the orange-box defect`,
      );
    }
  } finally { teardown(); }
});
