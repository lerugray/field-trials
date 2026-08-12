"use strict";
const { test } = require("node:test");
const assert = require("node:assert");
const AL = require("../src/core.js");
require("../src/grid.js");

const G = AL.Grid;

/* ---- swap (STUDY §2) ---- */

test("swap exchanges two panels", () => {
  const g = G.fromAscii(["01"]);
  assert.strictEqual(g.swap(0, 0), true);
  assert.deepStrictEqual(g.toAscii(), ["10"]);
});

test("swap slides a panel into an empty cell", () => {
  const g = G.fromAscii(["0."]);
  assert.strictEqual(g.swap(0, 0), true);
  assert.deepStrictEqual(g.toAscii(), [".0"]);
});

test("two empties do not swap", () => {
  const g = G.fromAscii([".."]);
  assert.strictEqual(g.swap(0, 0), false);
});

test("dross cannot be swapped", () => {
  const g = G.fromAscii(["X0"]);
  assert.strictEqual(g.swap(0, 0), false);
  assert.deepStrictEqual(g.toAscii(), ["X0"]);
});

test("clearing cells cannot be swapped", () => {
  const g = G.fromAscii(["01"]);
  g.cells[0][0].st = "clearing";
  assert.strictEqual(g.swap(0, 0), false);
});

test("swap clamps at the right edge (no wraparound)", () => {
  const g = G.fromAscii(["012"]);
  assert.strictEqual(g.swap(2, 0), false, "no partner past the last column");
});

/* ---- single-block adjacent move (ratified design change) ---- */

test("canSlide is true when the cursor covers one live panel and one empty", () => {
  const g = G.fromAscii(["..0..."]);
  assert.strictEqual(g.canSlide(1, 0), true, "panel at right of cursor can slide left");
  assert.strictEqual(g.canSlide(2, 0), true, "panel at left of cursor can slide right");
});

test("canSlide is false when both cursor cells are occupied", () => {
  const g = G.fromAscii(["01"]);
  assert.strictEqual(g.canSlide(0, 0), false);
});

test("canSlide is false for dross or clearing cells", () => {
  const g = G.fromAscii(["X."]);
  assert.strictEqual(g.canSlide(0, 0), false, "dross blocks a slide");
  const h = G.fromAscii(["0."]);
  h.cells[0][0].st = "clearing";
  assert.strictEqual(h.canSlide(0, 0), false, "clearing panel blocks a slide");
});

test("single-block slide moves the panel and leaves the source empty", () => {
  const g = G.fromAscii(["..0..."]);
  assert.strictEqual(g.swap(1, 0), true);
  assert.deepStrictEqual(g.toAscii(), [".0...."]);
});

test("single-block slide then gravity settles onto the first support", () => {
  const g = G.fromAscii([
    "..0...",
    "..1..."
  ]);
  // slide the lone 0 left into col 1, same row
  assert.strictEqual(g.swap(1, 1), true);
  assert.deepStrictEqual(g.toAscii(), [".0....", "..1..."]);
  // after collapse the 0 falls onto the 1 at col 2 row 0
  assert.strictEqual(g.collapse(), true);
  assert.deepStrictEqual(g.toAscii(), ["......", ".01..."]);
  assert.strictEqual(g.at(1, 0).t, 0, "slid panel settled on the support below");
});

/* ---- gravity (STUDY §3) ---- */

test("collapse pulls floating panels to the floor", () => {
  const g = G.fromAscii([
    "0.",
    "..",
    ".1"
  ]);
  assert.strictEqual(g.collapse(), true);
  assert.deepStrictEqual(g.toAscii(), ["..", "..", "01"]);
});

test("collapse preserves column order", () => {
  const g = G.fromAscii([
    "2",
    ".",
    "1",
    ".",
    "0"
  ]);
  g.collapse();
  assert.deepStrictEqual(g.toAscii(), [".", ".", "2", "1", "0"]);
});

test("collapse is a no-op on a settled board", () => {
  const g = G.fromAscii(["..", "01"]);
  assert.strictEqual(g.collapse(), false);
});

/* ---- match detection (STUDY §5) ---- */

test("horizontal run of 3 matches", () => {
  const g = G.fromAscii(["000"]);
  assert.strictEqual(g.findMatches().size, 3);
});

test("vertical run of 3 matches", () => {
  const g = G.fromAscii(["0", "0", "0"]);
  assert.strictEqual(g.findMatches().size, 3);
});

test("run of 2 does not match", () => {
  const g = G.fromAscii(["00."]);
  assert.strictEqual(g.findMatches().size, 0);
});

test("different types do not match across a boundary", () => {
  const g = G.fromAscii(["00100"]);
  assert.strictEqual(g.findMatches().size, 0);
});

test("dross never matches", () => {
  const g = G.fromAscii(["XXX"]);
  assert.strictEqual(g.findMatches().size, 0);
});

test("FIXTURE L/T overlap: shared cell counted once", () => {
  // vertical 000 in col0 and horizontal 000 across the top row sharing (0,2)
  const g = G.fromAscii([
    "000",
    "0..",
    "0.."
  ]);
  const hits = g.findMatches();
  // cells: col0 rows0,1,2 (3) + top row x0,1,2 (adds x1,x2 at row2) => 5 distinct
  assert.strictEqual(hits.size, 5, "L shape clears 5 distinct cells, corner once");
  assert.ok(hits.has("0,2"), "shared corner present exactly once (Set dedupes)");
});

test("FIXTURE simultaneous row + column (disjoint) both detected", () => {
  const g = G.fromAscii([
    "111...",
    "......",
    "2.....",
    "2.....",
    "2.....",
  ]);
  const hits = g.findMatches();
  assert.strictEqual(hits.size, 6, "3 (row of 1s) + 3 (column of 2s)");
});

/* ---- cascade: chain + combo (STUDY §6) ---- */

test("single clear is chain length 1, no combo", () => {
  const g = G.fromAscii([
    "......",
    "000..."
  ]);
  const r = g.resolveCascade();
  assert.strictEqual(r.chain, 1);
  assert.strictEqual(r.totalCleared, 3);
  assert.strictEqual(r.maxCombo, 3);
});

test("FIXTURE combo: 4+ cleared in one step", () => {
  // a 2x2 of same type plus extension -> a single-step wide clear
  const g = G.fromAscii([
    "0000.."
  ]);
  const r = g.resolveCascade();
  assert.strictEqual(r.chain, 1, "one step");
  assert.strictEqual(r.maxCombo, 4, "combo of 4 in a single step");
});

test("FIXTURE chain depth: a fall after a clear extends the chain", () => {
  // Clear the bottom 111 (cols0-2). The 4 resting above col2 then falls to the
  // floor, joining the two 4s at cols3-4 to complete 444 -> a second clear.
  const g = G.fromAscii([
    "..4...",
    "11144."
  ]);
  const r = g.resolveCascade();
  assert.strictEqual(r.chain, 2, `chain should be exactly 2, got ${r.chain}`);
  assert.strictEqual(r.totalCleared, 6, "three 1s then three 4s");
});

test("FIXTURE independent groups clearing same step share that step only", () => {
  // two disjoint horizontal triples on the bottom row, far apart columns.
  const g = new AL.Grid({ cols: 8, rows: 3 });
  ["0,0", "1,0", "2,0"].forEach((k) => { const p = k.split(","); g.put(+p[0], +p[1], AL.panel(0)); });
  ["5,0", "6,0", "7,0"].forEach((k) => { const p = k.split(","); g.put(+p[0], +p[1], AL.panel(1)); });
  const r = g.resolveCascade();
  assert.strictEqual(r.chain, 1, "both groups clear in ONE step -> chain 1, not 2");
  assert.strictEqual(r.totalCleared, 6);
});

test("resolveCascade leaves a stable, match-free board", () => {
  const g = G.fromAscii([
    "..4...",
    "11144."
  ]);
  g.resolveCascade();
  assert.strictEqual(g.findMatches().size, 0, "no residual matches");
});

/* ---- new-row generation (STUDY §1) ---- */

test("FIXTURE generated rows never arrive pre-matched (horizontal)", () => {
  const g = new AL.Grid({ cols: 6, rows: 14, typeCount: 6 });
  const gen = AL.rng(4242);
  for (let i = 0; i < 500; i++) {
    const row = g.generateRow(gen);
    for (let x = 2; x < row.length; x++) {
      assert.ok(!(row[x] === row[x - 1] && row[x] === row[x - 2]), "no horizontal triple in a fresh row");
    }
  }
});

test("FIXTURE generated row avoids a vertical instant match with the two above", () => {
  const g = new AL.Grid({ cols: 3, rows: 14, typeCount: 6 });
  // force columns 0 and 1 to have matching pairs at rows 0,1
  g.put(0, 0, AL.panel(3)); g.put(0, 1, AL.panel(3));
  g.put(1, 0, AL.panel(4)); g.put(1, 1, AL.panel(4));
  const gen = AL.rng(99);
  for (let i = 0; i < 300; i++) {
    const row = g.generateRow(gen);
    assert.notStrictEqual(row[0], 3, "would complete a vertical triple in col 0");
    assert.notStrictEqual(row[1], 4, "would complete a vertical triple in col 1");
  }
});

test("ascii roundtrips through fromAscii/toAscii", () => {
  const lines = ["..12..", "0X3450"];
  const g = G.fromAscii(lines);
  assert.deepStrictEqual(g.toAscii(), lines);
});
