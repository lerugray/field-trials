"use strict";
const { test } = require("node:test");
const assert = require("node:assert");
const AL = require("../src/core.js");
require("../src/framebuffer.js");
require("../src/render.js");

const luma = (p) => 0.299 * p[0] + 0.587 * p[1] + 0.114 * p[2];

test("gradientV interpolates top to bottom", () => {
  const fb = new AL.FrameBuffer(4, 5);
  AL.render.gradientV(fb, 0, 0, 4, 5, [0, 0, 0], [200, 200, 200]);
  assert.deepStrictEqual(fb.get(0, 0), [0, 0, 0, 255]);
  assert.deepStrictEqual(fb.get(0, 4), [200, 200, 200, 255]);
  const mid = fb.get(0, 2);
  assert.ok(mid[0] > 80 && mid[0] < 120, "midpoint interpolated");
});

test("textureFill grains the surface (not a flat fill)", () => {
  const fb = new AL.FrameBuffer(32, 32).clear(0, 0, 0);
  const n = AL.noise2(9);
  AL.render.textureFill(fb, 0, 0, 32, 32, [100, 100, 100], n, { amp: 0.3, scale: 0.15 });
  const seen = new Set();
  for (let y = 0; y < 32; y += 3)
    for (let x = 0; x < 32; x += 3) seen.add(fb.get(x, y)[0]);
  assert.ok(seen.size > 5, "material has multiple brightness levels, not one flat value");
});

test("glow adds light near center, less at edge", () => {
  const fb = new AL.FrameBuffer(21, 21).clear(20, 20, 20);
  AL.render.glow(fb, 10, 10, 8, [255, 200, 120], 0.9);
  const center = luma(fb.get(10, 10));
  const edge = luma(fb.get(10, 4)); // 6px away, inside radius 8
  const corner = luma(fb.get(0, 0)); // outside radius, untouched
  assert.ok(center > edge, "brighter at center than near edge");
  assert.ok(edge > corner, "still brighter than untouched corner");
  assert.ok(Math.abs(corner - 20) < 1, "outside radius unchanged");
});

test("glow never overflows 255", () => {
  const fb = new AL.FrameBuffer(5, 5).clear(250, 250, 250);
  AL.render.glow(fb, 2, 2, 4, [255, 255, 255], 1);
  const p = fb.get(2, 2);
  assert.ok(p[0] <= 255 && p[1] <= 255 && p[2] <= 255);
});

test("vignette darkens corners relative to center", () => {
  const fb = new AL.FrameBuffer(41, 41).clear(150, 150, 150);
  AL.render.vignette(fb, 0.8);
  const center = luma(fb.get(20, 20));
  const corner = luma(fb.get(0, 0));
  assert.ok(center > corner + 20, "corner meaningfully darker");
  assert.ok(Math.abs(center - 150) < 2, "center nearly untouched");
});

test("lightRig composites multiple lights", () => {
  const fb = new AL.FrameBuffer(30, 20).clear(10, 10, 10);
  AL.render.lightRig(fb, [
    { x: 5, y: 10, radius: 6, color: [255, 180, 100], intensity: 0.8 },
    { x: 25, y: 10, radius: 6, color: [100, 140, 255], intensity: 0.8 }
  ]);
  assert.ok(luma(fb.get(5, 10)) > 30, "left light lit");
  assert.ok(luma(fb.get(25, 10)) > 30, "right light lit");
  assert.ok(Math.abs(luma(fb.get(15, 10)) - 10) < 6, "dark gap between lights");
});

test("ring draws a hollow, bounded action shape", () => {
  const fb = new AL.FrameBuffer(31, 31).clear(8, 8, 8);
  AL.render.ring(fb, 15, 15, 8, [220, 180, 80], 1, 1);
  assert.deepStrictEqual(fb.get(15, 15), [8, 8, 8, 255], "center remains hollow");
  assert.ok(luma(fb.get(23, 15)) > 40, "circumference is visible");
  assert.deepStrictEqual(fb.get(0, 0), [8, 8, 8, 255], "outside stays untouched");
});
