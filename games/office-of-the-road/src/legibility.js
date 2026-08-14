// legibility.js — MEASURED LEGIBILITY (DESIGN-SEED M2 gate). WCAG contrast maths
// + the asserted colour pairs + the non-colour-channel inventory + colour-vision-
// deficiency simulation matrices. Pure; the gate is test/legibility.test.js.

import { PALETTE } from './palette.js';

// relativeLuminance / contrast: WCAG 2.1 definitions.
function channel(v) { const c = v / 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
export function relativeLuminance(hex) {
  const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}
export function contrast(a, b) {
  const la = relativeLuminance(a), lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

// The pairs actually used in the UI, with their required minimum ratio. Body text
// (small) needs 4.5:1; interactive UI edges + meaningful bars need 3:1. Decorative
// container borders (PALETTE.rule) are exempt (WCAG 1.4.11) and not asserted.
export const CONTRAST_CHECKS = {
  body: [ // small text -> 4.5:1
    ['paper', 'ink'], ['dim', 'ink'], ['dim', 'panel'], ['dim', 'panel2'],
    ['faint', 'ink'], ['faint', 'panel'], ['ok', 'ink'], ['stamp', 'ink'],
    ['filed', 'ink'], ['focus', 'ink'],
    // Control-chip labels sit on their chip, not on the page.
    ['ink', 'control'], ['paper', 'control2'], ['focus', 'control2'],
  ],
  edge: [ // interactive borders + state-bearing bars -> 3:1
    ['edge', 'ink'], ['focus', 'ink'], ['hp', 'hpback'], ['hplow', 'hpback'], ['paper', 'ink'],
    // A primary chip's own fill IS its boundary against the page; a secondary
    // chip borrows the asserted `edge` keyline for the same job. A disabled
    // chip is exempt from WCAG 1.4.11, but its label still clears 3:1 so
    // "inert" never means "unreadable".
    ['control', 'ink'], ['controlOffInk', 'controlOff'],
  ],
};

export function runContrastChecks(P = PALETTE) {
  const fails = [];
  for (const [fg, bg] of CONTRAST_CHECKS.body) {
    const r = contrast(P[fg], P[bg]); if (r < 4.5) fails.push({ pair: `${fg}/${bg}`, ratio: r, need: 4.5 });
  }
  for (const [fg, bg] of CONTRAST_CHECKS.edge) {
    const r = contrast(P[fg], P[bg]); if (r < 3) fails.push({ pair: `${fg}/${bg}`, ratio: r, need: 3 });
  }
  return { ok: fails.length === 0, fails };
}

// Every state distinction carries a NON-COLOUR channel too (colour is never the
// sole carrier). This inventory is asserted for completeness by the gate test.
export const NONCOLOR_CHANNELS = {
  focus: 'an OUTLINE ring around the focused control (not colour-only)',
  status: 'bracketed word tokens — [ MARCHING ] / [ PAUSED ] / [ HELD ]',
  save: 'the word FILED ✓ with a checkmark glyph + the tick number',
  speedSelected: 'the active speed button is filled + bordered paper, not tint-only',
  hp: 'every HP bar ships its exact NUMERALS (e.g. 24/43) beside it',
  reduced: 'a downed frame is faded AND labelled "(reduced)"',
  combatDamage: 'floating signed NUMERALS (−12 / +8 / ward), not colour alone',
  terrain: 'route bands are LABELLED by name, not distinguished by fill alone',
};

// CVD simulation matrices (Machado, Oliveira & Fernandes 2009, severity 1.0),
// row-major 3×3 applied to linear-ish sRGB (good enough for a proof check).
export const CVD_MATRICES = {
  deuteranopia: [0.367, 0.861, -0.228, 0.280, 0.673, 0.047, -0.012, 0.043, 0.969],
  protanopia: [0.152, 1.053, -0.205, 0.115, 0.786, 0.099, -0.004, -0.048, 1.052],
  tritanopia: [1.256, -0.077, -0.179, -0.078, 0.931, 0.148, 0.005, 0.691, 0.304],
};

// simulateCVD: transform an {r,g,b} (0..255) through a CVD matrix. Used by the
// in-build ?cvd= proof filter and any offline check.
export function simulateCVD(type, r, g, b) {
  const m = CVD_MATRICES[type]; if (!m) return [r, g, b];
  const clamp = (v) => v < 0 ? 0 : v > 255 ? 255 : v;
  return [
    clamp(m[0] * r + m[1] * g + m[2] * b),
    clamp(m[3] * r + m[4] * g + m[5] * b),
    clamp(m[6] * r + m[7] * g + m[8] * b),
  ];
}
