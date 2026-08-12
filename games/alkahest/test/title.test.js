"use strict";
const { test } = require("node:test");
const assert = require("node:assert");
const AL = require("../src/core.js");
require("../src/framebuffer.js");
require("../src/palette.js");
require("../src/render.js");
require("../src/font.js");
require("../src/title.js");

function stats(fb) {
  let min = 255, max = 0, sum = 0, warmish = 0;
  const lum = (i) => 0.299 * fb.data[i] + 0.587 * fb.data[i + 1] + 0.114 * fb.data[i + 2];
  for (let i = 0; i < fb.data.length; i += 4) {
    const l = lum(i);
    min = Math.min(min, l); max = Math.max(max, l); sum += l;
    if (fb.data[i] > fb.data[i + 2] + 30) warmish++; // red-dominant => flame/brass
  }
  return { min, max, mean: sum / (fb.data.length / 4), warmish };
}

test("drawTitle composes a full opaque frame at native res", () => {
  const fb = new AL.FrameBuffer(AL.W, AL.H);
  AL.drawTitle(fb, { act: "nigredo", t: 0.6 });
  for (let i = 3; i < fb.data.length; i += 4) assert.strictEqual(fb.data[i], 255, "no transparent gaps");
});

test("title has real tonal range (lit, not flat)", () => {
  const fb = new AL.FrameBuffer(AL.W, AL.H);
  AL.drawTitle(fb, { act: "nigredo", t: 0.6 });
  const s = stats(fb);
  assert.ok(s.max - s.min > 120, `dynamic range ${s.max - s.min} (dark stone .. bright flame)`);
  assert.ok(s.mean < 110, "overall a dark, candlelit room, not a bright flat");
  assert.ok(s.warmish > 400, "warm flame/brass light present");
});

test("vignette leaves corners darker than center", () => {
  const fb = new AL.FrameBuffer(AL.W, AL.H);
  AL.drawTitle(fb, { act: "nigredo", t: 0.6 });
  const lum = (x, y) => { const p = fb.get(x, y); return 0.299 * p[0] + 0.587 * p[1] + 0.114 * p[2]; };
  const corner = (lum(0, 0) + lum(AL.W - 1, 0) + lum(0, AL.H - 1) + lum(AL.W - 1, AL.H - 1)) / 4;
  const center = lum(AL.W >> 1, AL.H >> 1);
  assert.ok(center > corner, "picture is framed by a vignette");
});

test("title is deterministic for a fixed t (proof-stable)", () => {
  const a = new AL.FrameBuffer(AL.W, AL.H);
  const b = new AL.FrameBuffer(AL.W, AL.H);
  AL.drawTitle(a, { act: "nigredo", t: 0.6 });
  AL.drawTitle(b, { act: "nigredo", t: 0.6 });
  assert.deepStrictEqual(Array.from(a.data), Array.from(b.data));
});

test("renders on every act palette without error", () => {
  for (const act of AL.ACTS) {
    const fb = new AL.FrameBuffer(AL.W, AL.H);
    assert.doesNotThrow(() => AL.drawTitle(fb, { act, t: 1.2 }));
  }
});

test("prompt can be toggled off", () => {
  const on = new AL.FrameBuffer(AL.W, AL.H);
  const off = new AL.FrameBuffer(AL.W, AL.H);
  AL.drawTitle(on, { act: "nigredo", t: 0.6, showPrompt: true });
  AL.drawTitle(off, { act: "nigredo", t: 0.6, showPrompt: false });
  assert.notDeepStrictEqual(Array.from(on.data), Array.from(off.data), "prompt changes the frame");
});

test("the title key listing documents L log export", () => {
  const fb = new AL.FrameBuffer(AL.W, AL.H);
  const labels = [];
  const saved = AL.drawTextCentered;
  AL.drawTextCentered = function (target, str, y, color, opts) {
    labels.push(String(str));
    return saved(target, str, y, color, opts);
  };
  try {
    AL.drawTitle(fb, { act: "nigredo", t: 0.6 });
  } finally {
    AL.drawTextCentered = saved;
  }
  assert.ok(labels.some((s) => s.includes("L EXPORT LOG")), "global key help names the L affordance");
});
