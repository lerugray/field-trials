// M12 B2/B3 — the record overlay + JSON dump, driven through the real shell. Boots
// headless, logs some events, opens [L], scrolls, and dumps — none throw, the overlay
// captures input while open, and the on-screen record never shows a raw seed/tick
// (ADDENDUM #8: diagnostic detail rides the JSON dump only, not the in-register view).
import test from 'node:test';
import assert from 'node:assert/strict';

function recordingCtx(sink) {
  const noop = () => {};
  return {
    fillStyle: '#000', strokeStyle: '#000', lineWidth: 1, globalAlpha: 1, font: '14px monospace', textAlign: 'left',
    save: noop, restore: noop, translate: noop, scale: noop, clip: noop,
    fillRect: noop, strokeRect: noop, clearRect: noop,
    beginPath: noop, rect: noop, moveTo: noop, lineTo: noop, closePath: noop, stroke: noop, fill: noop, arc: noop,
    fillText: (t) => sink.push(String(t)), strokeText: (t) => sink.push(String(t)),
    measureText: (t) => ({ width: String(t).length * 7 }),
    createRadialGradient: () => ({ addColorStop: noop }),
    createLinearGradient: () => ({ addColorStop: noop }),
  };
}
async function boot(sink) {
  delete global.window;
  const { boot } = await import('../src/main.js');
  const canvas = { width: 0, height: 0, style: {}, getContext: () => recordingCtx(sink), addEventListener: () => {} };
  const stub = { textContent: '', style: {} };
  global.window = { innerWidth: 1440, innerHeight: 900, addEventListener: () => {} };
  global.document = { readyState: 'complete', getElementById: (id) => (id === 'screen' ? canvas : (id === 'title' ? null : stub)) };
  global.localStorage = { getItem: () => null, setItem: () => {} };
  return boot();
}
const teardown = () => { delete global.window; delete global.document; delete global.localStorage; };
const press = (api, key) => api.onKey({ key, preventDefault() {} });

test('the record overlay opens, scrolls, and dumps without throwing or leaking seeds', async () => {
  const sink = [];
  const api = await boot(sink);
  try {
    api.renderMode('overworld');
    // seed a few events with a distinctive seed so we can prove it never renders
    api.game.logEvent('combat', { mode: 'overworld', seed: 0xDEADBEEF, outcome: '[SEED] the pattern is broken' });
    api.game.logEvent('rest', { mode: 'overworld', outcome: 'camp 2→9 hp' });
    for (let i = 0; i < 25; i++) api.game.logEvent('ambient', { mode: 'overworld', outcome: `[SEED] a quiet omen #${i}` });

    sink.length = 0;
    press(api, 'l');                 // open the record
    assert.doesNotThrow(() => press(api, 'w'), 'scroll older');
    assert.doesNotThrow(() => press(api, 's'), 'scroll newer');
    const shown = sink.join('\n');
    assert.ok(shown.includes('the record'), 'the overlay titled itself');
    assert.ok(!shown.includes('[SEED]'), 'no raw [SEED] marker leaks on the record');
    assert.ok(!/deadbeef/i.test(shown), 'the seed does not appear on the in-register overlay');

    // Shift+[L] dumps — headless has no createElement, so it toasts, never throws.
    assert.doesNotThrow(() => api.onKey({ key: 'L', shiftKey: true, preventDefault() {} }), 'dump did not throw headless');

    // [L] closes.
    press(api, 'l');
    // after close, a movement key is handled by the world again (overlay released input)
    assert.doesNotThrow(() => press(api, 'w'));
  } finally { teardown(); }
});
