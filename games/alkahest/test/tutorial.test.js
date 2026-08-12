"use strict";
const { test } = require("node:test");
const assert = require("node:assert");
const AL = require("../src/core.js");
require("../src/grid.js");
require("../src/machine.js");
require("../src/tutorial.js");

const DT = 1 / 60;

// drive a single step to completion using its scripted target; return the machine
function solveStep(step, seed) {
  const m = step.build(seed);
  const base = { clears: m.stats.clears, rows: m.stats.rowsRisen };
  for (let i = 0; i < 1200; i++) {
    if (step.target) m.requestSwap(step.target.x, step.target.y);
    if (step.id === "RAISE") m.setRaise(true);
    m.tick(DT);
    if (step.done(m, base)) return { m, base, ticks: i };
  }
  return null;
}

test("every tutorial step is solvable by its scripted action", () => {
  AL.Tutorial.STEPS.forEach((s, i) => {
    const r = solveStep(s, 1000 + i);
    assert.ok(r, `step ${s.id} completed by its scripted target`);
  });
});

test("SWAP lesson text teaches the single-block slide rule", () => {
  const swap = AL.Tutorial.STEPS.find((s) => s.id === "SWAP");
  const text = swap.hint.join(" ");
  assert.ok(text.toLowerCase().includes("lone") || text.toLowerCase().includes("single"), "names the lone-block case");
  assert.ok(text.toLowerCase().includes("empty"), "names the empty neighbor target");
  assert.ok(text.toLowerCase().includes("slide") || text.toLowerCase().includes("slides"), "describes the slide motion");
});

test("the CHAIN step actually produces a 2-chain (not a lucky combo)", () => {
  const chain = AL.Tutorial.STEPS.find((s) => s.id === "CHAIN");
  const r = solveStep(chain, 42);
  assert.ok(r, "chain step solved");
  assert.strictEqual(r.m.stats.maxChain, 2, "the planted board is a genuine 2-chain");
});

test("the COMBO step clears four or more at once", () => {
  const combo = AL.Tutorial.STEPS.find((s) => s.id === "COMBO");
  const r = solveStep(combo, 7);
  assert.ok(r.m.stats.maxCombo >= 4, `combo of ${r.m.stats.maxCombo} taught`);
});

test("the RESCUE step is in danger from the start and a clear freezes the rise", () => {
  const rescue = AL.Tutorial.STEPS.find((s) => s.id === "RESCUE");
  const m = rescue.build(3);
  m.tick(DT);
  assert.strictEqual(m.danger, true, "stack starts at the warning height");
  const risenBefore = m.stats.rowsRisen;
  m.requestSwap(rescue.target.x, rescue.target.y);
  // during the clear the rise is frozen (stop-time) -- no row commits mid-clear
  for (let i = 0; i < 40; i++) {
    m.tick(DT);
    if (m.clearing && m.stats.rowsRisen > risenBefore) assert.fail("rise committed during the freeze");
  }
  assert.ok(m.stats.clears > 0, "the rescue clear happened");
});

test("the whole tutorialette completes in order when each step is solved", () => {
  const t = new AL.Tutorial({ seed: 9 });
  const order = [];
  let guard = 0;
  let lastIndex = -1;
  while (!t.complete && guard++ < 8000) {
    const s = t.step();
    if (s && t.progress().index !== lastIndex) { order.push(s.id); lastIndex = t.progress().index; }
    if (s && s.target) t.m.requestSwap(s.target.x, s.target.y);
    if (s && s.id === "RAISE") t.m.setRaise(true);
    t.tick(DT);
  }
  assert.ok(t.complete, "tutorialette completed");
  assert.deepStrictEqual(order, ["SWAP", "COMBO", "CHAIN", "RAISE", "RESCUE"], "taught in the pinned order");
});

test("the tutorialette is SKIPPABLE at any time", () => {
  const t = new AL.Tutorial({ seed: 1 });
  t.tick(DT);
  assert.strictEqual(t.complete, false);
  t.skip();
  assert.strictEqual(t.complete, true, "skip ends the tutorialette immediately");
});

test("the RAISE lesson cannot complete from idle acceleration", () => {
  const t = new AL.Tutorial({ seed: 1 });
  t.i = 3;
  t._enterStep();
  for (let i = 0; i < 60 * 30; i++) t.tick(DT);
  assert.strictEqual(t.i, 3, "thirty idle seconds leave the RAISE lesson active");
  assert.strictEqual(t.m.stats.rowsRisen, 0, "idle input raises no rows");
  t.m.setRaise(true);
  let guard = 0;
  while (t.i === 3 && guard++ < 600) t.tick(DT);
  assert.strictEqual(t.i, 4, "holding RAISE advances to RESCUE");
});

test("a topped-out lesson enters fail/retry and rebuilds the same lesson", () => {
  const t = new AL.Tutorial({ seed: 17 });
  const dead = t.m;
  for (let y = 0; y < dead.grid.rows; y++)
    for (let x = 0; x < dead.grid.cols; x++) dead.grid.cells[y][x] = AL.panel((x + y) % 6);
  dead.setRaise(true);
  let guard = 0;
  while (!t.lessonFailed && guard++ < 300) t.tick(DT);
  assert.strictEqual(dead.state, "lost", "forced top-out reaches a real loss");
  assert.strictEqual(t.lessonFailed, true, "tutorial exposes the retry state");
  assert.strictEqual(t.i, 0, "failure does not silently advance the lesson");
  assert.strictEqual(t.retry(), true, "retry is accepted from the failed state");
  assert.notStrictEqual(t.m, dead, "retry rebuilds the planted board");
  assert.strictEqual(t.i, 0, "retry restarts the same lesson");
  assert.strictEqual(t.lessonFailed, false, "retry returns to active play");
  assert.strictEqual(t.m.state, "play", "the rebuilt lesson is live");
});

test("DETERMINISM: same seed => identical planted boards", () => {
  const a = new AL.Tutorial({ seed: 55 });
  const b = new AL.Tutorial({ seed: 55 });
  assert.strictEqual(a.m.grid.toAscii().join("|"), b.m.grid.toAscii().join("|"), "step 1 boards match");
});
