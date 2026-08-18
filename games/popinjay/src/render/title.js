// title.js — the title card, painted at native 480x300 into the shared buffer.
//
// It stands in front of a real locale vista (the Emerald Midway at dusk), so the
// first thing anyone sees is the game's own art rather than a separate poster in a
// different medium. The roundel is the game's device: a shooting-gallery target with
// a popinjay perched on it and a wire through the ring.
//
// Pure draw: takes a 2D context and the logical size; touches no `window`.

import { nativeScreen } from './game.js';
import { NATIVE, P, R, rampAt, clamp, shade, rng, fbm, t3, t5, t5r, t3c, t5c, t5big, t5bigFn, w5big, w3, w5, panel, posterFrame } from './px.js';
import { paintVista, HUD_H } from './vistas.js';

export function drawTitle(ctx, { w, h, seed = 1, build = 'M0' } = {}) {
  const p = nativeScreen().painter;

  // the game's own world behind the card, pushed back so type stays legible
  paintVista(p, { locale: 1, stage: 3, seed: 20260810 });
  for (let y = 0; y < NATIVE.h; y++) for (let x = 0; x < NATIVE.w; x++) p.mul(x, y, '#1c2038', 0.42);
  p.wash(0, 0, NATIVE.w, NATIVE.h, '#ffc078', 0.10, (i, j, ww, hh) => {
    const dx = (i - ww * 0.5) / (ww * 0.6), dy = (j - hh * 0.42) / (hh * 0.6);
    return Math.max(0, 1 - Math.sqrt(dx * dx + dy * dy));
  }, 0);

  titleBunting(p);
  titleRoundel(p, 240, 96, 30);
  titleWordmark(p, 240, 140);
  titleControls(p, 240, 210);
  titleFooter(p, seed, build);
  titlePosterFrame(p);

  nativeScreen().present(ctx, w, h);
}

// A swag of pennants across the top — the same fabric language as the HUD valance.
function titleBunting(p) {
  const cols = [R.rust, R.paper, R.teal, R.gold];
  const y0 = 26, span = NATIVE.w, n = 26, fw = span / n;
  let prev = null;
  for (let i = 0; i <= n; i++) {
    const x = Math.round(i * fw);
    const y = Math.round(y0 + Math.sin(Math.PI * (i / n)) * 9);
    if (prev) { p.line(prev[0], prev[1], x, y, '#3b2f22', 0.9); p.line(prev[0], prev[1] - 1, x, y - 1, '#7a6650', 0.3); }
    prev = [x, y];
  }
  for (let i = 0; i < n; i++) {
    const x = Math.round(i * fw), y = Math.round(y0 + Math.sin(Math.PI * ((i + 0.5) / n)) * 9);
    const ramp = cols[i % cols.length];
    const wdt = Math.round(fw) - 1, hgt = 11;
    for (let j = 0; j < hgt; j++) {
      const halfw = Math.round((wdt / 2) * (1 - j / hgt));
      for (let k = -halfw; k <= halfw; k++) {
        const u = (k + halfw) / (2 * halfw + 0.001);
        p.px(x + Math.round(wdt / 2) + k, y + j, rampAt(ramp, clamp(0.72 - u * 0.34 - (j / hgt) * 0.20, 0, 1), x + k, y + j));
      }
    }
    p.px(x + Math.round(wdt / 2), y + hgt, ramp[0], 0.7);
  }
}

// The device: a target roundel, a popinjay perched in it, a wire through the ring.
function titleRoundel(p, cx, cy, R0) {
  // the rings, each shaded so the disc reads as enamelled tin, not flat colour
  const rings = [[R0, R.paper], [Math.round(R0 * 0.82), R.rust], [Math.round(R0 * 0.62), R.paper], [Math.round(R0 * 0.42), R.rust]];
  for (const [r, ramp] of rings) {
    for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) {
      const d = Math.sqrt(i * i + j * j); if (d > r) continue;
      const nx = i / r, ny = j / r, nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
      const lit = clamp(-(nx * -0.5 + ny * -0.62) * 0.55 + nz * 0.42 + 0.24, 0, 1);
      p.px(cx + i, cy + j, rampAt(ramp, lit, cx + i, cy + j));
    }
    p.circle(cx, cy, r, '#2a2018', 0.55);
  }
  p.glow(cx, cy, R0 + 14, '#ffd08a', 0.16, 2.2);

  // the popinjay: a teal bird with a rust breast, a gold beak and a bright eye
  const bx = cx, by = cy + 2;
  for (let j = -11; j <= 9; j++) for (let i = -8; i <= 8; i++) {
    const e = (i * i) / (7 * 7) + (j * j) / (10 * 10);
    if (e > 1) continue;
    const nx = i / 7, ny = j / 10, nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
    const lit = clamp(-(nx * -0.55 + ny * -0.5) * 0.7 + nz * 0.5, 0, 1);
    p.px(bx + i, by + j, rampAt(R.teal, clamp(lit * 0.95 + 0.05, 0, 1), bx + i, by + j));
  }
  for (let j = -5; j <= 7; j++) for (let i = -4; i <= 4; i++) {   // the breast
    const e = (i * i) / (3.6 * 3.6) + (j * j) / (6.5 * 6.5);
    if (e > 1) continue;
    const nx = i / 3.6, ny = j / 6.5, nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
    p.px(bx + i - 1, by + j, rampAt(R.rust, clamp(-(nx * -0.55 + ny * -0.5) * 0.7 + nz * 0.5, 0, 1), bx + i, by + j));
  }
  // head, eye, beak, crest
  p.fcircle(bx + 1, by - 9, 5, P.tl2);
  for (let j = -5; j <= 5; j++) for (let i = -5; i <= 5; i++) {
    if (i * i + j * j > 25) continue;
    const nz = Math.sqrt(Math.max(0, 1 - (i / 5) * (i / 5) - (j / 5) * (j / 5)));
    p.px(bx + 1 + i, by - 9 + j, rampAt(R.teal, clamp(-((i / 5) * -0.5 + (j / 5) * -0.6) * 0.7 + nz * 0.5, 0, 1), bx + i, by + j));
  }
  p.fcircle(bx + 3, by - 10, 1, '#fff6e0'); p.px(bx + 3, by - 10, '#14100c');
  p.fpoly([[bx + 6, by - 10], [bx + 13, by - 8], [bx + 6, by - 7]], P.gd3);
  p.line(bx + 6, by - 10, bx + 13, by - 8, P.gd5, 0.8);
  p.px(bx - 2, by - 14, P.gd4); p.px(bx - 1, by - 15, P.gd4); p.px(bx, by - 16, P.gd3);
  // tail + the perch
  p.fpoly([[bx - 6, by + 6], [bx - 16, by + 15], [bx - 3, by + 9]], P.tl1);
  p.line(bx - 6, by + 6, bx - 16, by + 15, P.tl4, 0.6);
  p.hline(cx - 16, cx + 16, cy + 14, P.wd2); p.hline(cx - 16, cx + 16, cy + 13, P.wd4, 0.7);
  p.px(bx - 1, by + 10, P.gd2); p.px(bx + 2, by + 10, P.gd2);

  // the wire, shot clean through the ring
  for (let y = cy + R0 + 8; y > cy - R0 - 16; y--) {
    p.px(cx + 22, y, '#ffe58a', 0.95); p.px(cx + 21, y, P.gd2, 0.45); p.px(cx + 23, y, P.gd2, 0.45);
  }
  p.fpoly([[cx + 22, cy - R0 - 20], [cx + 19, cy - R0 - 13], [cx + 25, cy - R0 - 13]], P.gd4);
  p.glow(cx + 22, cy - R0 - 16, 10, '#ffe58a', 0.45, 2);
}

// POPINJAY in chunky display type: a rust face with a gold inline and an ink shadow.
function titleWordmark(p, cx, y) {
  const word = 'POPINJAY', scale = 4;
  const wpx = w5big(word, scale), x = Math.round(cx - wpx / 2);
  t5big(p, word, x + 2, y + 3, scale, '#1c1410', 0.55);            // cast shadow
  t5bigFn(p, word, x, y, scale, (px, py, u, v) => {
    // a vertical ramp down the face + a lit top edge, so the letters are lit metal
    const t = 0.62 - v * 0.30 + (v < 0.16 ? 0.30 : 0);
    return rampAt(R.rust, clamp(t, 0, 1), px, py);
  });
  p.glow(cx, y + 18, 70, '#ff9a52', 0.10, 2.4);

  const sub = "THE WORLD'S FAIR SHARPSHOOTER";
  t5c(p, sub, cx + 1, y + 35, '#14100c', 0.7);
  t5c(p, sub, cx, y + 34, P.tl5, 1);
  const tag = '- A SHOOTING-GALLERY ROGUELITE -';
  t5c(p, tag, cx + 1, y + 44, '#14100c', 0.6);
  t5c(p, tag, cx, y + 43, P.pa4, 0.95);
}

// The controls panel: a paper card with an engraved border. Laid out for the F5
// body face (the F3 packing overflowed once labels were promoted for legibility).
function titleControls(p, cx, y) {
  const bw = 456, bh = 56, x = Math.round(cx - bw / 2);
  panel(p, x, y, bw, bh);
  t5c(p, 'CONTROLS', cx, y + 4, P.tl2, 1);
  const left = [
    ['WALK', 'LEFT / RIGHT'],
    ['CLIMB', 'UP / DOWN'],
    ['FIRE', 'Z OR SPACE'],
  ];
  const right = [
    ['SIDEARM', 'X'],
    ['PAUSE', 'ESC'],
    ['MENUS', 'ENTER'],
  ];
  let ry = y + 16;
  for (let i = 0; i < 3; i++) {
    const [a, b] = left[i], [c, d] = right[i];
    let lx = x + 10;
    lx = t5(p, a, lx, ry, P.ink, 0.95) + 6;
    t5(p, b, lx, ry, P.rd2, 0.95);
    let rx = x + 248;
    rx = t5(p, c, rx, ry, P.ink, 0.95) + 6;
    t5(p, d, rx, ry, P.rd2, 0.95);
    ry += 12;
  }
}

function titleFooter(p, seed, build) {
  t5c(p, 'PRESS ENTER TO BEGIN THE TOUR', 240, 268, P.pa5, 1);
  t5c(p, 'PRESS ENTER TO BEGIN THE TOUR', 240, 268, P.gd4, 0.35);
  t5(p, `SEED ${seed}`, 12, 285, P.pa3, 0.85);
  const b = `BUILD ${build}`;
  t5r(p, b, NATIVE.w - 12, 285, P.pa3, 0.85);
  t5c(p, 'EXPOSITION AMUSEMENTS CO.', 240, 285, P.pa3, 0.8);
}

// The title card's tuning of the shared poster frame (px.js): a paper mat over a
// gold rule, with a slightly wider corner curl than the in-game HUD wears.
function titlePosterFrame(p) {
  posterFrame(p, { outer: P.pa4, outerA: 0.55, inner: P.gd3, innerA: 0.45, s: 10, steps: 12, curl: P.gd4, curlA: 0.85, pip: P.gd5, pipA: 0.9 });
}
