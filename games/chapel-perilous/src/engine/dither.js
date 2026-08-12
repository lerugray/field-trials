// M8 WORLD CHARACTER — the dither layer (Cyclopean-study lever #1).
//
// The art study (docs/CYCLOPEAN-ART-STUDY-2026-08-02.md) found the reference's
// "digital character" comes first of all from DITHERING: surfaces are built from
// black/white dot density at two scales — a broad density grain plus a fine
// ordered-dot stipple — never flat fills. CHP's tiles were flat blocks of one
// ramp index. This module textures those fills WITHOUT rewriting a single matrix:
// each art-pixel of shade s becomes a deterministic ordered-dither of s against
// its neighbours, so a solid region reads as grained material.
//
// Pure and deterministic: keyed to world coordinates + a seed, so a tile's dither
// is locked to the WORLD (it scrolls with the map, never crawls/shimmers) and is
// unit-testable. No DOM, no canvas — this only computes ramp indices.

import { hash2 } from './prng.js';

// Bayer 8x8 ordered-dither thresholds, exactly matching the approved art PoC.
// Low values fill first. Using a real Bayer matrix (not random) is what
// gives the clean, deliberate retro dot pattern rather than TV static.
const BAYER8 = [
  0, 32, 8, 40, 2, 34, 10, 42, 48, 16, 56, 24, 50, 18, 58, 26,
  12, 44, 4, 36, 14, 46, 6, 38, 60, 28, 52, 20, 62, 30, 54, 22,
  3, 35, 11, 43, 1, 33, 9, 41, 51, 19, 59, 27, 49, 17, 57, 25,
  15, 47, 7, 39, 13, 45, 5, 37, 63, 31, 55, 23, 61, 29, 53, 21,
].map((v) => (v + 0.5) / 64);

export function bayer(x, y) {
  return BAYER8[((y & 7) << 3) | (x & 7)];
}

// Resolve a FRACTIONAL ramp level to an integer index for the sub-pixel at
// (sx,sy) by ordered dither between floor(level) and floor(level)+1. A level of
// 3.0 is always 3; 3.4 is 3 on 60% of sub-pixels and 4 on 40%, arranged by the
// Bayer pattern so the eye blends them into "3.4".
export function ditherLevel(level, sx, sy, levels) {
  const max = levels - 1;
  const clamped = level < 0 ? 0 : level > max ? max : level;
  const lo = Math.floor(clamped);
  if (lo >= max) return max;
  const frac = clamped - lo; // 0..1 weight toward lo+1
  return frac > bayer(sx, sy) ? lo + 1 : lo;
}

// A low-frequency density grain in [0,1) for an art-pixel at world coords
// (wx,wy). Averages two offset hashes so it varies smoothly enough to read as
// material variation (patches, not per-pixel noise) rather than white noise.
export function grain(wx, wy, seed) {
  return (hash2(wx, wy, seed) + hash2(wx + 131, wy - 71, seed ^ 0x5bd1e995)) * 0.5;
}

// The core: the textured ramp index for a sub-pixel. `s` is the authored shade
// of the art-pixel; (wx,wy) its world coordinate (the grain anchor); (sx,sy) the
// sub-pixel coordinate within it (the fine stipple anchor). Shade 0 (blacks /
// silhouette mass) and transparents are returned untouched so silhouettes stay
// crisp — texture rides on the mid/light tones, exactly as the reference does.
export function texturedShade(s, wx, wy, sx, sy, opts = {}) {
  if (s <= 0) return s;
  const { amp = 0.85, levels = 7, seed = 0 } = opts;
  const g = grain(wx, wy, seed);
  // Centre the modulation on s so the AVERAGE tone is preserved (no muddying):
  // some art-pixels bias one ramp step down, some one up, dithered within.
  const level = s + (g - 0.5) * 2 * amp;
  // Lock the 8x8 tooth to world output-pixel coordinates. With the shipped 2x
  // tile sub-grid, each 16px art pixel occupies 2x2 live pixels.
  return ditherLevel(level, wx * 2 + sx, wy * 2 + sy, levels);
}

// M12 G3 — R3 LOCKED 2026-08-03 by Ray — B2 Cyclopean-strength per-family density
// is the shipped default. Water stipples fine and calm; rock coarse and busy
// (Cyclopean-study §3: gray as black/white dot density at varying strength).
// DITHER_AMP_DEFAULT is the unknown/non-terrain fallback only — not a terrain density.
export const DITHER_AMP_DEFAULT = 0.85;
export function ditherDensity(tileId) {
  const byFamily = { DEEP: 0.08, WATER: 0.12, SAND: 1.4, GRASS: 0.3, FOREST: 1.8, HILL: 2.4, MOUNT: 3.2 };
  return Object.prototype.hasOwnProperty.call(byFamily, tileId) ? byFamily[tileId] : DITHER_AMP_DEFAULT;
}

// Sparse accent hit: true for a fraction (`chance`) of sub-pixels, chosen by a
// hash so the accent scatters like a glint rather than flooding the surface. This
// is the study's "color concentrates on meaningful matter" move (water glint,
// blood, gold) — a few dithered dots of the second hue over the grayscale base.
export function accentHit(wx, wy, sx, sy, seed, chance) {
  if (!(chance > 0)) return false;
  return hash2(wx * 7 + sx, wy * 7 + sy, (seed ^ 0xacce7) >>> 0) < chance;
}
