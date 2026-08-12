import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createProjectiles, spawnProjectile, stepProjectiles, projectileHits, PROJECTILE,
} from '../src/combat/projectiles.js';
import { createWeapon, updateWeapon, WEAPON } from '../src/combat/weapons.js';

test('player bolt travels forward and converges toward center', () => {
  const pool = createProjectiles();
  spawnProjectile(pool, { team: 'player', s: 100, lat: 1.5, vert: -0.8 });
  const p = pool.list[0];
  // step until it has traveled the full convergence distance
  let elapsed = 0;
  while (p.s - p.spawnS < PROJECTILE.convergeDist && elapsed < 5) {
    stepProjectiles(pool, 1 / 60);
    elapsed += 1 / 60;
  }
  assert.ok(p.s > 100, 'moved forward');
  assert.ok(Math.abs(p.lat) < 1e-6 && Math.abs(p.vert) < 1e-6, 'converged to center');
});

test('enemy bolt travels back toward the player (-s)', () => {
  const pool = createProjectiles();
  spawnProjectile(pool, { team: 'enemy', s: 200, lat: 0, vert: 0 });
  stepProjectiles(pool, 0.5);
  assert.ok(pool.list[0].s < 200, 'moved toward player');
});

test('bolts despawn after their lifetime', () => {
  const pool = createProjectiles();
  spawnProjectile(pool, { team: 'player', s: 0, lat: 0, vert: 0 });
  let t = 0;
  while (t < PROJECTILE.life + 0.2) { stepProjectiles(pool, 0.05); t += 0.05; }
  assert.equal(pool.list.length, 0);
});

test('a monster dt cannot warp a bolt past its clamp (fairness)', () => {
  const pool = createProjectiles();
  spawnProjectile(pool, { team: 'player', s: 0, lat: 0, vert: 0 });
  stepProjectiles(pool, 100); // absurd frame gap
  // clamped to 0.1s -> at most playerSpeed*0.1 forward
  assert.ok(pool.list[0].s <= PROJECTILE.playerSpeed * 0.1 + 1e-6);
});

test('projectileHits: sphere overlap and along-rail rejection', () => {
  const target = { s: 50, lat: 0, vert: 0, radius: 0.8 };
  assert.ok(projectileHits({ s: 50, lat: 0, vert: 0 }, target));
  // just outside the combined radius laterally
  assert.ok(!projectileHits({ s: 50, lat: 0, vert: 5 }, target));
  // far along the rail -> reject regardless of offset
  assert.ok(!projectileHits({ s: 90, lat: 0, vert: 0 }, target));
});

test('a press fires a converging pair from the two wings', () => {
  const pool = createProjectiles();
  const w = createWeapon();
  const n = updateWeapon(w, { fire: true }, { s: 10, lat: 0.3, vert: 0 }, pool, 1 / 60);
  assert.equal(n, 2);
  assert.equal(pool.list.length, 2);
  assert.equal(pool.list[0].lat, 0.3 - WEAPON.wingSpread);
  assert.equal(pool.list[1].lat, 0.3 + WEAPON.wingSpread);
  assert.equal(pool.list[0].s, 10 + WEAPON.muzzleLead);
});

test('holding autofires at a capped cadence, then charges (M14 hold model)', () => {
  const pool = createProjectiles();
  const w = createWeapon();
  const muzzle = { s: 0, lat: 0, vert: 0 };
  assert.equal(updateWeapon(w, { fire: true }, muzzle, pool, 1 / 60), 2); // press
  // Hold through the autofire phase (below the charge delay): it streams basic
  // volleys, but cadence-capped — never a bolt per frame — and does not charge yet.
  let more = 0;
  const steps = Math.round((WEAPON.holdChargeDelay - 2 / 60) / (1 / 60));
  for (let i = 0; i < steps; i++) more += updateWeapon(w, { fire: true }, muzzle, pool, 1 / 60);
  assert.ok(more > 0, 'holding streams basic volleys (autofire)');
  assert.ok(more < steps * 2, 'but cadence-capped, not a bolt per frame');
  assert.equal(w.charge, 0, 'no charge during the autofire phase');
  // Keep holding past the delay: the stream stops and it transitions to charging.
  for (let i = 0; i < 20; i++) updateWeapon(w, { fire: true }, muzzle, pool, 1 / 60);
  assert.ok(w.charge > 0, 'an uninterrupted hold past the delay charges');
});

test('mashing gives a cadence-capped stream, not a bolt per frame', () => {
  const pool = createProjectiles();
  const w = createWeapon();
  const muzzle = { s: 0, lat: 0, vert: 0 };
  let fires = 0;
  // toggle fire on/off every frame for 1 second; cooldown gates the rate
  for (let i = 0; i < 120; i++) fires += updateWeapon(w, { fire: i % 2 === 0 }, muzzle, pool, 1 / 120);
  const volleys = fires / 2;
  assert.ok(volleys >= 4 && volleys <= 8, `cadence-capped, got ${volleys} volleys`);
});
