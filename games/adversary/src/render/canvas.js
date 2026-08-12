// canvas.js — the 240p canvas pipeline (DESIGN-SEED: 240p-ish logical resolution, chunky readable
// pixels). Everything renders to a fixed 256×240 logical backbuffer, then integer-scales to the
// display with nearest-neighbor and letterboxing so pixels stay square at any window size. The
// scale math is pure and tested; the DOM wiring is a thin browser-only wrapper.

export const LOGICAL_W = 256;
export const LOGICAL_H = 240;

/**
 * Largest integer scale that fits the logical frame in the display, plus centering offsets.
 * @returns {{scale:number, offsetX:number, offsetY:number, drawW:number, drawH:number}}
 */
export function computeIntegerScale(displayW, displayH, logicalW = LOGICAL_W, logicalH = LOGICAL_H) {
  const scale = Math.max(1, Math.floor(Math.min(displayW / logicalW, displayH / logicalH)));
  const drawW = logicalW * scale;
  const drawH = logicalH * scale;
  const offsetX = Math.floor((displayW - drawW) / 2);
  const offsetY = Math.floor((displayH - drawH) / 2);
  return { scale, offsetX, offsetY, drawW, drawH };
}

/**
 * Wire a display <canvas> to a 256×240 logical backbuffer. Browser-only (needs a real canvas).
 * @param {HTMLCanvasElement} displayCanvas
 * @param {object} [opts]
 * @param {Document} [opts.doc=document] - for creating the offscreen buffer.
 */
export function createRenderer(displayCanvas, { doc = (typeof document !== 'undefined' ? document : null) } = {}) {
  if (!doc) throw new Error('createRenderer requires a document (browser only)');
  const buffer = doc.createElement('canvas');
  buffer.width = LOGICAL_W;
  buffer.height = LOGICAL_H;
  // The ratified light compositor performs exactly one bounded readback per logical frame.
  // This hint keeps browsers on the readback-friendly Canvas2D path.
  const ctx = buffer.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingEnabled = false;

  const display = displayCanvas.getContext('2d');
  display.imageSmoothingEnabled = false;

  function resize(displayW, displayH) {
    displayCanvas.width = displayW;
    displayCanvas.height = displayH;
    display.imageSmoothingEnabled = false;
  }

  function present() {
    const { scale, offsetX, offsetY } = computeIntegerScale(displayCanvas.width, displayCanvas.height);
    display.imageSmoothingEnabled = false;
    display.fillStyle = '#000';
    display.fillRect(0, 0, displayCanvas.width, displayCanvas.height);
    display.drawImage(buffer, 0, 0, LOGICAL_W, LOGICAL_H, offsetX, offsetY, LOGICAL_W * scale, LOGICAL_H * scale);
  }

  return { ctx, buffer, resize, present, LOGICAL_W, LOGICAL_H };
}
