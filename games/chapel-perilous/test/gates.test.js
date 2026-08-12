// M12 E1/E2 — terrain gates (ADDENDUM #3 schema). A gate is a COORDINATE record that
// blocks its tile until OPENED; opening is a permanent WORLD fact toggled by spending a
// tagged work-item at the gate — never a carried key (after opening, no item is ever
// consulted for passability). The opened set is world-persistent (save/load).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld } from '../src/engine/world.js';
import { createGame } from '../src/main.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const master = JSON.parse(readFileSync(resolve(root, 'data/world/master.json'), 'utf8'));

const CFG = {
  seed: 1, chunkSize: 8, streamRadius: 1,
  noise: { octaves: 2, freq: 0.1, lacunarity: 2, gain: 0.5 },
  bands: [{ tile: 'GRASS', max: 1.01 }], // all-walkable terrain so the gate is the ONLY barrier
  start: { x: 0, y: 0 },
  sites: [],
  gates: [{ id: 'g0', x: 2, y: 0, requiresTag: 'ford', label: 'the ford' }],
};

test('a gate blocks its tile until opened, then is passable', () => {
  const w = createWorld(CFG);
  assert.ok(w.tileAt(2, 0).passable, 'the underlying terrain is walkable');
  assert.equal(w.passable(2, 0), false, 'but the unopened gate blocks it');
  assert.equal(w.gateAt(2, 0).id, 'g0');
  assert.equal(w.openGate('g0'), true);
  assert.equal(w.passable(2, 0), true, 'opened → passable');
  assert.equal(w.openGate('g0'), false, 'opening twice is a no-op');
});

test('opened gates serialize and restore (world-persistent)', () => {
  const w = createWorld(CFG);
  w.openGate('g0');
  const snap = w.serializeGates();
  assert.deepEqual(snap, ['g0']);
  const w2 = createWorld(CFG);
  assert.equal(w2.passable(2, 0), false);
  w2.restoreGates(snap);
  assert.equal(w2.passable(2, 0), true, 'restored open state');
});

test('the master world ships the fen ford gate on impassable water', () => {
  const g = createGame(master);
  const gate = g.world.gateById('fen-ford-0');
  assert.ok(gate, 'fen ford exists');
  assert.equal(g.world.tileAt(gate.x, gate.y).passable, false, 'it fords otherwise-impassable water');
  assert.equal(g.world.passable(gate.x, gate.y), false, 'closed by default');
});

test('spending a ford-tagged item opens the gate and counts as a life deed', () => {
  const g = createGame(master);
  const gate = g.world.gateById('fen-ford-0');
  // carry a ford work-item, then open the gate directly (the shell wires the bump path)
  g.session.addItem({ kind: 'work', name: '[SEED] a bundle of ford stones', tags: ['ford'] });
  const item = g.session.items().find((it) => (it.tags || []).includes('ford'));
  assert.ok(item, 'carrying a ford item');
  g.session.dropItem(item.uid);
  assert.equal(g.world.openGate(gate.id), true);
  g.session.noteGateOpened();
  assert.equal(g.world.passable(gate.x, gate.y), true, 'the ford is laid');
  assert.equal(g.session.life().gatesOpened, 1, 'opening a gate is a deed of this life');
  assert.equal(g.session.items().some((it) => (it.tags || []).includes('ford')), false, 'the work-item was spent');
});
