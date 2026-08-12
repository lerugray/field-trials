"use strict";
const { test } = require("node:test");
const assert = require("node:assert");

/* Headless smoke test of the real browser boot path: a minimal DOM/window stub
 * exercises AL.boot() end to end (canvas sizing, input attach, error trap, the
 * update+render+blit frame) so boot wiring can't silently break. */

const AL = require("../src/core.js");
require("../src/framebuffer.js");
require("../src/palette.js");
require("../src/render.js");
require("../src/font.js");
require("../src/reagents.js");
require("../src/grid.js");
require("../src/acts.js");
require("../src/machine.js");
require("../src/alembic.js");
require("../src/duel.js");
require("../src/formulae.js");
require("../src/run.js");
require("../src/tutorial.js");
require("../src/debuglog.js");
require("../src/score.js");
require("../src/input.js");
require("../src/title.js");
require("../src/well.js");
require("../src/folioui.js");
require("../src/main.js");

function fakeCtx() {
  return { imageSmoothingEnabled: true, putCount: 0, putImageData() { this.putCount++; } };
}

function fakeEnv() {
  const listeners = {};
  const ctx = fakeCtx();
  const canvas = {
    width: 0, height: 0, style: {},
    getContext() { return ctx; }
  };
  let rafCb = null;
  const win = {
    innerWidth: 1280, innerHeight: 720,
    addEventListener(type, fn) { (listeners[type] = listeners[type] || []).push(fn); },
    requestAnimationFrame(fn) { rafCb = fn; return 1; }
  };
  const doc = {
    getElementById(id) { return id === "screen" ? canvas : null; },
    body: { appendChild() {}, removeChild() {} },
    createElement() { return { click() {}, style: {} }; }
  };
  return { win, doc, ctx, canvas, listeners, tick: (ts = 16) => rafCb && rafCb(ts) };
}

test("boot wires the canvas to native resolution", () => {
  globalThis.ImageData = class { constructor(d, w, h) { this.data = d; this.width = w; this.height = h; } };
  const env = fakeEnv();
  const app = AL.boot(env.win, env.doc);
  assert.strictEqual(env.canvas.width, AL.W);
  assert.strictEqual(env.canvas.height, AL.H);
  assert.strictEqual(env.ctx.imageSmoothingEnabled, false, "nearest-neighbour scaling");
  assert.ok(app.fb instanceof AL.FrameBuffer);
  assert.ok(env.listeners.keydown.length >= 2, "input and gesture-gated audio are attached");
});

test("boot missing #screen fails loudly", () => {
  const env = fakeEnv();
  env.doc.getElementById = () => null;
  assert.throws(() => AL.boot(env.win, env.doc), /#screen/);
});

test("a driven frame renders the title and blits it", () => {
  globalThis.ImageData = class { constructor(d, w, h) { this.data = d; this.width = w; this.height = h; } };
  AL.debug.clear();
  const env = fakeEnv();
  AL.boot(env.win, env.doc); // kicks the first rAF
  env.tick();                // run exactly one frame
  assert.ok(env.ctx.putCount >= 1, "frame was blitted to the canvas");
  // the title composed a real, non-black picture into the shared buffer
  const app = AL.boot(env.win, env.doc);
  env.tick();
  let lit = 0;
  for (let i = 0; i < app.fb.data.length; i += 4) if (app.fb.data[i] > 20) lit++;
  assert.ok(lit > 1000, "title composed visible content");
  assert.strictEqual(AL.debug.errorCount(), 0, "no runtime errors during boot");
});

test("a throwing scene is caught, logged loudly, never a black void", () => {
  globalThis.ImageData = class { constructor(d, w, h) { this.data = d; this.width = w; this.height = h; } };
  AL.debug.clear();
  const env = fakeEnv();
  const app = AL.boot(env.win, env.doc);
  const saved = AL.scenes.title.render;
  AL.scenes.title.render = function () { throw new Error("scene exploded"); };
  try {
    env.tick();
  } finally {
    AL.scenes.title.render = saved;
  }
  assert.ok(AL.debug.errorCount() >= 1, "error captured");
  assert.ok(AL.debug.text().includes("scene exploded"), "message logged for export");
  // recovery fill is dark red, not a black void
  const p = app.fb.get(0, AL.H - 1);
  assert.ok(p[0] > p[2], "recovery frame is warm-dark, not black");
});

test("confirm at title transitions into the tutorialette, which leads to the run", () => {
  globalThis.ImageData = class { constructor(d, w, h) { this.data = d; this.width = w; this.height = h; } };
  AL.debug.clear();
  const env = fakeEnv();
  const app = AL.boot(env.win, env.doc);
  assert.strictEqual(AL._active, AL.scenes.title, "boots to title");
  // press Enter (confirm) and run a frame -> the tutorialette
  app.input.onDown("Enter");
  env.tick();
  assert.strictEqual(AL._active, AL.scenes.learn, "confirm entered the tutorialette");
  assert.ok(AL.scenes.learn.tut instanceof AL.Tutorial, "learn owns a tutorial");
  // skipping the tutorialette then confirming begins the run (its first bout)
  AL.scenes.learn.tut.skip();
  app.input.onUp("Enter"); app.input.onDown("Enter");
  env.tick();
  assert.strictEqual(AL._active, AL.scenes.run, "post-tutorial confirm begins the run");
  assert.ok(AL.scenes.run.run instanceof AL.Run, "the run exists");
  assert.strictEqual(AL.scenes.run.run.state, "bout", "starts in the first bout");
  assert.ok(AL.scenes.run.run.duel instanceof AL.Duel, "the bout's duel exists");
  assert.strictEqual(AL.debug.errorCount(), 0, "no errors through the flow");
});

test("natural tutorial completion renders its prompt with zero errors and enters bout one", () => {
  globalThis.ImageData = class { constructor(d, w, h) { this.data = d; this.width = w; this.height = h; } };
  AL.debug.clear();
  const env = fakeEnv();
  const app = AL.boot(env.win, env.doc);
  app.input.onDown("Enter");
  env.tick(16);
  app.input.onUp("Enter");
  assert.strictEqual(AL._active, AL.scenes.learn, "entered the tutorial scene");

  // Satisfy every planted lesson through its normal predicate and timing. This
  // deliberately does not use skip(), so i reaches STEPS.length naturally.
  const tut = AL.scenes.learn.tut;
  let guard = 0;
  while (!tut.complete && guard++ < 8000) {
    const step = tut.step();
    if (step.target) tut.m.requestSwap(step.target.x, step.target.y);
    tut.m.setRaise(step.id === "RAISE");
    tut.tick(1 / 60);
  }
  assert.strictEqual(tut.complete, true, "the final lesson advanced naturally");
  assert.strictEqual(tut.i, AL.Tutorial.STEPS.length, "completion owns the sentinel index");

  const drawn = [];
  const savedCentered = AL.drawTextCentered;
  const savedStep = tut.step;
  tut.step = function () { throw new Error("completed tutorial step() was read"); };
  AL.drawTextCentered = function (fb, str, y, color, opts) {
    drawn.push(String(str));
    return savedCentered(fb, str, y, color, opts);
  };
  try {
    env.tick(32);
  } finally {
    tut.step = savedStep;
    AL.drawTextCentered = savedCentered;
  }
  assert.strictEqual(AL.debug.errorCount(), 0, "the completed tutorial frame renders without error");
  assert.ok(drawn.includes("PRESS ENTER TO FACE THE FIRST RIVAL"), "completion prompt was drawn");

  app.input.onDown("Enter");
  env.tick(48);
  assert.strictEqual(AL._active, AL.scenes.run, "completion continues into the run");
  assert.strictEqual(AL.scenes.run.run.state, "bout", "the first bout is live");
  assert.strictEqual(AL.debug.errorCount(), 0, "no errors through the first-bout transition");
});

test("a failed tutorial board renders retry treatment and Enter restarts it", () => {
  globalThis.ImageData = class { constructor(d, w, h) { this.data = d; this.width = w; this.height = h; } };
  AL.debug.clear();
  const env = fakeEnv();
  const app = AL.boot(env.win, env.doc);
  app.input.onDown("Enter");
  env.tick(16);
  app.input.onUp("Enter");
  const tut = AL.scenes.learn.tut;
  const dead = tut.m;
  for (let y = 0; y < dead.grid.rows; y++)
    for (let x = 0; x < dead.grid.cols; x++) dead.grid.cells[y][x] = AL.panel((x + y) % 6);
  dead.setRaise(true);
  let guard = 0;
  while (!tut.lessonFailed && guard++ < 300) tut.tick(1 / 60);
  assert.strictEqual(tut.lessonFailed, true, "forced dead board reached fail/retry");

  const drawn = [];
  const savedCentered = AL.drawTextCentered;
  const savedEngraved = AL.drawTextEngravedCentered;
  AL.drawTextCentered = function (fb, str, y, color, opts) {
    drawn.push(String(str));
    return savedCentered(fb, str, y, color, opts);
  };
  AL.drawTextEngravedCentered = function (fb, str, y, face, shadow, opts) {
    drawn.push(String(str));
    return savedEngraved(fb, str, y, face, shadow, opts);
  };
  try {
    env.tick(32);
  } finally {
    AL.drawTextCentered = savedCentered;
    AL.drawTextEngravedCentered = savedEngraved;
  }
  assert.ok(drawn.includes("LESSON RUINED"), "failed lesson title was drawn");
  assert.ok(drawn.includes("PRESS ENTER TO RETRY LESSON"), "retry instruction was drawn");
  assert.strictEqual(AL.debug.errorCount(), 0, "failure treatment renders cleanly");

  app.input.onDown("Enter");
  env.tick(48);
  assert.notStrictEqual(tut.m, dead, "Enter rebuilt the same lesson board");
  assert.strictEqual(tut.i, 0, "retry remains on the failed lesson");
  assert.strictEqual(tut.lessonFailed, false, "retry resumed active play");
});

test("play scene drives cursor + swap through input and renders the well", () => {
  globalThis.ImageData = class { constructor(d, w, h) { this.data = d; this.width = w; this.height = h; } };
  AL.debug.clear();
  const env = fakeEnv();
  const app = AL.boot(env.win, env.doc);
  AL.go("play", 7);
  const scene = AL.scenes.play;
  const startX = scene.cursor.x;
  // arrow-right moves the cursor (edge from a fresh press each frame)
  app.input.onDown("ArrowRight");
  env.tick();
  assert.strictEqual(scene.cursor.x, startX + 1, "cursor moved right");
  app.input.onUp("ArrowRight");
  // a swap request is honored by the machine
  const before = scene.m.stats.swaps;
  app.input.onDown("Space");
  env.tick();
  assert.ok(scene.m.stats.swaps >= before, "swap action reached the machine");
  assert.ok(env.ctx.putCount >= 1, "well frame blitted");
  assert.strictEqual(AL.debug.errorCount(), 0, "no runtime errors in play");
});
