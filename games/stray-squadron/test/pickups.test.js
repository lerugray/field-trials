import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRng } from '../src/core/rng.js';
import {
  makePickup, fillRescueChunk, PICKUP, collectPickups, activePickups,
} from '../src/combat/pickups.js';
import { createPickupMesh } from '../src/gfx/pickupmesh.js';

test('makePickup is deterministic and well-formed', () => {
  const a = makePickup(makeRng('p'), 100, 1);
  const b = makePickup(makeRng('p'), 100, 1);
  assert.deepEqual(a, b);
  assert.ok(PICKUP.kinds[a.kind], 'known kind');
  assert.equal(a.taken, false);
  assert.ok(Math.abs(a.lat) <= PICKUP.latRange && Math.abs(a.vert) <= PICKUP.vertRange);
});

test('every pickup kind grants either hull or score (a real reward)', () => {
  for (const [name, k] of Object.entries(PICKUP.kinds)) {
    assert.ok(k.hull > 0 || k.score > 0, `${name} rewards nothing`);
  }
});

test('fillRescueChunk drops 1-2 pickups inside the chunk and frame', () => {
  for (let i = 0; i < 40; i++) {
    const list = [];
    const s0 = 100 + i, s1 = s0 + 55;
    const { count } = fillRescueChunk(makeRng('r' + i), s0, s1, list, 1);
    assert.ok(count >= PICKUP.perChunkMin && count <= PICKUP.perChunkMax);
    assert.equal(list.length, count);
    for (const p of list) {
      assert.ok(p.s >= s0 && p.s <= s1, `pickup s ${p.s} in [${s0},${s1}]`);
      assert.ok(Math.abs(p.lat) <= PICKUP.latRange && Math.abs(p.vert) <= PICKUP.vertRange);
    }
  }
});

test('pickup ids chain from the start id', () => {
  const list = [];
  const { id } = fillRescueChunk(makeRng('ids'), 0, 55, list, 7);
  assert.equal(list[0].id, 7);
  assert.equal(id, 7 + list.length);
});

test('flying through a repair pod heals one hull, capped at max', () => {
  const p = { s: 100, lat: 0, vert: 0, radius: 1.1, hull: 1, score: 0, taken: false };
  const player = { hull: 3, maxHull: 6 };
  const run = { score: 0 };
  const got = collectPickups([p], 100, 0.1, -0.1, player, run);
  assert.equal(got.length, 1);
  assert.equal(player.hull, 4);
  assert.equal(p.taken, true);
});

test('a repair pod never over-heals past max hull', () => {
  const p = { s: 50, lat: 0, vert: 0, radius: 1.1, hull: 1, score: 0, taken: false };
  const player = { hull: 6, maxHull: 6 };
  collectPickups([p], 50, 0, 0, player, { score: 0 });
  assert.equal(player.hull, 6);
});

test('a score cache banks its bonus, no hull change', () => {
  const p = { s: 50, lat: 0, vert: 0, radius: 1.1, hull: 0, score: 300, taken: false };
  const player = { hull: 4, maxHull: 6 };
  const run = { score: 100 };
  collectPickups([p], 50, 0, 0, player, run);
  assert.equal(run.score, 400);
  assert.equal(player.hull, 4);
});

test('a pickup is collected once, never double-counted', () => {
  const p = { s: 50, lat: 0, vert: 0, radius: 1.1, hull: 0, score: 300, taken: false };
  const run = { score: 0 };
  collectPickups([p], 50, 0, 0, null, run);
  collectPickups([p], 50, 0, 0, null, run); // second pass, same station
  assert.equal(run.score, 300);
});

test('a pickup out of the frame or along-rail range is not collected', () => {
  const p = { s: 50, lat: 0, vert: 0, radius: 1.1, hull: 0, score: 300, taken: false };
  const run = { score: 0 };
  collectPickups([p], 50, 3.0, 0, null, run);   // off to the side
  collectPickups([p], 70, 0, 0, null, run);     // far along the rail
  assert.equal(run.score, 0);
  assert.equal(p.taken, false);
});

test('activePickups returns only untaken pickups in the window ahead', () => {
  const list = [
    { s: 100, taken: false }, { s: 100, taken: true },
    { s: 400, taken: false }, { s: 10, taken: false },
  ];
  const near = activePickups(list, 90, 220);
  assert.deepEqual(near.map((p) => p.s), [100]);
});

test('both pickup meshes build a non-empty, distinct silhouette', () => {
  const cross = createPickupMesh('repair', [0.5, 0.85, 0.7]);
  const gem = createPickupMesh('score', [0.5, 0.85, 0.7]);
  assert.ok(cross.triCount > 0 && gem.triCount > 0);
  // shape-distinct (accessibility: not color-only) — different triangle counts
  assert.notEqual(cross.triCount, gem.triCount);
});
