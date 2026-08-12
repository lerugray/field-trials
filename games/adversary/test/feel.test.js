import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FEEL, DERIVED } from '../src/config/feel.js';

test('feel table: derived jump physics match the documented values (STUDY.md §4.1)', () => {
  assert.equal(DERIVED.JUMP_APEX, 48, 'apex must be 48px (3 tiles)');
  assert.equal(DERIVED.JUMP_TIME_TO_APEX, 16, 'time to apex must be 16 ticks');
  assert.equal(DERIVED.JUMP_AIRTIME, 32, 'airtime must be 32 ticks');
  assert.equal(DERIVED.JUMP_APEX, DERIVED.JUMP_TIME_TO_APEX * 3, 'apex = 3 tiles cross-check');
});

test('feel table: tick dt is 1/60s', () => {
  assert.ok(Math.abs(DERIVED.TICK_DT - 1 / 60) < 1e-12);
  assert.equal(FEEL.TICK_HZ, 60);
});

test('feel table: dodge is a short step, not roll-spam (DESIGN-SEED)', () => {
  assert.equal(FEEL.DODGE_IFRAME_TICKS, FEEL.DODGE_DURATION_TICKS, 'i-frames span the whole dodge');
  assert.ok(FEEL.DODGE_IFRAME_TICKS < FEEL.HITSTUN_IFRAME_TICKS, 'dodge i-frames < hit-stun invuln');
  assert.ok(FEEL.DODGE_COOLDOWN_TICKS > FEEL.DODGE_DURATION_TICKS, 'cooldown outlasts the dodge');
});

test('feel table: charge thresholds are ordered', () => {
  assert.ok(FEEL.CHARGE_MIN_TICKS < FEEL.CHARGE_FULL_TICKS);
});

test('feel table: constants are frozen', () => {
  assert.throws(() => { FEEL.WALK_SPEED = 99; }, TypeError);
  assert.throws(() => { DERIVED.JUMP_APEX = 0; }, TypeError);
});
