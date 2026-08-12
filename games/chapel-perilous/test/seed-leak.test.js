// M10 A9 / item 14 — no [SEED] on ANY player-facing surface. The marker is dev
// traceability (rule 5), not register; Ray saw it leak into the live log across
// TWO playtests ("not sure that's intentional"), item 14 pinned it to the
// dungeon/first-person prose paths specifically. This drives the REAL render
// pipeline for every mode through a text-RECORDING ctx and asserts nothing drawn
// to the screen carries "[SEED]" — so a re-introduced leak fails CI, not the eye.
import { test } from 'node:test';
import assert from 'node:assert/strict';

// A ctx that records every string handed to fillText/strokeText, ignoring the
// rest. Same recording-ctx pattern the orange-box regression uses.
function recordingCtx(sink) {
  const noop = () => {};
  return {
    fillStyle: '#000', strokeStyle: '#000', lineWidth: 1, globalAlpha: 1, font: '14px monospace',
    save: noop, restore: noop, translate: noop, scale: noop, clip: noop,
    fillRect: noop, strokeRect: noop, clearRect: noop,
    beginPath: noop, rect: noop, moveTo: noop, lineTo: noop, closePath: noop, stroke: noop, fill: noop, arc: noop,
    fillText: (t) => sink.push(String(t)), strokeText: (t) => sink.push(String(t)),
    measureText: (t) => ({ width: String(t).length * 7 }),
    createRadialGradient: () => ({ addColorStop: noop }),
    createLinearGradient: () => ({ addColorStop: noop }),
  };
}

async function bootHeadless(sink, vpW = 1440, vpH = 900) {
  delete global.window;
  const { boot } = await import('../src/main.js');
  const canvas = { width: 0, height: 0, style: {}, getContext: () => recordingCtx(sink), addEventListener: () => {} };
  const stub = { textContent: '', style: {} };
  global.window = { innerWidth: vpW, innerHeight: vpH, addEventListener: () => {} };
  global.document = {
    readyState: 'complete',
    getElementById: (id) => (id === 'screen' ? canvas : (id === 'title' ? null : stub)),
  };
  const store = {};
  global.localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } };
  return boot();
}

const MODES = ['title', 'creation', 'overworld', 'dungeon', 'city', 'building', 'journal', 'combat', 'dungeonEnc', 'death'];

test('no rendered player surface contains the [SEED] marker, any mode', async () => {
  for (const m of MODES) {
    const sink = [];
    const api = await bootHeadless(sink);
    sink.length = 0; // ignore the initial title render
    api.renderMode(m);
    const leaks = sink.filter((s) => s.includes('[SEED]'));
    assert.equal(leaks.length, 0, `mode '${m}' leaked [SEED]: ${JSON.stringify(leaks.slice(0, 5))}`);
    delete global.window; delete global.document; delete global.localStorage;
  }
});
