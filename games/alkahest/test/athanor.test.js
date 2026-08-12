"use strict";
/* M3.3 -- the athanor charge gauge (STUDY-run §3). Fixture: athanorCapAndSpend. */
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

test("athanor: a live clear charges the gauge through the tick loop", () => {
  const m = boardMachine(["111..."], {});
  assert.strictEqual(m.athanor, 0);
  for (let i = 0; i < 40; i++) m.tick(0.05);
  // combo 3, chain 1: 3 * chargePerPanel(1) = 3, no chain/combo bonus
  assert.strictEqual(m.athanor, 3);
  assert.ok(m.firstChargePulse, "first-charge pulse fired");
});

test("athanor: chains and combos charge faster than flat clears", () => {
  const m = new AL.Machine({ seedRows: 0, risePerSec: 0 });
  // flat clear of 3 (chain 1): 3
  m._pendingCharge = 3 * m.cfg.chargePerPanel;
  m.chain = 1;
  m._commitCharge();
  const flat = m.athanor;
  // a chain (link 2) of 3 panels: 3 + chainBonus
  const m2 = new AL.Machine({ seedRows: 0, risePerSec: 0 });
  m2._pendingCharge = 3 * m2.cfg.chargePerPanel + m2.cfg.chainBonus;
  m2.chain = 2;
  m2._commitCharge();
  assert.ok(m2.athanor > flat, "the chain charged more than the flat clear");
});

test("athanorCapAndSpend: gauge caps (overflow wasted) and spend floors at zero", () => {
  const m = new AL.Machine({ seedRows: 0, risePerSec: 0 });
  m.athanor = 95;
  m._pendingCharge = 20;
  m.chain = 1;
  m._commitCharge();
  assert.strictEqual(m.athanor, 100, "capped at athanorCap");
  assert.strictEqual(m.lastCharge.amount, 5, "only the un-wasted portion flashed");

  assert.strictEqual(m.spendAthanor(30), true);
  assert.strictEqual(m.athanor, 70);
  assert.strictEqual(m.spendAthanor(1000), false, "cannot overspend");
  assert.strictEqual(m.athanor, 70, "a failed spend changes nothing");
  assert.ok(Math.abs(m.athanorFrac() - 0.7) < 1e-9);
});

test("athanor: the first-charge pulse fires exactly once per run", () => {
  const m = new AL.Machine({ seedRows: 0, risePerSec: 0 });
  m._pendingCharge = 5; m.chain = 1; m._commitCharge();
  assert.ok(m.firstChargePulse);
  m.firstChargePulse = null; // scene consumes it
  m._pendingCharge = 5; m.chain = 1; m._commitCharge();
  assert.strictEqual(m.firstChargePulse, null, "does not re-fire once charged");
});

test("athanor: RUBEDO all-or-nothing charges nothing on a chain-1 cascade", () => {
  const rub = new AL.Machine({ act: "rubedo", seedRows: 0, risePerSec: 0 });
  rub._pendingCharge = 10; rub.chain = 1; rub._commitCharge();
  assert.strictEqual(rub.athanor, 0, "a lone clear grants no charge under Rubedo");
  // a chain (>=2) charges brighter (x chainBrightMul)
  rub._pendingCharge = 10; rub.chain = 2; rub._commitCharge();
  assert.strictEqual(rub.athanor, 15, "10 * 1.5");
});
