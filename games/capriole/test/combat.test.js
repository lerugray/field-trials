// node --test — M3 BOUNCE: stomp resolution (kill + bounce + jump-chain refund), damage +
// knockback + i-frames, HP economy, death, the boss multi-stomp, and the updraft-net toll
// (law #7). Pure sim; no WebGL.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, stepOnce, advanceSphere } from '../src/sim/world.js';
import { tuning } from '../src/sim/tuning.js';

// A minimal, fully-specified enemy for controlled contact tests.
function fakeEnemy(over = {}) {
  return {
    type: 'turret', island: 1, hpMax: 1, r: 0.85,
    home: { x: 0, y: 0, z: 0 }, phase: 0,
    pos: { x: 0, y: 0, z: 0 }, vel: { x: 0, y: 0, z: 0 },
    alive: true, hp: 1, t: 0, cool: 0, invuln: 0, boss: false, diving: false,
    hitThisTick: false, killedThisTick: false, ...over,
  };
}

// Put a single enemy in the world and place the player relative to it, then tick once
// WITHOUT letting enemy AI move it (we freeze motion by using a turret at rest already at
// its home, and we overwrite pos right before stepOnce reads contacts — updateEnemies runs
// first, so we pin home == pos and t so the turret bob is ~0 at t≈0).
function withEnemy(world, en) {
  world.enemies = [en];
}

test('stomping an enemy kills it, bounces the player, and refunds the jump chain', () => {
  const w = createWorld(1, 1);
  const en = fakeEnemy({ pos: { x: 5, y: 3, z: 5 }, home: { x: 5, y: 2, z: 5 } });
  withEnemy(w, en);
  const p = w.player;
  // Player descending onto the enemy from above.
  p.pos.x = 5; p.pos.z = 5; p.pos.y = 3.3; p.vel.y = -8; p.grounded = false; p.jumpsUsed = 3; p.jumpChain = 3;
  stepOnce(w);
  assert.equal(en.alive, false, 'enemy killed by the stomp');
  assert.equal(w.stompedThisTick, 0, 'stomp legibility flag fired');
  assert.equal(w.killedThisTick, 0, 'kill legibility flag fired');
  assert.ok(p.vel.y >= tuning.stomp.bounceVel - 1e-6, 'player bounced up off the stomp');
  assert.equal(p.jumpsUsed, 0, 'jump chain refunded (law #6)');
  assert.equal(w.stompChain, 1, 'stomp chain started');
  assert.equal(w.hp, w.hpMax, 'no damage taken on a clean stomp');
});

test('ambiguity favors the player: from above but slightly rising still stomps (law #3)', () => {
  const w = createWorld(1, 1);
  const en = fakeEnemy({ pos: { x: 5, y: 3, z: 5 }, home: { x: 5, y: 2, z: 5 } });
  withEnemy(w, en);
  const p = w.player;
  // Player just above the enemy center but with a small UPWARD velocity (ambiguous).
  p.pos.x = 5; p.pos.z = 5; p.pos.y = 3.1; p.vel.y = 1.5; p.grounded = false;
  const hp0 = w.hp;
  stepOnce(w);
  assert.equal(en.alive, false, 'resolved as a stomp, not a hit');
  assert.equal(w.hp, hp0, 'no damage taken');
});

test('a side/below contact damages the player with knockback + i-frames (not a stomp)', () => {
  const w = createWorld(1, 1);
  const en = fakeEnemy({ pos: { x: 5, y: 3, z: 5 }, home: { x: 5, y: 3, z: 5 } });
  withEnemy(w, en);
  const p = w.player;
  // Player at the enemy's level, rising (clearly not from above).
  p.pos.x = 5.5; p.pos.z = 5; p.pos.y = 3; p.vel.y = 5; p.grounded = false;
  const hp0 = w.hp;
  stepOnce(w);
  assert.equal(en.alive, true, 'enemy survives a non-stomp contact');
  assert.equal(w.hp, hp0 - tuning.enemies.contactDamage, 'player took a pip of damage');
  assert.ok(w.damagedThisTick, 'damage legibility flag fired');
  assert.ok(w.iframe > 0, 'i-frames granted');
  assert.ok(Math.hypot(p.vel.x, p.vel.z) > 0, 'knockback applied');
  assert.equal(w.stompChain, 0, 'a hit breaks the stomp chain');
});

test('a stomp grants hit-immunity for that tick (a clustered enemy cannot body-hit you as you bop)', () => {
  const w = createWorld(1, 1);
  w.enemies = [
    fakeEnemy({ pos: { x: 5, y: 3, z: 5 }, home: { x: 5, y: 2, z: 5 } }),   // stompable from above
    fakeEnemy({ pos: { x: 5.6, y: 3, z: 5 }, home: { x: 5.6, y: 3, z: 5 } }), // side contact
  ];
  const p = w.player;
  p.pos.x = 5; p.pos.z = 5; p.pos.y = 3.3; p.vel.y = -6; p.grounded = false;
  const hp0 = w.hp;
  stepOnce(w);
  assert.ok(w.stompedThisTick >= 0, 'a stomp resolved');
  assert.equal(w.hp, hp0, 'no body-hit landed on the same tick as the stomp');
});

test('i-frames block a second hit in the same window', () => {
  const w = createWorld(1, 1);
  const en = fakeEnemy({ pos: { x: 5, y: 3, z: 5 }, home: { x: 5, y: 3, z: 5 } });
  withEnemy(w, en);
  const p = w.player;
  p.pos.x = 5.5; p.pos.z = 5; p.pos.y = 3; p.vel.y = 5;
  stepOnce(w);
  const hpAfterFirst = w.hp;
  // Keep the player parked on the enemy; the very next tick must NOT deal damage.
  p.pos.x = 5.5; p.pos.z = 5; p.pos.y = 3; p.vel.y = 5;
  stepOnce(w);
  assert.equal(w.hp, hpAfterFirst, 'no second hit while invulnerable');
});

test('HP reaching zero flags death (scorecard is M4)', () => {
  const w = createWorld(1, 1);
  w.hp = 1;
  const en = fakeEnemy({ pos: { x: 5, y: 3, z: 5 }, home: { x: 5, y: 3, z: 5 } });
  withEnemy(w, en);
  const p = w.player;
  p.pos.x = 5.5; p.pos.z = 5; p.pos.y = 3; p.vel.y = 5;
  stepOnce(w);
  assert.equal(w.hp, 0);
  assert.ok(w.dead, 'dead flag set');
  assert.ok(w.diedThisTick, 'death legibility flag fired');
});

test('the boss soaks multiple stomps (i-frames space them) and its death restores pips', () => {
  const w = createWorld(1, 1);
  w.hp = 3;
  const b = fakeEnemy({ type: 'boss', boss: true, hpMax: tuning.enemies.boss.hp, hp: tuning.enemies.boss.hp,
    r: tuning.enemies.boss.r, pos: { x: 0, y: 4, z: 0 }, home: { x: 0, y: 0, z: 0 } });
  withEnemy(w, b);
  const p = w.player;
  let stomps = 0;
  for (let n = 0; n < tuning.enemies.boss.hp && b.alive; n++) {
    b.invuln = 0; // simulate the i-frame window elapsing between clean stomps
    p.pos.x = 0; p.pos.z = 0; p.pos.y = 4 + tuning.enemies.boss.r; p.vel.y = -6; p.grounded = false;
    stepOnce(w);
    stomps++;
  }
  assert.equal(b.alive, false, 'boss dies after its HP in stomps');
  assert.equal(stomps, tuning.enemies.boss.hp, 'took full HP of stomps');
  assert.ok(w.hp > 3, 'boss kill restored pips');
});

test('the updraft net charges 1 pip + par seconds and returns the player (law #7)', () => {
  const w = createWorld(1, 1);
  w.enemies = []; // isolate the net toll
  const hp0 = w.hp, par0 = w.par.elapsed;
  const p = w.player;
  w.lastGrounded = { x: 2, y: 1, z: 3 };
  p.pos.y = w.killPlaneY - 5; // below the kill-plane
  stepOnce(w);
  assert.ok(w.netTollThisTick, 'net toll fired');
  assert.equal(w.hp, hp0 - tuning.fall.netTollHp, 'net cost one pip');
  assert.ok(w.par.elapsed >= par0 + tuning.fall.netTollParSec, 'net cost par seconds');
  assert.ok(Math.abs(p.pos.x - 2) < 1e-6 && Math.abs(p.pos.z - 3) < 1e-6, 'returned to last grounded island');
});

test('clearing a sphere restores a pip (clamped to max)', () => {
  const w = createWorld(1, 1);
  w.hp = 2;
  advanceSphere(w);
  assert.equal(w.hp, 3, 'clearing restored one pip');
  w.hp = w.hpMax;
  advanceSphere(w);
  assert.equal(w.hp, w.hpMax, 'never exceeds max');
});
