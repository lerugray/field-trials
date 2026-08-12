// Headless render smoke (M6 REOPEN — the full-window frame, ADDENDUM 2).
//
// boot-smoke proves the module graph loads; this proves boot()'s RENDER pipeline
// actually runs. We mock a permissive 2D canvas + window/document, boot the game,
// and drive every mode's render through the real frame compositor (scene viewport
// + side HUD panel + bottom console strip). A broken paintPanel/paintConsole/
// centred draw or a stale symbol throws here — so the full-window layout is
// regression-covered, not just eyeballed in a screenshot.
import test from 'node:test';
import assert from 'node:assert/strict';
import { computeFrame } from '../src/engine/frame.js';

// A 2D context that accepts every call the render pipeline makes and records
// nothing — we only care that no path throws.
function mockCtx() {
  const noop = () => {};
  return {
    fillStyle: '#000', strokeStyle: '#000', lineWidth: 1, globalAlpha: 1, font: '14px monospace',
    save: noop, restore: noop, translate: noop, scale: noop, clip: noop,
    fillRect: noop, strokeRect: noop, clearRect: noop,
    beginPath: noop, rect: noop, moveTo: noop, lineTo: noop, closePath: noop, stroke: noop, fill: noop, arc: noop,
    fillText: noop, strokeText: noop,
    measureText: (t) => ({ width: String(t).length * 7 }),
    createRadialGradient: () => ({ addColorStop: noop }),
    createLinearGradient: () => ({ addColorStop: noop }),
  };
}

function mockCanvas() {
  return { width: 0, height: 0, style: {}, getContext: () => mockCtx(), addEventListener: () => {} };
}

// Set up the DOM globals a browser would provide, boot the game, and hand back
// the test conduit boot() returns. Import happens with window UNSET so the module
// never auto-boots — we boot explicitly and once.
async function bootHeadless(vpW = 1440, vpH = 900) {
  delete global.window;
  const { boot } = await import('../src/main.js');
  const listeners = {};
  const canvas = mockCanvas();
  const stub = { textContent: '', style: {} };
  global.window = {
    innerWidth: vpW, innerHeight: vpH,
    addEventListener: (type, fn) => { listeners[type] = fn; },
  };
  global.document = {
    readyState: 'complete',
    getElementById: (id) => (id === 'screen' ? canvas : (id === 'title' ? null : stub)),
  };
  const store = {};
  global.localStorage = {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
  };
  const api = boot();
  return { api, canvas, listeners };
}

function teardown() {
  delete global.window; delete global.document; delete global.localStorage;
}

const MODES = ['title', 'creation', 'overworld', 'dungeon', 'city', 'building', 'journal', 'combat', 'dungeonEnc', 'death'];

test('boot() renders every mode through the full-window frame without throwing', async () => {
  const { api } = await bootHeadless();
  try {
    for (const m of MODES) {
      assert.doesNotThrow(() => api.renderMode(m), `mode "${m}" render threw`);
    }
  } finally { teardown(); }
});

test('the canvas backing is sized to the responsive frame (no fixed 416 square)', async () => {
  for (const vp of [{ w: 1280, h: 800 }, { w: 1440, h: 900 }, { w: 2560, h: 1440 }]) {
    const { canvas } = await bootHeadless(vp.w, vp.h);
    try {
      const f = computeFrame(vp.w, vp.h);
      assert.equal(canvas.width, f.W, `backing width tracks frame at ${vp.w}x${vp.h}`);
      assert.equal(canvas.height, f.H, `backing height tracks frame at ${vp.w}x${vp.h}`);
      assert.ok(canvas.width !== canvas.height, 'backing is not square (fills widescreen)');
    } finally { teardown(); }
  }
});

test('a resize recomputes the frame and re-renders without throwing', async () => {
  const { api, canvas } = await bootHeadless(1280, 800);
  try {
    global.window.innerWidth = 2560; global.window.innerHeight = 1440;
    assert.doesNotThrow(() => { api.applyDisplay(); api.render(); });
    const f = computeFrame(2560, 1440);
    assert.equal(canvas.width, f.W);
  } finally { teardown(); }
});

test('the keydown conduit drives input in every mode without throwing', async () => {
  const { api } = await bootHeadless();
  try {
    const press = (key) => api.onKey({ key, preventDefault() {} });
    // title -> creation -> accept with Space -> embark with E, walk WASD, global keys,
    // then the journal surface: open [Q], write [N] "hi" [Enter], select [W],
    // revise [E] -> "ho" [Enter], close [Esc] — exercising the write AND edit
    // path (M7) — then [?] help. The WASD-centric bindings (ADDENDUM 3).
    const seq = [' ', ' ', 'e', 'w', 'a', 's', 'd', 'p', 'c', '+', '-',
      'q', 'n', 'h', 'i', 'Enter', 'w', 's', 'e', 'Backspace', 'o', 'Enter', 'Escape', '?', 'Escape'];
    for (const k of seq) {
      assert.doesNotThrow(() => press(k), `key "${k}" threw`);
    }
  } finally { teardown(); }
});

test('creation requires accept then a distinct embark input (confirm-mash stays put)', async () => {
  const { api } = await bootHeadless();
  try {
    const press = (key) => api.onKey({ key, preventDefault() {} });
    press(' '); // title -> creation
    assert.equal(api.mode, 'creation');
    press(' '); // accept
    assert.equal(api.mode, 'creation', 'accepting the stranger does not embark');
    press(' '); // mash confirm again
    assert.equal(api.mode, 'creation', 'repeated confirm cannot skip rerolls/acceptance');
    press('e');
    assert.equal(api.mode, 'overworld', 'the distinct embark input starts the run');
  } finally { teardown(); }
});
