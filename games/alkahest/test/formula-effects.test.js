"use strict";
/* M3.5 -- formula effects wired through the machine (STUDY-run §3, §4): standing
 * mods, passive reactions (Calcination burn, Volatility sublimate), active casts.
 * Every effect works THROUGH the panel machine and is player-visible. */
const test = require("node:test");
const assert = require("node:assert");
require("../src/core.js");
require("../src/grid.js");
require("../src/acts.js");
require("../src/formulae.js");
const AL = require("../src/machine.js");

function boardMachine(ascii, opts) {
  const m = new AL.Machine(Object.assign({ seedRows: 0, risePerSec: 0, riseAccel: 0 }, opts));
  m.grid = AL.Grid.fromAscii(ascii, { rows: m.cfg.rows });
  return m;
}
function card(id) { return AL.cloneFormula(AL.formulaById(id)); }
function hasDross(g) {
  for (let y = 0; y < g.rows; y++) for (let x = 0; x < g.cols; x++) if (g.cells[y][x] && g.cells[y][x].dross) return true;
  return false;
}
function hasType(g, t) {
  for (let y = 0; y < g.rows; y++) for (let x = 0; x < g.cols; x++) { const c = g.cells[y][x]; if (c && !c.dross && c.t === t) return true; }
  return false;
}
function runToRest(m) { for (let i = 0; i < 80; i++) m.tick(0.05); }

test("applyFormulae: standing mods merge into cfg and are idempotent", () => {
  const m = new AL.Machine({ seedRows: 0 });
  const baseChain = m.cfg.chainBonus, baseRaise = m.cfg.raiseSpeed;
  const folio = new AL.Folio();
  folio.add("separation"); // chainBonus +4
  folio.add("ceration");   // raiseSpeed +2
  m.applyFormulae(folio);
  assert.strictEqual(m.cfg.chainBonus, baseChain + 4);
  assert.strictEqual(m.cfg.raiseSpeed, baseRaise + 2);
  // idempotent: re-applying rebuilds from the base snapshot, no double-count
  m.applyFormulae(folio);
  assert.strictEqual(m.cfg.chainBonus, baseChain + 4);
  assert.ok(m.actives.length === 0 && Object.keys(m.flags).length === 0);
});

test("applyFormulae: mods stack on top of the act profile", () => {
  const m = new AL.Machine({ act: "nigredo", seedRows: 0 }); // fallInterval 0.075
  const folio = new AL.Folio();
  folio.add("feverPitch"); // fallInterval *0.7
  m.applyFormulae(folio);
  assert.ok(Math.abs(m.cfg.fallInterval - 0.075 * 0.7) < 1e-9, "act then bargain compose");
});

test("applyFormulae: flags + actives + setup are collected", () => {
  const m = new AL.Machine({ seedRows: 0 });
  const folio = new AL.Folio();
  folio.add("calcination"); // flag burnDrossOnChain threshold 3
  folio.add("aquaRegia");   // active dissolveColumn cost 40
  folio.add("hunger");      // setup startDross + chargePerPanel +0.5
  m.applyFormulae(folio);
  assert.strictEqual(m.flags.burnDrossOnChain, 3);
  assert.strictEqual(m.actives.length, 1);
  assert.strictEqual(m.actives[0].id, "aquaRegia");
  assert.strictEqual(m.actives[0].cost, 40);
  assert.strictEqual(m.setupOps.length, 1);
  assert.ok(m.setupOps[0].startDross);
});

test("Calcination reaction: a qualifying chain burns one dross row", () => {
  // dross slab (cols 0-2) with a live 3-match beside it; the clear (chain 1)
  // with a threshold-1 flag burns the bottom dross row.
  const m = boardMachine(["XXX111"], {});
  m.flags = { burnDrossOnChain: 1 };
  assert.ok(hasDross(m.grid));
  runToRest(m);
  assert.ok(!hasDross(m.grid), "the dross row was burned by the reaction");
});

test("Volatility reaction: a combo >= threshold sublimates a neighbour", () => {
  const on = boardMachine(["1.....", "2222.."], {});
  on.flags = { comboSublimate: 4 };
  runToRest(on);
  assert.ok(!hasType(on.grid, 1), "combo of 4 sublimated the adjacent panel");

  const off = boardMachine(["1....", "222.."], {}); // combo of 3 < threshold
  off.flags = { comboSublimate: 4 };
  runToRest(off);
  assert.ok(hasType(off.grid, 1), "combo below threshold: no sublimation");
});

test("active: Aqua Regia dissolves a chosen column and spends charge", () => {
  const m = boardMachine(["111", "222", "333"], { cols: 3 });
  m.athanor = 50;
  const res = m.castActive(card("aquaRegia"), 1); // dissolve column 1
  assert.ok(res.ok);
  assert.strictEqual(m.athanor, 10, "40 spent");
  for (let y = 0; y < m.grid.rows; y++) assert.strictEqual(m.grid.cells[y][1], null, "column 1 cleared");
  assert.ok(m.lastCast && m.lastCast.kind === "dissolveColumn");
});

test("active: charge gate + no-op protection", () => {
  const m = boardMachine(["11."], { cols: 3 }); // column 2 is empty
  m.athanor = 10; // below Aqua Regia's 40
  const poor = m.castActive(card("aquaRegia"), 0);
  assert.strictEqual(poor.ok, false);
  assert.strictEqual(poor.reason, "charge");
  assert.strictEqual(m.athanor, 10, "a failed cast spends nothing");

  m.athanor = 50;
  const empty = m.castActive(card("aquaRegia"), 2); // column 2 is empty
  assert.strictEqual(empty.ok, false, "a no-op cast fails");
  assert.strictEqual(m.athanor, 50, "and spends no charge");
});

test("active: a missing card is a safe not-active no-op", () => {
  const m = new AL.Machine({ seed: 1, seedRows: 0 });
  assert.deepStrictEqual(m.castActive(undefined, null), { ok: false, reason: "not-active" });
});

test("bargainFeedbackLoop: rise + charge bargains wind the self-reinforcing loop", () => {
  // the studio-named loop: faster rise -> more forced cascades -> more charge.
  // The two levers must actually move: a rise bargain raises risePerSec, a charge
  // bargain raises chargePerPanel, and both can stack in one folio (compounding).
  const base = new AL.Machine({ seedRows: 0 });
  const r0 = base.cfg.risePerSec, c0 = base.cfg.chargePerPanel;
  const m = new AL.Machine({ seedRows: 0 });
  const folio = new AL.Folio();
  folio.add("blackSun");   // risePerSec *1.15 (faster rise)
  folio.add("leadWeight"); // chargePerPanel *1.5 (faster charge)
  m.applyFormulae(folio);
  assert.ok(m.cfg.risePerSec > r0, "rise bargain speeds the rise");
  assert.ok(m.cfg.chargePerPanel > c0, "charge bargain fills the athanor faster");
  // and the loop compounds: a clear now banks more charge than the base machine
  const drive = (mm) => { mm.grid = AL.Grid.fromAscii(["1111.."]); for (let i = 0; i < 40; i++) mm.tick(0.05); };
  const plain = new AL.Machine({ seedRows: 0, risePerSec: 0 });
  const loud = new AL.Machine({ seedRows: 0, risePerSec: 0 });
  loud.applyFormulae(folio);
  drive(plain); drive(loud);
  assert.ok(loud.athanor > plain.athanor, "the charge bargain compounds the cascade's charge");
});

test("active: Quintessence transmutes every slab bottom row; Precipitate sends", () => {
  const q = boardMachine(["XX", "XX"], { cols: 2 });
  q.athanor = 100;
  const r = q.castActive(card("quintessence"), null);
  assert.ok(r.ok);
  // the bottom dross row is now live reagents (top row remains dross)
  assert.ok(!q.grid.cells[0][0].dross && !q.grid.cells[0][1].dross, "bottom row transmuted");
  assert.ok(q.grid.cells[1][0].dross, "the row above survives as dross");

  const p = boardMachine(["11"], { cols: 2 });
  p.athanor = 100;
  const before = p.outbox.length;
  const sent = p.castActive(card("precipitate"), null);
  assert.ok(sent.ok);
  assert.strictEqual(p.outbox.length, before + 1, "a slab was queued to the rival");
});
