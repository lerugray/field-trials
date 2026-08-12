// pixelfont.js — code-drawn 4x6 bitmap UI font. Canvas text rendering is intentionally avoided:
// even with image smoothing disabled, browser-rendered canvas glyphs get anti-aliased. These masks
// are drawn only with integer-coordinate rectangles so the shipped logical canvas stays pixel-crisp.

export const PIXEL_GLYPH_WIDTH = 4;
export const PIXEL_GLYPH_HEIGHT = 6;
export const PIXEL_GLYPH_SPACING = 1;

// Lowercase input is normalized to uppercase by drawPixelText/textWidth. In addition to the brief's
// core punctuation, this contains every symbol currently emitted by HUD, menu, prompt, and dynamic
// move strings. Unknown characters deliberately render as '?' instead of silently disappearing.
export const PIXEL_FONT_GLYPHS = Object.freeze({
  ' ': ['....', '....', '....', '....', '....', '....'],
  A: ['.##.', '#..#', '####', '#..#', '#..#', '#..#'],
  B: ['###.', '#..#', '###.', '#..#', '#..#', '###.'],
  C: ['.###', '#...', '#...', '#...', '#...', '.###'],
  D: ['###.', '#..#', '#..#', '#..#', '#..#', '###.'],
  E: ['####', '#...', '###.', '#...', '#...', '####'],
  F: ['####', '#...', '###.', '#...', '#...', '#...'],
  G: ['.###', '#...', '#.##', '#..#', '#..#', '.###'],
  H: ['#..#', '#..#', '####', '#..#', '#..#', '#..#'],
  I: ['####', '.##.', '.##.', '.##.', '.##.', '####'],
  J: ['..##', '...#', '...#', '...#', '#..#', '.##.'],
  K: ['#..#', '#.#.', '##..', '#.#.', '#.#.', '#..#'],
  L: ['#...', '#...', '#...', '#...', '#...', '####'],
  M: ['#..#', '####', '####', '#..#', '#..#', '#..#'],
  N: ['#..#', '##.#', '##.#', '#.##', '#.##', '#..#'],
  O: ['.##.', '#..#', '#..#', '#..#', '#..#', '.##.'],
  P: ['###.', '#..#', '#..#', '###.', '#...', '#...'],
  Q: ['.##.', '#..#', '#..#', '#.##', '#..#', '.###'],
  R: ['###.', '#..#', '#..#', '###.', '#.#.', '#..#'],
  S: ['.###', '#...', '.##.', '...#', '...#', '###.'],
  T: ['####', '.##.', '.##.', '.##.', '.##.', '.##.'],
  U: ['#..#', '#..#', '#..#', '#..#', '#..#', '.##.'],
  V: ['#..#', '#..#', '#..#', '#..#', '.##.', '.##.'],
  W: ['#..#', '#..#', '#..#', '####', '####', '#..#'],
  X: ['#..#', '#..#', '.##.', '.##.', '#..#', '#..#'],
  Y: ['#..#', '#..#', '.##.', '.##.', '.##.', '.##.'],
  Z: ['####', '...#', '..#.', '.#..', '#...', '####'],
  0: ['.##.', '#..#', '#.##', '##.#', '#..#', '.##.'],
  1: ['.##.', '###.', '.##.', '.##.', '.##.', '####'],
  2: ['###.', '...#', '.##.', '#...', '#...', '####'],
  3: ['###.', '...#', '.##.', '...#', '...#', '###.'],
  4: ['#..#', '#..#', '####', '...#', '...#', '...#'],
  5: ['####', '#...', '###.', '...#', '...#', '###.'],
  6: ['.###', '#...', '###.', '#..#', '#..#', '.##.'],
  7: ['####', '...#', '..#.', '.#..', '.#..', '.#..'],
  8: ['.##.', '#..#', '.##.', '#..#', '#..#', '.##.'],
  9: ['.##.', '#..#', '.###', '...#', '...#', '###.'],
  '/': ['...#', '...#', '..#.', '.#..', '#...', '#...'],
  '!': ['.##.', '.##.', '.##.', '.##.', '....', '.##.'],
  '?': ['###.', '...#', '.##.', '.#..', '....', '.#..'],
  ':': ['....', '.##.', '....', '....', '.##.', '....'],
  '.': ['....', '....', '....', '....', '....', '.##.'],
  ',': ['....', '....', '....', '....', '.##.', '.#..'],
  '-': ['....', '....', '####', '....', '....', '....'],
  '+': ['....', '.#..', '###.', '.#..', '....', '....'],
  '%': ['#..#', '...#', '..#.', '.#..', '#...', '#..#'],
  '<': ['..#.', '.#..', '#...', '.#..', '..#.', '....'],
  '>': ['.#..', '..#.', '...#', '..#.', '.#..', '....'],
  '(': ['..#.', '.#..', '.#..', '.#..', '.#..', '..#.'],
  ')': ['.#..', '..#.', '..#.', '..#.', '..#.', '.#..'],
  '[': ['.##.', '.#..', '.#..', '.#..', '.#..', '.##.'],
  ']': ['.##.', '..#.', '..#.', '..#.', '..#.', '.##.'],
  "'": ['.##.', '.##.', '.#..', '....', '....', '....'],
  '·': ['....', '....', '.##.', '....', '....', '....'],
  '—': ['....', '....', '####', '####', '....', '....'],
  '←': ['....', '.#..', '#...', '####', '#...', '.#..'],
  '→': ['....', '..#.', '...#', '####', '...#', '..#.'],
  '↑': ['.#..', '###.', '#.#.', '.#..', '.#..', '....'],
  '↓': ['....', '.#..', '.#..', '#.#.', '###.', '.#..'],
});

function pixelFontScale(scale) {
  const n = Math.floor(Number(scale));
  return Number.isFinite(n) && n > 0 ? n : 1;
}

function pixelFontCharacters(text) {
  return [...String(text ?? '').toUpperCase()];
}

/** Measured width in logical pixels, including scaled inter-glyph spacing but no trailing space. */
export function textWidth(text, scale = 1) {
  const length = pixelFontCharacters(text).length;
  if (length === 0) return 0;
  const s = pixelFontScale(scale);
  return (length * PIXEL_GLYPH_WIDTH + (length - 1) * PIXEL_GLYPH_SPACING) * s;
}

/** Truncate one line to a measured width, preserving a visible three-dot overflow marker. */
export function fitPixelText(text, maxWidth, scale = 1) {
  const source = String(text ?? '');
  if (textWidth(source, scale) <= maxWidth) return source;
  const suffix = '...';
  if (textWidth(suffix, scale) > maxWidth) {
    let short = '';
    for (const char of suffix) {
      if (textWidth(short + char, scale) > maxWidth) break;
      short += char;
    }
    return short;
  }
  let prefix = '';
  for (const char of source) {
    if (textWidth(prefix + char + suffix, scale) > maxWidth) break;
    prefix += char;
  }
  return prefix.replace(/\s+$/u, '') + suffix;
}

/** Greedy word wrap whose returned lines are each guaranteed to fit maxWidth. */
export function wrapPixelText(text, maxWidth, scale = 1) {
  const words = String(text ?? '').trim().split(/\s+/u).filter(Boolean);
  if (!words.length) return [''];
  const lines = [];
  let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (textWidth(next, scale) <= maxWidth) {
      line = next;
      continue;
    }
    if (line) lines.push(line);
    line = textWidth(word, scale) <= maxWidth ? word : fitPixelText(word, maxWidth, scale);
  }
  if (line) lines.push(line);
  return lines;
}

/** Draw one line of bitmap text with an integer scale. Returns the measured width. */
export function drawPixelText(ctx, text, x, y, color, scale = 1) {
  const chars = pixelFontCharacters(text);
  const s = pixelFontScale(scale);
  const ox = Math.round(x);
  const oy = Math.round(y);
  if (color != null) ctx.fillStyle = color;

  for (let i = 0; i < chars.length; i++) {
    const rows = PIXEL_FONT_GLYPHS[chars[i]] || PIXEL_FONT_GLYPHS['?'];
    const gx = ox + i * (PIXEL_GLYPH_WIDTH + PIXEL_GLYPH_SPACING) * s;
    for (let row = 0; row < PIXEL_GLYPH_HEIGHT; row++) {
      // Coalesce horizontal runs into rectangles without changing the bitmap.
      for (let col = 0; col < PIXEL_GLYPH_WIDTH;) {
        if (rows[row][col] !== '#') { col++; continue; }
        const start = col;
        while (col < PIXEL_GLYPH_WIDTH && rows[row][col] === '#') col++;
        ctx.fillRect(gx + start * s, oy + row * s, (col - start) * s, s);
      }
    }
  }
  return textWidth(text, s);
}
