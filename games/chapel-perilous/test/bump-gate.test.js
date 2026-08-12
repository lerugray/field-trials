// M10 A1 — the blocked-bump-is-not-a-step gate, as a harness test (the directive
// asked for a "proper harness test for the gate if feasible"). Root cause of
// Ray's "encounter every 2 squares at the fen edge": a move blocked by impassable
// terrain used to still tick the clock, take the wanderers' turn, and roll the
// invisible encounter tail. Fixed in 363c914 by short-circuiting on !mv.moved.
// This drives the REAL keydown handler headlessly and proves a bump advances
// nothing, while a successful step does.
import { test } from 'node:test';
import assert from 'node:assert/strict';

// Same permissive canvas/window mock the render-smoke harness uses.
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

async function bootHeadless(vpW = 1440, vpH = 900) {
  delete global.window;
  const { boot } = await import('../src/main.js');
  const canvas = { width: 0, height: 0, style: {}, getContext: () => mockCtx(), addEventListener: () => {} };
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

// key that drives cardinal dir d (WASD primary, per bindings.js)
const KEY = { N: 'w', S: 's', E: 'd', W: 'a' };

test('a blocked overworld bump advances NOTHING; a real step advances the tick', async () => {
  const api = await bootHeadless();
  const { game } = api;
  assert.ok(game, 'conduit exposes game');
  api.renderMode('overworld'); // boot lands on the title screen — enter the map
  const { world, party } = game;

  // Find a direction from the party that is BLOCKED by impassable terrain.
  const dirs = { N: [0, -1], S: [0, 1], E: [1, 0], W: [-1, 0] };
  let blockedDir = null, openDir = null;
  for (const [d, [dx, dy]] of Object.entries(dirs)) {
    const passable = world.passable(party.x + dx, party.y + dy);
    if (!passable && !blockedDir) blockedDir = d;
    if (passable && !openDir) openDir = d;
  }

  const press = (key) => api.onKey({ key, preventDefault() {} });

  if (blockedDir) {
    const t0 = game.tick, x0 = party.x, y0 = party.y;
    press(KEY[blockedDir]);
    assert.equal(game.tick, t0, 'blocked bump must NOT bump the tick');
    assert.equal(party.x, x0, 'blocked bump must not move the party (x)');
    assert.equal(party.y, y0, 'blocked bump must not move the party (y)');
  }

  // And a genuine step MUST advance the clock (proves the gate isn't just frozen).
  if (openDir) {
    const t1 = game.tick;
    press(KEY[openDir]);
    assert.equal(game.tick, t1 + 1, 'a real step advances the tick by one');
  }
});
