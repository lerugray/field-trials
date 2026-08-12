"use strict";
const { test } = require("node:test");
const assert = require("node:assert");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const dist = path.join(root, "dist", "alkahest.html");

test("build produces a self-contained single file", () => {
  execFileSync("node", [path.join(root, "scripts", "build.js")], { cwd: root });
  const html = fs.readFileSync(dist, "utf8");
  assert.ok(!/ src="src\//.test(html), "no external src refs remain");
  assert.ok(html.includes("/* src/core.js */"), "modules inlined with provenance");
  assert.ok(html.includes("/* src/score.js */"), "code-composed score is inlined");
  assert.ok(html.includes("/* src/main.js */"));
});

test("the built artifact actually boots and renders a frame", () => {
  const html = fs.readFileSync(dist, "utf8");
  // pull every inline <script> body (skip any with a src=, though none remain)
  const bodies = [];
  const re = /<script>([\s\S]*?)<\/script>/g;
  let m;
  while ((m = re.exec(html))) bodies.push(m[1].replace(/<\\\/script>/g, "</script>"));
  assert.ok(bodies.length >= 10, "all module scripts present in the build");

  // minimal DOM/window sandbox, mirroring the real boot surface
  let rafCb = null, putCount = 0;
  const ctx = { imageSmoothingEnabled: true, putImageData() { putCount++; } };
  const canvas = { width: 0, height: 0, style: {}, getContext: () => ctx };
  const sandbox = {
    console: { log() {}, error() {} },
    ImageData: class { constructor(d, w, h) { this.data = d; this.width = w; this.height = h; } },
    window: {
      innerWidth: 1440, innerHeight: 900,
      addEventListener() {},
      requestAnimationFrame(fn) { rafCb = fn; return 1; }
    },
    document: {
      readyState: "complete",
      getElementById: (id) => (id === "screen" ? canvas : null),
      body: { appendChild() {}, removeChild() {} },
      createElement: () => ({ click() {}, style: {} })
    }
  };
  sandbox.self = sandbox;
  vm.createContext(sandbox);
  // run the concatenated build exactly as a browser would
  assert.doesNotThrow(() => {
    vm.runInContext(bodies.join("\n"), sandbox, { timeout: 5000 });
  }, "build source runs without throwing");

  const AL = sandbox.AL;
  assert.ok(AL, "AL namespace established from the build");
  assert.strictEqual(canvas.width, AL.W, "auto-boot sized the canvas");
  assert.strictEqual(AL.debug.errorCount(), 0, "no boot errors");

  // drive one frame from the stored rAF callback
  assert.ok(typeof rafCb === "function", "boot scheduled a frame");
  rafCb(16);
  assert.ok(putCount >= 1, "built artifact blitted a frame to the canvas");
});
