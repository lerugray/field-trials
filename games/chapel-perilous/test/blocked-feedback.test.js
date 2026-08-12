// M10 A3 — a blocked bump gets a seeded, in-voice line (not a dead key). Ray read
// the fen edge as "can't enter"; the fix pairs the bump GATE (no tick/roll) with a
// register line so the refusal reads as the world talking back. This drives the
// real keydown handler headlessly, bumps the party into impassable water, and
// asserts the console shows one of the register's onblocked lines — with no [SEED].
import { test } from 'node:test';
import assert from 'node:assert/strict';
import register from '../data/register/system.json' with { type: 'json' };
import { REGISTRY_KEY } from '../src/engine/worldregistry.js';

// chp-worldgen made every live boot() world procedurally seeded (crypto-random per
// New Game), so terrain around spawn is no longer the fixed master.json fixture — a
// truly random seed is not guaranteed to have an impassable neighbour to bump. This
// test is about the blocked-bump FEEDBACK path, not worldgen, so it pins the registry
// to one verified-deterministic seed (spawn 5,5, impassable WATER to the south) rather
// than letting boot() mint a fresh random world.
const TEST_SEED = 7;

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
  // Pre-seed the world registry with the fixed test seed so boot() loads it instead
  // of minting a fresh crypto-random world (see TEST_SEED comment above).
  const record = {
    id: `w-${(TEST_SEED >>> 0).toString(16).padStart(8, '0')}`,
    seed: TEST_SEED,
    name: '[SEED] fixture world',
    created: 1,
    lastPlayed: 1,
  };
  const stored = new Map([[REGISTRY_KEY, JSON.stringify([record])]]);
  global.localStorage = {
    getItem: (k) => stored.get(k) ?? null,
    setItem: (k, v) => { stored.set(k, String(v)); },
    removeItem: (k) => { stored.delete(k); },
  };
  return boot();
}

const strip = (s) => s.replace(/\[SEED\]\s*/gi, '');
const KEY = { N: 'w', S: 's', E: 'd', W: 'a' };
const DIRS = { N: [0, -1], S: [0, 1], E: [1, 0], W: [-1, 0] };

test('a blocked bump surfaces a seeded in-voice register line, no [SEED]', async () => {
  const sink = [];
  const api = await bootHeadless(sink);
  api.renderMode('overworld');
  const { world, party } = api.game;

  // find an impassable neighbour to bump into
  let blockedDir = null;
  for (const [d, [dx, dy]] of Object.entries(DIRS)) {
    if (!world.passable(party.x + dx, party.y + dy)) { blockedDir = d; break; }
  }
  assert.ok(blockedDir, 'party spawn has an impassable neighbour to bump (fixture)');

  const [dx, dy] = DIRS[blockedDir];
  const blockedTile = world.tileAt(party.x + dx, party.y + dy);
  const expected = (register.onblocked[blockedTile.id] || register.onblocked.default).map(strip);

  sink.length = 0;
  api.onKey({ key: KEY[blockedDir], preventDefault() {} });

  // No leak, and the console shows one of the onblocked lines for that tile class.
  assert.ok(!sink.some((s) => s.includes('[SEED]')), 'blocked line must not leak [SEED]');
  const drawn = sink.join('  ');
  assert.ok(
    expected.some((line) => drawn.includes(line)),
    `expected a blocked-${blockedTile.id} register line on screen; got: ${JSON.stringify(sink.filter((s) => s.length > 12).slice(0, 6))}`,
  );
});
