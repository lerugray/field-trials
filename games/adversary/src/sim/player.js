// player.js — player locomotion physics (DESIGN-SEED M2: movement/jump tuned to the feel notes).
// Pure, deterministic, fixed-timestep: one call = one sim tick (dt is 1 tick; velocities are
// px/tick, positions px). Collision here is a flat ground plane at groundY — real tile collision
// arrives with the stage work (M3). All constants come from the tested feel table so movement can
// never silently drift from docs/STUDY.md §4.

import { FEEL } from '../config/feel.js';
import { moveAndCollide } from './collision.js';

export const FACING = Object.freeze({ LEFT: -1, RIGHT: 1 });

/** Default player collision half-extents (16×24 body). */
export const PLAYER_HALF = Object.freeze({ halfW: 8, halfH: 12 });

/** Create a player physics state at (x, y) standing on the ground plane. */
export function createPlayer(x = 0, y = 0) {
  return {
    x,
    y,
    vx: 0,
    vy: 0,
    onGround: false,
    facing: FACING.RIGHT,
    coyote: 0,        // ticks of coyote grace remaining
    jumpBuffer: 0,    // ticks of buffered jump remaining
    jumping: false,   // currently in a jump ascent (for jump-cut)
    dodging: 0,       // ticks of dodge dash remaining (also the i-frame window)
    dodgeCooldown: 0, // ticks until dodge is available again
    dodgeDir: FACING.RIGHT,
    airJumpUsed: false, // item-granted midair jump spent until next ground landing
    airJumped: false,    // one-tick pulse: air jump launched this tick
  };
}

/** True while the player's dodge grants invulnerability (a short step, not roll-spam). */
export function playerInvulnerable(p) {
  return p.dodging > 0;
}

/**
 * Advance the player one tick.
 * @param {object} p - player state (mutated).
 * @param {object} intent - resolved movement intent for this tick:
 *   {moveDir:-1|0|1, jumpPressed:boolean, jumpHeld:boolean, dodge?:boolean, doubleJump?:boolean}
 *   doubleJump is the item grant (stage wires kit.doubleJump); without it, midair jump presses do not relaunch.
 * @param {object} world - either {groundY:number} (M2 flat-ground plane) OR
 *   {tilemap, body?:{halfW,halfH}} for real tile collision (M3+). p.y is the player's FEET.
 */
export function stepPlayer(p, intent, world) {
  const { moveDir = 0, jumpPressed = false, jumpHeld = false, dodge = false, doubleJump = false } = intent || {};
  p.airJumped = false;

  // --- dodge: a short i-framed dash (feel table); overrides walk while active ---
  // Decrement at the TOP so `dodging > 0` (the i-frame flag) stays true for every dash tick as
  // observed by the stage's contact check after this step returns.
  if (p.dodging > 0) {
    p.dodging--;
    if (p.dodging <= 0) p.dodgeCooldown = FEEL.DODGE_COOLDOWN_TICKS;
  }
  if (p.dodgeCooldown > 0) p.dodgeCooldown--;
  if (dodge && p.dodging <= 0 && p.dodgeCooldown <= 0) {
    p.dodging = FEEL.DODGE_DURATION_TICKS;
    p.dodgeDir = moveDir !== 0 ? Math.sign(moveDir) : p.facing;
  }

  // --- horizontal intent + facing ---
  if (p.dodging > 0) {
    p.vx = p.dodgeDir * (FEEL.DODGE_DISTANCE / FEEL.DODGE_DURATION_TICKS);
    p.facing = p.dodgeDir;
  } else {
    p.vx = moveDir * FEEL.WALK_SPEED;
    if (moveDir < 0) p.facing = FACING.LEFT;
    else if (moveDir > 0) p.facing = FACING.RIGHT;
  }

  // --- jump buffering (uses previous-tick onGround/coyote) ---
  if (jumpPressed) p.jumpBuffer = FEEL.JUMP_BUFFER_TICKS;
  else if (p.jumpBuffer > 0) p.jumpBuffer--;

  const canJump = p.onGround || p.coyote > 0;
  if (p.jumpBuffer > 0 && canJump) {
    p.vy = -FEEL.JUMP_VELOCITY;
    p.onGround = false;
    p.coyote = 0;
    p.jumpBuffer = 0;
    p.jumping = true;
  } else if (
    p.jumpBuffer > 0 &&
    doubleJump &&
    !p.onGround &&
    p.coyote <= 0 &&
    !p.airJumpUsed
  ) {
    // Item-granted midair jump: same launch fields as the base jump; ownership via intent.doubleJump.
    p.vy = -FEEL.JUMP_VELOCITY;
    p.jumpBuffer = 0;
    p.jumping = true;
    p.airJumpUsed = true;
    p.airJumped = true;
  }

  // --- jump-cut: releasing jump during ascent shortens the hop ---
  if (p.jumping && !jumpHeld && p.vy < 0) {
    p.vy *= 0.5;
    p.jumping = false;
  }
  if (p.vy >= 0) p.jumping = false;

  const wasOnGround = p.onGround;

  if (world?.tilemap) {
    // --- tile collision path (M3+) ---
    const body = world.body || PLAYER_HALF;
    const w = body.halfW * 2, h = body.halfH * 2;
    p.vy += FEEL.GRAVITY;                       // always-on gravity; the down-move re-grounds us
    if (p.vy > FEEL.TERMINAL_FALL) p.vy = FEEL.TERMINAL_FALL;
    const box = { x: p.x - body.halfW, y: p.y - h, w, h };
    const res = moveAndCollide(box, p.vx, p.vy, world.tilemap);
    p.x = box.x + body.halfW;
    p.y = box.y + h;
    if (res.hitCeiling && p.vy < 0) p.vy = 0;
    p.onGround = res.onGround;
    if (p.onGround) { p.vy = 0; p.jumping = false; p.airJumpUsed = false; }
  } else {
    // --- flat-ground plane path (M2 compatibility) ---
    const groundY = world?.groundY ?? 0;
    p.x += p.vx;
    if (!p.onGround) {
      p.vy += FEEL.GRAVITY;
      if (p.vy > FEEL.TERMINAL_FALL) p.vy = FEEL.TERMINAL_FALL;
    }
    p.y += p.vy;
    if (p.y >= groundY) {
      p.y = groundY;
      p.vy = 0;
      p.onGround = true;
      p.jumping = false;
      p.airJumpUsed = false;
    } else {
      p.onGround = false;
    }
  }

  // --- coyote timer: start counting the tick we leave the ground by walking off ---
  if (wasOnGround && !p.onGround && p.vy >= 0) {
    p.coyote = FEEL.COYOTE_TICKS;
  } else if (!p.onGround && p.coyote > 0) {
    p.coyote--;
  }

  return p;
}
