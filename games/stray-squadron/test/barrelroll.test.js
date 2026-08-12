import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createRollState, triggerRoll, updateRoll, rollAngle, isDeflecting, ROLL,
} from '../src/combat/barrelroll.js';
import { createProjectiles, spawnProjectile } from '../src/combat/projectiles.js';
import { createPlayerState, resolveEnemyBolts, PLAYER } from '../src/combat/player.js';

const SHIP = { s: 100, lat: 0, vert: 0, radius: PLAYER.radius };

test('a roll starts, spins a full turn, and ends', () => {
  const r = createRollState();
  assert.ok(triggerRoll(r, 1));
  assert.ok(r.active);
  // at the very start, angle ~0; near the end, ~2pi
  assert.ok(Math.abs(rollAngle(r)) < 0.1);
  let t = 0;
  while (r.active && t < 2) { updateRoll(r, 1 / 60); t += 1 / 60; }
  assert.equal(r.active, false);
  assert.ok(r.cooldown > 0, 'cooldown after a roll');
});

test('cannot start a second roll mid-roll or during cooldown', () => {
  const r = createRollState();
  triggerRoll(r, 1);
  assert.equal(triggerRoll(r, -1), false, 'blocked mid-roll');
  let t = 0;
  while (r.active && t < 2) { updateRoll(r, 1 / 60); t += 1 / 60; }
  assert.equal(triggerRoll(r, 1), false, 'blocked during cooldown');
  while (r.cooldown > 0) updateRoll(r, 1 / 60);
  assert.ok(triggerRoll(r, 1), 'allowed after cooldown clears');
});

test('deflect window is only the early part of the spin', () => {
  const r = createRollState();
  triggerRoll(r, 1);
  assert.ok(isDeflecting(r), 'deflecting at the start');
  // advance past the deflect window but not the whole roll
  let t = 0;
  while (t < ROLL.deflectWindow + 0.02) { updateRoll(r, 1 / 60); t += 1 / 60; }
  assert.equal(isDeflecting(r), false, 'no longer deflecting late in the spin');
  assert.ok(r.active, 'but still visibly rolling');
});

test('deflecting knocks out enemy bolts without taking damage', () => {
  const r = createRollState();
  triggerRoll(r, 1);
  const player = createPlayerState();
  const proj = createProjectiles();
  spawnProjectile(proj, { team: 'enemy', s: 100, lat: 0, vert: 0 });
  const landed = resolveEnemyBolts(proj, SHIP, player, 0, isDeflecting(r));
  assert.equal(landed, false, 'no hit landed');
  assert.equal(player.hull, PLAYER.maxHull, 'full hull');
  assert.ok(proj.list[0].dead && proj.list[0].deflected, 'bolt deflected');
});

test('NOT deflecting, the same bolt hurts', () => {
  const player = createPlayerState();
  const proj = createProjectiles();
  spawnProjectile(proj, { team: 'enemy', s: 100, lat: 0, vert: 0 });
  assert.ok(resolveEnemyBolts(proj, SHIP, player, 0, false));
  assert.equal(player.hull, PLAYER.maxHull - PLAYER.dmgEnemyBolt);
});

test('reduced-motion damps the visible spin but not the deflect timing', () => {
  const r = createRollState();
  triggerRoll(r, 1);
  updateRoll(r, ROLL.duration * 0.3);
  const full = rollAngle(r, 1);
  const damped = rollAngle(r, 0.12);
  assert.ok(Math.abs(damped) < Math.abs(full), 'visibly smaller spin');
  assert.equal(isDeflecting(r), true, 'deflect state identical regardless of visual');
});

test('roll direction sign is respected', () => {
  const rl = createRollState(); triggerRoll(rl, -1); updateRoll(rl, ROLL.duration * 0.25);
  const rr = createRollState(); triggerRoll(rr, 1); updateRoll(rr, ROLL.duration * 0.25);
  assert.ok(rollAngle(rl) < 0 && rollAngle(rr) > 0);
});
