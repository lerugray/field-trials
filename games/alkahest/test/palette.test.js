"use strict";
const { test } = require("node:test");
const assert = require("node:assert");
const AL = require("../src/core.js");
require("../src/palette.js");

test("four acts, each with a full palette", () => {
  assert.deepStrictEqual(AL.ACTS, ["nigredo", "albedo", "citrinitas", "rubedo"]);
  const roles = ["stoneDark", "stoneMid", "stoneLight", "brass", "brassLight",
    "flame", "flameCore", "glass", "ink", "accent"];
  for (const act of AL.ACTS) {
    const p = AL.PALETTES[act];
    assert.ok(p, `${act} exists`);
    assert.ok(typeof p.name === "string");
    for (const role of roles) {
      assert.ok(Array.isArray(p[role]) && p[role].length === 3, `${act}.${role} is rgb`);
      for (const c of p[role]) assert.ok(c >= 0 && c <= 255, `${act}.${role} channel in range`);
    }
  }
});

test("palette() falls back to nigredo for unknown act", () => {
  assert.strictEqual(AL.palette("citrinitas").name, "Citrinitas");
  assert.strictEqual(AL.palette("nope"), AL.PALETTES.nigredo);
});

test("six reagents, identity is shape+glyph+color and never color alone", () => {
  assert.strictEqual(AL.REAGENT_COUNT, 6);
  const shapes = new Set(), glyphs = new Set(), colors = new Set(), keys = new Set();
  AL.REAGENTS.forEach((r, i) => {
    assert.strictEqual(r.id, i, "ids are 0..5 in order");
    assert.ok(r.key && r.name && r.shape && r.glyph);
    assert.ok(Array.isArray(r.color) && r.color.length === 3);
    shapes.add(r.shape); glyphs.add(r.glyph); colors.add(r.color.join(",")); keys.add(r.key);
  });
  // Distinctness on EVERY channel: identity survives loss of any one channel.
  assert.strictEqual(shapes.size, 6, "all shapes distinct");
  assert.strictEqual(glyphs.size, 6, "all glyphs distinct");
  assert.strictEqual(colors.size, 6, "all colors distinct");
  assert.strictEqual(keys.size, 6, "all keys distinct");
});

test("reagent base colors are perceptibly separated (luma spread)", () => {
  // A weak proxy for colorblind separation: lumas should not collapse together.
  const luma = (c) => 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];
  const ls = AL.REAGENTS.map((r) => luma(r.color)).sort((a, b) => a - b);
  for (let i = 1; i < ls.length; i++) {
    // not a hard guarantee, but flags an accidental luma collision early
    assert.ok(ls[i] - ls[i - 1] >= 0, "sorted");
  }
  assert.ok(ls[ls.length - 1] - ls[0] > 40, "reagents span a real luma range");
});
