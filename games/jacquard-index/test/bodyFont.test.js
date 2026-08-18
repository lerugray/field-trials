import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Framebuffer } from '../src/gfx/framebuffer.js';
import {
  drawBodyText, measureBodyText, wrapBodyText, BODY_LINE_HEIGHT,
} from '../src/gfx/bodyFont.js';
import { BODY_GLYPHS, BODY_FONT_META } from '../src/gfx/bodyFontData.js';
import { drawText } from '../src/gfx/font.js';

test('body font is Atkinson Hyperlegible atlas covering printable ASCII', () => {
  assert.equal(BODY_FONT_META.family, 'Atkinson Hyperlegible');
  for (let i = 32; i <= 126; i++) {
    const ch = String.fromCharCode(i);
    assert.ok(BODY_GLYPHS[ch], `missing glyph for ${JSON.stringify(ch)}`);
  }
});

test('proof-critical punctuation renders as itself, not as ?', () => {
  const fbQ = new Framebuffer(40, 20);
  const fbStar = new Framebuffer(40, 20);
  const fbSemi = new Framebuffer(40, 20);
  const fbApos = new Framebuffer(40, 20);
  drawBodyText(fbQ, 2, 2, '?', [0, 0, 0]);
  drawBodyText(fbStar, 2, 2, '*', [0, 0, 0]);
  drawBodyText(fbSemi, 2, 2, ';', [0, 0, 0]);
  drawBodyText(fbApos, 2, 2, "'", [0, 0, 0]);
  assert.notDeepEqual(Array.from(fbStar.data), Array.from(fbQ.data));
  assert.notDeepEqual(Array.from(fbSemi.data), Array.from(fbQ.data));
  assert.notDeepEqual(Array.from(fbApos.data), Array.from(fbQ.data));
});

test('display face still owns the T* proof badge glyph path', () => {
  const a = new Framebuffer(40, 16);
  const b = new Framebuffer(40, 16);
  drawText(a, 1, 1, 'T*', [0, 0, 0], 1, 1);
  drawText(b, 1, 1, 'T?', [0, 0, 0], 1, 1);
  assert.notDeepEqual(Array.from(a.data), Array.from(b.data));
});

test('wrapBodyText keeps words and respects width', () => {
  const line = 'A clue is run-lengths in order, with a gap between each.';
  const lines = wrapBodyText(line, 180);
  assert.ok(lines.length >= 1);
  assert.equal(lines.join(' '), line);
  for (const l of lines) assert.ok(measureBodyText(l) <= 180);
  assert.ok(BODY_LINE_HEIGHT >= 11);
});
