"use strict";
/* M4 -- bench composition, act signatures, and the photosensitivity contract. */
const { test } = require("node:test");
const assert = require("node:assert");
const AL = require("../src/core.js");
require("../src/framebuffer.js");
require("../src/palette.js");
require("../src/render.js");
require("../src/visuals.js");
require("../src/font.js");
require("../src/reagents.js");
require("../src/bench.js");
require("../src/grid.js");
require("../src/acts.js");
require("../src/machine.js");
require("../src/well.js");

function digest(fb) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < fb.data.length; i += 17) {
    h ^= fb.data[i]; h = Math.imul(h, 16777619) >>> 0;
  }
  return h;
}
function changed(a, b) {
  let n = 0;
  for (let i = 0; i < a.data.length; i += 4)
    if (a.data[i] !== b.data[i] || a.data[i + 1] !== b.data[i + 1] || a.data[i + 2] !== b.data[i + 2]) n++;
  return n;
}

test("photosensitivity: flash intensity clamps and has a conservative default", () => {
  const before = AL.VISUALS.flashIntensity;
  assert.strictEqual(AL.VISUAL_LIMITS.defaultFlashIntensity, 0.65);
  assert.strictEqual(AL.setFlashIntensity(-4), 0);
  assert.strictEqual(AL.setFlashIntensity(8), 1);
  assert.strictEqual(AL.setFlashIntensity(NaN), 0.65);
  AL.setFlashIntensity(before);
});

test("photosensitivity: at most two simultaneous chain-fire blooms", () => {
  const machines = Array.from({ length: 5 }, (_, i) => ({ lastEvent: { t: 1, chain: i + 1, combo: 3 + i } }));
  const chosen = AL.chainBloomIndices(machines, 1.1);
  assert.ok(chosen.length <= 2);
  assert.deepStrictEqual(chosen, [4, 3], "the two most legible/severe events win the bounded light budget");
});

test("bench PoC is deterministic, materially varied, and distinct in every act", () => {
  const hashes = new Set();
  for (const act of AL.ACTS) {
    const a = new AL.FrameBuffer(AL.W, AL.H), b = new AL.FrameBuffer(AL.W, AL.H);
    AL.drawBenchPoc(a, { act, time: 0.6 });
    AL.drawBenchPoc(b, { act, time: 0.6 });
    assert.deepStrictEqual(a.data, b.data, act + " proof is deterministic");
    hashes.add(digest(a));
    const tones = new Set();
    for (let y = 4; y < AL.H; y += 9) for (let x = 4; x < AL.W; x += 9) tones.add(a.get(x, y).slice(0, 3).join(","));
    assert.ok(tones.size > 80, act + " has real material/light tonal range");
  }
  assert.strictEqual(hashes.size, 4, "all four acts produce a visibly distinct bench");
});

test("zero flash still communicates chain/combo without changing frame edges", () => {
  const m = new AL.Machine({ seed: 77, seedRows: 6 });
  const quiet = new AL.FrameBuffer(AL.W, AL.H);
  AL.drawWell(quiet, m, { act: "nigredo", cursor: { x: 2, y: 4 }, time: 0.2, flashIntensity: 0 });
  m.lastEvent = { chain: 3, combo: 5, t: 0.1 };
  const reduced = new AL.FrameBuffer(AL.W, AL.H);
  AL.drawWell(reduced, m, { act: "nigredo", cursor: { x: 2, y: 4 }, time: 0.2, flashIntensity: 0 });
  assert.ok(changed(quiet, reduced) > 40, "engraved readout, ring, and sparks remain with flashes disabled");

  const full = new AL.FrameBuffer(AL.W, AL.H);
  AL.drawWell(full, m, { act: "nigredo", cursor: { x: 2, y: 4 }, time: 0.2, flashIntensity: 1 });
  [[0, 0], [AL.W - 1, 0], [0, AL.H - 1], [AL.W - 1, AL.H - 1]].forEach(([x, y]) =>
    assert.deepStrictEqual(full.get(x, y), reduced.get(x, y), "bounded flash leaves frame corner unchanged"));
});

test("dross crush and transmute have visible non-screen-flash geometry", () => {
  const m = new AL.Machine({ seed: 12, seedRows: 5 });
  const base = new AL.FrameBuffer(AL.W, AL.H);
  AL.drawWell(base, m, { act: "citrinitas", time: 0.3, flashIntensity: 0 });
  m.lastCrush = { t: 0.1, x0: 1, width: 4, height: 2 };
  m.lastTransmute = { t: 0.1, count: 4 };
  const fx = new AL.FrameBuffer(AL.W, AL.H);
  AL.drawWell(fx, m, { act: "citrinitas", time: 0.3, flashIntensity: 0 });
  assert.ok(changed(base, fx) > 20, "dust fall and transmute seam remain visible at zero flash");
  assert.deepStrictEqual(base.get(0, 0), fx.get(0, 0), "effect does not flash the full screen");
});
