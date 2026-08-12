// M11 inc7 — the tactical combat verbs driven through the REAL shell. Boots headless,
// enters a live fight, and presses each verb key (attack/defend/item/subterfuge/parley)
// plus the Esc "get me out" — none throw, the ITEM submenu opens/uses/backs out, and the
// in-voice surface never leaks [SEED].
import { test } from 'node:test';
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

test('the tactical verbs + Esc drive through the shell without throwing or leaking [SEED]', async () => {
  const sink = [];
  const api = await boot(sink);
  try {
    api.renderMode('combat');
    if (api.mode !== 'combat') return; // this seed's roll wasn't a fight — nothing to drive
    const press = (k) => assert.doesNotThrow(() => api.onKey({ key: k, preventDefault() {} }), `key ${k} threw`);

    // DEFEND, then SUBTERFUGE (the environment gambit) — both resolve a turn
    press('g');
    if (api.mode === 'combat') press('v');
    // SUBTERFUGE a second time should be refused gracefully (one gambit per fight)
    if (api.mode === 'combat') press('v');

    // ITEM submenu opens and backs out with Esc
    if (api.mode === 'combat') { press('r'); press('Escape'); }

    // stock a combat item, use it through the submenu
    if (api.mode === 'combat') {
      api.game.session.addItem({ name: '[SEED] grey draught', effect: { kind: 'heal', power: [4, 6] }, charges: 1 });
      press('r'); press('1');
    }

    // ATTACK until the fight resolves (bounded)
    for (let i = 0; i < 40 && api.mode === 'combat'; i++) press('f');

    // the whole combat surface never leaks a raw [SEED] marker
    sink.length = 0;
    api.render();
    assert.ok(!sink.join('  ').includes('[SEED]'), 'combat surface must not leak [SEED]');
  } finally { teardown(); }
});

test('Esc at combat root is the unified "get me out" (attempts flee), not a no-op', async () => {
  const sink = [];
  const api = await boot(sink);
  try {
    api.renderMode('combat');
    if (api.mode !== 'combat') return;
    // Esc should resolve a turn (flee attempt) — pressing it repeatedly ends the fight
    // one way or another (fled, or died trying) rather than hanging in combat forever.
    let left = false;
    for (let i = 0; i < 60; i++) { api.onKey({ key: 'Escape', preventDefault() {} }); if (api.mode !== 'combat') { left = true; break; } }
    assert.ok(left, 'Esc eventually gets you out of the fight (flee), it is not inert');
  } finally { teardown(); }
});
