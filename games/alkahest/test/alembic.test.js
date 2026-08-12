"use strict";
const { test } = require("node:test");
const assert = require("node:assert");
const AL = require("../src/core.js");
require("../src/grid.js");
require("../src/machine.js");
require("../src/alembic.js");

const DT = 1 / 60;
function snapshot(m) {
  return m.grid.toAscii().join("|") + "#" + m.riseOffset.toFixed(5) + "#" + m.state +
    "#r" + m.stats.rowsRisen + "#s" + m.stats.swaps + "#d" + m.stats.drossSent;
}

test("FIXTURE AI-parity: the alembic's emitted stream replays bit-for-bit on a fresh same-seed machine", () => {
  const SEED = 4242, N = 900;
  const mRec = new AL.Machine({ seed: SEED, seedRows: 5 });
  const ai = new AL.Alembic({ seed: 99, skill: 0.85 });
  const log = [], states = [];
  for (let i = 0; i < N; i++) {
    log.push(ai.update(mRec, DT));
    mRec.tick(DT);
    states.push(snapshot(mRec));
  }
  // legality: every emitted primitive is one a human could issue
  const cols = mRec.grid.cols, rows = mRec.grid.rows;
  let swapCount = 0, raiseCount = 0;
  log.flat().forEach((p) => {
    if (p.kind === "swap") {
      assert.ok(p.x >= 0 && p.x < cols - 1, "swap x in bounds for a 1x2 cursor");
      assert.ok(p.y >= 0 && p.y < rows, "swap y in bounds");
      swapCount++;
    } else if (p.kind === "raise") {
      assert.strictEqual(typeof p.held, "boolean", "raise is a boolean toggle");
      raiseCount++;
    } else {
      assert.fail("alembic emitted a non-human primitive: " + JSON.stringify(p));
    }
  });
  assert.ok(swapCount > 0, "the AI actually swapped");
  // replay the recorded stream (no AI) -> identical states each tick = parity
  const mRep = new AL.Machine({ seed: SEED, seedRows: 5 });
  const states2 = [];
  for (let i = 0; i < N; i++) {
    for (const p of log[i]) {
      if (p.kind === "swap") mRep.requestSwap(p.x, p.y);
      else mRep.setRaise(p.held);
    }
    mRep.tick(DT);
    states2.push(snapshot(mRep));
  }
  assert.deepStrictEqual(states2, states, "AI influence flows ONLY through human-legal primitives");
});

test("the alembic visibly plays: it makes clears against a live machine", () => {
  const m = new AL.Machine({ seed: 31, seedRows: 5 });
  const ai = new AL.Alembic({ seed: 7, skill: 0.9 });
  for (let i = 0; i < 1800; i++) { ai.update(m, DT); m.tick(DT); if (m.state === "lost") break; }
  assert.ok(m.stats.swaps > 0, "the AI swapped");
  assert.ok(m.stats.clears > 0, "the AI made matches clear (it plays the machine)");
});

test("skill is TUNABLE: higher skill acts more often than lower skill", () => {
  function swapsFor(skill) {
    const m = new AL.Machine({ seed: 55, seedRows: 5, risePerSec: 0 }); // still board, isolate cadence
    const ai = new AL.Alembic({ seed: 3, skill });
    for (let i = 0; i < 1200; i++) { ai.update(m, DT); m.tick(DT); }
    return m.stats.swaps;
  }
  const lo = swapsFor(0.1), hi = swapsFor(0.95);
  assert.ok(hi > lo, `high skill acts more (hi=${hi} > lo=${lo})`);
});

test("the alembic CAN attack: some seed sends dross over a bout", () => {
  let sent = 0;
  for (let s = 1; s <= 6 && sent === 0; s++) {
    const m = new AL.Machine({ seed: 100 + s, seedRows: 5 });
    const ai = new AL.Alembic({ seed: s, skill: 0.9 });
    for (let i = 0; i < 2400; i++) { ai.update(m, DT); m.tick(DT); if (m.state === "lost") break; }
    sent = Math.max(sent, m.stats.drossSent);
  }
  assert.ok(sent > 0, "the AI produced offense (chains/combos send dross)");
});

test("DETERMINISM: same (machine seed, alembic seed, skill) => identical bout twice", () => {
  function run() {
    const m = new AL.Machine({ seed: 2026, seedRows: 5, risePerSec: 1.0 });
    const ai = new AL.Alembic({ seed: 808, skill: 0.7 });
    const trace = [];
    for (let i = 0; i < 600; i++) {
      ai.update(m, DT); m.tick(DT);
      if (i % 60 === 0) trace.push(snapshot(m));
    }
    return trace;
  }
  assert.deepStrictEqual(run(), run(), "the alembic is bit-for-bit reproducible");
});
