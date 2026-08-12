// LitStage — the native-res buffer behind a canvas element, plus the bake cache.
//
// A lit scene is expensive to paint (per-pixel material, lambert lighting, fbm,
// dither) and almost entirely STATIC: the room does not change between frames,
// only the pet in it does. So each surface bakes its scene once into a byte
// buffer and every frame restores those bytes with one typed-array copy, paints
// only the moving layer on top, and pushes the result out.
//
// Presentation is the PoC's: the canvas backing store IS the native buffer, and
// CSS stretches it to the element with image-rendering:pixelated. That gives the
// nearest-neighbour upscale for free and keeps the pixel size real.

import { LitPainter } from './lit.js';

export class LitStage {
  // targetH is the native buffer height we aim for; the integer divisor is
  // chosen to land near it, which is what fixes the apparent pixel size.
  constructor(canvas, targetH = 230, maxW = 960) {
    this.canvas = canvas;
    this.targetH = targetH;
    this.maxW = maxW;
    this.ctx = canvas ? canvas.getContext('2d') : null;
    this.p = null;
    this.img = null;
    this.baked = null;
    this.bakeKey = null;
    this.w = 0;
    this.h = 0;
    this.scale = 1;
  }

  // Match the buffer to the element's current CSS size. Returns true when the
  // buffer was (re)allocated, which invalidates any bake.
  sync(cssW, cssH) {
    if (!this.canvas) return false;
    const cw = Math.max(1, Math.round(cssW));
    const ch = Math.max(1, Math.round(cssH));
    const s = Math.min(4, Math.max(1, Math.round(ch / this.targetH)));
    let w = Math.max(1, Math.round(cw / s));
    const h = Math.max(1, Math.round(ch / s));
    if (w > this.maxW) w = this.maxW;
    if (this.p && this.w === w && this.h === h && this.scale === s) return false;
    this.w = w;
    this.h = h;
    this.scale = s;
    this.p = new LitPainter(w, h);
    this.canvas.width = w;
    this.canvas.height = h;
    this.img = this.ctx ? this.ctx.createImageData(w, h) : null;
    this.baked = null;
    this.bakeKey = null;
    return true;
  }

  // Paint the static layer once per `key`. `drawFn(painter, w, h)` gets a fresh
  // painter; the resulting bytes are kept and restored each frame.
  bake(key, drawFn) {
    if (!this.p) return false;
    if (this.baked && this.bakeKey === key) return false;
    drawFn(this.p, this.w, this.h);
    this.baked = new Uint8ClampedArray(this.p.d);
    this.bakeKey = key;
    return true;
  }

  // Restore the baked scene so the frame starts from a clean room.
  begin() {
    if (!this.p) return null;
    if (this.baked) this.p.d.set(this.baked);
    else this.p.clear('#05081A');
    return this.p;
  }

  present() {
    if (!this.ctx || !this.img || !this.p) return;
    this.img.data.set(this.p.d);
    this.ctx.putImageData(this.img, 0, 0);
  }

  // Map a pointer position in CSS pixels to buffer coordinates.
  toBuffer(cssX, cssY, cssW, cssH) {
    const sx = this.w / Math.max(1, cssW);
    const sy = this.h / Math.max(1, cssH);
    return { x: cssX * sx, y: cssY * sy };
  }
}
