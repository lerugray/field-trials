/* ALKAHEST -- render: code-gen compositing helpers to the graphics bar.
 *
 * These are the primitives every scene composes from, per the ratified stack:
 *   (a) native-res software rendering  -> all ops write the FrameBuffer;
 *   (b) lighting as COMPOSITING        -> lightRig / glow add warm light OVER
 *                                          albedo, never flat fills;
 *   (c) material texture via dither/fbm -> textureFill grains every surface so
 *                                          nothing is an untextured vector flat;
 *   (d) scenes as single pictures       -> gradientV / vignette frame the whole.
 *
 * All helpers are pure pixel math on a FrameBuffer, so they run identically in
 * the browser and under Node (proof frames + tests).
 */
;(function (root, factory) {
  var AL = root.AL || (root.AL = {});
  factory(AL);
  if (typeof module !== "undefined" && module.exports) module.exports = AL;
})(typeof self !== "undefined" ? self : globalThis, function (AL) {
  var R = {};

  /* Vertical gradient fill over a region (opaque). top/bot are [r,g,b]. */
  R.gradientV = function (fb, x, y, w, h, top, bot) {
    for (var yy = 0; yy < h; yy++) {
      var t = h <= 1 ? 0 : yy / (h - 1);
      var r = AL.lerp(top[0], bot[0], t);
      var g = AL.lerp(top[1], bot[1], t);
      var b = AL.lerp(top[2], bot[2], t);
      fb.rect(x, y + yy, w, 1, r, g, b, 1);
    }
    return fb;
  };

  /* Material fill: base color modulated by fbm so the surface has grain.
   * `noise` is an AL.noise2 instance; `scale` is world->noise frequency;
   * `amp` (0..1) is how far brightness swings. Composited opaque. */
  R.textureFill = function (fb, x, y, w, h, base, noise, opts) {
    opts = opts || {};
    var scale = opts.scale === undefined ? 0.08 : opts.scale;
    var amp = opts.amp === undefined ? 0.18 : opts.amp;
    var octaves = opts.octaves || 4;
    var x0 = x | 0, y0 = y | 0;
    for (var yy = 0; yy < h; yy++) {
      for (var xx = 0; xx < w; xx++) {
        var n = AL.fbm(noise, (x0 + xx) * scale, (y0 + yy) * scale, octaves);
        var k = 1 + (n - 0.5) * 2 * amp;
        fb.blend(x0 + xx, y0 + yy,
          AL.clamp(base[0] * k, 0, 255),
          AL.clamp(base[1] * k, 0, 255),
          AL.clamp(base[2] * k, 0, 255),
          opts.alpha === undefined ? 1 : opts.alpha);
      }
    }
    return fb;
  };

  /* Additive radial light: warm energy added OVER the albedo, smooth falloff.
   * color [r,g,b], intensity 0..1, radius in px. Bounded to its bbox. */
  R.glow = function (fb, cx, cy, radius, color, intensity) {
    if (radius <= 0 || intensity <= 0) return fb;
    var x0 = Math.max(0, (cx - radius) | 0), x1 = Math.min(fb.w, (cx + radius + 1) | 0);
    var y0 = Math.max(0, (cy - radius) | 0), y1 = Math.min(fb.h, (cy + radius + 1) | 0);
    var r2 = radius * radius;
    for (var yy = y0; yy < y1; yy++) {
      for (var xx = x0; xx < x1; xx++) {
        var dx = xx - cx, dy = yy - cy;
        var d2 = dx * dx + dy * dy;
        if (d2 >= r2) continue;
        var f = 1 - Math.sqrt(d2) / radius;
        f = AL.smooth(f) * intensity;
        var i = (yy * fb.w + xx) * 4, d = fb.data;
        d[i] = AL.clamp(d[i] + color[0] * f, 0, 255);
        d[i + 1] = AL.clamp(d[i + 1] + color[1] * f, 0, 255);
        d[i + 2] = AL.clamp(d[i + 2] + color[2] * f, 0, 255);
      }
    }
    return fb;
  };

  /* Composite a whole light rig (array of lights) over the buffer. */
  R.lightRig = function (fb, lights) {
    for (var i = 0; i < lights.length; i++) {
      var L = lights[i];
      R.glow(fb, L.x, L.y, L.radius, L.color, L.intensity === undefined ? 1 : L.intensity);
    }
    return fb;
  };

  /* Pixel ring used by the combo vocabulary. Unlike a glow, its readable shape
   * survives flashIntensity=0 when the caller draws it at a low steady alpha. */
  R.ring = function (fb, cx, cy, radius, color, alpha, thickness) {
    thickness = thickness === undefined ? 1 : Math.max(1, thickness);
    if (radius <= 0 || alpha <= 0) return fb;
    var outer = radius + thickness * 0.5, inner = Math.max(0, radius - thickness * 0.5);
    var o2 = outer * outer, i2 = inner * inner;
    var x0 = Math.max(0, Math.floor(cx - outer)), x1 = Math.min(fb.w - 1, Math.ceil(cx + outer));
    var y0 = Math.max(0, Math.floor(cy - outer)), y1 = Math.min(fb.h - 1, Math.ceil(cy + outer));
    for (var y = y0; y <= y1; y++) for (var x = x0; x <= x1; x++) {
      var dx = x - cx, dy = y - cy, d2 = dx * dx + dy * dy;
      if (d2 >= i2 && d2 <= o2) fb.blend(x, y, color[0], color[1], color[2], alpha);
    }
    return fb;
  };

  /* Radial vignette darkening toward the frame edges (multiplicative).
   * strength 0..1. */
  R.vignette = function (fb, strength) {
    if (strength <= 0) return fb;
    var cx = fb.w / 2, cy = fb.h / 2;
    var maxD = Math.sqrt(cx * cx + cy * cy);
    for (var yy = 0; yy < fb.h; yy++) {
      for (var xx = 0; xx < fb.w; xx++) {
        var dx = xx - cx, dy = yy - cy;
        var t = Math.sqrt(dx * dx + dy * dy) / maxD; // 0 center .. 1 corner
        var k = 1 - strength * AL.smooth(t) * AL.smooth(t);
        var i = (yy * fb.w + xx) * 4, d = fb.data;
        d[i] *= k; d[i + 1] *= k; d[i + 2] *= k;
      }
    }
    return fb;
  };

  /* Ordered-dither scatter of a color into a region, probability by fbm --
   * for soot, coal grain, drifting motes. Composited with given alpha. */
  R.ditherScatter = function (fb, x, y, w, h, color, noise, opts) {
    opts = opts || {};
    var scale = opts.scale === undefined ? 0.2 : opts.scale;
    var threshold = opts.threshold === undefined ? 0.62 : opts.threshold;
    var alpha = opts.alpha === undefined ? 0.5 : opts.alpha;
    for (var yy = 0; yy < h; yy++) {
      for (var xx = 0; xx < w; xx++) {
        var n = noise((x + xx) * scale, (y + yy) * scale);
        if (n > threshold) fb.blend(x + xx, y + yy, color[0], color[1], color[2], alpha * (n - threshold) / (1 - threshold));
      }
    }
    return fb;
  };

  AL.render = R;
});
