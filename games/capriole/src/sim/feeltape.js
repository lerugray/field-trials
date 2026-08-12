// feeltape.js — the golden FEEL TELEMETRY TAPE (verification fold: "M1 exports a
// golden telemetry tape — apex heights, hang times, tilt curve; every later
// milestone asserts the tape within tolerance"). Pure, deterministic (no WebGL):
// runs a scripted triple-jump through the REAL sim + auto-pitch and records the
// feel fingerprint. `scripts/gen-feel-tape.js` writes the golden; `test/feel.test`
// re-generates and asserts a match within tolerance, catching any accidental
// change to the signature feel across future milestones.

import { createPlayer, updatePlayer } from './player.js';
import { createCameraRig, updateAutoPitch } from './camera.js';
import { flatGround } from './islands.js';
import { TIMESTEP, tuning } from './tuning.js';

const r3 = (x) => Math.round(x * 1000) / 1000;

// Run the scripted triple-jump (first jump from ground, each next at apex) over
// flat ground, sampling the auto-pitch tilt curve. Returns the feel fingerprint.
export function generateFeelTape() {
  const ground = flatGround(0);
  const p = createPlayer({ x: 0, y: 0, z: 0 });
  p.grounded = true;
  const rig = createCameraRig();
  const jt = tuning.jump;

  const apex = [0, 0, 0];
  const tiltCurve = [];       // rig.tilt sampled every SAMPLE ticks
  const hangTicks = [0, 0, 0]; // ticks spent in the apex-hang window per jump
  let airTicks = 0;
  let held = false;
  const SAMPLE = 3;

  for (let i = 0; i < 240; i++) {
    let jump = false;
    if (!held) {
      if (p.jumpsUsed === 0 && p.grounded) jump = true;
      else if (p.jumpsUsed > 0 && p.jumpsUsed < jt.count && !p.grounded && p.vel.y <= 0) jump = true;
    }
    updatePlayer(p, { jump, f: 0, s: 0, yaw: 0 }, TIMESTEP, ground);
    held = jump;
    updateAutoPitch(rig, p, TIMESTEP, 1.0);

    const idx = Math.min(p.jumpsUsed, jt.count) - 1;
    if (idx >= 0) {
      apex[idx] = Math.max(apex[idx], p.pos.y);
      if (Math.abs(p.vel.y) < jt.hangVelThreshold) hangTicks[idx]++;
    }
    if (!p.grounded) airTicks++;
    if (i % SAMPLE === 0) tiltCurve.push(r3(rig.tilt));

    if (p.jumpsUsed >= jt.count && p.grounded && i > 60) break;
  }

  return {
    version: 1,
    baseHeight: jt.baseHeight,
    apex: apex.map(r3),
    apexRatios: [r3(apex[1] / apex[0]), r3(apex[2] / apex[0])],
    hangTicks,
    airTicks,
    maxTilt: r3(Math.max(...tiltCurve)),
    tiltCurve,
  };
}
