import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createEnemy, stepEnemy, enemyAabb, damageEnemy, ENEMY_TYPES } from '../src/sim/enemy.js';
import { createTilemap } from '../src/sim/tilemap.js';
import { FACING } from '../src/sim/player.js';

// A platform with walls at both ends and a floor, 16×6.
const MAP = createTilemap([
  '................',
  '................',
  '................',
  '#..............#',
  '#..............#',
  '################',
]);
const FLOOR_FEET = 5 * 16;

test('enemy: spawns with type stats and full HP', () => {
  const e = createEnemy('walker', 64, FLOOR_FEET);
  assert.equal(e.hp, ENEMY_TYPES.walker.hp);
  assert.ok(e.alive);
  const box = enemyAabb(e);
  assert.equal(box.w, ENEMY_TYPES.walker.body.halfW * 2);
});

test('enemy: walker falls to the floor and patrols', () => {
  const e = createEnemy('walker', 64, 0, FACING.RIGHT);
  for (let i = 0; i < 30; i++) stepEnemy(e, MAP);
  assert.ok(e.onGround);
  assert.equal(e.y, FLOOR_FEET);
  const x0 = e.x;
  for (let i = 0; i < 10; i++) stepEnemy(e, MAP);
  assert.notEqual(e.x, x0); // it moved
});

test('enemy: walker turns around at a wall', () => {
  const e = createEnemy('walker', 64, FLOOR_FEET, FACING.RIGHT);
  let flipped = false;
  for (let i = 0; i < 400; i++) {
    stepEnemy(e, MAP);
    if (e.facing === FACING.LEFT) { flipped = true; break; }
  }
  assert.ok(flipped, 'walker reversed at the right wall');
});

test('enemy: walker turns at a ledge instead of walking off', () => {
  // Platform floating in the middle with gaps on both sides.
  const ledgeMap = createTilemap([
    '................',
    '................',
    '................',
    '.....######.....',
    '................',
    '................',
  ]);
  const feet = 3 * 16;
  const e = createEnemy('walker', 6 * 16, feet, FACING.RIGHT);
  for (let i = 0; i < 200; i++) stepEnemy(e, ledgeMap);
  // Never falls off: stays within the platform x-span [5*16, 11*16] and grounded.
  assert.ok(e.onGround, 'still on the platform');
  assert.ok(e.x >= 5 * 16 && e.x <= 11 * 16, `stayed on platform, x=${e.x}`);
});

test('enemy: hopper periodically leaves the ground', () => {
  const e = createEnemy('hopper', 64, FLOOR_FEET, FACING.RIGHT);
  let airborneTicks = 0;
  for (let i = 0; i < 200; i++) { stepEnemy(e, MAP); if (!e.onGround) airborneTicks++; }
  assert.ok(airborneTicks > 0, 'hopper spends time in the air');
});

test('enemy: damage kills and pays out only on the killing blow', () => {
  const e = createEnemy('walker', 64, FLOOR_FEET);
  let r = damageEnemy(e, 5);
  assert.ok(!r.killed);
  assert.equal(r.xp, 0);
  assert.ok(e.alive);
  r = damageEnemy(e, 100);
  assert.ok(r.killed);
  assert.equal(r.xp, ENEMY_TYPES.walker.xp);
  assert.equal(r.gold, ENEMY_TYPES.walker.gold);
  assert.ok(!e.alive);
  // Dead enemies don't move or take further payouts.
  const r2 = damageEnemy(e, 10);
  assert.ok(!r2.killed && r2.xp === 0);
});

test('enemy: deterministic patrol for the same map + spawn', () => {
  function run() {
    const e = createEnemy('walker', 64, FLOOR_FEET, FACING.RIGHT);
    const trace = [];
    for (let i = 0; i < 120; i++) { stepEnemy(e, MAP); trace.push([e.x, e.y, e.facing]); }
    return trace;
  }
  assert.deepEqual(run(), run());
});
