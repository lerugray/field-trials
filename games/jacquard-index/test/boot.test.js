import { test } from 'node:test';
import assert from 'node:assert/strict';
import { boot, BASE_W, BASE_H } from '../src/boot/browser.js';

// Minimal DOM/window stubs — enough to drive boot() without a real browser. The rAF
// queue is manual so the test steps frames deterministically instead of recursing.
function fakeEnv() {
  const rafQueue = [];
  const putCalls = [];
  const anchors = [];

  const ctx = {
    imageSmoothingEnabled: true,
    fillStyle: '',
    fillRect() {},
    drawImage() {},
    putImageData(img) { putCalls.push(img); },
  };
  function makeCanvas() {
    return {
      id: '', style: {}, width: 0, height: 0,
      getContext: () => ctx,
      getBoundingClientRect: () => ({ left: 0, top: 0 }),
      addEventListener(type, fn) { (this._h ||= {})[type] = fn; },
      _h: {},
    };
  }

  const listeners = {};
  const win = {
    innerWidth: 1280,
    innerHeight: 800,
    addEventListener(type, fn) { listeners[type] = fn; },
    requestAnimationFrame(fn) { rafQueue.push(fn); },
    ImageData: class { constructor(data, w, h) { this.data = data; this.width = w; this.height = h; } },
    Blob: class { constructor(parts) { this.parts = parts; } },
    URL: { createObjectURL: () => 'blob:x', revokeObjectURL() {} },
  };

  const canvas = makeCanvas();
  const doc = {
    readyState: 'complete',
    getElementById: () => canvas,
    createElement: (tag) => {
      if (tag === 'canvas') return makeCanvas();
      const a = { href: '', download: '', click() { anchors.push({ ...this }); } };
      return a;
    },
    body: { appendChild() {} },
  };

  const tick = (t) => { const fn = rafQueue.shift(); if (fn) fn(t); };
  return { win, doc, canvas, listeners, putCalls, anchors, tick };
}

test('boot mounts, runs frames, and blits a composed title', () => {
  const env = fakeEnv();
  const app = boot(env.doc, env.win);
  assert.equal(app.fb.width, BASE_W);
  assert.equal(app.fb.height, BASE_H);

  env.tick(16);
  env.tick(33);

  // putImageData received the app framebuffer's pixels.
  assert.ok(env.putCalls.length >= 1);
  assert.equal(env.putCalls[0].data, app.fb.data);

  // The frame is the composed title: card center bright manila, corner dark oil.
  const cx = BASE_W >> 1, cy = Math.round(BASE_H * 0.4);
  assert.ok(app.fb.getPixel(cx, cy)[0] > 130, 'card region should be lit');
  assert.ok(app.fb.getPixel(2, 2)[0] < 90, 'corner should be dark oil');
  assert.ok(!app.log.hasErrors(), `boot logged errors: ${app.log.toText()}`);
});

test('keyboard input reaches the scene through the boot wiring', () => {
  const env = fakeEnv();
  const app = boot(env.doc, env.win);
  env.tick(16); // enter scene, first frame

  env.listeners.keydown({ code: 'Enter', preventDefault() {} });
  env.tick(33); // scene.update drains the press

  assert.match(app.log.toText(), /OPEN INDEX/);
});

test('F2 exports the debug log via a download anchor', () => {
  const env = fakeEnv();
  const app = boot(env.doc, env.win);
  env.listeners.keydown({ code: 'F2', preventDefault() {} });
  assert.ok(env.anchors.length === 1, 'F2 should trigger a download click');
  assert.equal(env.anchors[0].download, 'jacquard-debug-log.txt');
});

test('window error handler routes into the loud debug log', () => {
  const env = fakeEnv();
  const app = boot(env.doc, env.win);
  env.listeners.error({ message: 'boom', filename: 'x.js', lineno: 5 });
  assert.ok(app.log.hasErrors());
  assert.match(app.log.toText(), /window: boom/);
});
