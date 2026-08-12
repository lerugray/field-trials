/* ALKAHEST -- M4 bench: reusable room albedo, practical lights, and PoC scene.
 * Every gameplay surface sits in this one composed picture. Materials are
 * deterministic code: fbm stone/paper, beveled brass, lit glass, soot and wax. */
;(function (root, factory) {
  var AL = root.AL || (root.AL = {});
  factory(AL);
  if (typeof module !== "undefined" && module.exports) module.exports = AL;
})(typeof self !== "undefined" ? self : globalThis, function (AL) {
  var R = AL.render;
  var STONE = AL.noise2(1717), SOOT = AL.noise2(2027), PAPER = AL.noise2(4404);

  function tint(c, k) {
    return [AL.clamp(c[0] * k, 0, 255), AL.clamp(c[1] * k, 0, 255), AL.clamp(c[2] * k, 0, 255)];
  }

  function mortar(fb, pal) {
    for (var y = 25; y < 190; y += 28)
      fb.hline(0, y, fb.w, pal.stoneDark[0], pal.stoneDark[1], pal.stoneDark[2], 0.42);
    for (var row = 0, yy = 0; yy < 190; row++, yy += 28) {
      var off = row % 2 ? 31 : 4;
      for (var x = off; x < fb.w; x += 62)
        fb.vline(x, yy, Math.min(28, 190 - yy), pal.stoneDark[0], pal.stoneDark[1], pal.stoneDark[2], 0.28);
    }
  }

  function brassRail(fb, x, y, w, pal) {
    fb.rect(x, y, w, 4, pal.brass[0], pal.brass[1], pal.brass[2], 0.9);
    fb.hline(x, y, w, pal.brassLight[0], pal.brassLight[1], pal.brassLight[2], 0.9);
    fb.hline(x, y + 3, w, 0, 0, 0, 0.45);
    for (var k = x + 8; k < x + w; k += 30) fb.rect(k, y + 1, 1, 1, pal.flameCore[0], pal.flameCore[1], pal.flameCore[2], 0.6);
  }

  function phial(fb, x, base, w, h, liquid, pal) {
    var y = base - h;
    R.gradientV(fb, x, y, w, h, tint(pal.glass, 0.75), tint(pal.glass, 0.28));
    var lh = Math.max(3, Math.round(h * 0.48));
    R.gradientV(fb, x + 1, base - lh, w - 2, lh - 1, tint(liquid, 0.55), tint(liquid, 0.9));
    fb.hline(x + 1, base - lh, w - 2, liquid[0], liquid[1], liquid[2], 0.72);
    fb.vline(x, y + 1, h - 2, 244, 246, 238, 0.42);
    fb.vline(x + w - 1, y + 1, h - 2, 0, 0, 0, 0.52);
    fb.rect(x + 1, y + 2, 1, Math.max(1, h >> 3), 255, 255, 255, 0.58);
    fb.rect(x + 1, y - 3, w - 2, 3, pal.brass[0], pal.brass[1], pal.brass[2], 1);
    fb.hline(x + 1, y - 3, w - 2, pal.brassLight[0], pal.brassLight[1], pal.brassLight[2], 0.9);
  }

  function flame(fb, cx, base, t, pal) {
    var flick = Math.sin(t * 7.1) * 0.55;
    for (var i = 0; i < 9; i++) {
      var u = i / 9, half = Math.max(0.3, (1 - u) * 3 + Math.sin(i + t * 5) * 0.35);
      var col = i < 5 ? pal.flameCore : pal.flame;
      for (var dx = -half; dx <= half; dx++)
        fb.blend(cx + dx + flick * u, base - i, col[0], col[1], col[2], (1 - Math.abs(dx) / (half + 0.5)) * 0.9);
    }
  }

  function burner(fb, x, base, t, pal) {
    fb.rect(x - 6, base - 5, 12, 5, pal.brass[0], pal.brass[1], pal.brass[2], 1);
    fb.hline(x - 6, base - 5, 12, pal.brassLight[0], pal.brassLight[1], pal.brassLight[2], 0.9);
    fb.rect(x - 3, base - 8, 6, 3, tint(pal.brass, 0.55)[0], tint(pal.brass, 0.55)[1], tint(pal.brass, 0.55)[2], 1);
    flame(fb, x, base - 9, t, pal);
  }

  function actProps(fb, act, pal) {
    if (act === "nigredo") {
      R.ditherScatter(fb, 0, 0, fb.w, 78, [0, 0, 0], SOOT, { threshold: 0.56, alpha: 0.5, scale: 0.12 });
      fb.rect(345, 182, 27, 7, 10, 10, 12, 0.85);
      for (var n = 0; n < 4; n++) fb.rect(349 + n * 5, 180 - (n % 2), 4, 3, 48, 36, 28, 0.9);
    } else if (act === "albedo") {
      fb.rect(8, 175, 30, 14, 166, 160, 142, 0.36);
      fb.frame(8, 175, 30, 14, 230, 226, 210, 0.45);
      for (var l = 0; l < 3; l++) fb.hline(12, 179 + l * 3, 20, 186, 182, 170, 0.42);
    } else if (act === "citrinitas") {
      fb.rect(346, 169, 12, 20, 190, 126, 42, 0.76);
      fb.hline(347, 170, 10, 246, 206, 104, 0.8);
      fb.rect(350, 164, 4, 5, 236, 190, 76, 0.9);
    } else if (act === "rubedo") {
      fb.rect(340, 180, 35, 9, 28, 8, 8, 0.9);
      for (var c = 0; c < 6; c++) {
        var x = 343 + c * 5, hot = c % 2 ? [218, 64, 28] : [132, 30, 20];
        fb.rect(x, 179 - (c % 3), 4, 4, hot[0], hot[1], hot[2], 0.78);
      }
    }
  }

  AL.drawBenchRoom = function (fb, pal, opts) {
    opts = opts || {};
    var act = opts.act || "nigredo", t = opts.time || 0;
    R.gradientV(fb, 0, 0, fb.w, fb.h, tint(pal.stoneDark, 0.72), tint(pal.stoneMid, 0.88));
    R.textureFill(fb, 0, 0, fb.w, fb.h, pal.stoneMid, STONE, { amp: 0.17, scale: 0.045, alpha: 0.34 });
    mortar(fb, pal);
    brassRail(fb, 0, 27, fb.w, pal);

    var benchY = 190;
    R.textureFill(fb, 0, benchY, fb.w, fb.h - benchY, pal.stoneLight, STONE, { amp: 0.23, scale: 0.07 });
    R.gradientV(fb, 0, benchY, fb.w, fb.h - benchY, tint(pal.stoneLight, 1.04), tint(pal.stoneDark, 0.7));
    fb.hline(0, benchY, fb.w, pal.brassLight[0], pal.brassLight[1], pal.brassLight[2], 0.72);
    fb.hline(0, benchY + 2, fb.w, 0, 0, 0, 0.55);

    phial(fb, 17, benchY, 9, 24, AL.REAGENTS[2].color, pal);
    phial(fb, 30, benchY, 11, 31, AL.REAGENTS[3].color, pal);
    phial(fb, fb.w - 41, benchY, 10, 27, AL.REAGENTS[1].color, pal);
    phial(fb, fb.w - 27, benchY, 9, 22, AL.REAGENTS[5].color, pal);
    burner(fb, 48, benchY, t, pal);
    actProps(fb, act, pal);

    var flick = 0.88 + Math.sin(t * 4.7) * 0.04;
    R.lightRig(fb, [
      { x: 48, y: benchY - 18, radius: 94, color: tint(pal.flame, 0.72), intensity: 0.24 * flick },
      { x: 48, y: benchY - 18, radius: 30, color: pal.flameCore, intensity: 0.26 * flick },
      { x: fb.w - 30, y: 62, radius: 90, color: pal.accent, intensity: 0.08 }
    ]);
    return fb;
  };

  /* Dedicated pre-pass verdict frame: it proves the shared material and light
   * language before gameplay surfaces consume it. */
  AL.drawBenchPoc = function (fb, opts) {
    opts = opts || {};
    var act = opts.act || "nigredo", pal = AL.palette(act), t = opts.time || 0;
    AL.drawBenchRoom(fb, pal, { act: act, time: t });
    var x = 105, y = 46, w = 174, h = 117;
    fb.rect(x + 4, y + 5, w, h, 0, 0, 0, 0.5);
    R.textureFill(fb, x, y, w, h, tint(pal.stoneDark, 0.72), STONE, { amp: 0.25, scale: 0.09 });
    for (var i = 0; i < 4; i++) fb.frame(x - i, y - i, w + i * 2, h + i * 2,
      pal.brass[i ? 0 : 0], pal.brass[i ? 1 : 1], pal.brass[i ? 2 : 2], 0.88 - i * 0.13);
    fb.hline(x, y, w, pal.brassLight[0], pal.brassLight[1], pal.brassLight[2], 0.95);
    for (var q = 0; q < 4; q++) fb.rect(x + 7 + q * 52, y + 7, 2, 2, pal.flameCore[0], pal.flameCore[1], pal.flameCore[2], 0.72);

    var px = 127, py = 68, pw = 130, ph = 76;
    R.textureFill(fb, px, py, pw, ph, [142, 124, 88], PAPER, { amp: 0.13, scale: 0.08 });
    fb.frame(px, py, pw, ph, 70, 46, 24, 0.68);
    fb.vline(px + 64, py + 4, ph - 8, 88, 58, 30, 0.34);
    for (var ln = 0; ln < 5; ln++) {
      fb.hline(px + 10, py + 31 + ln * 8, 43, pal.ink[0], pal.ink[1], pal.ink[2], 0.48);
      fb.hline(px + 76, py + 31 + ln * 8, 43, pal.ink[0], pal.ink[1], pal.ink[2], 0.48);
    }
    AL.drawTextEngravedCentered(fb, "THE BENCH", py + 9, pal.brassLight, pal.stoneDark, { scale: 2, spacing: 2 });
    AL.drawTextCentered(fb, pal.name.toUpperCase(), py + 53, pal.ink, { scale: 1, spacing: 1 });
    R.glow(fb, fb.w / 2, 110, 92, pal.flame, 0.08 * AL.flashScale(opts));
    R.vignette(fb, 0.52);
    return fb;
  };
});
