// Barrel roll + deflection — the SF64 defensive move (DESIGN-SEED SF64 QoL). A
// double-tap (or a shoulder button) spins the ship 360 degrees about its forward
// axis; during the early part of the spin it DEFLECTS incoming enemy bolts. Pure +
// headless-testable: the state machine here owns timing and the deflect window;
// main.js owns the visible spin and the HUD cue.
//
// Accessibility law (hard rule 8): the deflect state gets a readable cue that is
// NOT motion-only — a HUD shield ring + label plays whether or not reduced motion
// is on, and under reduced motion the ship's visible spin is damped to a wobble
// while the deflect window (the gameplay) is byte-for-byte identical.

export const ROLL = {
  duration: 0.5,       // seconds for the full spin
  deflectWindow: 0.42, // seconds from start during which bolts are deflected
  cooldown: 0.18,      // seconds after a roll before another can start
  spins: 1,            // full turns per roll
};

const clampDt = (dt) => (dt > 0.1 ? 0.1 : dt < 0 ? 0 : dt);

export function createRollState() {
  return { active: false, t: 0, dir: 0, cooldown: 0, deflected: 0 };
}

// Begin a roll in dir (-1 left, +1 right). Ignored mid-roll or during cooldown.
// Returns true if a roll actually started.
export function triggerRoll(state, dir) {
  if (state.active || state.cooldown > 0) return false;
  state.active = true;
  state.t = 0;
  state.dir = dir < 0 ? -1 : 1;
  return true;
}

export function updateRoll(state, dt) {
  dt = clampDt(dt);
  if (state.cooldown > 0) state.cooldown = Math.max(0, state.cooldown - dt);
  if (state.active) {
    state.t += dt;
    if (state.t >= ROLL.duration) {
      state.active = false;
      state.t = 0;
      state.cooldown = ROLL.cooldown;
    }
  }
  return state;
}

// The current spin angle (radians) for the ship model. visualScale damps it under
// reduced motion (the deflect window is unaffected).
export function rollAngle(state, visualScale = 1) {
  if (!state.active) return 0;
  const frac = state.t / ROLL.duration;
  return state.dir * frac * Math.PI * 2 * ROLL.spins * visualScale;
}

// Are enemy bolts being deflected right now?
export function isDeflecting(state) {
  return state.active && state.t <= ROLL.deflectWindow;
}
