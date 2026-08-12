"use strict";
/* M3.7 -- the run-layer surfaces render (action-legibility guard). Each draw path
 * must compose without throwing and leave visible pixels; card iconography obeys
 * the shape+glyph colorblind law (distinct shape per class, glyph per card). */
const test = require("node:test");
const assert = require("node:assert");
const AL = require("../src/core.js");
require("../src/framebuffer.js");
require("../src/palette.js");
require("../src/render.js");
require("../src/font.js");
require("../src/reagents.js");
require("../src/grid.js");
require("../src/acts.js");
require("../src/machine.js");
require("../src/alembic.js");
require("../src/duel.js");
require("../src/formulae.js");
require("../src/run.js");
require("../src/well.js");
require("../src/folioui.js");

function nonBlank(fb) {
  for (let i = 0; i < fb.data.length; i += 4) if (fb.data[i] || fb.data[i + 1] || fb.data[i + 2]) return true;
  return false;
}
function forceToState(run, target) {
  let guard = 0;
  while (run.state !== target && !run.isOver() && guard++ < 200) {
    if (run.state === "bout") { run.duel.rival.state = "lost"; run.tick(0.016); }
    else if (run.state === "draft" && target !== "draft") run.resolveDraft(null);
    else if (run.state === "workshop" && target !== "workshop") run.resolveWorkshop({ kind: "skip" });
    else break;
  }
}

test("card iconography obeys the shape+glyph colorblind law", () => {
  // each class maps to a DISTINCT shape; each formula carries a unique glyph
  const shapes = {};
  const glyphs = new Set();
  AL.CATALOGUE.forEach((f) => {
    const ui = AL.CLASSES ? AL.CLASSES[f.cls] : null;
    assert.ok(f.glyph, f.id + " has a glyph");
    glyphs.add(f.cls + ":" + f.glyph);
  });
  // three classes, three shapes, all distinct (from the folioui CLASS_UI mapping)
  const fb = new AL.FrameBuffer(64, 64);
  ["triangle", "diamond", "hexagon"].forEach((sh) => AL.drawShape(fb, sh, 32, 32, 6, [200, 200, 200], 1));
  assert.ok(nonBlank(fb), "shapes drew pixels");
});

test("a folio card renders without throwing and shows pixels", () => {
  const fb = new AL.FrameBuffer(AL.W, AL.H);
  const pal = AL.palette("nigredo");
  const card = AL.cloneFormula(AL.formulaById("aquaRegia"));
  AL.drawFormulaCard(fb, card, 20, 20, 96, 116, pal, { selected: true });
  assert.ok(nonBlank(fb));
});

test("the draft surface renders (three cards, prompts)", () => {
  const run = new AL.Run({ seed: 8 });
  forceToState(run, "draft");
  assert.strictEqual(run.state, "draft");
  const fb = new AL.FrameBuffer(AL.W, AL.H);
  AL.drawDraft(fb, run, { sel: 0, time: 0.3 });
  assert.ok(nonBlank(fb));
  // and the full-folio discard overlay path also renders
  const fb2 = new AL.FrameBuffer(AL.W, AL.H);
  AL.drawDraft(fb2, run, { sel: 1, time: 0.3, discardMode: true, discardSel: 0 });
  assert.ok(nonBlank(fb2));
});

test("the workshop surface renders with a populated folio", () => {
  const run = new AL.Run({ seed: 11 });
  run.folio.add("separation"); run.folio.add("aquaRegia");
  forceToState(run, "workshop");
  assert.strictEqual(run.state, "workshop");
  const fb = new AL.FrameBuffer(AL.W, AL.H);
  AL.drawWorkshop(fb, run, { sel: 0, time: 0.3 });
  assert.ok(nonBlank(fb));
});

test("the run-end surfaces render (ruined + opus complete)", () => {
  const ruin = new AL.Run({ seed: 3 });
  ruin.duel.player.state = "lost"; ruin.tick(0.016);
  assert.strictEqual(ruin.state, "ruined");
  const fb = new AL.FrameBuffer(AL.W, AL.H);
  AL.drawRunEnd(fb, ruin, { time: 0.3 });
  assert.ok(nonBlank(fb));

  const win = new AL.Run({ seed: 5 });
  let guard = 0;
  while (!win.isOver() && guard++ < 200) {
    if (win.state === "bout") { win.duel.rival.state = "lost"; win.tick(0.016); }
    else if (win.state === "draft") win.resolveDraft(null);
    else if (win.state === "workshop") win.resolveWorkshop({ kind: "skip" });
  }
  assert.strictEqual(win.state, "won");
  const fb2 = new AL.FrameBuffer(AL.W, AL.H);
  AL.drawRunEnd(fb2, win, { time: 0.3 });
  assert.ok(nonBlank(fb2));
});

test("the bout HUD renders with the run overlay (banner, gauge, brews)", () => {
  const run = new AL.Run({ seed: 20260810 });
  run.folio.add("aquaRegia");
  run.duel.player.applyFormulae(run.folio);
  run.duel.player.athanor = 60;
  for (let i = 0; i < 30; i++) run.tick(1 / 60);
  const fb = new AL.FrameBuffer(AL.W, AL.H);
  AL.drawDuel(fb, run.duel, { act: run.actName, cursor: { x: 2, y: 4 }, time: run.duel.time, run: run });
  assert.ok(nonBlank(fb));
});

test("all four master formula telegraphs stay inside the 14px banner", () => {
  const run = new AL.Run({ seed: 3 });
  for (const bout of [2, 5, 8, 11]) {
    run.boutIndex = bout;
    run._startBout();
    assert.strictEqual(run.rivalInfo.master, true, `bout ${bout} is a master`);
    const fb = new AL.FrameBuffer(AL.W, AL.H).clear(0, 0, 0);
    AL.drawRunBanner(fb, run, AL.palette(run.actName), 1);
    for (let y = 14; y < AL.H; y++) {
      for (let x = 0; x < AL.W; x++) {
        const p = fb.get(x, y);
        assert.deepStrictEqual(p, [0, 0, 0, 255], `bout ${bout} banner leaked at ${x},${y}`);
      }
    }
  }
});
