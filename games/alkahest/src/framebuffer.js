/* ALKAHEST -- framebuffer: the native-resolution software render target.
 *
 * A FrameBuffer is a fixed RGBA8 pixel array (W*H*4). ALL drawing in the game
 * is pixel ops into this buffer -- lighting as compositing, dither/fbm material,
 * scenes composed as single pictures. The buffer is renderer-agnostic:
 *   - in the browser, main.js blits it to a canvas via putImageData + integer
 *     (or fractional-nearest) scale;
 *   - in Node, png.js encodes it, giving headless, deterministic PROOF FRAMES
 *     for the LOOK-at-it acceptance law without a browser in the loop.
 *
 * Colors are (r,g,b) 0..255 with an alpha 0..1 for compositing (source-over).
 */
;(function (root, factory) {
  var AL = root.AL || (root.AL = {});
  factory(AL);
  if (typeof module !== "undefined" && module.exports) module.exports = AL;
})(typeof self !== "undefined" ? self : globalThis, function (AL) {
  function FrameBuffer(w, h) {
    this.w = w;
    this.h = h;
    this.data = new Uint8ClampedArray(w * h * 4);
  }

  /* Flat fill with an opaque color. */
  FrameBuffer.prototype.clear = function (r, g, b) {
    var d = this.data;
    for (var i = 0; i < d.length; i += 4) {
      d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = 255;
    }
    return this;
  };

  /* Source-over composite of one pixel. a in [0,1]. Out-of-bounds is a no-op
   * so callers never have to clip by hand. */
  FrameBuffer.prototype.blend = function (x, y, r, g, b, a) {
    x = x | 0; y = y | 0;
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    if (a <= 0) return;
    if (a > 1) a = 1;
    var i = (y * this.w + x) * 4, d = this.data;
    var ia = 1 - a;
    d[i] = r * a + d[i] * ia;
    d[i + 1] = g * a + d[i + 1] * ia;
    d[i + 2] = b * a + d[i + 2] * ia;
    var da = d[i + 3] / 255;
    d[i + 3] = (a + da * ia) * 255;
  };

  /* Opaque set (ignores existing pixel). */
  FrameBuffer.prototype.set = function (x, y, r, g, b) {
    x = x | 0; y = y | 0;
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    var i = (y * this.w + x) * 4, d = this.data;
    d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = 255;
  };

  /* Read a pixel as [r,g,b,a255]; out of bounds returns null. */
  FrameBuffer.prototype.get = function (x, y) {
    x = x | 0; y = y | 0;
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return null;
    var i = (y * this.w + x) * 4, d = this.data;
    return [d[i], d[i + 1], d[i + 2], d[i + 3]];
  };

  /* Filled rectangle with alpha compositing. */
  FrameBuffer.prototype.rect = function (x, y, w, h, r, g, b, a) {
    if (a === undefined) a = 1;
    var x0 = Math.max(0, x | 0), y0 = Math.max(0, y | 0);
    var x1 = Math.min(this.w, (x + w) | 0), y1 = Math.min(this.h, (y + h) | 0);
    for (var yy = y0; yy < y1; yy++) {
      for (var xx = x0; xx < x1; xx++) this.blend(xx, yy, r, g, b, a);
    }
    return this;
  };

  /* One-pixel rectangle outline. */
  FrameBuffer.prototype.frame = function (x, y, w, h, r, g, b, a) {
    if (a === undefined) a = 1;
    this.rect(x, y, w, 1, r, g, b, a);
    this.rect(x, y + h - 1, w, 1, r, g, b, a);
    this.rect(x, y, 1, h, r, g, b, a);
    this.rect(x + w - 1, y, 1, h, r, g, b, a);
    return this;
  };

  /* Horizontal line. */
  FrameBuffer.prototype.hline = function (x, y, w, r, g, b, a) {
    this.rect(x, y, w, 1, r, g, b, a === undefined ? 1 : a);
    return this;
  };

  /* Vertical line. */
  FrameBuffer.prototype.vline = function (x, y, h, r, g, b, a) {
    this.rect(x, y, 1, h, r, g, b, a === undefined ? 1 : a);
    return this;
  };

  AL.FrameBuffer = FrameBuffer;
});
