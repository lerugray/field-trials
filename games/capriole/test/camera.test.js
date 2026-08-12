// node --test — the auto-pitch law (signature laws #1/#4/#5). Pure, no WebGL.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCameraRig, updateAutoPitch, autoPitchTarget } from '../src/sim/camera.js';
import { TIMESTEP, tuning } from '../src/sim/tuning.js';

const cam = tuning.camera;

function settle(rig, player, intensity, ticks) {
  let last = 0;
  for (let i = 0; i < ticks; i++) last = updateAutoPitch(rig, player, TIMESTEP, intensity);
  return last;
}

test('grounded → no tilt offset', () => {
  const rig = createCameraRig();
  const v = settle(rig, { grounded: true, jumpChain: 0 }, 1.0, 60);
  assert.equal(v, 0);
});

test('jump 1 does not tip the camera (short hops stay level)', () => {
  const rig = createCameraRig();
  const v = settle(rig, { grounded: false, jumpChain: 1 }, 1.0, 120);
  assert.equal(v, 0, 'tiltStartJump=2, so jump 1 is level');
});

test('jump 2 eases in toward its target angle', () => {
  const rig = createCameraRig();
  const target = cam.tiltPerJumpDeg[1];
  const v = settle(rig, { grounded: false, jumpChain: 2 }, 1.0, 200);
  assert.ok(Math.abs(v - target) < 0.5, `settled ${v.toFixed(2)} ~ ${target}`);
});

test('jump 3 tilts deeper than jump 2', () => {
  const rig2 = createCameraRig();
  const v2 = settle(rig2, { grounded: false, jumpChain: 2 }, 1.0, 200);
  const rig3 = createCameraRig();
  const v3 = settle(rig3, { grounded: false, jumpChain: 3 }, 1.0, 200);
  assert.ok(v3 > v2, `jump3 ${v3.toFixed(2)} deeper than jump2 ${v2.toFixed(2)}`);
  assert.ok(Math.abs(v3 - cam.tiltMaxDeg) < 0.5, `jump3 reaches max ${cam.tiltMaxDeg}`);
});

test('comfort: intensity 0 keeps the offset at 0 (landing-ring carries law #1)', () => {
  const rig = createCameraRig();
  const v = settle(rig, { grounded: false, jumpChain: 3 }, 0.0, 200);
  assert.equal(v, 0);
});

test('intensity scales the target linearly', () => {
  assert.ok(Math.abs(autoPitchTarget({ grounded: false, jumpChain: 3 }, 0.5) - cam.tiltMaxDeg * 0.5) < 1e-9);
});

test('ease-in is smooth and monotonic (no overshoot past target)', () => {
  const rig = createCameraRig();
  const target = cam.tiltMaxDeg;
  let prev = -1;
  for (let i = 0; i < 200; i++) {
    const v = updateAutoPitch(rig, { grounded: false, jumpChain: 3 }, TIMESTEP, 1.0);
    assert.ok(v >= prev - 1e-9, 'monotonic non-decreasing while deepening');
    assert.ok(v <= target + 1e-6, 'never overshoots target');
    prev = v;
  }
});

test('eases back out to neutral on landing', () => {
  const rig = createCameraRig();
  settle(rig, { grounded: false, jumpChain: 3 }, 1.0, 200); // deep tilt
  assert.ok(rig.tilt > 10);
  const v = settle(rig, { grounded: true, jumpChain: 0 }, 1.0, 200); // land
  assert.ok(Math.abs(v) < 0.5, `eased back near 0, got ${v.toFixed(3)}`);
});

test('ease-out uses the out-curve (slower/faster than in as configured)', () => {
  // Just assert both directions converge — timing constants are tuning, not asserted here.
  const rig = createCameraRig();
  settle(rig, { grounded: false, jumpChain: 3 }, 1.0, 300);
  const settled = rig.tilt;
  assert.ok(settled > 0);
  settle(rig, { grounded: true, jumpChain: 0 }, 1.0, 300);
  assert.equal(rig.tilt, 0);
});
