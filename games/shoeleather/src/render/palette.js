// SHOELEATHER — the Exhaustion Floor palette (Weiss, 2026-08-10).
//
// DESIGN-SEED look law: 1970s American color scripting — mustard, avocado, burnt
// orange, smog sunsets; smoky interiors; the surface feels WORN. These are the base
// albedo hues; the M4 art pass layers light rigs and dither/fbm material on top per
// the VACUUM SEALED stack. This module is just the named palette + small rasterizer
// helpers shared by the engine-harness backdrop and (later) the real scenes.

import { rgba } from './framebuffer.js';

export const PALETTE = Object.freeze({
  ink:        rgba(18, 14, 10),     // near-black brown — smoky shadow
  umber:      rgba(36, 28, 20),     // dark interior
  walnut:     rgba(74, 52, 34),     // wood
  mustard:    rgba(200, 160, 60),   // the signature dull gold
  avocado:    rgba(107, 122, 50),   // period green
  burntOrange:rgba(181, 86, 30),    // burnt orange
  smog:       rgba(150, 120, 95),   // smog-sunset haze
  ceiling:    rgba(96, 78, 58),     // warm grey-brown up-light
  floor:      rgba(58, 44, 32),     // dim floor
  paper:      rgba(232, 220, 192),  // document cream
  faintInk:   rgba(120, 96, 72),    // worn print
});

// 4x4 ordered (Bayer) dither threshold map, normalised 0..1. Used to break gradient
// banding without a smeary blur — the crisp-pixel material texture the seed calls for.
const BAYER4 = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];

export function bayer(x, y) {
  return (BAYER4[y & 3][x & 3] + 0.5) / 16;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function mix(c1, c2, t) {
  return rgba(lerp(c1[0], c2[0], t), lerp(c1[1], c2[1], t), lerp(c1[2], c2[2], t), 255);
}

// Dithered vertical gradient value: picks c1 or c2-biased color with an ordered
// threshold so banding reads as fine grain, not a smooth wash.
export function ditherMix(c1, c2, t, x, y) {
  const dithered = t + (bayer(x, y) - 0.5) * (1 / 16);
  return mix(c1, c2, Math.max(0, Math.min(1, dithered)));
}
