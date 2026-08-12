/* ALKAHEST -- title: the composed title scene (M0 deliverable).
 *
 * The candlelit alchemist's bench at night, composed as ONE picture (not sprite
 * scatter): a dark stone room graded top-to-bottom, fbm stone grain, a slate
 * bench, three lit glass phials holding reagent liquor, a burner flame with a
 * warm additive light rig, a beveled brass title plate carrying the engraved
 * wordmark, the alchemical motto in ink, a blinking prompt, and a vignette to
 * seal the frame. No placeholder art -- this must not look cheap.
 *
 * drawTitle(fb, opts): opts = { act, t (seconds, for flicker/blink), showPrompt }.
 */
;(function (root, factory) {
  var AL = root.AL || (root.AL = {});
  factory(AL);
  if (typeof module !== "undefined" && module.exports) module.exports = AL;
})(typeof self !== "undefined" ? self : globalThis, function (AL) {
  var R = AL.render;

  // shared deterministic noise for stone/material grain
  var STONE_N = AL.noise2(1717);
  var SOOT_N = AL.noise2(2027);

  /* small filled slab. Corners stay square: at native res a 1px chamfer reads
   * as noise, so the burner base is honestly rectangular. */
  function slab(fb, x, y, w, h, r, g, b, a) {
    fb.rect(x, y, w, h, r, g, b, a);
  }

  /* a lit glass phial standing on the bench */
  function phial(fb, x, benchTop, w, h, liquid, pal) {
    var y = benchTop - h;
    // glass body: cool gradient, slightly translucent look
    R.gradientV(fb, x, y, w, h, pal.glass, [
      pal.glass[0] * 0.5, pal.glass[1] * 0.5, pal.glass[2] * 0.5
    ]);
    // reagent liquor in the lower ~55%
    var lh = Math.round(h * 0.55);
    R.gradientV(fb, x + 1, benchTop - lh, w - 2, lh - 1, [
      liquid[0] * 0.7, liquid[1] * 0.7, liquid[2] * 0.7
    ], liquid);
    // meniscus highlight
    fb.hline(x + 1, benchTop - lh, w - 2, liquid[0], liquid[1], liquid[2], 0.9);
    // left rim specular + right shade
    fb.vline(x, y + 1, h - 2, 235, 240, 245, 0.5);
    fb.vline(x + w - 1, y + 1, h - 2, 0, 0, 0, 0.35);
    // a small specular dot near the shoulder
    fb.rect(x + 1, y + 2, 1, 2, 255, 255, 255, 0.6);
    // cork stopper
    fb.rect(x + 1, y - 3, w - 2, 3, pal.brass[0], pal.brass[1], pal.brass[2], 1);
    fb.hline(x + 1, y - 3, w - 2, pal.brassLight[0], pal.brassLight[1], pal.brassLight[2], 1);
  }

  /* a small burner flame (teardrop) -- drawn shape; light added separately */
  function flame(fb, cx, baseY, scale, flick, pal) {
    var h = Math.round(6 * scale);
    for (var i = 0; i < h; i++) {
      var tt = i / h;                 // 0 base .. 1 tip
      var wob = Math.sin((tt * 6) + flick) * 0.6 * (1 - tt);
      var half = Math.max(0, (1 - tt) * 2.2 * scale + wob);
      var yy = baseY - i;
      var core = tt < 0.55;
      var col = core ? pal.flameCore : pal.flame;
      for (var dx = -half; dx <= half; dx++) {
        var edge = Math.abs(dx) / (half + 0.001);
        var a = (1 - edge * edge) * (core ? 1 : 0.85);
        fb.blend(cx + dx, yy, col[0], col[1], col[2], a);
      }
    }
  }

  AL.drawTitle = function (fb, opts) {
    opts = opts || {};
    var pal = AL.palette(opts.act || "nigredo");
    var t = opts.t || 0;
    var W = fb.w, H = fb.h;

    /* 1. room: cool dark stone gradient, warmer toward the bench */
    R.gradientV(fb, 0, 0, W, H, pal.stoneDark, [
      pal.stoneMid[0] * 0.9, pal.stoneMid[1] * 0.85, pal.stoneMid[2] * 0.8
    ]);
    /* 2. stone grain */
    R.textureFill(fb, 0, 0, W, H, pal.stoneMid, STONE_N, { amp: 0.14, scale: 0.05, alpha: 0.35 });
    /* 3. soot drifting in the upper corners */
    R.ditherScatter(fb, 0, 0, W, 70, [0, 0, 0], SOOT_N, { threshold: 0.55, alpha: 0.5, scale: 0.12 });

    /* 4. the bench: a slate slab across the lower frame */
    var benchTop = Math.round(H * 0.72);
    R.textureFill(fb, 0, benchTop, W, H - benchTop, pal.stoneLight, STONE_N, { amp: 0.2, scale: 0.06 });
    R.gradientV(fb, 0, benchTop, W, H - benchTop, [
      pal.stoneLight[0], pal.stoneLight[1], pal.stoneLight[2]
    ], pal.stoneDark);
    // bench front lip: bright brass edge, dark shadow beneath
    fb.hline(0, benchTop, W, pal.brassLight[0], pal.brassLight[1], pal.brassLight[2], 0.9);
    fb.hline(0, benchTop + 1, W, pal.brass[0], pal.brass[1], pal.brass[2], 0.7);
    fb.hline(0, benchTop + 2, W, 0, 0, 0, 0.4);

    /* 5. phials standing on the bench (reagent liquor seeds the register) */
    phial(fb, Math.round(W * 0.20), benchTop, 12, 30, AL.REAGENTS[2].color, pal); // mercury
    phial(fb, Math.round(W * 0.72), benchTop, 10, 24, AL.REAGENTS[3].color, pal); // vitriol
    phial(fb, Math.round(W * 0.80), benchTop, 13, 34, AL.REAGENTS[1].color, pal); // sulfur

    /* 6. burner + flame at bench center-left, with warm light rig */
    var lampX = Math.round(W * 0.44), lampBase = benchTop - 1;
    // brass burner base
    slab(fb, lampX - 5, lampBase - 4, 10, 5, pal.brass[0], pal.brass[1], pal.brass[2], 1);
    fb.hline(lampX - 5, lampBase - 4, 10, pal.brassLight[0], pal.brassLight[1], pal.brassLight[2], 1);
    var flick = t * 9;
    var flVar = 0.85 + 0.15 * Math.sin(t * 11.0) * Math.cos(t * 5.3);
    flame(fb, lampX, lampBase - 4, 1.6, flick, pal);

    /* 7. LIGHT RIG composited over the albedo (warm flame + cool fill) */
    R.lightRig(fb, [
      { x: lampX, y: lampBase - 8, radius: 120, color: [pal.flame[0], pal.flame[1] * 0.8, pal.flame[2] * 0.5], intensity: 0.5 * flVar },
      { x: lampX, y: lampBase - 8, radius: 40, color: pal.flameCore, intensity: 0.55 * flVar },
      { x: Math.round(W * 0.82), y: Math.round(H * 0.30), radius: 90, color: pal.accent, intensity: 0.16 }
    ]);

    /* 8. the brass title plate, beveled, upper third */
    var pw = 190, ph = 46, px = Math.round((W - pw) / 2), py = 34;
    // drop shadow
    fb.rect(px + 3, py + 4, pw, ph, 0, 0, 0, 0.45);
    // plate body textured brass
    R.textureFill(fb, px, py, pw, ph, pal.brass, STONE_N, { amp: 0.12, scale: 0.08 });
    // bevel: light top/left, dark bottom/right
    fb.hline(px, py, pw, pal.brassLight[0], pal.brassLight[1], pal.brassLight[2], 1);
    fb.vline(px, py, ph, pal.brassLight[0], pal.brassLight[1], pal.brassLight[2], 1);
    fb.hline(px, py + ph - 1, pw, 0, 0, 0, 0.5);
    fb.vline(px + pw - 1, py, ph, 0, 0, 0, 0.5);
    // inner engraved channel
    fb.frame(px + 4, py + 4, pw - 8, ph - 8, pal.stoneDark[0], pal.stoneDark[1], pal.stoneDark[2], 0.7);

    /* 9. the wordmark, engraved into the plate */
    AL.drawTextEngravedCentered(fb, "ALKAHEST", py + 13,
      pal.flameCore, pal.stoneDark, { scale: 3, spacing: 2 });

    /* 10. the alchemical motto in ink, beneath the plate */
    AL.drawTextCentered(fb, "SOLVE ET COAGULA", py + ph + 8, pal.ink, { scale: 1, spacing: 1, alpha: 0.85 });

    /* 11. player-facing key/help listing + blinking prompt near the base */
    AL.drawTextCentered(fb, "ARROWS WASD MOVE  SPACE J SWAP  SHIFT K RAISE", H - 42, pal.ink, { scale: 1, alpha: 0.7 });
    AL.drawTextCentered(fb, "ENTER CONFIRM  ESC PAUSE  1-4 BREW  L EXPORT LOG", H - 32, pal.ink, { scale: 1, alpha: 0.7 });
    if (opts.showPrompt !== false) {
      var on = (Math.floor(t * 1.5) % 2) === 0 || opts.t === undefined;
      if (on) {
        AL.drawTextCentered(fb, "PRESS ENTER TO BEGIN", H - 18, pal.brassLight, { scale: 1, spacing: 1, alpha: 0.95 });
      }
    }

    /* 12. seal the picture */
    R.vignette(fb, 0.55);
    return fb;
  };
});
