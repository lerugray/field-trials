// Playtest2 rest gating — rest is refused outside safe locations (inn/shrine). The
// overworld [R] key no longer heals, advances the clock, or rolls the ambush tail.
// Field recovery is consumable-only via the inventory [U]se verb.
import { test } from 'node:test';
import assert from 'node:assert/strict';

function mockCtx() {
  const noop = () => {};
  return {
    fillStyle: '#000', strokeStyle: '#000', lineWidth: 1, globalAlpha: 1, font: '14px monospace',
    save: noop, restore: noop, translate: noop, scale: noop, clip: noop,
    fillRect: noop, strokeRect: noop, clearRect: noop,
    beginPath: noop, rect: noop, moveTo: noop, lineTo: noop, closePath: noop, stroke: noop, fill: noop, arc: noop,
    fillText: noop, strokeText: noop, measureText: (t) => ({ width: String(t).length * 7 }),
    createRadialGradient: () => ({ addColorStop: noop }), createLinearGradient: () => ({ addColorStop: noop }),
  };
}

async function bootHeadless() {
  delete global.window;
  const { boot } = await import('../src/main.js');
  const canvas = { width: 0, height: 0, style: {}, getContext: () => mockCtx(), addEventListener: () => {} };
  const stub = { textContent: '', style: {} };
  global.window = { innerWidth: 1440, innerHeight: 900, addEventListener: () => {} };
  global.document = { readyState: 'complete', getElementById: (id) => (id === 'screen' ? canvas : (id === 'title' ? null : stub)) };
  global.localStorage = { getItem: () => null, setItem: () => {} };
  return boot();
}

const press = (api, key) => api.onKey({ key, preventDefault() {} });

test('overworld [R] is refused and does not heal or advance the clock', async () => {
  const api = await bootHeadless();
  api.renderMode('overworld');
  const g = api.game;
  const t0 = g.tick;
  g.session.pc.hp = 1;
  press(api, 'r');
  assert.equal(api.mode, 'overworld', 'wild rest stays in overworld');
  assert.equal(g.session.pc.hp, 1, 'wild rest heals nothing');
  assert.equal(g.tick, t0, 'wild rest does not advance the clock');
});

test('repeated wild rests never trigger combat', async () => {
  const api = await bootHeadless();
  api.renderMode('overworld');
  const g = api.game;
  const far = g.world.nearestOpen(g.start.x + 25, g.start.y + 25);
  g.party.moveTo(far.x, far.y);
  for (let i = 0; i < 200; i++) {
    g.session.pc.hp = g.session.pc.maxHp;
    press(api, 'r');
    assert.equal(api.mode, 'overworld', `rest ${i} stayed in overworld`);
  }
});

test('field recovery uses a consumable heal item outside combat', async () => {
  const api = await bootHeadless();
  api.renderMode('overworld');
  const g = api.game;
  g.session.pc.hp = 1;
  const it = g.session.addItem({ name: '[SEED] a small tonic', effect: { kind: 'heal', power: [2, 4] }, charges: 1, tags: ['consumable'] });
  // open pack, select the tonic, use it
  press(api, 'i');
  press(api, 'u');
  assert.ok(g.session.pc.hp > 1, 'consumable healed the PC');
  assert.ok(g.session.pc.hp <= g.session.pc.maxHp, 'heal capped at max');
  assert.equal(g.session.items().some((x) => x.uid === it.uid), false, 'the consumable was spent');
});
