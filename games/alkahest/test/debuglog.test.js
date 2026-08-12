"use strict";
const { test, beforeEach } = require("node:test");
const assert = require("node:assert");
const AL = require("../src/core.js");
require("../src/framebuffer.js");
require("../src/font.js");
require("../src/debuglog.js");

beforeEach(() => AL.debug.clear());

test("log records entries and counts errors separately", () => {
  AL.debug.log("hello");
  AL.debug.error("boom");
  assert.strictEqual(AL.debug.entries().length, 2);
  assert.strictEqual(AL.debug.errorCount(), 1);
});

test("ring buffer caps at 200, dropping oldest", () => {
  for (let i = 0; i < 250; i++) AL.debug.log("m" + i);
  const es = AL.debug.entries();
  assert.strictEqual(es.length, 200);
  assert.strictEqual(es[0].msg, "m50", "oldest 50 dropped");
  assert.strictEqual(es[es.length - 1].msg, "m249", "newest kept");
});

test("text() serializes level + message", () => {
  AL.debug.error("kaboom");
  const t = AL.debug.text();
  assert.ok(t.includes("ERROR"));
  assert.ok(t.includes("kaboom"));
});

test("overlay draws nothing when there are no errors", () => {
  const fb = new AL.FrameBuffer(64, 32).clear(0, 0, 0);
  AL.debug.overlay(fb);
  let lit = 0;
  for (let i = 0; i < fb.data.length; i += 4) if (fb.data[i] > 0) lit++;
  assert.strictEqual(lit, 0, "silent when healthy");
});

test("overlay paints a loud red banner when errors exist", () => {
  const fb = new AL.FrameBuffer(200, 40).clear(0, 0, 0);
  AL.debug.error("something broke");
  AL.debug.overlay(fb);
  // top rows should carry a red-dominant banner
  let redBanner = 0;
  for (let x = 0; x < 200; x++) {
    const p = fb.get(x, 1);
    if (p[0] > 80 && p[0] > p[2] + 30) redBanner++;
  }
  assert.ok(redBanner > 100, "banner spans the top of the frame");
});
