// vistas.js — the LOCALE ENVIRONMENT ART, authored at native 480x300.
//
// Three locales, each a committed composition (an unmistakable place), each painted
// through a per-stage LIGHT RIG rather than redrawn: sky ramp, sun position/strength,
// ambient floor, how lit the practical lamps are, shadow direction + length, haze and
// the final grade. That is exactly how the ratified PoC's two frames differed, and it
// is what stops seams between a locale's four stages — they are one place at four
// times of day, not four wallpapers.
//
//   locale 1  EMERALD MIDWAY    the exposition esplanade under its teal obelisk
//   locale 2  THE WINDWARD PIER lighthouse + jetty + the big top on the sand
//   locale 3  SUNSET IRONWORKS  alpine massif, funicular, and a furnace that lights
//                               the whole valley from below
//
// Stage 1 is brightest, 4 (the centerpiece) is night, the Panic Finale is hotter
// still. Every backdrop is static for a given (locale, stage, seed) and is CACHED as
// a pixel snapshot, so the per-frame cost is one buffer memcpy.
//
// All code-generated (CLAUDE.md rule 1). All seeded — the same stage always paints
// the same picture (rule 6's spirit extended to art).

import { NATIVE, Painter, P, R, rampAt, clamp, lerp, rng, fbm, noise2, shade, t3, bay } from './px.js';

// Native landmarks, derived from the sim's own geometry so art and collision agree:
//   HUD ribbon   0..22    (hud.js draws over this)
//   sky/vista    22..186  (horizon = VIEW.h * 0.62 * 0.375)
//   midground    186..277 (the promenade / beach / valley floor)
//   ground slab  277..300 (drawStage paints this — the boardwalk)
export const HUD_H = 22;
export const BUNT_Y = 22;
export const HORIZON = 186;
export const GROUND = 277;      // = groundTop(740) * 0.375

// ---------------------------------------------------------------- light rigs
const SKY = {
  day: ['#5d84a8', '#7c9dba', '#9bb4c5', '#b6c7c9', '#cdd6c6', '#e2dfc2', '#f2e6c8', '#fbf2da'],
  golden: ['#4a6f96', '#6d8ba8', '#93a5ae', '#b8b2a4', '#d8b98c', '#eed3a0', '#f7e6c0', '#fdf3dc'],
  dusk: ['#20304a', '#33405c', '#4d4c68', '#6f5a6b', '#9a6d63', '#c08a5e', '#dfae6b', '#f0d6a2', '#f7e9c6'],
  night: ['#0b1020', '#131a30', '#1d2440', '#2b2f4e', '#40364f', '#5a4050', '#7a4f4e', '#9c6350', '#c08258'],
  ember: ['#160f1e', '#241531', '#361b3c', '#4d2440', '#6d3140', '#94433c', '#bb5c38', '#dc8340', '#f0ab5c'],
  iron: ['#2a2c4e', '#3f3558', '#5a3f5c', '#7d4a55', '#a55b4a', '#c9773f', '#e59b45', '#f3c072', '#fae1a6'],
};

// stageKey: 1..4, or 'finale'
function rigFor(locale, stageKey) {
  const s = stageKey === 'finale' || stageKey === 'endless' ? 5 : clamp(Number(stageKey) || 1, 1, 4);
  const night = s >= 4;
  // Each locale walks its own time-of-day ladder but shares the rig SHAPE.
  const table = {
    1: [
      { sky: 'day', sun: [72, 150], sunR: 88, sunCol: '#ffdc9e', amb: 1.00, lamps: 0.10, haze: '#f2e6cc', hazeAmt: 0.26, warm: ['#ffd08a', 0.16], cool: ['#4a6a8c', 0.08], vig: 0.46, stars: 0 },
      { sky: 'golden', sun: [66, 168], sunR: 92, sunCol: '#ffc87e', amb: 0.92, lamps: 0.34, haze: '#ffdca8', hazeAmt: 0.30, warm: ['#ffbe74', 0.22], cool: ['#42608a', 0.10], vig: 0.54, stars: 0 },
      { sky: 'dusk', sun: [64, 178], sunR: 96, sunCol: '#ffb454', amb: 0.80, lamps: 0.85, haze: '#ffd9a0', hazeAmt: 0.34, warm: ['#ffb968', 0.26], cool: ['#3c5478', 0.13], vig: 0.62, stars: 70 },
      { sky: 'night', sun: [58, 190], sunR: 74, sunCol: '#e08a4a', amb: 0.60, lamps: 1.00, haze: '#c98a5e', hazeAmt: 0.24, warm: ['#ff9a52', 0.10], cool: ['#2c4468', 0.20], vig: 0.72, stars: 150 },
      { sky: 'ember', sun: [56, 196], sunR: 70, sunCol: '#d4703c', amb: 0.52, lamps: 1.00, haze: '#b8703e', hazeAmt: 0.22, warm: ['#ff8a4a', 0.14], cool: ['#2a3c60', 0.22], vig: 0.78, stars: 180 },
    ],
    2: [
      { sky: 'day', sun: [400, 58], sunR: 130, sunCol: '#ffd88e', amb: 1.00, lamps: 0.12, haze: '#f4e8ce', hazeAmt: 0.34, warm: ['#ffd88e', 0.26], cool: ['#4a6a8c', 0.13], vig: 0.58, stars: 0 },
      { sky: 'golden', sun: [408, 70], sunR: 128, sunCol: '#ffc880', amb: 0.94, lamps: 0.32, haze: '#ffdfb2', hazeAmt: 0.34, warm: ['#ffc880', 0.28], cool: ['#42608a', 0.14], vig: 0.60, stars: 0 },
      { sky: 'dusk', sun: [416, 88], sunR: 120, sunCol: '#ffab5c', amb: 0.80, lamps: 0.82, haze: '#ffcf94', hazeAmt: 0.32, warm: ['#ffab5c', 0.28], cool: ['#3a5480', 0.17], vig: 0.66, stars: 60 },
      { sky: 'night', sun: [424, 104], sunR: 88, sunCol: '#d8804a', amb: 0.58, lamps: 1.00, haze: '#a8724e', hazeAmt: 0.22, warm: ['#d8804a', 0.14], cool: ['#284066', 0.24], vig: 0.74, stars: 150 },
      { sky: 'ember', sun: [428, 112], sunR: 84, sunCol: '#c86a3c', amb: 0.50, lamps: 1.00, haze: '#a05e3c', hazeAmt: 0.20, warm: ['#ff8040', 0.16], cool: ['#243a5e', 0.26], vig: 0.80, stars: 180 },
    ],
    3: [
      { sky: 'golden', sun: [368, 96], sunR: 104, sunCol: '#ffcf88', amb: 0.96, lamps: 0.30, haze: '#f0dcb4', hazeAmt: 0.28, warm: ['#ffcf88', 0.22], cool: ['#3e5a86', 0.14], vig: 0.56, stars: 0 },
      { sky: 'iron', sun: [388, 118], sunR: 112, sunCol: '#ff9e52', amb: 0.86, lamps: 0.55, haze: '#e8b07a', hazeAmt: 0.28, warm: ['#ff9e52', 0.26], cool: ['#37507e', 0.17], vig: 0.62, stars: 20 },
      { sky: 'iron', sun: [398, 138], sunR: 104, sunCol: '#f28a44', amb: 0.72, lamps: 0.85, haze: '#d8905a', hazeAmt: 0.26, warm: ['#f28a44', 0.28], cool: ['#2f4676', 0.20], vig: 0.70, stars: 80 },
      { sky: 'ember', sun: [404, 156], sunR: 88, sunCol: '#d4703c', amb: 0.56, lamps: 1.00, haze: '#b06a42', hazeAmt: 0.22, warm: ['#d4703c', 0.18], cool: ['#26386a', 0.26], vig: 0.78, stars: 170 },
      { sky: 'ember', sun: [408, 164], sunR: 84, sunCol: '#c2602e', amb: 0.48, lamps: 1.00, haze: '#a05a38', hazeAmt: 0.20, warm: ['#ff7a38', 0.20], cool: ['#20305e', 0.28], vig: 0.82, stars: 200 },
    ],
  };
  const row = (table[locale] || table[1])[s - 1];
  return {
    skyRamp: SKY[row.sky],
    sunX: row.sun[0], sunY: row.sun[1], sunR: row.sunR, sunCol: fixHex(row.sunCol),
    amb: row.amb, lamps: row.lamps,
    haze: fixHex(row.haze), hazeAmt: row.hazeAmt,
    warmCol: fixHex(row.warm[0]), warmAmt: row.warm[1],
    coolCol: fixHex(row.cool[0]), coolAmt: row.cool[1],
    vig: row.vig, stars: row.stars, night,
  };
}
// Guard against a malformed literal ever reaching the painter as a colour (rule 4:
// failures are loud, not a silently wrong pixel).
function fixHex(c) { return (typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c)) ? c : '#c8912f'; }

// ---------------------------------------------------------------- shared vocabulary

function skyAndClouds(p, rig, seed, topY, botY) {
  const sw = fbm(seed + 5, 3);
  p.grad(0, topY, NATIVE.w, botY - topY, rig.skyRamp, 0.02, 1.0, (x, y) => (sw(x * 0.011, y * 0.024) - 0.5) * 0.10);
  if (rig.stars > 0) {
    const sr = rng(seed + 21);
    for (let i = 0; i < rig.stars; i++) {
      const sx = (sr() * NATIVE.w) | 0, sy = topY + 6 + ((sr() * (botY - topY) * 0.55) | 0), b = sr();
      p.px(sx, sy, b > 0.8 ? P.pa5 : P.pa3, 0.16 + b * 0.55);
      if (b > 0.95) p.glow(sx, sy, 4, P.pa4, 0.4, 2);
    }
  }
  const cf = fbm(seed + 17, 5);
  const ramp = rig.night
    ? ['#1a1f36', '#2a2b46', '#3d3352', '#553a54', '#6f4650', '#8c5a4e', '#a87450']
    : ['#3b3f58', '#5a4f60', '#82606a', '#ad7c69', '#d2a072', '#eec894', '#f8e2b6'];
  p.fn(0, topY + 4, NATIVE.w, botY - topY - 4, (x, y) => {
    const v = cf(x * 0.011, y * 0.045);
    const band = Math.pow(clamp((v - 0.44) * 3.0, 0, 1), 1.25);
    if (band <= 0.03) return null;
    const d = Math.sqrt(Math.pow((x - rig.sunX) / 260, 2) + Math.pow((y - rig.sunY) / 150, 2));
    const warm = clamp(1 - d, 0, 1);
    const t = clamp(0.22 + warm * 0.62 * rig.amb + band * 0.20 - (botY - y) / 560, 0, 1);
    return rampAt(ramp, t, x, y);
  });
  p.wash(0, topY, NATIVE.w, botY - topY, rig.sunCol, 0.28 * rig.amb, (i, j) => {
    const d = Math.sqrt(Math.pow((i - rig.sunX) / 230, 2) + Math.pow((topY + j - rig.sunY) / 130, 2));
    return Math.max(0, 1 - d);
  }, 0);
}

function sunDisc(p, rig) {
  if (rig.sunY > GROUND) return;
  p.glow(rig.sunX, rig.sunY, rig.sunR, rig.sunCol, 0.30 * (0.5 + rig.amb * 0.5), 2.4);
  p.glow(rig.sunX, rig.sunY, Math.round(rig.sunR * 0.44), shade(rig.sunCol, 0.25), 0.52 * rig.amb, 2.0);
  p.fcircle(rig.sunX, rig.sunY, 9, shade(rig.sunCol, 0.45), 0.85);
  p.fcircle(rig.sunX, rig.sunY, 6, shade(rig.sunCol, 0.72));
}

// A strand of festoon lights: catenary wire + bulbs + additive glow. `lit` scales the
// glow so the same strand reads as unlit wire by day and blazing at night.
function festoon(p, x0, y0, x1, y1, sag, spacing, col, gr, gs, lit) {
  const steps = Math.max(8, Math.abs(x1 - x0)); let prev = null; const pts = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = Math.round(lerp(x0, x1, t)), y = Math.round(lerp(y0, y1, t) + Math.sin(t * Math.PI) * sag);
    pts.push([x, y]);
    if (prev) { p.line(prev[0], prev[1], x, y, '#3b2f22', 0.85); p.line(prev[0], prev[1] - 1, x, y - 1, '#6b5a44', 0.25); }
    prev = [x, y];
  }
  for (let k = spacing; k < pts.length - 2; k += spacing) {
    const b = pts[k];
    p.px(b[0], b[1] + 1, '#3b2f22');
    p.px(b[0], b[1] + 2, shade(col, -0.2)); p.px(b[0] - 1, b[1] + 3, shade(col, -0.1)); p.px(b[0] + 1, b[1] + 3, shade(col, -0.1));
    p.px(b[0], b[1] + 3, shade(col, lit > 0.4 ? 0.55 : 0.05)); p.px(b[0], b[1] + 4, shade(col, 0.1));
    if (lit > 0.05) p.glow(b[0], b[1] + 3, gr || 11, col, (gs === undefined ? 0.42 : gs) * lit, 2.2);
  }
}

function lampPost(p, x, gy, h, col, scale, lit) {
  scale = scale || 1;
  const top = gy - h;
  for (let y = top + 4; y <= gy; y++) {
    const wdt = y > gy - 4 ? 3 : 1;
    for (let i = -wdt; i <= wdt; i++) {
      const q = 1 - Math.abs(i + wdt * 0.35) / (wdt * 1.5 + 0.5);
      p.px(x + i, y, rampAt(R.gold, clamp(0.20 + q * 0.55, 0, 1), x + i, y));
    }
  }
  p.frect(x - 3, gy - 3, 7, 4, P.gd1); p.hline(x - 3, x + 3, gy - 3, P.gd3, 0.8);
  p.frect(x - 4, gy - 1, 9, 2, P.gd0);
  p.hline(x - 2, x + 2, top + 8, P.gd4, 0.9); p.hline(x - 2, x + 2, top + 9, P.gd1, 0.8);
  p.px(x - 3, top + 6, P.gd3); p.px(x - 4, top + 7, P.gd2); p.px(x + 3, top + 6, P.gd3); p.px(x + 4, top + 7, P.gd2);
  p.fpoly([[x - 4, top + 5], [x + 4, top + 5], [x + 3, top - 1], [x - 3, top - 1]], P.gd1);
  p.fpoly([[x - 3, top + 4], [x + 3, top + 4], [x + 2, top], [x - 2, top]], lit > 0.3 ? shade(P.pa5, 0.1) : P.pa2);
  p.px(x - 2, top + 2, P.gd2, 0.5); p.px(x + 2, top + 2, P.gd2, 0.5);
  p.fpoly([[x - 5, top - 1], [x + 5, top - 1], [x + 3, top - 4], [x - 3, top - 4]], P.gd2);
  p.px(x, top - 5, P.gd4);
  if (lit > 0.05) {
    p.fcircle(x, top + 2, 1, '#fff6d8'); p.px(x, top + 1, '#ffffff');
    p.glow(x, top + 2, Math.round(26 * scale), col, 0.60 * lit, 2.3);
    p.glow(x, top + 2, Math.round(11 * scale), shade(col, 0.5), 0.55 * lit, 2.0);
    p.pool(x, gy + 2, Math.round(22 * scale), Math.round(8 * scale), col, 0.34 * lit, 1.7);
  }
}

// A small period figure — silhouette with a rim light. Reads at 9-18px.
function figure(p, x, gy, hgt, rimCol, rimSide, hat) {
  const body = mixInk();
  const hh = Math.round(hgt * 0.22), bw = Math.max(1, Math.round(hgt * 0.16));
  const headY = gy - hgt;
  p.fcircle(x, headY + hh - 1, Math.max(1, hh - 1), body);
  if (hat === 0) { p.frect(x - hh + 1, headY - hh + 1, hh * 2 - 1, hh, body); p.hline(x - hh, x + hh, headY + 1, body); }
  else if (hat === 1) { p.hline(x - hh, x + hh, headY, body); p.frect(x - hh + 1, headY - 1, hh * 2 - 1, 2, body); }
  else { p.hline(x - hh - 1, x + hh + 1, headY + 1, body); p.frect(x - hh + 1, headY - 1, hh * 2 - 1, 2, body); }
  for (let j = 0; j < hgt - hh * 2; j++) {
    const t = j / Math.max(1, hgt - hh * 2);
    const wd = hat === 1 ? Math.round(bw * (0.75 + t * 1.5)) : Math.round(bw * (1.0 - t * 0.25));
    p.hline(x - wd, x + wd, headY + hh * 2 + j, body);
  }
  if (hat !== 1) { p.vline(x - 1, gy - 2, gy, body); p.vline(x + 1, gy - 2, gy, body); }
  for (let y2 = headY; y2 <= gy - 1; y2++) {
    const xr = x + rimSide * Math.max(1, bw);
    if (p.get(xr, y2)[3]) p.px(xr, y2, rimCol, 0.5);
  }
  p.px(x + rimSide * (hh - 1), headY + hh - 1, rimCol, 0.7);
  p.shadowPool(x, gy + 1, Math.round(hgt * 0.5), 2, 0.45);
}
function mixInk() { return '#22242c'; }

// The promenade / open ground between the horizon and the ground slab.
function groundBand(p, rig, seed, ramp, opts = {}) {
  const gn = fbm(seed + 31, 4), gn2 = noise2(seed + 77);
  const h = GROUND - HORIZON;
  p.fn(0, HORIZON, NATIVE.w, h, (x, y, i, j) => {
    const v = j / h;
    const sc = 0.020 + v * 0.085;
    let t = (opts.base === undefined ? 0.50 : opts.base) + v * 0.24 - Math.pow(v, 3) * 0.30;
    t += (gn(x * sc, y * sc * 2.3) - 0.5) * 0.30;
    t += (gn2(x * sc * 3.4, y * sc * 7) - 0.5) * 0.17;
    t *= (0.55 + rig.amb * 0.45);
    return rampAt(ramp, clamp(t, 0, 1), x, y);
  });
}

// ---------------------------------------------------------------- LOCALE 1
// EMERALD MIDWAY — the exposition esplanade under its teal obelisk. This is the
// ratified PoC composition; the rig moves it through the day.
function paintMidway(p, rig, seed) {
  const HOR = HORIZON, FLOOR = GROUND;
  skyAndClouds(p, rig, seed, BUNT_Y, HOR);
  sunDisc(p, rig);
  p.wash(0, HOR - 26, NATIVE.w, 34, rig.haze, rig.hazeAmt, (i, j) => Math.pow(clamp(1 - Math.abs(j - 20) / 20, 0, 1), 1.4), 0);

  // distant treeline + far domes, hazed back
  const tr = rng(seed + 9);
  for (let x = 0; x < NATIVE.w; x++) {
    const hgt = 6 + Math.round(Math.sin(x * 0.037) * 3 + Math.sin(x * 0.11 + 2) * 2.2 + tr() * 2.5);
    for (let y = HOR - hgt; y < HOR; y++) {
      const t = (0.30 + (y - (HOR - hgt)) / Math.max(1, hgt) * 0.18) * (0.6 + rig.amb * 0.4);
      p.px(x, y, rampAt(R.slate, t, x, y), 0.62);
    }
  }
  const farDome = (cx, r) => {
    for (let j = -r; j <= 0; j++) for (let i = -r; i <= r; i++) {
      if (i * i + j * j > r * r) continue;
      p.px(cx + i, HOR - 2 + j, rampAt(R.slate, (0.34 - (i / r) * 0.10) * (0.6 + rig.amb * 0.4), cx + i, HOR + j), 0.7);
    }
    p.vline(cx, HOR - r - 4, HOR - r, P.sl2, 0.6);
  };
  farDome(150, 7); farDome(392, 9); farDome(424, 5);

  // the fairground floor + flagstone promenade
  groundBand(p, rig, seed, R.paper);
  const gn = fbm(seed + 31, 4);
  p.fn(0, HOR, NATIVE.w, FLOOR - HOR, (x, y, i, j) => {
    const v = j / (FLOOR - HOR);
    const road = 110 + v * 230;
    const d = Math.abs(x - 240);
    if (d < road * 0.5) return null;
    const e = clamp((d - road * 0.5) / 26, 0, 1);
    if (e < bay(x, y) * 0.9) return null;
    const t = (0.42 + v * 0.20 + (gn(x * 0.05, y * 0.11) - 0.5) * 0.34) * (0.55 + rig.amb * 0.45);
    return rampAt(R.olive, clamp(t, 0, 1), x, y);
  });
  const K = 15;
  for (let k = 1; k <= K; k++) {
    const fy = Math.round(HOR + (FLOOR - HOR) * Math.pow(k / K, 2.05));
    const v = (fy - HOR) / (FLOOR - HOR);
    const road = 110 + v * 230;
    p.hline(Math.round(240 - road * 0.5), Math.round(240 + road * 0.5), fy, '#7d6440', 0.42);
    p.hline(Math.round(240 - road * 0.5), Math.round(240 + road * 0.5), fy + 1, P.pa5, 0.16);
    const cols = 8, off = (k % 2) * 0.5;
    for (let c = 0; c <= cols; c++) {
      const cx2 = Math.round(240 + (c + off - cols / 2) / (cols / 2) * road * 0.5);
      const fy2 = Math.round(HOR + (FLOOR - HOR) * Math.pow(Math.max(0, k - 1) / K, 2.05));
      p.line(cx2, fy, Math.round(240 + (cx2 - 240) * 0.94), fy2, '#7d6440', 0.30);
    }
  }
  p.wash(0, HOR + 14, NATIVE.w, FLOOR - HOR - 14, '#e8c88c', 0.20 * rig.amb, (i, j, w, h) => Math.pow(clamp(1 - Math.abs(i - 240) / 240, 0, 1), 1.5) * (j / h), 0);

  const SH = 1;                     // sun is on the LEFT: shadows fall right
  // ---- left pavilion: colonnaded hall with a teal dome
  (() => {
    const x0 = 18, x1 = 148, ry = HOR - 2, wallTop = HOR - 40;
    p.castShadow(x0, x1, ry, SH * 46, 10, 0.46 * rig.amb);
    const sn = fbm(seed + 41, 4);
    p.fn(x0, wallTop, x1 - x0, ry - wallTop, (x, y, i, j) => {
      const u = i / (x1 - x0);
      const t = (0.74 - u * 0.26 + (sn(x * 0.07, y * 0.14) - 0.5) * 0.16 - Math.pow(j / (ry - wallTop), 2) * 0.16) * (0.52 + rig.amb * 0.48);
      return rampAt(R.paper, clamp(t, 0, 1), x, y);
    });
    p.fn(x0, ry - 9, x1 - x0, 9, (x, y, i) => rampAt(R.stone, clamp((0.46 - (i / (x1 - x0)) * 0.16 + (sn(x * 0.14, y * 0.3) - 0.5) * 0.18) * (0.5 + rig.amb * 0.5), 0, 1), x, y));
    p.hline(x0, x1, ry - 9, P.pa5, 0.5); p.hline(x0, x1, ry - 8, '#6c5940', 0.5);
    for (let a = 0; a < 6; a++) {
      const ax = x0 + 9 + a * 21, aw = 13, at = ry - 30, ab = ry - 9;
      for (let j = at; j <= ab; j++) for (let i = 0; i < aw; i++) {
        const cxr = aw / 2 - 0.5, dxr = (i - cxr) / cxr, rr = (at + 6 - j) / 6;
        if (j < at + 6 && dxr * dxr + rr * rr > 1) continue;
        const dep = clamp(0.30 - Math.abs(dxr) * 0.16 - (ab - j) / (ab - at) * 0.10, 0, 1);
        p.px(ax + i, j, rampAt(R.stone, dep * 0.35, ax + i, j));
      }
      p.glow(ax + 6, ry - 16, 15, '#ffca74', 0.30 * Math.max(0.25, rig.lamps), 2.2);
      p.px(ax + 6, ry - 16, '#ffe1a0', 0.5);
      for (let th = 0; th <= 18; th++) {
        const an = Math.PI * (1 + th / 18);
        p.px(ax + 6 + Math.round(Math.cos(an) * 7), at + 6 + Math.round(Math.sin(an) * 6), P.pa5, 0.75);
        p.px(ax + 6 + Math.round(Math.cos(an) * 8), at + 6 + Math.round(Math.sin(an) * 7), '#8b7148', 0.5);
      }
      p.frect(ax + 5, at - 2, 3, 4, P.gd3); p.px(ax + 5, at - 2, P.gd5);
      for (let y3 = at - 4; y3 < ry - 9; y3++) { p.px(ax - 4, y3, P.pa5, 0.6); p.px(ax - 3, y3, P.pa3, 0.7); p.px(ax - 2, y3, '#8b7148', 0.6); }
    }
    p.frect(x0, wallTop, x1 - x0, 4, P.pa3); p.hline(x0, x1, wallTop, P.pa5); p.hline(x0, x1, wallTop + 4, '#6c5940', 0.75);
    p.frect(x0 - 2, wallTop - 5, x1 - x0 + 5, 5, P.pa4); p.hline(x0 - 2, x1 + 2, wallTop - 5, P.pa5);
    p.hline(x0 - 2, x1 + 2, wallTop - 1, '#5d4b32', 0.7);
    for (let d2 = x0; d2 < x1; d2 += 5) { p.frect(d2, wallTop - 1, 3, 2, '#8b7148', 0.8); p.px(d2, wallTop - 1, P.pa5, 0.6); }
    for (let g = x0; g < x1; g += 6) { p.px(g + 1, wallTop + 2, P.gd3, 0.85); p.px(g + 3, wallTop + 2, P.gd4, 0.7); }
    const rt = wallTop - 5;
    p.fn(x0 - 4, rt - 14, x1 - x0 + 9, 14, (x, y, i, j) => {
      const span = x1 - x0 + 9, u = i / span, edge = Math.abs(u - 0.5) * 2;
      if (j < 14 * Math.pow(edge, 1.5) * 0.85) return null;
      const t = (0.52 - u * 0.20 + (j / 14) * 0.10 + ((y % 3 === 0) ? -0.10 : 0.04)) * (0.5 + rig.amb * 0.5);
      return rampAt(R.rust, clamp(t, 0, 1), x, y);
    });
    p.hline(x0 + 18, x1 - 18, rt - 13, P.rd4, 0.8); p.hline(x0 + 18, x1 - 18, rt - 12, P.rd1, 0.7);
    const dcx = x0 + Math.round((x1 - x0) / 2), dr = 22, dby = rt - 9;
    p.fn(dcx - 16, dby - 6, 32, 8, (x, y, i) => rampAt(R.paper, clamp((0.72 - (i / 32) * 0.30 + (sn(x * 0.1, y * 0.2) - 0.5) * 0.12) * (0.5 + rig.amb * 0.5), 0, 1), x, y));
    p.hline(dcx - 17, dcx + 16, dby - 7, P.pa5, 0.8);
    for (let j3 = -dr; j3 <= 0; j3++) for (let i3 = -dr; i3 <= dr; i3++) {
      const d3 = Math.sqrt(i3 * i3 + (j3 * 1.28) * (j3 * 1.28)); if (d3 > dr) continue;
      const nx = i3 / dr, ny = (j3 * 1.28) / dr, nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
      const lit = clamp(-(nx * -0.7 + ny * -0.45) * 0.85 + nz * 0.42, 0, 1);
      const ribs = (Math.abs(Math.sin(Math.asin(clamp(nx, -1, 1)) * 7)) < 0.22) ? -0.13 : 0;
      p.px(dcx + i3, dby - 6 + j3, rampAt(R.teal, clamp((lit * 0.92 + 0.06 + ribs) * (0.45 + rig.amb * 0.55), 0, 1), dcx + i3, dby - 6 + j3));
    }
    p.hline(dcx - dr, dcx + dr, dby - 6, P.tl1, 0.8);
    p.frect(dcx - 4, dby - 6 - dr - 6, 9, 7, P.pa4); p.rect(dcx - 4, dby - 6 - dr - 6, 9, 7, '#7c6540', 0.6);
    p.frect(dcx - 3, dby - 6 - dr - 5, 7, 5, '#ffd08a', 0.55); p.glow(dcx, dby - 6 - dr - 3, 18, '#ffc478', 0.42 * Math.max(0.3, rig.lamps), 2.2);
    p.vline(dcx, dby - 6 - dr - 13, dby - 6 - dr - 6, P.gd3); p.fcircle(dcx, dby - 6 - dr - 14, 2, P.gd4); p.px(dcx, dby - 6 - dr - 16, P.gd5);
    p.glow(dcx, dby - 6 - dr - 14, 10, P.gd4, 0.4, 2);
    for (let f = 0; f < 2; f++) {
      const fx = f ? x1 - 10 : x0 + 10;
      p.vline(fx, rt - 26, rt - 12, P.gd2);
      p.fpoly([[fx + 1, rt - 26], [fx + 11, rt - 23], [fx + 1, rt - 20]], f ? P.rd2 : P.tl2);
      p.line(fx + 1, rt - 26, fx + 11, rt - 23, f ? P.rd4 : P.tl4, 0.7);
    }
  })();

  // ---- right hall with a teal shingled roof + clerestory
  (() => {
    const x0 = 330, x1 = 470, ry = HOR - 2, wallTop = HOR - 30;
    p.castShadow(x0, x1, ry, SH * 40, 9, 0.42 * rig.amb);
    const sn = fbm(seed + 43, 4);
    p.fn(x0, wallTop, x1 - x0, ry - wallTop, (x, y, i, j) => {
      const u = i / (x1 - x0);
      const t = (0.66 - u * 0.22 + (sn(x * 0.06, y * 0.16) - 0.5) * 0.18 - Math.pow(j / (ry - wallTop), 2) * 0.14) * (0.52 + rig.amb * 0.48);
      return rampAt(R.paper, clamp(t, 0, 1), x, y);
    });
    for (let b = x0; b < x1; b += 7) { p.vline(b, wallTop, ry - 1, '#7d6440', 0.45); p.vline(b + 1, wallTop, ry - 1, P.pa5, 0.20); }
    for (let wI = 0; wI < 7; wI++) {
      const wx = x0 + 8 + wI * 19;
      p.frect(wx, wallTop + 7, 7, 10, '#3a2c18');
      p.frect(wx + 1, wallTop + 8, 5, 8, rig.lamps > 0.3 ? '#f0b96b' : '#9a8c68', 0.9);
      p.vline(wx + 3, wallTop + 8, wallTop + 15, '#3a2c18', 0.7);
      p.hline(wx + 1, wx + 5, wallTop + 11, '#3a2c18', 0.5);
      if (rig.lamps > 0.05) p.glow(wx + 3, wallTop + 12, 13, '#ffbe6c', 0.28 * rig.lamps, 2.2);
      p.hline(wx - 1, wx + 7, wallTop + 6, P.pa5, 0.7); p.hline(wx - 1, wx + 7, wallTop + 17, '#6c5940', 0.7);
    }
    for (let aI = 0; aI < 7; aI++) {
      const ax = x0 + 5 + aI * 19;
      for (let j = 0; j < 5; j++) for (let i = 0; i < 13; i++) {
        const col = ((ax + i + j) % 8 < 4) ? R.rust : R.paper;
        p.px(ax + i, wallTop + 2 + j, rampAt(col, clamp((0.62 - j * 0.06 - (i / 13) * 0.12) * (0.5 + rig.amb * 0.5), 0, 1), ax + i, wallTop + 2 + j));
      }
      for (let s2 = 0; s2 < 13; s2 += 3) p.px(ax + s2, wallTop + 7, '#4a3a20', 0.6);
      for (let i2 = 0; i2 < 13; i2++) p.mul(ax + i2, wallTop + 8, '#3a2c18', 0.30);
    }
    const rt = wallTop;
    p.fn(x0 - 5, rt - 20, x1 - x0 + 11, 21, (x, y, i, j) => {
      const span = x1 - x0 + 11, u = i / span;
      const peak = 20 * (1 - Math.abs(u - 0.5) * 2 * 0.55);
      if (j < 20 - peak) return null;
      const course = Math.floor(j / 3);
      const t = (0.58 - u * 0.20 + (course % 2 ? 0.06 : -0.05) + ((j % 3 === 0) ? -0.12 : 0.03)) * (0.45 + rig.amb * 0.55);
      return rampAt(R.teal, clamp(t, 0, 1), x, y);
    });
    p.frect(x0 + 26, rt - 27, 72, 8, P.pa3);
    p.hline(x0 + 26, x0 + 97, rt - 27, P.pa5, 0.9); p.hline(x0 + 26, x0 + 97, rt - 20, '#5d4b32', 0.8);
    for (let cI = 0; cI < 9; cI++) {
      const cx3 = x0 + 30 + cI * 8;
      p.frect(cx3, rt - 25, 4, 5, rig.lamps > 0.3 ? '#f2bd72' : '#9c9070', 0.9); p.rect(cx3 - 1, rt - 26, 6, 7, '#4a3a20', 0.7);
      if (rig.lamps > 0.05) p.glow(cx3 + 1, rt - 23, 12, '#ffbe6c', 0.24 * rig.lamps, 2.2);
    }
    p.fn(x0 + 22, rt - 32, 80, 6, (x, y, i, j) => rampAt(R.teal, clamp((0.56 + (j / 6) * 0.10 + ((j % 2) ? 0.04 : -0.06)) * (0.45 + rig.amb * 0.55), 0, 1), x, y));
    p.hline(x0 + 22, x0 + 101, rt - 32, P.tl4, 0.85);
    for (let f2 = 0; f2 < 5; f2++) {
      const fx = x0 + 26 + f2 * 18;
      p.vline(fx, rt - 40, rt - 32, P.gd2);
      p.fpoly([[fx + 1, rt - 40], [fx + 8, rt - 38], [fx + 1, rt - 35]], f2 % 2 ? P.rd2 : P.pa4);
    }
  })();

  // ---- bandstand
  (() => {
    const cx = 176, gy = HOR + 12, r = 15;
    p.castShadow(cx - r, cx + r, gy, SH * 34, 8, 0.40 * rig.amb);
    p.fn(cx - r - 2, gy - 5, r * 2 + 5, 6, (x, y, i, j) => rampAt(R.wood, clamp((0.40 + (j / 6) * 0.12 + ((x % 4 === 0) ? -0.10 : 0.03)) * (0.5 + rig.amb * 0.5), 0, 1), x, y));
    p.hline(cx - r - 2, cx + r + 2, gy - 5, P.wd5, 0.7);
    for (let i = -1; i <= 1; i += 2) for (let y2 = gy - 24; y2 < gy - 4; y2++) { p.px(cx + i * (r - 2), y2, P.pa4); p.px(cx + i * (r - 2) + 1, y2, '#8b7148', 0.8); }
    for (let y3 = gy - 25; y3 < gy - 4; y3++) p.px(cx, y3, P.pa4, 0.55);
    for (let j2 = gy - 23; j2 < gy - 5; j2++) for (let i2 = -r + 3; i2 <= r - 3; i2++)
      p.px(cx + i2, j2, rampAt(R.paper, clamp(0.24 + (1 - Math.abs(i2) / r) * 0.14, 0, 1), cx + i2, j2));
    p.glow(cx, gy - 14, 26, '#ffc274', 0.36 * Math.max(0.25, rig.lamps), 2.2);
    for (let j3 = 0; j3 < 14; j3++) {
      const hw = Math.round((r + 3) * (j3 / 14));
      for (let i3 = -hw; i3 <= hw; i3++) {
        const u = i3 / Math.max(1, hw);
        const gore = (Math.abs(Math.sin(Math.asin(clamp(u, -1, 1)) * 5)) < 0.20) ? -0.14 : 0;
        p.px(cx + i3, gy - 38 + j3, rampAt(R.rust, clamp((0.62 - u * 0.30 - (1 - j3 / 14) * 0.10 + gore) * (0.5 + rig.amb * 0.5), 0, 1), cx + i3, gy - 38 + j3));
      }
    }
    p.hline(cx - r - 3, cx + r + 3, gy - 24, P.rd1, 0.9);
    for (let s = -r - 3; s <= r + 3; s += 4) { p.px(cx + s, gy - 23, P.pa4, 0.8); p.px(cx + s + 1, gy - 22, P.pa3, 0.7); p.px(cx + s + 2, gy - 23, P.pa4, 0.8); }
    p.vline(cx, gy - 45, gy - 38, P.gd2); p.fcircle(cx, gy - 46, 2, P.gd4); p.glow(cx, gy - 46, 9, P.gd4, 0.45, 2);
    figure(p, cx - 6, gy - 6, 11, '#ffcf8c', -1, 0);
    figure(p, cx + 5, gy - 6, 11, '#ffcf8c', -1, 2);
  })();

  // ---- the obelisk: the centrepiece
  (() => {
    const cx = 240, base = HOR + 4, top = 62, hwB = 17, hwT = 6;
    const sn = fbm(seed + 53, 4);
    p.castShadow(cx - hwB, cx + hwB, base, SH * 168, 26, 0.50 * rig.amb);
    for (let y = top; y <= base; y++) {
      const f = (y - top) / (base - top);
      const hw = Math.round(lerp(hwT, hwB, Math.pow(f, 1.06)));
      for (let i = -hw; i <= hw; i++) {
        const u = (i + hw) / (2 * hw);
        let lit = 0.20 + Math.pow(1 - u, 1.25) * 0.66;
        lit += Math.exp(-Math.pow((u - 0.24) / 0.10, 2)) * 0.14;
        lit += (sn((cx + i) * 0.10, y * 0.10) - 0.5) * 0.16;
        lit -= f * 0.06;
        if (Math.abs(i) >= hw - 1) lit -= 0.16;
        p.px(cx + i, y, rampAt(R.teal, clamp(lit * (0.42 + rig.amb * 0.58), 0, 1), cx + i, y));
      }
      if ((y - top) % 8 === 0) { p.hline(cx - hw, cx + hw, y, shade(P.tl5, 0.1), 0.28); p.hline(cx - hw, cx + hw, y + 1, P.tl0, 0.40); }
    }
    const band = (y, h, ramp, orn) => {
      const f = (y - top) / (base - top), hw = Math.round(lerp(hwT, hwB, Math.pow(f, 1.06))) + 2;
      for (let j = 0; j < h; j++) for (let i = -hw; i <= hw; i++) {
        const u = (i + hw) / (2 * hw);
        p.px(cx + i, y + j, rampAt(ramp, clamp((0.26 + Math.pow(1 - u, 1.2) * 0.58 - (j / h) * 0.14) * (0.45 + rig.amb * 0.55), 0, 1), cx + i, y + j));
      }
      p.hline(cx - hw, cx + hw, y, shade(ramp[5], 0.2), 0.7);
      p.hline(cx - hw, cx + hw, y + h - 1, ramp[0], 0.7);
      if (orn) for (let g = -hw + 2; g < hw - 1; g += 4) { p.px(cx + g, y + Math.floor(h / 2), orn, 0.8); p.px(cx + g + 1, y + Math.floor(h / 2) + 1, orn, 0.45); }
    };
    band(170, 6, R.gold, P.rd1); band(136, 4, R.rust, P.gd4); band(104, 5, R.gold, P.rd1); band(80, 4, R.rust, P.gd4);
    for (let wy = 176; wy > 84; wy -= 17) {
      const f2 = (wy - top) / (base - top), hw2 = Math.round(lerp(hwT, hwB, Math.pow(f2, 1.06)));
      if (hw2 < 5) continue;
      const wx = cx - Math.round(hw2 * 0.30);
      p.frect(wx - 1, wy - 5, 4, 6, P.tl0);
      p.frect(wx, wy - 4, 2, 5, rig.lamps > 0.25 ? '#f6c47c' : '#8e9276', 0.95);
      p.px(wx, wy - 5, '#f6c47c', 0.6); p.px(wx + 1, wy - 5, '#f6c47c', 0.6);
      if (rig.lamps > 0.05) p.glow(wx + 1, wy - 2, 13, '#ffb964', 0.34 * rig.lamps, 2.3);
      p.hline(wx - 2, wx + 3, wy + 1, P.tl5, 0.35);
    }
    const cy0 = top, dr = 9;
    for (let j2 = 0; j2 < 8; j2++) for (let i2 = -7; i2 <= 7; i2++) {
      const u = (i2 + 7) / 14;
      p.px(cx + i2, cy0 - 8 + j2, rampAt(R.paper, clamp((0.72 - u * 0.32 - j2 * 0.012) * (0.5 + rig.amb * 0.5), 0, 1), cx + i2, cy0 - 8 + j2));
    }
    p.hline(cx - 8, cx + 8, cy0 - 9, P.pa5, 0.9); p.hline(cx - 8, cx + 8, cy0, P.pa0, 0.7);
    for (let oI = -1; oI <= 1; oI++) {
      p.frect(cx + oI * 5 - 1, cy0 - 6, 3, 5, '#3a2c18');
      p.frect(cx + oI * 5 - 1, cy0 - 5, 3, 4, rig.lamps > 0.25 ? '#ffcb7d' : '#94906e', 0.9);
      if (rig.lamps > 0.05) p.glow(cx + oI * 5, cy0 - 4, 12, '#ffbb66', 0.30 * rig.lamps, 2.2);
    }
    for (let j3 = -dr; j3 <= 0; j3++) for (let i3 = -dr; i3 <= dr; i3++) {
      const d3 = Math.sqrt(i3 * i3 + (j3 * 1.15) * (j3 * 1.15)); if (d3 > dr) continue;
      const nx = i3 / dr, ny = (j3 * 1.15) / dr, nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
      const lit = clamp(-(nx * -0.72 + ny * -0.42) * 0.88 + nz * 0.40, 0, 1);
      const rib = (Math.abs(Math.sin(Math.asin(clamp(nx, -1, 1)) * 6)) < 0.20) ? -0.14 : 0;
      p.px(cx + i3, cy0 - 9 + j3, rampAt(R.teal, clamp((lit * 0.94 + 0.05 + rib) * (0.45 + rig.amb * 0.55), 0, 1), cx + i3, cy0 - 9 + j3));
    }
    p.hline(cx - dr, cx + dr, cy0 - 9, P.tl1, 0.8); p.hline(cx - dr - 1, cx + dr + 1, cy0 - 10, P.tl4, 0.35);
    p.frect(cx - 3, cy0 - 9 - dr - 7, 7, 7, P.gd1);
    p.frect(cx - 2, cy0 - 9 - dr - 6, 5, 5, '#fff1c4');
    p.glow(cx, cy0 - 9 - dr - 4, 46, '#ffd382', 0.48 * Math.max(0.35, rig.lamps), 2.5);
    p.glow(cx, cy0 - 9 - dr - 4, 16, '#fff3d0', 0.55 * Math.max(0.35, rig.lamps), 2.0);
    p.vline(cx, cy0 - 9 - dr - 22, cy0 - 9 - dr - 7, P.gd2);
    p.fcircle(cx, cy0 - 9 - dr - 23, 2, P.gd4); p.px(cx, cy0 - 9 - dr - 25, P.gd5);
    p.glow(cx, cy0 - 9 - dr - 23, 10, P.gd4, 0.5, 2);
    p.fpoly([[cx + 1, cy0 - 9 - dr - 22], [cx + 13, cy0 - 9 - dr - 19], [cx + 1, cy0 - 9 - dr - 16]], P.rd2);
    p.line(cx + 1, cy0 - 9 - dr - 22, cx + 13, cy0 - 9 - dr - 19, P.rd4, 0.8);
    p.fn(cx - hwB - 5, base - 12, (hwB + 5) * 2 + 1, 13, (x, y, i, j) => {
      const span = (hwB + 5) * 2 + 1, u = i / span;
      const step = j < 4 ? 3 : j < 8 ? 2 : 0;
      if (Math.abs(x - cx) > hwB + 5 - step) return null;
      return rampAt(R.stone, clamp((0.60 - u * 0.26 - (j / 13) * 0.10) * (0.5 + rig.amb * 0.5), 0, 1), x, y);
    });
    p.hline(cx - hwB - 5, cx + hwB + 5, base - 12, P.pa5, 0.55);
    p.hline(cx - hwB - 3, cx + hwB + 3, base - 8, P.pa5, 0.40);
  })();

  // ---- festoons + furniture
  festoon(p, 24, 128, 226, 74, 26, 5, '#ffcf82', 12, 0.44, rig.lamps);
  festoon(p, 254, 74, 452, 118, 28, 5, '#ffcf82', 12, 0.44, rig.lamps);
  festoon(p, 62, 152, 224, 108, 20, 6, '#ffe0a0', 10, 0.36, rig.lamps);
  festoon(p, 256, 108, 440, 148, 22, 6, '#ffe0a0', 10, 0.36, rig.lamps);
  (() => {
    const kx = 308, gy = HOR + 30;
    p.castShadow(kx - 11, kx + 11, gy, SH * 32, 7, 0.44 * rig.amb);
    p.fn(kx - 11, gy - 22, 23, 22, (x, y, i, j) => rampAt(R.paper, clamp((0.68 - (i / 23) * 0.28 - (j / 22) * 0.10) * (0.5 + rig.amb * 0.5), 0, 1), x, y));
    p.frect(kx - 7, gy - 16, 15, 9, '#3a2c18');
    p.frect(kx - 6, gy - 15, 13, 7, rig.lamps > 0.25 ? '#ffca7c' : '#a0977a', 0.92);
    if (rig.lamps > 0.05) p.glow(kx, gy - 11, 22, '#ffbe6c', 0.40 * rig.lamps, 2.2);
    p.hline(kx - 8, kx + 8, gy - 17, P.pa5, 0.8);
    p.frect(kx - 10, gy - 20, 21, 4, P.pa3); p.hline(kx - 10, kx + 10, gy - 20, P.pa5, 0.8);
    t3(p, 'TICKETS', kx - 9, gy - 19, P.rd1, 0.85);
    for (let j = 0; j < 5; j++) for (let i = -14; i <= 14; i++) {
      const col = ((((i + j) % 8) + 8) % 8) < 4 ? R.rust : R.paper;
      p.px(kx + i, gy - 26 + j, rampAt(col, clamp((0.62 - j * 0.07) * (0.5 + rig.amb * 0.5), 0, 1), kx + i, gy - 26 + j));
    }
    for (let i2 = -14; i2 <= 14; i2++) p.mul(kx + i2, gy - 21, '#3a2c18', 0.35);
    p.vline(kx - 11, gy - 22, gy - 1, '#8b7148', 0.8); p.vline(kx + 11, gy - 22, gy - 1, '#8b7148', 0.8);
    p.px(kx, gy - 30, P.gd4); p.vline(kx, gy - 30, gy - 26, P.gd2);
    figure(p, kx + 18, gy, 13, '#ffcf8c', -1, 0);
    figure(p, kx + 23, gy, 12, '#ffcf8c', -1, 1);
  })();
  lampPost(p, 118, HOR + 22, 26, '#ffc878', 0.85, rig.lamps);
  lampPost(p, 364, HOR + 26, 28, '#ffc878', 0.9, rig.lamps);
  lampPost(p, 66, HOR + 52, 36, '#ffc878', 1.15, rig.lamps);
  lampPost(p, 420, HOR + 58, 38, '#ffc878', 1.2, rig.lamps);
  (() => {
    const cr = rng(seed + 7);
    const spots = [[196, HOR + 16, 10], [210, HOR + 18, 11], [268, HOR + 15, 10], [284, HOR + 20, 11],
    [150, HOR + 30, 13], [168, HOR + 34, 14], [300, HOR + 32, 13], [330, HOR + 38, 15],
    [98, HOR + 44, 16], [128, HOR + 50, 17], [352, HOR + 46, 16], [392, HOR + 52, 17],
    [232, HOR + 13, 9], [246, HOR + 14, 9]];
    for (const s of spots) figure(p, s[0], s[1], s[2], '#ffd39a', -1, (cr() * 3) | 0);
  })();
}

// ---------------------------------------------------------------- LOCALE 2
// THE WINDWARD PIER — lighthouse and headland left, a jetty running out into the
// water, the big top on the sand right. The ratified PoC composition.
const SEA_RAMP = ['#123a3c', '#1c5253', '#2f6d6a', '#438a83', '#66a89c', '#93c7b8', '#cbe5d8'];

function groyne(p, x0, y0, x1, y1, n, amb) {
  for (let k = n - 1; k >= 0; k--) {
    const t = k / (n - 1);
    const x = Math.round(lerp(x0, x1, t)), y = Math.round(lerp(y0, y1, t));
    const h = Math.round(lerp(11, 4, t)), w = Math.round(lerp(2, 1, t));
    for (let j = 0; j < h; j++) for (let i = -w; i <= w; i++) {
      const q = 1 - Math.abs(i + w * 0.4) / (w * 1.6 + 0.5);
      p.px(x + i, y - h + j, rampAt(R.wood, clamp((0.14 + q * 0.50 - j * 0.012) * (0.5 + amb * 0.5), 0, 1), x + i, y - h + j));
    }
    p.hline(x - w, x + w, y - h, P.wd5, 0.55);
    p.castShadow(x - w, x + w, y, -Math.round(h * 1.3), 2, 0.34 * amb);
    if (t < 0.55) { p.px(x - w - 1, y - 1, '#3d4a28', 0.6); p.px(x + w + 1, y - 1, '#3d4a28', 0.5); }
  }
}
function beachHut(p, x, gy, w, h, accent, amb) {
  const hw = Math.round(w / 2);
  p.castShadow(x - hw, x + hw, gy, -Math.round(h * 1.5), Math.round(h * 0.22), 0.42 * amb);
  for (let i = -hw; i <= hw; i++) {
    const u = (i + hw) / (2 * hw);
    const stripe = (Math.floor((i + hw) / 3) % 2) === 0;
    const ramp = stripe ? R.paper : accent;
    for (let j = 0; j < h; j++) {
      let t = 0.24 + Math.pow(u, 1.1) * 0.54 - (j / h) * 0.14;
      if (((i + hw) % 3) === 0) t -= 0.10;
      p.px(x + i, gy - j, rampAt(ramp, clamp(t * (0.5 + amb * 0.5), 0, 1), x + i, gy - j));
    }
  }
  const rh = Math.max(3, Math.round(h * 0.34));
  for (let j2 = 0; j2 < rh; j2++) {
    const rw = Math.round((hw + 2) * (j2 / rh));
    for (let i2 = -rw; i2 <= rw; i2++) {
      const u2 = (i2 + rw) / (2 * rw + 0.001);
      p.px(x + i2, gy - h - rh + j2 + 1, rampAt(R.rust, clamp((0.30 + u2 * 0.42 + (j2 / rh) * 0.10) * (0.5 + amb * 0.5), 0, 1), x + i2, gy - h - rh + j2));
    }
  }
  p.hline(x - hw - 2, x + hw + 2, gy - h + 1, P.wd1, 0.85);
  p.hline(x - hw - 2, x + hw + 2, gy - h, P.pa5, 0.45);
  p.frect(x - 1, gy - Math.round(h * 0.62), 3, Math.round(h * 0.62), '#3a2c18', 0.85);
  p.px(x + 1, gy - Math.round(h * 0.34), P.gd4, 0.9);
  p.hline(x - 2, x + 2, gy, P.wd4, 0.8);
  if (h > 16) { p.fcircle(x - hw + 2, gy + 1, 2, '#3f3527'); p.fcircle(x + hw - 2, gy + 1, 2, '#3f3527'); }
}
function sail(p, x, y, s) {
  p.fpoly([[x, y - s * 3], [x + s * 2, y], [x, y]], '#f2ead2', 0.9);
  p.fpoly([[x - 1, y], [x - s * 2, y - 1], [x - s * 2, y]], '#e2d8bc', 0.75);
  p.hline(x - s * 2, x + s * 2, y, '#3b3428', 0.8);
  p.vline(x, y - s * 3, y, '#5a5040', 0.7);
  for (let j = 1; j <= 3; j++) p.add(x, y + j, '#ffe8b8', 0.14 * (1 - j / 4));
}

function paintPier(p, rig, seed) {
  const SEA = 104, SHORE = 172, FLOOR = GROUND;
  skyAndClouds(p, rig, seed, BUNT_Y, SEA);
  sunDisc(p, rig);
  for (let s = 0; s < 4; s++) {
    const a0 = 1.02 + s * 0.20;
    for (let t2 = 12; t2 < 210; t2++) {
      const xx = Math.round(rig.sunX - Math.cos(a0) * t2 * 0.60), yy = Math.round(rig.sunY + Math.sin(a0) * t2 * 0.60);
      if (yy > SEA + 4) break;
      const v = 0.15 * (1 - t2 / 210) * rig.amb;
      for (let k = -4; k <= 4; k++) p.add(xx + k, yy, '#ffeec2', v * (1 - Math.abs(k) / 5));
    }
  }

  // the sea
  const wn = fbm(seed + 37, 4), wn2 = noise2(seed + 101), wr = rng(seed + 19);
  p.fn(0, SEA, NATIVE.w, SHORE - SEA, (x, y, i, j) => {
    const v = j / (SHORE - SEA);
    const swell = (wn(x * 0.009, y * 0.052) - 0.5);
    let t = 0.82 - v * 0.46 + swell * (0.20 + v * 0.24);
    t += (wn2(x * (0.05 + v * 0.14), y * (0.45 + v * 0.7)) - 0.5) * (0.09 + v * 0.15);
    return rampAt(SEA_RAMP, clamp(t * (0.45 + rig.amb * 0.55), 0, 1), x, y);
  });
  for (let fl = 0; fl < 5; fl++) {
    const base = SEA + 8 + Math.pow(fl / 5, 1.6) * (SHORE - SEA - 12);
    const amp = 1.2 + fl * 0.9;
    for (let x2 = 0; x2 < NATIVE.w; x2++) {
      const fy = Math.round(base + Math.sin(x2 * 0.021 + fl * 2.1) * amp + Math.sin(x2 * 0.062 + fl) * amp * 0.5);
      if (!(wn(x2 * 0.05, fl * 7) > 0.44)) continue;
      p.px(x2, fy, '#d9ede2', (0.55 + fl * 0.06) * (0.5 + rig.amb * 0.5));
      p.px(x2, fy + 1, P.tl1, 0.30);
    }
  }
  const rows = 52;
  for (let r = 0; r < rows; r++) {
    const v = Math.pow(r / rows, 1.85);
    const y = Math.round(SEA + 2 + v * (SHORE - SEA - 4));
    const n = Math.round(40 - v * 24), len = 1 + Math.round(v * 9);
    for (let k = 0; k < n; k++) {
      const x = Math.round(wr() * NATIVE.w), lit = 0.55 + wr() * 0.40;
      for (let i = 0; i < len; i++) {
        p.px(x + i, y, rampAt([P.tl3, P.tl4, P.tl5, '#dff0e6', '#f4faf2'], clamp(lit * (0.5 + rig.amb * 0.5), 0, 1), x + i, y), 0.85);
        p.px(x + i, y + 1, P.tl0, 0.30 + v * 0.22);
      }
      if (len > 4) { p.px(x, y - 1, P.tl5, 0.35); p.px(x + len - 1, y - 1, P.tl5, 0.35); }
    }
  }
  // the glare column
  {
    const n = fbm(seed + 29, 3);
    for (let y = SEA; y < SHORE; y++) {
      const t = (y - SEA) / (SHORE - SEA);
      const half = 5 + t * 84, cx = rig.sunX - t * 40;
      for (let x = Math.round(cx - half); x <= cx + half; x++) {
        const q = 1 - Math.abs(x - cx) / half; if (q <= 0) continue;
        const wob = 0.30 + 1.25 * n(x * 0.14, y * 0.62);
        const v = 0.66 * Math.pow(q, 1.8) * Math.pow(1 - t * 0.5, 1.35) * wob * (0.35 + rig.amb * 0.65);
        if (v < 0.05 && v * 14 < bay(x, y)) continue;
        p.add(x, y, shade(rig.sunCol, 0.15), v);
      }
    }
  }
  for (let hy = 0; hy < 7; hy++) for (let hx = 0; hx < NATIVE.w; hx++) p.add(hx, SEA + hy, rig.haze, 0.34 * Math.pow(1 - hy / 7, 1.4) * rig.amb);
  p.wash(0, SEA - 10, NATIVE.w, 24, rig.haze, rig.hazeAmt, (i, j) => Math.pow(clamp(1 - Math.abs(j - 10) / 12, 0, 1), 1.5), 0);
  sail(p, 214, SEA + 7, 2); sail(p, 268, SEA + 11, 3); sail(p, 158, SEA + 6, 2); sail(p, 330, SEA + 9, 2);

  // headland + lighthouse
  (() => {
    const hn = fbm(seed + 67, 4);
    const topAt = (x) => SEA + 10 + Math.round(Math.sin(x * 0.019) * 5 + hn(x * 0.045, 0) * 12) + Math.round(Math.pow(x / 168, 2.6) * 62);
    p.fn(0, SEA, 168, SHORE - SEA + 8, (x, y) => {
      const top = topAt(x); if (y < top) return null;
      const d = (y - top) / 46;
      return rampAt(R.slate, clamp((0.22 + d * 0.26 + (hn(x * 0.055, y * 0.11) - 0.5) * 0.34 + (x / 168) * 0.12) * (0.45 + rig.amb * 0.55), 0, 1), x, y);
    });
    for (let x2 = 0; x2 < 168; x2++) {
      const top = topAt(x2);
      p.px(x2, top, '#e3d8bc', 0.55 * rig.amb); p.px(x2, top + 1, P.sl5, 0.40); p.px(x2, top + 2, P.sl4, 0.22);
    }
    for (let b = 0; b < 6; b++) for (let x3 = 0; x3 < 168; x3++) {
      const y3 = topAt(x3) + 7 + b * 8 + Math.round(hn(x3 * 0.04, b * 3) * 6);
      if (y3 > SHORE + 6) continue;
      p.px(x3, y3, P.sl0, 0.42); p.px(x3, y3 - 1, P.sl5, 0.20);
    }
    for (let x4 = 0; x4 < 130; x4++) {
      const top = topAt(x4);
      for (let j = 0; j < 5 + Math.round(hn(x4 * 0.08, 9) * 4); j++)
        p.px(x4, top + j, rampAt(R.olive, clamp((0.44 - (j * 0.05) + (hn(x4 * 0.2, j) - 0.5) * 0.3) * (0.5 + rig.amb * 0.5), 0, 1), x4, top + j), 0.75);
    }
    for (let x5 = 0; x5 < 168; x5++) {
      const wy = SHORE - 3 + Math.round(Math.sin(x5 * 0.17) * 2);
      for (let j2 = 0; j2 < 6; j2++) p.mul(x5, wy + j2, '#16242c', 0.30 * (1 - j2 / 6));
      if (((x5 * 7 + ((x5 * x5) % 13)) % 5) < 2) { p.px(x5, wy - 1, '#f2f8f0', 0.85); p.px(x5 + 1, wy - 2, '#f2f8f0', 0.45); p.add(x5, wy, '#ffffff', 0.25); }
    }
    const lx = 74, lbase = SEA + 46, ltop = SEA - 40, hwB = 10, hwT = 6;
    for (let y = ltop; y <= lbase; y++) {
      const f = (y - ltop) / (lbase - ltop);
      const hw = Math.round(lerp(hwT, hwB, Math.pow(f, 1.30)));
      for (let i = -hw; i <= hw; i++) {
        const u = (i + hw) / (2 * hw);
        let lit = 0.22 + Math.pow(u, 1.15) * 0.58;
        lit += Math.exp(-Math.pow((u - 0.76) / 0.12, 2)) * 0.16;
        lit += (hn((lx + i) * 0.14, y * 0.14) - 0.5) * 0.13;
        if (Math.abs(i) >= hw - 1) lit -= 0.18;
        const helix = (Math.floor(f * 6.5 + u * 0.80 + 0.5)) % 2 === 0;
        p.px(lx + i, y, rampAt(helix ? R.rust : R.stone, clamp(lit * (0.45 + rig.amb * 0.55), 0, 1), lx + i, y));
      }
      if ((y - ltop) % 9 === 0) { p.hline(lx - hw, lx + hw, y, '#ffffff', 0.09); p.hline(lx - hw, lx + hw, y + 1, '#1c1a16', 0.18); }
    }
    p.fn(lx - 10, ltop - 4, 21, 5, (x, y, i, j) => rampAt(R.stone, clamp((0.28 + (i / 21) * 0.44 - j * 0.03) * (0.5 + rig.amb * 0.5), 0, 1), x, y));
    p.hline(lx - 10, lx + 10, ltop - 4, P.pa5, 0.7); p.hline(lx - 10, lx + 10, ltop, '#2b241a', 0.75);
    for (let rl = -9; rl <= 9; rl += 2) p.vline(lx + rl, ltop - 9, ltop - 5, '#37312a', 0.85);
    p.hline(lx - 9, lx + 9, ltop - 9, '#443c31', 0.9); p.hline(lx - 9, lx + 9, ltop - 10, '#96876a', 0.5);
    p.fn(lx - 6, ltop - 21, 13, 12, (x, y, i, j) => rampAt(R.gold, clamp(0.26 + (i / 13) * 0.42 - j * 0.012, 0, 1), x, y));
    p.frect(lx - 4, ltop - 19, 9, 9, '#2b241a');
    for (let gj = 0; gj < 9; gj++) for (let gi = 0; gi < 9; gi++) {
      const t = 1 - Math.sqrt(Math.pow((gi - 4) / 5, 2) + Math.pow((gj - 4) / 5, 2));
      p.px(lx - 4 + gi, ltop - 19 + gj, rampAt(['#3a2f18', '#8a6a24', '#e0b355', '#ffe6a8', '#fffbe8'], clamp(t * 1.2, 0, 1), lx - 4 + gi, ltop - 19 + gj));
    }
    for (let gv = -4; gv <= 4; gv += 4) p.vline(lx + gv, ltop - 19, ltop - 11, P.gd1, 0.65);
    for (let cj = 0; cj < 6; cj++) { const cw = 7 - cj; p.hline(lx - cw, lx + cw, ltop - 27 + cj, rampAt(R.slate, 0.26 + cj * 0.05, lx, ltop - 27 + cj)); }
    p.hline(lx - 8, lx + 8, ltop - 21, P.sl1, 0.9); p.hline(lx - 8, lx + 8, ltop - 22, P.sl4, 0.4);
    p.vline(lx, ltop - 33, ltop - 27, P.gd2); p.fcircle(lx, ltop - 34, 2, P.gd4); p.glow(lx, ltop - 34, 8, P.gd4, 0.4, 2);
    (() => {
      const kx = 118, kb = topAt(kx) + 16;
      p.castShadow(kx - 9, kx + 9, kb, -16, 3, 0.40 * rig.amb);
      p.fn(kx - 9, kb - 13, 19, 13, (x, y, i, j) => rampAt(R.paper, clamp((0.30 + (i / 19) * 0.46 - j * 0.014) * (0.5 + rig.amb * 0.5), 0, 1), x, y));
      for (let j = 0; j < 7; j++) { const rw = Math.round(11 * (j / 7)); p.hline(kx - rw, kx + rw, kb - 20 + j, rampAt(R.rust, clamp((0.32 + (j / 7) * 0.30) * (0.5 + rig.amb * 0.5), 0, 1), kx, kb - 20 + j)); }
      p.hline(kx - 11, kx + 11, kb - 13, P.wd1, 0.8);
      p.frect(kx + 2, kb - 8, 4, 4, rig.lamps > 0.25 ? '#ffcb7d' : '#98906e', 0.9);
      if (rig.lamps > 0.05) p.glow(kx + 4, kb - 6, 11, '#ffbe6c', 0.26 * rig.lamps, 2.2);
      p.frect(kx - 5, kb - 6, 3, 6, '#3a2c18');
      p.vline(kx + 7, kb - 26, kb - 19, P.pa2);
    })();
    // the beam — a broad cone over sky AND water; it is the locale's signature light
    const ox = lx + 6, oy = ltop - 15;
    const cone = (ang, spread, len, strength, col) => {
      for (let t = 8; t < len; t += 1) {
        const half = Math.max(1, t * spread);
        const bx = ox + Math.cos(ang) * t, by = oy + Math.sin(ang) * t;
        for (let k = -half; k <= half; k++) {
          const q = 1 - Math.abs(k) / half;
          const v = strength * Math.pow(q, 1.5) * Math.pow(1 - t / len, 1.35);
          const px2 = Math.round(bx - Math.sin(ang) * k), py2 = Math.round(by + Math.cos(ang) * k);
          if (v < 0.05 && v * 14 < bay(px2, py2)) continue;
          p.add(px2, py2, col, v);
        }
      }
    };
    const beamLit = Math.max(0.35, rig.lamps);
    cone(0.42, 0.13, 330, 0.30 * beamLit, '#ffe3a8');
    cone(0.40, 0.055, 300, 0.34 * beamLit, '#fff0cc');
    p.glow(ox - 6, oy, 64, '#ffd684', 0.50 * beamLit, 2.5);
    p.glow(ox - 6, oy, 24, '#fff4d4', 0.62 * beamLit, 2.0);
  })();

  // the beach
  (() => {
    const bn = fbm(seed + 71, 4), bn2 = noise2(seed + 83);
    p.fn(0, SHORE, NATIVE.w, FLOOR - SHORE, (x, y, i, j) => {
      const v = j / (FLOOR - SHORE);
      const sc = 0.016 + v * 0.075;
      let t = 0.40 + Math.pow(v, 0.7) * 0.34 - Math.pow(v, 3.2) * 0.34;
      t += (bn(x * sc, y * sc * 2.2) - 0.5) * 0.30;
      t += (bn2(x * sc * 3.4, y * sc * 7.5) - 0.5) * 0.20;
      t += (x / NATIVE.w - 0.5) * 0.10;
      return rampAt(R.paper, clamp(t * (0.5 + rig.amb * 0.5), 0, 1), x, y);
    });
    for (let y = SHORE; y < SHORE + 26; y++) {
      const t = (y - SHORE) / 26;
      for (let x = 0; x < NATIVE.w; x++) {
        p.mul(x, y, '#6d5c3c', 0.40 * (1 - t));
        const wob = 0.45 + 0.95 * bn(x * 0.08, y * 0.45);
        p.add(x, y, '#d4e4da', 0.24 * Math.pow(1 - t, 1.3) * wob * rig.amb);
      }
    }
    for (let x2 = 0; x2 < NATIVE.w; x2++) {
      const ly = SHORE + 3 + Math.round(Math.sin(x2 * 0.048) * 3 + Math.sin(x2 * 0.015) * 2.4 + bn(x2 * 0.1, 3) * 3);
      p.px(x2, ly, '#fbfdf6', 0.90); p.px(x2, ly + 1, '#e2eee2', 0.5);
      if ((x2 % 3) === 0) p.px(x2, ly - 1, '#ffffff', 0.55);
      p.add(x2, ly, '#ffffff', 0.20 * rig.amb);
      for (let j2 = 1; j2 < 5; j2++) p.mul(x2, ly + j2, '#655a40', 0.18 * (1 - j2 / 5));
    }
    for (let x3 = 0; x3 < NATIVE.w; x3++) {
      const ty = SHORE + 24 + Math.round(Math.sin(x3 * 0.026) * 4 + bn(x3 * 0.09, 11) * 5);
      if (bn(x3 * 0.14, 21) < 0.48) continue;
      p.px(x3, ty, '#4a4a26', 0.7); p.px(x3 + 1, ty, '#3a3a1e', 0.5); p.px(x3, ty - 1, '#77713c', 0.4);
    }
    p.pool(372, SHORE + 10, 120, 20, shade(rig.sunCol, 0.2), 0.26 * rig.amb, 1.5);
    const pr = rng(seed + 53);
    for (let k = 0; k < 340; k++) {
      const px2 = (pr() * NATIVE.w) | 0, py2 = SHORE + 10 + ((pr() * (FLOOR - SHORE - 12)) | 0);
      const v2 = (py2 - SHORE) / (FLOOR - SHORE), sz = v2 > 0.55 ? 1 : 0;
      const c = pr() < 0.5 ? P.pa2 : P.wd4;
      p.px(px2, py2, shade(c, 0.22), 0.85);
      if (sz) { p.px(px2 + 1, py2, c, 0.8); p.px(px2, py2 + 1, shade(c, -0.4), 0.75); p.px(px2 + 1, py2 + 1, shade(c, -0.55), 0.5); p.px(px2, py2 - 1, shade(c, 0.5), 0.4); }
      else p.px(px2, py2 + 1, shade(c, -0.4), 0.4);
    }
    for (let rp = 0; rp < 24; rp++) {
      const ry2 = SHORE + 34 + rp * 3.6;
      if (ry2 >= FLOOR) break;
      for (let x4 = 0; x4 < NATIVE.w; x4++) {
        const o = Math.round(Math.sin(x4 * 0.040 + rp * 0.8) * 2.2);
        p.px(x4, Math.round(ry2) + o, '#9c8155', 0.18); p.px(x4, Math.round(ry2) + o - 1, P.pa5, 0.11);
      }
    }
    const fr = rng(seed + 131);
    for (let tr = 0; tr < 7; tr++) {
      const sx2 = 40 + fr() * 400, sy2 = SHORE + 30 + fr() * 50, dxp = (fr() - 0.5) * 1.4;
      for (let st = 0; st < 16; st++) {
        const fx = Math.round(sx2 + dxp * st * 2.2 + (st % 2 ? 2 : -2)), fy = Math.round(sy2 + st * 2.6);
        if (fy >= FLOOR - 2) break;
        p.mul(fx, fy, '#7a6844', 0.32); p.mul(fx + 1, fy, '#7a6844', 0.26);
        p.px(fx, fy - 1, P.pa5, 0.16);
      }
    }
  })();

  groyne(p, 20, SHORE + 52, 4, SHORE - 6, 9, rig.amb);
  groyne(p, 206, SHORE + 30, 180, SHORE - 8, 8, rig.amb);
  groyne(p, 466, SHORE + 22, 448, SHORE - 10, 7, rig.amb);

  // the jetty
  (() => {
    const nx0 = 282, nx1 = 326, ny = SHORE + 12, fx0 = 246, fx1 = 258, fy = SEA + 30;
    const dn = fbm(seed + 113, 3);
    for (let k = 0; k < 9; k++) {
      const t = k / 8;
      const lx2 = Math.round(lerp(nx0, fx0, t)), rx2 = Math.round(lerp(nx1, fx1, t));
      const yy = Math.round(lerp(ny, fy, t));
      const ph = Math.round(lerp(20, 7, t)), pw = Math.round(lerp(2, 1, t));
      for (const px2 of [lx2 + 1, rx2 - 1]) {
        for (let j = 0; j < ph; j++) for (let i = -pw; i <= pw; i++) {
          const q = 1 - Math.abs(i + pw * 0.4) / (pw * 1.7 + 0.4);
          p.px(px2 + i, yy + j, rampAt(R.wood, clamp((0.12 + q * 0.46) * (0.5 + rig.amb * 0.5), 0, 1), px2 + i, yy + j));
        }
        if (yy > SEA) {
          for (let i2 = -pw; i2 <= pw; i2++) { p.px(px2 + i2, yy + ph - 3, '#33401f', 0.7); p.px(px2 + i2, yy + ph - 2, '#28331a', 0.6); }
          for (let ry = yy + ph - 2; ry < yy + ph + 5; ry++) p.mul(px2, ry, '#243024', 0.22 * (1 - (ry - yy - ph) / 7));
        }
      }
      if (k < 8) {
        const t2 = (k + 1) / 8;
        p.line(lx2 + 1, yy + 6, Math.round(lerp(nx1, fx1, t2)) - 1, Math.round(lerp(ny, fy, t2)) + 4, P.wd2, 0.7);
        p.line(rx2 - 1, yy + 6, Math.round(lerp(nx0, fx0, t2)) + 1, Math.round(lerp(ny, fy, t2)) + 4, P.wd2, 0.55);
      }
    }
    for (let t3v = 0; t3v <= 1.0001; t3v += 0.006) {
      const lx3 = lerp(nx0, fx0, t3v), rx3 = lerp(nx1, fx1, t3v), yy2 = Math.round(lerp(ny, fy, t3v));
      const plank = Math.floor(t3v * 44);
      for (let x = Math.round(lx3); x <= Math.round(rx3); x++) {
        const u = (x - lx3) / Math.max(1, rx3 - lx3);
        const tt = (0.40 + u * 0.22 + ((plank % 2) ? 0.06 : -0.05) + (dn(x * 0.09, plank * 2.7) - 0.5) * 0.26 - t3v * 0.06) * (0.5 + rig.amb * 0.5);
        p.px(x, yy2, rampAt(R.wood, clamp(tt, 0, 1), x, yy2));
      }
      if (plank % 2 === 0) { p.px(Math.round(lx3), yy2, P.wd0, 0.6); p.px(Math.round(rx3), yy2, P.wd0, 0.6); }
    }
    for (let t4 = 0; t4 <= 1.0001; t4 += 0.01) {
      const yy3 = Math.round(lerp(ny, fy, t4));
      p.px(Math.round(lerp(nx0, fx0, t4)), yy3, P.wd5, 0.5);
      p.px(Math.round(lerp(nx1, fx1, t4)), yy3, P.wd1, 0.6);
    }
    for (let side = 0; side < 2; side++) {
      const a = side ? nx1 : nx0, b = side ? fx1 : fx0;
      p.line(a, ny - 11, b, fy - 5, '#4a4034', 0.9);
      p.line(a, ny - 12, b, fy - 6, '#a2957a', 0.35);
      p.line(a, ny - 6, b, fy - 3, '#4a4034', 0.55);
      for (let q2 = 0; q2 <= 8; q2++) {
        const tq = q2 / 8, px3 = Math.round(lerp(a, b, tq)), py3 = Math.round(lerp(ny, fy, tq));
        p.vline(px3, py3 - Math.round(lerp(11, 5, tq)), py3, '#4a4034', 0.8);
      }
    }
    const cx = Math.round((fx0 + fx1) / 2), gy = fy + 1;
    p.fn(cx - 9, gy - 15, 19, 15, (x, y, i, j) => rampAt(R.paper, clamp((0.28 + (i / 19) * 0.44 - j * 0.012) * (0.5 + rig.amb * 0.5), 0, 1), x, y));
    for (let j = 0; j < 9; j++) {
      const rw = Math.round(13 * (j / 9));
      for (let i = -rw; i <= rw; i++) p.px(cx + i, gy - 24 + j, rampAt(R.teal, clamp((0.26 + ((i + rw) / (2 * rw + 0.001)) * 0.40 + (j / 9) * 0.10) * (0.45 + rig.amb * 0.55), 0, 1), cx + i, gy - 24 + j));
    }
    p.hline(cx - 13, cx + 13, gy - 15, P.tl0, 0.8); p.hline(cx - 13, cx + 13, gy - 16, P.tl4, 0.35);
    p.vline(cx, gy - 32, gy - 24, P.gd2); p.fcircle(cx, gy - 33, 1, P.gd4);
    p.fpoly([[cx + 1, gy - 32], [cx + 9, gy - 30], [cx + 1, gy - 28]], P.rd2);
    for (let wI = 0; wI < 3; wI++) {
      p.frect(cx - 6 + wI * 5, gy - 11, 3, 5, rig.lamps > 0.25 ? '#ffcb7d' : '#96906e', 0.9);
      if (rig.lamps > 0.05) p.glow(cx - 5 + wI * 5, gy - 9, 10, '#ffbe6c', 0.22 * rig.lamps, 2.2);
    }
    figure(p, cx + 13, gy, 9, '#ffe6b8', 1, 1);
    figure(p, 300, SHORE + 11, 13, '#ffe6b8', 1, 0);
    figure(p, 292, SHORE + 9, 12, '#ffe6b8', 1, 1);
    figure(p, 276, SHORE - 2, 10, '#ffe6b8', 1, 2);
    lampPost(p, 282, SHORE + 12, 24, '#ffd08c', 0.8, rig.lamps);
    lampPost(p, 326, SHORE + 12, 24, '#ffd08c', 0.8, rig.lamps);
  })();

  beachHut(p, 30, SHORE + 22, 9, 10, R.teal, rig.amb);
  beachHut(p, 54, SHORE + 27, 11, 12, R.rust, rig.amb);
  beachHut(p, 84, SHORE + 34, 14, 16, R.teal, rig.amb);
  beachHut(p, 122, SHORE + 43, 17, 19, R.rust, rig.amb);
  beachHut(p, 168, SHORE + 55, 21, 24, R.teal, rig.amb);
  figure(p, 146, SHORE + 48, 15, '#ffe6b8', 1, 1);
  figure(p, 196, SHORE + 58, 18, '#ffe6b8', 1, 1);
  figure(p, 206, SHORE + 60, 17, '#ffe6b8', 1, 0);

  // the big top
  (() => {
    const tx = 372, by = SHORE + 62, rx = 52, ry = 10, ty = by - 96;
    const y0 = by + 2, y1 = by + 22;
    for (let y = y0; y <= y1; y++) {
      const t = (y - y0) / (y1 - y0);
      const xr = tx + rx * (1 - t * 0.30), xl = tx - rx - 64 * (1 - t * 0.35);
      for (let x = Math.round(xl); x <= Math.round(xr); x++) {
        const u = clamp((xr - x) / (xr - xl), 0, 1);
        const v = 0.46 * Math.pow(clamp(1 - u, 0, 1), 0.55) * Math.pow(clamp(1 - t, 0, 1), 0.7) * rig.amb;
        if (!(v > 0.02)) continue;
        if (v < 0.05 && v * 14 < bay(x, y)) continue;
        p.mul(x, y, '#4a3418', v);
      }
    }
    const NG = 13, cn = fbm(seed + 97, 3);
    for (let x = -rx; x <= rx; x++) {
      const u = x / rx, th = Math.asin(clamp(u, -1, 1)), c = Math.cos(th);
      const ytop = ty + (by - ty) * Math.abs(u), ybot = by + ry * c;
      const lamb = Math.max(0, 0.82 * Math.sin(th) + 0.58 * c);
      const gpos = ((th / (Math.PI / 2)) + 1) * 0.5 * NG;
      const gi = Math.floor(gpos), seamFrac = Math.abs((gpos % 1) - 0.5) * 2;
      const ramp = (gi % 2) ? R.rust : R.paper;
      for (let y = Math.round(ytop); y <= Math.round(ybot); y++) {
        const f = (y - ytop) / Math.max(1, ybot - ytop);
        let t = 0.16 + lamb * 0.62 - Math.pow(f, 1.8) * 0.16 + (1 - seamFrac) * 0.04;
        t += (cn((tx + x) * 0.10, y * 0.05) - 0.5) * 0.12;
        if (seamFrac > 0.86) t -= 0.24;
        p.px(tx + x, y, rampAt(ramp, clamp(t * (0.5 + rig.amb * 0.5), 0, 1), tx + x, y));
      }
      if (seamFrac < 0.22) p.px(tx + x, Math.round(ytop) + 1, shade(ramp[5], 0.2), 0.35);
      if (Math.abs(x) > rx - 2) for (let y2 = Math.round(ytop); y2 <= Math.round(ybot); y2++) p.mul(tx + x, y2, '#3a2416', 0.26);
    }
    for (let sx = -rx; sx <= rx; sx += 8) {
      const c2 = Math.cos(Math.asin(clamp(sx / rx, -1, 1)));
      const hy = Math.round(by + ry * c2);
      for (let k = 0; k < 8; k++) {
        const d = Math.abs(k - 3.5) / 3.5, dep = Math.round(4 * (1 - d * d));
        for (let j = 0; j < dep; j++) p.px(tx + sx + k, hy + j, rampAt(R.paper, clamp((0.30 + ((sx + rx) / (rx * 2)) * 0.42 - j * 0.07) * (0.5 + rig.amb * 0.5), 0, 1), tx + sx + k, hy + j));
        p.px(tx + sx + k, hy + dep, P.pa0, 0.6);
        for (let j2 = 1; j2 < 4; j2++) p.mul(tx + sx + k, hy + dep + j2, '#3a2c18', 0.24 * (1 - j2 / 4));
      }
    }
    const ex = tx - 6, eb = by + ry - 1, eh = 28, ew = 17;
    for (let j = 0; j < eh; j++) for (let i = -ew / 2; i <= ew / 2; i++) {
      const rr = (eh - 15 - j) / 13, dxr = i / (ew / 2);
      if (j < eh - 15 && dxr * dxr + rr * rr > 1) continue;
      p.px(ex + i, eb - eh + j + 2, rampAt(R.wood, clamp(0.22 - Math.abs(dxr) * 0.13, 0, 1) * 0.55, ex + i, eb - eh + j));
    }
    p.glow(ex, eb - 11, 30, '#ffbe72', 0.40 * Math.max(0.3, rig.lamps), 2.2);
    p.glow(ex, eb - 11, 12, '#ffe4ae', 0.46 * Math.max(0.3, rig.lamps), 2.0);
    p.frect(ex - 13, eb - eh - 1, 27, 6, P.pa3); p.hline(ex - 13, ex + 13, eb - eh - 1, P.pa5, 0.85);
    p.hline(ex - 13, ex + 13, eb - eh + 4, P.pa0, 0.7);
    t3(p, 'GRAND', ex - 9, eb - eh, P.rd1, 0.9);
    for (let b2 = 0; b2 < 7; b2++) { p.px(ex - 11 + b2 * 4, eb - eh - 3, P.gd4); if (rig.lamps > 0.05) p.glow(ex - 11 + b2 * 4, eb - eh - 3, 6, '#ffd88a', 0.35 * rig.lamps, 2); }
    for (let q = 0; q < 4; q++) {
      const qx = ex - 30 + q * 18;
      p.vline(qx, eb + 2, eb + 10, P.gd2); p.px(qx, eb + 1, P.gd4);
      if (q < 3) for (let i2 = 0; i2 < 18; i2++) p.px(qx + i2, eb + 3 + Math.round(Math.sin(i2 / 18 * Math.PI) * 2.5), P.rd2, 0.9);
    }
    p.vline(tx, ty - 17, ty + 3, P.gd2); p.vline(tx + 1, ty - 17, ty + 3, P.gd1, 0.7);
    p.fcircle(tx, ty - 18, 2, P.gd4); p.px(tx, ty - 20, P.gd5); p.glow(tx, ty - 18, 11, P.gd4, 0.45, 2);
    p.fpoly([[tx + 1, ty - 17], [tx + 24, ty - 13], [tx + 16, ty - 11], [tx + 24, ty - 9], [tx + 1, ty - 6]], P.rd2);
    p.line(tx + 1, ty - 17, tx + 24, ty - 13, P.rd4, 0.8);
    p.line(tx + 1, ty - 6, tx + 20, ty - 9, P.rd0, 0.5);
    for (let g = 0; g < 2; g++) {
      const gx = g ? tx + rx + 24 : tx - rx - 22;
      p.line(g ? tx + rx - 7 : tx - rx + 7, by - 16, gx, by + 14, '#6b5a3e', 0.8);
      p.line(g ? tx + rx - 7 : tx - rx + 7, by - 17, gx, by + 13, '#a08a62', 0.3);
      p.frect(gx - 1, by + 13, 3, 4, P.wd2); p.px(gx, by + 12, P.wd5);
    }
    figure(p, tx - 30, by + 15, 14, '#ffe6b8', 1, 0);
    figure(p, tx - 21, by + 17, 13, '#ffe6b8', 1, 1);
    figure(p, tx + 16, by + 15, 14, '#ffe6b8', 1, 2);
    figure(p, tx + 25, by + 18, 15, '#ffe6b8', 1, 0);
  })();

  // foreground: dinghy + bollard
  (() => {
    const dx = 86, dy2 = FLOOR - 20;
    p.castShadow(dx - 28, dx + 28, dy2 + 11, -26, 4, 0.40 * rig.amb);
    for (let x = -28; x <= 28; x++) {
      const u = x / 28, hgt = Math.round(12 * (1 - u * u * 0.84));
      for (let j = 0; j < hgt; j++) p.px(dx + x, dy2 + 11 - hgt + j, rampAt(R.wood, clamp((0.30 + (u + 1) * 0.22 - j * 0.018 + ((j % 3 === 0) ? -0.07 : 0.02)) * (0.5 + rig.amb * 0.5), 0, 1), dx + x, dy2 + j));
    }
    for (let x2 = -28; x2 <= 28; x2++) {
      const u2 = x2 / 28, hgt2 = Math.round(12 * (1 - u2 * u2 * 0.84));
      p.px(dx + x2, dy2 + 11 - hgt2, P.wd5, 0.85); p.px(dx + x2, dy2 + 12 - hgt2, P.wd1, 0.35);
    }
    p.hline(dx - 19, dx + 19, dy2 + 5, P.rd2, 0.9); p.hline(dx - 19, dx + 19, dy2 + 6, P.rd0, 0.55);
    p.hline(dx - 12, dx + 12, dy2 + 8, P.wd4, 0.9);
    p.line(dx - 26, dy2 + 6, dx + 24, dy2 - 6, P.wd3); p.line(dx - 26, dy2 + 5, dx + 24, dy2 - 7, P.wd5, 0.45);
    p.fellipse(dx + 26, dy2 - 7, 3, 2, P.wd4);
    t3(p, 'GULL', dx + 6, dy2 + 2, P.pa5, 0.75);
    const bx = 444, byy = FLOOR + 8;
    p.shadowPool(bx, byy + 2, 13, 4, 0.45);
    for (let y = byy - 24; y <= byy; y++) for (let i = -4; i <= 4; i++) {
      const q = 1 - Math.abs(i - 1.2) / 5.6;
      p.px(bx + i, y, rampAt(R.wood, clamp((0.14 + q * 0.52) * (0.5 + rig.amb * 0.5), 0, 1), bx + i, y));
    }
    p.fellipse(bx, byy - 24, 5, 2, P.wd5); p.ellipse(bx, byy - 24, 5, 2, P.wd1);
    for (let c = 0; c < 4; c++) {
      const cy2 = byy - 20 + c * 3;
      for (let i2 = -6; i2 <= 6; i2++) {
        const q2 = 1 - Math.abs(i2 - 1) / 8;
        p.px(bx + i2, cy2 + Math.round(Math.sin(i2 * 0.5) * 1), rampAt(R.paper, clamp(0.26 + q2 * 0.42, 0, 1), bx + i2, cy2));
      }
    }
    for (let t = 0; t < 64; t++) {
      const rxp = bx - 7 - t, ryp = byy - 9 + Math.round(Math.sin(t * 0.11) * 4 + t * 0.07);
      p.px(rxp, ryp, P.pa2, 0.95); p.px(rxp, ryp - 1, P.pa5, 0.6); p.px(rxp, ryp + 1, P.pa0, 0.55);
    }
  })();
  // gulls
  for (const [x, y, s] of [[132, 64, 4], [150, 52, 3], [300, 44, 4], [322, 54, 3], [236, 78, 3], [104, 86, 2], [420, 92, 3]]) {
    for (let k = 0; k <= s; k++) {
      p.px(x - k, y - Math.round(k * 0.75), '#fbf7ea', 0.95);
      p.px(x + k, y - Math.round(k * 0.75), '#fbf7ea', 0.95);
      if (k > 0) { p.px(x - k, y - Math.round(k * 0.75) + 1, '#a8a292', 0.45); p.px(x + k, y - Math.round(k * 0.75) + 1, '#a8a292', 0.45); }
    }
    p.px(x, y, '#d8d2c0', 0.95); p.px(x, y + 1, '#8a8474', 0.6);
  }
}

// ---------------------------------------------------------------- LOCALE 3
// SUNSET IRONWORKS — an alpine massif over a valley works. The furnace is a SECOND
// light source under the sky's: it uplights the smoke, the trestle and the near
// ground from below, which is the whole reason this locale looks different from the
// other two even though it shares their palette.
function paintIronworks(p, rig, seed) {
  const HOR = HORIZON, FLOOR = GROUND;
  const FURN_X = 96, FURN_Y = HOR + 26;              // the furnace mouth
  skyAndClouds(p, rig, seed, BUNT_Y, HOR);
  sunDisc(p, rig);

  // far ridge line, hazed
  const rn = fbm(seed + 61, 4);
  const farTop = (x) => 120 + Math.round(Math.sin(x * 0.013 + 1.2) * 12 + rn(x * 0.02, 3) * 22);
  p.fn(0, 96, NATIVE.w, HOR - 96, (x, y) => {
    const top = farTop(x); if (y < top) return null;
    return rampAt(R.slate, clamp((0.20 + (y - top) / 90 * 0.18) * (0.45 + rig.amb * 0.55), 0, 1), x, y);
  });
  for (let x = 0; x < NATIVE.w; x++) { const t = farTop(x); p.px(x, t, P.sl5, 0.35 * rig.amb); p.px(x, t + 1, P.sl4, 0.18); }

  // the near massif, right — lit on the sun side, deep cool shadow away from it
  const mn = fbm(seed + 67, 5);
  const PK = 336, PW = 210, PH = 118;
  const peakTop = (x) => {
    const u = (x - PK) / (PW / 2);
    if (Math.abs(u) > 1) return null;
    const ridge = 1 - Math.abs(u);
    return Math.round(HOR - PH * Math.pow(ridge, 0.78) + (mn(x * 0.05, 7) - 0.5) * 9);
  };
  p.fn(PK - PW / 2, HOR - PH - 12, PW + 1, PH + 14, (x, y) => {
    const top = peakTop(x); if (top === null || y < top) return null;
    const u = (x - PK) / (PW / 2);
    const d = (y - top) / Math.max(6, HOR - top);
    let t = 0.20 + Math.pow(clamp(u * 0.5 + 0.5, 0, 1), 1.3) * 0.52;   // sun is right
    t += (mn(x * 0.06, y * 0.09) - 0.5) * 0.30;
    t -= d * 0.14;
    return rampAt(R.slate, clamp(t * (0.42 + rig.amb * 0.58), 0, 1), x, y);
  });
  // snowcap + a lit rim along the sunward arete
  for (let x = PK - PW / 2; x <= PK + PW / 2; x++) {
    const top = peakTop(x); if (top === null) continue;
    const u = (x - PK) / (PW / 2);
    p.px(x, top, u > -0.15 ? '#ffe6bc' : P.sl5, u > -0.15 ? 0.85 * rig.amb + 0.15 : 0.4);
    p.px(x, top + 1, u > -0.15 ? shade(rig.sunCol, 0.2) : P.sl4, 0.35);
    if (Math.abs(u) < 0.46) {
      const depth = Math.round((0.46 - Math.abs(u)) * 34 + mn(x * 0.12, 21) * 6);
      for (let j = 0; j < depth; j++) {
        const t = 0.62 + (mn(x * 0.2, j * 0.4) - 0.5) * 0.45 - j * 0.012 + (u > 0 ? 0.14 : -0.06);
        p.px(x, top + j, rampAt(['#5e6b7e', '#8794a4', '#b3bec9', '#d8dfe2', '#f2f2e8', '#fffdf4'], clamp(t, 0, 1), x, top + j), 0.92);
      }
    }
  }
  // couloirs raking down the face
  for (let c = 0; c < 7; c++) {
    const cx0 = PK - PW / 2 + 18 + c * 28;
    for (let j = 0; j < 90; j++) {
      const x = Math.round(cx0 + j * (c % 2 ? 0.22 : -0.18) + Math.sin(j * 0.14 + c) * 2);
      const top = peakTop(x); if (top === null) continue;
      const y = top + 8 + j;
      if (y > HOR) break;
      p.mul(x, y, '#1c2740', 0.30); p.px(x + 1, y, P.sl5, 0.12);
    }
  }

  // the funicular: a cable up the massif's left flank with a car on it
  (() => {
    const f0x = PK - PW * 0.44, f0y = HOR - 4, f1x = PK - PW * 0.07, f1y = HOR - PH * 0.86;
    for (let t = 0; t <= 1.0001; t += 0.01) {
      const x = Math.round(lerp(f0x, f1x, t)), y = Math.round(lerp(f0y, f1y, t));
      p.px(x, y, '#241f1a', 0.9); p.px(x, y - 1, '#7d7466', 0.35);
    }
    for (let k = 0; k <= 6; k++) {
      const t = k / 6, x = Math.round(lerp(f0x, f1x, t)), y = Math.round(lerp(f0y, f1y, t));
      p.vline(x, y, y + 7, P.wd2, 0.85); p.px(x + 1, y + 3, P.wd4, 0.4);
      p.hline(x - 2, x + 2, y + 7, P.wd1, 0.6);
    }
    const ct = 0.52, cx = Math.round(lerp(f0x, f1x, ct)), cy = Math.round(lerp(f0y, f1y, ct));
    p.fn(cx - 5, cy - 6, 11, 7, (x, y, i, j) => rampAt(R.rust, clamp(0.28 + (i / 11) * 0.44 - j * 0.03, 0, 1), x, y));
    p.hline(cx - 5, cx + 5, cy - 6, P.rd4, 0.8); p.hline(cx - 5, cx + 5, cy, P.rd0, 0.8);
    for (let wI = 0; wI < 3; wI++) {
      p.px(cx - 3 + wI * 3, cy - 4, rig.lamps > 0.25 ? '#ffd58c' : '#9a9070', 0.95);
      p.px(cx - 3 + wI * 3, cy - 3, rig.lamps > 0.25 ? '#ffc06a' : '#8a8266', 0.8);
      if (rig.lamps > 0.05) p.glow(cx - 3 + wI * 3, cy - 4, 7, '#ffc878', 0.30 * rig.lamps, 2.2);
    }
    p.vline(cx, cy - 9, cy - 6, '#3a332a');
    // the upper station, perched
    const sx = Math.round(f1x), sy = Math.round(f1y);
    p.fn(sx - 9, sy - 11, 19, 12, (x, y, i, j) => rampAt(R.paper, clamp((0.26 + (i / 19) * 0.44 - j * 0.014) * (0.5 + rig.amb * 0.5), 0, 1), x, y));
    for (let j = 0; j < 6; j++) { const rw = Math.round(12 * (j / 6)); p.hline(sx - rw, sx + rw, sy - 17 + j, rampAt(R.teal, clamp(0.28 + (j / 6) * 0.32, 0, 1), sx, sy - 17 + j)); }
    p.hline(sx - 12, sx + 12, sy - 11, P.tl0, 0.85);
    p.frect(sx - 5, sy - 8, 4, 5, rig.lamps > 0.25 ? '#ffcb7d' : '#948c6c', 0.9);
    p.frect(sx + 2, sy - 8, 4, 5, rig.lamps > 0.25 ? '#ffcb7d' : '#948c6c', 0.9);
    if (rig.lamps > 0.05) p.glow(sx, sy - 6, 16, '#ffbe6c', 0.30 * rig.lamps, 2.2);
    p.vline(sx, sy - 24, sy - 17, P.gd2); p.fpoly([[sx + 1, sy - 24], [sx + 9, sy - 22], [sx + 1, sy - 20]], P.rd2);
  })();

  const vn = fbm(seed + 73, 4);
  const CINDER = ['#181616', '#2a2422', '#3e3430', '#544842', '#6d5f55', '#8b7c6c'];
  // the valley floor: cinder and ash, not sand
  groundBand(p, rig, seed, ['#312a26', '#463c34', '#5e5044', '#786754', '#948068', '#b09a80'], { base: 0.42 });
  for (let y = HOR; y < FLOOR; y++) {
    const v = (y - HOR) / (FLOOR - HOR);
    for (let x = 0; x < NATIVE.w; x++) {
      const a = vn(x * (0.03 + v * 0.08), y * (0.06 + v * 0.1));
      if (a > 0.52) p.mul(x, y, '#241c16', clamp((a - 0.52) * 1.5, 0, 0.40));
    }
  }
  // SPOIL TIPS — angular cinder cones set BEHIND the road against the hillside, with
  // scree raking down them. (Round grey domes standing in the road read as parasols;
  // a tip is a sharp cone of burnt waste, and it belongs upslope.)
  for (const [hx, hy, hw, hh] of [[242, HOR + 17, 19, 36], [284, HOR + 21, 13, 25], [206, HOR + 14, 11, 21]]) {
    for (let x = -hw; x <= hw; x++) {
      const u = x / hw;
      const top = Math.round(hy - hh * (1 - Math.abs(u)) - vn((hx + x) * 0.09, 5) * 3);
      for (let y = top; y <= hy; y++) {
        const d = (y - top) / Math.max(1, hy - top);
        let t = 0.06 + (u * 0.5 + 0.5) * 0.26 - d * 0.06;              // sun on the right
        t += (vn((hx + x) * 0.16, y * 0.26) - 0.5) * 0.26;
        p.px(hx + x, y, rampAt(CINDER, clamp(t * (0.5 + rig.amb * 0.5), 0, 1), hx + x, y));
      }
      if (u > 0.15) p.px(hx + x, top, shade(rig.sunCol, -0.55), 0.30);
    }
    for (let s = 0; s <= 8; s++) {
      const sx0 = hx - hw + 3 + s * ((hw * 2 - 6) / 8);
      for (let j = 0; j < hh; j++) {
        const x = Math.round(sx0 + (sx0 - hx) * (j / hh) * 0.55);
        const y = Math.round(hy - hh * (1 - Math.abs((sx0 - hx) / hw)) + j);
        if (y > hy) break;
        p.mul(x, y, '#100c0a', 0.24); p.px(x + 1, y, '#7b6c5e', 0.14);
      }
    }
    { const sr = rng(seed + hx * 3);          // the tip spills onto the floor
      for (let k = 0; k < hw * 5; k++) {
        const sx = Math.round(hx + (sr() - 0.5) * hw * 2.6);
        const sy = Math.round(hy + sr() * sr() * 5);
        p.px(sx, sy, rampAt(CINDER, clamp(0.10 + sr() * 0.26, 0, 1), sx, sy), 0.85);
      } }
    if (rig.lamps > 0.3) {                    // waste still cooling in the dark
      const er = rng(seed + hx);
      for (let e = 0; e < 5; e++) {
        const ex = Math.round(hx + (er() - 0.5) * hw * 1.5), ey = Math.round(hy - er() * hh * 0.6);
        p.px(ex, ey, '#ff8a3a', 0.8); p.glow(ex, ey, 5, '#ff7a2e', 0.35 * rig.lamps, 2);
      }
    }
  }

  // rail spurs — sleepers first, then two rails, so the track reads as track
  for (let r = 0; r < 3; r++) {
    const ry = HOR + 32 + r * 20, gauge = 3 + r;
    for (let x = 0; x < NATIVE.w; x += 6 + r) {
      p.hline(x, x + 3 + r, ry + 1, P.wd1, 0.55);
      p.hline(x, x + 3 + r, ry + 2, '#2c1d10', 0.35);
    }
    for (const off of [0, gauge]) for (let x = 0; x < NATIVE.w; x++) {
      p.px(x, ry - off, '#8d8477', 0.75); p.px(x, ry - off + 1, '#3a342c', 0.5);
    }
  }

  // the ironworks: sheds, a trestle, the smokestack, and the FURNACE
  (() => {
    // the long shed
    const x0 = 18, x1 = 176, ry = HOR + 34, wallTop = HOR - 22;
    p.castShadow(x0, x1, ry, -30, 8, 0.34 * rig.amb);
    p.fn(x0, wallTop, x1 - x0, ry - wallTop, (x, y, i, j) => {
      const u = i / (x1 - x0);
      const t = (0.30 + u * 0.30 + (vn(x * 0.07, y * 0.15) - 0.5) * 0.22 - Math.pow(j / (ry - wallTop), 2) * 0.10) * (0.45 + rig.amb * 0.55);
      return rampAt(R.iron, clamp(t, 0, 1), x, y);
    });
    for (let b = x0; b < x1; b += 6) { p.vline(b, wallTop, ry - 1, '#15171c', 0.5); p.vline(b + 1, wallTop, ry - 1, '#8a8fa0', 0.16); }
    // a sawtooth roof — the industrial read
    for (let s = 0; s < 7; s++) {
      const sx = x0 + s * 23;
      p.fpoly([[sx, wallTop], [sx + 12, wallTop - 13], [sx + 23, wallTop - 13], [sx + 23, wallTop]], '#2b2f38');
      for (let g = 0; g < 5; g++) {
        p.px(sx + 14 + g * 2, wallTop - 11, rig.lamps > 0.2 ? '#ffc06a' : '#7c8496', 0.9);
        p.px(sx + 14 + g * 2, wallTop - 9, rig.lamps > 0.2 ? '#ff9e4a' : '#6c7386', 0.8);
      }
      if (rig.lamps > 0.05) p.glow(sx + 17, wallTop - 10, 14, '#ffa64e', 0.24 * rig.lamps, 2.2);
      p.line(sx + 12, wallTop - 13, sx + 23, wallTop - 13, '#6d7484', 0.7);
      p.line(sx, wallTop, sx + 12, wallTop - 13, '#4a5060', 0.8);
    }
    // the smokestack
    const stx = 44, stb = wallTop + 4, sth = 96;
    p.castShadow(stx - 6, stx + 6, HOR + 30, -40, 6, 0.30 * rig.amb);
    for (let y = stb - sth; y <= stb; y++) {
      const f = (y - (stb - sth)) / sth;
      const hw = Math.round(lerp(4, 7, f));
      for (let i = -hw; i <= hw; i++) {
        const u = (i + hw) / (2 * hw);
        let t = 0.18 + Math.pow(u, 1.2) * 0.46 + (vn((stx + i) * 0.2, y * 0.12) - 0.5) * 0.16;
        if (Math.abs(i) >= hw - 1) t -= 0.14;
        p.px(stx + i, y, rampAt(R.iron, clamp(t * (0.45 + rig.amb * 0.55), 0, 1), stx + i, y));
      }
      if ((y - (stb - sth)) % 11 === 0) { p.hline(stx - hw, stx + hw, y, '#9aa0b0', 0.22); p.hline(stx - hw, stx + hw, y + 1, '#0f1116', 0.30); }
    }
    p.hline(stx - 8, stx + 8, stb - sth, '#a8aebd', 0.7);
    p.frect(stx - 8, stb - sth - 3, 17, 3, '#3a3f4b');
    // the plume, uplit by the furnace beneath it
    const pn = fbm(seed + 79, 4);
    for (let j = 0; j < 78; j++) {
      const t = j / 78;
      const cx = stx + 6 + j * 0.72 + Math.sin(j * 0.09) * 5;
      const w = 5 + t * 22;
      const cy = stb - sth - 4 - j;
      if (cy < BUNT_Y) break;
      for (let i = -w; i <= w; i++) {
        const q = 1 - Math.abs(i) / w;
        const n = pn((cx + i) * 0.05, cy * 0.05);
        const dens = q * (0.55 + n * 0.7) * (1 - t * 0.72);
        if (dens < 0.10) continue;
        p.px(Math.round(cx + i), cy, rampAt(['#2a2b33', '#3d3d47', '#55535c', '#6f6a70', '#8c8386'], clamp(dens * 1.1, 0, 1), Math.round(cx + i), cy), clamp(dens * 0.85, 0, 0.9));
        // the furnace uplight dies out with height — this is the locale's signature
        if (t < 0.42) p.add(Math.round(cx + i), cy, '#ff7a2e', 0.30 * (1 - t / 0.42) * dens);
      }
    }
    // THE ORE TRESTLE — raised clear of the shed roof so its lattice reads as a
    // silhouette against the sky, running from the works out to the spoil tips.
    const ty = HOR - 14;
    for (let x = 60; x < 258; x++) {
      const y = Math.round(ty - (x - 60) * 0.035);
      p.px(x, y - 2, '#a4aab8', 0.45);                               // top chord, sunlit
      p.px(x, y - 1, rampAt(R.iron, 0.50, x, y));
      p.px(x, y, rampAt(R.iron, 0.34, x, y));
      p.px(x, y + 1, '#0f1116', 0.75);                               // deck shadow
      if (x % 4 === 0) p.px(x, y + 2, '#2b2f3a', 0.5);               // sleepers
    }
    // the lattice: alternating diagonals between top and bottom chord
    for (let x = 60; x < 258; x += 7) {
      const y = Math.round(ty - (x - 60) * 0.035);
      const dir = ((x / 7) | 0) % 2 ? 1 : -1;
      p.line(x, y + 1, x + 7, y + 7, '#20242e', 0.8);
      p.line(x + 7 * (dir > 0 ? 0 : 1), y + 1, x + 7 * (dir > 0 ? 1 : 0), y + 7, '#333947', 0.55);
      p.px(x, y + 7, '#20242e', 0.9);
    }
    for (let x = 60; x < 258; x++) {
      const y = Math.round(ty - (x - 60) * 0.035);
      p.px(x, y + 7, '#181c24', 0.75); p.px(x, y + 8, '#3a4150', 0.30);
    }
    // trestle legs down to the valley floor
    for (let k = 0; k < 6; k++) {
      const bx = 74 + k * 34, byTop = Math.round(ty - (bx - 60) * 0.035) + 8, byBot = HOR + 30;
      p.vline(bx, byTop, byBot, '#20242e', 0.92); p.vline(bx + 1, byTop, byBot, '#5a6070', 0.28);
      p.vline(bx + 11, byTop, byBot, '#20242e', 0.92); p.vline(bx + 12, byTop, byBot, '#5a6070', 0.24);
      for (let b = 0; b < 3; b++) {
        const y0 = byTop + b * ((byBot - byTop) / 3), y1 = byTop + (b + 1) * ((byBot - byTop) / 3);
        p.line(bx, y0, bx + 11, y1, '#2b2f3a', 0.7);
        p.line(bx + 11, y0, bx, y1, '#2b2f3a', 0.7);
      }
      p.hline(bx - 2, bx + 13, byBot, '#161a20', 0.8);
    }
    // an ore hopper riding the trestle, tipping into the near tip
    (() => {
      const hxp = 196, hy = Math.round(ty - (hxp - 60) * 0.035);
      p.fn(hxp - 11, hy - 13, 23, 11, (x, y, i, j) => rampAt(R.iron, clamp(0.24 + (i / 23) * 0.38 - j * 0.02, 0, 1), x, y));
      p.hline(hxp - 11, hxp + 11, hy - 13, '#a8aebd', 0.55);
      p.fpoly([[hxp - 9, hy - 2], [hxp + 9, hy - 2], [hxp + 4, hy + 3], [hxp - 4, hy + 3]], '#12151b');
      p.px(hxp - 12, hy - 9, '#5a6070'); p.px(hxp + 12, hy - 9, '#5a6070');
      if (rig.lamps > 0.25) { p.px(hxp + 8, hy - 10, '#ffc878', 0.9); p.glow(hxp + 8, hy - 10, 8, '#ffb054', 0.32 * rig.lamps, 2); }
    })();

    // ---- THE FURNACE: the valley's second light source
    const fx = FURN_X, fy = FURN_Y;
    p.fn(fx - 30, fy - 30, 61, 32, (x, y, i, j) => rampAt(R.iron, clamp(0.20 + (i / 61) * 0.26 - j * 0.006 + (vn(x * 0.1, y * 0.15) - 0.5) * 0.2, 0, 1), x, y));
    p.hline(fx - 30, fx + 30, fy - 30, '#8a90a0', 0.4);
    // THE MOUTH — a tall round-headed arch set in masonry, not a glowing ball. The
    // brickwork around it is lit by what is inside it, which is the whole point.
    const FIRE = ['#3a1206', '#7c2408', '#c04a10', '#f0842a', '#ffc064', '#fff0c0'];
    const mw = 11, mh = 26, mb = fy + 2, mt = mb - mh;
    for (let j = 0; j < mh; j++) {
      const y = mt + j;
      const arch = j < mw ? Math.round(Math.sqrt(Math.max(0, mw * mw - (mw - j) * (mw - j)))) : mw;
      for (let i = -arch; i <= arch; i++) {
        // hotter toward the middle and the floor of the hearth
        const q = (1 - Math.abs(i) / (arch + 0.001) * 0.72) * (0.42 + (j / mh) * 0.72);
        p.px(fx + i, y, rampAt(FIRE, clamp(q * 1.15, 0, 1), fx + i, y));
      }
      // the voussoirs of the arch ring, lit from within
      if (j < mw) {
        for (const s of [-1, 1]) {
          const xr = fx + s * (arch + 1);
          p.px(xr, y, rampAt(['#2a2220', '#5a4438', '#8a6248', '#b8815a'], clamp(1 - j / mw, 0, 1), xr, y), 0.95);
          p.px(xr + s, y, rampAt(['#201a18', '#40332c', '#66493a'], clamp(1 - j / mw, 0, 1), xr + s, y), 0.8);
        }
      } else {
        p.px(fx - arch - 1, y, '#4a382e', 0.9); p.px(fx + arch + 1, y, '#4a382e', 0.9);
        p.px(fx - arch - 2, y, '#2c231e', 0.7); p.px(fx + arch + 2, y, '#2c231e', 0.7);
      }
    }
    // the hearth lip + a sill of spilled slag
    p.hline(fx - mw - 2, fx + mw + 2, mb + 1, '#1a1512', 0.9);
    for (let i = -mw - 4; i <= mw + 4; i++) {
      const t = 1 - Math.abs(i) / (mw + 4);
      p.px(fx + i, mb + 2, rampAt(['#2a1a10', '#6b3010', '#b8541c', '#f0842a'], clamp(t * 0.9, 0, 1), fx + i, mb + 2), 0.9);
      p.add(fx + i, mb + 3, '#ff7a2e', 0.35 * t);
    }
    p.glow(fx, fy - 10, 76, '#ff7a2e', 0.46 * Math.max(0.55, rig.lamps), 2.4);
    p.glow(fx, fy - 10, 30, '#ffb054', 0.55 * Math.max(0.55, rig.lamps), 2.0);
    p.pool(fx, fy + 6, 84, 22, '#ff8a3a', 0.30 * Math.max(0.5, rig.lamps), 1.6);
    // it uplights the shed wall and the trestle above it
    p.wash(fx - 70, HOR - 30, 150, 70, '#ff8030', 0.26 * Math.max(0.5, rig.lamps), (i, j, w, h) => {
      const dx = (i - 70) / 74, dy = 1 - j / h;
      return clamp((1 - Math.abs(dx)) * dy, 0, 1);
    }, 0);
    // ladle track + a pouring ladle throwing sparks
    p.hline(fx + 18, fx + 74, fy - 2, '#4a4238', 0.7); p.hline(fx + 18, fx + 74, fy - 1, '#79705f', 0.3);
    p.fn(fx + 44, fy - 16, 15, 12, (x, y, i, j) => rampAt(R.iron, clamp(0.22 + (i / 15) * 0.3 - j * 0.01, 0, 1), x, y));
    p.fellipse(fx + 51, fy - 16, 8, 3, '#ffb054');
    p.glow(fx + 51, fy - 15, 20, '#ff9038', 0.42 * Math.max(0.5, rig.lamps), 2.2);
    const sp = rng(seed + 137);
    for (let k = 0; k < 46; k++) {
      const a = -0.6 - sp() * 1.5, d = sp() * 26;
      const sxp = Math.round(fx + 51 + Math.cos(a) * d), syp = Math.round(fy - 16 + Math.sin(a) * d * 0.7);
      p.px(sxp, syp, sp() < 0.5 ? '#ffd88a' : '#ff9a40', 0.9);
      p.add(sxp, syp, '#ff9a40', 0.5);
    }
    // workers silhouetted against the mouth — the scale cue that sells the furnace
    figure(p, fx - 22, fy + 8, 15, '#ffb066', 1, 0);
    figure(p, fx + 20, fy + 10, 16, '#ffb066', -1, 2);
    figure(p, fx + 34, fy + 14, 17, '#ffb066', -1, 0);
  })();

  // pit-head lamps along the valley road
  lampPost(p, 214, HOR + 44, 30, '#ffc060', 1.0, Math.max(0.35, rig.lamps));
  lampPost(p, 300, HOR + 56, 34, '#ffc060', 1.1, Math.max(0.35, rig.lamps));
  lampPost(p, 404, HOR + 68, 38, '#ffc060', 1.2, Math.max(0.35, rig.lamps));
  const cr = rng(seed + 91);
  for (const s of [[248, HOR + 40, 14], [262, HOR + 44, 15], [332, HOR + 58, 17], [352, HOR + 62, 18], [190, HOR + 34, 13]])
    figure(p, s[0], s[1], s[2], '#ffc888', -1, (cr() * 3) | 0);
}

// ---------------------------------------------------------------- the final grade
function grade(p, rig, seed) {
  p.wash(0, BUNT_Y, NATIVE.w, GROUND - BUNT_Y, rig.warmCol, rig.warmAmt, (i, j, w, h) => {
    const d = Math.sqrt(Math.pow((i - rig.sunX) / 320, 2) + Math.pow((BUNT_Y + j - rig.sunY) / 260, 2));
    return Math.max(0, 1 - d);
  }, 0);
  p.wash(0, BUNT_Y, NATIVE.w, GROUND - BUNT_Y, rig.coolCol, rig.coolAmt, (i, j, w, h) => {
    const away = rig.sunX > NATIVE.w / 2 ? clamp((NATIVE.w * 0.45 - i) / 260, 0, 1) : clamp((i - NATIVE.w * 0.42) / 280, 0, 1);
    return away * clamp((j - 30) / 150, 0, 1);
  }, 0);
  p.vignette(rig.vig, '#2a1c0e');
  p.paper(seed + 101, 0.25, BUNT_Y, GROUND);
}

// ---------------------------------------------------------------- public API
const CACHE = new Map();
const CACHE_MAX = 10;

export function vistaKey(locale, stageKey, seed) { return `${locale}|${stageKey}|${seed >>> 0}`; }

// Paint a locale backdrop into `p` (rows 0..GROUND). Cached per (locale, stage, seed)
// since it is entirely static — the per-frame cost is one typed-array copy.
export function paintVista(p, { locale = 1, stage = 1, seed = 1 } = {}) {
  const key = vistaKey(locale, stage, seed);
  const hit = CACHE.get(key);
  if (hit && hit.length === p.d.length) { p.d.set(hit); return p; }

  const rig = rigFor(locale, stage);
  p.clear(rig.skyRamp[0]);
  if (locale === 2) paintPier(p, rig, seed >>> 0);
  else if (locale === 3) paintIronworks(p, rig, seed >>> 0);
  else paintMidway(p, rig, seed >>> 0);
  grade(p, rig, seed >>> 0);

  if (CACHE.size >= CACHE_MAX) CACHE.delete(CACHE.next ? CACHE.next : CACHE.keys().next().value);
  CACHE.set(key, p.snapshot());
  return p;
}

export function clearVistaCache() { CACHE.clear(); }
export function vistaCacheSize() { return CACHE.size; }
export { rigFor };

// Render a standalone vista into a fresh painter (used by the title card and by
// before/after proof tooling).
export function renderVista(opts) {
  const p = new Painter(NATIVE.w, NATIVE.h);
  return paintVista(p, opts);
}
