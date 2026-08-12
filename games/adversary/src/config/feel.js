// feel.js — the NUMERIC FEEL TABLE (docs/STUDY.md §4), the tested contract.
//
// Every constant here is RE-DERIVED (the source revealed no movement/combat constants; see
// STUDY.md §3-§4). Changing a value without changing its assertion in test/feel.test.js is a
// defect. Units: one tick = 1/60 s (fixed timestep); positions in pixels; one tile = 16 px.

export const FEEL = Object.freeze({
  // --- 4.1 Locomotion ---
  TICK_HZ: 60,
  TILE: 16,
  WALK_SPEED: 1.5,          // px/tick (90 px/s)
  GRAVITY: 0.375,           // px/tick²
  JUMP_VELOCITY: 6.0,       // px/tick (initial upward speed)
  TERMINAL_FALL: 8.0,       // px/tick (fall-speed cap)
  COYOTE_TICKS: 6,
  JUMP_BUFFER_TICKS: 6,

  // --- 4.2 Combat & defense windows ---
  HITSTUN_IFRAME_TICKS: 30,
  KNOCKBACK_IMPULSE: 3.0,   // px/tick
  KNOCKBACK_DECAY: 0.80,    // multiplicative /tick
  DODGE_IFRAME_TICKS: 8,
  DODGE_DISTANCE: 24,       // px (1.5 tiles)
  DODGE_DURATION_TICKS: 8,
  DODGE_COOLDOWN_TICKS: 20,

  // --- 4.3 Input leniency windows ---
  DOUBLE_TAP_TICKS: 12,
  CHARGE_FULL_TICKS: 24,
  CHARGE_MIN_TICKS: 6,
  INPUT_REPEAT_DELAY_TICKS: 16,
  INPUT_REPEAT_RATE_TICKS: 6,
});

// Derived quantities — computed from the primitives above so the relationships in STUDY.md §4.1
// are single-sourced. test/feel.test.js asserts these equal the documented apex/time values.
export const DERIVED = Object.freeze({
  /** Seconds per tick. */
  TICK_DT: 1 / FEEL.TICK_HZ,
  /** Peak jump height on flat ground: v² / (2g). Documented = 48 px (3 tiles). */
  JUMP_APEX: (FEEL.JUMP_VELOCITY * FEEL.JUMP_VELOCITY) / (2 * FEEL.GRAVITY),
  /** Ticks from launch to apex: v / g. Documented = 16 ticks. */
  JUMP_TIME_TO_APEX: FEEL.JUMP_VELOCITY / FEEL.GRAVITY,
  /** Total airtime on flat ground: 2 × time-to-apex. Documented = 32 ticks. */
  JUMP_AIRTIME: (2 * FEEL.JUMP_VELOCITY) / FEEL.GRAVITY,
});
