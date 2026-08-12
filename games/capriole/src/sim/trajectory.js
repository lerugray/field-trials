// trajectory.js — predict where the player will land if they stop steering. Used
// by the landing-ring marker (law #2): when the blob shadow has no surface right
// below (over the void), the ring projects onto the PREDICTED landing surface, and
// a screen-edge arrow points to it when off-view. Pure sim (no WebGL), so it is
// unit-tested and matches the real vertical integration (gravity + apex hang +
// terminal fall) used by player.js.

import { GRAVITY, TIMESTEP, tuning } from './tuning.js';

// Forward-integrate a ballistic path (current horizontal velocity held, no input,
// no further jumps) until it crosses a landable surface, or give up. Returns the
// predicted landing { x, y, z, ticks } or null (falls into the void).
export function predictLanding(ground, pos, vel, opts = {}) {
  const dt = opts.dt ?? TIMESTEP;
  const maxTicks = opts.maxTicks ?? 600;
  const jt = tuning.jump, mv = tuning.move;
  let x = pos.x, y = pos.y, z = pos.z;
  let vx = vel.x, vy = vel.y, vz = vel.z;

  for (let i = 0; i < maxTicks; i++) {
    const prevY = y;
    // Gravity with the same apex hang + terminal cap as the live sim.
    const gscale = Math.abs(vy) < jt.hangVelThreshold ? jt.hangGravityScale : 1;
    vy += GRAVITY * gscale * dt;
    if (vy < -mv.maxFallSpeed) vy = -mv.maxFallSpeed;
    x += vx * dt; y += vy * dt; z += vz * dt;
    const landing = ground.sampleBelow(x, z, prevY, y, vy);
    if (landing) {
      return { x: landing.x ?? x, y: landing.y, z: landing.z ?? z, ticks: i + 1 };
    }
    // Bail once we're far below the reachable world.
    if (typeof ground.lowestTop === 'function' && y < ground.lowestTop() - tuning.fall.killPlaneMargin - 5) break;
  }
  return null;
}
