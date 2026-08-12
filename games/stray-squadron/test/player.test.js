import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createPlayerState, damagePlayer, updatePlayer, PLAYER,
  resolveEnemyBolts, resolveObstacle, resolveEnemyContact,
} from '../src/combat/player.js';
import { createProjectiles, spawnProjectile } from '../src/combat/projectiles.js';

const SHIP = { s: 100, lat: 0, vert: 0, radius: PLAYER.radius };

test('a hit subtracts hull, records the source, and grants i-frames', () => {
  const p = createPlayerState();
  assert.ok(damagePlayer(p, 1, 'ASTEROID', 5));
  assert.equal(p.hull, PLAYER.maxHull - 1);
  assert.equal(p.lastHitBy, 'ASTEROID');
  assert.equal(p.hitAt, 5);
  assert.ok(p.invuln > 0);
  assert.equal(p.shake, 1);
});

test('i-frames block further damage until they expire (no chain-stun death)', () => {
  const p = createPlayerState();
  damagePlayer(p, 1, 'ENEMY FIRE', 0);
  assert.equal(damagePlayer(p, 1, 'ENEMY FIRE', 0.1), false, 'blocked while invuln');
  assert.equal(p.hull, PLAYER.maxHull - 1);
  // run out the i-frames
  let t = 0;
  while (p.invuln > 0) { updatePlayer(p, 1 / 60); t += 1 / 60; }
  assert.ok(damagePlayer(p, 1, 'ENEMY FIRE', t), 'takes damage again after i-frames');
  assert.equal(p.hull, PLAYER.maxHull - 2);
});

test('hull hitting zero kills the player, clamped not negative', () => {
  const p = createPlayerState();
  let now = 0;
  while (p.alive) {
    damagePlayer(p, 2, 'COLLISION', now);
    now += PLAYER.invuln + 0.01;
    updatePlayer(p, PLAYER.invuln + 0.01);
  }
  assert.equal(p.alive, false);
  assert.equal(p.hull, 0);
});

test('shake impulse decays to zero', () => {
  const p = createPlayerState();
  damagePlayer(p, 1, 'ASTEROID', 0);
  let t = 0;
  while (p.shake > 0 && t < 2) { updatePlayer(p, 1 / 60); t += 1 / 60; }
  assert.equal(p.shake, 0);
});

test('enemy bolt on the ship lands damage and is consumed; player bolt ignored', () => {
  const p = createPlayerState();
  const proj = createProjectiles();
  spawnProjectile(proj, { team: 'enemy', s: 100, lat: 0, vert: 0 });
  spawnProjectile(proj, { team: 'player', s: 100, lat: 0, vert: 0 });
  assert.ok(resolveEnemyBolts(proj, SHIP, p, 0));
  assert.equal(p.hull, PLAYER.maxHull - 1);
  assert.ok(proj.list[0].dead, 'enemy bolt consumed');
  assert.ok(!proj.list[1].dead, 'player bolt untouched');
});

test('two enemy bolts in one instant only cost one hull (i-frames), both spent', () => {
  const p = createPlayerState();
  const proj = createProjectiles();
  spawnProjectile(proj, { team: 'enemy', s: 100, lat: 0.1, vert: 0 });
  spawnProjectile(proj, { team: 'enemy', s: 100, lat: -0.1, vert: 0 });
  resolveEnemyBolts(proj, SHIP, p, 0);
  assert.equal(p.hull, PLAYER.maxHull - 1);
  assert.ok(proj.list.every((b) => b.dead));
});

test('obstacle collision damages with ASTEROID attribution', () => {
  const p = createPlayerState();
  const course = [{ s: 100, lat: 0, vert: 0, radius: 1.0 }];
  assert.ok(resolveObstacle(course, SHIP, p, 0));
  assert.equal(p.lastHitBy, 'ASTEROID');
  // steered clear -> no hit
  const p2 = createPlayerState();
  assert.equal(resolveObstacle(course, { s: 100, lat: 3, vert: 0, radius: PLAYER.radius }, p2, 0), false);
});

test('enemy contact damages with COLLISION attribution; dead enemies ignored', () => {
  const p = createPlayerState();
  const enemies = [{ s: 100, lat: 0, vert: 0, radius: 0.8, alive: true }];
  assert.ok(resolveEnemyContact(enemies, SHIP, p, 0));
  assert.equal(p.lastHitBy, 'COLLISION');
  assert.equal(p.hull, PLAYER.maxHull - PLAYER.dmgContact);
  const p2 = createPlayerState();
  enemies[0].alive = false;
  assert.equal(resolveEnemyContact(enemies, SHIP, p2, 0), false);
});
