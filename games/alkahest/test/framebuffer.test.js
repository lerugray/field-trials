"use strict";
const { test } = require("node:test");
const assert = require("node:assert");
const AL = require("../src/core.js");
require("../src/framebuffer.js");

test("clear fills opaque color", () => {
  const fb = new AL.FrameBuffer(4, 3);
  fb.clear(10, 20, 30);
  assert.deepStrictEqual(fb.get(0, 0), [10, 20, 30, 255]);
  assert.deepStrictEqual(fb.get(3, 2), [10, 20, 30, 255]);
  assert.strictEqual(fb.data.length, 4 * 3 * 4);
});

test("set writes a single opaque pixel", () => {
  const fb = new AL.FrameBuffer(4, 4).clear(0, 0, 0);
  fb.set(2, 1, 255, 128, 64);
  assert.deepStrictEqual(fb.get(2, 1), [255, 128, 64, 255]);
  assert.deepStrictEqual(fb.get(0, 0), [0, 0, 0, 255]);
});

test("blend composites source-over", () => {
  const fb = new AL.FrameBuffer(2, 2).clear(0, 0, 0);
  fb.blend(0, 0, 200, 200, 200, 0.5);
  const p = fb.get(0, 0);
  assert.strictEqual(p[0], 100); // 200*0.5 + 0*0.5
  assert.strictEqual(p[1], 100);
  assert.strictEqual(p[2], 100);
});

test("alpha<=0 is a no-op; alpha>=1 is opaque", () => {
  const fb = new AL.FrameBuffer(2, 2).clear(50, 50, 50);
  fb.blend(0, 0, 255, 0, 0, 0);
  assert.deepStrictEqual(fb.get(0, 0), [50, 50, 50, 255]);
  fb.blend(1, 1, 255, 0, 0, 2);
  assert.deepStrictEqual(fb.get(1, 1), [255, 0, 0, 255]);
});

test("out-of-bounds ops are silently clipped", () => {
  const fb = new AL.FrameBuffer(3, 3).clear(0, 0, 0);
  assert.doesNotThrow(() => {
    fb.set(-1, 0, 1, 2, 3);
    fb.set(3, 3, 1, 2, 3);
    fb.blend(99, 99, 1, 2, 3, 1);
  });
  assert.strictEqual(fb.get(10, 10), null);
});

test("rect clips to bounds and composites", () => {
  const fb = new AL.FrameBuffer(4, 4).clear(0, 0, 0);
  fb.rect(-1, -1, 3, 3, 100, 0, 0, 1);
  assert.deepStrictEqual(fb.get(0, 0), [100, 0, 0, 255]);
  assert.deepStrictEqual(fb.get(1, 1), [100, 0, 0, 255]);
  assert.deepStrictEqual(fb.get(2, 2), [0, 0, 0, 255]); // outside rect
});

test("frame draws a one-pixel outline only", () => {
  const fb = new AL.FrameBuffer(5, 5).clear(0, 0, 0);
  fb.frame(0, 0, 5, 5, 255, 255, 255, 1);
  assert.deepStrictEqual(fb.get(0, 0), [255, 255, 255, 255]); // corner
  assert.deepStrictEqual(fb.get(4, 4), [255, 255, 255, 255]); // opposite corner
  assert.deepStrictEqual(fb.get(2, 2), [0, 0, 0, 255]);       // interior untouched
});
