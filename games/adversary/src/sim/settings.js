// settings.js — the assist toggle + run settings (DESIGN-SEED M8 + accessibility folds). Assist is
// HONEST: it has an input-assist axis (longer i-frames + leniency) and a XP-safety axis (XP never
// drops on death), and it NEVER changes drop rates. The visual-clarity axis (flash/shake caps,
// reduce-effects) is a render setting handled in M9. Assist is surfaced in the pause menu AND the
// death prompt (wired by the boot layer).

export const ASSIST_IFRAME_MULT = 1.6;   // longer hit-stun invulnerability
export const ASSIST_LENIENCY_MULT = 1.5; // longer input leniency windows (charge/double-tap)

export function createSettings(o = {}) {
  return {
    assist: !!o.assist,          // master honest-assist toggle
    xpSafe: o.xpSafe ?? !!o.assist,        // XP never drops on death
    inputAssist: o.inputAssist ?? !!o.assist, // longer i-frames + leniency
    reduceEffects: !!o.reduceEffects,      // visual-clarity axis: caps flashes/strobes in the renderer
    chargeToggle: !!o.chargeToggle,        // accessibility: charge on tap-to-start / tap-to-release
    muted: !!o.muted,
  };
}

/** Effective hit-stun i-frame ticks given settings. */
export function iframeTicks(baseTicks, settings) {
  return Math.round(baseTicks * (settings && settings.inputAssist ? ASSIST_IFRAME_MULT : 1));
}

/** Set the master assist toggle and its coupled axes together. */
export function setAssist(settings, on) {
  settings.assist = !!on;
  settings.xpSafe = !!on;
  settings.inputAssist = !!on;
  return settings;
}
