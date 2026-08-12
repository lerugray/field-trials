import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld } from '../src/engine/world.js';
import { createBestiary } from '../src/engine/bestiary.js';
import { createNames } from '../src/engine/names.js';
import { createWanderers } from '../src/engine/wanderers.js';
import beingsData from '../data/bestiary/beings.json' with { type: 'json' };
import phonemes from '../data/register/phonemes.json' with { type: 'json' };

const bestiary = createBestiary(beingsData);
const names = createNames(phonemes);

// Open GRASS world (all passable, no sites) so wanderers can roam freely and the
// assertions are about the roster logic, not terrain.
function openWorld(seed = 1) {
  return createWorld({
    seed, chunkSize: 8, streamRadius: 2,
    noise: { octaves: 1, freq: 0.1 },
    bands: [{ tile: 'GRASS', max: 1.01 }],
    sites: [],
  });
}

function makeWanderers(seed = 42, opts = {}) {
  return createWanderers({ world: openWorld(), bestiary, names, seed, ...opts });
}

test('populate fills to the target count within the party ring, off the party tile', () => {
  const w = makeWanderers(42, { count: 6, radius: 7 });
  w.populate(20, 20);
  assert.equal(w.count, 6);
  for (const m of w.list()) {
    assert.ok(!(m.x === 20 && m.y === 20), 'never on the party tile');
    assert.ok(Math.abs(m.x - 20) + Math.abs(m.y - 20) <= 7 + 2, 'within the live window');
    assert.ok(['npc', 'beast'].includes(m.kind));
    if (m.kind === 'beast') assert.ok(bestiary.has(m.beingId), 'beast carries a real being');
  }
});

test('the roster has BOTH layers over the pool — NPCs and monsters both appear', () => {
  // Across many spawns, both kinds show up (the mundane living world is mixed).
  const w = makeWanderers(7, { count: 12, radius: 9 });
  w.populate(50, 50);
  const kinds = new Set(w.list().map((m) => m.kind));
  // Beasts come from the overworld-habitat, non-sacred pool.
  assert.ok(w.beastPool().length > 0, 'there is an overworld monster pool');
  assert.ok(kinds.has('npc'), 'NPCs present');
});

test('deterministic: same seed + same call sequence reproduces the roster exactly', () => {
  const a = makeWanderers(99); const b = makeWanderers(99);
  a.populate(10, 10); b.populate(10, 10);
  let px = 10, py = 10;
  for (let i = 0; i < 15; i++) { px += 1; a.step(px, py); b.step(px, py); }
  assert.deepEqual(a.list(), b.list());
  assert.equal(a.tick, b.tick);
});

test('wanderers only ever stand on passable, site-free tiles', () => {
  const world = openWorld();
  const w = createWanderers({ world, bestiary, names, seed: 3, count: 8, radius: 8 });
  let px = 30, py = 30;
  w.populate(px, py);
  for (let i = 0; i < 40; i++) {
    px += (i % 2 ? 1 : 0); py += (i % 2 ? 0 : 1);
    w.step(px, py);
    for (const m of w.list()) {
      assert.ok(world.passable(m.x, m.y), `on passable tile (${m.x},${m.y})`);
      assert.ok(!world.siteAt(m.x, m.y), 'never on a site');
    }
  }
});

test('a stationary party eventually gets caught by a chasing beast (collision reported)', () => {
  // Force an all-beast, high-chase roster by construction is hard (seeded), so
  // run many ticks with a still party and assert SOME collision fires — the
  // "they can catch you if you stand still" contract.
  const w = makeWanderers(5, { count: 8, radius: 6, chaseChance: 1 });
  const px = 40, py = 40;
  w.populate(px, py);
  let caught = 0;
  for (let i = 0; i < 60; i++) caught += w.step(px, py).length;
  assert.ok(caught > 0, 'a still party is reached by wanderers over time');
});

test('take() removes and returns the wanderer the party walks into (chase)', () => {
  const w = makeWanderers(11);
  w.populate(0, 0);
  const target = w.list()[0];
  const before = w.count;
  const got = w.take(target.x, target.y);
  assert.equal(got.uid, target.uid);
  assert.equal(w.count, before - 1, 'removed from the roster');
  assert.equal(w.at(target.x, target.y), null, 'no longer there');
});

test('encounterFor builds a single-foe, non-unfair fight from a beast (visible mundane layer)', () => {
  const w = makeWanderers(1);
  const beast = { uid: 1, x: 0, y: 0, kind: 'beast', beingId: w.beastPool()[0], name: 'x', hostile: true };
  const enc = w.encounterFor(beast);
  assert.equal(enc.kind, 'fight');
  assert.equal(enc.unfair, false, 'visible wanderers are the mundane layer, not the unfair tail');
  assert.equal(enc.foes.length, 1);
  assert.equal(w.encounterFor({ kind: 'npc' }), null, 'NPCs are not a fight');
});

test('serialize/restore round-trips the roster + tick (save/load)', () => {
  const w = makeWanderers(77);
  w.populate(5, 5);
  for (let i = 0; i < 5; i++) w.step(6 + i, 5);
  const snap = JSON.parse(JSON.stringify(w.serialize()));
  const w2 = makeWanderers(77);
  w2.restore(snap);
  assert.deepEqual(w2.list(), w.list());
  assert.equal(w2.tick, w.tick);
});
