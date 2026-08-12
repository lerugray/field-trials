import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPlayer, stepPlayer, FACING } from '../src/sim/player.js';
import { FEEL, DERIVED } from '../src/config/feel.js';

const GROUND = 100;
function grounded(x = 0) {
  const p = createPlayer(x, GROUND);
  p.onGround = true;
  return p;
}
const world = { groundY: GROUND };

test('player: walking moves at WALK_SPEED and sets facing', () => {
  const p = grounded();
  for (let t = 0; t < 10; t++) stepPlayer(p, { moveDir: 1 }, world);
  assert.ok(Math.abs(p.x - 10 * FEEL.WALK_SPEED) < 1e-9);
  assert.equal(p.facing, FACING.RIGHT);
  stepPlayer(p, { moveDir: -1 }, world);
  assert.equal(p.facing, FACING.LEFT);
});

test('player: full jump apex ~ documented (discrete undershoots continuous slightly)', () => {
  const p = grounded();
  let peak = GROUND, tPeak = 0;
  for (let t = 1; t <= 40; t++) {
    stepPlayer(p, { jumpPressed: t === 1, jumpHeld: true }, world);
    if (p.y < peak) { peak = p.y; tPeak = t; }
  }
  const apex = GROUND - peak;
  // Continuous target is DERIVED.JUMP_APEX (48px @ 16 ticks); semi-implicit Euler lands just under.
  assert.ok(apex >= 42 && apex <= DERIVED.JUMP_APEX, `apex ${apex} not near 48`);
  assert.ok(Math.abs(tPeak - DERIVED.JUMP_TIME_TO_APEX) <= 2, `time-to-apex ${tPeak}`);
});

test('player: airtime is close to the documented 32 ticks', () => {
  const p = grounded();
  let air = 0;
  for (let t = 1; t <= 80; t++) {
    stepPlayer(p, { jumpPressed: t === 1, jumpHeld: true }, world);
    if (!p.onGround) air++;
    else if (t > 2) break;
  }
  assert.ok(Math.abs(air - DERIVED.JUMP_AIRTIME) <= 3, `airtime ${air}`);
});

test('player: jump-cut (release early) shortens the hop', () => {
  const full = grounded();
  let fullApex = GROUND;
  for (let t = 1; t <= 40; t++) {
    stepPlayer(full, { jumpPressed: t === 1, jumpHeld: true }, world);
    fullApex = Math.min(fullApex, full.y);
  }
  const cut = grounded();
  let cutApex = GROUND;
  for (let t = 1; t <= 40; t++) {
    stepPlayer(cut, { jumpPressed: t === 1, jumpHeld: t <= 4 }, world);
    cutApex = Math.min(cutApex, cut.y);
  }
  assert.ok((GROUND - cutApex) < 0.7 * (GROUND - fullApex), 'cut hop must be clearly lower');
});

test('player: terminal fall velocity is capped', () => {
  const p = createPlayer(0, -1000); // high above ground, falling
  for (let t = 0; t < 200; t++) stepPlayer(p, {}, world);
  assert.ok(p.vy <= FEEL.TERMINAL_FALL + 1e-9, `vy ${p.vy} exceeds terminal`);
});

test('player: coyote time lets you jump just after walking off a ledge', () => {
  // Ledge at x<50; beyond it the ground drops away (groundY far below).
  const ledge = { groundY: GROUND };
  const air = { groundY: 100000 };
  const p = grounded(0);
  stepPlayer(p, { moveDir: 1 }, ledge); // still on ledge
  // Walk off: now over the gap.
  stepPlayer(p, { moveDir: 1 }, air);
  assert.ok(!p.onGround, 'left the ledge');
  assert.ok(p.coyote > 0, 'coyote grace started');
  // Jump within the coyote window.
  stepPlayer(p, { moveDir: 1, jumpPressed: true, jumpHeld: true }, air);
  assert.ok(p.vy < 0, 'coyote jump launched');
});

test('player: jump buffer fires a jump pressed just before landing', () => {
  const p = grounded();
  // Launch a jump.
  stepPlayer(p, { jumpPressed: true, jumpHeld: true }, world);
  // Fall back down; a few ticks before landing, press jump (buffered).
  let landed = false;
  for (let t = 0; t < 60 && !landed; t++) {
    const nearGround = p.y > GROUND - 8 && p.vy > 0;
    stepPlayer(p, { jumpPressed: nearGround, jumpHeld: nearGround }, world);
    if (p.onGround && p.vy === 0 && t > 2) landed = true;
  }
  // After landing with a buffered press, the next tick should re-launch.
  stepPlayer(p, { jumpHeld: true }, world);
  assert.ok(p.vy < 0, 'buffered jump re-launched on/after landing');
});

test('player: deterministic — identical inputs yield identical trajectory', () => {
  const seq = Array.from({ length: 30 }, (_, i) => ({ moveDir: 1, jumpPressed: i === 3, jumpHeld: i >= 3 && i < 12 }));
  const a = grounded(); const b = grounded();
  const ta = [], tb = [];
  for (const s of seq) { stepPlayer(a, s, world); ta.push([a.x, a.y, a.vy]); }
  for (const s of seq) { stepPlayer(b, s, world); tb.push([b.x, b.y, b.vy]); }
  assert.deepEqual(ta, tb);
});

test('player: item-granted air jump relaunches once while airborne', () => {
  const p = grounded();
  stepPlayer(p, { jumpPressed: true, jumpHeld: true, doubleJump: true }, world);
  stepPlayer(p, { jumpPressed: true, jumpHeld: true, doubleJump: true }, world);
  assert.equal(p.airJumped, true);
  assert.equal(p.airJumpUsed, true);
  assert.equal(p.vy, -FEEL.JUMP_VELOCITY + FEEL.GRAVITY);
});

test('player: airborne press without doubleJump ownership does not relaunch', () => {
  const p = grounded();
  stepPlayer(p, { jumpPressed: true, jumpHeld: true }, world);
  stepPlayer(p, { jumpPressed: true, jumpHeld: true }, world);
  assert.equal(p.airJumped, false);
  assert.equal(p.airJumpUsed, false);
  assert.equal(p.vy, -FEEL.JUMP_VELOCITY + 2 * FEEL.GRAVITY);
});

test('player: third jump press does not relaunch after air jump spent', () => {
  const p = grounded();
  stepPlayer(p, { jumpPressed: true, jumpHeld: true, doubleJump: true }, world);
  stepPlayer(p, { jumpPressed: true, jumpHeld: true, doubleJump: true }, world);
  assert.equal(p.airJumpUsed, true);
  stepPlayer(p, { jumpPressed: true, jumpHeld: true, doubleJump: true }, world);
  assert.equal(p.airJumped, false);
  assert.equal(p.airJumpUsed, true);
  assert.equal(p.vy, -FEEL.JUMP_VELOCITY + 2 * FEEL.GRAVITY);
});

test('player: landing clears airJumpUsed', () => {
  const p = grounded();
  stepPlayer(p, { jumpPressed: true, jumpHeld: true, doubleJump: true }, world);
  stepPlayer(p, { jumpPressed: true, jumpHeld: true, doubleJump: true }, world);
  assert.equal(p.airJumpUsed, true);
  for (let t = 0; t < 80 && !p.onGround; t++) {
    stepPlayer(p, { jumpHeld: true, doubleJump: true }, world);
  }
  assert.ok(p.onGround, 'must land');
  assert.equal(p.airJumpUsed, false);
});

test('player: air jump still responds to jump-cut', () => {
  const full = grounded();
  stepPlayer(full, { jumpPressed: true, jumpHeld: true, doubleJump: true }, world);
  stepPlayer(full, { jumpPressed: true, jumpHeld: true, doubleJump: true }, world);
  let fullApex = full.y;
  for (let t = 0; t < 40; t++) {
    stepPlayer(full, { jumpHeld: true, doubleJump: true }, world);
    fullApex = Math.min(fullApex, full.y);
  }

  const cut = grounded();
  stepPlayer(cut, { jumpPressed: true, jumpHeld: true, doubleJump: true }, world);
  stepPlayer(cut, { jumpPressed: true, jumpHeld: true, doubleJump: true }, world);
  let cutApex = cut.y;
  for (let t = 0; t < 40; t++) {
    stepPlayer(cut, { jumpHeld: t < 2, doubleJump: true }, world);
    cutApex = Math.min(cutApex, cut.y);
  }
  assert.ok((GROUND - cutApex) < 0.7 * (GROUND - fullApex), 'air-jump cut hop must be clearly lower');
});
