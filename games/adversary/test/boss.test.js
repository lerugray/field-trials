import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createBoss, stepBoss, bossAabb, bossStriking, bossContactDamage, damageBoss, BOSS_PHASE, BOSS_STATS,
} from '../src/sim/boss.js';
import { createTilemap } from '../src/sim/tilemap.js';
import { FACING } from '../src/sim/player.js';

const MAP = createTilemap([
  '....................',
  '....................',
  '....................',
  '....................',
  '####################',
]);
const FEET = 4 * 16;
const player = { x: 40, y: FEET };

test('boss: spawns at full HP in the idle phase', () => {
  const b = createBoss(200, FEET);
  assert.equal(b.hp, BOSS_STATS.hp);
  assert.equal(b.phase, BOSS_PHASE.IDLE);
  assert.ok(b.alive);
});

test('boss: cycles idle → telegraph → lunge → recover in order', () => {
  const b = createBoss(200, FEET);
  const seen = [];
  let last = null;
  for (let t = 0; t < 400; t++) {
    stepBoss(b, player, MAP);
    if (b.phase !== last) { seen.push(b.phase); last = b.phase; }
    if (seen.length >= 5) break;
  }
  // First transition out of idle is telegraph, then lunge, then recover, then idle again.
  assert.equal(seen[0], BOSS_PHASE.IDLE);
  assert.deepEqual(seen.slice(1, 4), [BOSS_PHASE.TELEGRAPH, BOSS_PHASE.LUNGE, BOSS_PHASE.RECOVER]);
});

test('boss: telegraph precedes every lunge (fair warning)', () => {
  const b = createBoss(200, FEET);
  let prev = b.phase;
  for (let t = 0; t < 600; t++) {
    stepBoss(b, player, MAP);
    if (b.phase === BOSS_PHASE.LUNGE && prev !== BOSS_PHASE.LUNGE) {
      assert.equal(prev, BOSS_PHASE.TELEGRAPH, 'lunge must be entered from telegraph');
    }
    prev = b.phase;
  }
});

test('boss: strike window deals heavier contact damage', () => {
  const b = createBoss(200, FEET);
  b.phase = BOSS_PHASE.LUNGE;
  assert.ok(bossStriking(b));
  assert.equal(bossContactDamage(b), BOSS_STATS.lungeContactDamage);
  b.phase = BOSS_PHASE.IDLE;
  assert.equal(bossContactDamage(b), BOSS_STATS.contactDamage);
});

test('boss: lunges toward the player side', () => {
  const bRight = createBoss(200, FEET);
  const pLeft = { x: 40, y: FEET };
  // advance to a lunge and check it moved toward the player (left)
  let lunged = false;
  const x0 = bRight.x;
  for (let t = 0; t < 200; t++) {
    stepBoss(bRight, pLeft, MAP);
    if (bRight.phase === BOSS_PHASE.LUNGE) { lunged = true; }
  }
  assert.ok(lunged);
  assert.ok(bRight.x < x0, 'boss advanced toward the player over the cycle');
});

test('boss: damage kills and pays out big on the killing blow', () => {
  const b = createBoss(200, FEET);
  let total = 0, killed = false;
  while (!killed && total < 1000) {
    const r = damageBoss(b, 20);
    total += 20;
    if (r.killed) { killed = true; assert.equal(r.xp, BOSS_STATS.xp); assert.equal(r.gold, BOSS_STATS.gold); }
  }
  assert.ok(killed);
  assert.ok(!b.alive);
});

test('boss: aabb reflects the larger body', () => {
  const b = createBoss(200, FEET);
  const box = bossAabb(b);
  assert.equal(box.w, BOSS_STATS.body.halfW * 2);
  assert.equal(box.h, BOSS_STATS.body.halfH * 2);
});
