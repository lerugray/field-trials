import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createProjectile, projectileAabb, stepProjectile } from '../src/sim/projectile.js';
import { createTilemap } from '../src/sim/tilemap.js';
import { createStage, stepStage } from '../src/sim/stage.js';

test('projectile: travels, and dies on its lifetime', () => {
  const p = createProjectile({ x: 0, y: 0, vx: 2, damage: 5, life: 3 });
  stepProjectile(p, null); assert.equal(p.x, 2); assert.ok(!p.dead);
  stepProjectile(p, null);
  stepProjectile(p, null);
  assert.ok(p.dead, 'died at end of life');
});

test('projectile: dies on a solid tile', () => {
  const tm = createTilemap(['....', '..#.', '....']);
  const p = createProjectile({ x: 0, y: 16 + 8, vx: 16, damage: 5, life: 30 });
  stepProjectile(p, tm); // x=16 (col1, air)
  assert.ok(!p.dead);
  stepProjectile(p, tm); // x=32 (col2 row1 = solid)
  assert.ok(p.dead);
});

test('projectile: aabb is centered', () => {
  const box = projectileAabb({ x: 100, y: 50, w: 8, h: 6 });
  assert.equal(box.x, 96); assert.equal(box.y, 47);
});

// --- stage integration ---
const W = 24;
const brow = (() => { const a = Array(W).fill('.'); a[2] = 'p'; a[10] = 'w'; a[22] = 'x'; return a.join(''); })();
const DEF = (kit) => ({ rows: ['.'.repeat(W), '.'.repeat(W), brow, '#'.repeat(W)], kit });

test('projectile: full-health beam fires on a normal swing at full HP and hits an enemy', () => {
  const s = createStage(DEF({ projectile: true }), { seed: 'beam' });
  s.player.x = s.enemies[0].x - 40; s.player.facing = 1; // out of melee reach
  assert.equal(s.progress.hp, s.progress.stats.maxHP);
  const ev = stepStage(s, { moveDir: 0, attackPressed: true, attackDown: true });
  assert.ok(ev.some((e) => e.type === 'kit-move' && e.move === 'projectile'), 'beam spawned');
  assert.equal(s.projectiles.length, 1);
  // Let it fly into the enemy.
  let hit = false;
  for (let t = 0; t < 40 && !hit; t++) {
    const e = stepStage(s, { moveDir: 0 });
    if (e.some((x) => x.type === 'hit')) hit = true;
  }
  assert.ok(hit, 'beam struck the enemy');
});

test('projectile: no beam when below full HP', () => {
  const s = createStage(DEF({ projectile: true }), { seed: 'nobeam' });
  s.progress.hp = s.progress.stats.maxHP - 1;
  const ev = stepStage(s, { moveDir: 0, attackPressed: true, attackDown: true });
  assert.ok(!ev.some((e) => e.type === 'kit-move' && e.move === 'projectile'));
  assert.equal(s.projectiles.length, 0);
});

test('projectile: sub-weapon consumes a resource and refills on rest', () => {
  const cW = 24;
  const crow = (() => { const a = Array(cW).fill('.'); a[2] = 'p'; a[6] = 'c'; a[22] = 'x'; return a.join(''); })();
  const s = createStage({ rows: ['.'.repeat(cW), '.'.repeat(cW), crow, '#'.repeat(cW)], kit: { subweapon: true } }, { seed: 'sub' });
  const start = s.subResource;
  const ev = stepStage(s, { moveDir: 0, up: true, subweaponPressed: true });
  assert.ok(ev.some((e) => e.type === 'kit-move' && e.move === 'subweapon'));
  assert.equal(s.subResource, start - 1);
  assert.equal(s.projectiles.length, 1);
  // Drain to zero → no more fire.
  s.subResource = 0;
  const ev2 = stepStage(s, { moveDir: 0, up: true, subweaponPressed: true });
  assert.ok(!ev2.some((e) => e.type === 'kit-move' && e.move === 'subweapon'));
  // Rest at the checkpoint refills.
  s.player.x = s.checkpoints[0].x; s.player.y = s.checkpoints[0].y;
  stepStage(s, { moveDir: 0, rest: true });
  assert.equal(s.subResource, s.subResourceMax);
});
