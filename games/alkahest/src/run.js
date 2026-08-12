/* ALKAHEST -- run: the Magnum Opus orchestrator (STUDY-run §1, §4-§8).
 *
 * Drives one run: a four-act ladder (NIGREDO, ALBEDO, CITRINITAS, RUBEDO) of
 * three bouts each -- two lesser alembics then the act's master with named
 * formulae. Between bouts the player drafts one formula (one of each class,
 * skippable); between acts a workshop lets them remove or upgrade one. Losing a
 * bout ruins the run; beating the Rubedo master completes the opus. Everything
 * derives from a single run seed, so a run replays bit-for-bit given the player's
 * inputs + draft/workshop choices (STUDY-run §8).
 *
 * The Run is a state machine the scene pumps: state in
 * 'bout' | 'draft' | 'workshop' | 'won' | 'ruined'. It owns the player's Folio,
 * builds each bout's Duel (act physics + both folios applied), and exposes the
 * rival's telegraphed signature (name + named formulae).
 */
;(function (root, factory) {
  var AL = root.AL || (root.AL = {});
  factory(AL);
  if (typeof module !== "undefined" && module.exports) module.exports = AL;
})(typeof self !== "undefined" ? self : globalThis, function (AL) {
  var BOUTS_PER_ACT = 3;
  var TOTAL_BOUTS = 12;

  // clean-room rival roster (invented names) and their telegraphed loadouts.
  // Lesser rivals carry 0-1 standing formula; each act master carries 1-2 and is
  // the act's signature. Rivals only benefit from passive/bargain formulae (the
  // AI never casts actives), so every entry here is passive or bargain.
  var RIVALS = [
    { name: "Verdigris",          formulae: [] },                      // mercy opener
    { name: "Orpiment",           formulae: ["ceration"] },
    { name: "the Leaden Alembic", formulae: ["blackSun"], master: true },
    { name: "Cinnabar Adept",     formulae: ["conjunction"] },
    { name: "Vitriol",            formulae: ["separation"] },
    { name: "the Bone Kiln",      formulae: ["leadWeight"], master: true },
    { name: "Auripigment",        formulae: ["ceration"] },
    { name: "Marcasite",          formulae: ["blackSun"] },
    { name: "the Golden Retort",  formulae: ["feverPitch"], master: true },
    { name: "Realgar",            formulae: ["separation"] },
    { name: "Antimony",           formulae: ["leadWeight"] },
    { name: "the Crimson Magnum", formulae: ["blackSun", "feverPitch"], master: true }
  ];

  /* deterministic per-bout, per-purpose seed from (runSeed, boutIndex, tag) */
  function derive(seed, g, tag) {
    var h = (seed >>> 0) ^ Math.imul(g + 1, 0x9e3779b1);
    h >>>= 0;
    for (var i = 0; i < tag.length; i++) h = Math.imul(h ^ tag.charCodeAt(i), 0x01000193) >>> 0;
    return h >>> 0;
  }

  /* the ladder skill curve (STUDY-run §1): monotonic non-decreasing, mercy at g0.
   * The SHAPE (rising, no cliff) is what the seed fixes; magnitudes are TUNE. */
  function rivalSkill(g) {
    if (g === 0) return 0.20;                 // mercy: the gentlest opener
    return AL.clamp(0.32 + g * 0.052, 0, 0.98);
  }

  function Run(opts) {
    opts = opts || {};
    this.seed = (opts.seed === undefined ? 1 : opts.seed) >>> 0;
    this.folio = opts.folio || new AL.Folio({ cap: opts.folioCap || 8 });
    this.boutIndex = 0;
    this.state = "bout";
    this.draftOffer = null;
    this.rivalInfo = null;
    this.actName = null;
    this.duel = null;
    this._everHadActive = false;   // has the folio ever held an active brew?
    this.firstActiveDraft = false; // one-shot: teach the cast key on first active
    // roll-up stats for the run-end screens (STUDY-run §7)
    this.history = { boutsWon: 0, actsCleared: 0, bestChain: 0, panelsDissolved: 0, drossSent: 0 };
    this._startBout();
  }

  Run.prototype.actIndex = function () { return Math.floor(this.boutIndex / BOUTS_PER_ACT); };
  Run.prototype.boutInAct = function () { return this.boutIndex % BOUTS_PER_ACT; };
  Run.prototype.isActMaster = function () { return this.boutInAct() === BOUTS_PER_ACT - 1; };
  Run.prototype.rivalSkill = rivalSkill;

  /* build a folio for a rival's telegraphed loadout */
  Run.prototype._rivalFolio = function (g) {
    var f = new AL.Folio({ cap: 8 });
    RIVALS[g].formulae.forEach(function (id) { f.add(id); });
    return f;
  };

  /* apply any bout-setup dross (the Hunger bargain: open with a slab) */
  function applySetup(m) {
    for (var i = 0; i < m.setupOps.length; i++) if (m.setupOps[i].startDross) m.receiveDross(m.setupOps[i].startDross);
  }

  Run.prototype._startBout = function () {
    var g = this.boutIndex;
    this.actName = AL.ACT_ORDER[this.actIndex()];
    var prof = AL.actProfile(this.actName);
    var mCfg = { act: prof, seedRows: 6 };
    if (g === 0) mCfg.risePerSec = 0.06; // mercy: a gentler rise for bout 1
    var duel = new AL.Duel({
      seedP: derive(this.seed, g, "player"),
      seedR: derive(this.seed, g, "rival"),
      aiSeed: derive(this.seed, g, "alembic"),
      skill: rivalSkill(g),
      machine: mCfg
    });
    duel.player.applyFormulae(this.folio);
    applySetup(duel.player);
    var rf = this._rivalFolio(g);
    duel.rival.applyFormulae(rf);
    applySetup(duel.rival);
    this.duel = duel;
    this.rivalInfo = {
      name: RIVALS[g].name,
      master: !!RIVALS[g].master,
      formulae: rf.cards.map(function (c) { return c.name; }),
      act: this.actName,
      skill: rivalSkill(g)
    };
    this.state = "bout";
  };

  Run.prototype.tick = function (dt) {
    if (this.state !== "bout") return;
    this.duel.tick(dt);
    if (this.duel.state === "won") this._afterWin();
    else if (this.duel.state === "lost") this._afterLoss();
  };

  Run.prototype._recordBout = function () {
    var s = this.duel.player.stats;
    if (s.maxChain > this.history.bestChain) this.history.bestChain = s.maxChain;
    this.history.panelsDissolved += s.panelsCleared;
    this.history.drossSent += s.drossSent;
  };

  Run.prototype._afterLoss = function () {
    this._recordBout();
    this.state = "ruined";   // single-elimination: the work is ruined
  };

  Run.prototype._afterWin = function () {
    this._recordBout();
    this.history.boutsWon++;
    if (this.isActMaster()) this.history.actsCleared++;
    if (this.boutIndex >= TOTAL_BOUTS - 1) { this.state = "won"; return; } // opus complete
    // reward the win with a draft (one of each class, deterministic, skippable)
    this.draftOffer = AL.draftOffer(this.folio.ownedIds(), AL.rng(derive(this.seed, this.boutIndex, "draft")));
    this.state = "draft";
  };

  /* resolve the draft. pickId adds that formula; null skips. If the folio is full
   * a discardId must be supplied (else { needsDiscard:true } is returned so the
   * scene can prompt). After the draft, an act boundary opens the workshop. */
  Run.prototype.resolveDraft = function (pickId, discardId) {
    if (this.state !== "draft") return { ok: false };
    if (pickId) {
      if (this.folio.isFull()) {
        if (!discardId) return { needsDiscard: true };
        this.folio.discard(discardId);
      }
      this.folio.add(pickId);
      // first-active-draft discoverability (studio amendment): flag once so the
      // bout HUD can teach the cast key the first time a brew enters the folio
      if (!this._everHadActive && this.folio.actives().length > 0) {
        this._everHadActive = true;
        this.firstActiveDraft = true;
      }
    }
    this.draftOffer = null;
    if (this.isActMaster()) { this.state = "workshop"; return { ok: true, workshop: true }; }
    this._advance();
    return { ok: true };
  };

  /* resolve the between-acts workshop (STUDY-run §5): remove OR upgrade one
   * formula, or skip. Then the next act's first bout begins. */
  Run.prototype.resolveWorkshop = function (op) {
    if (this.state !== "workshop") return { ok: false };
    op = op || { kind: "skip" };
    if (op.kind === "remove" && op.id) this.folio.discard(op.id);
    else if (op.kind === "upgrade" && op.id) this.folio.upgrade(op.id);
    this._advance();
    return { ok: true };
  };

  Run.prototype._advance = function () {
    this.boutIndex++;
    this._startBout();
  };

  Run.prototype.isOver = function () { return this.state === "won" || this.state === "ruined"; };

  AL.Run = Run;
  AL.RUN = { BOUTS_PER_ACT: BOUTS_PER_ACT, TOTAL_BOUTS: TOTAL_BOUTS, RIVALS: RIVALS, rivalSkill: rivalSkill, derive: derive };
});
