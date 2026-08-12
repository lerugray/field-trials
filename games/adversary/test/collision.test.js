import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTilemap } from '../src/sim/tilemap.js';
import { resolveMoveX, resolveMoveY, moveAndCollide, isGrounded } from '../src/sim/collision.js';

// A small stage: 8 wide, 5 tall, floor on the bottom row, a wall column at tx=5.
const MAP = createTilemap([
  '........',
  '........',
  '.....#..',
  '.....#..',
  '########',
]); // tileSize 16 → world 128×80

test('tilemap: solid queries by tile and pixel; findCells', () => {
  assert.ok(MAP.solidAt(0, 4));       // floor
  assert.ok(!MAP.solidAt(0, 0));      // air
  assert.ok(MAP.solidAt(5, 2));       // wall
  assert.ok(MAP.solidAtPx(5 * 16 + 3, 2 * 16 + 3));
  assert.equal(MAP.worldWidth, 128);
  assert.equal(MAP.findCells((ch) => ch === '#').length, 8 + 2); // floor row + 2 wall tiles
});

test('collision: falling box lands on the floor and is grounded', () => {
  const box = { x: 16, y: 0, w: 12, h: 20 };
  const r = resolveMoveY(box, 100, MAP); // fall far
  assert.ok(r.onGround);
  // floor top is at ty=4 → y = 4*16 - 20 = 44
  assert.equal(box.y, 4 * 16 - 20);
  assert.ok(isGrounded(box, MAP));
});

test('collision: moving right into the wall snaps flush', () => {
  const box = { x: 16, y: 16, w: 12, h: 20 }; // row overlapping the wall at ty 2..3
  const hit = resolveMoveX(box, 100, MAP);
  assert.ok(hit);
  assert.equal(box.x, 5 * 16 - 12); // right edge flush to wall's left face
});

test('collision: moving left into a wall snaps flush', () => {
  const box = { x: 6 * 16, y: 16, w: 12, h: 20 };
  const hit = resolveMoveX(box, -100, MAP);
  assert.ok(hit);
  assert.equal(box.x, 6 * 16); // left edge flush to wall's right face (tx5 right = 6*16)
});

test('collision: jumping into a ceiling stops upward and flags it', () => {
  const ceilMap = createTilemap([
    '####',
    '....',
    '####',
  ]);
  const box = { x: 16, y: 16 + 4, w: 12, h: 10 };
  const r = resolveMoveY(box, -100, ceilMap);
  assert.ok(r.hitCeiling);
  assert.equal(box.y, 1 * 16); // top flush under the ceiling tile row 0 (bottom = 16)
});

test('collision: moveAndCollide resolves both axes; no false ground when airborne', () => {
  const box = { x: 16, y: 0, w: 12, h: 20 };
  const r = moveAndCollide(box, 4, 4, MAP); // small step in open air
  assert.ok(!r.onGround);
  assert.equal(box.x, 20);
});

test('collision: isGrounded is false over a gap', () => {
  const gapMap = createTilemap([
    '....',
    '#..#',
  ]);
  const box = { x: 20, y: 0, w: 8, h: 12 }; // over the gap (tx1..2 empty on bottom row)
  assert.ok(!isGrounded(box, gapMap));
});
