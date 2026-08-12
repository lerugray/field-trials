// THE JACQUARD INDEX — software framebuffer (native-resolution rendering core).
//
// Hard-rule 3(a): every visual is drawn by code into a native-resolution software
// buffer, then blitted to the canvas with integer/nearest scaling. This module is the
// buffer. It is pure JS with no DOM dependency, so it runs (and is asserted against)
// under `node --test` exactly as it runs in the browser.
//
// Pixels are RGBA8, row-major, top-left origin. Writes with alpha < 255 composite
// source-over onto what is already there — hard-rule 3(b) treats light as compositing,
// and this is the primitive that law is built on.

export class Framebuffer {
  constructor(width, height) {
    this.width = width | 0;
    this.height = height | 0;
    if (this.width <= 0 || this.height <= 0) {
      throw new Error(`Framebuffer needs positive dimensions, got ${width}x${height}`);
    }
    // Uint8ClampedArray so channel arithmetic saturates instead of wrapping.
    this.data = new Uint8ClampedArray(this.width * this.height * 4);
  }

  // Byte offset of pixel (x, y). Callers guard bounds.
  index(x, y) {
    return (y * this.width + x) * 4;
  }

  inBounds(x, y) {
    return x >= 0 && y >= 0 && x < this.width && y < this.height;
  }

  // Overwrite every pixel. Opaque by default; the shop-floor ground starts here.
  clear(r, g, b, a = 255) {
    const d = this.data;
    for (let i = 0; i < d.length; i += 4) {
      d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = a;
    }
    return this;
  }

  // Source-over composite of one pixel. Fully-opaque source is a plain store;
  // partial alpha blends onto the destination (the compositing primitive).
  setPixel(x, y, r, g, b, a = 255) {
    if (!this.inBounds(x, y)) return this;
    x |= 0; y |= 0;
    const i = this.index(x, y);
    const d = this.data;
    if (a >= 255) {
      d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = 255;
      return this;
    }
    if (a <= 0) return this;
    const sa = a / 255;
    const da = d[i + 3] / 255;
    const outA = sa + da * (1 - sa);
    if (outA <= 0) {
      d[i] = 0; d[i + 1] = 0; d[i + 2] = 0; d[i + 3] = 0;
      return this;
    }
    d[i] = (r * sa + d[i] * da * (1 - sa)) / outA;
    d[i + 1] = (g * sa + d[i + 1] * da * (1 - sa)) / outA;
    d[i + 2] = (b * sa + d[i + 2] * da * (1 - sa)) / outA;
    d[i + 3] = outA * 255;
    return this;
  }

  // Returns [r, g, b, a]; out-of-bounds reads are transparent black.
  getPixel(x, y) {
    if (!this.inBounds(x, y)) return [0, 0, 0, 0];
    const i = this.index(x | 0, y | 0);
    const d = this.data;
    return [d[i], d[i + 1], d[i + 2], d[i + 3]];
  }

  // Filled rectangle, clipped to the buffer. Composites per-pixel so partial alpha
  // (light rigs, dither veils) works the same as a single pixel.
  fillRect(x, y, w, h, r, g, b, a = 255) {
    let x0 = x | 0, y0 = y | 0;
    let x1 = (x + w) | 0, y1 = (y + h) | 0;
    if (x1 < x0) { const t = x0; x0 = x1; x1 = t; }
    if (y1 < y0) { const t = y0; y0 = y1; y1 = t; }
    x0 = Math.max(0, x0); y0 = Math.max(0, y0);
    x1 = Math.min(this.width, x1); y1 = Math.min(this.height, y1);
    for (let py = y0; py < y1; py++) {
      for (let px = x0; px < x1; px++) {
        this.setPixel(px, py, r, g, b, a);
      }
    }
    return this;
  }

  // Single-pixel-thick rectangle outline (the register's functional chrome: card
  // edges, index-tab borders, grid frames).
  strokeRect(x, y, w, h, r, g, b, a = 255) {
    const x0 = x | 0, y0 = y | 0, w0 = w | 0, h0 = h | 0;
    this.fillRect(x0, y0, w0, 1, r, g, b, a);
    this.fillRect(x0, y0 + h0 - 1, w0, 1, r, g, b, a);
    this.fillRect(x0, y0, 1, h0, r, g, b, a);
    this.fillRect(x0 + w0 - 1, y0, 1, h0, r, g, b, a);
    return this;
  }

  // Horizontal / vertical hairlines (warp/weft grid ruling on pattern paper).
  hLine(x, y, len, r, g, b, a = 255) { return this.fillRect(x, y, len, 1, r, g, b, a); }
  vLine(x, y, len, r, g, b, a = 255) { return this.fillRect(x, y, 1, len, r, g, b, a); }

  // Composite another framebuffer onto this one at (dx, dy). This is how light rigs
  // and pre-rendered material tiles layer over albedo (hard-rule 3(b)/3(c)).
  blit(src, dx = 0, dy = 0) {
    dx |= 0; dy |= 0;
    for (let sy = 0; sy < src.height; sy++) {
      const py = dy + sy;
      if (py < 0 || py >= this.height) continue;
      for (let sx = 0; sx < src.width; sx++) {
        const px = dx + sx;
        if (px < 0 || px >= this.width) continue;
        const j = src.index(sx, sy);
        this.setPixel(px, py, src.data[j], src.data[j + 1], src.data[j + 2], src.data[j + 3]);
      }
    }
    return this;
  }
}
