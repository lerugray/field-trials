/* ALKAHEST -- alembic: the rival AI opponent (STUDY-duel §5).
 *
 * PARITY IS THE LAW: the alembic plays the SAME machine through the SAME
 * primitives a human uses -- it may only call machine.requestSwap(x,y) and
 * machine.setRaise(held). It has NO privileged board access. Every primitive it
 * emits is one a human could legally issue (an in-bounds adjacent swap or a raise
 * toggle). A replay-legality diff test (test/alembic.test.js) proves it: record
 * the emitted stream, replay it on a fresh same-seed machine, assert identical
 * per-tick states. The AI's own RNG (separate from the machine's) decides only
 * WHICH primitives it emits, so the recording fully captures its influence.
 *
 * SKILL (0..1, TUNE) scales CADENCE and SELECTION, never the rules:
 *  - thinkMs: high skill thinks (acts) more often.
 *  - accuracy: high skill picks the widest available match; low skill fumbles to
 *    a random legal swap or does nothing.
 *  - raiseTarget: high skill keeps a taller working stack (more matches, more
 *    charge) but still respects danger -- it never raises into a top-out.
 * Determinism: given (seed, skill) the alembic is bit-for-bit reproducible.
 */
;(function (root, factory) {
  var AL = root.AL || (root.AL = {});
  factory(AL);
  if (typeof module !== "undefined" && module.exports) module.exports = AL;
})(typeof self !== "undefined" ? self : globalThis, function (AL) {
  function lerp(a, b, t) { return a + (b - a) * t; }

  function Alembic(opts) {
    opts = opts || {};
    this.skill = AL.clamp(opts.skill === undefined ? 0.5 : opts.skill, 0, 1);
    this.seed = (opts.seed === undefined ? 1 : opts.seed) >>> 0;
    this.gen = AL.rng(this.seed);
    // derived skill parameters (TUNE)
    this.thinkMs = lerp(620, 130, this.skill);   // faster hands at high skill
    this.accuracy = lerp(0.45, 0.98, this.skill);// how often it takes the best swap
    this.raiseTarget = Math.round(lerp(3, 7, this.skill)); // working stack height
    this.thinkTimer = lerp(0.2, 0.05, this.skill); // first move sooner at high skill
    this.raiseHeld = false;
    this.lastEmitted = [];      // primitives emitted on the most recent update
  }

  /* decide + emit primitives for this tick; returns the emitted primitive list
   * ([{kind:'swap',x,y}] and/or [{kind:'raise',held}]) for optional logging. */
  Alembic.prototype.update = function (machine, dt) {
    var emitted = [];
    if (machine.state === "lost") { this.lastEmitted = emitted; return emitted; }

    // raise discipline: build toward the working height, but NEVER into danger
    var want = this._wantRaise(machine);
    if (want !== this.raiseHeld) {
      machine.setRaise(want);
      this.raiseHeld = want;
      emitted.push({ kind: "raise", held: want });
    }

    this.thinkTimer -= dt;
    if (this.thinkTimer <= 0 && machine.state === "play") {
      this.thinkTimer = this.thinkMs / 1000;
      var mv = this._chooseSwap(machine);
      if (mv) {
        machine.requestSwap(mv.x, mv.y);
        emitted.push({ kind: "swap", x: mv.x, y: mv.y });
      }
    }
    this.lastEmitted = emitted;
    return emitted;
  };

  Alembic.prototype._wantRaise = function (machine) {
    if (machine.danger || machine.state !== "play") return false;
    return machine.grid.stackHeight() < this.raiseTarget;
  };

  /* does swapping (x,y)<->(x+1,y) create at least one match? returns the total
   * cells that would clear (0 if none / illegal). Non-mutating (swap + restore). */
  Alembic.prototype._swapValue = function (g, x, y) {
    var a = g.cells[y][x], b = g.cells[y][x + 1];
    if (a === null && b === null) return 0;
    if ((a && (a.dross || a.st === "clearing")) || (b && (b.dross || b.st === "clearing"))) return 0;
    g.cells[y][x] = b; g.cells[y][x + 1] = a;
    var n = g.findMatches().size;
    g.cells[y][x] = a; g.cells[y][x + 1] = b;
    return n;
  };

  /* choose a swap: the widest match-making swap (accuracy), else a random legal
   * fumble, else nothing. Only ever proposes in-bounds adjacent coordinates. */
  Alembic.prototype._chooseSwap = function (machine) {
    var g = machine.grid;
    var best = null, bestVal = 0, legal = [];
    for (var y = 0; y < g.rows; y++) {
      for (var x = 0; x < g.cols - 1; x++) {
        var a = g.cells[y][x], b = g.cells[y][x + 1];
        var swappable = !(a === null && b === null) &&
          !(a && (a.dross || a.st === "clearing")) && !(b && (b.dross || b.st === "clearing"));
        if (!swappable) continue;
        legal.push({ x: x, y: y });
        var v = this._swapValue(g, x, y);
        if (v > bestVal) { bestVal = v; best = { x: x, y: y }; }
      }
    }
    if (best && this.gen() < this.accuracy) return best;      // take the match
    if (legal.length && this.gen() < 0.15 + 0.25 * this.skill) // occasional fumble
      return legal[AL.randInt(this.gen, legal.length)];
    return null; // think and do nothing this beat
  };

  AL.Alembic = Alembic;
});
