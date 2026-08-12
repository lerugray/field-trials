/* ALKAHEST -- reagents: the six panels drawn as lit tesserae (no image assets).
 *
 * Colorblind-safe BY CONSTRUCTION (CLAUDE.md rule 5): every reagent reads by
 * three redundant channels -- a beveled COLOR tile, a distinct inner emblem
 * SHAPE, and a distinct GLYPH mark -- so identity survives the loss of any one.
 * Tiles are square (they tessellate the well); the shape lives in the emblem.
 * Material is fbm-textured, lit with a top-left key + inset shadow, never a flat
 * vector fill. States (idle / clearing dissolve) drive brightness + emblem pop.
 */
;(function (root, factory) {
  var AL = root.AL || (root.AL = {});
  factory(AL);
  if (typeof module !== "undefined" && module.exports) module.exports = AL;
})(typeof self !== "undefined" ? self : globalThis, function (AL) {
  var TILE_N = AL.noise2(5150); // shared material grain

  /* emblem membership test: is (dx,dy) inside shape `kind` of radius r? */
  function inEmblem(kind, dx, dy, r) {
    var ax = Math.abs(dx), ay = Math.abs(dy);
    switch (kind) {
      case "square": return ax <= r * 0.82 && ay <= r * 0.82;
      case "circle": return dx * dx + dy * dy <= r * r;
      case "diamond": return ax + ay <= r;
      case "triangle": // pointing up: apex at dy=-r, base at dy=+r
        return dy <= r * 0.85 && dy >= -r && ax <= r * ((dy + r) / (2 * r)) + 0.001;
      case "hexagon": // flat-ish hex
        return ax <= r && (ax * 0.5 + ay) <= r * 0.92;
      case "teardrop": // round bottom, pointed top
        return dy >= 0 ? (dx * dx + dy * dy <= r * r)
          : (ax <= r * (1 - (-dy) / r));
      default: return false;
    }
  }

  /* 5x5 glyph marks (high-contrast ink over the emblem) */
  var GLYPHS = {
    bar: ["00000", "00000", "11111", "00000", "00000"],
    cross: ["00100", "00100", "11111", "00100", "00100"],
    horns: ["10001", "10001", "01110", "00000", "00000"],
    vee: ["10001", "10001", "01010", "01010", "00100"],
    eye: ["00000", "01110", "01010", "01110", "00000"],
    dot: ["00000", "00100", "01110", "00100", "00000"]
  };

  function tint(c, k) {
    return [AL.clamp(c[0] * k, 0, 255), AL.clamp(c[1] * k, 0, 255), AL.clamp(c[2] * k, 0, 255)];
  }

  /* Draw one reagent panel. opts: { state:'idle'|'clearing', flash:0..1 (clear
   * dissolve, 1=full tile .. 0=gone), light:0..1 extra key light } */
  AL.drawReagent = function (fb, px, py, size, reagentId, opts) {
    opts = opts || {};
    var reg = AL.REAGENTS[reagentId];
    if (!reg) return;
    var col = reg.color;
    var flash = opts.flash === undefined ? 1 : opts.flash;         // dissolve amount
    var clearing = opts.state === "clearing";
    var keyLight = opts.light === undefined ? 0 : opts.light;
    var flashScale = AL.flashScale ? AL.flashScale(opts) : 0.65;

    // 1. tile body: textured reagent color, brightened while clearing
    var bodyK = clearing ? 1.04 + (1 - flash) * 0.48 * flashScale : 1;
    AL.render.textureFill(fb, px, py, size, size, tint(col, bodyK), TILE_N,
      { amp: 0.16, scale: 0.28, alpha: 1 });

    // 2. bevel: light top/left key, dark bottom/right, 1px dark separator
    var hi = tint(col, 1.5 + keyLight);
    var lo = tint(col, 0.55);
    fb.hline(px, py, size, hi[0], hi[1], hi[2], 0.8);
    fb.vline(px, py, size, hi[0], hi[1], hi[2], 0.7);
    fb.hline(px, py + size - 1, size, lo[0], lo[1], lo[2], 0.85);
    fb.vline(px + size - 1, py, size, lo[0], lo[1], lo[2], 0.85);
    fb.frame(px, py, size, size, 0, 0, 0, 0.35); // seat the tile against neighbours

    // 3. inner emblem shape (the colorblind-safe silhouette)
    var cx = px + size / 2 - 0.5, cy = py + size / 2 - 0.5;
    var r = size * 0.34;
    var emCol = tint(col, clearing ? 2.0 : 1.7);
    var emShadow = tint(col, 0.4);
    for (var yy = 0; yy < size; yy++) {
      for (var xx = 0; xx < size; xx++) {
        var dx = px + xx - cx, dy = py + yy - cy;
        if (inEmblem(reg.shape, dx, dy, r)) {
          // soft inner shadow at bottom-right of the emblem for form
          var shade = (dx + dy) > r * 0.4 ? emShadow : emCol;
          fb.blend(px + xx, py + yy, shade[0], shade[1], shade[2], 0.92);
        }
      }
    }

    // 4. glyph mark, centered, in dark ink (readable on the bright emblem)
    var g = GLYPHS[reg.glyph];
    if (g && size >= 10) {
      var gx = Math.round(px + size / 2 - 2.5), gy = Math.round(py + size / 2 - 2.5);
      var ink = tint(col, 0.28);
      for (var ry = 0; ry < 5; ry++)
        for (var rx = 0; rx < 5; rx++)
          if (g[ry].charCodeAt(rx) === 49) fb.blend(gx + rx, gy + ry, ink[0], ink[1], ink[2], 0.9);
    }

    // 5. specular pip (glass catch-light) top-left, fades while clearing
    fb.blend(px + 2, py + 2, 255, 255, 255, clearing ? 0.25 : 0.55);

    // 6. dissolve: as flash->0, punch bright vapor so the clear visibly empties
    if (clearing && flash < 1) {
      var amt = 1 - flash;
      for (var hy = 0; hy < size; hy++)
        for (var hx = 0; hx < size; hx++) {
          var n = AL.fbm(TILE_N, (px + hx) * 0.6, (py + hy) * 0.6, 2);
          if (n > flash) {
            // dark glass empties even at zero flash; warm vapor is optional.
            fb.blend(px + hx, py + hy, 8, 8, 10, AL.clamp(amt * 0.72, 0, 0.72));
            fb.blend(px + hx, py + hy, 255, 250, 238,
              AL.clamp(amt * (0.2 + 1.35 * flashScale), 0, 0.86));
          }
        }
      // two rising vapor curls: geometry survives reduced flash intensity.
      var curlA = 0.28 + flashScale * 0.42;
      for (var v = 0; v < Math.max(2, Math.round(amt * size)); v++) {
        var vx = Math.round(px + size * 0.5 + Math.sin(v * 1.6 + reagentId) * (2 + v * 0.12));
        var vy = Math.round(py + size * flash - v * 0.45);
        fb.blend(vx, vy, 220, 226, 218, curlA * amt);
      }
    }
  };

  AL._inEmblem = inEmblem; // exposed for tests
});
