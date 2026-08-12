// frame.js — the full-window CRPG chrome compositor.
//
// The operator's second scale addendum (DIRECTIONS-2026-08-02-INTERFACE-JOURNAL,
// REVIEW ADDENDUM 2): the scale fix made the game bigger, but a 416×416 SQUARE
// logical canvas pillarboxes a widescreen window — dead columns left and right.
// "The whole window is game surface." Adopt the classic CRPG full-window layout
// (the Ultima / Cyclopean move): a scene VIEWPORT + a persistent side HUD PANEL
// + a bottom message/CONSOLE strip, composed to fill the window at any aspect.
//
// The move that makes this work at BOTH 16:10 and 16:9 (a single fixed-aspect
// canvas cannot fill ≥95% of both dimensions at both — the two constraint
// windows don't overlap): the logical backing resolution is RESPONSIVE — its
// aspect tracks the actual window, so scaling it fills the window with square
// pixels. The scene viewport is no longer square-locked (operator: "structural
// call is yours; the OUTCOME is non-negotiable — no pillarbox in any mode").
//
// Pure + headless-testable: computeFrame(vpW,vpH) is the single source of truth
// for the region layout, and frameDisplay(vpW,vpH) for on-screen fill — the
// ≥95%-both-dimensions gate (test/frame.test.js) drives them directly.

import { CANVAS_W } from './layout.js';

// Logical backing height. Everything else is derived from this + the window
// aspect. Chosen so the scene viewport and text stay crisp when the frame is
// scaled to fill a 1080p-class window.
// Art-uplift (operator note 3): raised 540 → 576 in step with the taller console
// so the bottom HUD/log grows in ABSOLUTE terms while the top band (scene + side
// panel) keeps its original 444px height — the panel legend and centred cards are
// structurally unchanged, only the console gets bigger.
export const FRAME_H = 576;

// Bottom console strip height (logical px): the persistent message/prose line +
// the mode keybar hints. Full window width. Art-uplift (operator note 3): scaled
// UP 96 → 132 for readability of the log/HUD region. Paired with FRAME_H 540→576
// so the top band stays 576-132 = 444 (its original height) — the panel legend and
// the 416-tall centred cards are unaffected; only the console grows (+37.5%).
export const CONSOLE_H = 132;

// Right-hand HUD panel width (logical px): persistent party/status/mode-cue —
// the top HUD strip work, folded into a standing side panel (the CRPG move).
export const PANEL_W = 280;

// Floor for the scene viewport width so extreme/portrait windows never collapse
// the play area to nothing (the panel + a usable scene always fit). M8: raised to
// CANVAS_W so the centred text/bust card (combat, death, creation, journal — all
// authored at 416 wide) ALWAYS fits inside the scene and can never overflow into
// the side HUD panel at a narrow/square window (overprint bug class, directive §4).
export const MIN_SCENE_W = CANVAS_W;

// Fraction of each window dimension the composed surface fills. The operator's
// updated gate is ≥95% of BOTH dims; 0.99 clears it with headroom and leaves a
// hair of breathing room at the edges.
export const FILL_MARGIN = 0.99;

// The operator's gate: the composed game surface occupies at least this fraction
// of BOTH window dimensions (replaces the old smaller-dim square gate).
export const FILL_GATE = 0.95;

function clampInt(n, lo, hi) { return Math.max(lo, Math.min(hi, Math.round(n))); }

// Compose the full-window frame for a viewport. Returns the logical backing
// resolution { W, H } (aspect tracks the window) and three non-overlapping
// regions that tile it exactly:
//   scene   — the map/scene viewport (top-left, fills remaining width)
//   panel   — the persistent side HUD (top-right column, PANEL_W wide)
//   console — the bottom message/keybar strip (full width)
export function computeFrame(vpW, vpH, opts = {}) {
  const {
    baseH = FRAME_H,
    consoleH = CONSOLE_H,
    panelW = PANEL_W,
    minSceneW = MIN_SCENE_W,
    maxAspect = 3.2,   // clamp absurd ultrawide so the logical W stays sane
    minAspect = 0.5,
  } = opts;
  const H = Math.round(baseH);
  const aspect = Math.max(minAspect, Math.min(maxAspect, vpW / vpH));
  // Backing width tracks the window aspect; never narrower than panel + a usable
  // scene (keeps the layout valid on square/portrait windows too).
  const W = Math.max(panelW + minSceneW, Math.round(H * aspect));
  const topH = H - consoleH;
  const sceneW = W - panelW;
  return {
    W, H,
    scene: { x: 0, y: 0, w: sceneW, h: topH },
    panel: { x: sceneW, y: 0, w: panelW, h: topH },
    console: { x: 0, y: topH, w: W, h: consoleH },
  };
}

// On-screen size + fill for a viewport. The composed surface fills FILL_MARGIN
// of BOTH window dimensions; because the backing aspect tracks the window, the
// CSS stretch is sub-pixel and pixels stay square (image-rendering:pixelated).
// Returns { cssW, cssH, fillW, fillH } — fillW/fillH are the gate quantities.
export function frameDisplay(vpW, vpH, opts = {}) {
  const { margin = FILL_MARGIN } = opts;
  const cssW = clampInt(vpW * margin, 1, vpW);
  const cssH = clampInt(vpH * margin, 1, vpH);
  return { cssW, cssH, fillW: cssW / vpW, fillH: cssH / vpH };
}
