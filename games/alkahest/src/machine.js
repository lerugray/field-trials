/* ALKAHEST -- machine: the animated well simulation (STUDY §7 tick ordering).
 *
 * Wraps the pure Grid in a deterministic, frame-rate-independent tick loop:
 * buffered swap -> gravity (one cell per fall cadence) -> match/clear with the
 * chain+combo counters -> rise (auto + manual raise), FROZEN while anything is
 * clearing or settling (stop-time) -> near-death + top-out. Given the same
 * (seed, per-tick inputs) it reproduces bit for bit; a replay test asserts it.
 *
 * The animated cascade must report the SAME chain/combo totals as
 * Grid.resolveCascade (the oracle). tick(dt) is pure sim; rendering reads state.
 */
;(function (root, factory) {
  var AL = root.AL || (root.AL = {});
  factory(AL);
  if (typeof module !== "undefined" && module.exports) module.exports = AL;
})(typeof self !== "undefined" ? self : globalThis, function (AL) {
  var DEFAULTS = {
    cols: 6, rows: 14, typeCount: 6,
    seedRows: 6,           // starting stack height
    risePerSec: 0.10,      // cells/sec base auto-rise (TUNE)
    riseAccel: 0.015,      // cells/sec added per elapsed second (acceleration)
    riseMax: 0.9,          // ceiling on the accelerated ramp (TUNE)
    raiseSpeed: 6.0,       // cells/sec while manual raise held (TUNE)
    fallInterval: 0.045,   // sec per one-cell fall step (TUNE)
    clearDuration: 0.36,   // sec a matched group dissolves = base freeze (TUNE)
    freezeDecay: 0.82,     // consecutive chain freezes diminish by this (no stall)
    clearDurationFloor: 0.14, // shortest freeze/dissolve (TUNE)
    swapBufferMs: 150,     // a swap pressed early executes when it becomes legal
    warnRow: 11,           // stack height at/over which near-death warns (TUNE)
    graceDuration: 1.6,    // sec of grace at the brink before loss (TUNE)

    // Weiss per-act physics (src/acts.js) -- neutral defaults; an act profile
    // bends exactly one of these (STUDY-run §2). The machine reads them here.
    sublimateAdjacent: false, // ALBEDO: a clear also removes one adjacent panel
    drossSendBonus: 0,        // CITRINITAS: outgoing slabs grow in attack dim
    drossRecvBonus: 0,        // CITRINITAS: incoming slabs land heavier
    allOrNothing: false,      // RUBEDO: chain<2 sends/charges nothing
    chainBrightMul: 1,        // RUBEDO: chain>=2 slabs + charge scale up

    // the athanor charge gauge (STUDY-run §3)
    athanorCap: 100,       // gauge ceiling; overflow is wasted (spend cadence)
    chargePerPanel: 1.0,   // charge per cleared panel (TUNE)
    chainBonus: 6,         // extra charge per chain link beyond the first (TUNE)
    comboBonus: 4          // extra charge per combo step (combo>=4) (TUNE)
  };

  function Machine(opts) {
    opts = opts || {};
    // an act profile (string name or object) bends one machine rule (STUDY-run §2);
    // explicit opts still win over the profile so tests can pin any single value.
    var prof = null;
    if (opts.act) prof = typeof opts.act === "string" ? AL.actProfile(opts.act) : opts.act;
    this.act = prof ? prof.name : (opts.actName || null);
    this.cfg = Object.assign({}, DEFAULTS, prof || {}, opts);
    this.seed = opts.seed === undefined ? 1 : opts.seed >>> 0;
    this.gen = AL.rng(this.seed);
    this.grid = new AL.Grid({ cols: this.cfg.cols, rows: this.cfg.rows, typeCount: this.cfg.typeCount });

    this.riseOffset = 0;
    this.raiseHeld = false;
    this.fallAccum = 0;
    this.clearing = null;      // { cells:Set, timer, combo }
    this.chain = 0;            // current cascade chain length (0 at rest)
    this.cascadeActive = false;
    this.state = "play";       // 'play' | 'grace' | 'lost'
    this.graceTimer = 0;
    this.danger = false;
    this.time = 0;

    // stats + last-event readout (for HUD / action legibility)
    this.stats = { swaps: 0, clears: 0, panelsCleared: 0, maxChain: 0, maxCombo: 0, rowsRisen: 0,
                   drossSent: 0, drossReceived: 0, transmuted: 0 };
    this.lastEvent = null;     // { chain, combo, t }

    // dross exchange (STUDY-duel): a receive queue crushes between cascades; the
    // outbox holds slabs this machine produced, drained by the duel orchestrator.
    this.drossQueue = [];      // [{ width, height }] incoming, waiting for a rest window
    this.outbox = [];          // [{ width, height }] outgoing, produced this cascade
    this._cascadeCombos = [];  // combo slabs accumulated during the current cascade
    this.lastCrush = null;     // { t, x0, width, height } for render legibility
    this.lastTransmute = null; // { t, count } for render legibility
    this.lastSublimate = null; // { t, key } ALBEDO collateral, for render

    // the athanor charge gauge (STUDY-run §3): fills from cascades, capped;
    // spent only by active formulae. Chains/combos charge faster than flat clears.
    this.athanor = 0;
    this._pendingCharge = 0;   // accrued this cascade, committed (gated) at its end
    this._everCharged = false; // has the gauge ever left zero this run?
    this.firstChargePulse = null; // one-shot { t } for the discoverability callout
    this.lastCharge = null;    // { t, amount } for the gauge fill flash

    // formula effects (STUDY-run §4): a base-cfg snapshot lets applyFormulae be
    // idempotent (rebuild from base + mods); flags drive passive reactions; the
    // actives list is bound to keys by the run; setupOps are applied at bout start.
    this._baseCfg = Object.assign({}, this.cfg);
    this.flags = {};
    this.actives = [];
    this.setupOps = [];
    this.lastBurn = null;    // { t, count } Calcination reaction, for render
    this.lastCast = null;    // { t, id, kind } active cast, for render

    this._seedStack();
    this._pendingSwap = null;
  }

  /* apply a folio's resolved effects (STUDY-run §4). Idempotent: cfg rebuilds
   * from the base snapshot, so re-applying after a draft/upgrade is safe. Standing
   * mods merge into cfg; passive reactions become flags; actives are collected for
   * key-binding; setup ops (e.g. opening dross) are surfaced for the run to apply. */
  Machine.prototype.applyFormulae = function (folio) {
    var cards = folio && folio.cards ? folio.cards : (folio || []);
    this.cfg = Object.assign({}, this._baseCfg);
    this.flags = {};
    this.actives = [];
    this.setupOps = [];
    for (var i = 0; i < cards.length; i++) {
      var e = AL.formulaResolve(cards[i]);
      if (e.mods) {
        for (var k in e.mods) {
          if (!Object.prototype.hasOwnProperty.call(e.mods, k)) continue;
          var m = e.mods[k], v = this.cfg[k];
          if (m.add) v += m.add;
          if (m.mul) v *= m.mul;
          this.cfg[k] = v;
        }
      }
      if (e.flag) this.flags[e.flag.name] = e.flag.threshold === undefined ? true : e.flag.threshold;
      if (e.active) this.actives.push({ id: cards[i].id, name: cards[i].name, glyph: cards[i].glyph, cost: e.active.cost, spec: e.active });
      if (e.setup) this.setupOps.push(e.setup);
    }
    return this;
  };

  /* seed a starting stack with no pre-existing matches */
  Machine.prototype._seedStack = function () {
    for (var r = 0; r < this.cfg.seedRows; r++) {
      var row = this.grid.generateRow(this.gen);
      // shift up and place at bottom
      this._shiftUp();
      for (var x = 0; x < this.cfg.cols; x++) this.grid.cells[0][x] = AL.panel(row[x]);
    }
  };

  Machine.prototype._shiftUp = function () {
    var g = this.grid;
    for (var y = g.rows - 1; y >= 1; y--) g.cells[y] = g.cells[y - 1];
    g.cells[0] = new Array(g.cols).fill(null);
  };

  /* ---- input: queue a swap of (x,y)/(x+1,y); executed at the next tick ---- */
  Machine.prototype.requestSwap = function (x, y) {
    this._pendingSwap = { x: x, y: y, timer: this.cfg.swapBufferMs };
  };
  Machine.prototype.setRaise = function (held) { this.raiseHeld = !!held; };

  /* ---- one simulation step ---- */
  Machine.prototype.tick = function (dt) {
    if (this.state === "lost") return;
    this.time += dt;

    // 1. buffered input: a swap pressed while its target is momentarily illegal
    // (a cell finishing a clear) is held and executed when it becomes legal,
    // within the swap-buffer window (STUDY §2 -- a measured number).
    if (this._pendingSwap) {
      var ps = this._pendingSwap;
      if (this.grid.swap(ps.x, ps.y)) {
        this.stats.swaps++;
        this._pendingSwap = null;
      } else {
        ps.timer -= dt * 1000;
        if (ps.timer <= 0) this._pendingSwap = null; // window elapsed, drop it
      }
    }

    // 2/3/4. clearing has priority; otherwise gravity then match
    if (this.clearing) {
      this.clearing.timer -= dt;
      if (this.clearing.timer <= 0) {
        var cleared = this.clearing.cells;
        this.grid.removeCells(cleared);
        // ALBEDO volatile clears (STUDY-run §2) OR the Volatility passive
        // (combo >= threshold): a dissolution also sublimates ONE adjacent live
        // panel -- collateral, not chain-tagged; a natural chained match may follow.
        var comboSub = this.flags.comboSublimate && this.clearing.combo >= this.flags.comboSublimate;
        if (this.cfg.sublimateAdjacent || comboSub) {
          var sub = this.grid.pickSublimation(cleared);
          if (sub) {
            var sp = sub.split(","); this.grid.cells[+sp[1]][+sp[0]] = null;
            this.stats.panelsCleared++;
            this.lastSublimate = { t: this.time, key: sub };
          }
        }
        // a clear adjacent to dross peels its bottom row into chain-tagged live
        // panels (STUDY-duel §2); those settle and may CONTINUE the chain.
        var born = this.grid.transmute(cleared, this.gen, this.chain);
        if (born.length) { this.stats.transmuted += born.length; this.lastTransmute = { t: this.time, count: born.length }; }
        this.clearing = null;
      }
    } else {
      this.fallAccum += dt;
      var guard = 0;
      while (this.fallAccum >= this.cfg.fallInterval && guard++ < 64) {
        this.fallAccum -= this.cfg.fallInterval;
        if (!this.grid.collapseOneStep()) break;
      }
      if (!this.grid.hasFloating()) {
        var hits = this.grid.findMatches();
        if (hits.size > 0) {
          this._beginClear(hits);
        } else if (this.cascadeActive) {
          this._emitDross();      // the cascade ended -> send its chain/combo dross
          this._commitCharge();   // ...and bank its athanor charge (act-gated)
          // Calcination passive: a chain of >= threshold burns one dross row here
          if (this.flags.burnDrossOnChain && this.chain >= this.flags.burnDrossOnChain) {
            var burned = this.grid.burnBottomDrossRow();
            if (burned) this.lastBurn = { t: this.time, count: burned };
          }
          this.chain = 0;
          this.cascadeActive = false;
        }
      }
    }

    // incoming dross crushes ONLY when the well is fully at rest, between
    // cascades -- chain continuity is sacred (STUDY-duel §3).
    if (this.drossQueue.length && this.clearing === null && !this.grid.hasFloating() &&
        this.grid.findMatches().size === 0 && !this.cascadeActive && this.state === "play") {
      this._applyDross();
    }

    // 5. rise -- frozen while clearing or settling (stop-time), and during grace
    var frozen = this.clearing !== null || this.grid.hasFloating() ||
                 this.grid.findMatches().size > 0 || this.state === "grace";
    if (!frozen) this._advanceRise(dt);

    // 6. near-death + top-out
    this._updateDanger(dt);
  };

  Machine.prototype._beginClear = function (hits) {
    var self = this;
    hits.forEach(function (k) {
      var p = k.split(","), c = self.grid.cells[+p[1]][+p[0]];
      if (c) c.st = "clearing";
    });
    this.chain++;
    this.cascadeActive = true;
    var combo = hits.size;
    // diminishing freeze: each consecutive chain link freezes for less time,
    // floored, so a long cascade can never stall the rise forever (STUDY §8).
    var dur = Math.max(this.cfg.clearDurationFloor,
      this.cfg.clearDuration * Math.pow(this.cfg.freezeDecay, this.chain - 1));
    this.clearing = { cells: hits, timer: dur, combo: combo, dur: dur };
    this.stats.clears++;
    this.stats.panelsCleared += combo;
    if (this.chain > this.stats.maxChain) this.stats.maxChain = this.chain;
    if (combo > this.stats.maxCombo) this.stats.maxCombo = combo;
    // a wide clear (combo) accrues a shallow slab, sent when the cascade ends
    var cs = this._comboSlab(combo);
    if (cs) this._cascadeCombos.push(cs);
    // athanor charge accrues per step; committed (and gated by act) at cascade end
    this._pendingCharge += combo * this.cfg.chargePerPanel +
      (this.chain > 1 ? this.cfg.chainBonus : 0) +
      (combo >= 4 ? this.cfg.comboBonus : 0);
    this.lastEvent = { chain: this.chain, combo: combo, t: this.time };
  };

  /* ---- dross exchange mapping (STUDY-duel §1): breadth->width, depth->height ----
   * combo of N panels (N>=4) -> one width-(N-1), height-1 slab (wide, shallow);
   * chain of length L (L>=2) -> one full-width, height-(L-1) slab (deep). */
  Machine.prototype._comboSlab = function (combo) {
    if (combo < 4) return null;
    return { width: Math.min(combo - 1, this.cfg.cols), height: 1 };
  };
  Machine.prototype._chainSlab = function (chain) {
    if (chain < 2) return null;
    return { width: this.cfg.cols, height: chain - 1 };
  };

  /* flush the finished cascade's offense into the outbox (drained by the duel).
   * Per-act modifiers (STUDY-run §2): RUBEDO all-or-nothing suppresses a chain<2
   * cascade entirely and scales chain>=2 slabs by chainBrightMul; CITRINITAS adds
   * drossSendBonus to each slab's ATTACK dimension (chain->height, combo->width). */
  Machine.prototype._emitDross = function () {
    // RUBEDO: a lone clear (chain 1) yields nothing at all
    if (this.cfg.allOrNothing && this.chain < 2) { this._cascadeCombos = []; return; }
    var mul = this.chain >= 2 ? this.cfg.chainBrightMul : 1;
    var send = this.cfg.drossSendBonus;
    var slabs = [];
    var chainSlab = this._chainSlab(this.chain);
    if (chainSlab) {
      chainSlab.height = Math.max(1, Math.round(chainSlab.height * mul) + send);
      slabs.push(chainSlab);
    }
    for (var i = 0; i < this._cascadeCombos.length; i++) {
      var cs = this._cascadeCombos[i];
      cs.width = Math.min(this.cfg.cols, Math.max(1, Math.round(cs.width * mul) + send));
      slabs.push(cs);
    }
    for (var j = 0; j < slabs.length; j++) {
      this.outbox.push(slabs[j]);
      this.stats.drossSent += slabs[j].width * slabs[j].height;
    }
    this._cascadeCombos = [];
  };

  /* bank the cascade's accrued charge into the athanor (STUDY-run §3). RUBEDO
   * all-or-nothing gates a chain<2 cascade to zero; chain>=2 charges brighter.
   * Capped -- overflow is wasted (forces a spend cadence). Fires the one-shot
   * first-charge pulse the first time the gauge leaves zero this run. */
  Machine.prototype._commitCharge = function () {
    var gain = this._pendingCharge;
    this._pendingCharge = 0;
    if (this.cfg.allOrNothing && this.chain < 2) gain = 0;
    else if (this.chain >= 2) gain *= this.cfg.chainBrightMul;
    if (gain <= 0) return;
    var before = this.athanor;
    this.athanor = Math.min(this.cfg.athanorCap, this.athanor + gain);
    this.lastCharge = { t: this.time, amount: this.athanor - before };
    if (!this._everCharged && this.athanor > 0) {
      this._everCharged = true;
      this.firstChargePulse = { t: this.time };
    }
  };

  /* spend charge for an active formula cast; true if it could be paid in full.
   * The only sink on the gauge -- passive/bargain formulae never touch it. */
  Machine.prototype.spendAthanor = function (cost) {
    if (cost <= 0) return true;
    if (this.athanor + 1e-9 >= cost) { this.athanor = Math.max(0, this.athanor - cost); return true; }
    return false;
  };
  Machine.prototype.athanorFrac = function () { return this.athanor / this.cfg.athanorCap; };

  /* cast an active formula (STUDY-run §4). Charge is spent ONLY if the brew does
   * something (a no-op never wastes charge). `arg` supplies the player's choice
   * where the brew needs one (a column index, a reagent type). Returns
   * { ok, reason } -- reason 'charge' | 'need-column' | 'need-type' | 'empty'. */
  Machine.prototype.castActive = function (card, arg) {
    if (this.state === "lost") return { ok: false, reason: "lost" };
    if (!card) return { ok: false, reason: "not-active" };
    var e = AL.formulaResolve(card);
    if (!e.active) return { ok: false, reason: "not-active" };
    var cost = e.active.cost;
    if (this.athanor + 1e-9 < cost) return { ok: false, reason: "charge" };
    var did = this._runActive(e.active, arg);
    if (!did.ok) return did;                 // no-op: no charge spent
    this.spendAthanor(cost);
    this.lastCast = { t: this.time, id: card.id, kind: e.active.kind };
    return { ok: true };
  };

  Machine.prototype._runActive = function (spec, arg) {
    var g = this.grid, n;
    switch (spec.kind) {
      case "dissolveColumn":
        if (arg === undefined || arg === null) return { ok: false, reason: "need-column" };
        n = g.dissolveColumn(arg); return { ok: n > 0, reason: n > 0 ? null : "empty" };
      case "dissolveRow":
        n = g.dissolveLowestRows(spec.rows || 1); return { ok: n > 0, reason: n > 0 ? null : "empty" };
      case "dissolveType":
        if (arg === undefined || arg === null) return { ok: false, reason: "need-type" };
        n = g.dissolveType(arg); return { ok: n > 0, reason: n > 0 ? null : "empty" };
      case "transmuteAll":
        var born = g.transmuteAllBottomRows(this.gen, 0);
        if (born.length) this.stats.transmuted += born.length;
        return { ok: born.length > 0, reason: born.length ? null : "empty" };
      case "sendSlab":
        this.outbox.push({ width: spec.width, height: spec.height });
        this.stats.drossSent += spec.width * spec.height;
        return { ok: true };
      default: return { ok: false, reason: "unknown" };
    }
  };

  /* enqueue an incoming slab (from the opponent); it crushes at the next rest */
  Machine.prototype.receiveDross = function (spec) {
    if (spec && spec.width > 0 && spec.height > 0) this.drossQueue.push({ width: spec.width, height: spec.height });
  };

  /* crush one queued slab onto the stack at a deterministic column */
  Machine.prototype._applyDross = function () {
    var spec = this.drossQueue.shift();
    var w = Math.min(spec.width, this.cfg.cols);
    // CITRINITAS: incoming slabs land heavier (STUDY-run §2)
    var h = spec.height + this.cfg.drossRecvBonus;
    var span = this.cfg.cols - w;
    var x0 = span > 0 ? AL.randInt(this.gen, span + 1) : 0;
    this.grid.addSlab(x0, w, h);
    this.stats.drossReceived += w * h;
    this.lastCrush = { t: this.time, x0: x0, width: w, height: h };
  };

  /* drain outgoing slabs (the orchestrator routes these to the opponent) */
  Machine.prototype.drainOutbox = function () {
    var out = this.outbox;
    this.outbox = [];
    return out;
  };

  /* effective auto-rise: base ramps up with elapsed time (acceleration), capped;
   * an explicitly high base is never capped below itself (used by tests/tuning). */
  Machine.prototype.effectiveRise = function () {
    // A zero base is the explicit auto-rise-off sentinel used by planted
    // tutorial boards. Acceleration must not turn an opted-out board back on.
    if (this.cfg.risePerSec === 0) return 0;
    var cap = Math.max(this.cfg.riseMax, this.cfg.risePerSec);
    return Math.min(cap, this.cfg.risePerSec + this.cfg.riseAccel * this.time);
  };

  Machine.prototype._advanceRise = function (dt) {
    var spd = this.raiseHeld ? this.cfg.raiseSpeed : this.effectiveRise();
    this.riseOffset += spd * dt;
    while (this.riseOffset >= 1) {
      this.riseOffset -= 1;
      this._commitRow();
      if (this.state === "grace" || this.state === "lost") { this.riseOffset = 0; break; }
    }
  };

  Machine.prototype._commitRow = function () {
    var g = this.grid;
    // would this push a panel out the top? -> top-out brink
    for (var x = 0; x < g.cols; x++) {
      if (g.cells[g.rows - 1][x] !== null) { this._enterGrace(); return; }
    }
    var row = g.generateRow(this.gen); // uses current bottom rows for no-instant-match
    this._shiftUp();
    for (var xx = 0; xx < g.cols; xx++) g.cells[0][xx] = AL.panel(row[xx]);
    this.stats.rowsRisen++;
  };

  Machine.prototype._enterGrace = function () {
    if (this.state !== "grace") { this.state = "grace"; this.graceTimer = this.cfg.graceDuration; }
  };

  Machine.prototype._updateDanger = function (dt) {
    var h = this.grid.stackHeight();
    this.danger = h >= this.cfg.warnRow;
    if (this.state === "grace") {
      // saved if the stack has dropped below the ceiling and nothing is jammed
      if (h < this.grid.rows) { this.state = "play"; this.graceTimer = 0; }
      else {
        this.graceTimer -= dt;
        if (this.graceTimer <= 0) this.state = "lost";
      }
    }
  };

  /* rise as a fraction toward the next committed row (for smooth render offset) */
  Machine.prototype.risePixels = function (cellSize) { return this.riseOffset * cellSize; };
  Machine.prototype.isClearing = function () { return this.clearing !== null; };
  Machine.prototype.isFrozen = function () {
    return this.clearing !== null || this.grid.hasFloating() ||
           this.grid.findMatches().size > 0 || this.state === "grace";
  };

  AL.Machine = Machine;
  AL.MACHINE_DEFAULTS = DEFAULTS;
});
