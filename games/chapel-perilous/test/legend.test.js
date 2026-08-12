// M10 A5 — the map legend. Ray's visibility-floor concern includes "what am I
// looking at / can I walk there." The side HUD panel now carries a persistent,
// bottom-anchored legend in the nav modes: tile-art swatches naming the entity
// glyph classes (you / folk / beast) and terrain passability (walk / blocked).
// Dungeon and city modes get their own vocabularies matched to what they show.
// This drives the real render through a text-recording ctx and asserts the legend
// draws in the nav modes (and not on menu/text cards, which have no map to legend).
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

function textFor(api, sink, mode) {
  sink.length = 0;
  api.renderMode(mode);
  return sink.join('  ');
}

test('the map legend renders in the nav modes, naming entities + passability', async () => {
  const sink = [];
  const api = await bootHeadless(sink);
  const ow = textFor(api, sink, 'overworld');
  assert.ok(/legend/i.test(ow), 'overworld shows the legend heading');
  for (const label of ['you', 'folk', 'beast', 'walk', 'blocked']) {
    assert.ok(ow.includes(label), `legend names "${label}"`);
  }
  // D5: the WORLD MAP card itself carries the map-specific glyph vocabulary.
  sink.length = 0;
  api.onKey({ key: 'u', preventDefault() {} });
  const wm = sink.join('  ');
  assert.ok(/legend/i.test(wm), 'worldmap card shows the legend heading');
  for (const label of ['you', 'town', 'site', 'gate shut', 'gate open', 'route']) {
    assert.ok(wm.includes(label), `worldmap legend names "${label}"`);
  }
  // cp-021: dungeon legend uses minimap vocabulary, not overworld terrain rows
  const dg = textFor(api, sink, 'dungeon');
  assert.ok(/legend/i.test(dg), 'first-person nav also shows the legend');
  assert.ok(!dg.includes('the Chapel'), 'the map-only site markers stay on the world map');
  for (const label of ['stairs/exit', 'cache', 'encounter', 'fog']) {
    assert.ok(dg.includes(label), `dungeon legend names "${label}"`);
  }
  for (const label of ['ground', 'water', 'peak', 'beast']) {
    assert.ok(!dg.includes(label), `dungeon legend does not name overworld "${label}"`);
  }
  // cp-021: city legend uses city vocabulary, not overworld terrain/beast rows
  const ct = textFor(api, sink, 'city');
  assert.ok(/legend/i.test(ct), 'city nav also shows the legend');
  for (const label of ['you', 'citizen', 'street', 'building']) {
    assert.ok(ct.includes(label), `city legend names "${label}"`);
  }
  for (const label of ['ground', 'water', 'peak', 'beast']) {
    assert.ok(!ct.includes(label), `city legend does not name overworld "${label}"`);
  }
});

test('the legend does not intrude on menu/text cards (no map to legend there)', async () => {
  const sink = [];
  const api = await bootHeadless(sink);
  const title = textFor(api, sink, 'title');
  assert.ok(!/— legend —/.test(title), 'the title card carries no map legend');
});
