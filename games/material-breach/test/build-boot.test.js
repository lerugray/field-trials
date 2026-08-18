// The single-file artifact boots from a headless DOM: the bundle runs with zero external fetches,
// exposes the collection-contract host surface (window.__GAME), renders a frame without throwing,
// and tears down cleanly on quit(). This is the M1 boot smoke; the real-mouse-event gate (Gate 2)
// arrives at M2 against the same artifact.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// Build the artifact from current source so the smoke always tests HEAD, never a stale dist.
function buildIfNeeded() {
  execFileSync('node', [join(ROOT, 'scripts', 'build-singlefile.mjs')], { cwd: ROOT, stdio: 'ignore' });
  return readFileSync(join(ROOT, 'dist', 'index.html'), 'utf8');
}

// A no-op 2D context: any method is a no-op, measureText returns a width, properties are settable.
// createImageData returns a real buffer, because from M7a the renderer composes the section and the
// ledger paper per pixel and hands the buffer to the canvas. A stub that returned undefined there
// would be testing a context no browser actually has.
//
// getImageData joins it at M7b: the overlay backdrop is now darkened by reading the finished frame
// back and stepping every pixel down its own ramp, which replaced a translucent grey wash that
// broke §4.5 item 2. Same principle as the M7a addition — the stub grows to match the context the
// renderer genuinely uses, rather than the renderer shrinking to fit a stub.
function stubCtx() {
  return new Proxy(
    {},
    {
      get(t, p) {
        if (p === 'measureText') return () => ({ width: 5 });
        if (p === 'createImageData') {
          return (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) });
        }
        if (p === 'getImageData') {
          return (x, y, w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) });
        }
        if (p in t) return t[p];
        return () => {};
      },
      set(t, p, v) {
        t[p] = v;
        return true;
      },
    },
  );
}

function makeContext() {
  const rafQueue = [];
  const canvas = {
    style: {},
    getContext: () => stubCtx(),
    addEventListener: () => {},
    removeEventListener: () => {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 640, height: 360 }),
  };
  const store = new Map();
  const localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, v),
    removeItem: (k) => store.delete(k),
  };
  const win = {
    innerWidth: 1280,
    innerHeight: 720,
    addEventListener: () => {},
    removeEventListener: () => {},
  };
  const document = {
    getElementById: (id) => (id === 'screen' ? canvas : null),
    createElement: () => ({ click() {}, set href(_v) {}, set download(_v) {} }),
  };
  const ctx = {
    window: win,
    document,
    localStorage,
    requestAnimationFrame: (cb) => {
      rafQueue.push(cb);
      return rafQueue.length;
    },
    cancelAnimationFrame: () => {},
    URL: { createObjectURL: () => 'blob:x', revokeObjectURL: () => {} },
    Blob: function Blob() {},
    console,
  };
  ctx.globalThis = ctx;
  win.__SHELL = undefined;
  return { ctx, rafQueue, win };
}

function extractScript(html) {
  const m = html.match(/<script>([\s\S]*?)<\/script>/);
  assert.ok(m, 'no inline script found in the built artifact');
  return m[1];
}

test('the built artifact has zero external fetches', () => {
  const html = buildIfNeeded();
  assert.doesNotMatch(html, /<script[^>]+src=/i, 'external script src present');
  assert.doesNotMatch(html, /<link[^>]+href=/i, 'external stylesheet link present');
  assert.doesNotMatch(html, /https?:\/\/[^\s"']+\.(js|css)/i, 'external asset URL present');
});

test('the bundle boots and exposes window.__GAME with the contract API', () => {
  const html = buildIfNeeded();
  const script = extractScript(html);
  const { ctx, rafQueue, win } = makeContext();
  vm.createContext(ctx);
  vm.runInContext(script, ctx);

  const game = win.__GAME;
  assert.ok(game, 'window.__GAME was not exposed after boot');
  assert.equal(game.id, 'material-breach');
  assert.equal(game.name, 'MATERIAL BREACH');
  assert.equal(typeof game.version, 'string');
  for (const fn of ['pause', 'resume', 'mute', 'quit']) {
    assert.equal(typeof game[fn], 'function', `__GAME.${fn} missing`);
  }

  // Render one frame: the RAF loop callback must run without throwing.
  assert.ok(rafQueue.length > 0, 'boot did not schedule a frame');
  assert.doesNotThrow(() => rafQueue[0]());

  // The host surface behaves.
  assert.doesNotThrow(() => game.pause());
  assert.doesNotThrow(() => game.resume());
  assert.doesNotThrow(() => game.mute(true));
  assert.doesNotThrow(() => game.quit());
});
