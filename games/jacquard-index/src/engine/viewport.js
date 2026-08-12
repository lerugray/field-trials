// THE JACQUARD INDEX — viewport math (native-res -> screen scaling pipeline).
//
// Hard-rule 3(a): native-resolution software rendering, integer/nearest scale
// (fractional-but-nearest where screen-fill wins). This module owns that decision and
// nothing else, so it is pure and fully testable. The framebuffer is always drawn at
// BASE native resolution; this computes how it maps onto the window.

// Integer-scale, centered letterbox: the crispest option (no nearest-neighbor shimmer),
// used until the M7 screen-fill gate decides a mode per resolution.
export function integerViewport(winW, winH, baseW, baseH) {
  const scale = Math.max(1, Math.floor(Math.min(winW / baseW, winH / baseH)));
  const dispW = baseW * scale;
  const dispH = baseH * scale;
  return {
    scale,
    offX: Math.floor((winW - dispW) / 2),
    offY: Math.floor((winH - dispH) / 2),
    dispW,
    dispH,
    fractional: false,
  };
}

// Fractional-nearest: the largest scale that still fits, allowed to be non-integer so
// the base fills the window (screen-fill gate). Still nearest-sampled at blit time, so
// pixels stay hard-edged; some rows/cols are 1px fatter than others.
export function fillViewport(winW, winH, baseW, baseH) {
  const scale = Math.min(winW / baseW, winH / baseH);
  const dispW = Math.round(baseW * scale);
  const dispH = Math.round(baseH * scale);
  return {
    scale,
    offX: Math.floor((winW - dispW) / 2),
    offY: Math.floor((winH - dispH) / 2),
    dispW,
    dispH,
    fractional: scale !== Math.floor(scale),
  };
}

// Fraction of the window covered by the displayed frame (the M7 fill metric).
export function coverage(vp, winW, winH) {
  return (vp.dispW * vp.dispH) / (winW * winH);
}

// Map a screen/client pixel (relative to the canvas top-left) to a native framebuffer
// coordinate. Returns null when the point is in the letterbox margin (outside the frame).
export function screenToNative(vp, sx, sy) {
  const nx = Math.floor((sx - vp.offX) / vp.scale);
  const ny = Math.floor((sy - vp.offY) / vp.scale);
  return { x: nx, y: ny, inside: nx >= 0 && ny >= 0 };
}
