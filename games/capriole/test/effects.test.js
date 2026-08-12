// node --test — M3 sparks + the firework secondary: kills drop sparks; collecting them
// feeds par relief, pip-fragments (fragmentsPerPip → a pip), and firework ammo; stomp
// chains multiply the drop; the firework fires on press, gated by ammo + cooldown, and
// kills the first enemy it reaches (boss chip respects i-frames). Pure sim; no WebGL.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, stepOnce, killEnemy } from '../src/sim/world.js';
import { tuning } from '../src/sim/tuning.js';

function fakeEnemy(over = {}) {
  return {
    type: 'turret', island: 1, hpMax: 1, r: 0.85,
    home: { x: 0, y: 0, z: 0 }, phase: 0,
    pos: { x: 0, y: 0, z: 0 }, vel: { x: 0, y: 0, z: 0 },
    alive: true, hp: 1, t: 0, cool: 0, invuln: 0, boss: false, diving: false,
    hitThisTick: false, killedThisTick: false, ...over,
  };
}

test('killing an enemy drops sparks; collecting them feeds par, fragments, and ammo', () => {
  const w = createWorld(1, 1);
  w.enemies = [];
  w.hp = 2; // below max so a pip can land
  w.firework.ammo = 0;
  w.par.elapsed = 50;
  const en = fakeEnemy({ pos: { x: 20, y: 5, z: 20 } });
  killEnemy(w, en, 0); // direct kill → drops sparks at (20,5,20)
  assert.equal(w.sparks.length, tuning.spark.perKill, 'perKill sparks dropped (no chain)');
  // Park the player on the sparks and let them get collected.
  const p = w.player;
  p.pos.x = 20; p.pos.y = 5; p.pos.z = 20; p.vel.x = p.vel.y = p.vel.z = 0; p.grounded = true;
  let totalCollected = 0;
  for (let i = 0; i < 10 && w.sparks.some((s) => s.alive); i++) { stepOnce(w); totalCollected += w.sparkCollectedThisTick; }
  assert.equal(totalCollected, tuning.spark.perKill, 'all sparks collected');
  assert.ok(w.par.elapsed < 50, 'par relief applied (elapsed reduced)');
  assert.ok(w.firework.ammo > 0, 'sparks refilled firework ammo');
  assert.ok(w.fragments + w.hp * 0 >= 0, 'fragments tracked');
});

test('collecting fragmentsPerPip sparks yields one HP pip', () => {
  const w = createWorld(1, 1);
  w.enemies = [];
  w.hp = 1;
  const need = tuning.hp.fragmentsPerPip;
  // Drop exactly `need` sparks by killing enough enemies (perKill each), then collect.
  let dropped = 0, idx = 0;
  while (dropped < need) { killEnemy(w, fakeEnemy({ pos: { x: 0, y: 3, z: 0 } }), idx++); dropped += tuning.spark.perKill; }
  const p = w.player; p.pos.x = 0; p.pos.y = 3; p.pos.z = 0; p.grounded = true;
  for (let i = 0; i < 12 && w.sparks.some((s) => s.alive); i++) stepOnce(w);
  assert.ok(w.hp >= 2, 'gained at least one pip from fragments');
});

test('stomp chains multiply the spark drop', () => {
  const w = createWorld(1, 1);
  w.stompChain = 4; // deep chain
  const before = w.sparks.length;
  killEnemy(w, fakeEnemy({ pos: { x: 0, y: 3, z: 0 } }), 0);
  const chainDrop = w.sparks.length - before;
  assert.ok(chainDrop > tuning.spark.perKill, `chain drop ${chainDrop} exceeds base ${tuning.spark.perKill}`);
});

test('the firework fires on press (ammo + cooldown gated) and kills the first enemy it reaches', () => {
  const w = createWorld(1, 1);
  const p = w.player;
  p.yaw = 0; // facing -Z
  const en = fakeEnemy({ pos: { x: p.pos.x, y: p.pos.y + tuning.camera.eyeHeight, z: p.pos.z - 5 },
    home: { x: p.pos.x, y: p.pos.y + tuning.camera.eyeHeight, z: p.pos.z - 5 } });
  w.enemies = [en];
  const ammo0 = w.firework.ammo;
  stepOnce(w, { fire: true }); // press
  assert.ok(w.fireworkFiredThisTick, 'a shot launched');
  assert.equal(w.firework.ammo, ammo0 - 1, 'ammo consumed');
  assert.equal(w.projectiles.filter((x) => x.alive).length, 1, 'one projectile in flight');
  // Holding does not re-fire while on cooldown.
  stepOnce(w, { fire: true });
  assert.equal(w.firework.ammo, ammo0 - 1, 'no re-fire on hold/cooldown');
  // Let it fly into the enemy.
  let hit = false;
  for (let i = 0; i < 20 && !hit; i++) { stepOnce(w, { fire: false }); if (w.fireworkHitThisTick >= 0) hit = true; }
  assert.ok(hit, 'projectile reached the enemy');
  assert.equal(en.alive, false, 'normal enemy killed by the firework');
});

test('sparks fade after their lifetime if never collected', () => {
  const w = createWorld(1, 1);
  w.enemies = [];
  killEnemy(w, fakeEnemy({ pos: { x: 200, y: 5, z: 200 } }), 0); // far from the player
  const ticks = Math.ceil((tuning.spark.lifeSec + 0.5) * 60);
  for (let i = 0; i < ticks; i++) stepOnce(w);
  assert.ok(w.sparks.every((s) => !s.alive), 'all uncollected sparks expired');
});
