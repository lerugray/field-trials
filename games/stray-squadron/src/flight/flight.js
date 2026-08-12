// On-rails flight state + update. The ship rides the rail (rail.js) at a speed
// the brake/boost meter modulates, and the player steers it within a screen-space
// frame with banking roll/pitch — the SF64 tempo layer folded onto the fixed
// route (STUDY.md §5). Pure logic, variable-dt safe, headless-testable. Input is
// pre-processed (deadzone + invert-Y already applied upstream).

export const FLIGHT = {
  baseSpeed: 15,     // rail units/sec at neutral throttle
  boostSpeed: 26,    // holding boost
  brakeSpeed: 8,     // holding brake
  speedEase: 4.0,    // exponential approach rate for speed changes
  steerRangeX: 3.4,  // screen-space half-width the ship can slide to
  steerRangeY: 2.1,  // screen-space half-height
  steerEase: 9.0,    // how fast offset + tilt follow input
  maxRoll: 0.62,     // radians of bank at full lateral steer
  maxPitch: 0.34,    // radians of pitch at full vertical steer
  boostDrain: 0.55,  // meter/sec while boosting
  brakeDrain: 0.30,  // meter/sec while braking
  meterRegen: 0.35,  // meter/sec recharge when neither
};

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

export function createFlightState() {
  return {
    s: 0,               // distance along the rail
    speed: FLIGHT.baseSpeed,
    offX: 0, offY: 0,   // screen-space ship offset from rail center
    roll: 0, pitch: 0,  // banking tilt (radians)
    meter: 1,           // brake/boost meter, [0,1]
    mode: 'cruise',     // 'cruise' | 'boost' | 'brake' (last frame's throttle)
  };
}

// input: { steerX: -1..1, steerY: -1..1, boost: bool, brake: bool }
export function updateFlight(state, input, dt) {
  dt = clamp(dt || 0, 0, 0.1); // never trust a monster frame gap
  const steerX = clamp(input.steerX || 0, -1, 1);
  const steerY = clamp(input.steerY || 0, -1, 1);

  // --- throttle: boost/brake spend the shared meter; else it recharges --------
  let targetSpeed = FLIGHT.baseSpeed;
  let mode = 'cruise';
  if (input.boost && state.meter > 0) {
    targetSpeed = FLIGHT.boostSpeed;
    state.meter = Math.max(0, state.meter - FLIGHT.boostDrain * dt);
    mode = 'boost';
  } else if (input.brake && state.meter > 0) {
    targetSpeed = FLIGHT.brakeSpeed;
    state.meter = Math.max(0, state.meter - FLIGHT.brakeDrain * dt);
    mode = 'brake';
  } else {
    // Boost Cells (M6 upgrade) speed the recharge via an optional regen multiplier.
    const regenMul = input.regenMul > 0 ? input.regenMul : 1;
    state.meter = Math.min(1, state.meter + FLIGHT.meterRegen * regenMul * dt);
  }
  state.mode = mode;

  // Exponential easing is dt-stable: 1 - e^(-k dt) is the exact discrete factor,
  // so many small steps and one big step converge to the same target (no blow-up).
  const kS = 1 - Math.exp(-FLIGHT.speedEase * dt);
  state.speed += (targetSpeed - state.speed) * kS;
  state.s += state.speed * dt;

  // --- steering: offset + banking tilt, eased toward the input target ---------
  const kM = 1 - Math.exp(-FLIGHT.steerEase * dt);
  const tOffX = steerX * FLIGHT.steerRangeX;
  const tOffY = -steerY * FLIGHT.steerRangeY; // +steerY (stick down) lowers ship
  state.offX += (tOffX - state.offX) * kM;
  state.offY += (tOffY - state.offY) * kM;
  state.offX = clamp(state.offX, -FLIGHT.steerRangeX, FLIGHT.steerRangeX);
  state.offY = clamp(state.offY, -FLIGHT.steerRangeY, FLIGHT.steerRangeY);

  const tRoll = -steerX * FLIGHT.maxRoll; // bank into the turn
  const tPitch = steerY * FLIGHT.maxPitch;
  state.roll += (tRoll - state.roll) * kM;
  state.pitch += (tPitch - state.pitch) * kM;

  return state;
}
