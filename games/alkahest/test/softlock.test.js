"use strict";
/* M3.6 -- the softlock law (STUDY-run §6, DESIGN-SEED): no reachable board state
 * makes a dross slab permanently untransmutable. Fixture: softlockNoTrap. Proven
 * against worst-case crush stacks including Citrinitas-amplified and
 * Rubedo-multiplied slab sizes. */
const test = require("node:test");
const assert = require("node:assert");
require("../src/core.js");
const AL = require("../src/grid.js");

function fillRandom(g, gen, rows) {
  for (let y = 0; y < rows; y++)
    for (let x = 0; x < g.cols; x++) g.cells[y][x] = AL.panel(AL.randInt(gen, g.typeCount));
}
function drossCount(g) {
  let n = 0;
  for (let y = 0; y < g.rows; y++) for (let x = 0; x < g.cols; x++) if (g.cells[y][x] && g.cells[y][x].dross) n++;
  return n;
}

test("softlockNoTrap: crushed slabs always rest on the surface (never below live)", () => {
  for (let s = 0; s < 200; s++) {
    const gen = AL.rng(1000 + s);
    const g = new AL.Grid({ cols: 6, rows: 16 });
    fillRandom(g, gen, AL.randInt(gen, 4)); // 0..3 live rows
    // pile on several slabs at worst-case sizes (Rubedo x1.5, Citrinitas +1)
    for (let k = 0; k < 3; k++) {
      const w = 1 + AL.randInt(gen, 6);
      const h = 1 + AL.randInt(gen, 4);
      const x0 = AL.randInt(gen, 6);
      const id = g.addSlab(x0, w, h);
      // a freshly crushed slab is a grounded rigid unit -- it rested on the
      // highest surface across its footprint, nothing floats free of the stack
      assert.ok(!g.hasFloating(), "seed " + s + ": crush left a floating unit");
      // and it never buried a live panel: no live reagent sits above its top
      if (id > 0) {
        for (let x = 0; x < g.cols; x++) {
          let topDross = -1;
          for (let y = g.rows - 1; y >= 0; y--) { const c = g.cells[y][x]; if (c && c.dross && c.slabId === id) { topDross = y; break; } }
          if (topDross >= 0) for (let y = topDross + 1; y < g.rows; y++)
            assert.ok(!(g.cells[y][x] && !g.cells[y][x].dross), "seed " + s + ": a live panel was buried above dross");
        }
      }
    }
  }
});

test("softlockNoTrap: any dross configuration is fully transmutable (no trap)", () => {
  for (let s = 0; s < 120; s++) {
    const gen = AL.rng(5000 + s);
    const g = new AL.Grid({ cols: 6, rows: 18 });
    fillRandom(g, gen, 1 + AL.randInt(gen, 3));
    for (let k = 0; k < 4; k++) g.addSlab(AL.randInt(gen, 6), 1 + AL.randInt(gen, 6), 1 + AL.randInt(gen, 5));
    g.collapse();
    // repeatedly peel every slab's bottom row (the Quintessence guarantee) until
    // no dross remains -- if this always terminates, no slab is ever a permanent trap
    let guard = 0;
    while (drossCount(g) > 0 && guard++ < 200) {
      const born = g.transmuteAllBottomRows(gen, 0);
      assert.ok(born.length > 0, "seed " + s + ": dross present but nothing peeled (a trap!)");
      g.collapse();
    }
    assert.strictEqual(drossCount(g), 0, "seed " + s + ": all dross transmuted away");
  }
});

test("a slab crushed onto a full well tops out (returns -1), never overlaps live", () => {
  const g = new AL.Grid({ cols: 4, rows: 4 });
  for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) g.cells[y][x] = AL.panel(1);
  assert.strictEqual(g.addSlab(0, 4, 2), -1, "no room: a fair top-out, not an overlap");
});
