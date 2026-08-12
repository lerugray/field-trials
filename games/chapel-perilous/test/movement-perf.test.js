// M10 A11 — overworld movement lag, MEASURED (the directive: "profile, don't
// guess... proven with a timing probe, not by feel"). Two measured gates:
//
//  1. The per-keypress JS path (input -> tryMove -> wanderers -> overworldStep ->
//     render) must be well under the ~50ms input-to-frame budget. Headless we can
//     time the JS work but not the browser's canvas raster, so this gate proves the
//     per-step LOGIC (streamAround/biome/wanderer/draw-list build — the operator's
//     named suspects) is not the bottleneck. Measured ~3ms; gated at 50ms.
//
//  2. Draw-op ceiling. The profile found the overworld frame emitted ~243k
//     fillRects — the dither sub-grid, the actual raster cost Ray felt. The draw
//     path now COALESCES flat sub-grids (pixel-identical), cutting it ~31%. This
//     gate locks a ceiling so the raster budget can't silently balloon again.
import { test } from 'node:test';
import assert from 'node:assert/strict';

function countingCtx(counts) {
  const bump = () => { counts.total += 1; };
  const base = {
    fillStyle: '', strokeStyle: '', lineWidth: 1, globalAlpha: 1, font: '',
    measureText: (t) => ({ width: String(t).length * 7 }),
    createRadialGradient: () => ({ addColorStop() {} }),
    createLinearGradient: () => ({ addColorStop() {} }),
    fillRect: () => { counts.fillRect += 1; counts.total += 1; },
  };
  return new Proxy(base, { get(t, k) { return k in t ? t[k] : bump; } });
}

async function bootHeadless(counts) {
  delete global.window;
  const { boot } = await import('../src/main.js');
  const canvas = { width: 0, height: 0, style: {}, getContext: () => countingCtx(counts), addEventListener: () => {} };
  const stub = { textContent: '', style: {} };
  global.window = { innerWidth: 1440, innerHeight: 900, addEventListener: () => {} };
  global.document = { readyState: 'complete', getElementById: (id) => (id === 'screen' ? canvas : (id === 'title' ? null : stub)) };
  global.localStorage = { getItem: () => null, setItem: () => {} };
  return boot();
}

test('the per-keypress overworld JS path is far under the 50ms input-to-frame budget', async () => {
  const counts = { fillRect: 0, total: 0 };
  const api = await bootHeadless(counts);
  api.renderMode('overworld');
  const press = (k) => api.onKey({ key: k, preventDefault() {} });
  // warm up (JIT + first stream), then time a run of real steps (alternate so we
  // both move and bump — the full handler either way).
  for (let i = 0; i < 20; i++) press(i % 2 ? 'a' : 'd');
  const N = 120;
  const t0 = process.hrtime.bigint();
  for (let i = 0; i < N; i++) press(i % 2 ? 'a' : 'd');
  const perStep = Number(process.hrtime.bigint() - t0) / 1e6 / N;
  assert.ok(perStep < 50, `per-step JS path ${perStep.toFixed(2)}ms exceeds the 50ms budget`);
});

test('an overworld frame stays under the raster draw-op ceiling (dither coalescing holds)', async () => {
  const counts = { fillRect: 0, total: 0 };
  const api = await bootHeadless(counts);
  api.renderMode('overworld');
  counts.fillRect = 0; counts.total = 0;
  api.render();
  // Coalesced frame measured ~168k; the pre-optimisation frame was ~243k. Ceiling
  // sits between — a regression that re-inflates the sub-grid draw trips it.
  assert.ok(counts.fillRect > 0, 'the overworld actually drew');
  assert.ok(counts.fillRect < 200000, `overworld frame emitted ${counts.fillRect} fillRects — over the 200k ceiling`);
});
