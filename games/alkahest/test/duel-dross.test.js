"use strict";
const { test } = require("node:test");
const assert = require("node:assert");
const AL = require("../src/core.js");
require("../src/grid.js");
require("../src/machine.js");

function boarded(lines, opts) {
  const m = new AL.Machine(Object.assign({ seedRows: 0, cols: lines[0].length, rows: opts && opts.rows || 14 }, opts));
  const h = lines.length;
  for (let i = 0; i < h; i++) {
    const y = h - 1 - i;
    for (let x = 0; x < lines[i].length; x++) {
      const ch = lines[i][x];
      if (ch !== "." && ch !== " ") m.grid.cells[y][x] = AL.panel(+ch);
    }
  }
  return m;
}
function settle(m, dt) {
  dt = dt || 1 / 60;
  for (let i = 0; i < 4000; i++) {
    m.tick(dt);
    if (!m.clearing && !m.grid.hasFloating() && m.grid.findMatches().size === 0 && !m.cascadeActive && m.drossQueue.length === 0) return i;
  }
  return -1;
}
function drossCells(g) {
  let n = 0;
  for (let y = 0; y < g.rows; y++) for (let x = 0; x < g.cols; x++) { const c = g.cells[y][x]; if (c && c.dross) n++; }
  return n;
}

test("FIXTURE attack-mapping: a chain of L sends a full-width height-(L-1) slab", () => {
  // "..4../11144." is the known 2-chain used in machine.test.js
  const m = boarded(["..4...", "11144."]);
  settle(m);
  assert.strictEqual(m.stats.maxChain, 2, "this board is a 2-chain");
  const out = m.drainOutbox();
  const chainSlab = out.find((s) => s.width === 6);
  assert.ok(chainSlab, "a full-width chain slab was emitted");
  assert.strictEqual(chainSlab.height, 1, "chain L=2 -> height L-1 = 1");
});

test("FIXTURE attack-mapping: a combo of N sends a width-(N-1) height-1 slab", () => {
  // a single-step clear of 5 in a row = combo 5 (breadth), no chain
  const m = boarded(["101110"]); // swap col1<->col2? build a clean 5-combo instead
  // simpler: place 5 in a row directly then trigger with a swap into place
  const m2 = boarded(["2222.2"]);
  m2.requestSwap(4, 0); // slide the lone 2 over the gap -> 22222.
  settle(m2);
  assert.ok(m2.stats.maxCombo >= 4, `combo formed (${m2.stats.maxCombo})`);
  const out = m2.drainOutbox();
  const comboSlab = out.find((s) => s.height === 1 && s.width === m2.stats.maxCombo - 1);
  assert.ok(comboSlab, "a width-(N-1) combo slab was emitted");
});

test("a single non-combo, non-chain triple sends NO dross", () => {
  const m = boarded(["1101.."]);
  m.requestSwap(2, 0);
  settle(m);
  assert.strictEqual(m.stats.maxChain, 1);
  assert.strictEqual(m.drainOutbox().length, 0, "a plain triple is not an attack");
});

test("FIXTURE crush-between-cascades: incoming dross lands only when the well is at rest", () => {
  const m = boarded(["1101.."], { risePerSec: 0 });
  m.requestSwap(2, 0);          // start a clear (well becomes busy)
  m.receiveDross({ width: 6, height: 2 });
  // tick through the busy window; dross must NOT crush while clearing/settling
  let landedWhileBusy = false;
  for (let i = 0; i < 40; i++) {
    m.tick(1 / 60);
    const busy = m.clearing || m.grid.hasFloating() || m.grid.findMatches().size > 0 || m.cascadeActive;
    if (busy && drossCells(m.grid) > 0) landedWhileBusy = true;
    if (!busy && drossCells(m.grid) > 0) break;
  }
  assert.strictEqual(landedWhileBusy, false, "no slab crushed mid-cascade");
  assert.strictEqual(drossCells(m.grid), 12, "the slab crushed once the well settled");
  assert.strictEqual(m.stats.drossReceived, 12);
});

test("transmute in the animated loop: a clear adjacent to a slab peels its bottom row and tags the chain", () => {
  // a row of 1s directly beneath a full-width slab; clearing the 1s transmutes
  const m = boarded([
    "XXXXXX",
    "111111",
  ], { risePerSec: 0 });
  // rebuild the slab grouping (boarded() placed panels only; add a real slab)
  m.grid.cells[1] = new Array(6).fill(null);
  m.grid.addSlab(0, 6, 1);
  m.chain = 3; m.cascadeActive = true; // pretend we are mid-cascade at link 3
  const before = drossCells(m.grid);
  // clear the row of 1s manually via the clearing pipeline
  m._beginClear(new Set(["0,0", "1,0", "2,0", "3,0", "4,0", "5,0"]));
  for (let i = 0; i < 60; i++) m.tick(1 / 60); // let the clear finish + transmute
  assert.ok(m.stats.transmuted >= 6, `slab bottom row transmuted (${m.stats.transmuted})`);
  assert.ok(drossCells(m.grid) < before, "dross was consumed");
});

test("a chain CAN continue through a transmute (born panels are chain-eligible)", () => {
  // scan seeds for a deterministic case where transmuted panels extend the chain
  let found = false;
  for (let seed = 1; seed <= 400 && !found; seed++) {
    const m = new AL.Machine({ seed, seedRows: 0, cols: 6, rows: 14, risePerSec: 0 });
    // slab sitting on a triple that will clear; when it peels, 3 random panels
    // drop -- occasionally they complete a new match, extending the chain.
    for (let x = 0; x < 3; x++) m.grid.cells[0][x] = AL.panel(4);
    m.grid.addSlab(0, 3, 1); // 3-wide slab on top of the triple
    m.requestSwap(0, 0);     // no-op-ish; force a settle
    // trigger the triple clear directly
    m._beginClear(new Set(["0,0", "1,0", "2,0"]));
    for (let i = 0; i < 200; i++) m.tick(1 / 60);
    if (m.stats.maxChain >= 2 && m.stats.transmuted > 0) found = true;
  }
  assert.ok(found, "at least one seed extends the chain via a transmute -- continuation is wired");
});

test("DETERMINISM with dross: identical (seed, dross, inputs) => identical bout", () => {
  function run() {
    const m = new AL.Machine({ seed: 777, seedRows: 5, risePerSec: 1.2 });
    const trace = [];
    for (let i = 0; i < 300; i++) {
      if (i === 30) m.requestSwap(2, 0);
      if (i === 60) m.receiveDross({ width: 6, height: 2 });
      if (i === 130) m.receiveDross({ width: 4, height: 1 });
      m.tick(1 / 60);
      if (i % 30 === 0) trace.push(m.grid.toAscii().join("|") + "#" + m.stats.drossReceived);
    }
    return trace;
  }
  assert.deepStrictEqual(run(), run(), "dross exchange is bit-for-bit reproducible");
});
