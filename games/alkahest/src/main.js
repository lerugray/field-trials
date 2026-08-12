/* ALKAHEST -- main: browser boot + the native-res frame pipeline.
 *
 * The render target is a fixed AL.W x AL.H software FrameBuffer. Its backing
 * bytes ARE an ImageData, so we putImageData straight into a native-size canvas
 * and let CSS scale it up with nearest-neighbour (image-rendering: pixelated).
 * That is the whole pipeline: compose in the native buffer, blit, scale.
 *
 * The update+render step is wrapped so any thrown error becomes a LOUD in-frame
 * banner and a log entry rather than a black screen (hard rule 6). A tiny scene
 * registry keeps the title isolated so M1 can bolt the play scene alongside it.
 */
;(function (root, factory) {
  var AL = root.AL || (root.AL = {});
  factory(AL);
  if (typeof module !== "undefined" && module.exports) module.exports = AL;
})(typeof self !== "undefined" ? self : globalThis, function (AL) {
  /* ---- scene registry + tiny manager ---- */
  AL.scenes = AL.scenes || {};
  AL._active = null;
  AL._seedCounter = 1;
  AL.go = function (name, arg) {
    var s = AL.scenes[name];
    if (!s) throw new Error("no scene: " + name);
    AL._active = s;
    if (s.enter) s.enter(arg);
  };

  AL.scenes.title = {
    t: 0,
    enter: function () { this.t = 0; },
    update: function (dt, input) {
      this.t += dt;
      if (input.actionPressed("confirm")) AL.go("learn", AL._seedCounter++);
    },
    render: function (fb) {
      AL.drawTitle(fb, { act: "nigredo", t: this.t, showPrompt: true });
    }
  };

  /* the tutorialette: teaches swap / combo / chain / raise / rescue, then duels */
  AL.scenes.learn = {
    enter: function (seed) {
      this.tut = new AL.Tutorial({ seed: (seed || 1) >>> 0 });
      this.cursor = { x: 2, y: 0 };
      this.t = 0;
    },
    update: function (dt, input) {
      this.t += dt;
      var tut = this.tut, cur = this.cursor, m = tut.m;
      if (tut.complete) {
        if (input.actionPressed("confirm")) AL.go("run", AL._seedCounter++);
        return;
      }
      if (input.actionPressed("pause")) { tut.skip(); return; } // skippable
      if (tut.lessonFailed) {
        if (input.actionPressed("confirm")) tut.retry();
        return;
      }
      var cols = m.grid.cols, top = AL.WELL.VISROWS - 1;
      if (input.actionPressed("left")) cur.x = Math.max(0, cur.x - 1);
      if (input.actionPressed("right")) cur.x = Math.min(cols - 2, cur.x + 1);
      if (input.actionPressed("up")) cur.y = Math.min(top, cur.y + 1);
      if (input.actionPressed("down")) cur.y = Math.max(0, cur.y - 1);
      if (input.actionPressed("swap")) m.requestSwap(cur.x, cur.y);
      m.setRaise(input.actionDown("raise"));
      tut.tick(dt);
    },
    render: function (fb) {
      AL.drawTutorial(fb, this.tut, { act: "nigredo", cursor: this.cursor, time: this.t });
    }
  };

  /* the duel: the player's well vs an AI alembic, dross exchange, one bout */
  AL.scenes.duel = {
    enter: function (seed) {
      seed = (seed || 1) >>> 0;
      this.duel = new AL.Duel({
        seedP: seed, seedR: (seed * 2654435761) >>> 0, aiSeed: (seed ^ 0x9e3779b9) >>> 0,
        skill: 0.55, machine: { seedRows: 6 }
      });
      this.cursor = { x: 2, y: 5 };
      this.t = 0;
      this.act = "nigredo"; // per-act rules land in M3
    },
    update: function (dt, input) {
      this.t += dt;
      var d = this.duel, cur = this.cursor, m = d.player;
      if (d.state !== "fight") {
        if (input.actionPressed("confirm")) AL.go("duel", AL._seedCounter++);
        d.tick(dt); // keep the end frame animating (no-op past fight, but harmless)
        return;
      }
      if (input.actionPressed("pause")) d.togglePause();
      if (!d.paused) {
        var cols = m.grid.cols, top = AL.WELL.VISROWS - 1;
        if (input.actionPressed("left")) cur.x = Math.max(0, cur.x - 1);
        if (input.actionPressed("right")) cur.x = Math.min(cols - 2, cur.x + 1);
        if (input.actionPressed("up")) cur.y = Math.min(top, cur.y + 1);
        if (input.actionPressed("down")) cur.y = Math.max(0, cur.y - 1);
        if (input.actionPressed("swap")) m.requestSwap(cur.x, cur.y);
        m.setRaise(input.actionDown("raise"));
      }
      d.tick(dt);
    },
    render: function (fb) {
      AL.drawDuel(fb, this.duel, { act: this.act, cursor: this.cursor, time: this.t });
      if (this.duel.paused && this.duel.state === "fight") {
        fb.rect(0, 0, AL.W, AL.H, 6, 8, 14, 0.55);
        AL.drawTextEngravedCentered(fb, "PAUSED", AL.H / 2 - 6, [210, 200, 180], [20, 20, 30], { scale: 2, spacing: 2 });
      }
    }
  };

  /* the run: the full Magnum Opus -- a Run state machine (bout/draft/workshop/
   * end) pumped here, with per-state input. Actives cast on 1-4 using the cursor
   * as the target (a column for Aqua Regia, the reagent under it for Distillation). */
  AL.scenes.run = {
    enter: function (seed) {
      this.run = new AL.Run({ seed: (seed || 1) >>> 0 });
      this._newBout();
      this.t = 0;
      this.paused = false;
      this.draftSel = 0;
      this.discardMode = false;
      this.pendingPick = null;
      this.discardSel = 0;
      this.wsSel = 0;
    },
    _newBout: function () { this.cursor = { x: 2, y: 5 }; },
    update: function (dt, input) {
      this.t += dt;
      var run = this.run, st = run.state;
      if (st === "bout") this._updateBout(dt, input);
      else if (st === "draft") this._updateDraft(input);
      else if (st === "workshop") this._updateWorkshop(input);
      else if (input.actionPressed("confirm")) AL.go("run", AL._seedCounter++); // won/ruined
    },
    _updateBout: function (dt, input) {
      var run = this.run, d = run.duel, cur = this.cursor, m = d.player;
      if (input.actionPressed("pause")) d.togglePause();
      if (!d.paused) {
        var cols = m.grid.cols, top = AL.WELL.VISROWS - 1;
        if (input.actionPressed("left")) cur.x = Math.max(0, cur.x - 1);
        if (input.actionPressed("right")) cur.x = Math.min(cols - 2, cur.x + 1);
        if (input.actionPressed("up")) cur.y = Math.min(top, cur.y + 1);
        if (input.actionPressed("down")) cur.y = Math.max(0, cur.y - 1);
        if (input.actionPressed("swap")) m.requestSwap(cur.x, cur.y);
        m.setRaise(input.actionDown("raise"));
        // cast bound actives on 1-4 (the cursor supplies any target)
        for (var i = 0; i < m.actives.length && i < 4; i++) {
          if (input.actionPressed("opt" + (i + 1))) this._cast(m, i);
        }
      }
      run.tick(dt); // ticks the duel; transitions to draft/workshop/end on bout end
      if (run.state !== "bout") this._newBout();
    },
    _cast: function (m, i) {
      var av = m.actives[i], card = this.run.folio.get(av.id);
      if (!card) return;
      var kind = av.spec.kind, arg = null;
      if (kind === "dissolveColumn") arg = this.cursor.x;
      else if (kind === "dissolveType") {
        var c = m.grid.cells[this.cursor.y] && m.grid.cells[this.cursor.y][this.cursor.x];
        arg = c && !c.dross ? c.t : null;
      }
      m.castActive(card, arg);
    },
    _updateDraft: function (input) {
      var run = this.run, offer = run.draftOffer || [];
      if (this.discardMode) {
        var fc = run.folio.cards;
        if (input.actionPressed("left")) this.discardSel = (this.discardSel + fc.length - 1) % fc.length;
        if (input.actionPressed("right")) this.discardSel = (this.discardSel + 1) % fc.length;
        if (input.actionPressed("pause")) { this.discardMode = false; return; }
        if (input.actionPressed("confirm")) {
          run.resolveDraft(this.pendingPick, fc[this.discardSel].id);
          this.discardMode = false; this.draftSel = 0;
          if (run.state === "bout") this._newBout();
        }
        return;
      }
      if (input.actionPressed("left")) this.draftSel = (this.draftSel + offer.length - 1) % offer.length;
      if (input.actionPressed("right")) this.draftSel = (this.draftSel + 1) % offer.length;
      var take = -1;
      for (var i = 0; i < offer.length; i++) if (input.actionPressed("opt" + (i + 1))) take = i;
      if (input.actionPressed("confirm")) take = this.draftSel;
      if (input.actionPressed("pause")) { run.resolveDraft(null); this.draftSel = 0; if (run.state === "bout") this._newBout(); return; }
      if (take >= 0 && offer[take]) this._take(offer[take].id);
    },
    _take: function (pickId) {
      var run = this.run;
      var res = run.resolveDraft(pickId);
      if (res && res.needsDiscard) { this.discardMode = true; this.pendingPick = pickId; this.discardSel = 0; return; }
      this.draftSel = 0;
      if (run.state === "bout") this._newBout();
    },
    _updateWorkshop: function (input) {
      var run = this.run, fc = run.folio.cards;
      if (fc.length) {
        if (input.actionPressed("left")) this.wsSel = (this.wsSel + fc.length - 1) % fc.length;
        if (input.actionPressed("right")) this.wsSel = (this.wsSel + 1) % fc.length;
        if (input.actionPressed("upgrade")) { run.resolveWorkshop({ kind: "upgrade", id: fc[this.wsSel].id }); this.wsSel = 0; this._newBout(); return; }
        if (input.actionPressed("remove")) { run.resolveWorkshop({ kind: "remove", id: fc[this.wsSel].id }); this.wsSel = 0; this._newBout(); return; }
      }
      if (input.actionPressed("pause") || input.actionPressed("confirm")) { run.resolveWorkshop({ kind: "skip" }); this.wsSel = 0; this._newBout(); }
    },
    render: function (fb) {
      var run = this.run, st = run.state, t = this.t;
      if (st === "bout") {
        AL.drawDuel(fb, run.duel, { act: run.actName, cursor: this.cursor, time: t, run: run });
        if (run.duel.paused) {
          fb.rect(0, 0, AL.W, AL.H, 6, 8, 14, 0.55);
          AL.drawTextEngravedCentered(fb, "PAUSED", AL.H / 2 - 6, [210, 200, 180], [20, 20, 30], { scale: 2, spacing: 2 });
        }
      } else if (st === "draft") {
        AL.drawDraft(fb, run, { sel: this.draftSel, time: t, discardMode: this.discardMode, discardSel: this.discardSel });
      } else if (st === "workshop") {
        AL.drawWorkshop(fb, run, { sel: this.wsSel, time: t });
      } else {
        AL.drawRunEnd(fb, run, { time: t });
      }
    }
  };

  AL.scenes.play = {
    enter: function (seed) {
      this.m = new AL.Machine({ seed: (seed || 1) >>> 0, seedRows: 6 });
      this.cursor = { x: 2, y: 5 };
      this.t = 0;
      this.act = "nigredo"; // per-act rules land in M3; endless runs Nigredo for M1
    },
    update: function (dt, input) {
      this.t += dt;
      var m = this.m, cur = this.cursor;
      if (m.state === "lost") {
        if (input.actionPressed("confirm")) AL.go("play", AL._seedCounter++);
        m.tick(dt); // keep the ruined frame animating
        return;
      }
      var cols = m.grid.cols, top = AL.WELL.VISROWS - 1;
      if (input.actionPressed("left")) cur.x = Math.max(0, cur.x - 1);
      if (input.actionPressed("right")) cur.x = Math.min(cols - 2, cur.x + 1);
      if (input.actionPressed("up")) cur.y = Math.min(top, cur.y + 1);
      if (input.actionPressed("down")) cur.y = Math.max(0, cur.y - 1);
      if (input.actionPressed("swap")) m.requestSwap(cur.x, cur.y);
      m.setRaise(input.actionDown("raise"));
      if (input.actionPressed("pause")) this.paused = !this.paused;
      if (!this.paused) m.tick(dt);
    },
    render: function (fb) {
      AL.drawWell(fb, this.m, { act: this.act, cursor: this.cursor, time: this.t });
      if (this.paused) {
        fb.rect(0, 0, AL.W, AL.H, 6, 8, 14, 0.55);
        AL.drawTextEngravedCentered(fb, "PAUSED", AL.H / 2 - 6, [210, 200, 180], [20, 20, 30], { scale: 2, spacing: 2 });
      }
    }
  };

  /* ---- the boot + loop; browser only ---- */
  AL.boot = function (win, doc) {
    win = win || (typeof window !== "undefined" ? window : null);
    doc = doc || (typeof document !== "undefined" ? document : null);
    if (!win || !doc) throw new Error("AL.boot requires a browser window");

    AL.debug.install(win);

    var canvas = doc.getElementById("screen");
    if (!canvas) { throw new Error("no #screen canvas in document"); }
    canvas.width = AL.W;
    canvas.height = AL.H;
    var ctx = canvas.getContext("2d", { alpha: false });
    ctx.imageSmoothingEnabled = false;

    var fb = new AL.FrameBuffer(AL.W, AL.H);
    var img = new ImageData(fb.data, AL.W, AL.H); // shares fb's backing bytes

    var input = new AL.Input();
    input.attach(win);
    // WebAudio may only start from a user gesture. The score remains a pure,
    // headless-safe parameter timeline until the first key/click/touch wakes it.
    if (AL.audio && AL.audio.attach) AL.audio.attach(win);

    // fit the native canvas into the window, preserving 16:9, nearest-scaled
    function fit() {
      var ww = win.innerWidth, wh = win.innerHeight;
      var s = Math.min(ww / AL.W, wh / AL.H);
      canvas.style.width = Math.round(AL.W * s) + "px";
      canvas.style.height = Math.round(AL.H * s) + "px";
    }
    win.addEventListener("resize", fit);
    fit();

    AL.go("title");
    var last = 0;

    function frame(ts) {
      var dt = last ? Math.min(0.05, (ts - last) / 1000) : 0; // clamp long stalls
      last = ts;
      try {
        // global keys handled here (export log) before scene update
        if (input.actionPressed("exportlog")) AL.debug.export(doc);
        AL._active.update(dt, input);
        if (AL.audio && AL.audio.update) AL.audio.update(dt, AL.sceneAudioSnapshot(AL._active));
        AL._active.render(fb);
      } catch (e) {
        AL.debug.error((e && e.message ? e.message : e) + (e && e.stack ? " | " + e.stack.split("\n")[1] : ""));
        fb.clear(20, 6, 6); // never a black void
      }
      AL.debug.overlay(fb);
      ctx.putImageData(img, 0, 0);
      input.beginFrame();
      win.requestAnimationFrame(frame);
    }

    AL.debug.log("ALKAHEST boot ok (" + AL.W + "x" + AL.H + ")");
    win.requestAnimationFrame(frame);
    return { canvas: canvas, fb: fb, input: input };
  };

  // auto-boot when loaded in a browser document
  if (typeof document !== "undefined" && typeof window !== "undefined") {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", function () { AL.boot(window, document); });
    } else {
      AL.boot(window, document);
    }
  }
});
