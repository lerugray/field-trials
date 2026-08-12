/* ALKAHEST -- folioui: the run-layer surfaces (STUDY-run §3-§7), drawn to the
 * register. Every run mechanic gets a player-VISIBLE representation (rule 4): the
 * athanor gauge fills as chains charge it; active brews show as keyed chips lit
 * only when castable; the draft, the workshop, the act ladder, and the run-end
 * screens are composed brass-and-ink panels. Card iconography obeys the colorblind
 * law -- a per-class SHAPE plus a per-card GLYPH letter, never colour alone.
 *
 * Pure drawing over a FrameBuffer; reads Run/Machine/Folio, never mutates them.
 */
;(function (root, factory) {
  var AL = root.AL || (root.AL = {});
  factory(AL);
  if (typeof module !== "undefined" && module.exports) module.exports = AL;
})(typeof self !== "undefined" ? self : globalThis, function (AL) {
  var R = AL.render;
  var PAPER_N = AL.noise2(4404);

  function paperColor(pal) {
    if (pal.name === "Albedo") return [174, 169, 151];
    if (pal.name === "Citrinitas") return [162, 132, 76];
    if (pal.name === "Rubedo") return [138, 91, 70];
    return [138, 120, 86];
  }
  function folioInk() { return [31, 23, 16]; }
  function paperShade(pal, k) {
    var c = paperColor(pal);
    return [AL.clamp(c[0] * k, 0, 255), AL.clamp(c[1] * k, 0, 255), AL.clamp(c[2] * k, 0, 255)];
  }

  /* The folio is an object on the bench, not a generic menu panel: leather
   * cover, textured leaves, center binding, brass corners, practical light. */
  function drawFolioBackdrop(fb, pal, act, t) {
    if (AL.drawBenchRoom) AL.drawBenchRoom(fb, pal, { act: act, time: t });
    else fb.clear(pal.stoneDark[0], pal.stoneDark[1], pal.stoneDark[2]);
    R.textureFill(fb, 4, 4, AL.W - 8, AL.H - 8, [49, 29, 20], PAPER_N, { amp: 0.2, scale: 0.07 });
    fb.frame(4, 4, AL.W - 8, AL.H - 8, pal.brass[0], pal.brass[1], pal.brass[2], 0.78);
    R.textureFill(fb, 10, 7, AL.W - 20, AL.H - 14, paperColor(pal), PAPER_N, { amp: 0.12, scale: 0.055 });
    fb.vline(AL.W / 2, 10, AL.H - 20, 66, 42, 24, 0.34);
    fb.vline(AL.W / 2 + 1, 10, AL.H - 20, 220, 190, 132, 0.18);
    [[7, 7], [AL.W - 10, 7], [7, AL.H - 10], [AL.W - 10, AL.H - 10]].forEach(function (p) {
      fb.rect(p[0], p[1], 3, 3, pal.brassLight[0], pal.brassLight[1], pal.brassLight[2], 0.78);
    });
    R.glow(fb, 56, AL.H - 24, 82, pal.flame, 0.06);
    return folioInk();
  }

  // class identity: shape (colorblind-safe) + a flavour colour
  var CLASS_UI = {
    passive: { shape: "triangle", label: "REACTION", col: [150, 210, 150] },
    active:  { shape: "diamond",  label: "BREW",     col: [120, 200, 214] },
    bargain: { shape: "hexagon",  label: "BARGAIN",  col: [226, 150, 90] }
  };

  /* draw a small filled shape centered at (cx,cy), radius r -- the class icon. */
  function drawShape(fb, kind, cx, cy, r, col, a) {
    a = a === undefined ? 1 : a;
    function span(y, x0, x1) { fb.hline(Math.round(x0), Math.round(y), Math.round(x1 - x0) + 1, col[0], col[1], col[2], a); }
    var dy, w;
    if (kind === "diamond") {
      for (dy = -r; dy <= r; dy++) { w = r - Math.abs(dy); span(cy + dy, cx - w, cx + w); }
    } else if (kind === "triangle") {
      for (dy = 0; dy <= r; dy++) { w = Math.round((dy / r) * r); span(cy - r + dy + Math.round(r * 0.3), cx - w, cx + w); }
    } else { // hexagon
      for (dy = -r; dy <= r; dy++) {
        var t = 1 - Math.abs(dy) / r; w = Math.round(r * (0.55 + 0.45 * t));
        span(cy + dy, cx - w, cx + w);
      }
    }
  }
  AL.drawShape = drawShape;

  /* naive word-wrap to a max character count per line */
  function wrap(str, maxChars) {
    var words = String(str).split(" "), lines = [], cur = "";
    for (var i = 0; i < words.length; i++) {
      var next = (cur ? cur + " " : "") + words[i];
      if (next.length <= maxChars) cur = next; else { if (cur) lines.push(cur); cur = words[i]; }
    }
    if (cur) lines.push(cur);
    return lines;
  }
  AL.wrapText = wrap;

  /* One formula leaf: fibrous paper inside a brass-edged folio mount. */
  AL.drawFormulaCard = function (fb, card, x, y, w, h, pal, opts) {
    opts = opts || {};
    var ui = CLASS_UI[card.cls];
    var eff = AL.formulaResolve(card);
    var a = opts.dim ? 0.5 : 1;
    var ink = folioInk();
    // paper leaf with a darker deckled inner edge
    R.textureFill(fb, x, y, w, h, paperColor(pal), AL.noise2(31 + card.id.length), { amp: 0.16, scale: 0.08, alpha: a });
    fb.vline(x + 2, y + 3, h - 6, 70, 44, 24, 0.26 * a);
    fb.hline(x + 4, y + 28, w - 8, 72, 48, 28, 0.3 * a);
    // brass frame (brighter if selected)
    var fa = opts.selected ? 1 : 0.7;
    for (var i = 0; i < (opts.selected ? 3 : 2); i++)
      fb.frame(x - i, y - i, w + i * 2, h + i * 2, pal.brass[0], pal.brass[1], pal.brass[2], (fa - i * 0.2) * a);
    fb.hline(x, y, w, pal.brassLight[0], pal.brassLight[1], pal.brassLight[2], 0.85 * a);
    if (opts.selected) R.glow(fb, x + w / 2, y + h / 2, w, pal.flame, 0.08);

    // header: class shape + glyph letter + class label
    drawShape(fb, ui.shape, x + 9, y + 10, 5, opts.dim ? [ui.col[0] * 0.6, ui.col[1] * 0.6, ui.col[2] * 0.6] : ui.col, a);
    AL.drawTextEngraved(fb, card.glyph, x + 15, y + 6, paperShade(pal, 0.35), paperShade(pal, 1.3), { scale: 1 });
    AL.drawText(fb, ui.label, x + w - AL.textWidth(ui.label, 1, 1) - 3, y + 3, ink, { scale: 1, alpha: 0.85 * a });

    // name (engraved)
    AL.drawTextEngraved(fb, card.name.toUpperCase(), x + 4, y + 18, ink, paperShade(pal, 1.25), { scale: 1, spacing: 1 });
    if (opts.upgraded || card.upgraded) AL.drawText(fb, "+", x + w - 8, y + 17, [112, 46, 25], { scale: 1 });

    // cost badge for actives
    var ty = y + 30;
    if (eff.active) {
      AL.drawTextEngraved(fb, eff.active.cost + " CHARGE", x + 4, ty, [92, 44, 27], paperShade(pal, 1.22), { scale: 1 });
      ty += 11;
    }
    // body text, wrapped
    var lines = wrap(eff.text, Math.floor((w - 8) / 6));
    for (var l = 0; l < lines.length; l++) AL.drawText(fb, lines[l], x + 4, ty + l * 8, ink, { scale: 1, alpha: 0.92 * a });
  };

  /* the athanor gauge: a warm liquor column that fills as cascades charge it.
   * A cap tick marks the ceiling; a fresh charge or the first-charge pulse flares. */
  AL.drawAthanor = function (fb, x, y, w, h, machine, pal, t) {
    var frac = AL.clamp(machine.athanorFrac(), 0, 1);
    var flashScale = AL.flashScale ? AL.flashScale() : 0.65;
    // tube
    fb.rect(x, y, w, h, pal.stoneDark[0] * 0.6, pal.stoneDark[1] * 0.6, pal.stoneDark[2] * 0.7, 0.9);
    fb.frame(x - 1, y - 1, w + 2, h + 2, pal.brass[0], pal.brass[1], pal.brass[2], 0.9);
    // fill from the bottom
    var fh = Math.round((h - 2) * frac);
    if (fh > 0) {
      R.gradientV(fb, x + 1, y + h - 1 - fh, w - 2, fh, [pal.flame[0], pal.flame[1] * 0.7, pal.flame[2] * 0.4], pal.flameCore);
      fb.hline(x + 1, y + h - 1 - fh, w - 2, pal.flameCore[0], pal.flameCore[1], pal.flameCore[2], 0.9);
    }
    // cap tick
    fb.hline(x - 2, y, w + 4, pal.accent[0], pal.accent[1], pal.accent[2], 0.7);
    AL.drawText(fb, "ATH", x - 1, y - 9, pal.ink, { scale: 1, alpha: 0.8 });
    // charge flash + full glow
    if (machine.lastCharge && t - machine.lastCharge.t < 0.4) {
      var k = 1 - (t - machine.lastCharge.t) / 0.4;
      R.glow(fb, x + w / 2, y + h - 1 - fh, 18, pal.flameCore, 0.5 * k * flashScale);
    }
    if (frac >= 0.999) R.glow(fb, x + w / 2, y + h / 2, 16, pal.flame, 0.25 + 0.15 * Math.sin(t * 6));
    // first-charge discoverability callout (STUDY-run §3)
    if (machine.firstChargePulse && t - machine.firstChargePulse.t < 3.0) {
      var bl = Math.floor(t * 2) % 2 === 0;
      if (bl) AL.drawText(fb, "CHARGING", x - 2, y + h + 3, pal.flame, { scale: 1 });
    }
  };

  /* the active-brew bar: one keyed chip per bound active, lit only when castable
   * (athanor >= cost). Shows key number, glyph, and cost. */
  AL.drawActiveBar = function (fb, machine, x, y, pal, t, hint) {
    var actives = machine.actives || [], W = 34;
    for (var i = 0; i < actives.length; i++) {
      var av = actives[i], cy = y + i * 19;
      var ready = machine.athanor + 1e-9 >= av.cost;
      var a = ready ? 1 : 0.45;
      fb.rect(x, cy, W, 16, pal.stoneDark[0], pal.stoneDark[1], pal.stoneDark[2], 0.72 * a);
      fb.frame(x, cy, W, 16, pal.brass[0], pal.brass[1], pal.brass[2], (ready ? 0.95 : 0.5));
      if (ready) R.glow(fb, x + 7, cy + 8, 11, pal.flame, 0.18 + 0.08 * Math.sin(t * 5));
      AL.drawTextEngraved(fb, String(i + 1), x + 2, cy + 5, pal.flameCore, pal.stoneDark, { scale: 1 });
      drawShape(fb, "diamond", x + 12, cy + 8, 3, CLASS_UI.active.col, a);
      AL.drawText(fb, av.glyph, x + 18, cy + 2, pal.brassLight, { scale: 1, alpha: a });
      AL.drawText(fb, av.cost + "c", x + 18, cy + 9, ready ? pal.flame : pal.ink, { scale: 1, alpha: a });
    }
    if (actives.length) AL.drawText(fb, "BREWS", x, y - 9, pal.ink, { scale: 1, alpha: 0.7 });
    // first-active-draft callout: teach the cast key until the first brew is cast
    if (hint && actives.length) {
      var hy = y + actives.length * 19 + 2;
      R.glow(fb, x + W / 2, hy + 4, 24, pal.flame, 0.12);
      if (Math.floor(t * 2) % 2 === 0) {
        AL.drawTextEngraved(fb, "PRESS 1", x, hy, pal.flameCore, pal.stoneDark, { scale: 1 });
        AL.drawText(fb, "TO CAST", x, hy + 8, pal.flame, { scale: 1 });
      }
    }
  };

  /* the act-ladder banner over a bout: 4 acts x 3 pips, current lit, plus the
   * rival's name and telegraphed formulae (STUDY-run §1). */
  AL.drawRunBanner = function (fb, run, pal, t) {
    var acts = AL.ACT_ORDER, per = AL.RUN.BOUTS_PER_ACT;
    var x0 = 6, y0 = 2;
    fb.rect(2, 0, AL.W - 4, 14, pal.stoneDark[0], pal.stoneDark[1], pal.stoneDark[2], 0.66);
    fb.hline(2, 13, AL.W - 4, pal.brass[0], pal.brass[1], pal.brass[2], 0.48);
    AL.drawText(fb, "OPUS", x0, y0, pal.ink, { scale: 1, alpha: 0.7 });
    var px = x0 + 24;
    for (var a = 0; a < acts.length; a++) {
      var name = acts[a].slice(0, 3).toUpperCase();
      var isCur = a === run.actIndex();
      AL.drawText(fb, name, px, y0, isCur ? pal.brassLight : pal.ink, { scale: 1, alpha: isCur ? 1 : 0.55 });
      for (var b = 0; b < per; b++) {
        var gi = a * per + b, done = gi < run.boutIndex, here = gi === run.boutIndex;
        var cx = px + b * 6;
        var col = done ? pal.flame : here ? pal.flameCore : pal.stoneLight;
        fb.rect(cx, y0 + 8, 4, 3, col[0], col[1], col[2], done || here ? 0.95 : 0.4);
      }
      px += 26;
    }
    // rival telegraph, right-aligned
    if (run.rivalInfo) {
      var ri = run.rivalInfo;
      var label = (ri.master ? "MASTER " : "RIVAL ") + ri.name.toUpperCase();
      AL.drawText(fb, label, AL.W - AL.textWidth(label, 1, 1) - 6, 0, ri.master ? pal.accent : pal.ink, { scale: 1, alpha: 0.9 });
      if (ri.formulae.length) {
        var f = ri.formulae.join(" / ").toUpperCase();
        AL.drawText(fb, f, AL.W - AL.textWidth(f, 1, 1) - 6, 7, pal.glass, { scale: 1, alpha: 0.8 });
      }
    }
  };

  /* the draft screen (STUDY-run §4): three cards, one of each class, a selection
   * cursor, skip prompt, and a discard sub-prompt when the folio is full. */
  AL.drawDraft = function (fb, run, opts) {
    opts = opts || {};
    var pal = AL.palette(run.actName || "nigredo");
    var t = opts.time || 0;
    var ink = drawFolioBackdrop(fb, pal, run.actName || "nigredo", t);
    AL.drawTextEngravedCentered(fb, "DRAFT A FORMULA", 14, ink, paperShade(pal, 1.25), { scale: 2, spacing: 2 });
    AL.drawTextCentered(fb, "IN FOLIO  " + run.folio.count() + " OF " + run.folio.cap, 34, ink, { scale: 1 });

    var offer = run.draftOffer || [];
    var cw = 96, ch = 116, gap = 12;
    var totalW = offer.length * cw + (offer.length - 1) * gap;
    var sx = Math.round((AL.W - totalW) / 2), cy = 52;
    for (var i = 0; i < offer.length; i++) {
      var x = sx + i * (cw + gap);
      AL.drawFormulaCard(fb, offer[i], x, cy, cw, ch, pal, { selected: i === opts.sel && !opts.discardMode });
      AL.drawTextCentered2(fb, "[" + (i + 1) + "]", x + cw / 2, cy + ch + 3, ink);
    }

    if (opts.discardMode) {
      // overlay: pick a folio card to discard (folio is full)
      fb.rect(0, 0, AL.W, AL.H, 6, 6, 10, 0.72);
      AL.drawTextEngravedCentered(fb, "FOLIO FULL -- DISCARD ONE", 20, pal.accent, pal.stoneDark, { scale: 1, spacing: 1 });
      drawFolioGrid(fb, run.folio, pal, opts.discardSel, 34);
      var bl = Math.floor(t * 2) % 2 === 0;
      if (bl) AL.drawTextCentered(fb, "ENTER DISCARD   ESC CANCEL", AL.H - 12, paperColor(pal), { scale: 1 });
    } else {
      var blink = Math.floor(t * 1.5) % 2 === 0;
      AL.drawTextCentered(fb, "1-3 OR ARROWS + ENTER TO TAKE", AL.H - 20, ink, { scale: 1 });
      if (blink) AL.drawTextCentered(fb, "ESC TO SKIP  (UNTIMED)", AL.H - 10, ink, { scale: 1 });
    }
    R.vignette(fb, 0.45);
    return fb;
  };

  /* the workshop (STUDY-run §5): the folio laid out, remove or upgrade one. */
  AL.drawWorkshop = function (fb, run, opts) {
    opts = opts || {};
    var pal = AL.palette(run.actName || "nigredo");
    var t = opts.time || 0;
    var ink = drawFolioBackdrop(fb, pal, run.actName || "nigredo", t);
    AL.drawTextEngravedCentered(fb, "THE WORKSHOP", 12, ink, paperShade(pal, 1.25), { scale: 2, spacing: 2 });
    AL.drawTextCentered(fb, "REMOVE OR UPGRADE ONE FORMULA", 32, ink, { scale: 1 });

    if (run.folio.count() === 0) {
      AL.drawTextCentered(fb, "THE FOLIO IS EMPTY", AL.H / 2 - 4, ink, { scale: 1 });
    } else {
      drawFolioGrid(fb, run.folio, pal, opts.sel, 44);
    }
    var blink = Math.floor(t * 1.5) % 2 === 0;
    AL.drawTextCentered(fb, "U UPGRADE    X REMOVE", AL.H - 20, ink, { scale: 1 });
    if (blink) AL.drawTextCentered(fb, "ESC / ENTER TO MOVE ON", AL.H - 10, ink, { scale: 1 });
    R.vignette(fb, 0.45);
    return fb;
  };

  /* a compact grid of the folio's cards (used by workshop + discard overlay) */
  function drawFolioGrid(fb, folio, pal, sel, y0) {
    var cards = folio.cards, cw = 88, ch = 60, gap = 6, cols = 4;
    var rows = Math.ceil(cards.length / cols);
    var totalW = cols * cw + (cols - 1) * gap;
    var sx = Math.round((AL.W - totalW) / 2);
    for (var i = 0; i < cards.length; i++) {
      var cxi = i % cols, cyi = Math.floor(i / cols);
      var x = sx + cxi * (cw + gap), y = y0 + cyi * (ch + gap);
      drawMiniCard(fb, cards[i], x, y, cw, ch, pal, i === sel);
    }
    return { rows: rows };
  }

  function drawMiniCard(fb, card, x, y, w, h, pal, selected) {
    var ui = CLASS_UI[card.cls], eff = AL.formulaResolve(card), ink = folioInk();
    R.textureFill(fb, x, y, w, h, paperColor(pal), AL.noise2(77 + card.id.length), { amp: 0.14, scale: 0.09 });
    for (var i = 0; i < (selected ? 3 : 1); i++)
      fb.frame(x - i, y - i, w + i * 2, h + i * 2, pal.brass[0], pal.brass[1], pal.brass[2], selected ? 1 - i * 0.2 : 0.7);
    if (selected) R.glow(fb, x + w / 2, y + h / 2, w, pal.flame, 0.10);
    drawShape(fb, ui.shape, x + 8, y + 9, 4, ui.col, 1);
    AL.drawTextEngraved(fb, card.name.toUpperCase(), x + 15, y + 5, ink, paperShade(pal, 1.25), { scale: 1 });
    if (card.upgraded) AL.drawText(fb, "+", x + w - 7, y + 5, [112, 46, 25], { scale: 1 });
    var lines = wrap(eff.text, Math.floor((w - 8) / 6));
    for (var l = 0; l < lines.length && l < 4; l++) AL.drawText(fb, lines[l], x + 4, y + 18 + l * 8, ink, { scale: 1, alpha: 0.9 });
  }
  AL.drawFolioGrid = drawFolioGrid;

  /* run-end screens (STUDY-run §7): ruined or opus complete, with roll-up stats. */
  AL.drawRunEnd = function (fb, run, opts) {
    opts = opts || {};
    var pal = AL.palette(run.actName || "rubedo");
    var t = opts.time || 0;
    var won = run.state === "won";
    var ink = drawFolioBackdrop(fb, pal, run.actName || "rubedo", t);
    if (!won) fb.rect(10, 7, AL.W - 20, AL.H - 14, 70, 12, 12, 0.12);
    if (won) R.glow(fb, AL.W / 2, AL.H / 2, 160, pal.flame, 0.12 * (AL.flashScale ? AL.flashScale(opts) : 0.65));
    AL.drawTextEngravedCentered(fb, won ? "THE OPUS IS COMPLETE" : "THE WORK IS RUINED", 40,
      won ? ink : [96, 22, 18], paperShade(pal, 1.25), { scale: 2, spacing: 2 });
    AL.drawTextCentered(fb, won ? "THE MAGNUM OPUS HOLDS" : "A FRESH CRUCIBLE AWAITS", 62, ink, { scale: 1 });

    var H = run.history, rows = [
      ["BOUTS WON", H.boutsWon + " OF 12"],
      ["ACTS CLEARED", String(H.actsCleared) + " OF 4"],
      ["BEST CHAIN", "x" + H.bestChain],
      ["REAGENTS DISSOLVED", String(H.panelsDissolved)],
      ["DROSS SENT", String(H.drossSent)]
    ];
    var ry = 84;
    for (var i = 0; i < rows.length; i++) {
      AL.drawText(fb, rows[i][0], AL.W / 2 - 80, ry + i * 12, ink, { scale: 1, alpha: 0.85 });
      AL.drawText(fb, rows[i][1], AL.W / 2 + 40, ry + i * 12, [92, 44, 27], { scale: 1 });
    }
    var blink = Math.floor(t * 1.5) % 2 === 0;
    if (blink) AL.drawTextCentered(fb, "PRESS ENTER TO BEGIN A NEW OPUS", AL.H - 16, ink, { scale: 1 });
    R.vignette(fb, 0.5);
    return fb;
  };

  /* text centered on an arbitrary x (small helper the draft column labels use) */
  AL.drawTextCentered2 = function (fb, str, cx, y, color, opts) {
    opts = opts || {};
    var w = AL.textWidth(String(str), opts.scale || 1, opts.spacing === undefined ? 1 : opts.spacing);
    AL.drawText(fb, str, Math.round(cx - w / 2), y, color, opts);
  };
});
