/* ALKAHEST -- formulae: the folio catalogue, the folio (deck), and the draft
 * (STUDY-run §4). Sixteen formulae across three classes; every effect alters
 * play the player can SEE and works THROUGH the panel machine (no ignore-the-board
 * damage), and none automates chaining itself. Effects are DECLARATIVE DATA the
 * machine interprets at pinned hook points -- no card runs arbitrary board code.
 *
 * Card text uses only vocabulary the tutorialette taught (swap, clear, chain,
 * combo, raise, rescue, dross, transmute). Iconography obeys the shape+glyph
 * colorblind law: a per-class SHAPE plus a per-card GLYPH letter, never colour
 * alone (the UI draws these in M3.7).
 *
 * An effect snapshot `eff` is { text, mods?, flag?, active?, setup? }:
 *   mods   -> standing cfg deltas the machine merges at bout start ({add?,mul?})
 *   flag   -> a passive reaction the machine implements by name ({name,threshold?})
 *   active -> a castable brew ({kind, cost, ...params}) bound to a key
 *   setup  -> a bout-setup instruction the run applies (e.g. startDross)
 * `up` is the upgraded override merged over eff (STUDY-run §5 workshop).
 */
;(function (root, factory) {
  var AL = root.AL || (root.AL = {});
  factory(AL);
  if (typeof module !== "undefined" && module.exports) module.exports = AL;
})(typeof self !== "undefined" ? self : globalThis, function (AL) {
  var CLASSES = {
    passive: { key: "passive", label: "REACTION", shape: "triangle" },
    active:  { key: "active",  label: "BREW",     shape: "diamond" },
    bargain: { key: "bargain", label: "BARGAIN",  shape: "hexagon" }
  };

  // ---- the catalogue: 16 formulae (6 passive, 5 active, 5 bargain) ----
  var CATALOGUE = [
    // --- PASSIVES (reactions): always on once drafted, no charge ---
    { id: "calcination", name: "Calcination", cls: "passive", glyph: "C",
      eff: { text: "Chains of 3 or more also burn one dross row in your well.",
             flag: { name: "burnDrossOnChain", threshold: 3 } },
      up:  { text: "Chains of 2 or more also burn one dross row in your well.",
             flag: { name: "burnDrossOnChain", threshold: 2 } } },
    { id: "fixation", name: "Fixation", cls: "passive", glyph: "F",
      eff: { text: "Your rescue freeze holds a little longer.",
             mods: { clearDuration: { mul: 1.25 } } },
      up:  { text: "Your rescue freeze holds much longer.",
             mods: { clearDuration: { mul: 1.5 } } } },
    { id: "conjunction", name: "Conjunction", cls: "passive", glyph: "J",
      eff: { text: "Your combos charge the athanor faster.",
             mods: { comboBonus: { add: 4 } } },
      up:  { text: "Your combos charge the athanor much faster.",
             mods: { comboBonus: { add: 8 } } } },
    { id: "separation", name: "Separation", cls: "passive", glyph: "S",
      eff: { text: "Your chains charge the athanor faster.",
             mods: { chainBonus: { add: 4 } } },
      up:  { text: "Your chains charge the athanor much faster.",
             mods: { chainBonus: { add: 8 } } } },
    { id: "volatility", name: "Volatility", cls: "passive", glyph: "V",
      eff: { text: "Each combo of 4 or more sublimates one reagent beside it.",
             flag: { name: "comboSublimate", threshold: 4 } },
      up:  { text: "Each combo of 3 or more sublimates one reagent beside it.",
             flag: { name: "comboSublimate", threshold: 3 } } },
    { id: "ceration", name: "Ceration", cls: "passive", glyph: "R",
      eff: { text: "Raising the stack runs smoother and faster.",
             mods: { raiseSpeed: { add: 2 } } },
      up:  { text: "Raising the stack runs much faster.",
             mods: { raiseSpeed: { add: 4 } } } },

    // --- ACTIVES (brews): spend athanor, bound to a key, visible cost ---
    { id: "aquaRegia", name: "Aqua Regia", cls: "active", glyph: "A",
      eff: { text: "Dissolve one chosen column of reagents.", active: { kind: "dissolveColumn", cost: 40 } },
      up:  { text: "Dissolve a chosen column for less charge.", active: { kind: "dissolveColumn", cost: 28 } } },
    { id: "solvent", name: "Solvent", cls: "active", glyph: "L",
      eff: { text: "Dissolve the lowest row of live reagents.", active: { kind: "dissolveRow", cost: 25 } },
      up:  { text: "Dissolve the lowest two rows of live reagents.", active: { kind: "dissolveRow", cost: 30, rows: 2 } } },
    { id: "quintessence", name: "Quintessence", cls: "active", glyph: "Q",
      eff: { text: "Transmute every dross slab's bottom row at once.", active: { kind: "transmuteAll", cost: 60 } },
      up:  { text: "Transmute every dross slab's bottom row for less charge.", active: { kind: "transmuteAll", cost: 45 } } },
    { id: "distillation", name: "Distillation", cls: "active", glyph: "D",
      eff: { text: "Clear every reagent of one chosen kind.", active: { kind: "dissolveType", cost: 35 } },
      up:  { text: "Clear every reagent of a chosen kind for less charge.", active: { kind: "dissolveType", cost: 24 } } },
    { id: "precipitate", name: "Precipitate", cls: "active", glyph: "P",
      eff: { text: "Send a dross slab to your rival at once.", active: { kind: "sendSlab", cost: 50, width: 4, height: 1 } },
      up:  { text: "Send a heavier dross slab to your rival at once.", active: { kind: "sendSlab", cost: 50, width: 5, height: 2 } } },

    // --- BARGAINS: a stronger standing effect with a standing cost ---
    { id: "blackSun", name: "Black Sun", cls: "bargain", glyph: "B",
      eff: { text: "Your dross runs heavier. Cost: your stack rises faster.",
             mods: { drossSendBonus: { add: 1 }, risePerSec: { mul: 1.15 } } },
      up:  { text: "Your dross runs much heavier. Cost: your stack rises faster.",
             mods: { drossSendBonus: { add: 2 }, risePerSec: { mul: 1.15 } } } },
    { id: "leadWeight", name: "Lead Weight", cls: "bargain", glyph: "W",
      eff: { text: "The athanor fills faster. Cost: incoming dross lands heavier.",
             mods: { chargePerPanel: { mul: 1.5 }, drossRecvBonus: { add: 1 } } },
      up:  { text: "The athanor fills much faster. Cost: incoming dross lands heavier.",
             mods: { chargePerPanel: { mul: 2 }, drossRecvBonus: { add: 1 } } } },
    { id: "feverPitch", name: "Fever Pitch", cls: "bargain", glyph: "H",
      eff: { text: "Reagents fall faster. Cost: less grace at the brink.",
             mods: { fallInterval: { mul: 0.7 }, graceDuration: { mul: 0.7 } } },
      up:  { text: "Reagents fall much faster. Cost: less grace at the brink.",
             mods: { fallInterval: { mul: 0.5 }, graceDuration: { mul: 0.7 } } } },
    { id: "hunger", name: "Hunger", cls: "bargain", glyph: "G",
      eff: { text: "Every clear charges the athanor. Cost: you open with a dross slab.",
             mods: { chargePerPanel: { add: 0.5 } }, setup: { startDross: { width: 4, height: 1 } } },
      up:  { text: "Every clear charges the athanor a lot. Cost: you open with a dross slab.",
             mods: { chargePerPanel: { add: 1 } }, setup: { startDross: { width: 4, height: 1 } } } },
    { id: "mercury", name: "Mercury", cls: "bargain", glyph: "M",
      eff: { text: "Swaps buffer far longer, very forgiving. Cost: your stack rises faster.",
             mods: { swapBufferMs: { add: 150 }, risePerSec: { mul: 1.12 } } },
      up:  { text: "Swaps buffer enormously long. Cost: your stack rises faster.",
             mods: { swapBufferMs: { add: 300 }, risePerSec: { mul: 1.12 } } } }
  ];

  var BY_ID = {};
  for (var i = 0; i < CATALOGUE.length; i++) BY_ID[CATALOGUE[i].id] = CATALOGUE[i];

  /* a deep-ish clone of a catalogue entry into a per-run folio instance, so
   * `upgraded` is tracked per copy and never mutates the shared catalogue. */
  function cloneFormula(f) {
    return { id: f.id, name: f.name, cls: f.cls, glyph: f.glyph,
             eff: f.eff, up: f.up, upgraded: false };
  }

  /* resolve a folio card to its EFFECTIVE effect snapshot (base, or the upgraded
   * override merged over base). This is the single place upgrade logic lives; the
   * machine + run consume the resolved snapshot and never inspect `upgraded`. */
  function resolve(card) {
    if (!card.upgraded || !card.up) return card.eff;
    var out = { text: card.up.text || card.eff.text };
    out.mods = card.up.mods || card.eff.mods;
    out.flag = card.up.flag || card.eff.flag;
    out.active = card.up.active || card.eff.active;
    out.setup = card.up.setup || card.eff.setup;
    return out;
  }

  function cost(card) { var e = resolve(card); return e.active ? e.active.cost : 0; }

  // ---- the folio (deck) ----
  function Folio(opts) {
    opts = opts || {};
    this.cap = opts.cap || 8;
    this.cards = [];
  }
  Folio.prototype.has = function (id) { return this.cards.some(function (c) { return c.id === id; }); };
  Folio.prototype.ownedIds = function () { var s = new Set(); this.cards.forEach(function (c) { s.add(c.id); }); return s; };
  Folio.prototype.isFull = function () { return this.cards.length >= this.cap; };
  Folio.prototype.get = function (id) { for (var i = 0; i < this.cards.length; i++) if (this.cards[i].id === id) return this.cards[i]; return null; };
  Folio.prototype.count = function () { return this.cards.length; };
  Folio.prototype.byClass = function (cls) { return this.cards.filter(function (c) { return c.cls === cls; }); };
  Folio.prototype.actives = function () { return this.byClass("active"); };

  /* add a formula (by catalogue id or a card object). No duplicates and no
   * same-name stacking (both are the same id here). Returns "added" | "duplicate"
   * | "full" so the caller (draft UI) can prompt a discard when full. */
  Folio.prototype.add = function (idOrCard) {
    var src = typeof idOrCard === "string" ? BY_ID[idOrCard] : idOrCard;
    if (!src) return "unknown";
    if (this.has(src.id)) return "duplicate";
    if (this.isFull()) return "full";
    this.cards.push(src.upgraded !== undefined && src.eff ? src : cloneFormula(src));
    return "added";
  };
  Folio.prototype.discard = function (id) {
    var n = this.cards.length;
    this.cards = this.cards.filter(function (c) { return c.id !== id; });
    return this.cards.length < n;
  };
  Folio.prototype.upgrade = function (id) {
    var c = this.get(id);
    if (!c || c.upgraded || !c.up) return false;
    c.upgraded = true;
    return true;
  };

  /* the draft offer (STUDY-run §4): one un-owned formula of EACH class, chosen
   * deterministically from `gen` (an AL.rng). A class with no un-owned formula
   * left is simply absent from the offer. Never offers an owned formula. */
  function draftOffer(ownedIds, gen) {
    var owned = ownedIds instanceof Set ? ownedIds : new Set(ownedIds || []);
    var offer = [];
    ["passive", "active", "bargain"].forEach(function (cls) {
      var pool = CATALOGUE.filter(function (f) { return f.cls === cls && !owned.has(f.id); });
      if (pool.length) offer.push(cloneFormula(pool[AL.randInt(gen, pool.length)]));
    });
    return offer;
  }

  AL.CLASSES = CLASSES;
  AL.CATALOGUE = CATALOGUE;
  AL.formulaById = function (id) { return BY_ID[id]; };
  AL.cloneFormula = cloneFormula;
  AL.formulaResolve = resolve;
  AL.formulaCost = cost;
  AL.Folio = Folio;
  AL.draftOffer = draftOffer;
});
