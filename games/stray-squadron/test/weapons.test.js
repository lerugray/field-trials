import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createProjectiles } from '../src/combat/projectiles.js';
import { createWeapon, updateWeapon, lockEngaged, WEAPON } from '../src/combat/weapons.js';

// M14 fire model: tap fires once; a short hold streams basic volleys at a slower
// cadence than perfect tapping; an uninterrupted hold past holdChargeDelay stops the
// stream and transitions to charging, and releasing past chargeThreshold fires one
// charged bolt. These tests guard those three transitions (tap / short-hold stream /
// long-hold charge).

const MUZZLE = { s: 0, lat: 0, vert: 0 };
const DT = 1 / 60;

// Drive the weapon with input.fire = held for `seconds`, stepping at 60Hz.
function drive(state, pool, held, seconds) {
  const steps = Math.round(seconds / DT);
  for (let i = 0; i < steps; i++) updateWeapon(state, { fire: held }, MUZZLE, pool, DT, null);
}

const charged = (pool) => pool.list.filter((p) => p.charged);
const basic = (pool) => pool.list.filter((p) => !p.charged);

test('TAP: a single press fires exactly one converging pair and no charged bolt', () => {
  const w = createWeapon();
  const pool = createProjectiles();
  updateWeapon(w, { fire: true }, MUZZLE, pool, DT, null);  // press
  updateWeapon(w, { fire: false }, MUZZLE, pool, DT, null); // release immediately
  assert.equal(basic(pool).length, 2, 'one wing-pair');
  assert.equal(charged(pool).length, 0, 'no charged bolt from a tap');
  assert.equal(w.charge, 0);
  assert.equal(w.heldTime, 0, 'heldTime reset on release');
});

test('SHORT-HOLD STREAM: holding below the charge delay streams basic volleys, never charges', () => {
  const w = createWeapon();
  const pool = createProjectiles();
  // Hold for just under holdChargeDelay so it stays in the autofire phase throughout.
  drive(w, pool, true, WEAPON.holdChargeDelay - 2 * DT);
  assert.ok(basic(pool).length >= 4, 'streamed more than the single press pair');
  assert.equal(charged(pool).length, 0, 'still no charged bolt mid-stream');
  assert.equal(w.charge, 0, 'charge does not build during the autofire phase');
  // Releasing from the autofire phase fires nothing extra (no charged bolt).
  const before = pool.list.length;
  updateWeapon(w, { fire: false }, MUZZLE, pool, DT, null);
  assert.equal(pool.list.length, before, 'release during stream fires nothing');
  assert.equal(charged(pool).length, 0);
});

test('AUTOFIRE cadence is slower than perfect tapping (deliberate tapping stays marginally optimal)', () => {
  // The steady-state gap between held autofire volleys must exceed the tap-mash cap,
  // so a player who taps well still out-fires a player who just holds.
  assert.ok(WEAPON.autofireInterval > WEAPON.fireInterval, 'autofire interval is the slower one');

  // Record the sim-time of each basic volley across a hold up to the charge delay.
  const w = createWeapon();
  const pool = createProjectiles();
  const times = [];
  let seen = 0;
  const steps = Math.round((WEAPON.holdChargeDelay - DT) / DT);
  for (let i = 0; i < steps; i++) {
    updateWeapon(w, { fire: true }, MUZZLE, pool, DT, null);
    if (basic(pool).length > seen) { seen = basic(pool).length; times.push(i * DT); }
  }
  assert.ok(times.length >= 3, 'the hold streamed several volleys');
  // The gap between the last two autofire volleys is the steady-state cadence.
  const steadyGap = times[times.length - 1] - times[times.length - 2];
  assert.ok(
    steadyGap >= WEAPON.fireInterval,
    `held cadence (${steadyGap.toFixed(3)}s) is no faster than the tap cap (${WEAPON.fireInterval}s)`,
  );
});

test('LONG-HOLD CHARGE: an uninterrupted hold past the delay stops the stream and charges', () => {
  const w = createWeapon();
  const pool = createProjectiles();
  // Hold well past the delay AND long enough to build past chargeThreshold.
  const holdSecs = WEAPON.holdChargeDelay + WEAPON.chargeThreshold / WEAPON.chargeRate + 0.1;
  drive(w, pool, true, holdSecs);

  const streamPairs = basic(pool).length;
  assert.ok(w.charge >= WEAPON.chargeThreshold, 'charge built past the release threshold');
  assert.ok(lockEngaged(w), 'lock cue engaged during the charge phase');

  // The stream must have STOPPED once charging began — no basic volleys after the delay.
  const wStop = createWeapon();
  const pStop = createProjectiles();
  drive(wStop, pStop, true, WEAPON.holdChargeDelay - DT);
  const pairsAtDelay = basic(pStop).length;
  assert.equal(streamPairs, pairsAtDelay, 'no basic volleys fire once the charge phase begins');

  // Releasing a fully-charged hold fires exactly one charged bolt.
  updateWeapon(w, { fire: false }, MUZZLE, pool, DT, null);
  assert.equal(charged(pool).length, 1, 'release past threshold fires one charged bolt');
  assert.equal(w.charge, 0, 'charge cleared on release');
  assert.equal(w.heldTime, 0, 'heldTime cleared on release');
});

test('CHARGE-PHASE UNDER THRESHOLD: releasing just after the stream stops fires nothing', () => {
  const w = createWeapon();
  const pool = createProjectiles();
  // Cross into the charge phase but release before charge reaches the threshold.
  drive(w, pool, true, WEAPON.holdChargeDelay + DT);
  assert.ok(w.charge > 0 && w.charge < WEAPON.chargeThreshold, 'charging but below threshold');
  const before = pool.list.length;
  updateWeapon(w, { fire: false }, MUZZLE, pool, DT, null);
  assert.equal(pool.list.length, before, 'no bolt when released below the charge threshold');
  assert.equal(charged(pool).length, 0);
});

test('lock cue is quiet during the autofire phase and only engages while charging', () => {
  const w = createWeapon();
  const pool = createProjectiles();
  drive(w, pool, true, WEAPON.holdChargeDelay - 2 * DT);
  assert.equal(lockEngaged(w), false, 'no lock cue while streaming basic shots');
});

test('re-press after a hold starts a fresh autofire phase (heldTime resets)', () => {
  const w = createWeapon();
  const pool = createProjectiles();
  drive(w, pool, true, WEAPON.holdChargeDelay + 0.3); // into charge phase
  updateWeapon(w, { fire: false }, MUZZLE, pool, DT, null); // release
  assert.equal(w.heldTime, 0);
  updateWeapon(w, { fire: true }, MUZZLE, pool, DT, null);  // fresh press
  assert.ok(w.heldTime < WEAPON.holdChargeDelay, 'a fresh press is back in the autofire phase');
  assert.equal(w.charge, 0, 'fresh press does not carry old charge');
});
