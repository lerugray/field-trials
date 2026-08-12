"use strict";
const { test } = require("node:test");
const assert = require("node:assert");
const { performance } = require("node:perf_hooks");
const AL = require("../src/core.js");
require("../src/grid.js");
require("../src/machine.js");

/* FIXTURE (studio-mandated, from M1): the 60fps budget is tested EARLY. A tick
 * of the sim -- even worst-case, a full board mid-cascade -- must fit well
 * inside the 16.6ms frame budget. Thresholds are generous (these run in
 * microseconds) so they catch an algorithmic blow-up, not micro-jitter. */

function fullRandomGrid(seed) {
  const g = new AL.Grid({ cols: 6, rows: 14, typeCount: 6 });
  const gen = AL.rng(seed);
  for (let y = 0; y < g.rows; y++)
    for (let x = 0; x < g.cols; x++) g.cells[y][x] = AL.panel(AL.randInt(gen, 6));
  return g;
}

test("resolveCascade on full random boards stays far under frame budget", { skip: !process.env.ALKAHEST_RUN_PERF && "wall-clock budget; run under ALKAHEST_RUN_PERF=1 serialized (flakes under parallel scheduling)" }, () => {
  // Budget the TOTAL over 300 full-board resolves rather than a single worst
  // sample: a total budget catches an algorithmic blow-up (it would balloon into
  // seconds) while staying robust to scheduling jitter under the parallel suite.
  let worst = 0, totalSteps = 0;
  const t0 = performance.now();
  for (let s = 0; s < 300; s++) {
    const g = fullRandomGrid(1000 + s);
    const b0 = performance.now();
    const r = g.resolveCascade();
    worst = Math.max(worst, performance.now() - b0);
    totalSteps += r.chain;
  }
  const total = performance.now() - t0;
  assert.ok(total < 400, `300 full-board resolves in ${total.toFixed(1)}ms < 400ms (avg ${(total / 300).toFixed(2)}ms)`);
  assert.ok(worst < 40, `worst single resolve ${worst.toFixed(2)}ms is not pathological`);
  assert.ok(totalSteps > 0, "boards actually cascaded (fixture is non-trivial)");
});

test("a contrived deep chain resolves within budget", () => {
  // a staircase that keeps completing rows as columns collapse
  const g = AL.Grid.fromAscii([
    "5.....",
    "5.....",
    "44....",
    "4.3...",
    "333222",
    "111222"
  ], { rows: 14 });
  const t0 = performance.now();
  const r = g.resolveCascade();
  const dt = performance.now() - t0;
  assert.ok(dt < 8, `deep chain resolved in ${dt.toFixed(2)}ms`);
  assert.ok(r.chain >= 1);
});

const RUN_WALL_CLOCK_PERF = process.env.ALKAHEST_RUN_PERF === "1";

test("worst-case animated tick stays under the 16.6ms budget", {
  skip: RUN_WALL_CLOCK_PERF ? false :
    "wall-clock fixture; run serialized with ALKAHEST_RUN_PERF=1 node --test --test-concurrency=1 test/perf.test.js"
}, () => {
  const m = new AL.Machine({ seed: 99, seedRows: 12, risePerSec: 8, raiseSpeed: 10 });
  m.setRaise(true);
  let worst = 0;
  for (let i = 0; i < 2000; i++) {
    if (i % 7 === 0) m.requestSwap(AL.randInt(AL.rng(i + 1), 5), AL.randInt(AL.rng(i + 2), 12));
    const t0 = performance.now();
    m.tick(1 / 60);
    worst = Math.max(worst, performance.now() - t0);
    if (m.state === "lost") { m.state = "play"; } // keep it churning
  }
  assert.ok(worst < 16.6, `worst tick ${worst.toFixed(2)}ms < 16.6ms (60fps)`);
});
