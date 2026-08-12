// loop.js — fixed-timestep sim loop (DESIGN-SEED "STACK": deterministic seeded sim core,
// testable headless). The sim advances in whole fixed ticks decoupled from render frames, so a
// given (seed, input sequence) replays identically regardless of frame pacing.

import { FEEL, DERIVED } from '../config/feel.js';

/**
 * Create a fixed-timestep stepper.
 * @param {object} [opts]
 * @param {number} [opts.hz=FEEL.TICK_HZ] - sim ticks per second.
 * @param {number} [opts.maxStepsPerAdvance=8] - spiral-of-death clamp: never run more than this
 *   many sim ticks for a single advance() call, dropping excess accumulated time.
 */
export function createFixedStepper({ hz = FEEL.TICK_HZ, maxStepsPerAdvance = 8 } = {}) {
  const dt = 1 / hz;
  let accumulator = 0;
  let tick = 0;

  return {
    dt,
    get tick() {
      return tick;
    },
    /**
     * Feed elapsed real seconds; runs whole sim ticks via stepFn(dt, tickIndex).
     * @returns {{steps:number, alpha:number, dropped:boolean}} steps run this call, render
     *   interpolation alpha in [0,1), and whether time was dropped by the clamp.
     */
    advance(elapsedSeconds, stepFn) {
      if (!(elapsedSeconds > 0)) elapsedSeconds = 0;
      accumulator += elapsedSeconds;
      let steps = 0;
      let dropped = false;
      while (accumulator >= dt) {
        if (steps >= maxStepsPerAdvance) {
          // Prevent the spiral of death: discard the backlog rather than run unbounded ticks.
          accumulator = 0;
          dropped = true;
          break;
        }
        stepFn(dt, tick);
        tick++;
        accumulator -= dt;
        steps++;
      }
      const alpha = accumulator / dt;
      return { steps, alpha, dropped };
    },
    /** Reset to a clean deterministic state (tick 0, empty accumulator). */
    reset() {
      accumulator = 0;
      tick = 0;
    },
  };
}

/** Convenience: seconds → whole ticks at the sim rate (floor). */
export function secondsToTicks(seconds, hz = FEEL.TICK_HZ) {
  return Math.floor(seconds * hz);
}

/** Convenience: ticks → seconds at the sim rate. */
export function ticksToSeconds(ticks, hz = FEEL.TICK_HZ) {
  return ticks / hz;
}

export { DERIVED };
