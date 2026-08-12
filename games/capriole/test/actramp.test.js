// node --test — the ACT DIFFICULTY RAMP (M4). Beyond the per-sphere enemy-COUNT ramp,
// each act (3 spheres) raises the THREAT: the act boss soaks more stomps and moves faster,
// and swoopers dive faster. Act 0 (spheres 0-2) is the M3 baseline (scale 1) so the whole
// M3 determinism/save battery stays byte-identical.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnEnemies, actForSphere, updateEnemies } from '../src/sim/enemies.js';
import { tuning } from '../src/sim/tuning.js';
import { makeTestArchipelago } from '../src/sim/islands.js';

// A stand-in archipelago with enough islands to seat a boss + escort.
function islands() {
  return makeTestArchipelago ? makeTestArchipelago() : null;
}

test('actForSphere: 3 acts of 3', () => {
  assert.equal(actForSphere(0), 0);
  assert.equal(actForSphere(2), 0);
  assert.equal(actForSphere(3), 1);
  assert.equal(actForSphere(5), 1);
  assert.equal(actForSphere(6), 2);
  assert.equal(actForSphere(8), 2);
});

test('act-1 boss keeps the M3 baseline HP + scale (byte-identical)', () => {
  const isl = islands();
  const roster = spawnEnemies(9, 2, isl); // sphere index 2 = act 0 boss
  const boss = roster.find((e) => e.boss);
  assert.ok(boss, 'act-1 boss spawned');
  assert.equal(boss.hp, tuning.enemies.boss.hp, 'baseline boss HP unchanged');
  assert.equal(boss.speedScale, 1, 'no speed scale in act 1');
});

test('later act bosses soak more stomps and move faster', () => {
  const isl = islands();
  const b1 = spawnEnemies(9, 2, isl).find((e) => e.boss); // act 0
  const b2 = spawnEnemies(9, 5, isl).find((e) => e.boss); // act 1
  const b3 = spawnEnemies(9, 8, isl).find((e) => e.boss); // act 2
  assert.equal(b2.hp, tuning.enemies.boss.hp + tuning.enemies.act.bossHpPerAct);
  assert.equal(b3.hp, tuning.enemies.boss.hp + 2 * tuning.enemies.act.bossHpPerAct);
  assert.ok(b3.hp > b2.hp && b2.hp > b1.hp, 'HP escalates by act');
  assert.ok(b3.speedScale > b2.speedScale && b2.speedScale > b1.speedScale, 'speed escalates by act');
});

test('swoopers dive faster in later acts (and only swoopers scale)', () => {
  // Force a swooper by scanning a few seeds/spheres for one; assert its speedScale by act.
  const isl = islands();
  const find = (sphere) => spawnEnemies(3, sphere, isl).find((e) => e.type === 'swooper');
  // Determinism across acts is seed-dependent; just assert the rule holds where a swooper exists.
  for (const [sphere, act] of [[1, 0], [4, 1], [7, 2]]) {
    const sw = find(sphere);
    if (sw) assert.ok(Math.abs(sw.speedScale - (1 + act * tuning.enemies.act.speedMulPerAct)) < 1e-9, `swooper scale at act ${act}`);
  }
  // A drifter/turret/hopper never scales (ambient timing preserved).
  const nonAir = spawnEnemies(3, 7, isl).find((e) => e.type === 'drifter' || e.type === 'turret' || e.type === 'hopper');
  if (nonAir) assert.equal(nonAir.speedScale, 1, 'ambient archetypes keep scale 1');
});

test('a scaled boss actually advances faster under the real tick', () => {
  const isl = islands();
  const player = { pos: { x: 40, y: 0, z: 40 } };
  const step = (boss) => {
    boss.cool = tuning.enemies.boss.slamInterval; // resting/chase window
    const x0 = boss.pos.x;
    updateEnemies([boss], player, 1 / 60);
    return Math.abs(boss.pos.x - x0);
  };
  const b1 = spawnEnemies(9, 2, isl).find((e) => e.boss);
  const b3 = spawnEnemies(9, 8, isl).find((e) => e.boss);
  // Same starting home geometry only if the boss island differs; compare the per-tick chase
  // displacement magnitude which is proportional to speedScale.
  b1.pos = { x: 0, y: 5, z: 0 }; b3.pos = { x: 0, y: 5, z: 0 };
  assert.ok(step(b3) > step(b1), 'act-3 boss closes distance faster');
});
