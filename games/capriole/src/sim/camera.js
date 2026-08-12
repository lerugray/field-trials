// camera.js — the auto-pitch law (signature laws #1/#4/#5), as PURE deterministic
// logic (no WebGL) so it is unit-tested and part of the golden feel-tape. This
// computes a downward pitch OFFSET (degrees) that:
//   - stays 0 on the ground and during jump 1 (anti-nausea: short hops never tip),
//   - eases IN toward a per-jump target on the 2nd/3rd jump so the landing is
//     visible near apex, eased with tiltInSec,
//   - eases OUT back to neutral on landing/descent, eased with tiltOutSec,
//   - scales by the comfort tilt-intensity slider (0..1); at 0 the offset is 0 and
//     the landing-ring marker carries law #1 instead.
// The renderer ADDS this offset onto the player's own aim pitch — player look
// input always wins (the base aim responds instantly; only the offset blends).
//
// Math.exp is the only transcendental here: deterministic, documented (fold).

import { tuning } from './tuning.js';

export function createCameraRig() {
  return { tilt: 0 }; // current downward-pitch offset in degrees
}

// Target downward tilt for the player's current state.
export function autoPitchTarget(player, intensity, T = tuning) {
  if (player.grounded) return 0;
  const chain = player.jumpChain | 0;
  if (chain < T.camera.tiltStartJump) return 0; // jump 1 (or none) stays level
  const idx = Math.min(chain, T.jump.count) - 1;
  const deg = T.camera.tiltPerJumpDeg[idx] || 0;
  return deg * clamp01(intensity);
}

// Advance the eased offset one step; returns the new offset (degrees, downward).
// Eases IN with tiltInSec when deepening, OUT with tiltOutSec when returning.
export function updateAutoPitch(rig, player, dt, intensity = T_DEFAULT_INTENSITY, T = tuning) {
  const target = autoPitchTarget(player, intensity, T);
  const deepening = target > rig.tilt;
  const tau = Math.max(deepening ? T.camera.tiltInSec : T.camera.tiltOutSec, 1e-4);
  // Exponential smoothing — frame-rate independent, never overshoots the target.
  const k = 1 - Math.exp(-dt / tau);
  rig.tilt += (target - rig.tilt) * k;
  if (Math.abs(rig.tilt) < 1e-4) rig.tilt = 0;
  return rig.tilt;
}

const T_DEFAULT_INTENSITY = tuning.camera.tiltIntensityDefault;

function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
