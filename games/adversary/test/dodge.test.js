import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPlayer, stepPlayer, playerInvulnerable, FACING } from '../src/sim/player.js';
import { FEEL } from '../src/config/feel.js';
import { createStage, stepStage } from '../src/sim/stage.js';

const GROUND = 100;
const world = { groundY: GROUND };
function grounded() { const p = createPlayer(0, GROUND); p.onGround = true; p.facing = FACING.RIGHT; return p; }

test('dodge: dashes DODGE_DISTANCE over its duration and grants i-frames throughout', () => {
  const p = grounded();
  let travelled = 0, invulnTicks = 0;
  const x0 = p.x;
  for (let t = 0; t < FEEL.DODGE_DURATION_TICKS; t++) {
    stepPlayer(p, { dodge: t === 0 }, world);
    if (playerInvulnerable(p)) invulnTicks++;
  }
  travelled = p.x - x0;
  assert.ok(Math.abs(travelled - FEEL.DODGE_DISTANCE) < 1e-6, `travelled ${travelled}`);
  assert.equal(invulnTicks, FEEL.DODGE_DURATION_TICKS, 'invulnerable for the whole dash');
  stepPlayer(p, {}, world); // the tick after the dash clears the i-frame flag
  assert.ok(!playerInvulnerable(p), 'invuln ends right after the dash');
});

test('dodge: honors cooldown (no roll-spam)', () => {
  const p = grounded();
  stepPlayer(p, { dodge: true }, world);
  for (let t = 0; t < FEEL.DODGE_DURATION_TICKS; t++) stepPlayer(p, {}, world); // finish dash
  assert.ok(p.dodgeCooldown > 0);
  // Immediately trying to dodge again is ignored until cooldown clears.
  stepPlayer(p, { dodge: true }, world);
  assert.equal(p.dodging, 0, 'blocked by cooldown');
  for (let t = 0; t < FEEL.DODGE_COOLDOWN_TICKS; t++) stepPlayer(p, {}, world);
  stepPlayer(p, { dodge: true }, world);
  assert.ok(p.dodging > 0, 'available again after cooldown');
});

test('dodge: dashes in the input direction, else facing', () => {
  const p = grounded();
  stepPlayer(p, { dodge: true, moveDir: -1 }, world);
  assert.equal(p.dodgeDir, -1);
  assert.ok(p.x < 0, 'moved left');
});

test('dodge: in the stage, a dodge avoids enemy contact damage', () => {
  const W = 16;
  const DEF = { rows: ['.'.repeat(W), '.'.repeat(W), 'p'.padEnd(W, '.').slice(0, 8) + 'w'.padEnd(W - 8, '.'), '#'.repeat(W)] };
  const s = createStage(DEF, { seed: 'dodge' });
  // Place the player overlapping the walker, then dodge on the contact tick.
  s.player.x = s.enemies[0].x;
  const hp0 = s.progress.hp;
  stepStage(s, { moveDir: 0, dodge: true });
  assert.equal(s.progress.hp, hp0, 'no damage taken while dodging through the enemy');
  assert.ok(s.player.dodging > 0);
});

test('dodge: air jump during dodge relaunches vy without breaking dodge windows', () => {
  const p = grounded();
  stepPlayer(p, { jumpPressed: true, jumpHeld: true, doubleJump: true }, world);
  assert.ok(!p.onGround);

  stepPlayer(p, { dodge: true, jumpHeld: true, doubleJump: true }, world);
  assert.equal(p.dodging, FEEL.DODGE_DURATION_TICKS);
  assert.ok(playerInvulnerable(p));
  assert.equal(p.dodgeCooldown, 0);

  stepPlayer(p, { jumpPressed: true, jumpHeld: true, doubleJump: true }, world);
  assert.equal(p.airJumped, true);
  assert.equal(p.airJumpUsed, true);
  assert.equal(p.vy, -FEEL.JUMP_VELOCITY + FEEL.GRAVITY);
  assert.equal(p.dodging, FEEL.DODGE_DURATION_TICKS - 1);
  assert.equal(p.dodgeCooldown, 0);
  assert.ok(playerInvulnerable(p));
});
