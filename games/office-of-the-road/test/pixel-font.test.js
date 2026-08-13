// Bitmap text regression (OR-1): the game raster must contain solid pixel ink,
// never browser-rasterized partial glyph coverage magnified by display scaling.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { pixelText, pixelTextWidth, glyphRows, PIXEL_FONT } from '../src/pixel-font.js';

function offscreen(width, height) {
  const pixels = new Uint8Array(width * height);
  return {
    pixels,
    ctx: {
      font: '6px monospace', textAlign: 'left', fillStyle: '#fff',
      fillRect(x, y, w, h) {
        assert.ok(Number.isInteger(x) && Number.isInteger(y) && Number.isInteger(w) && Number.isInteger(h));
        for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) {
          if (xx >= 0 && yy >= 0 && xx < width && yy < height) pixels[yy * width + xx] = 255;
        }
      },
    },
  };
}

test('bitmap probe has at least 90% full-luminance ink and no antialiased partials', () => {
  const probe = offscreen(320, 24);
  pixelText(probe.ctx, 'Office 0123 — filed ✓', 2, 2);
  const ink = [...probe.pixels].filter((v) => v > 0);
  const solid = ink.filter((v) => v === 255);
  const partial = ink.filter((v) => v > 0 && v < 255);
  assert.ok(ink.length > 0, 'probe drew visible ink');
  assert.ok(solid.length / ink.length >= 0.9, `solid share ${(solid.length / ink.length * 100).toFixed(1)}%`);
  assert.equal(partial.length, 0, 'bitmap glyphs contain no antialiased partial pixels');
});

test('heading size is an integer 2x expansion of the 5x7 core', () => {
  const p = offscreen(80, 24);
  const small = pixelTextWidth(p.ctx, 'FILE');
  p.ctx.font = '10px monospace';
  assert.equal(pixelTextWidth(p.ctx, 'FILE'), small * 2);
});

test('proportional metrics keep the dense 320px register viable', () => {
  const p = offscreen(320, 24);
  assert.ok(pixelTextWidth(p.ctx, 'routine — winnable without cards') <= 171);
  assert.ok(pixelTextWidth(p.ctx, 'III') < pixelTextWidth(p.ctx, 'WWW'));
});

const GLYPH_PAIR_FLOOR = 3;
/** Pairs the audit flagged or that share gameplay context (glyphs beside digits). */
const CONFUSABLE_PAIRS = [
  ['g', '9'], ['g', '6'], ['g', 'q'], ['p', '9'], ['p', 'b'], ['j', 'i'],
];

function glyphInk(rows) {
  let bits = '';
  for (const row of rows) for (const cell of row) bits += cell;
  return bits;
}

function hamming(a, b) {
  assert.equal(a.length, b.length);
  let d = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) d++;
  return d;
}

test('5x7 confusable pairs meet distinguishability floor (incl. g vs 9)', () => {
  for (const [a, b] of CONFUSABLE_PAIRS) {
    const d = hamming(glyphInk(glyphRows(a)), glyphInk(glyphRows(b)));
    assert.ok(d >= GLYPH_PAIR_FLOOR, `${a} vs ${b}: distance ${d} < ${GLYPH_PAIR_FLOOR}`);
  }
});

test('5x7 face has no duplicate glyph bitmaps among letters and digits', () => {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'.split('');
  const inks = chars.map((ch) => glyphInk(glyphRows(ch)));
  for (let i = 0; i < inks.length; i++) {
    for (let j = i + 1; j < inks.length; j++) {
      assert.notEqual(inks[i], inks[j], `${chars[i]} and ${chars[j]} share an identical bitmap`);
    }
  }
});

test('the game layer has no canvas font-rendering calls', () => {
  const source = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /\.(?:fillText|strokeText|measureText)\s*\(/);
});
