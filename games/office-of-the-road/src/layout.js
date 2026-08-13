// Shared bottom-band ownership. Content rows are clamped wholly above the live
// march/combat controls; control labels are rendered inside their own rectangles.
export const CONTROL_BAND_Y = 182;
export const CONTROL_BAND_BOTTOM = 196;
export const CORE_TEXT_HEIGHT = 7;
/** Visible air between stacked glyph cells at 1× native (display-px). */
export const MIN_INTERLINE_GAP = 3;
/** Baseline-to-baseline must be ≥ this × cap height (or cell+gap, whichever larger). */
export const TEXT_LEADING_RATIO = 1.35;
/**
 * Minimum line spacing for the 5×7 face: ceil(1.35×7)=10 → 3px clear air under
 * each 7-row cell. Never re-tighten below this; grow the box instead.
 */
export const TEXT_LEADING = Math.max(
  Math.ceil(CORE_TEXT_HEIGHT * TEXT_LEADING_RATIO),
  CORE_TEXT_HEIGHT + MIN_INTERLINE_GAP,
);
export const CONTENT_TEXT_MAX_Y = CONTROL_BAND_Y - CORE_TEXT_HEIGHT;

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
