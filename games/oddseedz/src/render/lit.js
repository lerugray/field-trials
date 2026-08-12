// The lit-render technique layer — a software rasterizer the scenes paint into.
//
// Ratified by the operator from docs/art-poc-2026-08-10/ (toyroom-poc.png +
// tournament-poc.png). Three rules carry the whole register:
//
//   1. NATIVE-RES SOFTWARE RENDERING. Everything is painted into a small
//      Uint8ClampedArray and blitted up with nearest-neighbour, so the art has a
//      real pixel size instead of resolution-independent vector smoothness.
//   2. LIGHTING AS COMPOSITING. Nothing is filled flat. Surfaces carry an albedo;
//      light is `add`ed and shadow is `mul`tiplied over it. A scene is a light rig
//      plus the things it falls on.
//   3. DITHERED / FBM MATERIAL TEXTURE. Colour arrives through an 8x8 Bayer
//      dither over a 6-step ramp, and every surface gets an fbm perturbation, so
//      no area is ever mathematically clean.
//
// Every name here is prefixed so the single-file build (which concatenates all
// modules into one scope) cannot collide with creature.js's own helpers.

import { PALETTE } from './palette.js';

// ---- math ------------------------------------------------------------------

export function litClamp(v, a, b) { return v < a ? a : v > b ? b : v; }
export function litLerp(a, b, t) { return a + (b - a) * t; }
export function litSmooth(t) { return t * t * (3 - 2 * t); }

// A small deterministic PRNG: every scene detail (a star, a crumb, a crowd
// member) is placed from a seed so a re-bake reproduces the same room exactly.
export function litRng(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function litNoise2(seed) {
  const perm = new Uint8Array(512);
  const r = litRng(seed);
  for (let i = 0; i < 256; i++) perm[i] = i;
  for (let i = 255; i > 0; i--) {
    const j = (r() * (i + 1)) | 0;
    const t = perm[i]; perm[i] = perm[j]; perm[j] = t;
  }
  for (let i = 0; i < 256; i++) perm[i + 256] = perm[i];
  const grad = (h, x, y) => {
    switch (h & 3) {
      case 0: return x + y;
      case 1: return -x + y;
      case 2: return x - y;
      default: return -x - y;
    }
  };
  return function at(x, y) {
    const X = Math.floor(x) & 255;
    const Y = Math.floor(y) & 255;
    const xf = x - Math.floor(x);
    const yf = y - Math.floor(y);
    const u = litSmooth(xf);
    const v = litSmooth(yf);
    const aa = perm[perm[X] + Y];
    const ab = perm[perm[X] + Y + 1];
    const ba = perm[perm[X + 1] + Y];
    const bb = perm[perm[X + 1] + Y + 1];
    const x1 = litLerp(grad(aa, xf, yf), grad(ba, xf - 1, yf), u);
    const x2 = litLerp(grad(ab, xf, yf - 1), grad(bb, xf - 1, yf - 1), u);
    return (litLerp(x1, x2, v) + 1) * 0.5;
  };
}

// Fractal noise — the material grain on every surface in the room.
export function litFbm(seed, oct = 4) {
  const n = litNoise2(seed);
  return function at(x, y) {
    let s = 0, amp = 0.5, f = 1, tot = 0;
    for (let i = 0; i < oct; i++) { s += n(x * f, y * f) * amp; tot += amp; amp *= 0.5; f *= 2; }
    return s / tot;
  };
}

// ---- colour ----------------------------------------------------------------

const LIT_CACHE = Object.create(null);

export function litRgbOf(h) {
  return [parseInt(h.substr(1, 2), 16), parseInt(h.substr(3, 2), 16), parseInt(h.substr(5, 2), 16)];
}
// Colours are quoted as hex strings all through the scenes; this memoises the
// parse so the per-pixel loops are not re-parsing '#1C2A5E' a million times.
export function litC(c) {
  if (typeof c !== 'string') return c;
  let v = LIT_CACHE[c];
  if (!v) v = LIT_CACHE[c] = litRgbOf(c);
  return v;
}
export function litHex(r, g, b) {
  const f = (v) => {
    const s = litClamp(Math.round(v), 0, 255).toString(16);
    return s.length < 2 ? '0' + s : s;
  };
  return '#' + f(r) + f(g) + f(b);
}
export function litMix(h1, h2, t) {
  const a = litRgbOf(h1), b = litRgbOf(h2);
  return litHex(litLerp(a[0], b[0], t), litLerp(a[1], b[1], t), litLerp(a[2], b[2], t));
}
export function litShade(h, t) { return t < 0 ? litMix(h, '#000000', -t) : litMix(h, '#ffffff', t); }

// hsl -> hex, so creature-adjacent ramps come off the same maths creature.js's
// paletteFor() uses rather than being hand-picked here.
export function litHsl(h, s, l) {
  h = ((h % 360) + 360) % 360; s /= 100; l /= 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r, g, b;
  if (h < 60) { r = c; g = x; b = 0; }
  else if (h < 120) { r = x; g = c; b = 0; }
  else if (h < 180) { r = 0; g = c; b = x; }
  else if (h < 240) { r = 0; g = x; b = c; }
  else if (h < 300) { r = x; g = 0; b = c; }
  else { r = c; g = 0; b = x; }
  return litHex((r + m) * 255, (g + m) * 255, (b + m) * 255);
}

// ---- the dither ------------------------------------------------------------

export const LIT_BAYER = (() => {
  const m = [
    0, 32, 8, 40, 2, 34, 10, 42, 48, 16, 56, 24, 50, 18, 58, 26,
    12, 44, 4, 36, 14, 46, 6, 38, 60, 28, 52, 20, 62, 30, 54, 22,
    3, 35, 11, 43, 1, 33, 9, 41, 51, 19, 59, 27, 49, 17, 57, 25,
    15, 47, 7, 39, 13, 45, 5, 37, 63, 31, 55, 23, 61, 29, 53, 21,
  ];
  return m.map((v) => (v + 0.5) / 64);
})();

export function litBay(x, y) { return LIT_BAYER[(((y & 7) << 3) + (x & 7))]; }

// Sample a ramp at `t`, dithering between the two nearest steps so a gradient
// reads as ordered pixels rather than a smooth blend. This is the single call
// that gives every surface its material.
export function litRampAt(ramp, t, x, y) {
  if (t <= 0) return ramp[0];
  if (t >= 1) return ramp[ramp.length - 1];
  const v = t * (ramp.length - 1);
  const i = Math.floor(v);
  const f = v - i;
  if (i >= ramp.length - 1) return ramp[ramp.length - 1];
  return f > litBay(x, y) ? ramp[i + 1] : ramp[i];
}

// ---- the palette family ----------------------------------------------------
//
// Each anchor below is one of PALETTE's own colours extended into a 6-step ramp
// so the surface it names can be LIT instead of filled. The anchors are asserted
// against PALETTE in test/lit.test.js so the two can never drift apart.

export const LIT_P = {
  // deep navy — walls, night, shadow mass (bgBandLo / bgBandHi / headerBand)
  nv0: '#05081A', nv1: '#0A0F2A', nv2: '#101A3C', nv3: '#1C2A5E', nv4: '#24387A', nv5: '#3A50A0',
  // warm-white / beige — trim, wainscot, canvas, paper (beigeDark / beigeBevelLight)
  be0: '#3A3830', be1: '#63604F', be2: '#918C74', be3: '#BDB69B', be4: '#E4DCC8', be5: '#F8F4E8',
  // gold — the lamp, brass, rules, meters (accentGold)
  gd0: '#241804', gd1: '#4E3A0E', gd2: '#8A681C', gd3: '#C09430', gd4: '#F0C060', gd5: '#FCEAB6',
  // orange — accents, embers, warm bounce (accentOrange)
  or0: '#2E1606', or1: '#5E3010', or2: '#9A561F', or3: '#E88C3A', or4: '#F3B478', or5: '#FBDCBA',
  // red — warnings, bunting, at-cap (accentRed)
  rd0: '#240A0A', rd1: '#4E1818', rd2: '#822A2A', rd3: '#C04040', rd4: '#D97A7A', rd5: '#EFB8B8',
  // warm interior green — the pen floor / rug (creatureFloor)
  gn0: '#0C1206', gn1: '#18220E', gn2: '#2A3A18', gn3: '#405822', gn4: '#5E7C34', gn5: '#88A455',
  // wood — toybox, floorboards, ring apron
  wd0: '#170D06', wd1: '#311C0C', wd2: '#54321A', wd3: '#7C512C', wd4: '#A87A4C', wd5: '#CCA87A',
  // steel — snack machine, spotlight rigs, ring posts
  st0: '#0A0D16', st1: '#171D2C', st2: '#2C3648', st3: '#4A5A72', st4: '#76889E', st5: '#A8B6C6',
  ink: '#0A0C16', ink1: '#141828', wht: '#FFFBF0',
};

export const LIT_R = {
  navy: [LIT_P.nv0, LIT_P.nv1, LIT_P.nv2, LIT_P.nv3, LIT_P.nv4, LIT_P.nv5],
  beige: [LIT_P.be0, LIT_P.be1, LIT_P.be2, LIT_P.be3, LIT_P.be4, LIT_P.be5],
  gold: [LIT_P.gd0, LIT_P.gd1, LIT_P.gd2, LIT_P.gd3, LIT_P.gd4, LIT_P.gd5],
  orange: [LIT_P.or0, LIT_P.or1, LIT_P.or2, LIT_P.or3, LIT_P.or4, LIT_P.or5],
  red: [LIT_P.rd0, LIT_P.rd1, LIT_P.rd2, LIT_P.rd3, LIT_P.rd4, LIT_P.rd5],
  green: [LIT_P.gn0, LIT_P.gn1, LIT_P.gn2, LIT_P.gn3, LIT_P.gn4, LIT_P.gn5],
  wood: [LIT_P.wd0, LIT_P.wd1, LIT_P.wd2, LIT_P.wd3, LIT_P.wd4, LIT_P.wd5],
  steel: [LIT_P.st0, LIT_P.st1, LIT_P.st2, LIT_P.st3, LIT_P.st4, LIT_P.st5],
  night: ['#060A18', '#0A1026', '#101A3C', '#1A2650', '#2A3A6E', '#43558E'],
};

// The PALETTE colours these ramps are anchored to. test/lit.test.js asserts each
// is actually present in its ramp, so an edit to palette.js cannot silently
// leave the lit layer painting last month's colours.
export const LIT_ANCHORS = [
  { palette: PALETTE.bgBandLo, ramp: 'navy' },
  { palette: PALETTE.bgBandHi, ramp: 'navy' },
  { palette: PALETTE.headerBand, ramp: 'navy' },
  { palette: PALETTE.beigeDark, ramp: 'beige' },
  { palette: PALETTE.accentGold, ramp: 'gold' },
  { palette: PALETTE.accentOrange, ramp: 'orange' },
  { palette: PALETTE.accentRed, ramp: 'red' },
  { palette: PALETTE.creatureFloor, ramp: 'green' },
];

// ---- lighting --------------------------------------------------------------

// Lambert-ish shading of a point against a scene's light list. The surface
// normal is approximated from an ellipsoid centred on (cx,cy) with radii
// (rx,ry) — cheap, and enough to make a body read as round under a lamp.
// Returns a ramp position, not a colour, so any material can consume it.
export function litT(x, y, cx, cy, rx, ry, lights, amb) {
  const nx = litClamp((x - cx) / rx, -1, 1);
  const ny = litClamp((y - cy) / ry, -1, 1);
  const nz = Math.sqrt(Math.max(0.02, 1 - nx * nx - ny * ny));
  let t = amb;
  for (let i = 0; i < lights.length; i++) {
    const L = lights[i];
    const dx = L.x - x, dy = L.y - y;
    const d = Math.sqrt(dx * dx + dy * dy) + 0.001;
    const lx = dx / d, ly = dy / d;
    const lz = L.lz === undefined ? 0.62 : L.lz;
    const n = Math.sqrt(lx * lx + ly * ly + lz * lz);
    const dot = (nx * lx + ny * ly + nz * lz) / n;
    const att = L.range ? Math.pow(litClamp(1 - d / L.range, 0, 1), 1.35) : 1;
    t += Math.max(0, dot) * L.s * att;
  }
  return t;
}

// Build a 6-step lit ramp around an arbitrary albedo colour. This is what lets
// the existing 70-species creature renderer keep its own palette while still
// being shaded and dithered like everything else in the room.
export function litRampFromRgb(r, g, b) {
  const base = litHex(r, g, b);
  return [
    litShade(base, -0.62), litShade(base, -0.40), litShade(base, -0.18),
    base, litShade(base, 0.20), litShade(base, 0.42),
  ];
}

// ---- the painter -----------------------------------------------------------

export class LitPainter {
  constructor(w, h) {
    this.w = w;
    this.h = h;
    this.d = new Uint8ClampedArray(w * h * 4);
  }

  clear(col) {
    const c = litC(col), d = this.d;
    for (let i = 0; i < d.length; i += 4) { d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = 255; }
    return this;
  }

  px(x, y, col, a) {
    x |= 0; y |= 0;
    if (x < 0 || y < 0 || x >= this.w || y >= this.h || col == null) return this;
    const c = litC(col), i = (y * this.w + x) * 4, d = this.d;
    if (a === undefined || a >= 1) { d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = 255; }
    else if (a > 0) {
      d[i] = c[0] * a + d[i] * (1 - a);
      d[i + 1] = c[1] * a + d[i + 1] * (1 - a);
      d[i + 2] = c[2] * a + d[i + 2] * (1 - a);
      d[i + 3] = 255;
    }
    return this;
  }

  // ADDITIVE — this is what makes a scene read as lit rather than tinted.
  add(x, y, col, a) {
    x |= 0; y |= 0;
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return this;
    if (!(a > 0)) return this;
    const c = litC(col), i = (y * this.w + x) * 4, d = this.d;
    d[i] += c[0] * a; d[i + 1] += c[1] * a; d[i + 2] += c[2] * a; d[i + 3] = 255;
    return this;
  }

  // MULTIPLY — shadow, grime, depth.
  mul(x, y, col, a) {
    x |= 0; y |= 0;
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return this;
    const c = litC(col), i = (y * this.w + x) * 4, d = this.d;
    d[i] = d[i] * (1 - a + (a * c[0]) / 255);
    d[i + 1] = d[i + 1] * (1 - a + (a * c[1]) / 255);
    d[i + 2] = d[i + 2] * (1 - a + (a * c[2]) / 255);
    return this;
  }

  get(x, y) {
    x |= 0; y |= 0;
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return [0, 0, 0, 0];
    const i = (y * this.w + x) * 4, d = this.d;
    return [d[i], d[i + 1], d[i + 2], d[i + 3]];
  }

  hline(x0, x1, y, col, a) {
    if (x1 < x0) { const t = x0; x0 = x1; x1 = t; }
    for (let x = x0; x <= x1; x++) this.px(x, y, col, a);
    return this;
  }

  vline(x, y0, y1, col, a) {
    if (y1 < y0) { const t = y0; y0 = y1; y1 = t; }
    for (let y = y0; y <= y1; y++) this.px(x, y, col, a);
    return this;
  }

  frect(x, y, w, h, col, a) {
    for (let j = 0; j < h; j++) this.hline(x, x + w - 1, y + j, col, a);
    return this;
  }

  rect(x, y, w, h, col, a) {
    this.hline(x, x + w - 1, y, col, a);
    this.hline(x, x + w - 1, y + h - 1, col, a);
    this.vline(x, y, y + h - 1, col, a);
    this.vline(x + w - 1, y, y + h - 1, col, a);
    return this;
  }

  line(x0, y0, x1, y1, col, a) {
    x0 |= 0; y0 |= 0; x1 |= 0; y1 |= 0;
    const dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1;
    const dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      this.px(x0, y0, col, a);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
    return this;
  }

  tline(x0, y0, x1, y1, wd, col, a) {
    const dx = x1 - x0, dy = y1 - y0;
    const len = Math.max(1, Math.sqrt(dx * dx + dy * dy));
    const nx = -dy / len, ny = dx / len, half = (wd - 1) / 2;
    for (let o = -half; o <= half; o += 0.5) {
      this.line(Math.round(x0 + nx * o), Math.round(y0 + ny * o), Math.round(x1 + nx * o), Math.round(y1 + ny * o), col, a);
    }
    return this;
  }

  fcircle(cx, cy, r, col, a) {
    const r2 = r * r;
    for (let y = -r; y <= r; y++) {
      const xs = Math.floor(Math.sqrt(Math.max(0, r2 - y * y)));
      this.hline(cx - xs, cx + xs, cy + y, col, a);
    }
    return this;
  }

  fellipse(cx, cy, rx, ry, col, a) {
    for (let y = -ry; y <= ry; y++) {
      const t = 1 - (y * y) / (ry * ry);
      if (t < 0) continue;
      const xs = Math.floor(rx * Math.sqrt(t));
      this.hline(cx - xs, cx + xs, cy + y, col, a);
    }
    return this;
  }

  ellipse(cx, cy, rx, ry, col, a) {
    let prev = -1;
    for (let y = -ry; y <= ry; y++) {
      const t = 1 - (y * y) / (ry * ry);
      const xs = t < 0 ? 0 : Math.floor(rx * Math.sqrt(t));
      if (prev < 0 || Math.abs(xs - prev) <= 1) { this.px(cx - xs, cy + y, col, a); this.px(cx + xs, cy + y, col, a); }
      else { this.hline(cx - prev, cx - xs, cy + y, col, a); this.hline(cx + xs, cx + prev, cy + y, col, a); }
      prev = xs;
    }
    return this;
  }

  // op: 'px' | 'mul' | 'add'
  fpoly(pts, col, a, op) {
    op = op || 'px';
    let minY = 1e9, maxY = -1e9;
    for (let i = 0; i < pts.length; i++) {
      if (pts[i][1] < minY) minY = pts[i][1];
      if (pts[i][1] > maxY) maxY = pts[i][1];
    }
    minY = Math.max(0, Math.floor(minY));
    maxY = Math.min(this.h - 1, Math.ceil(maxY));
    for (let y = minY; y <= maxY; y++) {
      const xs = [];
      for (let i = 0; i < pts.length; i++) {
        const p1 = pts[i], p2 = pts[(i + 1) % pts.length];
        const y1 = p1[1], y2 = p2[1];
        if ((y + 0.5 >= y1 && y + 0.5 < y2) || (y + 0.5 >= y2 && y + 0.5 < y1)) {
          xs.push(p1[0] + ((y + 0.5 - y1) / (y2 - y1)) * (p2[0] - p1[0]));
        }
      }
      xs.sort((m, n) => m - n);
      for (let i = 0; i + 1 < xs.length; i += 2) {
        const xa = Math.round(xs[i]), xb = Math.round(xs[i + 1] - 0.5);
        for (let x = xa; x <= xb; x++) {
          if (op === 'mul') this.mul(x, y, col, a);
          else if (op === 'add') this.add(x, y, col, a);
          else this.px(x, y, col, a);
        }
      }
    }
    return this;
  }

  poly(pts, col, a) {
    for (let i = 0; i < pts.length; i++) {
      const p1 = pts[i], p2 = pts[(i + 1) % pts.length];
      this.line(p1[0], p1[1], p2[0], p2[1], col, a);
    }
    return this;
  }

  // Per-pixel material callback — the workhorse for walls, floors and panels.
  fn(x, y, w, h, f) {
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++) {
        const c = f(x + i, y + j, i, j);
        if (c) this.px(x + i, y + j, c);
      }
    }
    return this;
  }

  // Dithered vertical gradient with an optional warp function.
  grad(x, y, w, h, ramp, t0 = 0, t1 = 1, warp) {
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++) {
        let t = j / Math.max(1, h - 1);
        if (warp) t = litClamp(t + warp(x + i, y + j), 0, 1);
        this.px(x + i, y + j, litRampAt(ramp, litLerp(t0, t1, t), x + i, y + j));
      }
    }
    return this;
  }

  // ADDITIVE radial glow — dithered tail so it never bands.
  glow(cx, cy, r, col, strength, pow = 2) {
    for (let j = -r; j <= r; j++) {
      for (let i = -r; i <= r; i++) {
        const d = Math.sqrt(i * i + j * j);
        if (d > r) continue;
        const v = Math.pow(1 - d / r, pow) * strength;
        if (v < 0.06 && v * 12 < litBay(cx + i, cy + j)) continue;
        this.add(cx + i, cy + j, col, v);
      }
    }
    return this;
  }

  // An elliptical additive light pool — a lamp's throw on the floor.
  pool(cx, cy, rx, ry, col, strength, pow = 2) {
    for (let j = -ry; j <= ry; j++) {
      for (let i = -rx; i <= rx; i++) {
        const d = Math.sqrt((i / rx) * (i / rx) + (j / ry) * (j / ry));
        if (d > 1) continue;
        const v = Math.pow(1 - d, pow) * strength;
        if (v < 0.06 && v * 12 < litBay(cx + i, cy + j)) continue;
        this.add(cx + i, cy + j, col, v);
      }
    }
    return this;
  }

  // ADDITIVE volumetric cone — a spotlight's shaft through haze.
  cone(ax, ay, bx, by, halfTop, halfBot, col, strength, haze) {
    const y0 = Math.max(0, Math.round(ay));
    const y1 = Math.min(this.h - 1, Math.round(by));
    for (let y = y0; y <= y1; y++) {
      const t = (y - ay) / Math.max(1, by - ay);
      const half = Math.max(1, litLerp(halfTop, halfBot, t));
      const cx = litLerp(ax, bx, t);
      const x0 = Math.max(0, Math.round(cx - half));
      const x1 = Math.min(this.w - 1, Math.round(cx + half));
      for (let x = x0; x <= x1; x++) {
        const u = Math.abs((x - cx) / half);
        let v = strength * Math.pow(1 - u, 1.9) * (1 - t * 0.55);
        if (haze) v *= haze(x, y);
        if (v < 0.05 && v * 15 < litBay(x, y)) continue;
        this.add(x, y, col, v);
      }
    }
    return this;
  }

  // MULTIPLY shadow pool under an object.
  shadowPool(cx, cy, rx, ry, amt, col) {
    for (let j = -ry; j <= ry; j++) {
      for (let i = -rx; i <= rx; i++) {
        const d = Math.sqrt((i / rx) * (i / rx) + (j / ry) * (j / ry));
        if (d > 1) continue;
        this.mul(cx + i, cy + j, col || '#0d1206', amt * (1 - d * d));
      }
    }
    return this;
  }

  // A long cast shadow from a footprint, fading with distance.
  castShadow(xa, xb, gy, len, drop, amt, col) {
    col = col || '#0b1005';
    if (!len) return this;
    const pts = [[xa, gy], [xb, gy], [xb + len, gy + drop], [xa + len, gy + drop]];
    const minY = Math.max(0, Math.floor(Math.min(gy, gy + drop) - 1));
    const maxY = Math.min(this.h - 1, Math.ceil(Math.max(gy, gy + drop) + 1));
    for (let y = minY; y <= maxY; y++) {
      const xs = [];
      for (let i = 0; i < 4; i++) {
        const p1 = pts[i], p2 = pts[(i + 1) % 4];
        const y1 = p1[1], y2 = p2[1];
        if ((y + 0.5 >= y1 && y + 0.5 < y2) || (y + 0.5 >= y2 && y + 0.5 < y1)) {
          xs.push(p1[0] + ((y + 0.5 - y1) / (y2 - y1)) * (p2[0] - p1[0]));
        }
      }
      if (xs.length < 2) continue;
      xs.sort((m, n) => m - n);
      const x0 = Math.round(xs[0]), x1 = Math.round(xs[xs.length - 1]);
      const ax = len > 0 ? xa : xb;
      for (let x = x0; x <= x1; x++) {
        const t = (x - ax) / len;
        const v = amt * Math.pow(litClamp(1 - t, 0, 1), 0.85);
        if (v < 0.05 && v * 14 < litBay(x, y)) continue;
        this.mul(x, y, col, v);
      }
    }
    return this;
  }

  // A colour wash that fades to nothing, so no rectangle ever shows.
  wash(x, y, w, h, col, amt, f, edge = 14) {
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++) {
        let t = f ? f(i, j, w, h) : 1;
        if (!(t > 0.004)) continue;
        if (edge > 0) {
          const e = Math.min(i, j, w - 1 - i, h - 1 - j) / edge;
          if (e < 1) t *= litSmooth(litClamp(e, 0, 1));
        }
        const v = t * amt;
        if (v < 0.05 && v * 14 < litBay(x + i, y + j)) continue;
        this.add(x + i, y + j, col, v);
      }
    }
    return this;
  }

  vignette(amt, col, sq = 0.85) {
    for (let j = 0; j < this.h; j++) {
      for (let i = 0; i < this.w; i++) {
        const dx = (i / this.w - 0.5) * 2, dy = (j / this.h - 0.5) * 2;
        const d = Math.sqrt(dx * dx * sq + dy * dy);
        if (d > 0.55) this.mul(i, j, col || '#0a0d18', litClamp((d - 0.55) * amt, 0, 1));
      }
    }
    return this;
  }

  // Fine grain so no area is ever mathematically clean.
  grain(seed, amt, y0 = 0, y1) {
    const n = litNoise2(seed), nb = litFbm(seed + 11, 3);
    if (y1 === undefined) y1 = this.h;
    for (let y = y0; y < y1; y++) {
      for (let x = 0; x < this.w; x++) {
        const t = (n(x * 0.63, y * 0.63) - 0.5) * amt + (nb(x * 0.035, y * 0.035) - 0.5) * amt * 0.8;
        if (t > 0) this.add(x, y, '#fff0d0', t * 0.5);
        else this.mul(x, y, '#1b2030', -t * 0.55);
      }
    }
    return this;
  }
}

// ---- part masks ------------------------------------------------------------
//
// A small part-id buffer. The scenes use it for the one object that is a lit
// SHAPE rather than a lit surface: the hand cursor.

export class LitMask {
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

  // True where this cell is filled and at least one 4-neighbour is not.
  isEdge(i, j) {
    if (!this.local(i, j)) return false;
    return (i === 0 || this.local(i - 1, j) === 0)
      || (i === this.w - 1 || this.local(i + 1, j) === 0)
      || (j === 0 || this.local(i, j - 1) === 0)
      || (j === this.h - 1 || this.local(i, j + 1) === 0);
  }
}
