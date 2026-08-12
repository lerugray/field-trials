// node --test — the jump-physics reachability validator (M2). Real-tick hops, reach
// graph, BFS, and the pod-collecting bot. Pure sim; no WebGL.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { island } from '../src/sim/islands.js';
import { generateSphere } from '../src/sim/generate.js';
import {
  simulateAimedHop, reachNeighbors, buildReachGraph, reachableSet,
  validateSphere, runCollectBot,
} from '../src/sim/reachability.js';

test('an aimed hop lands on a reachable neighbour (real tick, not ballistics)', () => {
  // Two pads a comfortable single-jump apart (void ~3, both radius 5).
  const islands = [island(0, 0, 0, 6), island(0, -13, 0, 5)];
  const landed = [1, 2, 3].map((j) => simulateAimedHop(islands, 0, 1, j));
  assert.ok(landed.includes(1), `some jump strategy lands on island 1 (got ${landed})`);
});

test('an island beyond triple-jump reach is NOT a neighbour (edge-landing margin)', () => {
  // Island 1 sits 60 wu away — no jump chain reaches it; falls into the void → no edge.
  const islands = [island(0, 0, 0, 6), island(0, -60, 0, 5)];
  const nbrs = reachNeighbors(islands, 0);
  assert.ok(!nbrs.has(1), 'unreachable far island is not a neighbour');
});

test('validateSphere accepts a generated sphere: pods + exit reachable from spawn', () => {
  for (const s of [1, 2, 42, 1337]) {
    for (let idx = 0; idx < 9; idx++) {
      const v = validateSphere(generateSphere(s, idx));
      assert.ok(v.ok, `seed ${s} sph ${idx} invalid: ${JSON.stringify(v.missing)}`);
      assert.ok(v.reachable.has(0), 'spawn is in its own reachable set');
    }
  }
});

test('validateSphere REJECTS a sphere with an isolated pod island (catches gaps)', () => {
  const islands = [island(0, 0, 0, 6), island(0, -12, 0, 5), island(0, -200, 0, 5)];
  const sphere = {
    islands,
    pods: [{ x: 0, z: -12, y: 1.2, island: 1 }, { x: 0, z: -200, y: 1.2, island: 2 }],
    exit: { x: 0, z: -12, y: 0, island: 1 },
  };
  const v = validateSphere(sphere);
  assert.equal(v.ok, false, 'the far pod is unreachable → invalid');
  assert.ok(v.missing.some((m) => m.type === 'pod' && m.island === 2), 'flags the isolated pod');
});

test('the reach graph BFS spans the generated chain from spawn', () => {
  const { islands } = generateSphere(7, 3);
  const reachable = reachableSet(islands, 0);
  // The chain is built so consecutive islands are hoppable — BFS should reach the last.
  assert.ok(reachable.has(islands.length - 1), 'BFS reaches the far/exit island');
});

test('the collect bot chains real hops to collect every pod and reach the exit', () => {
  for (const s of [1, 2, 7, 42, 99999]) {
    const sphere = generateSphere(s, 0);
    const bot = runCollectBot(sphere);
    assert.equal(bot.collected, bot.total, `seed ${s}: collected ${bot.collected}/${bot.total}`);
    assert.ok(bot.reachedExit, `seed ${s}: bot reached the exit`);
    assert.ok(bot.ok);
  }
});
