// M10 A2(a) — OBJECTIVE reachability probe (the directive's "flood-fill first").
// Ray bounced off the drowned fen and read it as "can't enter, though NPCs walk
// through." Before touching legibility, prove the placement is sound: every
// guaranteed biome's walkable interior must be reachable from the party spawn by
// ordinary cardinal movement. A biome whose walkable mud is ringed by impassable
// pools would be a PLACEMENT defect — this test would catch it, not the eye.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld } from '../src/engine/world.js';
import { createBiomes } from '../src/engine/biomes.js';
import biomeData from '../data/world/biomes.json' with { type: 'json' };
import master from '../data/world/master.json' with { type: 'json' };

// Flood-fill the passable overworld from `start` using the same 4-direction
// movement the party has (party.js DIRS). Bounded generously — the world is
// unbounded but every biome sits well within a few dozen cells of spawn.
function reachableFrom(world, start, bound = 96) {
  const seen = new Set();
  const key = (x, y) => x + ',' + y;
  const q = [start];
  seen.add(key(start.x, start.y));
  while (q.length) {
    const c = q.shift();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = c.x + dx, ny = c.y + dy;
      if (Math.abs(nx) > bound || Math.abs(ny) > bound) continue;
      if (seen.has(key(nx, ny))) continue;
      if (!world.passable(nx, ny)) continue;
      seen.add(key(nx, ny));
      q.push({ x: nx, y: ny });
    }
  }
  return seen;
}

test('every guaranteed biome has walkable interior, all reachable from spawn', () => {
  const world = createWorld(master);
  const biomes = createBiomes(biomeData);
  const start = world.nearestOpen(master.start.x, master.start.y);
  const seen = reachableFrom(world, start);
  const key = (x, y) => x + ',' + y;

  for (const b of biomes.list()) {
    let walk = 0;
    const unreachable = [];
    for (let gy = b.center.y - b.radius; gy <= b.center.y + b.radius; gy++) {
      for (let gx = b.center.x - b.radius; gx <= b.center.x + b.radius; gx++) {
        if (!world.passable(gx, gy)) continue;
        walk += 1;
        if (!seen.has(key(gx, gy))) unreachable.push(`${gx},${gy}`);
      }
    }
    // A biome must offer somewhere to stand...
    assert.ok(walk > 0, `biome '${b.id}' has no walkable interior at all`);
    // ...and every walkable cell in it must be reachable from spawn (no
    // pool-ringed island the player can see but never enter).
    assert.equal(
      unreachable.length, 0,
      `biome '${b.id}' has ${unreachable.length} walkable-but-unreachable cells: ${unreachable.slice(0, 8).join(' ')}`,
    );
  }
});

test('drowned fen is enterable — a meaningful share of its interior is walkable', () => {
  // The fen is half-drowned by design (impassable pools), but "bounced off it"
  // must not mean a wall of water. Assert a real walkable fraction so a future
  // re-dress/re-place that floods the whole region trips CI.
  const world = createWorld(master);
  const biomes = createBiomes(biomeData);
  const fen = biomes.get('drowned-fen');
  assert.ok(fen, 'drowned-fen exists');
  const side = fen.radius * 2 + 1;
  const total = side * side;
  let walk = 0;
  for (let gy = fen.center.y - fen.radius; gy <= fen.center.y + fen.radius; gy++) {
    for (let gx = fen.center.x - fen.radius; gx <= fen.center.x + fen.radius; gx++) {
      if (world.passable(gx, gy)) walk += 1;
    }
  }
  assert.ok(walk / total >= 0.25, `fen only ${walk}/${total} walkable — reads as a wall of water`);
});
