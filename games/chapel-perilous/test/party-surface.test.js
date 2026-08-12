// M12 D3 — the party-management surface. The draw list lists each follower (name,
// HP, want) without clipping; the shell overlay opens from a nav mode, selects, and
// dismisses the highlighted follower (roster.dismiss). Exposure of existing mechanics.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPartyDrawList } from '../src/engine/panels.js';
import { textWidth } from '../src/engine/layout.js';

test('buildPartyDrawList lists the pc and each follower without clipping', () => {
  const followers = [
    { id: 'gutter-clerk', name: '[SEED] Gutter Clerk', hp: 4, maxHp: 6, want: 'a stamp' },
    { id: 'fen-lantern', name: '[SEED] Fen Lantern', hp: 7, maxHp: 7, want: null },
  ];
  const rows = buildPartyDrawList({ pc: { name: '[SEED] Cyra', hp: 8, maxHp: 10 }, followers, sel: 1 }).filter((r) => r.text);
  const text = rows.map((r) => r.text).join('\n');
  assert.ok(/the party/.test(text));
  assert.ok(/Gutter Clerk/.test(text) && /Fen Lantern/.test(text), 'both followers listed');
  assert.ok(/wants a stamp/.test(text), 'wants surfaced');
  assert.ok(/▸ .*Fen Lantern/.test(text), 'the selected follower is marked');
  // no row runs past its column
  for (const r of rows) assert.ok(textWidth(r.text, r.size) <= (416 - 44) + 0.5, `clip: ${r.text}`);
});

test('an empty party reads gracefully', () => {
  const rows = buildPartyDrawList({ pc: { name: '[SEED] Solo', hp: 5, maxHp: 5 }, followers: [] }).filter((r) => r.text);
  assert.ok(rows.map((r) => r.text).join('\n').includes('no one walks with you yet'));
});

// --- shell: open, select, dismiss ------------------------------------------
function mockCtx() {
  const noop = () => {};
  return {
    fillStyle: '#000', strokeStyle: '#000', lineWidth: 1, globalAlpha: 1, font: '14px monospace', textAlign: 'left',
    save: noop, restore: noop, translate: noop, scale: noop, clip: noop,
    fillRect: noop, strokeRect: noop, clearRect: noop,
    beginPath: noop, rect: noop, moveTo: noop, lineTo: noop, closePath: noop, stroke: noop, fill: noop, arc: noop,
    fillText: noop, strokeText: noop, measureText: (t) => ({ width: String(t).length * 7 }),
    createRadialGradient: () => ({ addColorStop: noop }), createLinearGradient: () => ({ addColorStop: noop }),
  };
}
async function boot() {
  delete global.window;
  const { boot } = await import('../src/main.js');
  const canvas = { width: 0, height: 0, style: {}, getContext: () => mockCtx(), addEventListener: () => {} };
  const stub = { textContent: '', style: {} };
  global.window = { innerWidth: 1440, innerHeight: 900, addEventListener: () => {} };
  global.document = { readyState: 'complete', getElementById: (id) => (id === 'screen' ? canvas : (id === 'title' ? null : stub)) };
  global.localStorage = { store: {}, getItem(k) { return this.store[k] || null; }, setItem(k, v) { this.store[k] = v; } };
  return boot();
}
const press = (api, key) => api.onKey({ key, preventDefault() {} });

test('the party overlay opens and [X] dismisses the highlighted follower', async () => {
  const api = await boot();
  try {
    api.renderMode('overworld');
    // recruit a follower directly onto the roster (exposure of an existing mechanic)
    const being = api.game.bestiary.get('gutter-clerk');
    const r = api.game.session.roster.recruit(being);
    assert.equal(r.ok, true, 'seeded a follower to manage');
    const before = api.game.session.roster.followers.length;
    assert.ok(before >= 1);

    press(api, 'y'); // open the party surface
    assert.doesNotThrow(() => press(api, 's')); // move selection
    press(api, 'x'); // dismiss the highlighted follower
    assert.equal(api.game.session.roster.followers.length, before - 1, 'dismiss removed one follower');

    press(api, 'y'); // close
    assert.doesNotThrow(() => press(api, 'w')); // world input flows again
  } finally { delete global.window; delete global.document; delete global.localStorage; }
});
