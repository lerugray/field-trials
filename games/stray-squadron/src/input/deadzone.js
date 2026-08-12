// Stick deadzone math — pure, headless-testable. Deadzone and invert-Y are the
// input constants DESIGN-SEED requires exposed from M1 (a full remap UI is not
// due until M9). Kept out of the browser gamepad module so the rescaling logic
// is covered by node --test.

export const DEFAULT_DEADZONE = 0.15;

// Radial deadzone on an analog stick pair: below the deadzone the stick reads as
// centered; past it, the magnitude is rescaled so it starts from 0 at the edge
// (no jump) and reaches 1 at full deflection. Direction is preserved.
export function applyDeadzone(x, y, dz = DEFAULT_DEADZONE) {
  const mag = Math.hypot(x, y);
  if (mag <= dz) return [0, 0];
  if (mag === 0) return [0, 0];
  const scaled = Math.min((mag - dz) / (1 - dz), 1);
  return [(x / mag) * scaled, (y / mag) * scaled];
}

// Single-axis deadzone (triggers, or axes treated independently). Sign-preserving.
export function deadzone1(v, dz = DEFAULT_DEADZONE) {
  const a = Math.abs(v);
  if (a <= dz) return 0;
  return Math.sign(v) * Math.min((a - dz) / (1 - dz), 1);
}

// Apply invert-Y as a toggle (accessibility / preference). Separate so callers
// opt in explicitly rather than baking a sign into the read.
export function maybeInvertY(y, invert) {
  return invert ? -y : y;
}
