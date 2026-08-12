"use strict";
/* M3.6 -- the run orchestrator (STUDY-run §1, §4-§8). Fixtures: mercyFirstBout,
 * ladderCurveMonotone, workshopRemoveOrUpgrade, runEndRuined, runEndComplete,
 * runDeterministic, plus draft integration + ladder structure. */
const test = require("node:test");
const assert = require("node:assert");
require("../src/core.js");
require("../src/grid.js");
require("../src/acts.js");
require("../src/formulae.js");
require("../src/machine.js");
require("../src/alembic.js");
require("../src/duel.js");
const AL = require("../src/run.js");

function winBout(run) { run.duel.rival.state = "lost"; run.tick(0.016); }
function loseBout(run) { run.duel.player.state = "lost"; run.tick(0.016); }

test("ladder structure: 4 acts x 3 bouts = 12, four masters", () => {
  assert.strictEqual(AL.RUN.TOTAL_BOUTS, 12);
  assert.strictEqual(AL.RUN.BOUTS_PER_ACT, 3);
  assert.strictEqual(AL.RUN.RIVALS.length, 12);
  const masters = AL.RUN.RIVALS.filter((r) => r.master);
  assert.strictEqual(masters.length, 4, "one master per act");
  // every rival loadout is passive/bargain (the AI never casts actives)
  AL.RUN.RIVALS.forEach((r) => r.formulae.forEach((id) => {
    assert.notStrictEqual(AL.formulaById(id).cls, "active", id + " is not an active");
  }));
});

test("mercyFirstBout: bout 1 gentles both the rival and the rise", () => {
  const run = new AL.Run({ seed: 5 });
  assert.strictEqual(run.boutIndex, 0);
  assert.strictEqual(run.rivalInfo.skill, 0.20, "mercy skill");
  assert.strictEqual(run.duel.player.cfg.risePerSec, 0.06, "mercy rise");
  assert.ok(AL.RUN.rivalSkill(1) > AL.RUN.rivalSkill(0), "bout 2 is harder than the mercy opener");
});

test("ladderCurveMonotone: rival skill never decreases and has no cliff", () => {
  for (let g = 1; g < 12; g++) {
    const d = AL.RUN.rivalSkill(g) - AL.RUN.rivalSkill(g - 1);
    assert.ok(d >= 0, "monotonic non-decreasing at bout " + g);
    assert.ok(d <= 0.2, "no difficulty cliff at bout " + g);
  }
  assert.ok(AL.RUN.rivalSkill(11) <= 0.98, "the master stays legal");
});

test("draft: a non-master win offers one of each class and advances on pick", () => {
  const run = new AL.Run({ seed: 8 });
  winBout(run);
  assert.strictEqual(run.state, "draft");
  assert.strictEqual(run.draftOffer.length, 3);
  const pick = run.draftOffer.find((o) => o.cls === "passive").id;
  const res = run.resolveDraft(pick);
  assert.ok(res.ok);
  assert.ok(run.folio.has(pick), "the drafted formula is in the folio");
  assert.strictEqual(run.state, "bout", "bout 1 was not an act master: straight to the next bout");
  assert.strictEqual(run.boutIndex, 1);
});

test("draft: skipping keeps the folio empty and still advances", () => {
  const run = new AL.Run({ seed: 8 });
  winBout(run);
  run.resolveDraft(null); // skip, untimed
  assert.strictEqual(run.folio.count(), 0);
  assert.strictEqual(run.boutIndex, 1);
});

test("workshopRemoveOrUpgrade: the act boundary opens the workshop", () => {
  const run = new AL.Run({ seed: 11 });
  winBout(run); run.resolveDraft("separation");  // bout 0 -> draft a passive, advance
  winBout(run); run.resolveDraft(null);          // bout 1 -> skip, advance
  winBout(run);                                  // bout 2 (act master) -> draft
  assert.strictEqual(run.state, "draft");
  const res = run.resolveDraft(null);            // skip -> workshop
  assert.ok(res.workshop);
  assert.strictEqual(run.state, "workshop");
  assert.strictEqual(run.folio.get("separation").upgraded, false);
  run.resolveWorkshop({ kind: "upgrade", id: "separation" });
  assert.strictEqual(run.folio.get("separation").upgraded, true);
  assert.strictEqual(run.state, "bout");
  assert.strictEqual(run.boutIndex, 3);
  assert.strictEqual(run.actName, "albedo", "crossed into act 2");
});

test("workshop: remove frees a slot; skip changes nothing", () => {
  const run = new AL.Run({ seed: 21 });
  winBout(run); run.resolveDraft("calcination");
  winBout(run); run.resolveDraft(null);
  winBout(run); run.resolveDraft(null); // -> workshop
  assert.strictEqual(run.state, "workshop");
  assert.ok(run.folio.has("calcination"));
  run.resolveWorkshop({ kind: "remove", id: "calcination" });
  assert.ok(!run.folio.has("calcination"), "removed the formula");
});

test("firstActiveDraft: drafting the first brew flags the discoverability callout", () => {
  const run = new AL.Run({ seed: 8 });
  assert.strictEqual(run.firstActiveDraft, false);
  winBout(run);
  const active = run.draftOffer.find((o) => o.cls === "active");
  run.resolveDraft(active.id);
  assert.strictEqual(run.firstActiveDraft, true, "first active in the folio fires the callout");
  // it does not re-fire on later drafts (one-shot per run)
  run.firstActiveDraft = false; // scene consumes it
  winBout(run);
  run.resolveDraft(null);
  assert.strictEqual(run.firstActiveDraft, false);
});

test("runEndRuined: losing any bout ruins the run", () => {
  const run = new AL.Run({ seed: 3 });
  loseBout(run);
  assert.strictEqual(run.state, "ruined");
  assert.strictEqual(run.history.boutsWon, 0);
  assert.ok(run.isOver());
});

test("runEndComplete: beating all twelve completes the opus", () => {
  const run = new AL.Run({ seed: 77 });
  const seen = new Set();
  let guard = 0;
  while (!run.isOver() && guard++ < 200) {
    if (run.state === "bout") { seen.add(run.actName); winBout(run); }
    else if (run.state === "draft") run.resolveDraft(null);
    else if (run.state === "workshop") run.resolveWorkshop({ kind: "skip" });
  }
  assert.strictEqual(run.state, "won");
  assert.strictEqual(run.history.boutsWon, 12);
  assert.strictEqual(run.history.actsCleared, 4);
  assert.deepStrictEqual([...seen].sort(), ["albedo", "citrinitas", "nigredo", "rubedo"]);
});

test("runDeterministic: same seed + same choices replays bit-for-bit", () => {
  const a = new AL.Run({ seed: 999 });
  const b = new AL.Run({ seed: 999 });
  let guard = 0;
  while (!a.isOver() && guard++ < 4000) {
    assert.strictEqual(a.state, b.state);
    assert.strictEqual(a.boutIndex, b.boutIndex);
    if (a.state === "bout") {
      assert.deepStrictEqual(a.duel.player.grid.toAscii(), b.duel.player.grid.toAscii());
      assert.deepStrictEqual(a.duel.rival.grid.toAscii(), b.duel.rival.grid.toAscii());
      assert.strictEqual(a.duel.player.athanor, b.duel.player.athanor);
      a.tick(0.1); b.tick(0.1);
    } else if (a.state === "draft") { a.resolveDraft(null); b.resolveDraft(null); }
    else if (a.state === "workshop") { a.resolveWorkshop({ kind: "skip" }); b.resolveWorkshop({ kind: "skip" }); }
  }
  assert.strictEqual(a.state, b.state);
  assert.ok(a.isOver(), "the run terminated");
});
