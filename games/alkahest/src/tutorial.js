/* ALKAHEST -- tutorial: the tutorialette (studio amendment, folded into M2).
 *
 * Teaches the machine's verbs on planted boards, in order, before the run layer:
 *   1. SWAP    -- the only verb; line up three to dissolve them.
 *   2. COMBO   -- one swap clearing four+ at once (BREADTH); distinct readout.
 *   3. CHAIN   -- a clear that drops reagents into another clear (DEPTH); distinct.
 *   4. RAISE   -- hold raise to force the stack up (dross timing / cycling).
 *   5. RESCUE  -- near the top, a CLEAR FREEZES the rise (stop-time); survive.
 * Chain and combo get DISTINCT on-screen vocabularies (the well render already
 * draws CHAIN xN in warm gold and COMBO N in cool glass). Near-death is shown by
 * the danger frame + grace state. It is SKIPPABLE at any time (pause/Escape).
 *
 * The controller is pure sim: tick(dt) advances the active step's machine and
 * checks its completion predicate; the scene drives the player's machine through
 * the same requestSwap/setRaise primitives and renders the instruction banner.
 * Deterministic from the seed so the planted boards are stable + testable.
 */
;(function (root, factory) {
  var AL = root.AL || (root.AL = {});
  factory(AL);
  if (typeof module !== "undefined" && module.exports) module.exports = AL;
})(typeof self !== "undefined" ? self : globalThis, function (AL) {
  /* place ascii rows (TOP-to-BOTTOM) onto a machine's grid bottom */
  function place(m, lines) {
    var h = lines.length;
    for (var i = 0; i < h; i++) {
      var y = h - 1 - i;
      for (var x = 0; x < lines[i].length; x++) {
        var ch = lines[i][x];
        if (ch !== "." && ch !== " ") m.grid.cells[y][x] = AL.panel(+ch);
      }
    }
  }

  var STEPS = [
    {
      id: "SWAP",
      hint: ["A lone block slides into", "an empty neighbor.", "Line up three to clear."],
      target: { x: 2, y: 0 },
      build: function (seed) {
        var m = new AL.Machine({ seed: seed, seedRows: 0, risePerSec: 0, warnRow: 99 });
        place(m, ["1121.."]);        // swap (2,0): 1,1,1,2 -> a triple
        return m;
      },
      done: function (m, base) { return m.stats.clears > base.clears; }
    },
    {
      id: "COMBO",
      hint: ["Clear four or more at", "once for a COMBO --", "breadth. One swap: six."],
      target: { x: 2, y: 0 },
      build: function (seed) {
        var m = new AL.Machine({ seed: seed, seedRows: 0, risePerSec: 0, warnRow: 99 });
        place(m, ["112122"]);        // swap (2,0): 1,1,1,2,2,2 -> two triples = combo 6
        return m;
      },
      done: function (m, base) { return m.stats.maxCombo >= 4; }
    },
    {
      id: "CHAIN",
      hint: ["A clear that feeds", "another is a CHAIN --", "depth. Swap the far pair."],
      target: { x: 4, y: 0 },
      build: function (seed) {
        var m = new AL.Machine({ seed: seed, seedRows: 0, risePerSec: 0, warnRow: 99 });
        // swap(4,0): 2,2,1,1,1 clears; the 2 above falls -> 2,2,2 clears = 2-chain
        place(m, ["..2...", "2211.1"]);
        return m;
      },
      done: function (m, base) { return m.stats.maxChain >= 2; }
    },
    {
      id: "RAISE",
      hint: ["Hold RAISE to push", "the stack upward.", "You set the tempo."],
      target: null,
      build: function (seed) {
        var m = new AL.Machine({ seed: seed, seedRows: 3, risePerSec: 0, warnRow: 99 });
        return m; // auto-rise off: any rows risen come only from manual raise
      },
      done: function (m, base) { return m.stats.rowsRisen - base.rows >= 2; }
    },
    {
      id: "RESCUE",
      hint: ["Near the top, a CLEAR", "FREEZES the rise.", "Clear to survive."],
      target: { x: 2, y: 0 },
      build: function (seed) {
        var warn = 8;
        var m = new AL.Machine({ seed: seed, seedRows: 0, risePerSec: 0.3, warnRow: warn, rows: 14 });
        // fill to the warning height with a match-free lattice, then plant a clear
        for (var y = 0; y < warn; y++)
          for (var x = 0; x < m.grid.cols; x++) m.grid.cells[y][x] = AL.panel((x + y) % 6);
        m.grid.cells[0] = [AL.panel(0), AL.panel(0), AL.panel(1), AL.panel(0), AL.panel(2), AL.panel(3)];
        return m; // swap(2,0): 0,0,0 clears WHILE in danger -> the rise freezes
      },
      done: function (m, base) { return m.stats.clears > base.clears; }
    }
  ];

  function Tutorial(opts) {
    opts = opts || {};
    this.seed = (opts.seed === undefined ? 1 : opts.seed) >>> 0;
    this.i = 0;
    this.complete = false;   // whole tutorialette finished (or skipped)
    this.lessonFailed = false; // topped-out lesson awaiting an explicit retry
    this.t = 0;
    this.stepDoneT = null;   // time the active step was satisfied (brief celebrate)
    this._enterStep();
  }

  Tutorial.STEPS = STEPS;
  Tutorial.prototype.step = function () { return STEPS[this.i]; };

  Tutorial.prototype._enterStep = function () {
    var s = STEPS[this.i];
    this.m = s.build(this.seed + this.i);
    this.base = { clears: this.m.stats.clears, rows: this.m.stats.rowsRisen };
    this.stepDoneT = null;
    this.lessonFailed = false;
  };

  Tutorial.prototype.tick = function (dt) {
    if (this.complete || this.lessonFailed) return;
    this.t += dt;
    this.m.tick(dt);
    if (this.m.state === "lost") {
      this.m.setRaise(false);
      this.lessonFailed = true;
      return;
    }
    var s = STEPS[this.i];
    if (this.stepDoneT === null && s.done(this.m, this.base)) this.stepDoneT = this.t;
    // let the satisfying clear play, then advance
    if (this.stepDoneT !== null && this.t - this.stepDoneT > 1.1) this._advance();
  };

  Tutorial.prototype._advance = function () {
    this.i++;
    if (this.i >= STEPS.length) this.complete = true;
    else this._enterStep();
  };

  Tutorial.prototype.stepDone = function () { return this.stepDoneT !== null; };
  Tutorial.prototype.retry = function () {
    if (this.complete || !this.lessonFailed) return false;
    this._enterStep();
    return true;
  };
  Tutorial.prototype.skip = function () { this.complete = true; };
  Tutorial.prototype.progress = function () { return { index: this.i, total: STEPS.length }; };

  AL.Tutorial = Tutorial;
});
