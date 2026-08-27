// px.js — the native-resolution art rasterizer plus the display-resolution type layer.

import { DISPLAY_FONT_FAMILY, BODY_FONT_FAMILY } from './fontData.js';
//
// POPINJAY renders at a native 480x300 pixel buffer and presents it to the logical
// VIEW (1280x800) nearest-neighbor. 480x300 is exactly VIEW x 0.375 in BOTH axes, so
// world->native is a single uniform scale and no sim coordinate is ever touched.
//
// The technique (CLAUDE.md rule 1 — code-generated art only, no assets):
//   - a Uint8ClampedArray RGBA buffer drawn one pixel at a time
//   - px()   normal paint
//   - add()  ADDITIVE light — lamps, glows, beams, glare. This is what makes a scene
//            read as LIT at a time of day rather than filled with flat colour.
//   - mul()  MULTIPLY — cast shadow, grime, haze, vignette.
//   - rampAt() indexes a dark->light colour ramp through an 8x8 bayer matrix, so every
//            surface is DITHERED rather than banded, which is the lithograph tell.
// Every form is shaded by its own normal against the scene's light direction; nothing
// is a flat fill. That is the ratified bar (the 2026-08-10 PoC).
//
// Pure and environment-free at module scope: `node --test` can import this. The only
// browser touch is makeSurface(), which is called from a draw path that already holds
// a 2D context.

export const NATIVE = { w: 480, h: 300 };

// ---------------------------------------------------------------- math
export function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
export function lerp(a, b, t) { return a + (b - a) * t; }
export function smooth(t) { return t * t * (3 - 2 * t); }

// deterministic rng (mulberry32) — art seeds NEVER use Math.random (rule 6 spirit:
// the same stage always paints the same picture).
export function rng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
export function noise2(seed) {
  const perm = new Uint8Array(512); const r = rng(seed);
  for (let i = 0; i < 256; i++) perm[i] = i;
  for (let i = 255; i > 0; i--) { const j = (r() * (i + 1)) | 0; const t = perm[i]; perm[i] = perm[j]; perm[j] = t; }
  for (let i = 0; i < 256; i++) perm[i + 256] = perm[i];
  const grad = (h, x, y) => { switch (h & 3) { case 0: return x + y; case 1: return -x + y; case 2: return x - y; default: return -x - y; } };
  return function (x, y) {
    const X = Math.floor(x) & 255, Y = Math.floor(y) & 255;
    const xf = x - Math.floor(x), yf = y - Math.floor(y);
    const u = smooth(xf), v = smooth(yf);
    const aa = perm[perm[X] + Y], ab = perm[perm[X] + Y + 1];
    const ba = perm[perm[X + 1] + Y], bb = perm[perm[X + 1] + Y + 1];
    const x1 = lerp(grad(aa, xf, yf), grad(ba, xf - 1, yf), u);
    const x2 = lerp(grad(ab, xf, yf - 1), grad(bb, xf - 1, yf - 1), u);
    return (lerp(x1, x2, v) + 1) * 0.5;
  };
}
export function fbm(seed, oct = 4) {
  const n = noise2(seed);
  return function (x, y) {
    let s = 0, amp = 0.5, f = 1, tot = 0;
    for (let i = 0; i < oct; i++) { s += n(x * f, y * f) * amp; tot += amp; amp *= 0.5; f *= 2; }
    return s / tot;
  };
}

// ---------------------------------------------------------------- colour
const _cc = Object.create(null);
export function rgb(hex) { return [parseInt(hex.substr(1, 2), 16), parseInt(hex.substr(3, 2), 16), parseInt(hex.substr(5, 2), 16)]; }
export function C(c) { if (typeof c !== 'string') return c; let v = _cc[c]; if (!v) v = _cc[c] = rgb(c); return v; }
export function hex(r, g, b) {
  const f = (v) => { v = clamp(Math.round(v), 0, 255).toString(16); return v.length < 2 ? '0' + v : v; };
  return '#' + f(r) + f(g) + f(b);
}
export function mix(h1, h2, t) { const a = rgb(h1), b = rgb(h2); return hex(lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)); }
export function shade(h, t) { return t < 0 ? mix(h, '#000000', -t) : mix(h, '#ffffff', t); }

export const BAYER = (() => {
  const m = [0, 32, 8, 40, 2, 34, 10, 42, 48, 16, 56, 24, 50, 18, 58, 26, 12, 44, 4, 36, 14, 46, 6, 38,
    60, 28, 52, 20, 62, 30, 54, 22, 3, 35, 11, 43, 1, 33, 9, 41, 51, 19, 59, 27, 49, 17, 57, 25,
    15, 47, 7, 39, 13, 45, 5, 37, 63, 31, 55, 23, 61, 29, 53, 21];
  return m.map((v) => (v + 0.5) / 64);
})();
export function bay(x, y) { return BAYER[((y & 7) << 3) + (x & 7)]; }
export function rampAt(ramp, t, x, y) {
  if (!(t > 0)) return ramp[0];
  if (t >= 1) return ramp[ramp.length - 1];
  const v = t * (ramp.length - 1), i = Math.floor(v), f = v - i;
  if (i >= ramp.length - 1) return ramp[ramp.length - 1];
  return (f > bay(x, y)) ? ramp[i + 1] : ramp[i];
}

export function relLumRgb([r, g, b]) {
  const lin = (c) => {
    c /= 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

export function contrastRatio(fgHex, bgHex) {
  const l1 = relLumRgb(C(fgHex)), l2 = relLumRgb(C(bgHex));
  const hi = Math.max(l1, l2), lo = Math.min(l1, l2);
  return (hi + 0.05) / (lo + 0.05);
}

// Warm display headings: cream halo instead of an ink cast under rust (field-trial legibility).
export function paintWarmDisplayShadow(p, s, x, y, scale, alpha) {
  const a = alpha === undefined ? 1 : alpha;
  t5big(p, s, x, y + 1, scale, P.pa5, 0.78 * a);
  t5big(p, s, x, y, scale, P.wht, 0.20 * a);
}

export function paintCoolDisplayShadow(p, s, x, y, scale, alpha) {
  const a = alpha === undefined ? 1 : alpha;
  t5big(p, s, x + 1, y + 2, scale, '#14100c', 0.55 * a);
}

export function sampleDisplayRamp(ramp, px, py, u, v) {
  const warm = ramp === R.rust;
  const t = warm
    ? 0.70 - v * 0.18 + (v < 0.12 ? 0.26 : 0)
    : 0.64 - v * 0.26 + (v < 0.18 ? 0.26 : 0);
  return rampAt(ramp, clamp(t, 0, 1), px, py);
}

function warmTextCol(col) {
  const [r, g, b] = C(col);
  return r > 110 && r > g * 1.22 && r > b * 1.30 && g < 190;
}

// ---------------------------------------------------------------- the palette
// Grounded in the game's committed GAME_PAL (cream / teal / rust / gold / ground /
// wood / ink), each hue extended into a 6-step ramp so it can be LIT rather than
// filled. ONE family across every locale — that is what stops cross-scene seams.
export const P = {
  pa0: '#5f4c2c', pa1: '#8b7248', pa2: '#b89563', pa3: '#d8bd8a', pa4: '#f2e4c4', pa5: '#fdf6e4',
  tl0: '#0e2b2a', tl1: '#1a4643', tl2: '#2f6d6a', tl3: '#4b938b', tl4: '#7cb8ad', tl5: '#b6ded3',
  rd0: '#37130c', rd1: '#6a2317', rd2: '#b0432f', rd3: '#d16a4a', rd4: '#e79877', rd5: '#f6cbb0',
  gd0: '#3b2907', gd1: '#6e4c12', gd2: '#a87823', gd3: '#c8912f', gd4: '#e7c76b', gd5: '#fbeab0',
  sl0: '#0f151d', sl1: '#1f2c3b', sl2: '#36475d', sl3: '#556c87', sl4: '#8198b2', sl5: '#b8c8d8',
  wd0: '#22130a', wd1: '#452710', wd2: '#6b3e1c', wd3: '#8a5a33', wd4: '#af7e4f', wd5: '#cfa678',
  ol0: '#232a15', ol1: '#3e4823', ol2: '#606a35', ol3: '#87904f', ol4: '#adb375', ol5: '#d2d3a4',
  pu0: '#1d1030', pu1: '#341c54', pu2: '#553285', pu3: '#8a4b9c', pu4: '#b47fc4', pu5: '#ddbfe6',
  ink: '#2a2622', ink0: '#151210', wht: '#fff7e6',
};
// Body accent on cream paper — rd1 reads cleanly; rd2 + an ink cast shadow muddies.
export const ACCENT_RED = P.rd1;

export const R = {
  paper: [P.pa0, P.pa1, P.pa2, P.pa3, P.pa4, P.pa5],
  teal: [P.tl0, P.tl1, P.tl2, P.tl3, P.tl4, P.tl5],
  rust: [P.rd0, P.rd1, P.rd2, P.rd3, P.rd4, P.rd5],
  gold: [P.gd0, P.gd1, P.gd2, P.gd3, P.gd4, P.gd5],
  slate: [P.sl0, P.sl1, P.sl2, P.sl3, P.sl4, P.sl5],
  wood: [P.wd0, P.wd1, P.wd2, P.wd3, P.wd4, P.wd5],
  olive: [P.ol0, P.ol1, P.ol2, P.ol3, P.ol4, P.ol5],
  plum: [P.pu0, P.pu1, P.pu2, P.pu3, P.pu4, P.pu5],
  stone: ['#4a4034', '#6d5f4a', '#948366', '#bda78a', '#ddcaab', '#f1e3c8'],
  iron: ['#141519', '#24262d', '#3a3d47', '#565a68', '#7b8091', '#a9aebd'],
};
// A ramp built around any hex — used for balloon classes so a gameplay tint keeps
// its identity while still being shaded rather than flat.
export function rampOf(hexCol) {
  return [shade(hexCol, -0.62), shade(hexCol, -0.38), hexCol, shade(hexCol, 0.18), shade(hexCol, 0.42), shade(hexCol, 0.7)];
}

// ---------------------------------------------------------------- the painter
export function Painter(w, h) { this.w = w; this.h = h; this.d = new Uint8ClampedArray(w * h * 4); }

Painter.prototype.clear = function (col) {
  const c = C(col), d = this.d;
  for (let i = 0; i < d.length; i += 4) { d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = 255; }
  return this;
};
Painter.prototype.restoreFrom = function (src) { this.d.set(src); return this; };
Painter.prototype.snapshot = function () { return this.d.slice(); };

Painter.prototype.px = function (x, y, col, a) {
  x |= 0; y |= 0;
  if (x < 0 || y < 0 || x >= this.w || y >= this.h || col == null) return this;
  const c = C(col), i = (y * this.w + x) * 4, d = this.d;
  if (a === undefined || a >= 1) { d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = 255; }
  else if (a > 0) { d[i] = c[0] * a + d[i] * (1 - a); d[i + 1] = c[1] * a + d[i + 1] * (1 - a); d[i + 2] = c[2] * a + d[i + 2] * (1 - a); d[i + 3] = 255; }
  return this;
};
// ADDITIVE light. Guards a non-finite alpha: Uint8ClampedArray clamps NaN to 0, which
// would silently paint a BLACK line (this bit the PoC once — never again).
Painter.prototype.add = function (x, y, col, a) {
  x |= 0; y |= 0;
  if (x < 0 || y < 0 || x >= this.w || y >= this.h) return this;
  if (!(a > 0)) return this;
  const c = C(col), i = (y * this.w + x) * 4, d = this.d;
  d[i] += c[0] * a; d[i + 1] += c[1] * a; d[i + 2] += c[2] * a; d[i + 3] = 255;
  return this;
};
Painter.prototype.mul = function (x, y, col, a) {
  x |= 0; y |= 0;
  if (x < 0 || y < 0 || x >= this.w || y >= this.h) return this;
  if (!(a > 0)) return this;
  const c = C(col), i = (y * this.w + x) * 4, d = this.d;
  d[i] = d[i] * (1 - a + a * c[0] / 255); d[i + 1] = d[i + 1] * (1 - a + a * c[1] / 255); d[i + 2] = d[i + 2] * (1 - a + a * c[2] / 255);
  return this;
};
Painter.prototype.get = function (x, y) {
  x |= 0; y |= 0;
  if (x < 0 || y < 0 || x >= this.w || y >= this.h) return [0, 0, 0, 0];
  const i = (y * this.w + x) * 4, d = this.d;
  return [d[i], d[i + 1], d[i + 2], d[i + 3]];
};

Painter.prototype.hline = function (x0, x1, y, col, a) { if (x1 < x0) { const t = x0; x0 = x1; x1 = t; } for (let x = x0; x <= x1; x++) this.px(x, y, col, a); return this; };
Painter.prototype.vline = function (x, y0, y1, col, a) { if (y1 < y0) { const t = y0; y0 = y1; y1 = t; } for (let y = y0; y <= y1; y++) this.px(x, y, col, a); return this; };
Painter.prototype.frect = function (x, y, w, h, col, a) { for (let j = 0; j < h; j++) this.hline(x, x + w - 1, y + j, col, a); return this; };
Painter.prototype.rect = function (x, y, w, h, col, a) {
  this.hline(x, x + w - 1, y, col, a); this.hline(x, x + w - 1, y + h - 1, col, a);
  this.vline(x, y, y + h - 1, col, a); this.vline(x + w - 1, y, y + h - 1, col, a); return this;
};
Painter.prototype.line = function (x0, y0, x1, y1, col, a) {
  x0 |= 0; y0 |= 0; x1 |= 0; y1 |= 0;
  let dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1, dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1, err = dx + dy;
  for (; ;) {
    this.px(x0, y0, col, a);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
  return this;
};
Painter.prototype.tline = function (x0, y0, x1, y1, wd, col, a) {
  const dx = x1 - x0, dy = y1 - y0, len = Math.max(1, Math.sqrt(dx * dx + dy * dy));
  const nx = -dy / len, ny = dx / len, half = (wd - 1) / 2;
  for (let o = -half; o <= half; o += 0.5) this.line(Math.round(x0 + nx * o), Math.round(y0 + ny * o), Math.round(x1 + nx * o), Math.round(y1 + ny * o), col, a);
  return this;
};
Painter.prototype.fcircle = function (cx, cy, r, col, a) {
  const r2 = r * r;
  for (let y = -r; y <= r; y++) { const xs = Math.floor(Math.sqrt(Math.max(0, r2 - y * y))); this.hline(cx - xs, cx + xs, cy + y, col, a); }
  return this;
};
Painter.prototype.circle = function (cx, cy, r, col, a) {
  let x = r, y = 0, err = 1 - r; const s = this;
  const p8 = (x, y) => {
    s.px(cx + x, cy + y, col, a); s.px(cx + y, cy + x, col, a); s.px(cx - y, cy + x, col, a); s.px(cx - x, cy + y, col, a);
    s.px(cx - x, cy - y, col, a); s.px(cx - y, cy - x, col, a); s.px(cx + y, cy - x, col, a); s.px(cx + x, cy - y, col, a);
  };
  while (x >= y) { p8(x, y); y++; if (err < 0) err += 2 * y + 1; else { x--; err += 2 * (y - x) + 1; } }
  return this;
};
Painter.prototype.fellipse = function (cx, cy, rx, ry, col, a) {
  for (let y = -ry; y <= ry; y++) { const t = 1 - (y * y) / (ry * ry); if (t < 0) continue; const xs = Math.floor(rx * Math.sqrt(t)); this.hline(cx - xs, cx + xs, cy + y, col, a); }
  return this;
};
Painter.prototype.ellipse = function (cx, cy, rx, ry, col, a) {
  let prev = -1;
  for (let y = -ry; y <= ry; y++) {
    const t = 1 - (y * y) / (ry * ry); const xs = t < 0 ? 0 : Math.floor(rx * Math.sqrt(t));
    if (prev < 0 || Math.abs(xs - prev) <= 1) { this.px(cx - xs, cy + y, col, a); this.px(cx + xs, cy + y, col, a); }
    else { this.hline(cx - prev, cx - xs, cy + y, col, a); this.hline(cx + xs, cx + prev, cy + y, col, a); }
    prev = xs;
  }
  return this;
};
// op: 'px' | 'mul' | 'add'
Painter.prototype.fpoly = function (pts, col, a, op) {
  op = op || 'px';
  let minY = 1e9, maxY = -1e9;
  for (let i = 0; i < pts.length; i++) { if (pts[i][1] < minY) minY = pts[i][1]; if (pts[i][1] > maxY) maxY = pts[i][1]; }
  minY = Math.max(0, Math.floor(minY)); maxY = Math.min(this.h - 1, Math.ceil(maxY));
  for (let y = minY; y <= maxY; y++) {
    const xs = [];
    for (let i = 0; i < pts.length; i++) {
      const p1 = pts[i], p2 = pts[(i + 1) % pts.length], y1 = p1[1], y2 = p2[1];
      if ((y + 0.5 >= y1 && y + 0.5 < y2) || (y + 0.5 >= y2 && y + 0.5 < y1)) xs.push(p1[0] + (y + 0.5 - y1) / (y2 - y1) * (p2[0] - p1[0]));
    }
    xs.sort((m, n) => m - n);
    for (let i = 0; i + 1 < xs.length; i += 2) {
      const xa = Math.round(xs[i]), xb = Math.round(xs[i + 1] - 0.5);
      for (let x = xa; x <= xb; x++) {
        if (op === 'mul') this.mul(x, y, col, a); else if (op === 'add') this.add(x, y, col, a); else this.px(x, y, col, a);
      }
    }
  }
  return this;
};
Painter.prototype.poly = function (pts, col, a) {
  for (let i = 0; i < pts.length; i++) { const p1 = pts[i], p2 = pts[(i + 1) % pts.length]; this.line(p1[0], p1[1], p2[0], p2[1], col, a); }
  return this;
};
Painter.prototype.fn = function (x, y, w, h, f) {
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { const c = f(x + i, y + j, i, j); if (c) this.px(x + i, y + j, c); }
  return this;
};
Painter.prototype.grad = function (x, y, w, h, ramp, t0, t1, warp) {
  t0 = t0 === undefined ? 0 : t0; t1 = t1 === undefined ? 1 : t1;
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    let t = j / Math.max(1, h - 1);
    if (warp) t = clamp(t + warp(x + i, y + j), 0, 1);
    this.px(x + i, y + j, rampAt(ramp, lerp(t0, t1, t), x + i, y + j));
  }
  return this;
};
Painter.prototype.glow = function (cx, cy, r, col, strength, pow) {
  pow = pow || 2;
  for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) {
    const d = Math.sqrt(i * i + j * j); if (d > r) continue;
    const v = Math.pow(1 - d / r, pow) * strength;
    if (v < 0.06 && v * 12 < bay(cx + i, cy + j)) continue;
    this.add(cx + i, cy + j, col, v);
  }
  return this;
};
Painter.prototype.pool = function (cx, cy, rx, ry, col, strength, pow) {
  pow = pow || 2;
  for (let j = -ry; j <= ry; j++) for (let i = -rx; i <= rx; i++) {
    const d = Math.sqrt((i / rx) * (i / rx) + (j / ry) * (j / ry)); if (d > 1) continue;
    const v = Math.pow(1 - d, pow) * strength;
    if (v < 0.06 && v * 12 < bay(cx + i, cy + j)) continue;
    this.add(cx + i, cy + j, col, v);
  }
  return this;
};
Painter.prototype.shadowPool = function (cx, cy, rx, ry, amt, col) {
  for (let j = -ry; j <= ry; j++) for (let i = -rx; i <= rx; i++) {
    const d = Math.sqrt((i / rx) * (i / rx) + (j / ry) * (j / ry)); if (d > 1) continue;
    this.mul(cx + i, cy + j, col || '#1c1408', amt * (1 - d * d));
  }
  return this;
};
// A wash that fades to nothing at its own border, so the rectangle never shows.
Painter.prototype.wash = function (x, y, w, h, col, amt, f, edge) {
  edge = edge === undefined ? 14 : edge;
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    let t = f ? f(i, j, w, h) : 1; if (!(t > 0.004)) continue;
    if (edge > 0) { const e = Math.min(i, j, w - 1 - i, h - 1 - j) / edge; if (e < 1) t *= smooth(clamp(e, 0, 1)); }
    const v = t * amt;
    if (v < 0.05 && v * 14 < bay(x + i, y + j)) continue;
    this.add(x + i, y + j, col, v);
  }
  return this;
};
Painter.prototype.vignette = function (amt, col, sq) {
  sq = sq === undefined ? 0.85 : sq;
  for (let j = 0; j < this.h; j++) for (let i = 0; i < this.w; i++) {
    const dx = (i / this.w - 0.5) * 2, dy = (j / this.h - 0.5) * 2;
    const d = Math.sqrt(dx * dx * sq + dy * dy);
    if (d > 0.55) this.mul(i, j, col || '#241a0e', clamp((d - 0.55) * amt, 0, 1));
  }
  return this;
};
// Lithograph paper tooth: fine grain + broad blotch, both signed.
Painter.prototype.paper = function (seed, amt, y0, y1) {
  const n = noise2(seed), nb = fbm(seed + 11, 3);
  y0 = y0 || 0; y1 = y1 === undefined ? this.h : y1;
  for (let y = y0; y < y1; y++) for (let x = 0; x < this.w; x++) {
    const t = (n(x * 0.63, y * 0.63) - 0.5) * amt + (nb(x * 0.035, y * 0.035) - 0.5) * amt * 0.85;
    if (t > 0) this.add(x, y, '#fff2d4', t * 0.55);
    else this.mul(x, y, '#4d3d24', -t * 0.6);
  }
  return this;
};
// A long cast shadow from a footprint, fading with distance. `len` may be negative
// (the light is on the other side).
Painter.prototype.castShadow = function (xa, xb, gy, len, drop, amt, col) {
  col = col || '#221a10';
  if (!len) return this;
  const pts = [[xa, gy], [xb, gy], [xb + len, gy + drop], [xa + len, gy + drop]];
  const minY = Math.max(0, Math.floor(gy - 1)), maxY = Math.min(this.h - 1, Math.ceil(gy + drop + 1));
  const ax = len > 0 ? xa : xb;
  for (let y = minY; y <= maxY; y++) {
    const xs = [];
    for (let i = 0; i < 4; i++) {
      const p1 = pts[i], p2 = pts[(i + 1) % 4], y1 = p1[1], y2 = p2[1];
      if ((y + 0.5 >= y1 && y + 0.5 < y2) || (y + 0.5 >= y2 && y + 0.5 < y1)) xs.push(p1[0] + (y + 0.5 - y1) / (y2 - y1) * (p2[0] - p1[0]));
    }
    if (xs.length < 2) continue;
    xs.sort((m, n) => m - n);
    const x0 = Math.round(xs[0]), x1 = Math.round(xs[xs.length - 1]);
    for (let x = x0; x <= x1; x++) {
      const t = (x - ax) / len;
      const v = amt * Math.pow(clamp(1 - t, 0, 1), 0.85);
      if (v < 0.05 && v * 14 < bay(x, y)) continue;
      this.mul(x, y, col, v);
    }
  }
  return this;
};

// ---------------------------------------------------------------- present letterbox
// Best-fit fractional scale of the native buffer that fills the limiting viewport
// dimension (no integer stranding). The canvas is painted with image-rendering
// pixelated, so fractional nearest-neighbour is crisp enough; quarter-integer
// snapping is intentionally avoided because it can drop below the 90% fill gate.
// Pure so `node --test` can lock the scale math without a DOM.
export function computeLetterbox(dw, dh, nw = NATIVE.w, nh = NATIVE.h) {
  let scale = Math.min(dw / nw, dh / nh);
  if (!Number.isFinite(scale) || scale < 1) scale = 1;
  const w = Math.round(nw * scale), h = Math.round(nh * scale);
  return { scale, x: Math.floor((dw - w) / 2), y: Math.floor((dh - h) / 2), w, h };
}

// Map a CSS-pixel point (relative to the canvas element) through the letterbox into
// native buffer coordinates, or null when the point misses the playfield.
export function cssToNative(cssX, cssY, box) {
  if (!box || box.scale < 1) return null;
  const lx = cssX - box.x, ly = cssY - box.y;
  if (lx < 0 || ly < 0 || lx >= box.w || ly >= box.h) return null;
  return { x: lx / box.scale, y: ly / box.scale };
}

// ---------------------------------------------------------------- type
// Two pixel faces. 5x7 for values and body UI, 3x5 retained for micro-ornament only.
// Body/HUD/menu copy is promoted to F5 and (in the browser) painted on the DISPLAY
// text layer after the integer present — the print-class carve-out (option a): text
// may sit at display resolution, crisper than the native art buffer.
export const F5 = {
  A: '.###./#...#/#...#/#####/#...#/#...#/#...#', B: '####./#...#/#...#/####./#...#/#...#/####.',
  C: '.###./#...#/#..../#..../#..../#...#/.###.', D: '####./#...#/#...#/#...#/#...#/#...#/####.',
  E: '#####/#..../#..../####./#..../#..../#####', F: '#####/#..../#..../####./#..../#..../#....',
  G: '.###./#...#/#..../#.###/#...#/#...#/.###.', H: '#...#/#...#/#...#/#####/#...#/#...#/#...#',
  I: '#####/..#../..#../..#../..#../..#../#####', J: '..###/...#./...#./...#./...#./#..#./.##..',
  K: '#...#/#..#./#.#../##.../#.#../#..#./#...#', L: '#..../#..../#..../#..../#..../#..../#####',
  M: '#...#/##.##/#.#.#/#.#.#/#...#/#...#/#...#', N: '#...#/##..#/#.#.#/#.#.#/#..##/#...#/#...#',
  O: '.###./#...#/#...#/#...#/#...#/#...#/.###.', P: '####./#...#/#...#/####./#..../#..../#....',
  Q: '.###./#...#/#...#/#...#/#.#.#/#..#./.##.#', R: '####./#...#/#...#/####./#.#../#..#./#...#',
  S: '.####/#..../#..../.###./....#/....#/####.', T: '#####/..#../..#../..#../..#../..#../..#..',
  U: '#...#/#...#/#...#/#...#/#...#/#...#/.###.', V: '#...#/#...#/#...#/#...#/#...#/.#.#./..#..',
  W: '#...#/#...#/#...#/#.#.#/#.#.#/##.##/#...#', X: '#...#/#...#/.#.#./..#../.#.#./#...#/#...#',
  Y: '#...#/#...#/.#.#./..#../..#../..#../..#..', Z: '#####/....#/...#./..#../.#.../#..../#####',
  0: '.###./#...#/#..##/#.#.#/##..#/#...#/.###.', 1: '..#../.##../..#../..#../..#../..#../.###.',
  2: '.###./#...#/....#/...#./..#../.#.../#####', 3: '####./....#/....#/.###./....#/....#/####.',
  4: '...#./..##./.#.#./#..#./#####/...#./...#.', 5: '#####/#..../####./....#/....#/#...#/.###.',
  6: '..##./.#.../#..../####./#...#/#...#/.###.', 7: '#####/....#/...#./..#../.#.../.#.../.#...',
  8: '.###./#...#/#...#/.###./#...#/#...#/.###.', 9: '.###./#...#/#...#/.####/....#/...#./.##..',
  ' ': '...../...../...../...../...../...../.....', '-': '...../...../...../#####/...../...../.....',
  '.': '...../...../...../...../...../.##../.##..', ',': '...../...../...../...../.##../.##../.#...',
  '\u2013': '...../...../...../#####/...../...../.....', '\u2014': '...../...../...../#####/...../...../.....',
  '\u00b7': '...../...../...../..#../...../...../.....',
  x: '...../...../#...#/.#.#./..#../.#.#./#...#', ':': '...../.##../.##../...../.##../.##../.....',
  '!': '..#../..#../..#../..#../..#../...../..#..', '?': '.###./#...#/....#/..##./..#../...../..#..',
  '/': '....#/....#/...#./..#../.#.../#..../#....', '+': '...../..#../..#../#####/..#../..#../.....',
  '(': '...#./..#../.#.../.#.../.#.../..#../...#.', ')': '.#.../..#../...#./...#./...#./..#../.#...',
  "'": '..#../..#../...../...../...../...../.....', '*': '...../.#.#./..#../#####/..#../.#.#./.....',
  '%': '#...#/#..#./...#./..#../.#..#/#...#/.....', '=': '...../...../#####/...../#####/...../.....',
  '<': '...#./..#../.#.../#..../.#.../..#../...#.', '>': '.#.../..#../...#./....#/...#./..#../.#...',
};
export const F3 = {
  // F3 body face — canonical 3×5 letterforms (pre-fix af2e9a6^) with six one-pixel
  // separations (A B H K Z 0). Resemblance + Hamming≥2; see test/px.test.js + LANE-REPORT-FACEFIX.md.
  A: '.#./..#/###/#.#/#.#', B: '.#./#.#/##./#.#/##.', C: '.##/#../#../#../.##', D: '##./#.#/#.#/#.#/##.',
  E: '###/#../##./#../###', F: '###/#../##./#../#..', G: '.##/#../#.#/#.#/.##', H: '..#/#.#/###/#.#/#.#',
  I: '###/.#./.#./.#./###', J: '..#/..#/..#/#.#/.#.', K: '#.#/..#/##./#.#/#.#', L: '#../#../#../#../###',
  M: '#.#/###/###/#.#/#.#', N: '#.#/##./###/.##/#.#', O: '.#./#.#/#.#/#.#/.#.', P: '##./#.#/##./#../#..',
  Q: '.#./#.#/#.#/##./.##', R: '##./#.#/##./#.#/#.#', S: '.##/#../.#./..#/##.', T: '###/.#./.#./.#./.#.',
  U: '#.#/#.#/#.#/#.#/###', V: '#.#/#.#/#.#/.#./.#.', W: '#.#/#.#/###/###/#.#', X: '#.#/#.#/.#./#.#/#.#',
  Y: '#.#/#.#/.#./.#./.#.', Z: '.##/..#/.#./#../###',
  0: '.##/#.#/#.#/#.#/###', 1: '.#./##./.#./.#./###', 2: '##./..#/.#./#../###', 3: '##./..#/.#./..#/##.',
  4: '#.#/#.#/###/..#/..#', 5: '###/#../##./..#/##.', 6: '.##/#../###/#.#/###', 7: '###/..#/.#./.#./.#.',
  8: '###/#.#/###/#.#/###', 9: '###/#.#/###/..#/##.',
  ' ': '.../.../.../.../...', '-': '.../.../###/.../...', '.': '.../.../.../.../##.', ',': '.../.../.../.#./#..',
  x: '.../#.#/.#./#.#/...', ':': '.../.#./.../.#./...', '!': '.#./.#./.#./.../.#.', '/': '..#/..#/.#./#../#..',
  "'": '.#./.#./.../.../...', '(': '..#/.#./.#./.#./..#', ')': '#../.#./.#./.#./#..',
  '+': '.../.#./###/.#./...', '%': '#.#/..#/.#./#../#.#', '\u00b7': '.../.../.#./.../..#', '=': '.../###/.../###/...',
  '\u2013': '.../.../###/.../...', '\u2014': '.../.../###/.../...',
};
// Every character drawn with no glyph behind it is COUNTED as well as boxed, so a
// test can render every surface in the game and assert the count is zero. A visible
// box catches a font gap on screen; the counter catches it in `node --test`, before
// anyone has to look.
let _missingGlyphs = 0;
export function missingGlyphs() { return _missingGlyphs; }
export function resetMissingGlyphs() { _missingGlyphs = 0; }
// Fold an arbitrary runtime string (an error message) onto the faces we actually
// have, so the LOUD-failure banner degrades to readable type instead of a row of
// boxes. Only the banner needs this; authored copy is written in-font.
export function safeText(s) {
  s = String(s);
  let out = '';
  for (const ch of s) out += (F5[ch] || F5[ch.toUpperCase()]) ? ch : '.';
  return out;
}

// Display-resolution type layer. Browser frames enqueue every piece of type here and
// paint it after the native lithograph plate is presented. Headless tests leave the
// layer disarmed and retain the small bitmap alphabet solely as a deterministic test
// surrogate; no shipped player-facing frame renders the surrogate.
let _textQ = null;
let _skipNativeText = false;
export function beginTextLayer(opts) {
  _textQ = [];
  _skipNativeText = !!(opts && opts.skipNative);
}
export function takeTextLayer() {
  const q = _textQ || [];
  _textQ = null;
  _skipNativeText = false;
  return q;
}
function enqueueText(cmd) { if (_textQ) _textQ.push(cmd); }

function glyph(p, g, x, y, col, a, w, missing) {
  if (_skipNativeText) return;
  if (!g) {
    // A character with no glyph would otherwise render as an invisible hole and the
    // text would silently read wrong (this bit the en dash in "1 – 1"). Draw a
    // hollow box instead so a gap in the font is impossible to miss on screen.
    if (missing) { _missingGlyphs++; p.rect(x, y, w, w + 2, col, (a === undefined ? 1 : a) * 0.7); }
    return;
  }
  const rows = g.split('/');
  for (let j = 0; j < rows.length; j++) for (let i = 0; i < w; i++) if (rows[j][i] === '#') p.px(x + i, y + j, col, a);
}
export function t5(p, s, x, y, col, a) {
  s = String(s);
  enqueueText({ face: 'body', s, x, y, col, a, align: 'left' });
  for (let i = 0; i < s.length; i++) glyph(p, F5[s[i]] || F5[s[i].toUpperCase()], x + i * 6, y, col, a, 5, s[i] !== ' ');
  return x + s.length * 6;
}
export function t5r(p, s, right, y, col, a) {
  s = String(s);
  enqueueText({ face: 'body', s, x: right, y, col, a, align: 'right' });
  const x = Math.round(right - w5(s));
  for (let i = 0; i < s.length; i++) glyph(p, F5[s[i]] || F5[s[i].toUpperCase()], x + i * 6, y, col, a, 5, s[i] !== ' ');
  return right;
}
export function t3(p, s, x, y, col, a) {
  // Micro-ornament face (vista props). Body/HUD/menu call sites use t5 — F3 at
  // display scale was the arm's-length failure the operator rejected.
  s = String(s);
  enqueueText({ face: 'micro', s, x, y, col, a, align: 'left' });
  for (let i = 0; i < s.length; i++) glyph(p, F3[s[i]] || F3[s[i].toUpperCase()], x + i * 4, y, col, a, 3, s[i] !== ' ');
  return x + s.length * 4;
}
export function w5(s) { return String(s).length * 6; }
export function w3(s) { return String(s).length * 4; }
// centred variants
export function t5c(p, s, cx, y, col, a) {
  s = String(s);
  enqueueText({ face: 'body', s, x: cx, y, col, a, align: 'center' });
  const x = Math.round(cx - w5(s) / 2);
  for (let i = 0; i < s.length; i++) glyph(p, F5[s[i]] || F5[s[i].toUpperCase()], x + i * 6, y, col, a, 5, s[i] !== ' ');
  return x + w5(s);
}
export function t3c(p, s, cx, y, col, a) {
  s = String(s);
  enqueueText({ face: 'micro', s, x: cx, y, col, a, align: 'center' });
  const x = Math.round(cx - w3(s) / 2);
  for (let i = 0; i < s.length; i++) glyph(p, F3[s[i]] || F3[s[i].toUpperCase()], x + i * 4, y, col, a, 3, s[i] !== ' ');
  return x + w3(s);
}

// Paint the registered OFL faces into the final canvas at its actual display size.
// Sizes are expressed in native-layout units but rasterized by Canvas at display/DPR
// resolution, so they stay crisp without inheriting the old bitmap face's metrics.
export function paintTextLayer(ctx, queue, box) {
  if (!ctx || !queue || !queue.length || !box) return;
  ctx.save();
  ctx.textBaseline = 'top';
  ctx.textRendering = 'optimizeLegibility';
  ctx.fontKerning = 'normal';
  ctx.lineJoin = 'round';
  for (const cmd of queue) {
    const s = String(cmd.s);
    const col = cmd.col || '#2a2622';
    const a = cmd.a === undefined ? 1 : cmd.a;
    if (a <= 0) continue;
    const x = box.x + cmd.x * box.scale;
    const y = box.y + cmd.y * box.scale;
    const display = cmd.face === 'display';
    const micro = cmd.face === 'micro';
    const size = (display ? cmd.scale * 8 : micro ? 6.4 : 8.8) * box.scale;
    const family = display ? DISPLAY_FONT_FAMILY : BODY_FONT_FAMILY;
    const weight = display || micro ? 400 : 700;
    ctx.font = `${weight} ${size}px "${family}"`;
    ctx.textAlign = cmd.align || 'left';
    ctx.globalAlpha = a;
    if (display && warmTextCol(col)) {
      ctx.strokeStyle = P.pa5;
      ctx.lineWidth = Math.max(1.2, size * 0.10);
      ctx.globalAlpha = a * 0.88;
      ctx.strokeText(s, x, y);
      ctx.globalAlpha = a;
    }
    ctx.fillStyle = col;
    ctx.fillText(s, x, y);
  }
  ctx.restore();
}
// Display type. Browser frames use Rye; the bitmap loop remains only for headless
// painter tests, where Canvas/FontFace does not exist.
export function t5big(p, s, x, y, scale, col, a) {
  s = String(s);
  const totalW = w5big(s, scale);
  enqueueText({ face: 'display', s, x: x + totalW / 2, y, col, a, align: 'center', scale });
  if (_skipNativeText) return x + totalW;
  for (let i = 0; i < s.length; i++) {
    const g = F5[s[i]] || F5[s[i].toUpperCase()];
    if (!g) continue;
    const rows = g.split('/');
    for (let ry = 0; ry < rows.length; ry++) for (let rx = 0; rx < 5; rx++) {
      if (rows[ry][rx] !== '#') continue;
      p.frect(x + (i * 6 + rx) * scale, y + ry * scale, scale, scale, col, a);
    }
  }
  return x + s.length * 6 * scale;
}
export function w5big(s, scale) { return String(s).length * 6 * scale; }
// …and a per-pixel variant so a heading can carry a gradient/inline rather than a flat fill.
export function t5bigFn(p, s, x, y, scale, fn) {
  s = String(s);
  const totalW = String(s).length * 6 * scale;
  const sampled = fn(x + totalW / 2, y + scale * 3.5, 0.5, 0.5);
  if (sampled) enqueueText({ face: 'display', s, x: x + totalW / 2, y, col: sampled, a: 1, align: 'center', scale });
  if (_skipNativeText) return x + totalW;
  for (let i = 0; i < s.length; i++) {
    const g = F5[s[i]] || F5[s[i].toUpperCase()];
    if (!g) continue;
    const rows = g.split('/');
    for (let ry = 0; ry < rows.length; ry++) for (let rx = 0; rx < 5; rx++) {
      if (rows[ry][rx] !== '#') continue;
      for (let dy = 0; dy < scale; dy++) for (let dx = 0; dx < scale; dx++) {
        const px = x + (i * 6 + rx) * scale + dx, py = y + ry * scale + dy;
        const c = fn(px, py, (px - x) / totalW, (ry * scale + dy) / (7 * scale));
        if (c) p.px(px, py, c);
      }
    }
  }
  return x + totalW;
}

export function t5s(p, s, x, y, col, shadowCol, a) {
  t5(p, s, x + 1, y + 1, shadowCol || P.ink0, a === undefined ? 0.75 : a * 0.75);
  return t5(p, s, x, y, col, a);
}
export function t5sc(p, s, cx, y, col, shadowCol, a) {
  t5c(p, s, cx + 1, y + 1, shadowCol || P.ink0, a === undefined ? 0.75 : a * 0.75);
  return t5c(p, s, cx, y, col, a);
}

// ---------------------------------------------------------------- chrome
// The two pieces of printed furniture every surface in the game is built out of: a
// paper CARD and a poster FRAME. Both live here rather than in one screen's module
// because the whole presentation is meant to read as one artifact — a menu, the HUD
// and the title card are the same press, the same stock, the same gold rule.

// A paper card — the menu chrome for every overlay surface. Top-lit stock with a
// pressed-in weave, an ink keyline, a gold inner rule, corner pips, and a shadow
// that lifts it off whatever it is lying on.
export function panel(p, x, y, w, h, alpha) {
  const a = alpha === undefined ? 1 : clamp(alpha, 0, 1);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const t = 0.80 - (j / h) * 0.12 + (((i * 7 + j * 13) % 11) / 11 - 0.5) * 0.06;
    p.px(x + i, y + j, rampAt(R.paper, clamp(t, 0, 1), x + i, y + j), a);
  }
  p.rect(x, y, w, h, P.ink, 0.85 * a);
  p.rect(x + 2, y + 2, w - 4, h - 4, P.gd2, 0.5 * a);
  p.hline(x + 1, x + w - 2, y + 1, P.pa5, 0.7 * a);
  for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) {
    if (i + j > 3) continue;
    for (const [cx, cy, sx, sy] of [[x, y, 1, 1], [x + w - 1, y, -1, 1], [x, y + h - 1, 1, -1], [x + w - 1, y + h - 1, -1, -1]]) {
      if (i + j === 3) p.px(cx + sx * i, cy + sy * j, P.gd3, 0.9 * a);
    }
  }
  // the card's drop shadow
  for (let i = 0; i < w; i++) { p.mul(x + i + 2, y + h, '#1a1208', 0.34 * a); p.mul(x + i + 3, y + h + 1, '#1a1208', 0.16 * a); }
  for (let j = 0; j < h; j++) { p.mul(x + w, y + j + 2, '#1a1208', 0.30 * a); p.mul(x + w + 1, y + j + 3, '#1a1208', 0.14 * a); }
  return p;
}

// The matted poster frame with art-nouveau corner curls. Kept thin so the >=95%
// screen-fill gate holds (rule 9). The HUD, the title card and the menu screens each
// pass their own tuning; the ORNAMENT is shared so they read as one press run.
export function posterFrame(p, opts) {
  const o = Object.assign({
    m: 3, outer: P.ink, outerA: 0.5, inner: P.gd2, innerA: 0.45,
    s: 9, steps: 10, curl: P.gd3, curlA: 0.8, pip: P.gd4, pipA: 0.9,
  }, opts || {});
  const W = p.w, H = p.h, m = o.m;
  p.rect(m, m, W - 2 * m, H - 2 * m, o.outer, o.outerA);
  p.rect(m + 2, m + 2, W - 2 * m - 4, H - 2 * m - 4, o.inner, o.innerA);
  for (const [cx, cy, dx, dy] of [[m, m, 1, 1], [W - 1 - m, m, -1, 1], [m, H - 1 - m, 1, -1], [W - 1 - m, H - 1 - m, -1, -1]]) {
    for (let a = 0; a <= o.steps; a++) {
      const th = a / o.steps * Math.PI * 0.5;
      p.px(cx + dx * Math.round(Math.cos(th) * o.s), cy + dy * Math.round(Math.sin(th) * o.s), o.curl, o.curlA);
    }
    p.px(cx + dx * 4, cy + dy * 4, o.pip, o.pipA);
  }
  return p;
}

// ---------------------------------------------------------------- presentation
// The native buffer is presented to the logical VIEW nearest-neighbor. The caller
// owns the ctx; we only ever touch an offscreen canvas we made ourselves.
export function makeSurface(w, h) {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return { c, x: c.getContext('2d') };
}

export class NativeScreen {
  constructor(w = NATIVE.w, h = NATIVE.h) {
    this.p = new Painter(w, h);
    this.surface = null;
    this.img = null;
  }
  get painter() { return this.p; }
  // Blit the buffer to `ctx` at (dx,dy) sized (vw,vh) with NO smoothing.
  present(ctx, vw, vh, dx = 0, dy = 0) {
    if (!this.surface) {
      this.surface = makeSurface(this.p.w, this.p.h);
      if (!this.surface) return false;              // headless: nothing to present to
      this.img = this.surface.x.createImageData(this.p.w, this.p.h);
    }
    this.img.data.set(this.p.d);
    this.surface.x.putImageData(this.img, 0, 0);
    const prev = ctx.imageSmoothingEnabled;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.surface.c, 0, 0, this.p.w, this.p.h, dx, dy, vw, vh);
    ctx.imageSmoothingEnabled = prev;
    return true;
  }
}

// The world->native scale. VIEW is 1280x800 and NATIVE is 480x300, so this is a
// single uniform 0.375 in both axes; sim coordinates are never modified.
export function worldScale(viewW) { return NATIVE.w / viewW; }
