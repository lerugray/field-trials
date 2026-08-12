// The on-rails camera path. The camera flies a fixed forward course; the player
// steers the ship in screen space but never chooses the route through a level
// (STUDY.md §4.2). The rail is analytic and parameterized by arc-ish distance s
// (units, roughly meters) so speed * dt advances it directly. For M2 it is a
// gentle winding course down -Z; sector-authored rails come later.
//
// Pure math, headless-testable. Returns an orthonormal frame {pos, forward,
// right, up} at any s so the camera and the ship's banking share one basis.

import { normalize, cross } from '../math/vec3.js';

// Lateral/vertical sway amplitudes and frequencies of the default rail.
const AMP_X = 6.0, FREQ_X = 0.05;
const AMP_Y = 2.6, FREQ_Y = 0.037, PHASE_Y = 1.3;

export function railPos(s) {
  return [
    AMP_X * Math.sin(s * FREQ_X),
    AMP_Y * Math.sin(s * FREQ_Y + PHASE_Y),
    -s,
  ];
}

// Orthonormal frame at s. forward is the normalized path tangent; right/up are
// derived with world-up as the reference (the rail never rolls on its own).
export function railFrame(s) {
  const pos = railPos(s);
  const dx = AMP_X * FREQ_X * Math.cos(s * FREQ_X);
  const dy = AMP_Y * FREQ_Y * Math.cos(s * FREQ_Y + PHASE_Y);
  const dz = -1;
  const forward = normalize([dx, dy, dz]);
  const worldUp = [0, 1, 0];
  const right = normalize(cross(forward, worldUp));
  const up = cross(right, forward); // already unit: right ⟂ forward, both unit
  return { pos, forward, right, up };
}
