// THE JACQUARD INDEX — glyph coverage decoding (shared by the display + body atlases).
//
// Baked glyph rows are one character per pixel:
//   '.'        no ink
//   '1'..'f'   16-level coverage (hex 1-15), '.' standing in for 0
//   '#'        legacy 1-bit full coverage (older atlases)
//
// WHY COVERAGE AND NOT 1-BIT: the 2026-08-14 bake thresholded at alpha >= 40, so every
// antialiased edge pixel switched fully ON. At 9-14px a condensed face like Oswald has
// counters barely a pixel wide, and flooding the edges CLOSED them: 0 read as D, 3 as 8,
// M as a solid block, S as a blob. The seed subordinates everything to legibility, so the
// atlas now carries real coverage and the framebuffer composites it — which is the same
// source-over primitive hard-rule 3(b) already uses for the light rigs. No new asset
// class, no CDN, no runtime rasterizer: the bitmaps are simply no longer clipped to 1 bit.

// Index by character code for a branch-free lookup in the inner draw loop.
const COVERAGE = new Uint8Array(128);
COVERAGE['#'.charCodeAt(0)] = 255;
for (let v = 1; v <= 15; v++) {
  const ch = v.toString(16); // '1'..'9', 'a'..'f'
  COVERAGE[ch.charCodeAt(0)] = Math.round((v * 255) / 15);
  COVERAGE[ch.toUpperCase().charCodeAt(0)] = Math.round((v * 255) / 15);
}

// Ink alpha for one baked row character, scaled by the caller's own alpha. 0 = skip.
export function coverageAlpha(code, alpha) {
  const cov = code < 128 ? COVERAGE[code] : 0;
  if (cov === 0) return 0;
  if (alpha >= 255) return cov;
  return Math.round((cov * alpha) / 255);
}

export { COVERAGE };
