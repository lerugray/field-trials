// M12 E6 — capacity leveling (LOCKED). Follower capacity = 2 + unique WORLD milestones
// {openedGate, ladderRung, clearedBiome}, capped at 6. NEVER kills, single site-clears,
// or stats. Opened gates + cleared biomes are world-persistent (carry across permadeath);
// ladder rungs are the current stranger's.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { capacityChangeLine, createGame } from '../src/main.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const master = JSON.parse(readFileSync(resolve(root, 'data/world/master.json'), 'utf8'));

test('a fresh world starts follower capacity at 2', () => {
  const g = createGame(master);
  assert.equal(g.session.capacity, 2, 'start capacity');
  assert.equal(g.milestoneCapacity(), 2);
});

test('opening a gate is the XP: capacity grows by one', () => {
  const g = createGame(master);
  const gate = g.world.gateById('fen-ford-0');
  g.world.openGate(gate.id);
  g.refreshCapacity();
  assert.equal(g.session.capacity, 3, 'an opened gate = +1 capacity');
  // opening it "again" is a no-op — capacity does not double-count
  g.world.openGate(gate.id);
  g.refreshCapacity();
  assert.equal(g.session.capacity, 3);
});

test('a capacity increase has a legible HUD feedback line', () => {
  assert.equal(capacityChangeLine(2, 3), 'follower capacity 2 → 3');
  assert.equal(capacityChangeLine(3, 3), '');
  assert.equal(capacityChangeLine(4, 3), '');
});

test('a ladder rung raises capacity; kills and single clears never do', () => {
  const g = createGame(master);
  g.session.clearSite('waystation-23'); // a single site-clear (not a whole biome)
  g.refreshCapacity();
  assert.equal(g.session.capacity, 2, 'a lone site-clear is not a milestone');
  g.session.joinLodge('lodge-x'); // a ladder rung
  g.refreshCapacity();
  assert.equal(g.session.capacity, 3, 'a rung is a milestone');
  g.session.joinLodge('bureau:office'); // a bureau stamp is NOT a rung
  g.refreshCapacity();
  assert.equal(g.session.capacity, 3, 'a bureau stamp does not count');
});

test('capacity is capped at 6', () => {
  const g = createGame(master);
  g.world.openGate('fen-ford-0');
  for (let i = 0; i < 10; i++) g.session.joinLodge(`lodge-${i}`);
  g.refreshCapacity();
  assert.equal(g.session.capacity, 6, 'never past the cap');
});

test('the world-persistent share carries across permadeath; rungs do not', () => {
  const g = createGame(master);
  g.world.openGate('fen-ford-0'); // world milestone
  g.session.joinLodge('lodge-a'); // this stranger's rung
  g.refreshCapacity();
  assert.equal(g.session.capacity, 4, 'gate + rung = 2 + 2');
  g.session.die('the tail', 5); // new stranger: rungs reset, the gate persists
  g.refreshCapacity();
  assert.equal(g.session.capacity, 3, 'the opened gate still counts; the rung is gone');
});
