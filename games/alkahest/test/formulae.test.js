"use strict";
/* M3.4 -- the folio catalogue, folio, and draft (STUDY-run §4). Fixtures:
 * draftOneOfEachClass, draftNoDuplicates, folioCapDiscard. */
const test = require("node:test");
const assert = require("node:assert");
require("../src/core.js");
const AL = require("../src/formulae.js");

test("catalogue: 16 formulae, unique ids, class balance, active costs", () => {
  const cat = AL.CATALOGUE;
  assert.strictEqual(cat.length, 16, "the initial set is ~16 (exactly 16)");
  const ids = new Set(cat.map((f) => f.id));
  assert.strictEqual(ids.size, 16, "all ids unique");
  const by = { passive: 0, active: 0, bargain: 0 };
  cat.forEach((f) => {
    assert.ok(by[f.cls] !== undefined, "known class: " + f.cls);
    by[f.cls]++;
    assert.ok(f.glyph && f.glyph.length === 1, f.id + " has a single-letter glyph");
    assert.ok(f.eff && f.eff.text, f.id + " has card text");
    if (f.cls === "active") {
      assert.ok(f.eff.active && f.eff.active.cost > 0, f.id + " active has a cost");
      assert.strictEqual(AL.formulaCost(f), f.eff.active.cost);
    } else {
      assert.strictEqual(AL.formulaCost(f), 0, f.id + " non-active costs no charge");
    }
  });
  assert.deepStrictEqual(by, { passive: 6, active: 5, bargain: 5 });
});

test("catalogue: card text stays in the taught register (no reference jargon)", () => {
  const banned = ["garbage", "block", "puzzle", "panel de", "tetris"];
  AL.CATALOGUE.forEach((f) => {
    const t = f.eff.text.toLowerCase();
    banned.forEach((w) => assert.ok(t.indexOf(w) === -1, f.id + " avoids '" + w + "'"));
  });
});

test("upgrade: resolve returns the upgraded snapshot; cost can drop", () => {
  const c = AL.cloneFormula(AL.formulaById("aquaRegia"));
  assert.strictEqual(AL.formulaCost(c), 40);
  c.upgraded = true;
  assert.strictEqual(AL.formulaResolve(c).active.cost, 28, "upgraded Aqua Regia is cheaper");
  // a passive upgrade swaps its flag threshold
  const cal = AL.cloneFormula(AL.formulaById("calcination"));
  assert.strictEqual(AL.formulaResolve(cal).flag.threshold, 3);
  cal.upgraded = true;
  assert.strictEqual(AL.formulaResolve(cal).flag.threshold, 2);
});

test("draftOneOfEachClass: a fresh draft offers exactly one of each class", () => {
  const gen = AL.rng(123);
  const offer = AL.draftOffer(new Set(), gen);
  assert.strictEqual(offer.length, 3);
  assert.deepStrictEqual(offer.map((o) => o.cls).sort(), ["active", "bargain", "passive"]);
  // deterministic from the same seed
  const again = AL.draftOffer(new Set(), AL.rng(123));
  assert.deepStrictEqual(again.map((o) => o.id), offer.map((o) => o.id));
});

test("draftNoDuplicates: owned formulae are never offered again", () => {
  // own every passive -> the offer drops the passive slot, offers 2 (active+bargain)
  const ownedPassives = AL.CATALOGUE.filter((f) => f.cls === "passive").map((f) => f.id);
  const offer = AL.draftOffer(new Set(ownedPassives), AL.rng(7));
  assert.strictEqual(offer.length, 2);
  assert.ok(offer.every((o) => o.cls !== "passive"), "no passive offered");
  // no offered id is one we own
  const owned = new Set(ownedPassives);
  assert.ok(offer.every((o) => !owned.has(o.id)));
});

test("folioCapDiscard: no dup, no same-name stack, cap forces a discard", () => {
  const f = new AL.Folio({ cap: 3 });
  assert.strictEqual(f.add("calcination"), "added");
  assert.strictEqual(f.add("calcination"), "duplicate", "same id never stacks");
  assert.strictEqual(f.add("fixation"), "added");
  assert.strictEqual(f.add("aquaRegia"), "added");
  assert.ok(f.isFull());
  assert.strictEqual(f.add("solvent"), "full", "cannot draft past the cap");
  assert.ok(f.discard("fixation"), "discarded to free a slot");
  assert.strictEqual(f.add("solvent"), "added", "now the 9th fits");
  assert.strictEqual(f.count(), 3);
  assert.strictEqual(f.actives().length, 2, "Aqua Regia + Solvent");
});

test("folio upgrade flips a card's resolved effect", () => {
  const f = new AL.Folio();
  f.add("separation");
  assert.strictEqual(AL.formulaResolve(f.get("separation")).mods.chainBonus.add, 4);
  assert.ok(f.upgrade("separation"));
  assert.strictEqual(AL.formulaResolve(f.get("separation")).mods.chainBonus.add, 8);
  assert.strictEqual(f.upgrade("separation"), false, "already upgraded");
});
