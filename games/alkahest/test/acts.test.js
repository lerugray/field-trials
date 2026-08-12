"use strict";
/* M3.2 -- Weiss per-act physics (STUDY-run §2). Named fixtures:
 * nigredoSlowFall, albedoSublimate, citrinitasAmplified, rubedoAllOrNothing. */
const test = require("node:test");
const assert = require("node:assert");
require("../src/core.js");
require("../src/grid.js");
require("../src/acts.js");
const AL = require("../src/machine.js");

function boardMachine(ascii, opts) {
  const m = new AL.Machine(Object.assign({ seedRows: 0, risePerSec: 0, riseAccel: 0 }, opts));
  m.grid = AL.Grid.fromAscii(ascii, { rows: m.cfg.rows });
  return m;
}
function hasType(grid, t) {
  for (let y = 0; y < grid.rows; y++)
    for (let x = 0; x < grid.cols; x++) {
      const c = grid.cells[y][x];
      if (c && !c.dross && c.t === t) return true;
    }
  return false;
}

test("acts: profiles are frozen and cover the four-act order", () => {
  assert.deepStrictEqual(AL.ACT_ORDER, ["nigredo", "albedo", "citrinitas", "rubedo"]);
  const p = AL.actProfile("nigredo");
  assert.throws(() => { p.fallInterval = 999; }, "profile must be frozen");
  assert.throws(() => AL.actProfile("bogus"), "unknown act throws");
});

test("nigredoSlowFall: Nigredo lengthens the fall interval; default is unchanged", () => {
  const base = new AL.Machine({ seedRows: 0 });
  const nig = new AL.Machine({ act: "nigredo", seedRows: 0 });
  assert.strictEqual(base.cfg.fallInterval, 0.045);
  assert.strictEqual(nig.cfg.fallInterval, 0.075);
  assert.ok(nig.cfg.fallInterval > base.cfg.fallInterval, "Nigredo falls slower");
  assert.strictEqual(nig.act, "nigredo");
  // explicit opts still win over the profile (tests can pin any value)
  const pinned = new AL.Machine({ act: "nigredo", fallInterval: 0.02, seedRows: 0 });
  assert.strictEqual(pinned.cfg.fallInterval, 0.02);
});

test("albedoSublimate: a clear also removes one adjacent live panel (deterministic)", () => {
  // pickSublimation picks the lowest-then-leftmost adjacent idle panel
  const g = AL.Grid.fromAscii(["1.....", "222..."]);
  const hits = g.findMatches();
  assert.strictEqual(hits.size, 3);
  assert.strictEqual(g.pickSublimation(hits), "0,1"); // the type-1 above col 0

  // through the machine: an Albedo clear sublimates the neighbour; neutral does not
  function runToRest(m) { for (let i = 0; i < 60; i++) m.tick(0.05); }
  const alb = boardMachine(["1.....", "222..."], { act: "albedo" });
  runToRest(alb);
  assert.ok(!hasType(alb.grid, 1), "Albedo sublimated the adjacent type-1 panel");
  assert.strictEqual(alb.stats.panelsCleared, 4, "3 matched + 1 sublimated");

  const neu = boardMachine(["1.....", "222..."], {});
  runToRest(neu);
  assert.ok(hasType(neu.grid, 1), "neutral act leaves the type-1 panel");
  assert.strictEqual(neu.stats.panelsCleared, 3);
});

test("citrinitasAmplified: outgoing slabs +width, incoming slabs +height", () => {
  // send: a base combo slab (width 3) grows by drossSendBonus (1) -> width 4
  const cit = new AL.Machine({ act: "citrinitas", seedRows: 0, risePerSec: 0 });
  cit.chain = 1;
  cit._cascadeCombos = [{ width: 3, height: 1 }];
  cit._emitDross();
  assert.strictEqual(cit.outbox.length, 1);
  assert.strictEqual(cit.outbox[0].width, 4, "send bonus widened the slab");

  const neu = new AL.Machine({ seedRows: 0, risePerSec: 0 });
  neu.chain = 1;
  neu._cascadeCombos = [{ width: 3, height: 1 }];
  neu._emitDross();
  assert.strictEqual(neu.outbox[0].width, 3, "neutral: no amplification");

  // receive: an incoming height-1 slab lands as height 2 under Citrinitas
  const rc = new AL.Machine({ act: "citrinitas", seedRows: 0, risePerSec: 0 });
  rc.grid = new AL.Grid({ cols: 6, rows: 14 });
  rc.drossQueue = [{ width: 3, height: 1 }];
  rc._applyDross();
  assert.strictEqual(rc.lastCrush.height, 2, "recv bonus deepened the crush");
});

test("rubedoAllOrNothing: chain<2 emits nothing; chain>=2 burns brighter", () => {
  // a lone clear (chain 1) that made a combo emits NO dross under Rubedo
  const rub = new AL.Machine({ act: "rubedo", seedRows: 0, risePerSec: 0 });
  rub.chain = 1;
  rub._cascadeCombos = [{ width: 3, height: 1 }];
  rub._emitDross();
  assert.strictEqual(rub.outbox.length, 0, "chain 1 yields nothing");

  // neutral: the same chain-1 combo DOES emit a slab
  const neu = new AL.Machine({ seedRows: 0, risePerSec: 0 });
  neu.chain = 1;
  neu._cascadeCombos = [{ width: 3, height: 1 }];
  neu._emitDross();
  assert.strictEqual(neu.outbox.length, 1);

  // chain 2 under Rubedo: the full-width chain slab (base height 1) burns brighter
  const rub2 = new AL.Machine({ act: "rubedo", seedRows: 0, risePerSec: 0 });
  rub2.chain = 2;
  rub2._cascadeCombos = [];
  rub2._emitDross();
  assert.strictEqual(rub2.outbox.length, 1);
  assert.strictEqual(rub2.outbox[0].width, 6);
  assert.strictEqual(rub2.outbox[0].height, 2, "round(1 * 1.5) = 2, brighter");
});
