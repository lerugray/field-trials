// Shared bottom-band ownership. Content rows are clamped wholly above the live
// march/combat controls; control labels are rendered inside their own rectangles.
export const CONTROL_BAND_Y = 182;
export const CONTROL_BAND_BOTTOM = 196;
export const CORE_TEXT_HEIGHT = 7;
/** Minimum line spacing: one pixel leading below the 7-row glyph cell. */
export const TEXT_LEADING = CORE_TEXT_HEIGHT + 1;
export const CONTENT_TEXT_MAX_Y = CONTROL_BAND_Y - CORE_TEXT_HEIGHT;

export const NATIVE_W = 320;
export const NATIVE_H = 200;

export function contentTextY(y) {
  return Math.min(y, CONTENT_TEXT_MAX_Y);
}

export function boxesIntersect(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

/**
 * Largest integer multiple of the native buffer that fits the window, centered.
 * Always integer scale (crisp pixels). Letterbox offsets are inclusive of the
 * dark stage around the canvas.
 */
export function computeDisplayFit(vpW, vpH, nw = NATIVE_W, nh = NATIVE_H) {
  const w = Math.max(1, vpW | 0), h = Math.max(1, vpH | 0);
  const scale = Math.max(1, Math.floor(Math.min(w / nw, h / nh)));
  const cssW = nw * scale, cssH = nh * scale;
  const offX = Math.floor((w - cssW) / 2);
  const offY = Math.floor((h - cssH) / 2);
  return {
    scale, cssW, cssH, offX, offY,
    fillW: cssW / w, fillH: cssH / h,
  };
}

/** Remap a client pointer into native buffer coordinates given a live fit. */
export function pointerToNative(clientX, clientY, canvasLeft, canvasTop, scale) {
  const s = scale > 0 ? scale : 1;
  return { x: (clientX - canvasLeft) / s, y: (clientY - canvasTop) / s };
}
