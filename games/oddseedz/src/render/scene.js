// The lit scenes — the toy room and tournament night, ported from the operator-
// ratified proof of concept in docs/art-poc-2026-08-10/.
//
// Every function here is PURE PAINTING into a LitPainter: no DOM, no canvas, no
// game state. That is deliberate — it means the scenes are exercised for real in
// node by test/scene.test.js rather than only by a screenshot.
//
// The PoC was composed at a fixed 480x300. The live game's surfaces are not that
// shape (the stage is ~429x230 native, the arena ~377x150), so the scenes are
// authored against a LAYOUT computed from the actual buffer size: a uniform size
// unit `u` scales every object, and objects anchor to the edge they belong to
// (toybox left, snack machine right) so a wider frame gains floor in the middle
// instead of stretching the furniture.

import {
  LIT_P, LIT_R, litBay, litClamp, litFbm, litLerp, litNoise2, litRampAt, litRng, litShade,
} from './lit.js';

// ---------------------------------------------------------------------------
// THE TOY ROOM
// ---------------------------------------------------------------------------

// One warm gold hanging lamp (dominant), a cool moonlit window (secondary), and
// the snack machine's own glow. Everything on the floor is lit by, and casts
// from, those three.
export function toyRoomLayout(w, h) {
  // The size unit follows the frame's height, but nothing may grow past a share
  // of its WIDTH: on a narrow or mid-resize buffer an unclamped unit walks the
  // right-anchored furniture past the left-anchored furniture and the room turns
  // inside out. (test/scene.test.js walks the degenerate sizes.)
  const u = Math.max(0.55, Math.min(h / 282, w / 300));
  const R2 = (v) => Math.round(v);
  const cap = (v, max) => Math.max(1, Math.min(R2(v), Math.round(max)));
  const dadoY = R2(h * 0.49);
  const floorY = R2(h * 0.635);
  const groundY = R2(h * 0.90);
  const lampX = R2(w * 0.46);
  const lampShadeY = R2(h * 0.20);
  const machineW = cap(68 * u, w * 0.22);
  const windowW = cap(84 * u, w * 0.26);
  return {
    w, h, u, dadoY, floorY, groundY,
    lamp: { x: lampX, shadeHalf: Math.max(3, cap(24 * u, w * 0.14)), shadeY: lampShadeY, bulbY: lampShadeY + Math.max(2, R2(4 * u)) },
    poster: { x: cap(30 * u, w * 0.09), y: R2(h * 0.14), w: cap(62 * u, w * 0.20), h: Math.max(10, R2(76 * u)) },
    shelf: { x: R2(w * 0.56), y: R2(h * 0.305), w: cap(74 * u, w * 0.20) },
    window: { x: Math.round(w - windowW - w * 0.055), y: R2(h * 0.09), w: windowW, h: Math.max(12, R2(82 * u)) },
    toybox: { x: cap(8 * u, w * 0.04), w: cap(78 * u, w * 0.24), top: R2(h * 0.735), ground: R2(h * 0.90) },
    cushion: { x: R2(w * 0.15), y: R2(h * 0.955), rx: Math.max(6, cap(42 * u, w * 0.13)), ry: Math.max(3, R2(14 * u)) },
    machine: { x: Math.round(w - machineW - w * 0.035), w: machineW, top: R2(h * 0.475), ground: R2(h * 0.905) },
    rug: { x: R2(w * 0.50), y: R2(h * 0.885), rx: Math.max(4, R2(Math.min(w * 0.35, 152 * u))), ry: Math.max(4, R2(40 * u)) },
    // the pet's home: standing on the rug, in the lamp's pool
    pet: { x: R2(w * 0.50), ground: groundY },
  };
}

// The scene's light rig, in buffer coordinates. Shared by the static bake and by
// whatever creature the game puts in the room, so the pet is lit by the same
// lamp the furniture is.
export function toyRoomLights(L) {
  return [
    { x: L.lamp.x, y: L.lamp.bulbY, col: LIT_P.gd4, s: 0.65, range: Math.round(L.h * 0.82) },
    { x: L.window.x + L.window.w * 0.5, y: L.window.y + L.window.h * 0.45, col: '#7FA8D8', s: 0.42, range: Math.round(L.h * 0.74) },
    { x: L.machine.x + L.machine.w * 0.5, y: L.machine.top + L.h * 0.14, col: '#F0C060', s: 0.30, range: Math.round(L.h * 0.39) },
  ];
}

export function drawToyRoom(p, L) {
  const { w, h, u } = L;
  const R2 = (v) => Math.round(v);
  p.clear(LIT_P.nv0);

  // ---- back wall: navy plaster ----
  const wn = litFbm(41, 4);
  const wn2 = litNoise2(83);
  p.fn(0, 0, w, L.floorY, (x, y) => {
    const v = y / Math.max(1, L.floorY);
    let t = 0.30 + v * 0.10;
    t += (wn(x * 0.030, y * 0.055) - 0.5) * 0.20;
    t += (wn2(x * 0.42, y * 0.42) - 0.5) * 0.09;
    return litRampAt(LIT_R.navy, litClamp(t, 0, 1), x, y);
  });
  // wallpaper motif: sparse gold seed-diamonds, dithered so they sit in the field
  const step = Math.max(10, R2(22 * u));
  for (let wy = R2(10 * u); wy < L.dadoY - R2(10 * u); wy += step) {
    for (let wx = ((wy / step) | 0) % 2 * R2(step * 0.6) + R2(8 * u); wx < w; wx += R2(step * 1.18)) {
      for (let d = 0; d < 3; d++) {
        p.px(wx + d, wy, LIT_P.gd2, 0.30 - d * 0.07); p.px(wx - d, wy, LIT_P.gd2, 0.30 - d * 0.07);
        p.px(wx, wy + d, LIT_P.gd2, 0.30 - d * 0.07); p.px(wx, wy - d, LIT_P.gd2, 0.30 - d * 0.07);
      }
      p.px(wx, wy, LIT_P.gd3, 0.55);
    }
  }

  drawWindow(p, L);
  drawPoster(p, L);
  drawShelf(p, L);
  drawWainscot(p, L, wn);
  drawFloor(p, L);
  drawLamp(p, L);
  drawToybox(p, L);
  drawCushion(p, L);
  drawSnackMachine(p, L);

  // ---- atmosphere: warm haze low, cool haze by the window ----
  p.wash(0, R2(h * 0.46), R2(w * 0.70), R2(h * 0.54), '#E8B060', 0.13,
    (i, j, ww, hh) => litClamp(1 - Math.abs(i - ww * 0.52) / (ww * 0.66), 0, 1) * litClamp(j / hh, 0, 1), 0);
  p.wash(R2(w * 0.62), 0, R2(w * 0.38), R2(h * 0.62), '#6E96CC', 0.11,
    (i, j, ww, hh) => litClamp(1 - Math.abs(i - ww * 0.55) / (ww * 0.7), 0, 1) * litClamp(1 - j / hh, 0, 1), 0);
  p.vignette(0.62, '#0a0d1e');
  p.grain(103, 0.20);
  return p;
}

function drawWindow(p, L) {
  const { u } = L;
  const R2 = (v) => Math.round(v);
  const x0 = L.window.x, y0 = L.window.y;
  const x1 = x0 + L.window.w, y1 = y0 + L.window.h;
  const b = Math.max(1, R2(3 * u));
  // recess shadow
  p.frect(x0 - b - 1, y0 - b - 1, L.window.w + b * 2 + 2, L.window.h + b * 2 + 2, LIT_P.nv1);
  p.grad(x0, y0, L.window.w, L.window.h, LIT_R.night, 0.10, 0.62);
  // stars + a low moon
  const sr = litRng(31);
  for (let i = 0; i < 34; i++) {
    const sx = x0 + 3 + ((sr() * (L.window.w - 6)) | 0);
    const sy = y0 + 3 + ((sr() * (L.window.h - 8)) | 0);
    p.px(sx, sy, sr() > 0.7 ? LIT_P.be5 : LIT_P.be3, 0.20 + sr() * 0.55);
  }
  const mx = x0 + R2(L.window.w * 0.62), my = y0 + R2(L.window.h * 0.32);
  const mr = Math.max(3, R2(7 * u));
  p.fcircle(mx, my, mr, '#DCE6F4');
  p.fcircle(mx - 2, my - 2, mr - 1, '#F2F6FF');
  p.fcircle(mx + 2, my + 2, Math.max(1, mr - 4), '#C8D6EC', 0.5);
  p.glow(mx - 1, my - 1, R2(26 * u), '#9FC0E8', 0.32, 2.2);
  // distant hills, so it is not an empty rectangle
  for (let x = x0; x < x1; x++) {
    const hgt = Math.max(2, R2((8 + Math.sin((x - x0) * 0.09) * 3 + Math.sin((x - x0) * 0.21 + 1) * 2) * u));
    for (let y = y1 - hgt; y < y1; y++) p.px(x, y, litRampAt(LIT_R.night, 0.16 + ((y - (y1 - hgt)) / hgt) * 0.10, x, y));
  }
  // muntins + frame
  const mvx = x0 + R2(L.window.w * 0.5);
  const mhy = y0 + R2(L.window.h * 0.5);
  p.vline(mvx, y0, y1 - 1, LIT_P.be3, 0.92); p.vline(mvx - 1, y0, y1 - 1, LIT_P.be2, 0.6);
  p.hline(x0, x1 - 1, mhy, LIT_P.be3, 0.92); p.hline(x0, x1 - 1, mhy + 1, LIT_P.be2, 0.6);
  p.rect(x0 - 1, y0 - 1, L.window.w + 2, L.window.h + 2, LIT_P.be2, 0.9);
  p.rect(x0 - b, y0 - b, L.window.w + b * 2, L.window.h + b * 2, LIT_P.be3, 0.95);
  p.hline(x0 - b - 1, x1 + b, y0 - b - 1, LIT_P.be4, 0.9);
  // sill, catching moonlight on its top face
  const sillH = Math.max(2, R2(4 * u));
  p.frect(x0 - b * 2, y1 + 2, L.window.w + b * 4, sillH, LIT_P.be2);
  p.hline(x0 - b * 2, x1 + b * 2, y1 + 2, LIT_P.be4, 0.95);
  p.hline(x0 - b * 2, x1 + b * 2, y1 + 2 + sillH, LIT_P.be0, 0.8);
  // cool spill onto the wall below-left of the window
  const sw = R2(180 * u), sh = R2(150 * u);
  p.wash(x0 - R2(90 * u), y0, sw, sh, '#6E96CC', 0.30, (i, j, ww, hh) => {
    const dx = (i - ww * 0.53) / (ww * 0.61), dy = (j - hh * 0.27) / (hh * 0.73);
    return litClamp(1 - Math.sqrt(dx * dx + dy * dy), 0, 1);
  }, 0);
}

function drawPoster(p, L) {
  const { u } = L;
  const R2 = (v) => Math.round(v);
  const x0 = L.poster.x, y0 = L.poster.y, w2 = L.poster.w, h2 = L.poster.h;
  const fr = Math.max(1, R2(3 * u));
  p.castShadow(x0, x0 + w2, y0 + h2, -R2(11 * u), R2(6 * u), 0.34, '#070c1e');
  // frame, lit from the lamp on its right
  p.frect(x0 - fr, y0 - fr, w2 + fr * 2, h2 + fr * 2, LIT_P.wd2);
  for (let y = y0 - fr; y < y0 + h2 + fr; y++) {
    for (let i = 0; i < fr; i++) {
      p.px(x0 + w2 + i, y, litRampAt(LIT_R.wood, 0.62 - i * 0.05, x0 + i, y));
      p.px(x0 - fr + i, y, litRampAt(LIT_R.wood, 0.24 + i * 0.03, x0 + i, y));
    }
  }
  p.hline(x0 - fr, x0 + w2 + fr - 1, y0 - fr, LIT_P.wd5, 0.9);
  p.hline(x0 - fr, x0 + w2 + fr - 1, y0 + h2 + fr - 1, LIT_P.wd0, 0.9);
  // the paper: aged beige with a foxed tooth
  const pn = litFbm(59, 4);
  p.fn(x0, y0, w2, h2, (x, y, i, j) => {
    const t = 0.72 + (pn(x * 0.08, y * 0.10) - 0.5) * 0.20 - (j / h2) * 0.12 + (i / w2) * 0.08;
    return litRampAt(LIT_R.beige, litClamp(t, 0, 1), x, y);
  });
  // a prize rosette: gold disk, ribbon tails, pleated rim
  const rcx = x0 + R2(w2 / 2), rcy = y0 + R2(h2 * 0.40);
  const rr = Math.max(4, R2(9 * u));
  const tail = Math.max(6, R2(24 * u));
  p.fpoly([[rcx - rr * 0.8, rcy + rr * 0.7], [rcx - rr * 0.1, rcy + rr * 0.7], [rcx - rr * 0.35, rcy + tail], [rcx - rr * 1.2, rcy + tail * 0.86]], LIT_P.rd3);
  p.fpoly([[rcx + rr * 0.1, rcy + rr * 0.7], [rcx + rr * 0.8, rcy + rr * 0.7], [rcx + rr * 1.2, rcy + tail * 0.86], [rcx + rr * 0.35, rcy + tail]], LIT_P.rd2);
  for (let a = 0; a < 16; a++) {
    const th = (a / 16) * Math.PI * 2;
    p.fpoly([
      [rcx, rcy],
      [rcx + Math.cos(th) * rr * 1.7, rcy + Math.sin(th) * rr * 1.7],
      [rcx + Math.cos(th + 0.28) * rr * 1.7, rcy + Math.sin(th + 0.28) * rr * 1.7],
    ], a % 2 ? LIT_P.gd2 : LIT_P.gd3);
  }
  for (let j = -rr; j <= rr; j++) {
    for (let i = -rr; i <= rr; i++) {
      if (i * i + j * j > rr * rr) continue;
      const nx = i / rr, ny = j / rr;
      const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
      const lit = litClamp(nx * 0.5 - ny * 0.6 + nz * 0.5, 0, 1);
      p.px(rcx + i, rcy + j, litRampAt(LIT_R.gold, litClamp(0.24 + lit * 0.66, 0, 1), rcx + i, rcy + j));
    }
  }
  p.px(rcx - R2(rr * 0.36), rcy - R2(rr * 0.45), '#FFF6D8', 0.9);
  // glass sheen across the frame
  for (let g = 0; g < h2; g++) p.add(x0 + R2(g * 0.55) + 4, y0 + g, '#CFE2FF', 0.09);
}

function drawShelf(p, L) {
  const { u } = L;
  const R2 = (v) => Math.round(v);
  const sx = L.shelf.x, sy = L.shelf.y, sw = L.shelf.w;
  const th = Math.max(2, R2(3 * u));
  p.castShadow(sx, sx + sw, sy + th + 1, R2(10 * u), R2(7 * u), 0.34, '#0a0f22');
  p.frect(sx, sy, sw, th, LIT_P.wd3);
  p.hline(sx, sx + sw - 1, sy, LIT_P.wd4, 0.95);
  p.hline(sx, sx + sw - 1, sy + th, LIT_P.wd1, 0.9);
  // two little brackets
  const bk = Math.max(3, R2(7 * u));
  p.fpoly([[sx + bk * 0.7, sy + th], [sx + bk * 1.6, sy + th], [sx + bk * 0.7, sy + th + bk]], LIT_P.wd2);
  p.fpoly([[sx + sw - bk * 1.6, sy + th], [sx + sw - bk * 0.7, sy + th], [sx + sw - bk * 0.7, sy + th + bk]], LIT_P.wd2);
  // jars — glass reads by rim light and a bright meniscus
  const jar = (jx, jh, rad, col) => {
    for (let y = sy - jh; y < sy; y++) {
      const t = (y - (sy - jh)) / jh;
      for (let i = -rad; i <= rad; i++) {
        const uu = (i + rad) / (2 * rad);
        const lit = 0.30 + (1 - uu) * 0.44 - t * 0.10;
        p.px(jx + i, y, litRampAt(col, litClamp(lit, 0, 1), jx + i, y), 0.86);
      }
    }
    p.hline(jx - rad, jx + rad, sy - jh, LIT_P.be4, 0.75);
    p.vline(jx - rad + 1, sy - jh + 2, sy - 2, LIT_P.be5, 0.35);
    p.hline(jx - rad + 1, jx + rad - 1, sy - R2(jh * 0.55), litShade(col[4], 0.3), 0.5);
    p.frect(jx - rad - 1, sy - jh - 2, rad * 2 + 3, 2, LIT_P.wd2);
  };
  jar(sx + R2(sw * 0.22), Math.max(6, R2(15 * u)), Math.max(2, R2(5 * u)), LIT_R.green);
  jar(sx + R2(sw * 0.47), Math.max(7, R2(19 * u)), Math.max(3, R2(6 * u)), LIT_R.orange);
  jar(sx + R2(sw * 0.74), Math.max(5, R2(13 * u)), Math.max(2, R2(5 * u)), LIT_R.red);
}

function drawWainscot(p, L, wn) {
  const { w, u } = L;
  const R2 = (v) => Math.round(v);
  const top = L.dadoY;
  const bead = Math.max(6, R2(14 * u));
  p.fn(0, top, w, L.floorY - top, (x, y) => {
    const v = (y - top) / Math.max(1, L.floorY - top);
    let t = 0.62 - v * 0.24 + (wn(x * 0.05, y * 0.12) - 0.5) * 0.13;
    if (x % bead === 0) t -= 0.24;
    if (x % bead === 1) t += 0.14;
    return litRampAt(LIT_R.beige, litClamp(t, 0, 1), x, y);
  });
  // the dado rail: bright top edge, dark under-shadow
  p.hline(0, w - 1, top - 3, LIT_P.be1, 0.7);
  p.frect(0, top - 2, w, 3, LIT_P.be3);
  p.hline(0, w - 1, top - 2, LIT_P.be5, 0.95);
  p.hline(0, w - 1, top + 1, LIT_P.be0, 0.85);
  for (let x = 0; x < w; x++) p.mul(x, top + 2, '#191b16', 0.30);
  // baseboard
  const bb = Math.max(3, R2(8 * u));
  p.frect(0, L.floorY - bb, w, bb, LIT_P.be2);
  p.hline(0, w - 1, L.floorY - bb, LIT_P.be4, 0.95);
  p.hline(0, w - 1, L.floorY - 1, LIT_P.be0, 0.9);
}

function drawFloor(p, L) {
  const { w, h, u } = L;
  const R2 = (v) => Math.round(v);
  const fn2 = litFbm(53, 4), gn2 = litNoise2(97);
  p.fn(0, L.floorY, w, h - L.floorY, (x, y) => {
    const v = (y - L.floorY) / Math.max(1, h - L.floorY);
    let t = 0.30 + v * 0.22;
    t += (fn2(x * 0.035, y * 0.30) - 0.5) * 0.26;
    t += (gn2(x * 0.4, y * 0.9) - 0.5) * 0.10;
    return litRampAt(LIT_R.wood, litClamp(t, 0, 1), x, y);
  });
  // board seams converging to a vanishing point above the floor line
  const VPX = R2(w * 0.5), VPY = L.floorY - R2(h * 0.16);
  const spread = Math.max(24, R2(58 * u));
  for (let k = -9; k <= 9; k++) {
    const bx = VPX + k * spread;
    p.line(R2(litLerp(VPX, bx, 0.28)), L.floorY, bx, h - 1, '#2a1a0c', 0.42);
    p.line(R2(litLerp(VPX, bx, 0.28)) + 1, L.floorY, bx + 1, h - 1, LIT_P.wd4, 0.13);
  }
  void VPY;
  // cross seams, spacing opening toward the viewer
  for (let m = 1; m <= 7; m++) {
    const fy = R2(L.floorY + (h - L.floorY) * Math.pow(m / 7, 1.85));
    p.hline(0, w - 1, fy, '#2a1a0c', 0.30);
    p.hline(0, w - 1, fy + 1, LIT_P.wd4, 0.10);
  }
  // the boards fall away from the lamp — without this the floor reads as an
  // evenly lit sheet and the lamp's pool has nothing to be brighter than
  for (let y = L.floorY; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (x - L.lamp.x) / (w * 0.62);
      const dy = (y - L.floorY) / Math.max(1, h - L.floorY);
      const away = litClamp(Math.sqrt(dx * dx * 0.9 + dy * dy * 0.35) - 0.22, 0, 1);
      if (away > 0) p.mul(x, y, '#0f0a06', away * 0.62);
    }
  }

  // the braided oval rug — the sanctioned warm interior tint
  const rcx = L.rug.x, rcy = L.rug.y, rrx = L.rug.rx, rry = L.rug.ry;
  const rn = litFbm(67, 4);
  for (let y = rcy - rry; y <= rcy + rry; y++) {
    for (let x = rcx - rrx; x <= rcx + rrx; x++) {
      const dx = (x - rcx) / rrx, dy = (y - rcy) / rry;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d > 1) continue;
      // A rag rug, not a dartboard: the braid radius WOBBLES with noise and the
      // warm bands only tint the green, so the rings read as coiled cloth
      // rather than as printed concentric circles.
      const wob = (rn(x * 0.05, y * 0.12) - 0.5) * 0.16;
      const dw = litClamp(d + wob, 0, 1.2);
      const rings = Math.max(4, Math.round(rrx / (13 * u)));
      const band = Math.sin(dw * rings * 3.1) * 0.5 + 0.5;
      const t = 0.30 + band * 0.13 - d * 0.16 + (rn(x * 0.14, y * 0.34) - 0.5) * 0.24;
      if (d > 0.965) { p.px(x, y, litRampAt(LIT_R.beige, 0.34, x, y), 0.8); continue; }
      p.px(x, y, litRampAt(LIT_R.green, litClamp(t, 0, 1), x, y));
      if (Math.floor(dw * rings) % 2 === 0) p.px(x, y, litRampAt(LIT_R.orange, litClamp(t + 0.12, 0, 1), x, y), 0.50);
    }
  }
  // rug pile fuzz at the rim
  const frr = litRng(19);
  for (let i = 0; i < 380; i++) {
    const a = frr() * Math.PI * 2;
    const ex = R2(rcx + Math.cos(a) * rrx * (0.985 + frr() * 0.05));
    const ey = R2(rcy + Math.sin(a) * rry * (0.985 + frr() * 0.05));
    p.px(ex, ey, litRampAt(LIT_R.beige, 0.30, ex, ey), 0.55);
  }
  // the rug sits ON the boards: a contact shadow under its edge
  for (let x = rcx - rrx; x <= rcx + rrx; x++) {
    const dx = (x - rcx) / rrx;
    const q = 1 - dx * dx;
    if (q < 0) continue;
    const ey = R2(rcy + Math.sqrt(q) * rry);
    p.mul(x, ey + 1, '#180d05', 0.34);
    p.mul(x, ey + 2, '#180d05', 0.16);
  }
}

function drawLamp(p, L) {
  const { h, u } = L;
  const R2 = (v) => Math.round(v);
  const lx = L.lamp.x;
  const half = L.lamp.shadeHalf;
  const sy0 = L.lamp.shadeY - Math.max(3, R2(20 * u));
  const sy1 = L.lamp.shadeY;
  // cord + ceiling rose
  p.vline(lx, 0, sy0, LIT_P.ink1, 0.9);
  p.vline(lx + 1, 0, sy0, LIT_P.st2, 0.5);
  p.frect(lx - 4, 0, 9, 2, LIT_P.be2);
  p.hline(lx - 4, lx + 4, 0, LIT_P.be4, 0.9);
  // shade: a warm cone, lit inside
  for (let y = sy0; y <= sy1; y++) {
    const t = (y - sy0) / Math.max(1, sy1 - sy0);
    const hh = Math.max(2, R2(litLerp(half * 0.3, half, t)));
    for (let i = -hh; i <= hh; i++) {
      const uu = (i + hh) / (2 * hh);
      const lit = 0.30 + (1 - Math.abs(uu - 0.34) * 1.6) * 0.42 + t * 0.16;
      p.px(lx + i, y, litRampAt(LIT_R.red, litClamp(lit, 0, 1), lx + i, y));
    }
  }
  // shade rim: the bright underside lip where the light escapes
  p.hline(lx - half, lx + half, sy1, LIT_P.gd5, 0.95);
  p.hline(lx - half, lx + half, sy1 + 1, LIT_P.gd3, 0.7);
  p.hline(lx - half, lx + half, sy0, LIT_P.rd1, 0.8);
  // a pinked-edge scallop: gross-cute rather than tasteful
  for (let k = -half; k <= half; k += 4) p.px(lx + k, sy1 + 1, LIT_P.gd5, 0.9);
  // bulb + the source itself
  const by = L.lamp.bulbY;
  p.fcircle(lx, by, Math.max(2, R2(3 * u)), '#FFF6D4');
  p.fcircle(lx, by, Math.max(1, R2(2 * u)), '#FFFFFF');
  p.glow(lx, by, R2(70 * u), LIT_P.gd4, 0.25, 2.5);
  p.glow(lx, by, R2(26 * u), '#FFE8AE', 0.33, 2.0);
  // the shaft: a soft additive cone down onto the rug
  const hz = litFbm(29, 3);
  p.cone(lx, by - 1, lx, R2(h * 0.93), Math.max(4, R2(10 * u)), R2(96 * u), '#F2C878', 0.15,
    (x, y) => 0.7 + 0.3 * hz(x * 0.03, y * 0.05));
  // the throw on the floor
  p.pool(lx + R2(6 * u), L.rug.y, R2(132 * u), R2(40 * u), '#F0C060', 0.28, 1.7);
  p.pool(lx + R2(6 * u), L.rug.y - 2, R2(64 * u), R2(20 * u), '#FFE2A6', 0.18, 1.9);
  // warm bounce back up the wall
  p.wash(lx - R2(120 * u), 0, R2(240 * u), R2(160 * u), '#E8A850', 0.13, (i, j, ww, hh2) => {
    const dx = (i - ww * 0.5) / (ww * 0.525), dy = (j - hh2 * 0.4) / (hh2 * 0.65);
    return litClamp(1 - Math.sqrt(dx * dx + dy * dy), 0, 1);
  }, 0);
  // dust motes drifting in the cone
  const dr = litRng(77);
  for (let i = 0; i < 50; i++) {
    const t = dr();
    const mx = R2(lx + (dr() - 0.5) * litLerp(20 * u, 150 * u, t));
    const my = R2(litLerp(by + 8 * u, L.rug.y, t));
    p.add(mx, my, '#FFEFC4', 0.20 + dr() * 0.45);
  }
}

function drawToybox(p, L) {
  const { u } = L;
  const R2 = (v) => Math.round(v);
  const x0 = L.toybox.x, x1 = x0 + L.toybox.w;
  const gy = L.toybox.ground, topY = L.toybox.top;
  const dep = Math.max(3, R2(11 * u));
  const bn = litFbm(73, 4);
  p.castShadow(x0, x1, gy, -R2(30 * u), -R2(9 * u), 0.50, '#160c04');
  p.shadowPool(R2((x0 + x1) / 2), gy + 1, R2(46 * u), Math.max(3, R2(7 * u)), 0.44, '#170d05');

  // the open mouth: a dark cavity behind the front wall
  p.fpoly([[x0 + 2, topY], [x1 - 2, topY], [x1 - 2 + dep, topY - dep], [x0 + 2 + dep, topY - dep]], '#170D06');
  for (let cy = topY - dep; cy < topY; cy++) {
    const t = (cy - (topY - dep)) / dep;
    for (let cx = R2(litLerp(x0 + 2 + dep, x0 + 2, t)); cx <= R2(litLerp(x1 - 2 + dep, x1 - 2, t)); cx++) {
      p.px(cx, cy, litRampAt(LIT_R.wood, 0.06 + t * 0.10, cx, cy));
    }
  }
  // toys visible down inside it
  p.fellipse(x0 + R2(22 * u), topY - 3, Math.max(2, R2(6 * u)), Math.max(2, R2(4 * u)), litRampAt(LIT_R.green, 0.40, x0, topY));
  p.frect(x0 + R2(40 * u), topY - R2(7 * u), Math.max(4, R2(9 * u)), R2(8 * u), litRampAt(LIT_R.gold, 0.44, x0, topY));

  p.hline(x0 + 2 + dep, x1 - 2 + dep, topY - dep, LIT_P.wd2, 0.9);

  // the lid, hinged at the back, tipped up and away
  const lh = Math.max(8, R2(26 * u));
  const lx0 = x0 + dep, lx1 = x1 + dep, ly = topY - dep;
  const tip = Math.max(2, R2(4 * u));
  p.fpoly([[lx0, ly], [lx1, ly], [lx1 - tip, ly - lh], [lx0 - tip, ly - lh]], LIT_P.wd1);
  for (let j = 0; j < lh; j++) {
    const t = j / lh;
    const ax = R2(litLerp(lx0, lx0 - tip, t)), bx = R2(litLerp(lx1, lx1 - tip, t));
    for (let x = ax; x <= bx; x++) {
      const uu = (x - ax) / Math.max(1, bx - ax);
      const lit = 0.18 + uu * 0.16 + t * 0.10 + (bn(x * 0.10, (ly - j) * 0.34) - 0.5) * 0.14;
      p.px(x, ly - j, litRampAt(LIT_R.wood, litClamp(lit, 0, 1), x, ly - j));
    }
  }
  p.hline(lx0 - tip, lx1 - tip, ly - lh, LIT_P.wd5, 0.95);
  p.hline(lx0 - tip, lx1 - tip, ly - lh + 1, LIT_P.wd4, 0.7);
  p.line(lx0, ly, lx0 - tip, ly - lh, LIT_P.wd0, 0.85);
  p.line(lx1, ly, lx1 - tip, ly - lh, LIT_P.wd4, 0.75);
  // two hinges at the fold
  const hgw = Math.max(3, R2(6 * u));
  p.frect(lx0 + R2(16 * u), ly - 2, hgw, 3, LIT_P.st3);
  p.frect(lx1 - R2(22 * u), ly - 2, hgw, 3, LIT_P.st3);

  // the box's right side face, angled toward the lamp
  for (let y = topY; y < gy; y++) {
    for (let i = 0; i < dep; i++) {
      const t = i / dep;
      const lit = 0.60 - t * 0.14 - ((y - topY) / Math.max(1, gy - topY)) * 0.18 + (bn((x1 + i) * 0.09, y * 0.3) - 0.5) * 0.14;
      p.px(x1 + i, y, litRampAt(LIT_R.wood, litClamp(lit, 0, 1), x1 + i, y));
    }
  }

  // the front face: vertical planks
  const plankW = Math.max(9, R2(26 * u));
  p.fn(x0, topY, x1 - x0, gy - topY, (x, y, i, j) => {
    const uu = i / Math.max(1, x1 - x0);
    let t = 0.30 + uu * 0.22 - Math.pow(j / Math.max(1, gy - topY), 1.7) * 0.14 + (bn(x * 0.09, y * 0.34) - 0.5) * 0.20;
    const plank = i % plankW;
    if (plank === 0) t -= 0.26;
    if (plank === 1) t += 0.12;
    return litRampAt(LIT_R.wood, litClamp(t, 0, 1), x, y);
  });
  p.hline(x0, x1 - 1, topY, LIT_P.wd5, 0.9);
  p.hline(x0, x1 - 1, topY + 1, LIT_P.wd4, 0.5);
  p.hline(x0, x1 - 1, gy - 1, LIT_P.wd0, 0.9);
  p.vline(x0, topY, gy - 1, LIT_P.wd1, 0.8);

  // iron corner brackets
  const bracket = (bx, by, sx) => {
    const n = Math.max(4, R2(9 * u)), m = Math.max(3, R2(7 * u));
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < m; i++) {
        if (i > m * 0.42 && j > n * 0.33) continue;
        p.px(bx + sx * i, by + j, litRampAt(LIT_R.steel, 0.30 + (i === 0 || j === 0 ? 0.28 : 0) - j * 0.012, bx + i, by + j));
      }
    }
    p.px(bx + sx, by + 1, LIT_P.st5, 0.8);
  };
  bracket(x0 + 1, topY + 2, 1); bracket(x1 - 2, topY + 2, -1);
  bracket(x0 + 1, gy - Math.max(5, R2(10 * u)), 1); bracket(x1 - 2, gy - Math.max(5, R2(10 * u)), -1);
  // a gold latch plate hanging open on the front
  const mxp = R2((x0 + x1) / 2), lw = Math.max(5, R2(11 * u)), lhh = Math.max(4, R2(7 * u));
  p.frect(mxp - R2(lw / 2), topY + R2(8 * u), lw, lhh, LIT_P.gd2);
  p.hline(mxp - R2(lw / 2), mxp + R2(lw / 2), topY + R2(8 * u), LIT_P.gd4, 0.95);
  p.glow(mxp, topY + R2(11 * u), Math.max(4, R2(9 * u)), LIT_P.gd4, 0.22, 2);

  // contents spilling onto the floor: a chewed ball and a lettered block
  const br = Math.max(4, R2(8 * u));
  const bx2 = x1 + R2(16 * u), by2 = gy - R2(6 * u);
  p.shadowPool(bx2, by2 + br, br + 4, 3, 0.5, '#170d05');
  for (let j = -br; j <= br; j++) {
    for (let i = -br; i <= br; i++) {
      const d = Math.sqrt(i * i + j * j);
      if (d > br) continue;
      const nx = i / br, ny = j / br;
      const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
      const lit = litClamp(nx * 0.66 - ny * 0.42 + nz * 0.48, 0, 1);
      p.px(bx2 + i, by2 + j, litRampAt(LIT_R.red, litClamp(0.16 + lit * 0.74, 0, 1), bx2 + i, by2 + j));
    }
  }
  p.px(bx2 - R2(br * 0.4), by2 - R2(br * 0.5), '#FFE6D6', 0.95);
  const blk = Math.max(6, R2(13 * u));
  const kx = bx2 + R2(18 * u), ky = gy - blk - 1;
  p.shadowPool(kx + R2(blk / 2), gy, R2(10 * u), 3, 0.45, '#170d05');
  p.frect(kx, ky, blk, blk, LIT_P.gd3);
  p.hline(kx, kx + blk - 1, ky, LIT_P.gd5, 0.95);
  p.vline(kx, ky, ky + blk - 1, LIT_P.gd4, 0.6);
  p.vline(kx + blk - 1, ky, ky + blk - 1, LIT_P.gd1, 0.85);
  p.hline(kx, kx + blk - 1, ky + blk - 1, LIT_P.gd0, 0.9);
  // dust bunnies gathering under the box
  for (let b = 0; b < 5; b++) {
    const dx = x0 + R2(9 * u) + b * R2(19 * u), dy = gy + 2;
    p.px(dx, dy, LIT_P.be1, 0.32); p.px(dx + 1, dy, LIT_P.be2, 0.26); p.px(dx - 1, dy + 1, LIT_P.be1, 0.20);
  }
}

function drawCushion(p, L) {
  const { u } = L;
  const R2 = (v) => Math.round(v);
  const cx = L.cushion.x, cy = L.cushion.y, rx = L.cushion.rx, ry = L.cushion.ry;
  p.shadowPool(cx, cy + ry - 1, rx + 3, Math.max(2, R2(5 * u)), 0.40, '#170d05');
  const cn = litFbm(89, 3);
  for (let y = cy - ry; y <= cy + ry; y++) {
    for (let x = cx - rx; x <= cx + rx; x++) {
      const dx = (x - cx) / rx, dy = (y - cy) / ry;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d > 1) continue;
      const lit = 0.44 - dy * 0.16 - Math.pow(d, 2.2) * 0.18 + (cn(x * 0.16, y * 0.42) - 0.5) * 0.20;
      p.px(x, y, litRampAt(LIT_R.red, litClamp(lit, 0, 1), x, y));
    }
  }
  // a squashed dip in the middle where somebody naps
  p.shadowPool(cx + 2, cy + 1, Math.max(3, R2(rx * 0.52)), Math.max(2, R2(ry * 0.5)), 0.30, '#3a1414');
  // piping around the rim + a tuft button
  for (let a = 0; a < 520; a++) {
    const th = (a / 520) * Math.PI * 2;
    const ex = R2(cx + Math.cos(th) * rx * 0.985), ey = R2(cy + Math.sin(th) * ry * 0.985);
    p.px(ex, ey, litRampAt(LIT_R.gold, 0.44 + Math.cos(th) * 0.20, ex, ey), 0.9);
  }
  p.fellipse(cx + 2, cy + 1, 2, 1, LIT_P.gd4);
  // stray fur
  const fr = litRng(57);
  for (let i = 0; i < 24; i++) {
    const a = fr() * Math.PI * 2;
    p.px(R2(cx + Math.cos(a) * rx * 1.06), R2(cy + Math.sin(a) * ry * 1.15), LIT_P.be2, 0.35);
  }
}

function drawSnackMachine(p, L) {
  const { u } = L;
  const R2 = (v) => Math.round(v);
  const x0 = L.machine.x, x1 = x0 + L.machine.w;
  const topY = L.machine.top, gy = L.machine.ground;
  p.castShadow(x0, x1, gy, -R2(34 * u), -R2(10 * u), 0.52, '#150c04');
  p.shadowPool(R2((x0 + x1) / 2), gy + 1, R2(40 * u), Math.max(3, R2(7 * u)), 0.46, '#160d05');
  // steel body, lit from the lamp on the left
  const mn = litFbm(101, 4);
  p.fn(x0, topY, x1 - x0, gy - topY, (x, y, i) => {
    const uu = i / Math.max(1, x1 - x0);
    const t = 0.52 - uu * 0.24 + (mn(x * 0.07, y * 0.24) - 0.5) * 0.14;
    return litRampAt(LIT_R.steel, litClamp(t, 0, 1), x, y);
  });
  p.vline(x0, topY, gy - 1, LIT_P.st5, 0.55);
  p.hline(x0, x1 - 1, topY, LIT_P.st5, 0.7);
  p.hline(x0, x1 - 1, gy - 1, LIT_P.st0, 0.9);
  // crown sign
  const crown = Math.max(5, R2(11 * u));
  p.frect(x0 + 2, topY - crown, (x1 - x0) - 4, crown, LIT_P.rd2);
  p.hline(x0 + 2, x1 - 3, topY - crown, LIT_P.rd4, 0.9);
  p.hline(x0 + 2, x1 - 3, topY - 1, LIT_P.rd0, 0.8);
  p.glow(R2((x0 + x1) / 2), topY - R2(crown * 0.5), R2(20 * u), LIT_P.rd3, 0.30, 2.2);
  // glass front, warm interior light
  const gx0 = x0 + Math.max(2, R2(5 * u));
  const gy0 = topY + Math.max(3, R2(6 * u));
  const gx1 = x1 - Math.max(6, R2(16 * u));
  const gy1 = gy - Math.max(10, R2(30 * u));
  p.frect(gx0, gy0, gx1 - gx0, gy1 - gy0, '#1A1408');
  p.wash(gx0, gy0, gx1 - gx0, gy1 - gy0, '#F0C060', 0.55,
    (i, j, ww, hh) => litClamp(1 - Math.abs(j - hh * 0.35) / (hh * 0.9), 0, 1), 3);
  // snack rows on their spirals
  const rowH = Math.max(6, R2(11 * u)), rows = Math.max(2, Math.floor((gy1 - gy0 - R2(5 * u)) / rowH));
  const colW = Math.max(5, R2(8 * u)), cols = Math.max(2, Math.floor((gx1 - gx0 - R2(6 * u)) / colW));
  for (let r = 0; r < rows; r++) {
    const ry = gy0 + R2(5 * u) + r * rowH;
    p.hline(gx0 + 1, gx1 - 2, ry + Math.max(3, R2(6 * u)), LIT_P.st2, 0.8);
    for (let c = 0; c < cols; c++) {
      const cx = gx0 + R2(4 * u) + c * colW;
      if (r === 1 && c === 2) continue; // one slot conspicuously empty
      const ramp = [LIT_R.red, LIT_R.green, LIT_R.orange, LIT_R.gold][(r + c) % 4];
      const bw = Math.max(3, R2(5 * u)), bh = Math.max(4, R2(6 * u));
      p.frect(cx, ry, bw, bh, litRampAt(ramp, 0.52, cx, ry));
      p.hline(cx, cx + bw - 1, ry, litRampAt(ramp, 0.80, cx, ry), 0.9);
      p.vline(cx, ry, ry + bh - 1, litRampAt(ramp, 0.72, cx, ry), 0.6);
    }
  }
  // glass: reflection streaks + frame
  for (let s = 0; s < 3; s++) {
    const sx = gx0 + R2(4 * u) + s * R2(13 * u);
    for (let yy = gy0 + 1; yy < gy1 - 1; yy++) p.add(sx + R2((yy - gy0) * 0.28), yy, '#CFE2FF', 0.16);
  }
  p.rect(gx0 - 1, gy0 - 1, gx1 - gx0 + 2, gy1 - gy0 + 2, LIT_P.st4, 0.9);
  p.rect(gx0 - 2, gy0 - 2, gx1 - gx0 + 4, gy1 - gy0 + 4, LIT_P.st1, 0.9);
  // keypad + coin slot + delivery flap
  for (let kb = 0; kb < 6; kb++) {
    const kx = x1 - Math.max(6, R2(13 * u)) + (kb % 2) * Math.max(3, R2(5 * u));
    const ky = gy0 + R2(4 * u) + ((kb / 2) | 0) * Math.max(4, R2(6 * u));
    const ks = Math.max(2, R2(4 * u));
    p.frect(kx, ky, ks, ks, LIT_P.st3);
    p.hline(kx, kx + ks - 1, ky, LIT_P.st5, 0.8);
  }
  const flapH = Math.max(6, R2(16 * u));
  p.frect(gx0, gy - flapH - Math.max(3, R2(10 * u)), gx1 - gx0, flapH, LIT_P.st1);
  p.hline(gx0, gx1 - 1, gy - flapH - Math.max(3, R2(10 * u)), LIT_P.st4, 0.8);
  // the machine's own soft glow into the room
  p.glow(R2((gx0 + gx1) / 2), R2((gy0 + gy1) / 2), R2(54 * u), '#F0C060', 0.22, 2.4);
  p.pool(R2((x0 + x1) / 2), gy + 2, R2(54 * u), Math.max(5, R2(15 * u)), '#F0C060', 0.26, 1.8);
  // crumbs on the floor beneath
  const cr = litRng(41);
  for (let i = 0; i < 16; i++) {
    const cx = R2(x0 + cr() * (x1 - x0));
    const cy = R2(gy + 4 + cr() * 22 * u);
    p.px(cx, cy, litRampAt(LIT_R.wood, 0.62, cx, cy), 0.8);
  }
}

// The in-world hand cursor (LEAN A). The Oddballz register is a hand you reach
// into the room with, so it has to read as a hand at ~26px: a fist with three
// folded knuckles, one finger extended down, a sleeve cuff, its own cast shadow
// and a hard outline so it never sinks into the floorboards.
export function drawHandCursor(p, hx, hy, lights, u = 1, opts = {}) {
  const R2 = (v) => Math.round(v);
  const s = Math.max(0.6, u);
  const SKIN = ['#6B4226', '#9A6540', '#C68A5E', '#E5AE80', '#F6CFA6', '#FFEBD2'];
  const CUFF = [LIT_P.be0, LIT_P.be1, LIT_P.be2, LIT_P.be3, LIT_P.be4, LIT_P.be5];
  const mk = new LitMaskLocal(R2(hx - 10 * s), R2(hy - 40 * s), R2(36 * s) + 2, R2(48 * s) + 2);
  mk.rrect(R2(hx - 3 * s), R2(hy - 27 * s), R2(20 * s), R2(18 * s), R2(6 * s), 1);
  mk.rrect(R2(hx + 15 * s), R2(hy - 24 * s), Math.max(2, R2(6 * s)), Math.max(3, R2(8 * s)), R2(2 * s), 1);
  mk.rrect(R2(hx - 2 * s), R2(hy - 11 * s), Math.max(2, R2(5 * s)), Math.max(4, R2(11 * s)), R2(2 * s), 1);
  mk.fellipse(R2(hx), R2(hy - 1), Math.max(1, R2(2 * s)), Math.max(1, R2(2 * s)), 1);
  mk.rrect(R2(hx - 1 * s), R2(hy - 36 * s), R2(20 * s), Math.max(4, R2(11 * s)), R2(3 * s), 4);

  // soft dark halo, so the cursor separates from whatever is behind it
  for (let j = 0; j < mk.h; j++) {
    for (let i = 0; i < mk.w; i++) {
      if (mk.local(i, j)) continue;
      let near = false;
      for (let dj = -2; dj <= 2 && !near; dj++) {
        for (let di = -2; di <= 2; di++) {
          const ii = i + di, jj = j + dj;
          if (ii < 0 || jj < 0 || ii >= mk.w || jj >= mk.h) continue;
          if (mk.local(ii, jj)) { near = true; break; }
        }
      }
      if (near) p.mul(mk.ox + i, mk.oy + j, '#0A0A10', 0.34);
    }
  }
  // shade, lit by the room's own rig
  for (let j = 0; j < mk.h; j++) {
    for (let i = 0; i < mk.w; i++) {
      const id = mk.local(i, j);
      if (!id) continue;
      const x = mk.ox + i, y = mk.oy + j;
      const t = litTLocal(x, y, hx + 7 * s, hy - 18 * s, 14 * s, 15 * s, lights, 0.40);
      p.px(x, y, litRampAt(id === 4 ? CUFF : SKIN, litClamp(t, 0, 1), x, y));
    }
  }
  // hard outline
  for (let j = 0; j < mk.h; j++) {
    for (let i = 0; i < mk.w; i++) if (mk.isEdge(i, j)) p.px(mk.ox + i, mk.oy + j, '#2A1408');
  }
  // three folded knuckles, each a groove and a lit ridge
  for (let k = 0; k < 3; k++) {
    const ky = R2(hy - 23 * s + k * 5 * s);
    p.hline(R2(hx + 1 * s), R2(hx + 14 * s), ky, '#7A4A2C', 0.75);
    p.hline(R2(hx + 1 * s), R2(hx + 14 * s), ky + 1, '#FFD9AE', 0.34);
  }
  p.vline(R2(hx + 2 * s), R2(hy - 10 * s), R2(hy - 2 * s), '#7A4A2C', 0.55);
  p.vline(R2(hx - 2 * s), R2(hy - 10 * s), R2(hy - 2 * s), '#FFD9AE', 0.40);
  // the cuff's bright top edge + the shadow it throws on the wrist
  p.hline(R2(hx - 1 * s), R2(hx + 18 * s), R2(hy - 36 * s), LIT_P.be5, 0.95);
  p.hline(R2(hx - 1 * s), R2(hx + 18 * s), R2(hy - 26 * s), LIT_P.be0, 0.9);
  // lamp rim down the lit edge
  for (let y = R2(hy - 35 * s); y < R2(hy - 10 * s); y++) p.add(R2(hx - 3 * s), y, LIT_P.gd4, 0.34);
  // the hand's own shadow on whatever is directly below it
  p.shadowPool(R2(hx), R2(hy + 4 * s), Math.max(4, R2(10 * s)), Math.max(2, R2(3 * s)), 0.40, '#0e2408');
  // contact sparkle where the finger meets the pet
  if (opts.contact) {
    for (let k = 0; k < 4; k++) {
      const ang = (k / 4) * Math.PI * 2 + 0.5;
      const sx = R2(hx + Math.cos(ang) * 10 * s), sy = R2(hy + 2 * s + Math.sin(ang) * 6 * s);
      p.px(sx, sy, '#FFF6D8', 0.95);
      p.px(sx - 1, sy, LIT_P.gd4, 0.45); p.px(sx + 1, sy, LIT_P.gd4, 0.45);
      p.px(sx, sy - 1, LIT_P.gd4, 0.45); p.px(sx, sy + 1, LIT_P.gd4, 0.45);
    }
    p.glow(R2(hx), R2(hy + 2 * s), Math.max(6, R2(13 * s)), LIT_P.gd4, 0.26, 2.2);
  }
  return p;
}

// Little floating hearts — the care beat, drawn over the pet after a petting.
export function drawCareHearts(p, cx, cy, u, fade = 1) {
  const R2 = (v) => Math.round(v);
  const heart = (hx, hy, r, col, a) => {
    for (let j = -r; j <= r + 1; j++) {
      for (let i = -r - 1; i <= r + 1; i++) {
        const x = i / r, y = j / r;
        const v = Math.pow(x * x + y * y - 1, 3) - x * x * y * y * y;
        if (v <= 0) p.px(hx + i, hy - j, col, a);
      }
    }
  };
  const s = Math.max(0.6, u);
  heart(R2(cx), R2(cy), Math.max(2, R2(4 * s)), '#F06A82', 0.92 * fade);
  p.glow(R2(cx), R2(cy), Math.max(4, R2(9 * s)), '#F06A82', 0.30 * fade, 2);
  heart(R2(cx + 12 * s), R2(cy - 18 * s), Math.max(2, R2(3 * s)), '#F890A2', 0.72 * fade);
  heart(R2(cx - 6 * s), R2(cy - 32 * s), Math.max(1, R2(2 * s)), '#F06A82', 0.48 * fade);
  return p;
}

// ---------------------------------------------------------------------------
// TOURNAMENT NIGHT
// ---------------------------------------------------------------------------

export function tournamentLayout(w, h) {
  // The PoC framed the hall at 480x282. The live arena is much wider and much
  // shorter, so the size unit is taken from BOTH axes: a purely height-derived
  // unit shrinks the ring to a coin in the middle of a wide letterbox.
  const u = Math.max(0.5, Math.max(h / 282, w / 620));
  const R2 = (v) => Math.round(v);
  const matCy = R2(h * 0.79);
  const matRy = Math.max(7, R2(h * 0.155));
  // the crowd occupies whatever is left between the bunting and the ring
  const crowdTop = R2(h * 0.30);
  const crowdBot = matCy - matRy - R2(h * 0.03);
  const tierN = crowdBot - crowdTop > R2(h * 0.24) ? 3 : 2;
  const tiers = [];
  // A tiny buffer can leave the crowd band thinner than the tier count, which
  // would collapse every step onto the same row; force at least one row apart so
  // the stands are always ordered front-to-back.
  const tierGap = Math.max(1, Math.round((crowdBot - crowdTop) / tierN));
  for (let i = 0; i < tierN; i++) {
    tiers.push({ y: crowdTop + tierGap * i, h: Math.max(1, tierGap - 1) });
  }
  return {
    w, h, u, matCy, matRy,
    matRx: R2(w * 0.44),
    banner: { x0: R2(w * 0.30), x1: R2(w * 0.70), y: R2(h * 0.045), h: Math.max(10, R2(24 * u)) },
    buntingA: R2(h * 0.165),
    buntingB: R2(h * 0.245),
    tiers,
    // the fighters stand ON the mat, just forward of its centre line
    ground: matCy + R2(matRy * 0.22),
    spots: [
      { x: R2(w * 0.22), y: R2(h * 0.10), tx: R2(w * 0.41), col: '#F0C060', s: 0.21, lz: 0.6 },
      { x: R2(w * 0.78), y: R2(h * 0.10), tx: R2(w * 0.61), col: '#F0C060', s: 0.21, lz: 0.6 },
      // hung right at the roof so its housing clears the banner below it
      { x: R2(w * 0.50), y: R2(h * 0.028), tx: R2(w * 0.50), col: '#DCE8FF', s: 0.16, lz: 0.9 },
    ],
  };
}

export function tournamentLights(L) {
  const R2 = (v) => Math.round(v);
  return [
    { x: R2(L.w * 0.39), y: R2(L.h * 0.19), col: '#F0C060', s: 0.72, range: R2(L.h * 1.0) },
    { x: R2(L.w * 0.63), y: R2(L.h * 0.19), col: '#F0C060', s: 0.66, range: R2(L.h * 1.0) },
    { x: R2(L.w * 0.50), y: R2(L.h * 0.13), col: '#DCE8FF', s: 0.40, range: R2(L.h * 1.0) },
  ];
}

// `crowd` is an optional list of {archetype, hue} descriptors — LEAN B feeds the
// player's own Memory Meadow retirees in here so the stands are full of the line
// they retired. With no list, the crowd is generated procedurally instead.
export function drawTournament(p, L, crowd) {
  const { w, h, u } = L;
  const R2 = (v) => Math.round(v);
  const lights = tournamentLights(L);
  p.clear(LIT_P.nv0);

  // ---- the dark hall ----
  const hn = litFbm(151, 4);
  p.fn(0, 0, w, h, (x, y) => {
    const v = y / h;
    const t = 0.10 + v * 0.10 + (hn(x * 0.02, y * 0.04) - 0.5) * 0.10;
    return litRampAt(LIT_R.navy, litClamp(t, 0, 1), x, y);
  });
  // far wall structure: girders and a high clerestory band
  const girder = Math.max(20, R2(54 * u));
  for (let gx = R2(18 * u); gx < w; gx += girder) {
    for (let y = 2; y < L.tiers[0].y; y++) p.px(gx, y, litRampAt(LIT_R.navy, 0.19, gx, y), 0.8);
    p.vline(gx + 1, 2, L.tiers[0].y - 1, LIT_P.nv0, 0.5);
  }
  const clY = R2(h * 0.24), clH = Math.max(4, R2(10 * u));
  p.frect(0, clY, w, clH, LIT_P.nv1);
  p.hline(0, w - 1, clY, LIT_P.nv3, 0.5);
  p.hline(0, w - 1, clY + clH - 1, LIT_P.nv0, 0.7);

  drawBannerAndBunting(p, L);

  // ---- crowd: raked bleachers of Buddy silhouettes ----
  // The crowd only reads if it has something LIT to be dark against, so the
  // spill off the rigs is washed onto the far wall first, then the steps, then
  // near-black Buddy shapes on top with rim + eyeshine.
  const cTop = L.tiers[0].y - R2(h * 0.06);
  const cH = L.tiers[L.tiers.length - 1].y + L.tiers[L.tiers.length - 1].h - cTop;
  p.wash(0, cTop, w, cH, '#B08A46', 0.42,
    (i, j, ww, hh) => litClamp(1 - Math.abs(i - ww * 0.5) / (ww * 0.62), 0, 1) * litClamp(1 - Math.abs(j - hh * 0.44) / (hh * 0.64), 0, 1), 0);
  p.wash(0, cTop, w, cH, '#6E86C0', 0.14,
    (i, j, ww, hh) => litClamp(1 - Math.abs(i - ww * 0.5) / (ww * 0.31), 0, 1) * litClamp(1 - j / hh, 0, 1), 0);

  for (let ti = 0; ti < L.tiers.length; ti++) {
    const T = L.tiers[ti];
    for (let y = T.y; y < T.y + T.h; y++) {
      const t = (y - T.y) / T.h;
      for (let x = 0; x < w; x++) {
        const lit = 0.16 - t * 0.07 + (hn(x * 0.05, y * 0.2) - 0.5) * 0.09;
        p.px(x, y, litRampAt(LIT_R.navy, litClamp(lit, 0, 1), x, y));
      }
    }
    p.hline(0, w - 1, T.y, LIT_P.nv4, 0.55);
    p.hline(0, w - 1, T.y + 1, LIT_P.nv3, 0.3);
    p.hline(0, w - 1, T.y + T.h - 1, LIT_P.nv0, 0.8);
    // stanchion rail along the front of each tier
    const rail = Math.max(3, R2(5 * u));
    for (let rx = R2(6 * u); rx < w; rx += Math.max(18, R2(48 * u))) {
      p.vline(rx, T.y - rail, T.y, LIT_P.st2, 0.6);
      p.px(rx, T.y - rail - 1, LIT_P.gd3, 0.5);
    }
    for (let x = 0; x < w; x++) p.px(x, T.y - rail, LIT_P.st2, 0.16);
  }

  for (let ti = 0; ti < L.tiers.length; ti++) {
    const T = L.tiers[ti];
    // Bodies must not out-grow their step, or one tier's crowd stands up
    // through the next and the stands read as scribble instead of as seats.
    const grow = 0.74 + (ti / Math.max(1, L.tiers.length - 1)) * 0.5;
    const bodyH = Math.min(Math.max(6, R2(26 * u * grow)), Math.round(T.h * 1.9));
    drawCrowdTier(p, L, T.y + Math.max(3, R2(T.h * 0.9)), bodyH,
      Math.max(7, R2(21 * u * grow)), 7 + ti * 6, 0.13 + ti * 0.05, lights, crowd, ti);
  }

  // camera flashes popping in the crowd
  const fr = litRng(53);
  for (let i = 0; i < 4; i++) {
    const fx = R2(fr() * w), fy = R2(L.tiers[0].y + fr() * cH * 0.85);
    p.fcircle(fx, fy, 1, '#FFFFFF');
    p.glow(fx, fy, Math.max(6, R2(13 * u)), '#EAF2FF', 0.60, 2.2);
  }

  drawRing(p, L);
  drawSpotlights(p, L);

  // ---- foreground: the hall floor drops away below the apron ----
  const fadeTop = Math.min(h - 1, L.matCy + R2(L.matRy * 0.30) + Math.max(6, R2(26 * u)));
  for (let y = fadeTop; y < h; y++) {
    const a = litClamp((y - fadeTop) / Math.max(1, R2(16 * u)), 0, 1) * 0.85;
    for (let x = 0; x < w; x++) p.mul(x, y, '#03050C', a);
  }

  // ---- atmosphere ----
  p.wash(0, 0, w, h, '#7A6A46', 0.09,
    (i, j, ww, hh) => litClamp(1 - Math.abs(i - ww * 0.5) / (ww * 0.54), 0, 1) * litClamp(1 - Math.abs(j - hh * 0.5) / (hh * 0.6), 0, 1), 0);
  p.vignette(0.86, '#05070f');
  p.grain(107, 0.19);
  return p;
}

function drawBannerAndBunting(p, L) {
  const { w, u } = L;
  const R2 = (v) => Math.round(v);
  const bx0 = L.banner.x0, bx1 = L.banner.x1, by = L.banner.y;
  const bh = L.banner.h;
  const sag = Math.max(1, R2(4 * u));
  const bn = litFbm(163, 3);
  const bandY = (x) => by + Math.round(Math.sin(((x - bx0) / Math.max(1, bx1 - bx0)) * Math.PI) * sag);
  for (let x = bx0; x <= bx1; x++) {
    const y0 = bandY(x);
    for (let j = 0; j < bh; j++) {
      const t = j / bh;
      let lit = 0.44 - t * 0.20 + (bn(x * 0.06, (y0 + j) * 0.2) - 0.5) * 0.16;
      lit += Math.max(0, 1 - Math.abs(x - w * 0.5) / (w * 0.31)) * 0.20;
      p.px(x, y0 + j, litRampAt(LIT_R.red, litClamp(lit, 0, 1), x, y0 + j));
    }
    p.px(x, bandY(x), LIT_P.rd4, 0.85);
    p.px(x, bandY(x) + bh - 1, LIT_P.rd0, 0.9);
    if (bh >= 9) {
      p.px(x, bandY(x) + 2, LIT_P.gd3, 0.75);
      p.px(x, bandY(x) + bh - 3, LIT_P.gd3, 0.75);
    }
  }
  // a gold seed-diamond dead centre, so the banner carries the game's own mark
  // instead of reading as a blank red bar
  const mcx = R2(w * 0.5), mcy = bandY(mcx) + R2(bh * 0.5);
  const mr = Math.max(2, R2(bh * 0.30));
  for (let j = -mr; j <= mr; j++) {
    for (let i = -mr; i <= mr; i++) {
      if (Math.abs(i) + Math.abs(j) > mr) continue;
      p.px(mcx + i, mcy + j, litRampAt(LIT_R.gold, litClamp(0.42 + (1 - (Math.abs(i) + Math.abs(j)) / (mr + 1)) * 0.5, 0, 1), mcx + i, mcy + j));
    }
  }
  p.px(mcx, mcy, LIT_P.gd5);
  // the cords to the ceiling
  p.line(bx0, bandY(bx0), bx0 - R2(16 * u), 1, LIT_P.wd3, 0.8);
  p.line(bx1, bandY(bx1), bx1 + R2(16 * u), 1, LIT_P.wd3, 0.8);
  p.glow(R2(w * 0.5), by + sag + R2(bh * 0.5), Math.max(10, R2(40 * u)), LIT_P.rd3, 0.16, 2.4);

  // bunting swags across the whole width, behind everything
  const swag = (x0, x1, y0, dip) => {
    for (let x = x0; x < x1; x++) {
      const t = (x - x0) / Math.max(1, x1 - x0);
      const y = y0 + Math.round(Math.sin(t * Math.PI) * dip);
      p.px(x, y, LIT_P.wd3, 0.75);
      p.px(x, y + 1, LIT_P.wd1, 0.5);
    }
    const n = Math.max(2, Math.floor((x1 - x0) / Math.max(10, R2(22 * u))));
    for (let k = 0; k < n; k++) {
      const t = (k + 0.5) / n;
      const fx = R2(litLerp(x0, x1, t));
      const fy = y0 + Math.round(Math.sin(t * Math.PI) * dip) + 1;
      const ramp = [LIT_R.gold, LIT_R.red, LIT_R.green][k % 3];
      const fh = Math.max(4, R2(9 * u));
      for (let j = 0; j < fh; j++) {
        const half = Math.round(Math.max(1, 5 * u) * (1 - j / fh));
        for (let i = -half; i <= half; i++) {
          p.px(fx + i, fy + j, litRampAt(ramp, litClamp(0.34 + (1 - Math.abs(i) / (half + 1)) * 0.36 - j * 0.012, 0, 1), fx + i, fy + j));
        }
      }
      p.px(fx, fy + fh, litRampAt(ramp, 0.18, fx, fy), 0.9);
    }
  };
  const dipA = Math.max(4, R2(12 * u)), dipB = Math.max(5, R2(16 * u));
  swag(0, R2(w * 0.31), L.buntingA, dipA);
  swag(R2(w * 0.69), w, L.buntingA, dipA);
  swag(0, R2(w * 0.5), L.buntingB, dipB);
  swag(R2(w * 0.5), w, L.buntingB, dipB);
}

// One tier of Buddy silhouettes seated on a step. LEAN B: when the caller hands
// in the player's Memory Meadow retirees, each seat is one of THEM — the shape
// comes from that retiree's archetype and the eyeshine from its hue — so the
// stands fill with the line the player retired rather than with strangers.
function drawCrowdTier(p, L, baseY, scaleH, dens, seed, rimAmt, lights, crowd, tierIndex) {
  const { w } = L;
  const R2 = (v) => Math.round(v);
  const cr = litRng(seed);
  const KIND_FOR = {
    blob: 0, critter: 1, avian: 2, humanoid: 3, orb: 4, spectral: 5,
    bug: 1, aquatic: 0, plant: 5, object: 3,
  };
  let seat = tierIndex * 7;
  for (let x = -12; x < w + 12; x += dens) {
    const cx = x + Math.round((cr() - 0.5) * dens * 0.55);
    const hgt = Math.round(scaleH * (0.80 + cr() * 0.48));
    const wdt = Math.max(2, Math.round(hgt * (0.46 + cr() * 0.30)));
    let kind = (cr() * 6) | 0;
    let eyeCol = LIT_P.gd5;
    if (crowd && crowd.length) {
      const m = crowd[seat % crowd.length];
      seat++;
      kind = KIND_FOR[m.archetype] ?? kind;
      eyeCol = m.eyeCol || eyeCol;
    }
    const col = litMixLocal('#04060E', LIT_P.nv1, cr() * 0.35);
    const halfAt = (t) => {
      if (kind === 0) return wdt * Math.sqrt(Math.max(0, 1 - Math.pow(t * 1.05, 2)));
      if (kind === 1) return wdt * (1.0 - t * 0.42);
      if (kind === 2) return wdt * Math.sqrt(Math.max(0, 1 - Math.pow((t - 0.30) / 0.78, 2)));
      if (kind === 3) return wdt * (t > 0.62 ? 0.72 : 0.95);
      if (kind === 4) return wdt * Math.sqrt(Math.max(0, 1 - Math.pow((t - 0.5) / 0.55, 2)));
      return wdt * (1.0 - Math.pow(t, 1.7) * 0.55);
    };
    for (let j = 0; j < hgt; j++) {
      const half = Math.max(1, Math.round(halfAt(j / hgt)));
      for (let i = -half; i <= half; i++) p.px(cx + i, baseY - j, col);
    }
    const crown = baseY - hgt;
    // ears / horns / antennae so the crowd reads as BUDDIES, not people
    if (kind === 1) {
      p.fpoly([[cx - wdt * 0.66, crown + 3], [cx - wdt * 0.06, crown + 3], [cx - wdt * 0.40, crown - hgt * 0.26]], col);
      p.fpoly([[cx + wdt * 0.06, crown + 3], [cx + wdt * 0.66, crown + 3], [cx + wdt * 0.40, crown - hgt * 0.26]], col);
    } else if (kind === 3 && wdt > 3) {
      p.vline(cx - 2, crown - Math.round(hgt * 0.18), crown + 1, col);
      p.vline(cx + 2, crown - Math.round(hgt * 0.16), crown + 1, col);
    } else if (kind === 5) {
      p.fpoly([[cx - wdt * 0.5, crown + 2], [cx - wdt * 0.1, crown + 2], [cx - wdt * 0.5, crown - hgt * 0.18]], col);
    } else if (kind === 0 && cr() > 0.55) {
      p.line(cx, crown, cx + 2, crown - 4, col);
      p.line(cx + 2, crown - 4, cx - 1, crown - 6, col);
    }
    // a few hold up little pennants — scaled to the body, or at a short tier
    // they become a forest of poles taller than the crowd holding them
    if (cr() > 0.90) {
      const fx = cx + Math.round(wdt * 1.3);
      const pl = Math.max(4, Math.round(hgt * 0.45));
      const fy = crown - 1;
      p.vline(fx, fy - pl, crown + 3, '#04060E');
      p.fpoly([[fx, fy - pl], [fx + Math.max(3, Math.round(pl * 0.7)), fy - pl * 0.65], [fx, fy - pl * 0.3]],
        [LIT_P.gd3, LIT_P.rd3, LIT_P.gn3][(cr() * 3) | 0]);
    }
    // rim from whichever rig is nearer — it must HUG the silhouette, or a
    // straight vertical line reads as rain rather than as a lit edge
    const side = cx < w * 0.5 ? -1 : 1;
    const src = cx < w * 0.5 ? lights[0] : lights[1];
    for (let jr = Math.round(hgt * 0.30); jr < hgt; jr++) {
      const tr = jr / hgt;
      const hr = Math.max(1, Math.round(halfAt(tr)));
      p.add(cx + side * hr, baseY - jr, src.col, rimAmt * (0.45 + tr * 0.75));
    }
    // eyeshine: jitter the row, or every seat blinks at the same height and the
    // stands read as a pegboard of white dots
    const ey = crown + Math.round(hgt * (0.20 + cr() * 0.16));
    const edx = Math.max(1, Math.round(wdt * 0.42));
    const ea = 0.30 + cr() * 0.55;
    p.px(cx - edx, ey, eyeCol, ea); p.px(cx + edx, ey, eyeCol, ea);
    p.add(cx - edx, ey, LIT_P.gd4, 0.4); p.add(cx + edx, ey, LIT_P.gd4, 0.4);
    void R2;
  }
}

function drawRing(p, L) {
  const { u } = L;
  const R2 = (v) => Math.round(v);
  const cx = R2(L.w * 0.5), cy = L.matCy, rx = L.matRx, ry = L.matRy;
  // apron / platform side: a skirt of constant depth hanging from the mat's
  // lower edge, so the silhouette follows the ellipse instead of tearing
  const APRON = Math.max(6, R2(26 * u));
  const an = litFbm(181, 3);
  for (let x = cx - rx; x <= cx + rx; x++) {
    const dxq = (x - cx) / rx;
    const q = 1 - dxq * dxq;
    if (q < 0) continue;
    const edge = cy + Math.sqrt(q) * ry;
    const bot = cy + ry * 0.30 + APRON;
    if (bot <= edge) continue;
    for (let y = Math.round(edge); y <= Math.round(bot); y++) {
      const t = (y - edge) / Math.max(1, bot - edge);
      const lit = 0.30 - t * 0.16 + (1 - Math.abs(dxq)) * 0.10 + (an(x * 0.08, y * 0.3) - 0.5) * 0.15;
      p.px(x, y, litRampAt(LIT_R.wood, litClamp(lit, 0, 1), x, y));
    }
    p.px(x, Math.round(bot), LIT_P.wd0, 0.9);
    p.mul(x, Math.round(bot) + 1, '#04060E', 0.55);
    p.mul(x, Math.round(bot) + 2, '#04060E', 0.28);
  }
  // vertical batten seams down the apron
  for (let bx = cx - rx + R2(10 * u); bx < cx + rx; bx += Math.max(9, R2(22 * u))) {
    const dxb = (bx - cx) / rx;
    const qb = 1 - dxb * dxb;
    if (qb < 0) continue;
    const eb = cy + Math.sqrt(qb) * ry, bb = cy + ry * 0.30 + APRON;
    if (bb <= eb) continue;
    p.vline(bx, Math.round(eb), Math.round(bb), '#1c1008', 0.45);
    p.vline(bx + 1, Math.round(eb), Math.round(bb), LIT_P.wd4, 0.14);
  }
  // the canvas mat, an ellipse seen at a low angle
  const mn = litFbm(191, 4);
  for (let y = cy - ry; y <= cy + ry; y++) {
    for (let x = cx - rx; x <= cx + rx; x++) {
      const dx = (x - cx) / rx, dy = (y - cy) / ry;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d > 1) continue;
      // the mat's own value stays low; the spotlight pools are what light it,
      // otherwise the canvas glows evenly and the rigs have nothing to add to
      let t = 0.32 - dy * 0.10 - Math.pow(d, 2) * 0.12;
      t += (mn(x * 0.05, y * 0.16) - 0.5) * 0.16;
      if ((x + y) % 3 === 0) t += 0.03; // canvas weave
      p.px(x, y, litRampAt(LIT_R.beige, litClamp(t, 0, 1), x, y));
    }
  }
  // painted ring circle
  for (let a = 0; a < 720; a++) {
    const th = (a / 720) * Math.PI * 2;
    const ex = Math.round(cx + Math.cos(th) * rx * 0.80);
    const ey = Math.round(cy + Math.sin(th) * ry * 0.80);
    p.px(ex, ey, LIT_P.rd2, 0.75);
    p.px(ex, ey + 1, LIT_P.rd1, 0.45);
  }
  // the sun-disk: a gold ring with rays, the game's own mark
  const dr = Math.max(8, R2(26 * u)), dry = Math.max(3, R2(8 * u));
  for (let a = 0; a < 360; a++) {
    const th = (a / 360) * Math.PI * 2;
    p.px(Math.round(cx + Math.cos(th) * dr), Math.round(cy + Math.sin(th) * dry), LIT_P.gd2, 0.55);
    p.px(Math.round(cx + Math.cos(th) * dr * 0.77), Math.round(cy + Math.sin(th) * dry * 0.75), LIT_P.gd3, 0.35);
  }
  for (let k = 0; k < 12; k++) {
    const th = (k / 12) * Math.PI * 2;
    p.line(Math.round(cx + Math.cos(th) * dr * 1.08), Math.round(cy + Math.sin(th) * dry * 1.12),
      Math.round(cx + Math.cos(th) * dr * 1.31), Math.round(cy + Math.sin(th) * dry * 1.37), LIT_P.gd2, 0.42);
  }
  // mat edge highlight + the drop into the apron
  for (let x = cx - rx; x <= cx + rx; x++) {
    const dxq = (x - cx) / rx;
    const q = 1 - dxq * dxq;
    if (q < 0) continue;
    const ty = Math.round(cy - Math.sqrt(q) * ry), byy = Math.round(cy + Math.sqrt(q) * ry);
    p.px(x, ty, LIT_P.be5, 0.55);
    p.px(x, byy, LIT_P.be1, 0.8);
    p.px(x, byy + 1, LIT_P.wd1, 0.7);
  }
  // four corner posts with gold caps + a slack rope
  const posts = [
    [cx - rx * 0.86, cy - ry * 0.44], [cx + rx * 0.86, cy - ry * 0.44],
    [cx - rx * 0.96, cy + ry * 0.40], [cx + rx * 0.96, cy + ry * 0.40],
  ];
  for (let pi = 0; pi < posts.length; pi++) {
    const px = Math.round(posts[pi][0]), py = Math.round(posts[pi][1]);
    const ph = pi < 2 ? Math.max(6, R2(18 * u)) : Math.max(8, R2(24 * u));
    for (let y = py - ph; y <= py; y++) {
      for (let i = -2; i <= 2; i++) {
        const lit = 0.30 + (1 - Math.abs(i + 0.8) / 3.2) * 0.42;
        p.px(px + i, y, litRampAt(LIT_R.steel, litClamp(lit, 0, 1), px + i, y));
      }
    }
    p.fellipse(px, py - ph - 1, 3, 2, LIT_P.gd4);
    p.px(px, py - ph - 2, LIT_P.gd5);
    p.glow(px, py - ph - 1, 6, LIT_P.gd4, 0.35, 2);
    p.shadowPool(px, py + 1, 6, 2, 0.45, '#0d1020');
  }
  // rope between the two front posts, sagging
  const sagR = Math.max(2, R2(5 * u)), rise = Math.max(6, R2(16 * u));
  for (let x = Math.round(posts[2][0]); x <= Math.round(posts[3][0]); x++) {
    const t = (x - posts[2][0]) / Math.max(1, posts[3][0] - posts[2][0]);
    const yy = Math.round(litLerp(posts[2][1] - rise, posts[3][1] - rise, t) + Math.sin(t * Math.PI) * sagR);
    p.px(x, yy, LIT_P.be3, 0.85);
    p.px(x, yy + 1, LIT_P.be1, 0.7);
  }
}

function drawSpotlights(p, L) {
  const { u } = L;
  const R2 = (v) => Math.round(v);
  const haze = litFbm(211, 3);
  for (let s = 0; s < L.spots.length; s++) {
    const S = L.spots[s];
    const rw = Math.max(6, R2(15 * u)), rh = Math.max(4, R2(8 * u));
    p.frect(S.x - R2(rw / 2), S.y - rh, rw, rh, LIT_P.st2);
    p.hline(S.x - R2(rw / 2), S.x + R2(rw / 2), S.y - rh, LIT_P.st4, 0.8);
    p.fpoly([[S.x - rw * 0.6, S.y], [S.x + rw * 0.6, S.y], [S.x + rw * 0.4, S.y + rh * 0.6], [S.x - rw * 0.4, S.y + rh * 0.6]], LIT_P.st1);
    p.hline(S.x - R2(rw * 0.4), S.x + R2(rw * 0.4), S.y + R2(rh * 0.6), '#FFF4D0', 0.9);
    p.vline(S.x, 0, S.y - rh, LIT_P.st1, 0.8);
    p.glow(S.x, S.y + R2(rh * 0.6), Math.max(6, R2(16 * u)), S.col, 0.42, 2);
    // the shaft
    p.cone(S.x, S.y + rh * 0.6, S.tx, L.matCy + R2(L.matRy * 0.9), Math.max(3, R2(7 * u)), Math.max(12, R2(74 * u)), S.col, S.s,
      (x, y) => 0.62 + 0.38 * haze(x * 0.026, y * 0.045));
    // its pool on the mat
    p.pool(S.tx, L.matCy + R2(L.matRy * 0.15), Math.max(14, R2(80 * u)), Math.max(6, R2(26 * u)), S.col, 0.26, 1.8);
  }
  // a hot core where the two warm cones cross over the fighters — kept low, or
  // it blows out the painted ring and the sun-disk emblem under it
  p.pool(R2(L.w * 0.51), L.matCy + R2(L.matRy * 0.1), Math.max(12, R2(64 * u)), Math.max(5, R2(20 * u)), '#FFE0A0', 0.14, 2.0);
}

// The impact burst between two fighters — the 'impact' family, hue 40.
export function drawImpactFlash(p, ix, iy, u, strength = 1) {
  const R2 = (v) => Math.round(v);
  const s = Math.max(0.5, u);
  p.glow(R2(ix), R2(iy), Math.max(8, R2(34 * s)), '#FFD070', 0.55 * strength, 2.2);
  p.glow(R2(ix), R2(iy), Math.max(4, R2(14 * s)), '#FFF6DC', 0.75 * strength, 1.8);
  const br = litRng(23);
  for (let k = 0; k < 14; k++) {
    const th = (k / 14) * Math.PI * 2 + 0.2;
    const len = (10 + br() * 13) * s * strength;
    p.tline(R2(ix), R2(iy), R2(ix + Math.cos(th) * len), R2(iy + Math.sin(th) * len * 0.8),
      k % 2 ? 1 : 2, k % 2 ? '#FFD070' : '#FFF2CC', 0.9 * strength);
  }
  p.fellipse(R2(ix), R2(iy), Math.max(2, R2(6 * s * strength)), Math.max(2, R2(5 * s * strength)), '#FFFBE8');
  for (let k = 0; k < 18; k++) {
    const th = br() * Math.PI * 2, d = (16 + br() * 26) * s;
    const sx = R2(ix + Math.cos(th) * d), sy = R2(iy + Math.sin(th) * d * 0.75);
    p.px(sx, sy, '#FFE49A', 0.9 * strength);
    p.px(sx + 1, sy, LIT_P.or3, 0.4 * strength);
  }
  return p;
}

// ---------------------------------------------------------------------------
// THE MEMORY MEADOW — the same technique, a gentler rig. Moonlit grass under a
// deep night sky: the Meadow never gives anything back but feelings, so it gets
// no lamp, no crowd, no gold. Just the moon and the line that lives there.
// ---------------------------------------------------------------------------

export function meadowLayout(w, h) {
  const u = Math.max(0.5, h / 282);
  const R2 = (v) => Math.round(v);
  return {
    w, h, u,
    horizon: R2(h * 0.56),
    ground: R2(h * 0.86),
    moon: { x: R2(w * 0.76), y: R2(h * 0.20), r: Math.max(4, R2(10 * u)) },
  };
}

export function meadowLights(L) {
  return [
    { x: L.moon.x, y: L.moon.y, col: '#CFE0FF', s: 0.62, range: Math.round(L.h * 1.5), lz: 0.7 },
    { x: Math.round(L.w * 0.30), y: Math.round(L.h * 1.05), col: '#7EA860', s: 0.22, range: Math.round(L.h * 0.9) },
  ];
}

export function drawMeadow(p, L) {
  const { w, h, u } = L;
  const R2 = (v) => Math.round(v);
  p.clear(LIT_P.nv0);
  // night sky
  const sn = litFbm(211, 4);
  p.fn(0, 0, w, L.horizon, (x, y) => {
    const v = y / Math.max(1, L.horizon);
    const t = 0.10 + v * 0.26 + (sn(x * 0.02, y * 0.05) - 0.5) * 0.10;
    return litRampAt(LIT_R.night, litClamp(t, 0, 1), x, y);
  });
  const sr = litRng(311);
  for (let i = 0; i < Math.round(w * 0.36); i++) {
    const sx = R2(sr() * w), sy = R2(sr() * L.horizon * 0.94);
    p.px(sx, sy, sr() > 0.72 ? LIT_P.be5 : LIT_P.be3, 0.16 + sr() * 0.6);
  }
  // the moon
  p.fcircle(L.moon.x, L.moon.y, L.moon.r, '#DCE6F4');
  p.fcircle(L.moon.x - 2, L.moon.y - 2, Math.max(2, L.moon.r - 1), '#F2F6FF');
  p.fcircle(L.moon.x + R2(L.moon.r * 0.35), L.moon.y + R2(L.moon.r * 0.3), Math.max(1, R2(L.moon.r * 0.3)), '#C8D6EC', 0.5);
  p.glow(L.moon.x, L.moon.y, Math.max(14, R2(46 * u)), '#9FC0E8', 0.34, 2.2);
  // distant tree line
  const tn = litNoise2(331);
  for (let x = 0; x < w; x++) {
    const hgt = Math.max(2, R2((10 + tn(x * 0.05, 3) * 16) * u));
    for (let y = L.horizon - hgt; y < L.horizon; y++) {
      p.px(x, y, litRampAt(LIT_R.navy, 0.08 + ((y - (L.horizon - hgt)) / hgt) * 0.06, x, y));
    }
  }
  // the grass, lit by the moon
  const gn = litFbm(347, 4);
  p.fn(0, L.horizon, w, h - L.horizon, (x, y) => {
    const v = (y - L.horizon) / Math.max(1, h - L.horizon);
    let t = 0.24 + v * 0.24;
    t += (gn(x * 0.04, y * 0.16) - 0.5) * 0.24;
    t -= Math.abs(x - L.moon.x) / (w * 3.2);
    return litRampAt(LIT_R.green, litClamp(t, 0, 1), x, y);
  });
  // blades catching the moon — weighted toward the foreground, so the far
  // grass stays a field rather than becoming uniform vertical static
  const br = litRng(367);
  for (let i = 0; i < Math.round(w * 0.55); i++) {
    const bx = R2(br() * w);
    const depth = Math.pow(br(), 0.55); // 0 at the horizon, 1 at the viewer
    const by = R2(L.horizon + depth * (h - L.horizon));
    const bl = Math.max(1, R2((0.6 + depth * 3.2) * u));
    const near = litClamp(1 - Math.abs(bx - L.moon.x) / (w * 0.8), 0, 1);
    p.vline(bx, by - bl, by, litRampAt(LIT_R.green, 0.46 + near * 0.26, bx, by), (0.25 + near * 0.35) * (0.4 + depth * 0.6));
  }
  // a few darker tussocks so the field has mass, not just blades
  const tr = litRng(373);
  for (let i = 0; i < Math.round(w * 0.06); i++) {
    const tx = R2(tr() * w);
    const depth = Math.pow(tr(), 0.5);
    const ty = R2(L.horizon + depth * (h - L.horizon));
    const trx = Math.max(2, R2((3 + depth * 7) * u)), tryy = Math.max(1, R2((1 + depth * 3) * u));
    p.fellipse(tx, ty, trx, tryy, litRampAt(LIT_R.green, 0.18, tx, ty), 0.5);
    p.hline(tx - trx, tx + trx, ty - tryy, litRampAt(LIT_R.green, 0.5, tx, ty), 0.35);
  }
  // fireflies
  const fr = litRng(389);
  for (let i = 0; i < 18; i++) {
    const fx = R2(fr() * w), fy = R2(L.horizon - 6 * u + fr() * (h - L.horizon) * 0.8);
    p.px(fx, fy, '#F6FFB0', 0.85);
    p.glow(fx, fy, Math.max(3, R2(7 * u)), '#D8F090', 0.42, 2);
  }
  // a low mist over the ground so the far grass recedes
  p.wash(0, L.horizon, w, Math.max(6, R2((h - L.horizon) * 0.5)), '#8FB0D8', 0.14,
    (i, j, ww, hh) => litClamp(1 - j / hh, 0, 1), 0);
  p.vignette(0.70, '#070b18');
  p.grain(397, 0.16);
  return p;
}

// ---- small local helpers ---------------------------------------------------
// (Kept module-local so the single-file build cannot collide with lit.js.)

class LitMaskLocal {
  constructor(ox, oy, w, h) {
    this.ox = ox; this.oy = oy; this.w = w; this.h = h;
    this.m = new Uint8Array(w * h);
  }
  set(x, y, id) {
    x = Math.round(x) - this.ox; y = Math.round(y) - this.oy;
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    this.m[y * this.w + x] = id;
  }
  local(i, j) { return this.m[j * this.w + i]; }
  fellipse(cx, cy, rx, ry, id) {
    for (let y = -Math.ceil(ry); y <= Math.ceil(ry); y++) {
      const t = 1 - (y * y) / (ry * ry);
      if (t < 0) continue;
      const xs = Math.floor(rx * Math.sqrt(t));
      for (let x = -xs; x <= xs; x++) this.set(cx + x, cy + y, id);
    }
    return this;
  }
  rrect(x, y, w, h, rad, id) {
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++) {
        const dx = Math.min(i, w - 1 - i), dy = Math.min(j, h - 1 - j);
        if (dx < rad && dy < rad) {
          const ex = rad - dx, ey = rad - dy;
          if (ex * ex + ey * ey > rad * rad) continue;
        }
        this.set(x + i, y + j, id);
      }
    }
    return this;
  }
  isEdge(i, j) {
    if (!this.local(i, j)) return false;
    return (i === 0 || this.local(i - 1, j) === 0)
      || (i === this.w - 1 || this.local(i + 1, j) === 0)
      || (j === 0 || this.local(i, j - 1) === 0)
      || (j === this.h - 1 || this.local(i, j + 1) === 0);
  }
}

function litTLocal(x, y, cx, cy, rx, ry, lights, amb) {
  const nx = litClamp((x - cx) / rx, -1, 1);
  const ny = litClamp((y - cy) / ry, -1, 1);
  const nz = Math.sqrt(Math.max(0.02, 1 - nx * nx - ny * ny));
  let t = amb;
  for (let i = 0; i < lights.length; i++) {
    const Lg = lights[i];
    const dx = Lg.x - x, dy = Lg.y - y;
    const d = Math.sqrt(dx * dx + dy * dy) + 0.001;
    const lx = dx / d, ly = dy / d;
    const lz = Lg.lz === undefined ? 0.62 : Lg.lz;
    const n = Math.sqrt(lx * lx + ly * ly + lz * lz);
    const dot = (nx * lx + ny * ly + nz * lz) / n;
    const att = Lg.range ? Math.pow(litClamp(1 - d / Lg.range, 0, 1), 1.35) : 1;
    t += Math.max(0, dot) * Lg.s * att;
  }
  return t;
}

function litMixLocal(h1, h2, t) {
  const pa = [parseInt(h1.substr(1, 2), 16), parseInt(h1.substr(3, 2), 16), parseInt(h1.substr(5, 2), 16)];
  const pb = [parseInt(h2.substr(1, 2), 16), parseInt(h2.substr(3, 2), 16), parseInt(h2.substr(5, 2), 16)];
  const f = (v) => {
    const s = litClamp(Math.round(v), 0, 255).toString(16);
    return s.length < 2 ? '0' + s : s;
  };
  return '#' + f(litLerp(pa[0], pb[0], t)) + f(litLerp(pa[1], pb[1], t)) + f(litLerp(pa[2], pb[2], t));
}

void litBay;
