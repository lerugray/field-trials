// noise.js — the material-texture half of the VACUUM SEALED stack (DESIGN-SEED §4.5 item 3):
// an 8x8 Bayer ordered-dither matrix that chooses between adjacent ramp steps, and fractal noise
// (fbm over value noise, 4 octaves) that perturbs the ramp index so a surface reads as stone,
// plaster, rust or paper rather than as a flat fill.
//
// DETERMINISM: the value-noise lattice is built once from a SEEDED stream (rng.js), never from
// Math.random, which is banned everywhere outside the presentation set and greped for by a
// standing test. The same seed gives the same grain, every run, on every machine.
//
// No clock. Nothing here reads or advances game state; the whole module is a pure function of
// (seed, x, y).

import { createRng } from './rng.js';

// ---- the ordered-dither matrix ----------------------------------------------------------------

// The classic 8x8 Bayer threshold matrix, values 0..63. A pixel whose fractional ramp position
// exceeds threshold/64 takes the next step up. That is what puts the crosshatch into the gradients
// instead of a smooth blend, which is the whole point: this is a drawing, not a photograph.
export const BAYER8 = Object.freeze([
  0, 32, 8, 40, 2, 34, 10, 42,
  48, 16, 56, 24, 50, 18, 58, 26,
  12, 44, 4, 36, 14, 46, 6, 38,
  60, 28, 52, 20, 62, 30, 54, 22,
  3, 35, 11, 43, 1, 33, 9, 41,
  51, 19, 59, 27, 49, 17, 57, 25,
  15, 47, 7, 39, 13, 45, 5, 37,
  63, 31, 55, 23, 61, 29, 53, 21,
]);

// dither(x, y) -> a threshold in [0, 1). Add it to a fractional ramp index before flooring.
export function dither(x, y) {
  const i = (y & 7) * 8 + (x & 7);
  return BAYER8[i] / 64;
}

// ---- seeded value noise + fbm ------------------------------------------------------------------

const LATTICE = 256; // power of two so the wrap is a mask, and the grain tiles without a seam

// createNoise(seed) -> { value(x, y), fbm(x, y, octaves) }.
// A value-noise lattice of LATTICE x LATTICE floats, smoothly interpolated. Coordinates are in
// lattice units: pass x / scale to control feature size.
export function createNoise(seed = 'material-breach:grain') {
  const stream = createRng(seed).stream('grain');
  const lattice = new Float32Array(LATTICE * LATTICE);
  for (let i = 0; i < lattice.length; i++) lattice[i] = stream.float();

  function at(ix, iy) {
    return lattice[(iy & (LATTICE - 1)) * LATTICE + (ix & (LATTICE - 1))];
  }

  // Smoothstep-interpolated value noise in [0, 1).
  function value(x, y) {
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const fx = x - x0;
    const fy = y - y0;
    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);
    const a = at(x0, y0);
    const b = at(x0 + 1, y0);
    const c = at(x0, y0 + 1);
    const d = at(x0 + 1, y0 + 1);
    const top = a + (b - a) * sx;
    const bottom = c + (d - c) * sx;
    return top + (bottom - top) * sy;
  }

  // Fractional Brownian motion: octaves of value noise at doubling frequency and halving
  // amplitude, normalised back into [0, 1). Four octaves is the teardown's figure.
  function fbm(x, y, octaves = 4) {
    let sum = 0;
    let amp = 1;
    let norm = 0;
    let fx = x;
    let fy = y;
    for (let o = 0; o < octaves; o++) {
      sum += value(fx, fy) * amp;
      norm += amp;
      amp *= 0.5;
      fx *= 2;
      fy *= 2;
    }
    return sum / norm;
  }

  return { value, fbm };
}

// ---- lighting as compositing -------------------------------------------------------------------

// lightAt(lamps, x, y, ambient) -> a light level in [0, 1].
//
// DESIGN-SEED §4.5 item 2: light is not a translucent gradient painted over finished art. It is a
// scalar that decides WHICH STEP of a ramp a pixel selects. This function computes that scalar and
// nothing else; the renderer turns it into an index.
//
// Falloff is inverse-square-ish but clamped and softened, because a section drawing wants readable
// pools of light around the lamps rather than physical accuracy.
export function lightAt(lamps, x, y, ambient = 0.18) {
  let total = ambient;
  for (const l of lamps) {
    const dx = x - l.x;
    const dy = y - l.y;
    const d2 = dx * dx + dy * dy;
    const r2 = l.radius * l.radius;
    if (d2 >= r2) continue;
    // 1 at the centre, 0 at the radius, with a soft shoulder.
    const t = 1 - d2 / r2;
    total += l.intensity * t * t;
  }
  return total > 1 ? 1 : total;
}
