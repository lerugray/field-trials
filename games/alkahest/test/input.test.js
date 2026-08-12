"use strict";
const { test } = require("node:test");
const assert = require("node:assert");
const AL = require("../src/core.js");
require("../src/input.js");

test("down-state tracks press and release", () => {
  const inp = new AL.Input();
  assert.strictEqual(inp.isDown("Space"), false);
  inp.onDown("Space");
  assert.strictEqual(inp.isDown("Space"), true);
  inp.onUp("Space");
  assert.strictEqual(inp.isDown("Space"), false);
});

test("justPressed is a rising edge cleared by beginFrame", () => {
  const inp = new AL.Input();
  inp.onDown("Enter");
  assert.strictEqual(inp.justPressed("Enter"), true, "edge on first down");
  inp.onDown("Enter"); // still held, no new edge
  assert.strictEqual(inp.justPressed("Enter"), true, "edge persists within frame");
  inp.beginFrame();
  assert.strictEqual(inp.justPressed("Enter"), false, "edge cleared next frame");
  assert.strictEqual(inp.isDown("Enter"), true, "but still held down");
});

test("semantic actions resolve through bindings", () => {
  const inp = new AL.Input();
  inp.onDown("ArrowLeft");
  assert.strictEqual(inp.actionDown("left"), true);
  assert.strictEqual(inp.actionPressed("left"), true);
  inp.beginFrame();
  assert.strictEqual(inp.actionPressed("left"), false);
  assert.strictEqual(inp.actionDown("left"), true);
});

test("multiple physical keys map to one action (WASD + arrows)", () => {
  const inp = new AL.Input();
  inp.onDown("KeyA");
  assert.strictEqual(inp.actionDown("left"), true, "A is left");
  inp.onUp("KeyA");
  inp.onDown("ArrowLeft");
  assert.strictEqual(inp.actionDown("left"), true, "arrow is also left");
});

test("core action bindings all present and unambiguous", () => {
  const inp = new AL.Input();
  const actions = new Set(Object.values(inp.bindings));
  for (const a of ["left", "right", "up", "down", "swap", "raise", "confirm", "pause", "exportlog"]) {
    assert.ok(actions.has(a), `action '${a}' is bound`);
  }
});
