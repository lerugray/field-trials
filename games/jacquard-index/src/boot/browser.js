// THE JACQUARD INDEX — browser boot shim (the only DOM-touching module).
//
// Owns the requestAnimationFrame clock, the canvas, input wiring, error capture, and
// blitting the native framebuffer to screen with nearest-neighbor screen-fill scaling
// (hard-rule 3a: fractional-but-nearest where screen-fill wins — fillViewport). Everything above this line is pure and node-tested; this file is kept
// thin on purpose. Guarded so it is inert when imported without a DOM (bundle tests).

import { App } from '../engine/app.js';
import { fillViewport, screenToNative } from '../engine/viewport.js';
import { makeTitleScene } from '../scenes/titleScene.js';
import { PALETTE } from '../gfx/palette.js';

export const BASE_W = 640;
export const BASE_H = 360;

export function boot(doc, win) {
  const app = new App(BASE_W, BASE_H);

  // Loud-failure law: browser-level errors also land in the exportable log.
  win.addEventListener('error', (e) => {
    app.log.error(`window: ${e.message} @ ${e.filename || '?'}:${e.lineno || 0}`, Math.round(app.elapsed));
  });
  win.addEventListener('unhandledrejection', (e) => {
    app.log.error(`promise: ${e.reason && e.reason.message ? e.reason.message : e.reason}`, Math.round(app.elapsed));
  });

  let canvas = doc.getElementById('jacquard');
  if (!canvas) {
    canvas = doc.createElement('canvas');
    canvas.id = 'jacquard';
    doc.body.appendChild(canvas);
  }
  const ctx = canvas.getContext('2d', { alpha: false });

  // Offscreen native-res surface: the framebuffer is putImageData'd here at 1:1, then
  // drawImage'd to the visible canvas scaled with smoothing OFF (crisp pixels).
  const native = doc.createElement('canvas');
  native.width = BASE_W;
  native.height = BASE_H;
  const nctx = native.getContext('2d');

  let vp = fillViewport(1, 1, BASE_W, BASE_H);

  function resize() {
    canvas.width = win.innerWidth;
    canvas.height = win.innerHeight;
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    vp = fillViewport(canvas.width, canvas.height, BASE_W, BASE_H);
  }
  win.addEventListener('resize', resize);
  resize();

  // ---- Input wiring (mapped to native coords) ----
  function pointerAt(e) {
    const rect = canvas.getBoundingClientRect();
    const p = screenToNative(vp, e.clientX - rect.left, e.clientY - rect.top);
    app.input.movePointer(p.x, p.y, p.inside && p.x < BASE_W && p.y < BASE_H);
  }
  canvas.addEventListener('mousemove', pointerAt);
  canvas.addEventListener('mousedown', (e) => { pointerAt(e); app.input.pressButton(e.button); });
  win.addEventListener('mouseup', (e) => app.input.releaseButton(e.button));
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  win.addEventListener('blur', () => app.input.releaseAll());

  win.addEventListener('keydown', (e) => {
    if (e.code === 'F2') { e.preventDefault(); exportLog(); return; }
    app.input.pressKey(e.code);
  });
  win.addEventListener('keyup', (e) => app.input.releaseKey(e.code));

  function exportLog() {
    try {
      const blob = new win.Blob([app.log.toText() || '(log empty)'], { type: 'text/plain' });
      const url = win.URL.createObjectURL(blob);
      const a = doc.createElement('a');
      a.href = url;
      a.download = 'jacquard-debug-log.txt';
      a.click();
      win.URL.revokeObjectURL(url);
      app.log.info('debug log exported', Math.round(app.elapsed));
    } catch (err) {
      app.log.error(`log export failed: ${err.message}`, Math.round(app.elapsed));
    }
  }

  app.setScene(makeTitleScene());

  // ---- Frame loop ----
  const [or, og, ob] = PALETTE.oilDeep;
  let last = 0;
  function frame(now) {
    const dt = last ? Math.min(100, now - last) : 16;
    last = now;
    try {
      app.step(dt);
      app.render();
      nctx.putImageData(new win.ImageData(app.fb.data, BASE_W, BASE_H), 0, 0);
      ctx.imageSmoothingEnabled = false;
      // Letterbox in deep oil, then blit the frame nearest-scaled.
      ctx.fillStyle = `rgb(${or},${og},${ob})`;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(native, vp.offX, vp.offY, vp.dispW, vp.dispH);
    } catch (err) {
      // Last-ditch loud failure: even if the loop itself throws, log it and keep going.
      app.log.error(`frame loop: ${err.message}`, Math.round(app.elapsed));
    }
    win.requestAnimationFrame(frame);
  }
  win.requestAnimationFrame(frame);

  return app;
}

if (typeof document !== 'undefined' && typeof window !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => boot(document, window));
  } else {
    boot(document, window);
  }
}
