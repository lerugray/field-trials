// sprite.js — code-drawn pixel-art authoring (DESIGN-SEED art law: ALL art is programmatic
// canvas pixel-grid authoring). A sprite is authored as an array of equal-length strings, one char
// per pixel, indexing the shared palette ('.' = transparent). Rasterization to RGBA is pure and
// headless-testable so the art pipeline can be validated without a browser.

import { PALETTE, rgbaOf } from './palette.js';

/**
 * Right-pad ragged rows to the widest row's length with transparent pixels. Lets hand-authored art
 * be written without counting every trailing column. Returns a new array.
 */
export function padRows(rows) {
  const w = rows.reduce((m, r) => Math.max(m, r.length), 0);
  return rows.map((r) => r + '.'.repeat(w - r.length));
}

/**
 * Parse a pixel-grid (array of equal-length rows of palette keys) into a validated sprite.
 * @param {string[]} rows
 * @returns {{w:number,h:number,rows:string[]}}
 */
export function parseSprite(rowsIn) {
  if (!Array.isArray(rowsIn) || rowsIn.length === 0) throw new Error('sprite: empty grid');
  // A space is an authoring convenience for transparent (same as '.').
  const rows = rowsIn.map((r) => r.replace(/ /g, '.'));
  const w = rows[0].length;
  if (w === 0) throw new Error('sprite: zero-width row');
  for (let y = 0; y < rows.length; y++) {
    if (rows[y].length !== w) throw new Error(`sprite: ragged row ${y} (${rows[y].length} != ${w})`);
    for (const ch of rows[y]) {
      if (!(ch in PALETTE)) throw new Error(`sprite: unknown palette key '${ch}' on row ${y}`);
    }
  }
  return { w, h: rows.length, rows: [...rows] };
}

/**
 * Rasterize a sprite to a flat RGBA byte array (row-major, w*h*4).
 * @param {{w:number,h:number,rows:string[]}} sprite
 * @returns {Uint8ClampedArray}
 */
export function rasterize(sprite) {
  const { w, h, rows } = sprite;
  const out = new Uint8ClampedArray(w * h * 4);
  let i = 0;
  for (let y = 0; y < h; y++) {
    const row = rows[y];
    for (let x = 0; x < w; x++) {
      const [r, g, b, a] = rgbaOf(row[x]);
      out[i++] = r; out[i++] = g; out[i++] = b; out[i++] = a;
    }
  }
  return out;
}

/** Return a new sprite mirrored horizontally (for left/right facing). */
export function flipH(sprite) {
  const rows = sprite.rows.map((row) => [...row].reverse().join(''));
  return { w: sprite.w, h: sprite.h, rows };
}

/**
 * Bake a sprite into an ImageData-compatible object. In a browser this hands straight to
 * ctx.putImageData / createImageBitmap; headless it is just {width,height,data}.
 */
export function toImageData(sprite, ImageDataCtor) {
  const data = rasterize(sprite);
  if (typeof ImageDataCtor === 'function') return new ImageDataCtor(data, sprite.w, sprite.h);
  return { width: sprite.w, height: sprite.h, data };
}
