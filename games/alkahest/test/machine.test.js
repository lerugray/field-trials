"use strict";
const { test } = require("node:test");
const assert = require("node:assert");
const AL = require("../src/core.js");
require("../src/grid.js");
require("../src/machine.js");

// place an ascii board on a fresh (empty-seeded) machine's bottom rows
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

// run until the board is fully at rest (or a cap)
function settle(m, dt) {
  dt = dt || 1 / 60;
  for (let i = 0; i < 4000; i++) {
    m.tick(dt);
    if (!m.clearing && !m.grid.hasFloating() && m.grid.findMatches().size === 0 && !m.cascadeActive) return i;
  }
  return -1;
}

test("seeded stack has the right height and no pre-existing matches", () => {
  const m = new AL.Machine({ seed: 12345, seedRows: 6 });
  assert.strictEqual(m.grid.findMatches().size, 0, "no instant matches at start");
  assert.strictEqual(m.grid.stackHeight(), 6, "seeded to requested height");
  assert.strictEqual(m.state, "play");
});

test("a swap that forms a triple clears it and records the event", () => {
  const m = boarded(["1101.."]); // bottom row
  m.requestSwap(2, 0); // swap the 0 and 1 -> 1,1,1,0
  settle(m);
  assert.strictEqual(m.stats.swaps, 1);
  assert.strictEqual(m.stats.clears, 1);
  assert.strictEqual(m.stats.panelsCleared, 3);
  assert.ok(m.lastEvent && m.lastEvent.combo === 3);
  // the three 1s are gone; the lone 0 remains
  assert.strictEqual(m.grid.findMatches().size, 0);
  let ones = 0;
  for (let y = 0; y < m.grid.rows; y++) for (let x = 0; x < m.grid.cols; x++) {
    const c = m.grid.cells[y][x]; if (c && c.t === 1) ones++;
  }
  assert.strictEqual(ones, 0, "matched panels dissolved");
});

test("single-block slide into an empty neighbor can set up a clear", () => {
  // a lone 1 separated by an empty from two other 1s; sliding it left completes
  // the horizontal triple (the ratified single-block adjacent move).
  const m = boarded(["11.1.."]);
  assert.strictEqual(m.grid.canSlide(2, 0), true, "cursor over empty+lone panel");
  m.requestSwap(2, 0);
  settle(m);
  assert.strictEqual(m.stats.swaps, 1);
  assert.strictEqual(m.stats.clears, 1);
  assert.strictEqual(m.stats.panelsCleared, 3);
  assert.ok(m.lastEvent && m.lastEvent.combo === 3);
  // same action on the oracle grid yields identical totals
  const oracle = AL.Grid.fromAscii(["11.1.."], { rows: 14 });
  oracle.swap(2, 0);
  const o = oracle.resolveCascade();
  assert.strictEqual(m.stats.maxChain, o.chain);
  assert.strictEqual(m.stats.panelsCleared, o.totalCleared);
});

test("STOP-TIME: rise is frozen while a clear/cascade resolves", () => {
  // very fast rise so any unfrozen tick would commit rows immediately
  const m = boarded(["1101.."], { risePerSec: 1000 });
  m.requestSwap(2, 0);
  // drive the clear window; rise must not commit while clearing/settling
  let committedDuringClear = 0;
  for (let i = 0; i < 30; i++) {
    m.tick(1 / 60);
    if (m.clearing || m.grid.hasFloating() || m.grid.findMatches().size > 0) {
      if (m.stats.rowsRisen > 0) committedDuringClear = m.stats.rowsRisen;
    } else break;
  }
  assert.strictEqual(committedDuringClear, 0, "no row committed while frozen");
});

test("animated cascade reports the SAME chain+cleared as the oracle", () => {
  const lines = ["..4...", "11144."];
  const m = boarded(lines);
  settle(m);
  // oracle on an identical fresh grid
  const oracle = AL.Grid.fromAscii(lines, { rows: 14 }).resolveCascade();
  assert.strictEqual(m.stats.maxChain, oracle.chain, "chain depth matches oracle");
  assert.strictEqual(m.stats.panelsCleared, oracle.totalCleared, "cleared count matches oracle");
  assert.strictEqual(m.stats.maxChain, 2, "this board is a 2-chain");
});

test("manual raise commits rows far faster than auto-rise", () => {
  const m = new AL.Machine({ seed: 5, seedRows: 4, risePerSec: 0.1, raiseSpeed: 6 });
  m.setRaise(true);
  for (let i = 0; i < 60; i++) m.tick(1 / 60); // ~1s of manual raise
  assert.ok(m.stats.rowsRisen >= 4, `manual raise committed ${m.stats.rowsRisen} rows in ~1s`);
});

test("auto-rise commits rows over time when the board is at rest", () => {
  const m = new AL.Machine({ seed: 7, seedRows: 3, risePerSec: 2 });
  for (let i = 0; i < 120; i++) m.tick(1 / 60); // 2s at 2 rows/s -> ~4 rows
  assert.ok(m.stats.rowsRisen >= 3, `auto-rise committed ${m.stats.rowsRisen} rows`);
});

test("TOP-OUT: a jammed stack enters grace, then loses if unrescued", () => {
  // fill the well to the ceiling so a commit must push a panel out the top
  const m = new AL.Machine({ seed: 9, seedRows: 0, rows: 6, risePerSec: 1000, graceDuration: 0.5 });
  for (let y = 0; y < m.grid.rows; y++)
    for (let x = 0; x < m.grid.cols; x++)
      m.grid.cells[y][x] = AL.panel((x + y) % 6); // dense, arranged to avoid a full clear
  m.tick(1 / 60);                 // rise tries to commit -> grace
  assert.strictEqual(m.state, "grace", "brink entered, not instant death");
  for (let i = 0; i < 60; i++) m.tick(1 / 60); // > graceDuration with no rescue
  assert.strictEqual(m.state, "lost", "unrescued brink becomes a loss");
});

test("near-death danger flag raises before loss", () => {
  const m = new AL.Machine({ seed: 3, seedRows: 0, rows: 14, warnRow: 10 });
  for (let y = 0; y < 11; y++)
    for (let x = 0; x < m.grid.cols; x++) m.grid.cells[y][x] = AL.panel((x * 3 + y) % 6);
  m.tick(1 / 60);
  assert.strictEqual(m.danger, true, "warning height flags danger");
  assert.strictEqual(m.state, "play", "danger is not yet loss");
});

test("rise ACCELERATES with elapsed time, capped at riseMax", () => {
  const m = new AL.Machine({ seed: 1, seedRows: 0, risePerSec: 0.1, riseAccel: 0.02, riseMax: 0.9 });
  const r0 = m.effectiveRise();
  m.time = 20; // 20s elapsed
  const r20 = m.effectiveRise();
  assert.ok(Math.abs(r0 - 0.1) < 1e-9, "starts at base");
  assert.ok(r20 > r0, "rise rate grows over time");
  assert.ok(Math.abs(r20 - Math.min(0.9, 0.1 + 0.02 * 20)) < 1e-9);
  m.time = 1000;
  assert.strictEqual(m.effectiveRise(), 0.9, "capped at riseMax");
});

test("effectiveRise keeps an explicit zero base fully off until manual raise", () => {
  const m = new AL.Machine({ seed: 1, seedRows: 0, risePerSec: 0, riseAccel: 10 });
  m.time = 1000;
  assert.strictEqual(m.effectiveRise(), 0, "acceleration cannot resurrect disabled auto-rise");
  for (let i = 0; i < 600; i++) m.tick(1 / 60);
  assert.strictEqual(m.stats.rowsRisen, 0, "ten seconds idle commits no passive rows");
  assert.strictEqual(m.riseOffset, 0, "idle board does not even accumulate a partial row");
  m.setRaise(true);
  m.tick(0.2);
  assert.ok(m.stats.rowsRisen >= 1, "manual raise still works on an auto-rise-off board");
});

test("FIXTURE swap-buffer: a swap held while a cell is clearing fires when legal", () => {
  const m = new AL.Machine({ seed: 1, seedRows: 0, swapBufferMs: 150 });
  m.grid.cells[0][0] = AL.panel(0);
  m.grid.cells[0][1] = AL.panel(1);
  m.grid.cells[0][1].st = "clearing";           // right cell transiently illegal
  m.requestSwap(0, 0);
  m.tick(0.05);                                  // 50ms: still illegal, buffered
  assert.strictEqual(m.stats.swaps, 0, "not yet executed");
  assert.ok(m._pendingSwap, "swap is buffered");
  m.grid.cells[0][1].st = "idle";                // becomes legal within the window
  m.tick(0.02);
  assert.strictEqual(m.stats.swaps, 1, "executed the instant it became legal");
  assert.strictEqual(m._pendingSwap, null);
});

test("FIXTURE swap-buffer window expires (~150ms) and drops", () => {
  const m = new AL.Machine({ seed: 1, seedRows: 0, swapBufferMs: 150 });
  m.grid.cells[0][0] = AL.panel(0);
  m.grid.cells[0][1] = AL.panel(1);
  m.grid.cells[0][1].st = "clearing"; // stays illegal the whole time
  m.requestSwap(0, 0);
  for (let i = 0; i < 15; i++) m.tick(0.02); // 300ms > window
  assert.strictEqual(m.stats.swaps, 0, "never executed");
  assert.strictEqual(m._pendingSwap, null, "buffer dropped after the window");
});

test("FIXTURE diminishing freeze: consecutive chain links freeze for less", () => {
  const m = new AL.Machine({ seed: 1, seedRows: 0, clearDuration: 0.36, freezeDecay: 0.82, clearDurationFloor: 0.14 });
  m.grid.cells[0][0] = AL.panel(0);
  m.chain = 0; m._beginClear(new Set(["0,0"]));
  const d1 = m.clearing.dur;
  m.clearing = null; m.chain = 3; m._beginClear(new Set(["0,0"]));
  const d4 = m.clearing.dur;
  m.clearing = null; m.chain = 50; m._beginClear(new Set(["0,0"]));
  const dDeep = m.clearing.dur;
  assert.ok(Math.abs(d1 - 0.36) < 1e-9, "first link is the full freeze");
  assert.ok(d4 < d1, "later links freeze less");
  assert.ok(Math.abs(dDeep - 0.14) < 1e-9, "floored, so no infinite stall");
});

test("FIXTURE swap-during-fall resolves deterministically in SIM", () => {
  function run() {
    const m = new AL.Machine({ seed: 1, seedRows: 0, rows: 8, cols: 4 });
    // a floating stack that must fall, plus material to swap mid-fall
    m.grid.cells[5][0] = AL.panel(2);
    m.grid.cells[4][0] = AL.panel(3);
    m.grid.cells[0][1] = AL.panel(4);
    m.grid.cells[0][2] = AL.panel(5);
    for (let i = 0; i < 40; i++) {
      if (i === 1) m.requestSwap(1, 0); // swap while col0 is mid-fall
      m.tick(1 / 60);
    }
    return m.grid.toAscii().join("|");
  }
  assert.strictEqual(run(), run(), "identical outcome across runs");
});

test("DETERMINISM: same seed + identical inputs => identical state each tick", () => {
  function run() {
    const m = new AL.Machine({ seed: 20260810, seedRows: 5, risePerSec: 1.5 });
    const trace = [];
    for (let i = 0; i < 400; i++) {
      if (i === 50) m.requestSwap(2, 0);
      if (i === 120) m.setRaise(true);
      if (i === 140) m.setRaise(false);
      m.tick(1 / 60);
      if (i % 40 === 0) trace.push(m.grid.toAscii().join("|") + "#" + m.riseOffset.toFixed(5) + "#" + m.state);
    }
    return trace;
  }
  assert.deepStrictEqual(run(), run(), "bit-for-bit reproducible from (seed, inputs)");
});
