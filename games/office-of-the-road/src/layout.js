// Shared bottom-band ownership. Content rows are clamped wholly above the live
// march/combat controls; control labels are rendered inside their own rectangles.
import { PIXEL_FONT } from './pixel-font.js';

export const CONTROL_BAND_Y = 182;
export const CONTROL_BAND_BOTTOM = 196;
/**
 * The face's full line box — ascender through descender. DERIVED from the
 * shipped font rather than typed, so swapping the face can never leave the
 * leading law asserting an old cell. ("Undead Pixel 8": 8 rows = 6 cap + 2
 * descender; the previous hand-drawn face was 7.)
 */
export const CORE_TEXT_HEIGHT = PIXEL_FONT.cellHeight;
/** Visible air between stacked glyph cells at 1× native (display-px). */
export const MIN_INTERLINE_GAP = 3;
/** Baseline-to-baseline must be ≥ this × cap height (or cell+gap, whichever larger). */
export const TEXT_LEADING_RATIO = 1.35;
/**
 * Minimum line spacing: ceil(1.35×8)=11 → 3px clear air under each 8-row cell,
 * measured on the FULL box so a descender on one line can never touch a cap on
 * the next. Never re-tighten below this; grow the box instead.
 */
export const TEXT_LEADING = Math.max(
  Math.ceil(CORE_TEXT_HEIGHT * TEXT_LEADING_RATIO),
  CORE_TEXT_HEIGHT + MIN_INTERLINE_GAP,
);
export const CONTENT_TEXT_MAX_Y = CONTROL_BAND_Y - CORE_TEXT_HEIGHT;

/**
 * THE DRAFT TILE — geometry of one offered card on the combat draft screen,
 * shared with test/card-no-truncation.test.js so the renderer and the law can
 * never drift (the same arrangement TITLE_BAND has with the overlap test).
 *
 * A name plate is sized to the CATALOG, never to the art it hangs under. The
 * overhaul hung the plate on the 32px card and drew the name into 32px, which
 * ellipsized five of the twelve card names. Card names are not truncatable by
 * line-breaking either: "Temperance" is a single 47px token, so a 32px zone
 * cannot hold it on one line or on ten. The ZONE was the defect. Deck review
 * had already sized its tile at 50 — 48px of name, which clears every name in
 * the deck — and the draft now matches its sibling.
 *
 * The block is budgeted upward from the control band: the plate's last row is
 * CONTROL_BAND_Y - 8 and the name's cell bottom lands on CONTENT_TEXT_MAX_Y,
 * so neither can grow into the live control row.
 */
const DRAFT_ART_Y = 134;
const DRAFT_ART_H = 28;
export const DRAFT_TILE = Object.freeze({
  x0: 16, // left edge of the first tile; the pointer clears the frame edge
  w: 54, // tile width: the 48px name + 2px of air each side, plus the plate edge
  gap: 10, // the focus pointer (4px wide, drawn 8px left) lives in this gutter
  artW: 32,
  artH: DRAFT_ART_H,
  artY: DRAFT_ART_Y,
  plateH: 11,
  plateY: DRAFT_ART_Y + DRAFT_ART_H + 1,
  nameY: DRAFT_ART_Y + DRAFT_ART_H + 3,
  nameW: 52,
  declineX: 210,
  declineY: DRAFT_ART_Y + 14,
  declineW: 60,
  declineH: 18,
});

/** Left edge of the i-th draft tile. */
export function draftTileX(i) {
  return DRAFT_TILE.x0 + i * (DRAFT_TILE.w + DRAFT_TILE.gap);
}

/**
 * Find stacked text pairs whose ink gap is under MIN_INTERLINE_GAP.
 * Stacked = lower box starts at/below upper's bottom, x-ranges overlap, and the
 * gap is still "adjacent" (under 2× leading) — catches bunched lines the
 * collision gate misses (touching but non-overlapping boxes).
 */
export function findTightInterlineGaps(texts, minGap = MIN_INTERLINE_GAP, lead = TEXT_LEADING) {
  const hits = [];
  const list = texts || [];
  for (let i = 0; i < list.length; i++) {
    for (let j = 0; j < list.length; j++) {
      if (i === j) continue;
      const a = list[i], b = list[j];
      if (!(a && b) || a.y > b.y) continue;
      const gap = b.y - (a.y + a.h);
      if (gap < 0 || gap >= minGap) continue;
      if (gap >= lead * 2) continue;
      const sameStack = a.stack && b.stack && a.stack === b.stack;
      const leftDelta = Math.abs(a.x - b.x);
      const overlap = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
      if (overlap <= 0) continue;
      // Stacked prose: same wrap/stack id, or untagged column-aligned neighbours.
      if (!sameStack) {
        if (!(a.stack == null && b.stack == null && leftDelta <= 16)) continue;
        // Combat damage floats are ephemeral and not catalog prose.
        if (/^[+-]?\d+$/.test(String(a.text)) || /^[+-]?\d+$/.test(String(b.text))) continue;
      }
      hits.push({
        a: a.text, b: b.text, gap, stack: a.stack || null,
        aBox: { x: a.x, y: a.y, w: a.w, h: a.h },
        bBox: { x: b.x, y: b.y, w: b.w, h: b.h },
      });
    }
  }
  return hits;
}

export const NATIVE_W = 320;
export const NATIVE_H = 200;

export function contentTextY(y) {
  return Math.min(y, CONTENT_TEXT_MAX_Y);
}

export function boxesIntersect(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

/**
 * Best-fit of the native buffer to the window (fractional-crisp). One axis
 * reaches the viewport; the other letterboxes, centered. Pixels stay nearest-
 * neighbour via the present blit (imageSmoothingEnabled = false + pixelated).
 */
export function computeDisplayFit(vpW, vpH, nw = NATIVE_W, nh = NATIVE_H) {
  const w = Math.max(1, vpW | 0), h = Math.max(1, vpH | 0);
  const scale = Math.min(w / nw, h / nh);
  const cssW = nw * scale, cssH = nh * scale;
  const offX = (w - cssW) / 2, offY = (h - cssH) / 2;
  return {
    scale, cssW, cssH, offX, offY,
    fillW: cssW / w, fillH: cssH / h,
    integer: scale === Math.floor(scale),
  };
}

/** Integer device-pixel backing store for a CSS blit rect (no subpixel present). */
export function presentBackingSize(cssW, cssH, dpr = 1) {
  const d = dpr > 0 ? dpr : 1;
  return {
    bw: Math.max(1, Math.round(cssW * d)),
    bh: Math.max(1, Math.round(cssH * d)),
  };
}

/** Remap a client pointer into native buffer coordinates given a live fit. */
export function pointerToNative(clientX, clientY, canvasLeft, canvasTop, scale) {
  const s = scale > 0 ? scale : 1;
  return { x: (clientX - canvasLeft) / s, y: (clientY - canvasTop) / s };
}
