// player.js — the player kinematics: camera-relative ground/air movement and the
// triple-jump state machine (signature law #1). Pure sim: no WebGL, no wall clock.
// Deterministic under a fixed dt. The renderer reads this state; it never writes it.
//
// Jump model: each jump press sets vertical velocity to the impulse that, pressed
// at the previous jump's apex, reaches the next CUMULATIVE apex height
// (heightMul[n] × baseHeight above takeoff) — so chaining at apex yields the
// geometric 1.0 / 1.5 / 2.2 escalation (law), while a mistimed press still gives a
// consistent, predictable pop. A readability "hang" softens gravity near the apex.

import { GRAVITY, tuning } from './tuning.js';

// Per-jump upward impulse velocities, derived from the cumulative apex targets and
// gravity. gain[n] = (heightMul[n] - heightMul[n-1]) * H ; v = sqrt(2·|g|·gain).
export function jumpImpulses(g = GRAVITY, jt = tuning.jump) {
  const H = jt.baseHeight;
  const out = [];
  for (let n = 0; n < jt.count; n++) {
    const prev = n === 0 ? 0 : jt.heightMul[n - 1];
    const gain = (jt.heightMul[n] - prev) * H;
    out.push(Math.sqrt(2 * Math.abs(g) * gain));
  }
  return out;
}

export function createPlayer(spawn = { x: 0, y: 0, z: 0 }) {
  return {
    pos: { x: spawn.x, y: spawn.y, z: spawn.z },
    vel: { x: 0, y: 0, z: 0 },
    yaw: 0,             // facing (radians); 0 = looking toward -Z
    grounded: true,
    jumpsUsed: 0,       // jumps consumed since last grounding (0..count)
    jumpChain: 0,       // current jump index for the HUD chain indicator (0 = on ground)
    coyote: 0,          // seconds of coyote time remaining (first-jump grace)
    jumpBuffer: 0,      // seconds a buffered jump press remains valid
    prevJumpHeld: false,
    landedThisTick: false,
    jumpedThisTick: false,
  };
}

// Camera-relative movement basis from a yaw. forward = -Z at yaw 0.
export function moveBasis(yaw) {
  const s = Math.sin(yaw), c = Math.cos(yaw);
  return {
    forward: { x: -s, z: -c },
    right: { x: c, z: -s },
  };
}

// Advance the player one fixed step. `input` = { f, s, jump, yaw } where f/s are
// forward/strafe intent in [-1,1], jump is the button HELD state, yaw is facing.
// `ground` is a ground adapter with sampleBelow(x,z,prevY,newY,vy) → {y,x,z}|null
// (see islands.js: flatGround / archipelagoGround). A legacy { groundY, solidBelow }
// object is also accepted for the M0 tick.
export function updatePlayer(p, input, dt, ground = { groundY: 0, solidBelow: true }, g = GRAVITY, T = tuning) {
  const jt = T.jump, mv = T.move;
  p.landedThisTick = false;
  p.jumpedThisTick = false;

  if (typeof input.yaw === 'number') p.yaw = input.yaw;

  // ---- Jump press edge → buffer.
  const held = !!input.jump;
  const pressed = held && !p.prevJumpHeld;
  p.prevJumpHeld = held;
  if (pressed) p.jumpBuffer = jt.bufferMs / 1000;

  // ---- Horizontal movement (camera-relative), accel toward desired velocity.
  const basis = moveBasis(p.yaw);
  const f = clamp(input.f || 0, -1, 1);
  const s = clamp(input.s || 0, -1, 1);
  const maxSpeed = p.grounded ? mv.maxGroundSpeed : mv.maxAirSpeed;
  let dvx = (basis.forward.x * f + basis.right.x * s);
  let dvz = (basis.forward.z * f + basis.right.z * s);
  const mag = Math.hypot(dvx, dvz);
  const hasInput = mag > 1e-4;
  if (hasInput) { dvx /= mag; dvz /= mag; } // normalize so diagonals aren't faster
  const desiredX = dvx * maxSpeed;
  const desiredZ = dvz * maxSpeed;

  const accel = (p.grounded ? mv.groundAccel : mv.groundAccel * mv.airAccelFrac);
      if (hasInput) {
        p.vel.x = approach(p.vel.x, desiredX, accel * dt);
        p.vel.z = approach(p.vel.z, desiredZ, accel * dt);
      } else {
        // Ground friction when idle.
        const damping = p.grounded ? mv.groundFriction : mv.airDamping;
        p.vel.x = approach(p.vel.x, 0, damping * dt);
        p.vel.z = approach(p.vel.z, 0, damping * dt);
      }
  // Clamp horizontal speed to the cap for the current state.
  const hs = Math.hypot(p.vel.x, p.vel.z);
  if (hs > maxSpeed) { p.vel.x = (p.vel.x / hs) * maxSpeed; p.vel.z = (p.vel.z / hs) * maxSpeed; }

  // ---- Jump execution.
  const impulses = jumpImpulses(g, jt);
  if (p.jumpBuffer > 0) {
    const n = p.jumpsUsed; // 0-based index of the jump we'd perform
    const firstJumpOk = n === 0 && (p.grounded || p.coyote > 0);
    const airJumpOk = n > 0 && n < jt.count && !p.grounded;
    if (firstJumpOk || airJumpOk) {
      p.vel.y = impulses[n];
      p.jumpsUsed = n + 1;
      p.jumpChain = p.jumpsUsed;
      p.grounded = false;
      p.coyote = 0;
      p.jumpBuffer = 0;
      p.jumpedThisTick = true;
    }
  }

  // ---- Gravity with the readability hang near apex.
  const gscale = Math.abs(p.vel.y) < jt.hangVelThreshold ? jt.hangGravityScale : 1;
  p.vel.y += g * gscale * dt;
  if (p.vel.y < -mv.maxFallSpeed) p.vel.y = -mv.maxFallSpeed; // terminal fall (bounds displacement)

  // ---- Integrate.
  const prevY = p.pos.y;
  p.pos.x += p.vel.x * dt;
  p.pos.y += p.vel.y * dt;
  p.pos.z += p.vel.z * dt;

  // ---- Ground/surface resolution. Swept landing via the ground adapter.
  const wasGrounded = p.grounded;
  // A grounded step must use the platform's real rim. The edge-snap allowance is
  // reserved for airborne near-miss landings; applying it here turns it into an
  // invisible ledge guard that makes walking off impossible.
  const landing = sampleGround(ground, p.pos.x, p.pos.z, prevY, p.pos.y, p.vel.y, !wasGrounded);
  if (landing) {
    p.pos.y = landing.y;
    if (typeof landing.x === 'number') p.pos.x = landing.x; // edge-snap clamp
    if (typeof landing.z === 'number') p.pos.z = landing.z;
    p.vel.y = 0;
    if (!wasGrounded) p.landedThisTick = true;
    p.grounded = true;
    p.jumpsUsed = 0;
    p.jumpChain = 0;
    p.coyote = jt.coyoteMs / 1000;
  } else {
    if (wasGrounded && !p.jumpedThisTick) {
      // Walked off a ledge — start coyote grace for the first jump.
      p.coyote = jt.coyoteMs / 1000;
    }
    p.grounded = false;
  }

  // ---- Timers.
  if (!p.grounded && p.coyote > 0) p.coyote = Math.max(0, p.coyote - dt);
  if (p.jumpBuffer > 0) p.jumpBuffer = Math.max(0, p.jumpBuffer - dt);

  return p;
}

// Resolve a landing against either a ground adapter (sampleBelow) or the legacy
// flat { groundY, solidBelow } object.
function sampleGround(ground, x, z, prevY, newY, vy, allowEdgeSnap = true) {
  if (ground && typeof ground.sampleBelow === 'function') {
    return ground.sampleBelow(x, z, prevY, newY, vy, allowEdgeSnap);
  }
  // Legacy flat plane.
  if (ground && ground.solidBelow && vy <= 0 && prevY >= ground.groundY - 1e-6 && newY <= ground.groundY + 1e-6) {
    return { y: ground.groundY };
  }
  return null;
}

function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
function approach(cur, target, maxDelta) {
  const d = target - cur;
  if (Math.abs(d) <= maxDelta) return target;
  return cur + Math.sign(d) * maxDelta;
}
