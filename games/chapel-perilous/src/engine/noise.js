// Deterministic value-noise + fractal Brownian motion for terrain elevation.
// Pure functions of (x, y, seed) — no state, so chunks generate identically
// regardless of streaming order.
import { hash2 } from './prng.js';

function smooth(t) {
  return t * t * (3 - 2 * t); // smoothstep
}

// Bilinearly interpolated hashed-lattice value noise -> [0,1).
export function valueNoise(x, y, seed) {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const v00 = hash2(x0, y0, seed);
  const v10 = hash2(x0 + 1, y0, seed);
  const v01 = hash2(x0, y0 + 1, seed);
  const v11 = hash2(x0 + 1, y0 + 1, seed);
  const sx = smooth(fx);
  const sy = smooth(fy);
  const a = v00 + (v10 - v00) * sx;
  const b = v01 + (v11 - v01) * sx;
  return a + (b - a) * sy;
}

// Fractal sum of octaves. Returns a normalized value in [0,1).
export function fbm(x, y, seed, opts = {}) {
  const octaves = opts.octaves ?? 3;
  const freq = opts.freq ?? 0.08;
  const lacunarity = opts.lacunarity ?? 2;
  const gain = opts.gain ?? 0.5;
  let amp = 1;
  let f = freq;
  let sum = 0;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * valueNoise(x * f, y * f, (seed + i * 1013904223) | 0);
    norm += amp;
    amp *= gain;
    f *= lacunarity;
  }
  return sum / norm;
}
