"use strict";
const { test } = require("node:test");
const assert = require("node:assert");
const AL = require("../src/core.js");
require("../src/framebuffer.js");
require("../src/palette.js");
require("../src/render.js");
require("../src/reagents.js");

const SIZE = 20;

function tile(id, opts) {
  const fb = new AL.FrameBuffer(SIZE, SIZE).clear(0, 0, 0);
  AL.drawReagent(fb, 0, 0, SIZE, id, opts || {});
  return fb;
}
const luma = (p) => 0.299 * p[0] + 0.587 * p[1] + 0.114 * p[2];

test("all six reagents draw without error; bad id is a no-op", () => {
  for (let i = 0; i < 6; i++) assert.doesNotThrow(() => tile(i));
  const fb = new AL.FrameBuffer(SIZE, SIZE).clear(9, 9, 9);
  AL.drawReagent(fb, 0, 0, SIZE, 99, {});
  assert.deepStrictEqual(fb.get(0, 0), [9, 9, 9, 255], "unknown reagent draws nothing");
});

test("emblem membership tests are distinct between shapes", () => {
  // a point near the corner: inside a square, outside a circle/diamond
  assert.ok(AL._inEmblem("square", 5, 5, 8));
  assert.ok(!AL._inEmblem("circle", 6, 6, 8));
  assert.ok(!AL._inEmblem("diamond", 6, 6, 8));
  // triangle apex is empty at the very top center-left/right
  assert.ok(!AL._inEmblem("triangle", 6, -7, 8));
  assert.ok(AL._inEmblem("triangle", 0, 6, 8));
});

test("tile is materially textured (not a flat fill)", () => {
  const fb = tile(0);
  const seen = new Set();
  for (let y = 2; y < SIZE - 2; y++) for (let x = 2; x < SIZE - 2; x++) seen.add(fb.get(x, y)[0]);
  assert.ok(seen.size > 6, "multiple brightness levels across the tile");
});

test("COLORBLIND: shape alone (luma-thresholded, hue discarded) is unique per reagent", () => {
  const sigs = [];
  for (let id = 0; id < 6; id++) {
    const fb = tile(id, { light: 0 });
    // mean luma of the tile, then a binary emblem mask of brighter-than-mean px
    let sum = 0, n = 0;
    for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) { sum += luma(fb.get(x, y)); n++; }
    const mean = sum / n;
    let sig = "";
    for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) sig += luma(fb.get(x, y)) > mean + 18 ? "1" : "0";
    sigs.push(sig);
  }
  const uniq = new Set(sigs);
  assert.strictEqual(uniq.size, 6, "every reagent distinguishable by luminance shape without color");
});

test("clearing state brightens the tile and dissolve punches vapor", () => {
  const idle = tile(2, { state: "idle", flash: 1 });
  const mid = tile(2, { state: "clearing", flash: 0.4 });
  const meanL = (fb) => {
    let s = 0; for (let i = 0; i < fb.data.length; i += 4) s += fb.data[i]; return s / (fb.data.length / 4);
  };
  assert.ok(meanL(mid) > meanL(idle) - 5, "clearing tile is not darker than idle");
  // dissolve introduces bright vapor pixels not present when idle-full
  const bright = (fb, thr) => {
    let c = 0; for (let i = 0; i < fb.data.length; i += 4)
      if (0.299 * fb.data[i] + 0.587 * fb.data[i + 1] + 0.114 * fb.data[i + 2] > thr) c++;
    return c;
  };
  assert.ok(bright(mid, 200) > bright(idle, 200), "dissolve punches bright vapor motes");
});

test("reagents survive every act palette (renders on each act's stone)", () => {
  for (const act of AL.ACTS) {
    const pal = AL.palette(act);
    const fb = new AL.FrameBuffer(SIZE, SIZE);
    AL.render.textureFill(fb, 0, 0, SIZE, SIZE, pal.stoneMid, AL.noise2(1), { amp: 0.1, scale: 0.1 });
    for (let id = 0; id < 6; id++) assert.doesNotThrow(() => AL.drawReagent(fb, 0, 0, SIZE, id, {}));
  }
});
