// transition.js — THE SLIDE CHANGE: the stage/locale flow transition.
//
// The period device this is drawn from is the magic lantern. An exposition showman
// changed scenes by pushing one glass slide out of the gate while the next one came
// in; the picture never went black, and for a moment both plates were in the light
// at once. That is exactly the shape we want, because of the one hard constraint:
//
//   A TRANSITION MAY NEVER ADD A PERCEPTIBLE WAIT.
//
// So nothing here gates anything. The incoming screen is live, painted and fully
// interactive from its very first frame — a keypress during a transition lands on the
// new screen, not on the transition. All this layer does is composite the OUTGOING
// frame back over the top for a fifth of a second, thinning out as it goes. If the
// display drops the transition entirely (a stall, a slow machine) the player loses
// decoration and nothing else.
//
// The dissolve is done through the kit's own 8x8 bayer matrix rather than an alpha
// fade, so the outgoing plate breaks up into the same ordered dither that shades
// every other surface in the game — a cross-fade would be the one soft-edged thing
// in a frame made entirely of hard pixels. A slight left-to-right bias in the
// threshold turns the dissolve into a WIPE, which is the slide leaving the gate, and
// a gold seam rides the wipe front like light through the edge of the glass.
//
// Pure and environment-free: it only ever reads and writes a Painter, so `node --test`
// can drive the whole thing headless.

import { bay, clamp, P } from './px.js';

// Fast, and deliberately so — these are the numbers that keep the flow feeling
// instant. The locale change is the only one allowed to be a beat longer, because it
// is the tour's signature moment (a new place, a new plate in the lantern).
export const SLIDE = { stage: 0.24, locale: 0.38, calm: 0.16 };

const slide = { active: false, t: 0, dur: 0, kind: 'stage', calm: false, hold: -1, snap: null, w: 0, h: 0 };

// Snapshot the frame that is on its way OUT. Called at the TOP of the render that
// will paint the incoming screen, while the buffer still holds the outgoing one.
export function beginSlide(p, kind, calm) {
  const dur = calm ? SLIDE.calm : (SLIDE[kind] || SLIDE.stage);
  slide.active = true; slide.t = 0; slide.dur = dur; slide.kind = kind || 'stage';
  slide.calm = !!calm; slide.hold = -1;
  slide.snap = p.snapshot(); slide.w = p.w; slide.h = p.h;
  return slide;
}
export function slideActive() { return slide.active; }
export function slidePhase() { return slide.hold >= 0 ? slide.hold : (slide.dur > 0 ? clamp(slide.t / slide.dur, 0, 1) : 1); }
export function resetSlide() { slide.active = false; slide.snap = null; slide.hold = -1; }
// Freeze the transition at a fixed phase. The proof harness uses this so a capture of
// a mid-transition frame is deterministic rather than a race against the clock.
export function holdSlide(phase) { slide.hold = clamp(phase, 0, 1); }

export function updateSlide(dt) {
  if (!slide.active || slide.hold >= 0) return;
  slide.t += dt;
  if (slide.t >= slide.dur) resetSlide();
}

// Composite the outgoing plate back over the incoming one. Must be the LAST thing
// painted into the buffer before it is presented.
export function paintSlide(p) {
  if (!slide.active || !slide.snap) return p;
  if (p.w !== slide.w || p.h !== slide.h || slide.snap.length !== p.d.length) { resetSlide(); return p; }
  const t = slidePhase();
  const s = slide.snap, d = p.d, W = p.w, H = p.h;
  // A reduce-motion transition is a straight ordered dissolve: no wipe travel, no
  // seam, no moving edge to track. It still reads as a slide change, just a still one.
  const bias = slide.calm ? 0 : 0.5;
  const scallop = slide.kind === 'locale' && !slide.calm;
  const travel = 1 + bias;                       // so t=0 covers and t=1 clears
  for (let y = 0; y < H; y++) {
    // The locale plate is cut with a scalloped edge — the same fabric language as the
    // HUD valance and the title bunting, so even the wipe front is in-register. Long
    // period and shallow amplitude: a scallop, not a zigzag.
    const wob = scallop ? Math.sin(y * 0.13) * 0.011 + Math.sin(y * 0.041) * 0.007 : 0;
    for (let x = 0; x < W; x++) {
      const u = W > 1 ? x / (W - 1) : 0;
      const thr = clamp(1 - (t * travel - (u + wob) * bias), 0, 1);
      if (bay(x, y) >= thr) continue;            // this pixel has already turned over
      const i = (y * W + x) * 4;
      d[i] = s[i]; d[i + 1] = s[i + 1]; d[i + 2] = s[i + 2]; d[i + 3] = 255;
    }
  }
  if (bias > 0) paintSeam(p, t, travel, bias, scallop);
  return p;
}

// The lantern seam: light catching the edge of the glass as the plate leaves the
// gate. Additive and narrow — it is a highlight, not a flash (rule 11: nothing here
// pulses, it travels once across the frame in a fifth of a second and is gone).
function paintSeam(p, t, travel, bias, scallop) {
  const W = p.w, H = p.h;
  // The wipe front sits where the threshold crosses the middle of the dither.
  const uf = (t * travel - 0.5) / bias;
  if (uf < -0.12 || uf > 1.12) return;
  const xf = uf * (W - 1);
  const edge = Math.min(1, Math.min(uf + 0.12, 1.12 - uf) / 0.12);   // fade in/out at the margins
  for (let y = 0; y < H; y++) {
    const wob = scallop ? (Math.sin(y * 0.13) * 0.011 + Math.sin(y * 0.041) * 0.007) * (W - 1) : 0;
    const cx = xf + wob;
    for (let k = -4; k <= 4; k++) {
      const x = Math.round(cx) + k;
      if (x < 0 || x >= W) continue;
      const v = (1 - Math.abs(k) / 5) * 0.42 * edge;
      p.add(x, y, k < 0 ? P.gd5 : P.gd3, v * (k < 0 ? 1 : 0.55));
    }
  }
}
