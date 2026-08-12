// M10 item 13 — HUD parity in first-person. Ray's second playtest: "the HUD isn't
// really displaying / goes away in 1st person mode." The directive says VERIFY
// OBJECTIVELY FIRST (he partially retracted an adjacent claim in the same breath).
// Objective finding: paintPanel()/paintConsole() run UNCONDITIONALLY for every
// mode, and panelGroups() is mode-independent — so the side HUD has full parity in
// the dungeon. This test drives the real render through a text-recording ctx and
// proves the core HUD signals (party vitals + the record) draw in BOTH the
// overworld and the first-person dungeon, so a future change that thins the
// first-person HUD fails CI. No fix was needed; this locks the verified state.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { combatHudVitals } from '../src/main.js';

test('combat HUD reads the live PC combatant HP instead of stale session HP', () => {
  const sessionPc = { id: 'pc', name: 'Stranger', hp: 10, maxHp: 10 };
  const combat = {
    combatants: [
      { id: 'pc', side: 'party', hp: 4, maxHp: 10 },
      { id: 'foe', side: 'foe', hp: 3, maxHp: 3 },
    ],
  };
  assert.deepEqual(combatHudVitals(sessionPc, combat), { ...sessionPc, hp: 4, maxHp: 10 });
  assert.deepEqual(combatHudVitals(sessionPc, null), sessionPc);
});

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

function panelTextFor(api, sink, mode) {
  sink.length = 0;
  api.renderMode(mode);
  return sink.slice();
}

test('the side HUD has full parity in the first-person dungeon (item 13, verified)', async () => {
  const sink = [];
  const api = await bootHeadless(sink);

  const ow = panelTextFor(api, sink, 'overworld');
  const dg = panelTextFor(api, sink, 'dungeon');

  const has = (arr, re) => arr.some((s) => re.test(s));

  // Party vitals — the single most important always-on HUD signal.
  assert.ok(has(ow, /♥\s*\d+\/\d+/), 'overworld HUD shows party vitals');
  assert.ok(has(dg, /♥\s*\d+\/\d+/), 'first-person HUD shows party vitals (parity)');

  // The three standing HUD groups draw in the dungeon exactly as on the map.
  for (const re of [/the stranger/i, /where/i, /the record/i, /deaths/i]) {
    assert.ok(has(dg, re), `first-person HUD is missing a standing group: ${re}`);
  }

  // And the dungeon adds its mode-specific "facing" line — the HUD is not just
  // present but mode-aware, the opposite of "going away".
  assert.ok(has(dg, /facing/i), 'first-person HUD shows crawl facing');
});

test('the active Operation bearing is in the HUD before the first turn', async () => {
  const sink = [];
  const api = await bootHeadless(sink);
  const bearing = api.game.operationBearing();
  assert.ok(bearing && bearing.dir, 'fixture has an active Operation pointer');
  const ow = panelTextFor(api, sink, 'overworld');
  const text = ow.join('\n');
  assert.match(text, /where · operation 1/i);
  assert.match(text, /bearing ·/i);
  assert.ok(text.includes(bearing.dir), `HUD must show the computed compass word "${bearing.dir}"`);
});

test('crawl HUD paints live exposure accrual and its hostility tier', async () => {
  const sink = [];
  const api = await bootHeadless(sink);
  const before = panelTextFor(api, sink, 'dungeon').join('\n');
  assert.match(before, /exposure 0% · hostility I/i);
  api.game.session.accrueExposure(0.3);
  const expected = Math.round(api.game.exposure() * 100);
  const after = panelTextFor(api, sink, 'dungeon').join('\n');
  assert.ok(after.includes(`exposure ${expected}% · hostility II`), `HUD should advance to ${expected}% · II`);
});
