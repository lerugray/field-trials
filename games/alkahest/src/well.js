/* ALKAHEST -- well: render the live machine as a lit alchemist's vat.
 *
 * Composes the play scene as one picture (graphics bar): a candlelit bench with
 * a recessed brass-framed well holding the 6-wide stack. Every game-critical
 * action has a VISIBLE representation the moment its mechanic works (rule 4):
 * the rising stack, the 1x2 cursor, dissolving clears (reagent dissolve state),
 * chain/combo blooms + a distinct readout, near-death danger, and the ruined-run
 * state. Reads machine + cursor; never mutates them.
 */
;(function (root, factory) {
  var AL = root.AL || (root.AL = {});
  factory(AL);
  if (typeof module !== "undefined" && module.exports) module.exports = AL;
})(typeof self !== "undefined" ? self : globalThis, function (AL) {
  var CELL = 16;
  var VISROWS = 12;
  var R = AL.render;
  var STONE_N = AL.noise2(1717);

  function layoutAt(cols, wellX, wellY) {
    var wellW = cols * CELL, wellH = VISROWS * CELL;
    return { cols: cols, wellW: wellW, wellH: wellH, wellX: wellX, wellY: wellY, floorY: wellY + wellH };
  }
  function layout(machine) {
    var cols = machine.grid.cols;
    var wellW = cols * CELL;
    return layoutAt(cols, Math.round((AL.W - wellW) / 2), 14);
  }
  AL.WELL = { CELL: CELL, VISROWS: VISROWS, layout: layout, layoutAt: layoutAt };

  /* screen y of the top edge of grid row y, including the smooth rise offset */
  function cellTop(L, machine, y) {
    return L.floorY - (y + 1) * CELL - Math.round(machine.riseOffset * CELL);
  }

  /* draw the bench room background (once per scene) */
  function drawBench(fb, pal, act, t) {
    if (AL.drawBenchRoom) return AL.drawBenchRoom(fb, pal, { act: act, time: t });
    R.gradientV(fb, 0, 0, AL.W, AL.H, pal.stoneDark, [pal.stoneMid[0] * 0.9, pal.stoneMid[1] * 0.85, pal.stoneMid[2] * 0.8]);
    return R.textureFill(fb, 0, 0, AL.W, AL.H, pal.stoneMid, STONE_N, { amp: 0.12, scale: 0.05, alpha: 0.3 });
  }

  /* draw ONE well's contents into a given layout: recess, the live stack, the
   * overflow mask, an optional cursor, the chain/combo bloom, the brass frame,
   * and the near-death danger frame. Scene-global light/vignette are the
   * caller's job so multiple wells can share one composed picture. */
  function drawWellPanel(fb, machine, L, pal, t, opts) {
    opts = opts || {};
    var g = machine.grid;
    var flashScale = AL.flashScale ? AL.flashScale(opts) : 0.65;

    /* well recess (dark interior) */
    R.textureFill(fb, L.wellX, L.wellY, L.wellW, L.wellH, [pal.stoneDark[0] * 0.7, pal.stoneDark[1] * 0.7, pal.stoneDark[2] * 0.8], STONE_N, { amp: 0.25, scale: 0.12 });
    for (var c = 1; c < L.cols; c++) fb.vline(L.wellX + c * CELL, L.wellY, L.wellH, 0, 0, 0, 0.18);

    /* panels, clipped to the well interior */
    var clearing = machine.clearing;
    var flash = clearing ? AL.clamp(clearing.timer / machine.cfg.clearDuration, 0, 1) : 1;
    for (var y = 0; y <= VISROWS + 1; y++) {
      var sy = cellTop(L, machine, y);
      if (sy + CELL <= L.wellY || sy >= L.floorY) continue;
      for (var x = 0; x < L.cols; x++) {
        var cell = g.cells[y] && g.cells[y][x];
        if (!cell || cell.dross) {
          if (cell && cell.dross) drawDross(fb, L.wellX + x * CELL, sy, pal);
          continue;
        }
        var st = cell.st === "clearing" ? { state: "clearing", flash: flash, light: 0.05, flashIntensity: flashScale } : { light: 0.05 };
        AL.drawReagent(fb, L.wellX + x * CELL, sy, CELL, cell.t, st);
      }
    }

    /* mask overflow above the well opening */
    R.gradientV(fb, L.wellX - 4, 0, L.wellW + 8, L.wellY, pal.stoneDark, pal.stoneMid);
    R.textureFill(fb, L.wellX - 4, 0, L.wellW + 8, L.wellY, pal.stoneMid, STONE_N, { amp: 0.12, scale: 0.06, alpha: 0.4 });

    if (opts.cursor && machine.state !== "lost") drawCursor(fb, L, machine, opts.cursor, t, pal);

    /* chain/combo fire bloom (light as compositing, bounded) */
    if (machine.lastEvent && opts.allowChainBloom !== false) {
      var age = t - machine.lastEvent.t;
      if (age >= 0 && age < 0.5) {
        var k = 1 - age / 0.5;
        var big = machine.lastEvent.chain >= 2 || machine.lastEvent.combo >= 4;
        var ecx = L.wellX + L.wellW / 2, ecy = L.floorY - L.wellH * 0.4;
        R.glow(fb, ecx, ecy, 52 + machine.lastEvent.combo * 3,
          pal.flame, (big ? 0.42 : 0.22) * k * flashScale);
        R.glow(fb, ecx, ecy, 20, pal.flameCore, 0.34 * k * flashScale);
        if (machine.lastEvent.combo >= 4) {
          var rr = 12 + age * 54;
          R.ring(fb, ecx, ecy, rr, pal.accent, (0.18 + 0.42 * flashScale) * k, 1);
        }
        if (machine.lastEvent.chain >= 2) {
          var sparks = Math.min(7, machine.lastEvent.chain + 2);
          for (var sp = 0; sp < sparks; sp++) {
            var sx = Math.round(ecx + (sp - sparks / 2) * 7 + Math.sin(sp * 4.1) * 3);
            var sy = Math.round(ecy + 12 - age * (32 + sp * 3));
            fb.rect(sx, sy, 2, 2, pal.flameCore[0], pal.flameCore[1], pal.flameCore[2], (0.3 + 0.6 * flashScale) * k);
          }
        }
      }
    }

    drawDrossVfx(fb, L, machine, pal, t, flashScale);
    drawFormulaVfx(fb, L, machine, pal, t, flashScale);

    drawBrassFrame(fb, L, pal, machine, t);
    if (machine.danger && machine.state !== "lost") drawDanger(fb, L, machine, pal, t);
  }
  AL.drawWellPanel = drawWellPanel;

  /* action-legibility for the run-layer mechanics (rule 4): a sublimated panel
   * sparks where it vanished, a burned dross row flashes an ember line, and an
   * active cast pulses the well. All bounded, no full-screen strobe. */
  function drawFormulaVfx(fb, L, machine, pal, t, flashScale) {
    var s = machine.lastSublimate;
    if (s && t - s.t < 0.4) {
      var p = s.key.split(","), sx = L.wellX + (+p[0]) * CELL + CELL / 2, sy = cellTop(L, machine, +p[1]) + CELL / 2;
      if (sy > L.wellY && sy < L.floorY) {
        var ks = 1 - (t - s.t) / 0.4;
        R.glow(fb, sx, sy, 14, pal.flameCore, 0.5 * ks * flashScale);
      }
    }
    var b = machine.lastBurn;
    if (b && t - b.t < 0.5) {
      var kb = 1 - (t - b.t) / 0.5;
      // ember line low in the well where dross burned away
      fb.hline(L.wellX, L.floorY - CELL, L.wellW, pal.accent[0], pal.accent[1], pal.accent[2], 0.6 * kb);
      R.glow(fb, L.wellX + L.wellW / 2, L.floorY - CELL, 40, pal.flame, 0.28 * kb * flashScale);
    }
    var c = machine.lastCast;
    if (c && t - c.t < 0.4) {
      var kc = 1 - (t - c.t) / 0.4;
      R.glow(fb, L.wellX + L.wellW / 2, L.floorY - L.wellH * 0.5, 70, pal.glass, 0.3 * kc * flashScale);
    }
  }

  /* Dross has three distinct verbs: queued chips hover above the opening;
   * crush throws dust downward; transmute runs a bright seam under the slab. */
  function drawDrossVfx(fb, L, machine, pal, t, flashScale) {
    var c = machine.lastCrush;
    if (c && t - c.t >= 0 && t - c.t < 0.6) {
      var age = (t - c.t) / 0.6, x0 = L.wellX + c.x0 * CELL, w = c.width * CELL;
      for (var i = 0; i < Math.min(12, c.width * 3); i++) {
        var dx = (i * 17) % Math.max(1, w), dy = Math.round(L.wellY + age * (28 + (i % 4) * 9));
        var a = (1 - age) * (0.28 + flashScale * 0.35);
        fb.rect(x0 + dx, dy, i % 3 === 0 ? 2 : 1, 2, pal.stoneLight[0], pal.stoneLight[1], pal.stoneLight[2], a);
      }
      fb.hline(x0, L.wellY + Math.round(age * 18), w, pal.brassLight[0], pal.brassLight[1], pal.brassLight[2], (1 - age) * 0.35);
    }
    var tr = machine.lastTransmute;
    if (tr && t - tr.t >= 0 && t - tr.t < 0.65) {
      var kt = 1 - (t - tr.t) / 0.65, seamW = Math.min(L.wellW, Math.max(CELL, tr.count * CELL));
      var seamX = L.wellX + Math.round((L.wellW - seamW) / 2), seamY = L.floorY - CELL;
      fb.hline(seamX, seamY, seamW, pal.flameCore[0], pal.flameCore[1], pal.flameCore[2], 0.45 + 0.35 * flashScale * kt);
      for (var s = 0; s < tr.count; s++) fb.rect(seamX + s * CELL + 7, seamY - Math.round(kt * 8), 2, 3,
        pal.glass[0], pal.glass[1], pal.glass[2], 0.35 + 0.35 * flashScale);
    }
  }

  AL.drawWell = function (fb, machine, opts) {
    opts = opts || {};
    var pal = AL.palette(opts.act || "nigredo");
    var t = opts.time || 0;
    var L = layout(machine);

    drawBench(fb, pal, opts.act || "nigredo", t);
    drawWellPanel(fb, machine, L, pal, t, { cursor: opts.cursor, flashIntensity: opts.flashIntensity });
    drawHud(fb, L, machine, pal, t);
    if (machine.state === "lost") drawRuined(fb, pal, t);

    /* warm key light + seal */
    R.glow(fb, L.wellX + L.wellW / 2, L.floorY + 6, 150, [pal.flame[0], pal.flame[1] * 0.8, pal.flame[2] * 0.5], 0.14);
    R.vignette(fb, 0.5);
    return fb;
  };

  function drawDross(fb, x, y, pal) {
    // dull matte slag, heavy: dark textured block, no emblem
    R.textureFill(fb, x, y, CELL, CELL, [pal.stoneLight[0] * 0.6, pal.stoneLight[1] * 0.55, pal.stoneLight[2] * 0.5], STONE_N, { amp: 0.28, scale: 0.3 });
    fb.frame(x, y, CELL, CELL, 0, 0, 0, 0.5);
    fb.hline(x, y, CELL, pal.brass[0] * 0.6, pal.brass[1] * 0.6, pal.brass[2] * 0.6, 0.4);
    // irregular cooled-slag facets keep it matte and materially distinct.
    fb.hline(x + 3, y + 5, 6, 0, 0, 0, 0.28);
    fb.vline(x + 9, y + 5, 5, 0, 0, 0, 0.24);
    fb.hline(x + 8, y + 10, 5, pal.stoneLight[0], pal.stoneLight[1], pal.stoneLight[2], 0.16);
  }

  function drawCursor(fb, L, machine, cur, t, pal) {
    var sy = cellTop(L, machine, cur.y);
    var sx = L.wellX + cur.x * CELL;
    var pulse = 0.6 + 0.4 * Math.sin(t * 8);
    var col = pal.brassLight;
    // 1x2 bracket: corners + edges
    var w = CELL * 2, h = CELL;
    fb.frame(sx - 1, sy - 1, w + 2, h + 2, col[0], col[1], col[2], pulse);
    fb.frame(sx, sy, w, h, col[0], col[1], col[2], pulse * 0.5);
    // corner ticks
    [[sx - 1, sy - 1], [sx + w, sy - 1], [sx - 1, sy + h], [sx + w, sy + h]].forEach(function (p) {
      fb.rect(p[0] - 1, p[1] - 1, 3, 3, pal.flameCore[0], pal.flameCore[1], pal.flameCore[2], pulse);
    });
  }

  function drawBrassFrame(fb, L, pal, machine, t) {
    var x = L.wellX - 4, y = L.wellY - 4, w = L.wellW + 8, h = L.wellH + 8;
    // engraved brass rails
    for (var i = 0; i < 4; i++) {
      var a = i === 0 ? 1 : 0.6 - i * 0.1;
      fb.frame(x - i, y - i, w + i * 2, h + i * 2, pal.brass[0], pal.brass[1], pal.brass[2], a);
    }
    fb.hline(x, y, w, pal.brassLight[0], pal.brassLight[1], pal.brassLight[2], 0.9); // top bevel
    fb.hline(x, y + h - 1, w, 0, 0, 0, 0.5);
    // rivets and patina: small enough not to steal playfield contrast.
    [[x + 3, y + 3], [x + w - 4, y + 3], [x + 3, y + h - 4], [x + w - 4, y + h - 4]].forEach(function (p) {
      fb.rect(p[0], p[1], 2, 2, pal.brassLight[0], pal.brassLight[1], pal.brassLight[2], 0.65);
    });
    // danger-line marker near the top of the well
    var dl = L.floorY - (machine.cfg.warnRow) * CELL;
    fb.hline(L.wellX, dl, L.wellW, pal.accent[0], pal.accent[1], pal.accent[2], 0.35 + 0.2 * Math.sin(t * 4));
  }

  function drawHud(fb, L, machine, pal, t) {
    // left rail: height + rows risen
    var h = machine.grid.stackHeight();
    AL.drawText(fb, "STACK", 8, 20, pal.ink, { scale: 1, alpha: 0.7 });
    AL.drawText(fb, String(h).padStart(2, "0"), 8, 30, pal.brassLight, { scale: 2 });
    AL.drawText(fb, "ROWS", 8, 52, pal.ink, { scale: 1, alpha: 0.7 });
    AL.drawText(fb, String(machine.stats.rowsRisen), 8, 62, pal.ink, { scale: 1 });

    // right rail: the chain/combo readout, distinct vocabularies (rule: chain !=
    // combo). Chain = warm gold, "CHAIN xN". Combo = cool accent, "COMBO N".
    var ev = machine.lastEvent;
    if (ev && t - ev.t < 1.1) {
      var k = AL.clamp(1 - (t - ev.t) / 1.1, 0, 1);
      var rx = AL.W - 74;
      if (ev.chain >= 2) {
        AL.drawTextEngraved(fb, "CHAIN", rx, 40, pal.flameCore, pal.stoneDark, { scale: 1 });
        AL.drawTextEngraved(fb, "x" + ev.chain, rx, 50, pal.flame, pal.stoneDark, { scale: 2 });
      }
      if (ev.combo >= 4) {
        AL.drawTextEngraved(fb, "COMBO", rx, 72, pal.accent, pal.stoneDark, { scale: 1 });
        AL.drawTextEngraved(fb, String(ev.combo), rx, 82, pal.glass, pal.stoneDark, { scale: 2 });
      }
      // fade marker
      fb.rect(rx, 38, 2, 2, pal.flameCore[0], pal.flameCore[1], pal.flameCore[2], k);
    }
    AL.drawText(fb, "CLEARS", AL.W - 74, 20, pal.ink, { scale: 1, alpha: 0.7 });
    AL.drawText(fb, String(machine.stats.clears), AL.W - 74, 30, pal.ink, { scale: 1 });
  }

  function drawDanger(fb, L, machine, pal, t) {
    var pulse = 0.4 + 0.35 * Math.sin(t * 12);
    // pulsing red rails, not a full-screen strobe (photosensitivity)
    fb.frame(L.wellX - 5, L.wellY - 5, L.wellW + 10, L.wellH + 10, 220, 60, 40, pulse);
    // DYING-COLUMN FLAG (STUDY-machine §9): mark the exact columns cresting the
    // warning height so the player sees WHICH column is about to top out.
    var warn = machine.cfg.warnRow;
    for (var x = 0; x < L.cols; x++) {
      if (machine.grid.columnHeight(x) >= warn) {
        var mx = L.wellX + x * CELL;
        fb.rect(mx + 1, L.wellY - 4, CELL - 2, 3, 240, 70, 50, pulse);      // crest bar
        // a small downward chevron warning over the dying column
        for (var d = 0; d < 3; d++) fb.rect(mx + CELL / 2 - 2 + d, L.wellY - 8 + d, 4 - 2 * d + 1, 1, 255, 200, 120, pulse);
      }
    }
    if (machine.state === "grace") {
      AL.drawTextEngravedCentered(fb, "TOP OUT", L.wellY + 4, [255, 200, 160], [80, 10, 10], { scale: 2, spacing: 2 });
    }
  }

  function drawRuined(fb, pal, t, title, prompt) {
    title = title || "THE WORK IS RUINED";
    prompt = prompt || "PRESS ENTER TO BEGIN ANEW";
    fb.rect(0, 0, AL.W, AL.H, 30, 4, 6, 0.62);
    AL.drawTextEngravedCentered(fb, title, AL.H / 2 - 12, [230, 120, 90], [40, 4, 4], { scale: 2, spacing: 2 });
    var on = Math.floor(t * 1.5) % 2 === 0;
    if (on) AL.drawTextCentered(fb, prompt, AL.H / 2 + 8, [200, 170, 150], { scale: 1 });
  }

  /* text centered horizontally on an arbitrary x (not the whole screen) */
  function textAtCenter(fb, str, cx, y, color, opts) {
    opts = opts || {};
    var w = AL.textWidth(String(str), opts.scale || 1, opts.spacing === undefined ? 1 : opts.spacing);
    AL.drawText(fb, str, Math.round(cx - w / 2), y, color, opts);
  }

  /* incoming-dross telegraph in the top strip over the receiving well: the word
   * plus a row of slag chips scaled to volume (action-legibility: dross arrival
   * is visible before it lands). */
  function drawIncoming(fb, L, machine, pal, t) {
    var q = machine.drossQueue;
    if (!q || !q.length) return;
    var cells = 0;
    for (var i = 0; i < q.length; i++) cells += q[i].width * q[i].height;
    var pulse = 0.5 + 0.35 * Math.sin(t * 9);
    var cx = L.wellX + L.wellW / 2;
    textAtCenter(fb, "INCOMING", cx, 1, pal.accent, { scale: 1 });
    var n = Math.min(6, Math.max(1, Math.round(cells / 2)));
    var chipW = 6, tot = n * (chipW + 1), x0 = Math.round(cx - tot / 2);
    for (var k = 0; k < n; k++) {
      var cxk = x0 + k * (chipW + 1);
      fb.rect(cxk, 8, chipW, 4, pal.stoneLight[0] * 0.7, pal.stoneLight[1] * 0.6, pal.stoneLight[2] * 0.55, pulse);
      fb.frame(cxk, 8, chipW, 4, pal.accent[0], pal.accent[1], pal.accent[2], pulse * 0.8);
    }
  }

  /* bottom-strip readout for a well: its label + stack height (H##) */
  function drawDuelStat(fb, L, machine, label, color, pal) {
    var h = machine.grid.stackHeight();
    textAtCenter(fb, label + " H" + String(h).padStart(2, "0"), L.wellX + L.wellW / 2, L.floorY + 2, color, { scale: 1 });
  }

  /* the chain/combo readout for a side, placed in the center gutter (the only
   * roomy strip); chain and combo keep DISTINCT vocabularies + colors. */
  function drawEventReadout(fb, cx, y, machine, t, pal) {
    var ev = machine.lastEvent;
    if (!ev || t - ev.t >= 1.1) return;
    var k = AL.clamp(1 - (t - ev.t) / 1.1, 0, 1);
    if (ev.chain >= 2) {
      AL.drawTextEngraved(fb, "CHAIN x" + ev.chain, Math.round(cx - AL.textWidth("CHAIN x" + ev.chain, 1, 1) / 2), y, pal.flame, pal.stoneDark, { scale: 1 });
      fb.rect(Math.round(cx) - 1, y - 3, 2, 2, pal.flameCore[0], pal.flameCore[1], pal.flameCore[2], k);
    } else if (ev.combo >= 4) {
      AL.drawTextEngraved(fb, "COMBO " + ev.combo, Math.round(cx - AL.textWidth("COMBO " + ev.combo, 1, 1) / 2), y, pal.glass, pal.stoneDark, { scale: 1 });
    }
  }

  /* ---- the duel: two lit wells in one composed picture (STUDY-duel §6) ---- */
  AL.drawDuel = function (fb, duel, opts) {
    opts = opts || {};
    var pal = AL.palette(opts.act || "nigredo");
    var t = opts.time || 0;
    var pW = 6 * CELL, wy = 14;
    var Lp = layoutAt(6, 52, wy);              // widened margins leave room for the
    var Lr = layoutAt(6, AL.W - 52 - pW, wy);  // athanor gauges + the active-brew bar

    drawBench(fb, pal, opts.act || "nigredo", t);
    var blooms = AL.chainBloomIndices ? AL.chainBloomIndices([duel.player, duel.rival], t) : [0, 1];
    drawWellPanel(fb, duel.player, Lp, pal, t, { cursor: opts.cursor, allowChainBloom: blooms.indexOf(0) >= 0, flashIntensity: opts.flashIntensity });
    drawWellPanel(fb, duel.rival, Lr, pal, t, { allowChainBloom: blooms.indexOf(1) >= 0, flashIntensity: opts.flashIntensity });

    drawDuelStat(fb, Lp, duel.player, "YOU", pal.brassLight, pal);
    drawDuelStat(fb, Lr, duel.rival, "RIVAL", pal.accent, pal);
    drawIncoming(fb, Lp, duel.player, pal, t);
    drawIncoming(fb, Lr, duel.rival, pal, t);

    // athanor gauges flank the center gutter (player left of it, rival right);
    // the player's keyed active brews sit in the left margin below the banner
    AL.drawAthanor(fb, Lp.wellX + Lp.wellW + 3, wy + 26, 6, Lp.wellH - 40, duel.player, pal, t);
    AL.drawAthanor(fb, Lr.wellX - 9, wy + 26, 6, Lr.wellH - 40, duel.rival, pal, t);
    var castHint = opts.run && opts.run.firstActiveDraft && !duel.player.lastCast;
    AL.drawActiveBar(fb, duel.player, 6, wy + 22, pal, t, castHint);
    if (opts.run) AL.drawRunBanner(fb, opts.run, pal, t);

    // center column: VS glyph, act name, and each side's chain/combo readout
    var cx = (Lp.wellX + Lp.wellW + Lr.wellX) / 2;
    R.glow(fb, cx, AL.H / 2, 30, pal.flame, 0.12);
    AL.drawTextEngraved(fb, "VS", Math.round(cx - AL.textWidth("VS", 2, 2) / 2), AL.H / 2 - 12, pal.flameCore, pal.stoneDark, { scale: 2, spacing: 2 });
    textAtCenter(fb, (opts.act || "NIGREDO").toUpperCase(), cx, AL.H / 2 + 6, pal.ink, { scale: 1 });
    drawEventReadout(fb, cx, AL.H / 2 + 22, duel.player, t, pal);   // your offense
    drawEventReadout(fb, cx, AL.H / 2 + 34, duel.rival, t, pal);    // rival offense

    // warm key light + seal (once, over the whole picture)
    R.glow(fb, cx, AL.H - 6, 200, [pal.flame[0], pal.flame[1] * 0.8, pal.flame[2] * 0.5], 0.12);
    R.vignette(fb, 0.5);

    if (duel.state !== "fight") drawBoutEnd(fb, duel, pal, t);
    return fb;
  };

  /* ---- the tutorialette: a single planted well + an instruction card ---- */
  AL.drawTutorial = function (fb, tut, opts) {
    opts = opts || {};
    var pal = AL.palette(opts.act || "nigredo");
    var t = opts.time || 0;
    var pW = 6 * CELL;
    var L = layoutAt(6, AL.W - pW - 22, 14); // well on the right

    drawBench(fb, pal, opts.act || "nigredo", t);
    drawWellPanel(fb, tut.m, L, pal, t, { cursor: opts.cursor, flashIntensity: opts.flashIntensity });

    // A completed tutorial has no active step. Keep every step read inside this
    // live-lesson branch so natural completion is a first-class render state.
    if (!tut.complete) {
      // instruction card on the left
      var s = tut.step();
      var px = 12, py = 40, pw = L.wellX - px - 12;
      fb.rect(px - 4, py - 14, pw + 8, 118, pal.stoneDark[0], pal.stoneDark[1], pal.stoneDark[2], 0.55);
      fb.frame(px - 4, py - 14, pw + 8, 118, pal.brass[0], pal.brass[1], pal.brass[2], 0.7);
      fb.hline(px - 4, py - 14, pw + 8, pal.brassLight[0], pal.brassLight[1], pal.brassLight[2], 0.8);

      var prog = tut.progress();
      AL.drawText(fb, "LESSON " + (prog.index + 1) + " OF " + prog.total, px, py - 10, pal.ink, { scale: 1, alpha: 0.75 });
      AL.drawTextEngraved(fb, s.id, px, py, pal.flameCore, pal.stoneDark, { scale: 2, spacing: 1 });
      for (var i = 0; i < s.hint.length; i++)
        AL.drawText(fb, s.hint[i], px, py + 22 + i * 10, pal.glass, { scale: 1 });

      // progress pips
      for (var p = 0; p < prog.total; p++) {
        var on = p <= prog.index;
        var cxp = px + p * 10;
        fb.rect(cxp, py + 62, 6, 3, on ? pal.flame[0] : pal.stoneLight[0], on ? pal.flame[1] : pal.stoneLight[1], on ? pal.flame[2] : pal.stoneLight[2], on ? 0.95 : 0.4);
      }

      // step-complete tick + skip prompt
      if (tut.stepDone())
        AL.drawTextEngraved(fb, "WELL DONE", px, py + 74, [180, 230, 160], pal.stoneDark, { scale: 1, spacing: 1 });
      var blink = Math.floor(t * 1.5) % 2 === 0;
      if (blink) AL.drawText(fb, "ESC TO SKIP", px, py + 90, pal.ink, { scale: 1, alpha: 0.7 });
    }

    R.glow(fb, L.wellX + L.wellW / 2, L.floorY + 6, 140, [pal.flame[0], pal.flame[1] * 0.8, pal.flame[2] * 0.5], 0.13);
    R.vignette(fb, 0.5);

    if (tut.complete) {
      fb.rect(0, 0, AL.W, AL.H, 8, 10, 14, 0.62);
      AL.drawTextEngravedCentered(fb, "THE WORK BEGINS", AL.H / 2 - 12, [240, 210, 150], [30, 24, 8], { scale: 2, spacing: 2 });
      var on2 = Math.floor(t * 1.5) % 2 === 0;
      if (on2) AL.drawTextCentered(fb, "PRESS ENTER TO FACE THE FIRST RIVAL", AL.H / 2 + 8, [210, 190, 150], { scale: 1 });
    } else if (tut.lessonFailed) {
      drawRuined(fb, pal, t, "LESSON RUINED", "PRESS ENTER TO RETRY LESSON");
    }
    return fb;
  };

  function drawBoutEnd(fb, duel, pal, t) {
    var won = duel.state === "won";
    fb.rect(0, 0, AL.W, AL.H, won ? 8 : 30, won ? 10 : 4, won ? 14 : 6, 0.6);
    if (won) {
      AL.drawTextEngravedCentered(fb, "THE WORK HOLDS", AL.H / 2 - 12, [240, 210, 150], [30, 24, 8], { scale: 2, spacing: 2 });
      AL.drawTextCentered(fb, "THE RIVAL ALEMBIC IS SPENT", AL.H / 2 + 6, [210, 190, 150], { scale: 1 });
    } else {
      AL.drawTextEngravedCentered(fb, "THE WORK IS RUINED", AL.H / 2 - 12, [230, 120, 90], [40, 4, 4], { scale: 2, spacing: 2 });
    }
    var on = Math.floor(t * 1.5) % 2 === 0;
    if (on) AL.drawTextCentered(fb, "PRESS ENTER TO BEGIN ANEW", AL.H / 2 + 22, [200, 170, 150], { scale: 1 });
  }
});
