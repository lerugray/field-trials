// ui.js — THE CONTROL LANGUAGE. One place that knows what a button, a panel, a
// masthead and a selection marker look like, so every screen speaks the same
// dialect instead of each one stroking its own rectangle.
//
// The conventions, translated from Knights of Pen and Paper to this 320×200
// raster and THIS palette (roles borrowed, hues never):
//
//   1. A control is an OBJECT. Fill, a border in a darker shade of that same
//      fill, a 1px top bevel, a 1px bottom shade, a 1px drop shadow. Static
//      text gets none of it — "touchable" and "printed" must not look alike.
//   2. Priority is WIDTH, not colour alone. A primary control is ~1.7× the
//      width of the secondary beside it, at the SAME height.
//   3. Selection is marked OUTSIDE the control (a pointer in the accent), so
//      the control's own body never changes size or shifts its label.
//   4. Disabled desaturates IN PLACE. Same rect, same label position, no
//      reflow — a greyed control still tells you where it is.
//   5. Numbers and resources are always the accent colour. Icons carry
//      recognition, text carries the figures.

import { PALETTE } from './palette.js';
import { pixelText, pixelTextWidth, setType } from './pixel-font.js';

// Local alias. NOTE: the single-file build concatenates modules into one
// scope, so top-level names must be unique across src/ — main.js already owns `C`.
const UP = PALETTE;

/** A primary control is this much wider than the secondary it sits beside. */
export const PRIMARY_WIDTH_RATIO = 1.7;

/** Standard control height for an action row (KotPP's chunky, tappable band). */
export const CHIP_H = 14;

/** Gap between stacked menu chips: ~22% of chip height. */
export const CHIP_GAP = 3;

/**
 * THE SIX COLOUR ROLES, drawn from the existing palette. Every screen picks a
 * role; no screen picks a hex.
 */
export const ROLE = Object.freeze({
  chrome: UP.panel2, // the masthead band
  titleBand: UP.paper, // headings and screen names
  surface: UP.panel, // inset panels behind content
  accent: UP.focus, // NUMBERS, resources, selection
  confirm: UP.ok, // affirmative status
  danger: UP.stamp, // alert / loss / cancel
  disabled: UP.controlOffInk, // inert
  body: UP.dim, // ordinary prose
  caption: UP.faint, // labels and hints (the third type tier)
});

/** Multiply a hex toward black (k<1) or white (k>1). Never returns pure black. */
export function shade(hex, k) {
  const n = String(hex).replace('#', '');
  const out = [0, 2, 4].map((i) => {
    const v = parseInt(n.slice(i, i + 2), 16);
    const scaled = k >= 1 ? v + (255 - v) * (k - 1) : v * k;
    return Math.max(3, Math.min(255, Math.round(scaled)));
  });
  return '#' + out.map((v) => v.toString(16).padStart(2, '0')).join('');
}

/**
 * The chip skins. `keyline` overrides the own-shade border: a secondary chip's
 * fill is too dark to be its own >=3:1 boundary against the page, so it borrows
 * the palette's asserted interactive edge. A primary chip needs no such loan.
 */
export const SKIN = Object.freeze({
  primary: { fill: UP.control, label: UP.ink, keyline: null },
  secondary: { fill: UP.control2, label: UP.paper, keyline: UP.edge },
  danger: { fill: UP.control2, label: UP.stamp, keyline: UP.stamp },
  disabled: { fill: UP.controlOff, label: UP.controlOffInk, keyline: UP.rule },
});

/** A 1px drop shadow, offset down-right. Shared by chips and panels. */
function dropShadow(ctx, x, y, w, h) {
  ctx.fillStyle = UP.shadow;
  ctx.fillRect(x + 1, y + 1, w, h);
}

/**
 * Draw one control chip. `state` is 'normal' | 'active' | 'disabled'; `focused`
 * adds the OUTSIDE pointer. Returns the skin actually used.
 */
export function drawChip(ctx, rect, opts = {}) {
  const { x, y, w, h } = rect;
  const disabled = opts.state === 'disabled';
  const skin = disabled ? SKIN.disabled : (SKIN[opts.priority] || SKIN.secondary);
  // An active/selected chip lifts its fill rather than swapping colour, so the
  // non-colour channel (the pointer) stays the real state carrier.
  const fill = opts.state === 'active' ? shade(skin.fill, 1.25)
    : opts.hover && !disabled ? shade(skin.fill, 1.12)
      : skin.fill;

  dropShadow(ctx, x, y, w, h);
  ctx.fillStyle = skin.keyline || shade(fill, 0.55);
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = fill;
  ctx.fillRect(x + 1, y + 1, w - 2, h - 2);
  ctx.fillStyle = shade(fill, 1.3); // top bevel
  ctx.fillRect(x + 1, y + 1, w - 2, 1);
  ctx.fillStyle = shade(fill, 0.72); // bottom shade
  ctx.fillRect(x + 1, y + h - 2, w - 2, 1);

  if (opts.focused) drawPointer(ctx, x - 6, y + ((h - 7) >> 1));
  return skin;
}

/** The selection pointer — a 4×7 triangle in the accent, OUTSIDE the control. */
export function drawPointer(ctx, x, y, color) {
  ctx.fillStyle = color || ROLE.accent;
  for (let i = 0; i < 7; i++) {
    const run = 4 - Math.abs(i - 3);
    if (run > 0) ctx.fillRect(x, y + i, run, 1);
  }
}

/**
 * A content panel: a bordered surface for grouped, non-interactive content.
 * Deliberately flatter than a chip (no bevel) so panels never read as buttons.
 */
export function drawPanel(ctx, x, y, w, h, opts = {}) {
  if (opts.raised) dropShadow(ctx, x, y, w, h);
  ctx.fillStyle = opts.border || UP.rule;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = opts.fill || ROLE.surface;
  ctx.fillRect(x + 1, y + 1, w - 2, h - 2);
}

/** A section label above a panel: caption tier, never a chip. */
export function panelLabel(ctx, text, x, y) {
  setType(ctx, 'caption');
  ctx.fillStyle = ROLE.caption;
  pixelText(ctx, text, x, y);
}

/**
 * Centre a body-tier label inside a chip. Kept here so every chip in the game
 * centres identically (the old code inset labels by a hand-picked 4-6px and
 * they never lined up between screens).
 */
export function chipLabel(ctx, rect, label, color, role = 'body') {
  const scale = setType(ctx, role);
  ctx.fillStyle = color;
  const w = pixelTextWidth(ctx, label);
  const cellH = 8 * scale;
  pixelText(ctx, label, rect.x + Math.max(2, (rect.w - w) >> 1), rect.y + ((rect.h - cellH) >> 1) + 1);
  return w;
}

/**
 * THE MASTHEAD — one thin bar, exactly three zones and no more:
 *   left   the screen / action you are in
 *   centre the state of the run (day · leg · where)
 *   right  the resource, in the accent, with its pack icon
 *
 * `drawResource` is handed the (x, y) of the right zone so main.js can blit the
 * gold icon from the licensed iconset without ui.js needing the art layer.
 */
export const TOP_BAR_H = 15;

export function drawTopBar(ctx, opts = {}) {
  const w = opts.width || 320;
  ctx.fillStyle = ROLE.chrome;
  ctx.fillRect(0, 0, w, TOP_BAR_H);
  ctx.fillStyle = UP.rule;
  ctx.fillRect(0, TOP_BAR_H, w, 1);

  if (opts.left) {
    setType(ctx, 'body');
    ctx.fillStyle = ROLE.titleBand;
    pixelText(ctx, opts.left, 8, 4);
  }
  if (opts.center) {
    setType(ctx, 'body');
    ctx.fillStyle = ROLE.body;
    const cw = pixelTextWidth(ctx, opts.center);
    pixelText(ctx, opts.center, (w - cw) >> 1, 4);
  }
  if (typeof opts.drawRight === 'function') opts.drawRight(w - 8, 4);
}
