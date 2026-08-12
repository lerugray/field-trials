import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createProjectiles } from '../src/combat/projectiles.js';
import { createWeapon, updateWeapon, lockEngaged, WEAPON } from '../src/combat/weapons.js';
import { acquireLock, LOCK } from '../src/combat/lockon.js';
import { PROJECTILE } from '../src/combat/projectiles.js';

const CD = PROJECTILE.convergeDist;

// hold fire for `secs` then release; returns the pool
function holdRelease(secs, lock) {
  const pool = createProjectiles();
  const w = createWeapon();
  const muzzle = { s: 0, lat: 0.4, vert: 0.1 };
  const dt = 1 / 60;
  for (let t = 0; t < secs; t += dt) updateWeapon(w, { fire: true }, muzzle, pool, dt, lock);
  updateWeapon(w, { fire: false }, muzzle, pool, dt, lock); // release
  return { pool, w };
}

test('a quick tap fires only the normal pair, no charged bolt', () => {
  const { pool } = holdRelease(0.05, null); // released before threshold
  assert.equal(pool.list.filter((p) => p.charged).length, 0);
  assert.equal(pool.list.length, 2);
});

test('a full hold releases one fat charged bolt', () => {
  const { pool } = holdRelease(1.5, null); // past the autofire delay + charge time
  const charged = pool.list.filter((p) => p.charged);
  assert.equal(charged.length, 1);
  assert.equal(charged[0].radius, PROJECTILE.chargedRadius);
});

test('lock engages only after lockStart charge', () => {
  const pool = createProjectiles();
  const w = createWeapon();
  const muzzle = { s: 0, lat: 0, vert: 0 };
  updateWeapon(w, { fire: true }, muzzle, pool, 1 / 60, null); // press, tiny charge
  assert.equal(lockEngaged(w), false);
  for (let i = 0; i < 60; i++) updateWeapon(w, { fire: true }, muzzle, pool, 1 / 60, null);
  assert.equal(lockEngaged(w), true);
});

test('charged bolt aims at the locked target', () => {
  const lock = { s: 100, lat: -1.5, vert: 0.6, alive: true };
  const { pool } = holdRelease(1.5, lock); // past the autofire delay + charge time
  const charged = pool.list.find((p) => p.charged);
  assert.equal(charged.aimLat, -1.5);
  assert.equal(charged.aimVert, 0.6);
});

test('acquireLock picks the nearest enemy inside the forward cone', () => {
  const ship = { s: 0, lat: 0, vert: 0 };
  const near = { s: 25, lat: 0.2, vert: 0, alive: true };  // within LOCK.rangeS
  const far = { s: 120, lat: 0.2, vert: 0, alive: true };  // out of range either way
  const locked = acquireLock([far, near], ship, CD);
  assert.equal(locked, near);
});

test('acquireLock rejects out-of-cone, out-of-range, dead, and behind', () => {
  const ship = { s: 0, lat: 0, vert: 0 };
  const wide = { s: 25, lat: 6, vert: 0, alive: true };       // in range, outside cone
  const tooFar = { s: LOCK.rangeS + 50, lat: 0, vert: 0, alive: true };
  const behind = { s: -20, lat: 0, vert: 0, alive: true };
  const dead = { s: 25, lat: 0, vert: 0, alive: false };
  assert.equal(acquireLock([wide, tooFar, behind, dead], ship, CD), null);
});

test('lock cone follows the converging aim line, not the raw ship offset', () => {
  // ship steered hard right; a centered far enemy is on the convergence line and
  // should be lockable even though the ship is offset.
  const ship = { s: 0, lat: 3.0, vert: 0 };
  const centered = { s: CD + 2, lat: 0.1, vert: 0, alive: true }; // past convergeDist -> aim ~center; within LOCK.rangeS
  const locked = acquireLock([centered], ship, CD);
  assert.equal(locked, centered);
});
