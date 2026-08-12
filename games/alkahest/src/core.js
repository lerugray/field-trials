/* ALKAHEST -- core: namespace, native resolution, math, deterministic rng + noise.
 *
 * Dual-mode: this file augments a shared `AL` namespace on either the browser
 * global (self/window) or the Node global, and also sets module.exports so the
 * node --test suite can require() it. The single-file build concatenates every
 * src file; each runs this same IIFE and augments the one `AL`.
 *
 * Everything here is clean-room and deterministic. No reference expression: only
 * generic public-domain numeric machinery (mulberry32 PRNG, value noise). The
 * native buffer is fixed (NATIVE-RES SOFTWARE RENDERING, per the graphics bar);
 * all compositing happens in this buffer before an integer/nearest scale to the
 * display.
 */
;(function (root, factory) {
  var AL = root.AL || (root.AL = {});
  factory(AL);
  if (typeof module !== "undefined" && module.exports) module.exports = AL;
})(typeof self !== "undefined" ? self : globalThis, function (AL) {
  /* ---- native buffer dimensions (16:9; integer-scales cleanly to 1080p) ---- */
  AL.W = 384;
  AL.H = 216;

  /* ---------- scalar math ---------- */
  AL.clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };
  AL.lerp = function (a, b, t) { return a + (b - a) * t; };
  AL.smooth = function (t) { return t * t * (3 - 2 * t); };
  AL.mix = function (a, b, t) { return a + (b - a) * t; };
  AL.fract = function (v) { return v - Math.floor(v); };
  AL.sign = function (v) { return v < 0 ? -1 : v > 0 ? 1 : 0; };
  AL.dist = function (ax, ay, bx, by) {
    var dx = ax - bx, dy = ay - by;
    return Math.sqrt(dx * dx + dy * dy);
  };

  /* ---------- deterministic RNG: mulberry32 (public-domain) ----------
   * Returns a function producing floats in [0,1). Same seed => same stream;
   * this underwrites the seed-replay determinism law from M1 onward. */
  AL.rng = function (seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  /* Integer in [0, n) from a generator. */
  AL.randInt = function (gen, n) { return (gen() * n) | 0; };

  /* ---------- value noise (deterministic, seeded) ----------
   * Smooth 2D field in [0,1], used for material texture (dither/fbm) so no
   * surface is an untextured vector flat. */
  AL.noise2 = function (seed) {
    var perm = new Uint8Array(512), r = AL.rng(seed), i, j, t;
    for (i = 0; i < 256; i++) perm[i] = i;
    for (i = 255; i > 0; i--) { j = (r() * (i + 1)) | 0; t = perm[i]; perm[i] = perm[j]; perm[j] = t; }
    for (i = 0; i < 256; i++) perm[i + 256] = perm[i];
    function grad(h, x, y) {
      switch (h & 3) {
        case 0: return x + y;
        case 1: return -x + y;
        case 2: return x - y;
        default: return -x - y;
      }
    }
    return function (x, y) {
      var X = Math.floor(x) & 255, Y = Math.floor(y) & 255;
      var xf = x - Math.floor(x), yf = y - Math.floor(y);
      var u = AL.smooth(xf), v = AL.smooth(yf);
      var aa = perm[perm[X] + Y], ab = perm[perm[X] + Y + 1];
      var ba = perm[perm[X + 1] + Y], bb = perm[perm[X + 1] + Y + 1];
      var x1 = AL.lerp(grad(aa, xf, yf), grad(ba, xf - 1, yf), u);
      var x2 = AL.lerp(grad(ab, xf, yf - 1), grad(bb, xf - 1, yf - 1), u);
      return (AL.lerp(x1, x2, v) + 1) * 0.5;
    };
  };

  /* Fractal Brownian motion over value noise: layered octaves for richer
   * material grain. `n` is an AL.noise2 instance. */
  AL.fbm = function (n, x, y, octaves) {
    octaves = octaves || 4;
    var sum = 0, amp = 0.5, freq = 1, norm = 0;
    for (var o = 0; o < octaves; o++) {
      sum += amp * n(x * freq, y * freq);
      norm += amp;
      amp *= 0.5;
      freq *= 2;
    }
    return sum / norm;
  };

  /* Integer-scale factor to fit a native buffer inside a display, nearest and
   * >=1 (fractional-but-nearest allowed by the bar where screen-fill wins; the
   * boot layer decides which to use). This pure helper is unit-tested. */
  AL.integerScale = function (bufW, bufH, winW, winH) {
    var s = Math.min(winW / bufW, winH / bufH);
    return Math.max(1, Math.floor(s));
  };

  /* Exact scale (may be fractional) for screen-fill mode. */
  AL.fillScale = function (bufW, bufH, winW, winH) {
    return Math.max(1, Math.min(winW / bufW, winH / bufH));
  };
});
