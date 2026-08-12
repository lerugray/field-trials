// A steer axis that HOLDS the position it was flown to when the keys let go, instead
// of commanding the ship back to the middle of the frame.
//
// Why this exists (operator report, 2026-08-07: "with keyboard controls the plane
// snaps back to the middle during play, that doesn't happen in starfox and isn't a
// problem on the mouse"). flight.js reads steerX/steerY as a POSITION command: the
// ship eases toward steer * steerRange every frame. The keyboard's contribution drops
// to exactly 0 the instant a key comes up, so the ship slides home on its own. The
// mouse never shows the defect for a mundane reason — mouseSteer() is an ABSOLUTE
// pointer read, so it only reads neutral if the player physically walks the cursor
// back to the middle of the screen, which nobody does. The genre convention is the
// mouse's: letting go stops the ship, it does not recenter it.
//
// The fix keeps the held-key feel byte-for-byte identical to before and only changes
// what happens on RELEASE:
//   * while a key is down  -> the raw command passes straight through, so the ship
//     accelerates exactly as it always has (no added lag, no ramp-in, and pressing the
//     opposite direction still flips instantly).
//   * on release           -> the axis reports the position the ship actually reached
//     and freezes there, so the flight's easing target equals where the ship already
//     is and it simply stops.
// `pos` mirrors the ship's own normalized offset by easing toward the raw command with
// flight.js's own steerEase (imported, never re-typed, so the two cannot drift apart).
//
// Pure logic, variable-dt safe, headless-testable: no DOM, no listeners, just the math.

import { FLIGHT } from '../flight/flight.js';

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

export function createHoldAxis(ease = FLIGHT.steerEase) {
  let pos = 0; // the ship's normalized offset on this axis, [-1..1]
  return {
    // raw: this frame's key command (-1, 0, or +1). dt: seconds since last frame.
    read(raw, dt) {
      const r = clamp(raw || 0, -1, 1);
      if (r !== 0) {
        const k = 1 - Math.exp(-ease * clamp(dt || 0, 0, 0.1));
        pos += (r - pos) * k;
        return r; // fully responsive while held — unchanged from before
      }
      return pos; // released: hold the position, do not command a return to center
    },
    value: () => pos,
    reset() { pos = 0; },
  };
}
