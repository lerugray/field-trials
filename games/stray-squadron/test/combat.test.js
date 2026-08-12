import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createProjectiles, spawnProjectile } from '../src/combat/projectiles.js';
import { createExplosions, stepExplosions, explosionFlash, spawnExplosion, EXPLOSION, SHARD_DIRS }
  from '../src/combat/explosions.js';
import { createRunState, resolvePlayerHits, DAMAGE } from '../src/combat/combat.js';

function enemy(over = {}) {
  return { id: 1, s: 100, lat: 0, vert: 0, radius: 0.8, hp: 1, maxHp: 1, score: 100, alive: true, ...over };
}

test('a bolt on target kills a 1-hp drone, banks score, spawns an explosion', () => {
  const proj = createProjectiles();
  spawnProjectile(proj, { team: 'player', s: 100, lat: 0, vert: 0 });
  const enemies = [enemy()];
  const expl = createExplosions();
  const run = createRunState();
  const kills = resolvePlayerHits(proj, enemies, expl, run);
  assert.equal(kills, 1);
  assert.equal(enemies[0].alive, false);
  assert.equal(run.kills, 1);
  assert.equal(run.score, 100);
  assert.equal(run.shotsHit, 1);
  assert.equal(expl.list.length, 1);
  assert.ok(proj.list[0].dead);
});

test('a gunner takes three bolts to down', () => {
  const enemies = [enemy({ hp: 3, maxHp: 3, score: 250 })];
  const expl = createExplosions();
  const run = createRunState();
  for (let i = 0; i < 2; i++) {
    const proj = createProjectiles();
    spawnProjectile(proj, { team: 'player', s: 100, lat: 0, vert: 0 });
    resolvePlayerHits(proj, enemies, expl, run);
    assert.equal(enemies[0].alive, true, `alive after ${i + 1} hits`);
  }
  const proj = createProjectiles();
  spawnProjectile(proj, { team: 'player', s: 100, lat: 0, vert: 0 });
  const kills = resolvePlayerHits(proj, enemies, expl, run);
  assert.equal(kills, 1);
  assert.equal(run.score, 250);
});

test('a charged bolt one-shots a gunner', () => {
  const proj = createProjectiles();
  spawnProjectile(proj, { team: 'player', s: 100, lat: 0, vert: 0, charged: true });
  const enemies = [enemy({ hp: DAMAGE.chargedBolt, maxHp: DAMAGE.chargedBolt })];
  const run = createRunState();
  const kills = resolvePlayerHits(proj, enemies, createExplosions(), run);
  assert.equal(kills, 1);
});

test('a miss neither kills nor consumes the bolt', () => {
  const proj = createProjectiles();
  spawnProjectile(proj, { team: 'player', s: 100, lat: 5, vert: 0 }); // way off to the side
  const enemies = [enemy()];
  const run = createRunState();
  const kills = resolvePlayerHits(proj, enemies, createExplosions(), run);
  assert.equal(kills, 0);
  assert.equal(enemies[0].alive, true);
  assert.ok(!proj.list[0].dead);
});

test('one bolt cannot kill two stacked enemies', () => {
  const proj = createProjectiles();
  spawnProjectile(proj, { team: 'player', s: 100, lat: 0, vert: 0 });
  const enemies = [enemy({ id: 1 }), enemy({ id: 2 })];
  const run = createRunState();
  const kills = resolvePlayerHits(proj, enemies, createExplosions(), run);
  assert.equal(kills, 1); // only one dies to a single bolt
});

test('enemy bolts are ignored by player-hit resolution', () => {
  const proj = createProjectiles();
  spawnProjectile(proj, { team: 'enemy', s: 100, lat: 0, vert: 0 });
  const enemies = [enemy()];
  const run = createRunState();
  assert.equal(resolvePlayerHits(proj, enemies, createExplosions(), run), 0);
  assert.equal(enemies[0].alive, true);
});

test('explosion lives its full duration then despawns', () => {
  const expl = createExplosions();
  spawnExplosion(expl, { s: 0, lat: 0, vert: 0, scale: 1 });
  let t = 0;
  while (t < EXPLOSION.dur - 0.02) { stepExplosions(expl, 0.05); t += 0.05; }
  assert.equal(expl.list.length, 1, 'still alive mid-life');
  stepExplosions(expl, 0.1);
  assert.equal(expl.list.length, 0, 'gone after duration');
});

test('screen flash is hard-capped and suppressed under reduced motion', () => {
  const expl = createExplosions();
  // stack several big explosions to try to blow past the cap
  for (let i = 0; i < 6; i++) spawnExplosion(expl, { s: 0, lat: 0, vert: 0, scale: 4 });
  const f = explosionFlash(expl, false);
  assert.ok(f <= EXPLOSION.flashCap + 1e-9, `flash ${f} within cap`);
  assert.ok(f > 0, 'there is some flash');
  assert.equal(explosionFlash(expl, true), 0, 'reduced motion kills the flash');
});

test('shard directions are unit vectors and evenly many', () => {
  assert.equal(SHARD_DIRS.length, EXPLOSION.shardCount);
  for (const d of SHARD_DIRS) {
    assert.ok(Math.abs(Math.hypot(d[0], d[1], d[2]) - 1) < 1e-9);
  }
});
