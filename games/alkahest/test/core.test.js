"use strict";
const { test } = require("node:test");
const assert = require("node:assert");
const AL = require("../src/core.js");

test("native buffer dimensions are fixed 16:9", () => {
  assert.strictEqual(AL.W, 384);
  assert.strictEqual(AL.H, 216);
  assert.strictEqual(AL.W / AL.H, 16 / 9);
});

test("clamp/lerp/smooth/fract behave", () => {
  assert.strictEqual(AL.clamp(5, 0, 3), 3);
  assert.strictEqual(AL.clamp(-1, 0, 3), 0);
  assert.strictEqual(AL.clamp(2, 0, 3), 2);
  assert.strictEqual(AL.lerp(0, 10, 0.5), 5);
  assert.strictEqual(AL.smooth(0), 0);
  assert.strictEqual(AL.smooth(1), 1);
  assert.ok(Math.abs(AL.fract(2.25) - 0.25) < 1e-9);
});

test("rng is deterministic per seed and reproducible", () => {
  const a = AL.rng(12345), b = AL.rng(12345), c = AL.rng(99);
  const seqA = [a(), a(), a(), a()];
  const seqB = [b(), b(), b(), b()];
  assert.deepStrictEqual(seqA, seqB, "same seed => identical stream");
  assert.notDeepStrictEqual(seqA, [c(), c(), c(), c()], "different seed => different stream");
});

test("rng outputs stay in [0,1)", () => {
  const g = AL.rng(7);
  for (let i = 0; i < 2000; i++) {
    const v = g();
    assert.ok(v >= 0 && v < 1, `out of range: ${v}`);
  }
});

test("randInt covers [0,n) and is deterministic", () => {
  const g = AL.rng(3);
  const seen = new Set();
  for (let i = 0; i < 500; i++) {
    const v = AL.randInt(g, 6);
    assert.ok(v >= 0 && v < 6 && Number.isInteger(v));
    seen.add(v);
  }
  assert.strictEqual(seen.size, 6, "all six buckets hit");
});

test("noise2 is deterministic, in-range, and non-constant", () => {
  const n1 = AL.noise2(42), n2 = AL.noise2(42);
  let min = 1, max = 0, differ = false;
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const v = n1(x * 0.37, y * 0.37);
      assert.strictEqual(v, n2(x * 0.37, y * 0.37), "same seed => same field");
      assert.ok(v >= 0 && v <= 1);
      min = Math.min(min, v); max = Math.max(max, v);
      if (Math.abs(v - 0.5) > 0.05) differ = true;
    }
  }
  assert.ok(differ && max - min > 0.2, "field varies across space");
});

test("fbm averages octaves into [0,1]", () => {
  const n = AL.noise2(1);
  for (let i = 0; i < 50; i++) {
    const v = AL.fbm(n, i * 0.11, i * 0.19, 4);
    assert.ok(v >= 0 && v <= 1, `fbm out of range: ${v}`);
  }
});

test("integerScale is nearest integer >=1", () => {
  assert.strictEqual(AL.integerScale(384, 216, 1920, 1080), 5);
  assert.strictEqual(AL.integerScale(384, 216, 1280, 720), 3);
  assert.strictEqual(AL.integerScale(384, 216, 1280, 800), 3);
  assert.strictEqual(AL.integerScale(384, 216, 100, 100), 1); // never below 1
});

test("fillScale is exact and >=1", () => {
  assert.ok(Math.abs(AL.fillScale(384, 216, 1920, 1080) - 5) < 1e-9);
  const s = AL.fillScale(384, 216, 1280, 800);
  assert.ok(s > 3 && s < 3.34);
});
