import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  createDungeonKit, assembleDungeon, createCrawl, signature, FACINGS, VEC,
} from '../src/engine/dungeon.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const kit = JSON.parse(readFileSync(resolve(root, 'data/dungeon/kit.json'), 'utf8'));

test('signature canonicalises exits into FACINGS order', () => {
  assert.equal(signature(['E', 'N']), 'NE');
  assert.equal(signature(['W', 'S', 'N', 'E']), 'NESW');
  assert.equal(signature([]), '');
});

test('the shipped kit loads and every prefab opening matches its declared exits', () => {
  // createDungeonKit throws if any authored border opening disagrees with exits.
  const dk = createDungeonKit(kit);
  assert.equal(dk.segmentSize, 5);
  // All 15 non-empty exit signatures must be covered (a spanning tree can need any).
  for (let m = 1; m < 16; m++) {
    const exits = FACINGS.filter((_, i) => m & (1 << i));
    assert.ok(dk.variantsFor(exits).length >= 1, `missing prefab for ${signature(exits)}`);
  }
});

test('createDungeonKit rejects a prefab whose art contradicts its exits', () => {
  const bad = { segmentSize: 5, prefabs: [{ id: 'liar', exits: ['N'], rows: ['#####', '#...#', '#...#', '#...#', '#####'] }] };
  assert.throws(() => createDungeonKit(bad), /exit 'N'/);
});

test('assembly is deterministic in the seed', () => {
  const a = assembleDungeon(kit, { seed: 2323, cells: 5 });
  const b = assembleDungeon(kit, { seed: 2323, cells: 5 });
  assert.deepEqual(a.tiles, b.tiles);
  assert.deepEqual(a.grid.map((c) => c.prefab), b.grid.map((c) => c.prefab));
  assert.deepEqual(a.entrance, b.entrance);
  assert.deepEqual(a.start, b.start);
  const c = assembleDungeon(kit, { seed: 9001, cells: 5 });
  assert.notDeepEqual(a.tiles, c.tiles); // a different seed draws a different dungeon
});

test('every floor tile is reachable from the start (spanning-tree connectivity)', () => {
  const d = assembleDungeon(kit, { seed: 2323, cells: 5 });
  const seen = new Set();
  const key = (x, y) => `${x},${y}`;
  const stack = [[d.start.x, d.start.y]];
  seen.add(key(d.start.x, d.start.y));
  while (stack.length) {
    const [x, y] = stack.pop();
    for (const dir of FACINGS) {
      const nx = x + VEC[dir].dx;
      const ny = y + VEC[dir].dy;
      if (d.floorAt(nx, ny) && !seen.has(key(nx, ny))) { seen.add(key(nx, ny)); stack.push([nx, ny]); }
    }
  }
  assert.equal(seen.size, d.floorCount, 'flood fill from start must cover every floor tile');
  assert.ok(d.floorCount > 0);
});

test('the mouth is a floor tile on the dungeon boundary with an outward direction', () => {
  const d = assembleDungeon(kit, { seed: 42, cells: 4 });
  assert.ok(d.floorAt(d.entrance.x, d.entrance.y), 'entrance must be floor');
  assert.ok(FACINGS.includes(d.entrance.dir));
  const v = VEC[d.entrance.dir];
  // Stepping outward from the mouth leaves the map (it is the exit to overworld).
  assert.equal(d.inBounds(d.entrance.x + v.dx, d.entrance.y + v.dy), false);
});

test('crawler starts at the mouth facing inward and honours grid-locked turns', () => {
  const d = assembleDungeon(kit, { seed: 7, cells: 5 });
  const c = createCrawl(d);
  assert.deepEqual(c.pos, { x: d.start.x, y: d.start.y, facing: d.start.facing });
  const f0 = c.facing;
  c.turnRight();
  c.turnRight();
  c.turnRight();
  c.turnRight();
  assert.equal(c.facing, f0, 'four right turns return to the original facing');
  c.turnLeft();
  assert.notEqual(c.facing, f0);
  c.turnRight();
  assert.equal(c.facing, f0);
});

test('crawler moves onto floor, is blocked by walls, and preserves position when blocked', () => {
  const d = assembleDungeon(kit, { seed: 7, cells: 5 });

  // A move onto known floor must succeed and update position. The start sits in
  // the entrance room interior facing inward, so forward lands on floor.
  const c2 = createCrawl(d);
  assert.ok(d.floorAt(c2.ahead().x, c2.ahead().y), 'tile ahead of start should be floor');
  const step = c2.forward();
  assert.equal(step.exited, false);
  assert.equal(step.moved, true);
  assert.deepEqual({ x: c2.x, y: c2.y }, { x: step.x, y: step.y });

  // Find any floor tile with a wall neighbour (not the mouth), stand on it
  // facing the wall, and assert the move is blocked with position preserved.
  let spot = null;
  for (let y = 0; y < d.height && !spot; y++) {
    for (let x = 0; x < d.width && !spot; x++) {
      if (!d.floorAt(x, y)) continue;
      for (const dir of FACINGS) {
        const nx = x + VEC[dir].dx;
        const ny = y + VEC[dir].dy;
        if (d.inBounds(nx, ny) && !d.floorAt(nx, ny)) { spot = { x, y, dir }; break; }
      }
    }
  }
  assert.ok(spot, 'every non-trivial dungeon has a floor tile beside a wall');
  const c = createCrawl(d, { x: spot.x, y: spot.y, facing: spot.dir });
  const before = { x: c.x, y: c.y };
  const r = c.forward();
  assert.equal(r.exited, false);
  assert.equal(r.moved, false);
  assert.ok(r.blocked);
  assert.deepEqual({ x: c.x, y: c.y }, before, 'position unchanged after a blocked move');
});

test('stepping out through the mouth reports an exit to the overworld', () => {
  const d = assembleDungeon(kit, { seed: 7, cells: 5 });
  // Place the crawler on the mouth tile, facing outward.
  const c = createCrawl(d, { x: d.entrance.x, y: d.entrance.y, facing: d.entrance.dir });
  const r = c.forward();
  assert.equal(r.exited, true);
  assert.equal(r.moved, false);
});

test('a variant signature (the pillared cross) is selectable from the kit', () => {
  const dk = createDungeonKit(kit);
  const crosses = dk.variantsFor(['N', 'E', 'S', 'W']).map((p) => p.id);
  assert.ok(crosses.includes('cross-NESW'));
  assert.ok(crosses.includes('cross-NSEW-pillar'), 'the pillar variant shares the 4-exit signature');
});

test('start tile always has a clear floor tile inward across many seeds and sizes', () => {
  // Regression for 2026-08-04 defect sweep: the entrance prefab may place a
  // pillar/wall directly inward from the mouth midpoint, hard-blocking movement.
  const seeds = [0, 1, 7, 31, 42, 95, 112, 118, 123, 143, 184, 188, 2323, 9999];
  for (const seed of seeds) {
    for (const cells of [2, 3, 4, 5, 6]) {
      const d = assembleDungeon(kit, { seed, cells });
      const v = { N: { dx: 0, dy: -1 }, S: { dx: 0, dy: 1 }, E: { dx: 1, dy: 0 }, W: { dx: -1, dy: 0 } }[d.start.facing];
      assert.ok(d.floorAt(d.start.x + v.dx, d.start.y + v.dy), `seed ${seed} cells ${cells}: tile inward of start must be floor`);
      const c = createCrawl(d);
      const r = c.forward();
      assert.ok(r.moved || r.exited, `seed ${seed} cells ${cells}: crawl must move or exit from start`);
    }
  }
});
