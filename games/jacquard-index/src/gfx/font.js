// THE JACQUARD INDEX — register display face (Oswald atlas).
//
// Titles, HUD stamps, catalogue plates, proof badges, and board clue digits use this
// face. Long-form teaching blurbs stay on Atkinson (bodyFont.js). Glyphs are pre-baked
// bitmaps (scripts/bake-display-font.py) so the software framebuffer stays pure and the
// single-file build needs no CDN. Stamp chrome forces caps — mill tabs and job tickets.
//
// `scale` selects a baked native size (vector faces at old 5x7 metrics read poorly):
//   1 → 9px HUD, 2 → 14px plates, 3 → 20px, 4 → 28px, 5 → 36px hero titles.
// `tracking` adds letter-spacing in native px between glyphs.

import { DISPLAY_ATLASES, DISPLAY_FONT_META } from './displayFontData.js';
import { coverageAlpha } from './glyphCoverage.js';

const SCALE_TO_SIZE = {
  1: 9,
  2: 14,
  3: 20,
  4: 28,
  5: 36,
};

// Compatibility aliases: older tests/callers treat these as the unit cell.
export const GLYPH_W = 5;
export const GLYPH_H = 9;

function atlasForScale(scale) {
  const key = SCALE_TO_SIZE[scale] ?? SCALE_TO_SIZE[1];
  const atlas = DISPLAY_ATLASES[String(key)];
  if (!atlas) throw new Error(`display font missing atlas for size ${key}`);
  return atlas;
}

function glyphFor(atlas, ch) {
  // Stamp register: tabs and plates read as caps. Digits/punct pass through.
  const key = /[a-z]/.test(ch) ? ch.toUpperCase() : ch;
  return atlas.glyphs[key] || atlas.glyphs['?'] || atlas.glyphs[' '];
}

export function measureText(text, scale = 1, tracking = 1) {
  if (!text || text.length === 0) return 0;
  const atlas = atlasForScale(scale);
  let w = 0;
  const s = String(text);
  for (let i = 0; i < s.length; i++) {
    w += glyphFor(atlas, s[i]).w;
    if (i < s.length - 1) w += tracking;
  }
  return w;
}

export function textHeight(scale = 1) {
  return atlasForScale(scale).lineHeight;
}

// Draw `text` into `fb` with its top-left at (x, y). `color` is [r,g,b(,a)].
// Returns the advance width (matches measureText).
export function drawText(fb, x, y, text, color, scale = 1, tracking = 1) {
  const [r, g, b, a = 255] = color;
  const atlas = atlasForScale(scale);
  let penX = x | 0;
  const baseY = y | 0;
  const s = String(text ?? '');
  for (let i = 0; i < s.length; i++) {
    const glyph = glyphFor(atlas, s[i]);
    const rows = glyph.rows || [];
    const ox = glyph.ox || 0;
    const oy = glyph.oy || 0;
    for (let gy = 0; gy < rows.length; gy++) {
      const row = rows[gy];
      for (let gx = 0; gx < row.length; gx++) {
        const ink = coverageAlpha(row.charCodeAt(gx), a);
        if (ink === 0) continue;
        fb.setPixel(penX + gx + ox, baseY + gy + oy, r, g, b, ink);
      }
    }
    penX += glyph.w;
    if (i < s.length - 1) penX += tracking;
  }
  return measureText(s, scale, tracking);
}

export function drawTextCentered(fb, x, width, y, text, color, scale = 1, tracking = 1) {
  const w = measureText(text, scale, tracking);
  return drawText(fb, x + Math.round((width - w) / 2), y, text, color, scale, tracking);
}

// Longest prefix of `text` that fits `maxWidth`, ellipsised only when it had to cut.
// Callers previously cut by CHARACTER COUNT (card names at 14 chars, log lines at 90),
// which both truncated names that fit fine and could still overrun a narrow box. Fit is
// a pixel question; measure it.
export function fitText(text, maxWidth, scale = 1, tracking = 1) {
  const s = String(text ?? '');
  if (maxWidth <= 0) return '';
  if (measureText(s, scale, tracking) <= maxWidth) return s;
  const dots = '...';
  const dotsW = measureText(dots, scale, tracking) + tracking;
  let cut = s.length;
  while (cut > 0) {
    const head = s.slice(0, cut).trimEnd();
    if (head && measureText(head, scale, tracking) + dotsW <= maxWidth) return `${head}${dots}`;
    cut--;
  }
  return '';
}

export { DISPLAY_FONT_META };
