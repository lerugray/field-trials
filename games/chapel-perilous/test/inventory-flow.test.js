// M10 Part B — the inventory surface, driven through the real shell. Proves the
// [I] pack overlay opens from a nav mode, lists what you carry, equips a weapon
// (power from items — the PC weapon actually changes), and never leaks [SEED].
import { test } from 'node:test';
import assert from 'node:assert/strict';

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

async function bootHeadless(sink) {
  delete global.window;
  const { boot } = await import('../src/main.js');
  const canvas = { width: 0, height: 0, style: {}, getContext: () => recordingCtx(sink), addEventListener: () => {} };
  const stub = { textContent: '', style: {} };
  global.window = { innerWidth: 1440, innerHeight: 900, addEventListener: () => {} };
  global.document = { readyState: 'complete', getElementById: (id) => (id === 'screen' ? canvas : (id === 'title' ? null : stub)) };
  global.localStorage = { getItem: () => null, setItem: () => {} };
  return boot();
}

const press = (api, key) => api.onKey({ key, preventDefault() {} });

test('the [I] pack overlay opens, lists items, equips a weapon, no [SEED] leak', async () => {
  const sink = [];
  const api = await bootHeadless(sink);
  api.renderMode('overworld');
  const s = api.game.session;

  // stock the pack with a relic and a stronger weapon
  s.addItem({ kind: 'relic', name: '[SEED] Hagbard’s Compass', artifact: 'hagbards-compass' });
  s.addItem({ kind: 'weapon', name: '[SEED] a keening blade', weapon: { name: 'keening blade', dmg: [9, 9] } });
  const startWeaponDmg = s.pc.weapon.dmg.join('-');

  // open the pack
  sink.length = 0;
  press(api, 'i');
  const shown = sink.join('  ');
  assert.ok(/the pack/i.test(shown), 'the pack overlay renders its header');
  assert.ok(shown.includes('Hagbard'), 'the pack lists the relic');
  assert.ok(shown.includes('keening blade'), 'the pack lists the weapon');
  assert.ok(!shown.includes('[SEED]'), 'the pack overlay must not leak [SEED]');

  // select the weapon (row 2) and equip it
  press(api, 's'); // move highlight down to the weapon
  press(api, 'e'); // equip
  assert.equal(s.pc.weapon.dmg.join('-'), '9-9', 'equipping the blade changed the PC weapon');
  assert.notEqual(s.pc.weapon.dmg.join('-'), startWeaponDmg, 'the weapon actually changed');

  // close it
  press(api, 'Escape');
  sink.length = 0;
  api.render();
  assert.ok(!sink.join('  ').includes('the pack'), 'the pack overlay closes');
});

test('an empty pack reads as empty, not broken', async () => {
  const sink = [];
  const api = await bootHeadless(sink);
  api.renderMode('overworld');
  sink.length = 0;
  press(api, 'i');
  assert.ok(/empty/i.test(sink.join('  ')), 'an empty pack says so');
});
