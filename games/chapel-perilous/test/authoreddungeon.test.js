// Structure Arc slice 1 (STRUCTURE-ARC-LOCKS-2026-08-05.md LOCK 2) — the first
// hand-authored dungeon interior. Pins the shape-parity contract with
// assembleDungeon() (every existing consumer must keep working unchanged),
// the milestone one-shot guarantee, and — the one thing hand-authoring a map
// can silently get wrong — that the whole floor plan is actually connected.
import test from 'node:test';
import assert from 'node:assert/strict';
import { assembleAuthoredDungeon } from '../src/engine/authoreddungeon.js';
import { createCrawl } from '../src/engine/dungeon.js';
import { createDungeonLife, enemyInCorridor } from '../src/engine/dungeonlife.js';
import { createBestiary } from '../src/engine/bestiary.js';
import op1 from '../data/dungeon/operation-1.json' with { type: 'json' };
import op2 from '../data/dungeon/operation-2.json' with { type: 'json' };
import op3 from '../data/dungeon/operation-3.json' with { type: 'json' };
import op4 from '../data/dungeon/operation-4.json' with { type: 'json' };
import op5 from '../data/dungeon/operation-5.json' with { type: 'json' };
import beingsData from '../data/bestiary/beings.json' with { type: 'json' };

const bestiary = createBestiary(beingsData);
const AUTHORED_INTERIORS = {
  'operation-1': op1,
  'operation-2': op2,
  'operation-3': op3,
  'operation-4': op4,
  'operation-5': op5,
};

function shapeAssertions(d, data, key) {
  assert.equal(d.segmentSize, 1, `${key}: segmentSize mismatch`);
  assert.equal(d.width, data.rows[0].length, `${key}: width mismatch`);
  assert.equal(d.height, data.rows.length, `${key}: height mismatch`);
  for (const fn of ['tileAt', 'floorAt', 'passable', 'cellAt', 'inBounds']) {
    assert.equal(typeof d[fn], 'function', `${key}: ${fn} must be a function`);
  }
  assert.ok(d.entrance && d.entrance.dir, `${key}: entrance missing dir`);
  assert.ok(d.start && d.start.facing, `${key}: start missing facing`);
  assert.ok(d.floorCount > 0, `${key}: no floor tiles`);
  // entrance sits on the map boundary
  assert.ok(
    d.entrance.x === 0 || d.entrance.y === 0 || d.entrance.x === d.width - 1 || d.entrance.y === d.height - 1,
    `${key}: entrance not on boundary`
  );
}

function connectivityAssertions(d, data, key) {
  const seen = new Set();
  const keyf = (x, y) => `${x},${y}`;
  const q = [[d.start.x, d.start.y]];
  seen.add(keyf(d.start.x, d.start.y));
  while (q.length) {
    const [x, y] = q.pop();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (d.floorAt(nx, ny) && !seen.has(keyf(nx, ny))) { seen.add(keyf(nx, ny)); q.push([nx, ny]); }
    }
  }
  let totalFloor = 0;
  for (let y = 0; y < d.height; y++) for (let x = 0; x < d.width; x++) if (d.floorAt(x, y)) totalFloor++;
  assert.equal(seen.size, totalFloor, `${key}: a floor tile is unreachable from the authored start — the layout is broken`);
  for (const m of d.milestones) assert.ok(seen.has(keyf(m.x, m.y)), `${key}: milestone '${m.id}' is unreachable`);
  for (const s of d.spawns) assert.ok(seen.has(keyf(s.x, s.y)), `${key}: spawn '${s.id}' is unreachable`);
}

test('assembleAuthoredDungeon(op1) matches assembleDungeon\'s shape contract', () => {
  const d = assembleAuthoredDungeon(op1, { seed: 7 });
  shapeAssertions(d, op1, 'operation-1');
});

test('every authored dungeon is FULLY CONNECTED — flood fill from start reaches every floor tile', () => {
  const d = assembleAuthoredDungeon(op1, { seed: 1 });
  connectivityAssertions(d, op1, 'operation-1');
});

test('every Operation 2-5 authored interior is connected and contract-compatible', () => {
  for (const [key, data] of Object.entries(AUTHORED_INTERIORS)) {
    const d = assembleAuthoredDungeon(data, { seed: 1 });
    shapeAssertions(d, data, key);
    connectivityAssertions(d, data, key);
  }
});

test('start has floor ahead (the player can always step forward on entry)', () => {
  for (const [key, data] of Object.entries(AUTHORED_INTERIORS)) {
    const d = assembleAuthoredDungeon(data, { seed: 3 });
    const facing = d.start.facing;
    const VEC = { N: [0, -1], S: [0, 1], E: [1, 0], W: [-1, 0] }[facing];
    assert.ok(d.floorAt(d.start.x + VEC[0], d.start.y + VEC[1]), `${key}: no floor ahead of the authored start facing`);
  }
});

test('createCrawl works unmodified on every authored dungeon', () => {
  for (const [key, data] of Object.entries(AUTHORED_INTERIORS)) {
    const d = assembleAuthoredDungeon(data, { seed: 11 });
    const crawl = createCrawl(d);
    assert.deepEqual(crawl.pos, d.start, `${key}: crawl start mismatch`);
    const res = crawl.forward();
    assert.equal(res.moved, true, `${key}: crawl could not step forward`);
    assert.equal(res.exited, false, `${key}: crawl exited immediately`);
  }
});

test('takeMilestoneAt grants once, is null elsewhere and on a re-take, and serialize/restore persists it', () => {
  const d = assembleAuthoredDungeon(op1, { seed: 5 });
  const m = d.milestones[0];
  assert.equal(d.takeMilestoneAt(0, 0), null, 'no milestone on a wall tile');
  const got = d.takeMilestoneAt(m.x, m.y);
  assert.ok(got && got.description && got.kind);
  assert.equal(d.takeMilestoneAt(m.x, m.y), null, 'a milestone cannot be taken twice');

  const d2 = assembleAuthoredDungeon(op1, { seed: 5 });
  d2.restoreMilestones(d.serializeMilestones());
  assert.equal(d2.takeMilestoneAt(m.x, m.y), null, 'restored taken-state blocks a re-take');
});

test('assembling twice with the same seed is fully deterministic', () => {
  const a = assembleAuthoredDungeon(op1, { seed: 42 });
  const b = assembleAuthoredDungeon(op1, { seed: 42 });
  assert.deepEqual(a.tiles, b.tiles);
  assert.deepEqual(a.entrance, b.entrance);
  assert.deepEqual(a.start, b.start);
  for (const s of a.spawns) assert.equal(a.beingIdFor(s, []), b.beingIdFor(s, []));
});

test('createDungeonLife(cells, beingIdFor) places enemies at exactly the authored spawns, drawn from their pools', () => {
  const d = assembleAuthoredDungeon(op1, { seed: 88 });
  const life = createDungeonLife(d, {
    bestiary, seed: 88, max: d.spawnCells().length, cells: d.spawnCells(),
    beingIdFor: (c, fallback) => d.beingIdFor(d.spawnAt(c.cx, c.cy), fallback),
  });
  const list = life.list();
  assert.equal(list.length, d.spawns.length);
  for (const e of list) {
    const spawn = d.spawnAt(e.cx, e.cy);
    assert.ok(spawn, `enemy at (${e.cx},${e.cy}) is not at an authored spawn point`);
    assert.ok(spawn.pool.includes(e.beingId), `enemy being '${e.beingId}' is not in its spawn's authored pool`);
    // an authored dungeon uses segmentSize 1, so the enemy's rendered tile IS its cell
    assert.deepEqual(e.tile, { x: e.cx, y: e.cy });
  }
});

test('a visible authored enemy is detected ahead down its corridor (enemyInCorridor)', () => {
  const d = assembleAuthoredDungeon(op1, { seed: 88 });
  const life = createDungeonLife(d, {
    bestiary, seed: 88, max: d.spawnCells().length, cells: d.spawnCells(),
    beingIdFor: (c, fallback) => d.beingIdFor(d.spawnAt(c.cx, c.cy), fallback),
  });
  const e = life.list()[0];
  // Stand one tile away, facing the enemy, and confirm it's visible ahead.
  const crawl = createCrawl(d, { x: e.cx - 1, y: e.cy, facing: 'E' });
  const found = enemyInCorridor(d, crawl, life);
  assert.ok(found, 'expected the authored spawn to be visible one tile ahead');
  assert.equal(found.beingId, e.beingId);
});

test('Operation 3 interior gate blocks movement until the matching tagged item is spent', () => {
  const d = assembleAuthoredDungeon(op3, { seed: 1 });
  const g = d.gateAt(9, 8);
  assert.ok(g, 'operation-3 should have an interior gate at (9,8)');
  assert.equal(g.requiresTag, 'op3-transit');
  assert.equal(d.isGateOpen(g.id), false);
  // The gate tile is floor, but passable is false while closed.
  assert.ok(d.floorAt(g.x, g.y), 'gate tile is a floor tile in the ASCII plan');
  assert.equal(d.passable(g.x, g.y), false, 'unopened gate blocks passability');
  assert.ok(d.openGate(g.id), 'openGate should succeed');
  assert.equal(d.passable(g.x, g.y), true, 'opened gate is passable');
  // The milestone is tagged so it can be spent at the gate.
  const m = d.milestones.find((mm) => mm.id === 'op3-milestone');
  assert.ok(m, 'operation-3 milestone exists');
  assert.ok(m.tags.includes('op3-transit'), 'milestone carries the gate tag');
});

test('malformed authored data fails loudly instead of shipping a broken dungeon', () => {
  assert.throws(() => assembleAuthoredDungeon({ rows: ['##', '#'] }), /same width/);
  assert.throws(() => assembleAuthoredDungeon({ rows: ['...', '...'] }), /entrance/);
  assert.throws(() => assembleAuthoredDungeon({
    rows: ['###', '#.#', '###'],
    entrance: { x: 1, y: 2, dir: 'S' }, start: { x: 1, y: 1, facing: 'N' },
  }), /entrance tile is not floor|start tile is not floor/);
  assert.throws(() => assembleAuthoredDungeon({
    rows: ['#####', '#...#', '#####'],
    entrance: { x: 1, y: 1, dir: 'W' }, start: { x: 2, y: 1, facing: 'E' },
    milestones: [{ x: 0, y: 0 }],
  }), /milestone/);
  assert.throws(() => assembleAuthoredDungeon({
    rows: ['#####', '#...#', '#####'],
    entrance: { x: 1, y: 1, dir: 'W' }, start: { x: 2, y: 1, facing: 'E' },
    gates: [{ id: 'bad-gate', x: 0, y: 0, requiresTag: 'x' }],
  }), /gate/);
});
