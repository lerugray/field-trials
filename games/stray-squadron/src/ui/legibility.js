// The legibility floor (DESIGN-SEED M9): "HUD text clears a stated min-size/contrast
// floor, audited as a test." This module STATES that floor as data + pure helpers so
// test/legibility.test.js can hold the HUD to it: WCAG contrast, a min text size, a
// no-color-only manifest of every stateful cue, and the hard flash-intensity cap.
//
// The HUD's contrast technique is "light ink over a dark drop shadow": every readout
// is painted once in SHADOW (near-black) then again in its color on top, so the
// effective backing under text is dark regardless of the 3D scene behind it. The
// floor therefore checks each ink color against black (the conservative backing the
// shadow guarantees). Pure — no browser, no canvas.

// ---- The stated floor ----
export const MIN_TEXT_PX = 11;      // no HUD glyph smaller than this (CSS px)
export const MIN_CONTRAST = 4.5;    // WCAG AA for normal text
export const MIN_CONTRAST_LARGE = 3.0; // WCAG AA for large/bold >= 18px
export const LARGE_TEXT_PX = 18;
export const FLASH_CAP = 0.34;      // MAX screen-flash alpha, ever (accessibility law)
export const HURT_FLASH_MAX = 0.30; // player-hit vignette peak (<= FLASH_CAP)

// ---- WCAG 2.1 relative luminance + contrast ----
function parseColor(c) {
  if (typeof c !== 'string') return null;
  let m = c.match(/^#([0-9a-f]{6})$/i);
  if (m) {
    const n = parseInt(m[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1];
  }
  m = c.match(/^#([0-9a-f]{3})$/i);
  if (m) {
    const h = m[1];
    return [parseInt(h[0] + h[0], 16), parseInt(h[1] + h[1], 16), parseInt(h[2] + h[2], 16), 1];
  }
  m = c.match(/^rgba?\(([^)]+)\)$/i);
  if (m) {
    const p = m[1].split(',').map((s) => parseFloat(s.trim()));
    return [p[0], p[1], p[2], p[3] == null ? 1 : p[3]];
  }
  return null;
}

const srgb = (v) => {
  const x = v / 255;
  return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
};

// Alpha-composite `fg` (which may be translucent) over opaque `bg`.
function over(fg, bg) {
  const a = fg[3];
  return [
    fg[0] * a + bg[0] * (1 - a),
    fg[1] * a + bg[1] * (1 - a),
    fg[2] * a + bg[2] * (1 - a),
    1,
  ];
}

export function relativeLuminance(color) {
  const c = parseColor(color);
  if (!c) return null;
  const rgb = c[3] < 1 ? over(c, [0, 0, 0, 1]) : c; // composite over black if translucent
  return 0.2126 * srgb(rgb[0]) + 0.7152 * srgb(rgb[1]) + 0.0722 * srgb(rgb[2]);
}

// WCAG contrast ratio between two colors (1..21). Translucent colors are composited
// over the other color first (the drop-shadow case).
export function contrastRatio(fg, bg) {
  const bgc = parseColor(bg);
  let fgc = parseColor(fg);
  if (!bgc || !fgc) return null;
  if (fgc[3] < 1) fgc = over(fgc, bgc);
  const l1 = relativeLuminance(`rgba(${fgc[0]},${fgc[1]},${fgc[2]},1)`);
  const l2 = relativeLuminance(`rgba(${bgc[0]},${bgc[1]},${bgc[2]},1)`);
  const hi = Math.max(l1, l2), lo = Math.min(l1, l2);
  return (hi + 0.05) / (lo + 0.05);
}

// ---- The HUD ink palette — imported from the REAL source (M13 S12) ----------------
// Previously this file kept a hand-copied mirror of hud.js's colors, so the contrast
// test audited the copy, not what the HUD actually draws (a change to a real HUD color
// could not fail the test). Now HUD_INKS IS hud.js's exported palette, so the floor
// re-audits the real colors. Each ink is read over the dark drop shadow -> vs black.
import { HUD_PALETTE, HUD_WASHES } from './hud.js';
export const HUD_INKS = HUD_PALETTE;
export const HUD_WASH_INKS = HUD_WASHES;  // an alias, not a re-export (build contract)
export const SHADOW_BACKING = '#000000'; // the near-black the drop shadow provides

// ---- Menu (DOM) inks. The assist/options menu paints DOM text over its own dark
// panel; labels MUST carry an explicit color. (2026-08-07 operator-caught defect:
// label spans had no color at all, inherited the page default, and vanished into
// the panel. test/legibility.test.js now holds every menu ink to the floor.)
export const MENU_PANEL_BG = '#0c121a'; // the menu panel base (rgba(12,18,26,0.96))
export const MENU_INKS = {
  label: '#d5e2e9',       // unselected row labels
  labelActive: '#ffffff', // selected row label
  value: '#bfe9e2',       // right-hand values
};

// Non-text menu chrome: the groove behind a range row's slider fill (the fill itself
// is MENU_INKS.value). WCAG 2.1 holds non-text UI components to 3:1, not the 4.5:1
// text floor — a groove is a shape, not a glyph — so it states its own bar here
// instead of being smuggled into the text manifest above.
export const MIN_CONTRAST_NONTEXT = 3.0;
export const MENU_SURFACES = {
  track: '#5c7b88',       // range-slider groove, read over MENU_PANEL_BG
};

// ---- No-color-only manifest: every stateful HUD cue pairs color with a shape/
// icon/text/count. The accessibility law: "color is the accent," never the only
// carrier. Mirrors what src/ui/hud.js actually draws (verified by eye + proofs).
export const STATE_CUES = [
  { state: 'lock-on', color: 'INK/WARN', cues: ['shape', 'text'], note: 'target brackets + LOCK/LOCKING' },
  { state: 'deflect', color: 'BRAKE', cues: ['shape', 'text'], note: 'spoked shield ring + DEFLECT' },
  { state: 'meter-mode', color: 'BOOST/BRAKE/INK', cues: ['icon', 'text'], note: 'directional chevron + BOOST/BRAKE/THRUST' },
  { state: 'meter-low', color: 'WARN', cues: ['count', 'text'], note: 'segment count + low warning' },
  { state: 'hull', color: 'HULL/WARN', cues: ['count'], note: 'segmented bar count' },
  { state: 'medal-pace', color: 'PACE', cues: ['text', 'count'], note: 'PACE: TIER + pip count' },
  { state: 'boss-hull', color: 'BOSS_INK', cues: ['count'], note: 'gauge + phase-boundary ticks' },
  { state: 'boss-phase', color: 'BOSS_INK', cues: ['text', 'count'], note: 'PHASE n/N word + pips' },
  { state: 'boss-telegraph', color: 'WARN', cues: ['text'], note: 'INCOMING band (pulse suppressed under reduced motion, text stays)' },
  { state: 'wing-status', color: 'tint', cues: ['shape'], note: 'alive dot vs down ring+X' },
  { state: 'pickup-kind', color: 'accent', cues: ['shape'], note: 'heal cross vs score gem silhouette' },
  { state: 'damage-source', color: 'WARN', cues: ['text'], note: 'cause-of-death attribution callout' },
];

// Clamp any proposed flash alpha to the hard cap. The single gate every flash source
// passes through so no VFX can exceed the accessibility law's ceiling.
export function clampFlash(alpha) {
  if (!(alpha > 0)) return 0;
  return Math.min(alpha, FLASH_CAP);
}

// ---- The "a flash must read as LIGHT" floor (2026-08-07) --------------------------
// The kill flash is capped at 34% alpha, which is a law. That means its composited
// result can never be bright, so its COLOUR is the only lever it has left: a saturated
// warm ink at 34% over a near-black sector fog lands at hue ~30, saturation ~0.46 —
// measured RGB(104,80,56), which is the colour brown, and is what the operator saw
// ("the screen is flashing brown randomly"). Additive compositing does NOT rescue it
// (measured: value 0.41 -> 0.44, saturation 0.46 -> 0.43); only desaturating the ink
// does. So the stated floor is a saturation ceiling on the COMPOSITED result, checked
// against every real sector fog.
export const MAX_FLASH_SAT = 0.22;

// HSV saturation of a color, 0..1 — the "how much colour is in this" axis, which is
// what separates a white-ish flash from a brown one at equal lightness.
export function saturation(color) {
  const c = parseColor(color);
  if (!c) return null;
  const rgb = c[3] < 1 ? over(c, [0, 0, 0, 1]) : c;
  const mx = Math.max(rgb[0], rgb[1], rgb[2]);
  const mn = Math.min(rgb[0], rgb[1], rgb[2]);
  return mx <= 0 ? 0 : (mx - mn) / mx;
}

// Composite a wash of `alpha` in `fg` over an opaque `bg`, returning an 'rgb(r,g,b)'
// string — the same source-over the 2D canvas performs, so the floor audits the pixel
// the player actually gets. `bg` accepts a css color or a [0..1,0..1,0..1] triple (the
// form sector fog colors are authored in).
export function compositeWash(fg, bg, alpha) {
  const b = Array.isArray(bg)
    ? [bg[0] * 255, bg[1] * 255, bg[2] * 255, 1]
    : parseColor(bg);
  const f = parseColor(fg);
  if (!b || !f) return null;
  const out = over([f[0], f[1], f[2], Math.min(1, Math.max(0, alpha))], b);
  return `rgb(${Math.round(out[0])},${Math.round(out[1])},${Math.round(out[2])})`;
}
