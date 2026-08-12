// THE JACQUARD INDEX — ordered dither + value noise (material texture primitive).
//
// Hard-rule 3(c): material texture via dither/fbm. Thread and cloth are this game's
// native use of it, but even the pattern paper wants a faint tooth so it never reads
// as a flat fill (the failing-test question: does it look cheap?). These helpers are
// deterministic and pure — same (x, y) always yields the same value — so a composed
// frame is byte-reproducible and testable.

// 4x4 Bayer matrix, normalized to (-0.5 .. +0.5). Use as a per-pixel threshold or a
// small tone jitter that tiles without banding.
const BAYER4 = [
  0, 8, 2, 10,
  12, 4, 14, 6,
  3, 11, 1, 9,
  15, 7, 13, 5,
];

// Signed dither offset in [-0.5, 0.5) for pixel (x, y).
export function bayer(x, y) {
  const v = BAYER4[((y & 3) * 4) + (x & 3)];
  return (v / 16) - 0.5;
}

// Integer hash -> [0, 1). Deterministic value noise for grain / fbm layers.
export function hash2(x, y) {
  let h = (x | 0) * 374761393 + (y | 0) * 668265263;
  h = (h ^ (h >>> 13)) * 1274126177;
  h = h ^ (h >>> 16);
  return ((h >>> 0) % 65536) / 65536;
}

// Apply a small ordered-dither tone jitter to a base color and return an [r,g,b]
// suitable for setPixel. `amount` is peak jitter in 0..255. Keeps material tooth
// subtle and legible.
export function toothed(color, x, y, amount) {
  const j = bayer(x, y) * amount;
  return [color[0] + j, color[1] + j, color[2] + j];
}
