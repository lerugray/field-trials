// look.js — the look aim as a PURE, unit-tested function (pointer-lock-reality
// fold: "look(dx,dy) is a pure unit-tested function"). Consumes raw pointer/key
// deltas, applies sensitivity + invert-Y, updates yaw and CLAMPED pitch. No WebGL,
// no globals. The renderer feeds it deltas; the sim reads yaw for movement basis;
// the camera reads pitch (plus the separate auto-pitch offset).

import { tuning } from './tuning.js';

export function createLook(yaw = 0, pitch = 0) {
  return { yaw, pitch };
}

// Apply a look delta (dx,dy in "pixels" for mouse; arbitrary units for keys via
// keyLookRate*dt precomputed by the caller). Right/up-positive screen deltas.
// - dx>0 (mouse right) turns the view right → yaw decreases.
// - dy>0 (mouse down)  looks down → pitch decreases (unless invertY).
// Pitch is clamped to ±pitchClampDeg. Returns the same state (mutated) for chaining.
export function applyLook(state, dx, dy, opts = {}) {
  const sens = opts.sensitivity ?? tuning.camera.sensitivity;
  const rate = (opts.rate ?? tuning.camera.lookRate) * sens;
  const invert = opts.invertY ?? tuning.camera.invertY;

  state.yaw -= dx * rate;
  state.pitch += (invert ? dy : -dy) * rate;

  // Keep yaw in (-PI, PI] for tidiness (not strictly required — deterministic mod).
  const TAU = Math.PI * 2;
  state.yaw = ((state.yaw + Math.PI) % TAU + TAU) % TAU - Math.PI;

  const clamp = (opts.pitchClampDeg ?? tuning.camera.pitchClampDeg) * Math.PI / 180;
  if (state.pitch > clamp) state.pitch = clamp;
  if (state.pitch < -clamp) state.pitch = -clamp;
  return state;
}

export default { createLook, applyLook };
