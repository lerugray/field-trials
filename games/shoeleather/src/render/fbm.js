// SHOELEATHER — value noise + fBm (the material-texture technique, CLAUDE.md rule 6c).
//
// The VACUUM SEALED stack demands material texture via dither/fBm — no untextured
// vector flats. This is deterministic, seedable value noise with fractal octaves, used
// to break up wall stucco, wood grain, and haze so no surface reads as a flat fill.
// Pure and node-testable.

// Integer hash -> [0,1). Deterministic; no Math.random (which is unavailable here and
// would break reproducible proof frames anyway).
export function hash2(x, y, seed = 0) {
  let h = (x | 0) * 374761393 + (y | 0) * 668265263 + (seed | 0) * 2246822519;
  h = (h ^ (h >>> 13)) >>> 0;
  h = (h * 1274126177) >>> 0;
  return (h & 0xffffff) / 0x1000000;
}

function smooth(t) { return t * t * (3 - 2 * t); } // smoothstep

// Bilinearly-interpolated value noise at a real (x,y).
export function valueNoise(x, y, seed = 0) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const v00 = hash2(xi, yi, seed), v10 = hash2(xi + 1, yi, seed);
  const v01 = hash2(xi, yi + 1, seed), v11 = hash2(xi + 1, yi + 1, seed);
  const u = smooth(xf), v = smooth(yf);
  return (v00 * (1 - u) + v10 * u) * (1 - v) + (v01 * (1 - u) + v11 * u) * v;
}

// Fractal Brownian motion: sum of octaves at increasing frequency, decreasing weight.
// Returns [0,1].
export function fbm(x, y, { octaves = 4, freq = 1, gain = 0.5, lacunarity = 2, seed = 0 } = {}) {
  let sum = 0, amp = 1, norm = 0, f = freq;
  for (let o = 0; o < octaves; o++) {
    sum += amp * valueNoise(x * f, y * f, seed + o * 101);
    norm += amp;
    amp *= gain;
    f *= lacunarity;
  }
  return sum / norm;
}
