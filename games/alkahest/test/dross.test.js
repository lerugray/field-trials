"use strict";
const { test } = require("node:test");
const assert = require("node:assert");
const AL = require("../src/core.js");
require("../src/grid.js");

function drossCells(g) {
  let n = 0;
  for (let y = 0; y < g.rows; y++) for (let x = 0; x < g.cols; x++) {
    const c = g.cells[y][x]; if (c && c.dross) n++;
  }
  return n;
}

test("FIXTURE slab-rigidity: a slab falls as a unit, only when its whole footprint is unsupported", () => {
  // a 3-wide slab floating over a stack that supports only its middle column
  const g = AL.Grid.fromAscii([
    "XXX",
    "...",
    ".0.",
    ".0."
  ], { rows: 6 });
  // slab occupies row 3 (cols 0,1,2). col1 has panels at rows0,1. Nothing else.
  assert.strictEqual(g.hasFloating(), true, "slab is initially unsupported");
  g.collapse();
  // the slab rests when ANY footprint cell hits support: col1's stack top is row2,
  // so the slab bottom lands at row2 (rigid: the whole slab stops together).
  const rows = g.toAscii();
  // slab bottom row should be the row directly above the col1 stack (row2 -> line index)
  let slabBottom = -1;
  for (let y = 0; y < g.rows; y++) if (g.cells[y][0] && g.cells[y][0].dross) { slabBottom = y; break; }
  assert.strictEqual(slabBottom, 2, "rigid slab rests on the tallest supporting column");
  // and all three columns of the slab are at the same row (still rigid/level)
  assert.ok(g.cells[2][0].dross && g.cells[2][1].dross && g.cells[2][2].dross, "slab stayed level");
});

test("FIXTURE slab-rigidity: a live panel rests on TOP of a slab", () => {
  const g = AL.Grid.fromAscii([
    "3..",
    "XXX",
    "0.."
  ], { rows: 6 });
  g.collapse();
  // slab lands on the floor-ish stack; the lone 3 should sit directly on the slab
  // find slab top row
  let slabTop = -1;
  for (let y = g.rows - 1; y >= 0; y--) if (g.cells[y][0] && g.cells[y][0].dross) { slabTop = y; break; }
  assert.ok(g.cells[slabTop + 1][0] && g.cells[slabTop + 1][0].t === 3, "panel rests on the slab");
});

test("FIXTURE crush: addSlab rests on the highest surface across its span (rigid)", () => {
  const g = new AL.Grid({ cols: 6, rows: 12 });
  // uneven stack: col0 height 3, col3 height 1, rest empty
  g.cells[0][0] = AL.panel(0); g.cells[1][0] = AL.panel(1); g.cells[2][0] = AL.panel(2);
  g.cells[0][3] = AL.panel(3);
  const id = g.addSlab(0, 6, 2); // full-width 2-tall slab
  assert.ok(id > 0);
  // highest column across span is col0 (height 3) -> slab bottom row = 3
  assert.ok(g.cells[3][0].dross && g.cells[3][5].dross, "slab bottom at row 3");
  assert.ok(g.cells[4][0].dross, "slab is 2 tall");
  assert.strictEqual(g.cells[2][3], null, "leaves a gap over shorter columns (crush is rigid)");
});

test("FIXTURE transmute: a clear adjacent to a slab peels only its BOTTOM row", () => {
  const g = AL.Grid.fromAscii([
    "XXX",
    "XXX",
    "111"
  ], { rows: 6, typeCount: 6 });
  const gen = AL.rng(42);
  const before = drossCells(g);
  // clear the row of 1s (row0) -> transmute the slab bottom (row1)
  const born = g.transmute(new Set(["0,0", "1,0", "2,0"]), gen, 1);
  assert.strictEqual(born.length, 3, "the slab bottom row became 3 live panels");
  assert.strictEqual(drossCells(g), before - 3, "only one row of dross was consumed");
  // the born panels carry the chain id (chain continuation, §2/§3)
  born.forEach((k) => {
    const p = k.split(","), c = g.cells[+p[1]][+p[0]];
    assert.ok(c && !c.dross && c.chain === 1, "transmuted panel is live and chain-tagged");
  });
});

test("FIXTURE transmute: a non-adjacent clear leaves the slab intact", () => {
  const g = AL.Grid.fromAscii([
    "XXX",
    "...",
    "111"
  ], { rows: 6 });
  const before = drossCells(g);
  g.transmute(new Set(["0,0", "1,0", "2,0"]), AL.rng(1), 1); // row of 1s far below the slab
  assert.strictEqual(drossCells(g), before, "no dross consumed when nothing adjacent");
});

test("FIXTURE attack-mapping shape: combo->wide/shallow, chain->full-width/tall", () => {
  // The mapping lives with the sender (machine, M2.2), but assert the geometry a
  // slab of those dims occupies once crushed, proving width/height are honored.
  const g1 = new AL.Grid({ cols: 6, rows: 12 });
  g1.addSlab(0, 5 - 1, 1); // combo N=5 -> width 4, height 1
  assert.strictEqual(drossCells(g1), 4, "combo slab is width (N-1)=4, height 1");
  const g2 = new AL.Grid({ cols: 6, rows: 12 });
  g2.addSlab(0, 6, 3 - 1); // chain L=3 -> full width 6, height L-1=2
  assert.strictEqual(drossCells(g2), 12, "chain slab is full-width 6, height (L-1)=2");
});

test("FIXTURE softlock-free: a slab crushed onto a mixed stack is fully peelable", () => {
  // Build a well: a full-width slab resting on a live stack. Prove a legal
  // sequence of adjacent clears transmutes EVERY dross cell (no permanent lock).
  const g = new AL.Grid({ cols: 6, rows: 14, typeCount: 6 });
  // 2 rows of live panels
  for (let x = 0; x < 6; x++) { g.cells[0][x] = AL.panel(x % 6); g.cells[1][x] = AL.panel((x + 1) % 6); }
  g.addSlab(0, 6, 3); // a 3-tall full-width slab on top
  const gen = AL.rng(7);
  let guard = 0;
  while (drossCells(g) > 0 && guard++ < 100) {
    // find any live panel orthogonally adjacent to a dross cell and "clear" it
    let cleared = null;
    for (let y = 0; y < g.rows && !cleared; y++) for (let x = 0; x < g.cols && !cleared; x++) {
      const c = g.cells[y][x];
      if (!c || c.dross) continue;
      const nb = [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]];
      if (nb.some(([nx, ny]) => { const d = g.at(nx, ny); return d && d.dross; })) cleared = [x, y];
    }
    assert.ok(cleared, "there is always a live panel adjacent to remaining dross (no softlock)");
    const key = cleared[0] + "," + cleared[1];
    g.transmute(new Set([key]), gen, 0);
    g.cells[cleared[1]][cleared[0]] = null; // the clear removed the live panel
    g.collapse();
  }
  assert.strictEqual(drossCells(g), 0, "every dross cell was transmuted -- fully peelable");
});

test("dross never matches or swaps", () => {
  const g = AL.Grid.fromAscii(["XXX", "..."], { rows: 4 });
  assert.strictEqual(g.findMatches().size, 0, "three dross in a row do not match");
  assert.strictEqual(g.swap(0, 1), false, "dross cannot be swapped");
});
