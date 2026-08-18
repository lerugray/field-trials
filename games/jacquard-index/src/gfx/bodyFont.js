// THE JACQUARD INDEX — readable body text (Atkinson Hyperlegible atlas).
//
// Long-form teaching blurbs and sentence help use this face. Titles / HUD / ticket
// stamps use the Oswald display atlas (font.js). Glyphs are pre-baked bitmaps
// (scripts/bake-body-font.py) so the software framebuffer stays pure and the
// single-file build needs no CDN.

import { BODY_FONT_META, BODY_GLYPHS } from './bodyFontData.js';
import { coverageAlpha } from './glyphCoverage.js';

export const BODY_LINE_HEIGHT = BODY_FONT_META.lineHeight;
export const BODY_SIZE = BODY_FONT_META.size;

function glyphFor(ch) {
  return BODY_GLYPHS[ch] || BODY_GLYPHS['?'] || BODY_GLYPHS[' '];
}

export function measureBodyText(text) {
  let w = 0;
  for (const ch of String(text ?? '')) {
    const g = glyphFor(ch);
    w += g.w;
  }
  return w;
}

export function wrapBodyText(text, maxWidth) {
  const words = String(text || '').trim().split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && measureBodyText(candidate) > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines;
}

// Wrap `text` to `maxWidth` and keep only the lines that FIT the caller's box. If any
// line had to be dropped, the last kept line ends in an ellipsis at a word boundary, so
// a reader always sees either the whole text or an honest "there is more" mark — never a
// sentence sliced in half by the next widget drawn over it.
export function fitBodyLines(text, maxWidth, maxLines) {
  if (maxLines <= 0 || maxWidth <= 0) return [];
  const lines = wrapBodyText(text, maxWidth);
  if (lines.length <= maxLines) return lines;
  const kept = lines.slice(0, maxLines);
  const words = kept[maxLines - 1].split(' ');
  while (words.length) {
    const candidate = `${words.join(' ').replace(/[\s,;:.]+$/, '')}...`;
    if (measureBodyText(candidate) <= maxWidth) {
      kept[maxLines - 1] = candidate;
      return kept;
    }
    words.pop();
  }
  kept[maxLines - 1] = '...';
  return kept;
}

// Draw body text into fb. Returns advance width. Unknown chars use '?'.
export function drawBodyText(fb, x, y, text, color) {
  const [r, g, b, a = 255] = color;
  let penX = x | 0;
  const baseY = y | 0;
  for (const ch of String(text ?? '')) {
    const glyph = glyphFor(ch);
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
  }
  return penX - (x | 0);
}

export function drawBodyTextCentered(fb, x, width, y, text, color) {
  const w = measureBodyText(text);
  return drawBodyText(fb, x + Math.round((width - w) / 2), y, text, color);
}
