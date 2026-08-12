import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Framebuffer } from '../src/gfx/framebuffer.js';
import {
  drawText, drawTextCentered, measureText, textHeight, GLYPH_W, GLYPH_H,
} from '../src/gfx/font.js';
import { SHELVES, shelfCards } from '../src/content/shelves.js';
import { cardBand } from '../src/puzzle/twists.js';

test('measureText accounts for glyphs and tracking, no trailing gap', () => {
  // 3 glyphs, scale 1, tracking 1: 3*5 + 2*1 = 17
  assert.equal(measureText('ABC', 1, 1), 17);
  assert.equal(measureText('A', 1, 1), GLYPH_W);
  assert.equal(measureText('', 1, 1), 0);
});

test('measureText scales', () => {
  assert.equal(measureText('AB', 2, 1), (5 + 1) * 2 * 2 - 1 * 2);
});

test('textHeight is glyph height times scale', () => {
  assert.equal(textHeight(1), GLYPH_H);
  assert.equal(textHeight(3), GLYPH_H * 3);
});

test('drawText marks at least one pixel for a visible glyph', () => {
  const fb = new Framebuffer(20, 10);
  drawText(fb, 0, 0, 'A', [255, 255, 255]);
  let lit = 0;
  for (let y = 0; y < 10; y++) {
    for (let x = 0; x < 20; x++) {
      if (fb.getPixel(x, y)[3] > 0) lit++;
    }
  }
  assert.ok(lit > 5, `expected the letter A to light several pixels, got ${lit}`);
});

test('space draws nothing', () => {
  const fb = new Framebuffer(10, 10);
  drawText(fb, 0, 0, ' ', [255, 255, 255]);
  let lit = 0;
  for (let i = 3; i < fb.data.length; i += 4) if (fb.data[i] > 0) lit++;
  assert.equal(lit, 0);
});

test('drawText returns the advance width matching measureText', () => {
  const fb = new Framebuffer(64, 16);
  const w = drawText(fb, 0, 0, 'INDEX', [0, 0, 0]);
  assert.equal(w, measureText('INDEX', 1, 1));
});

test('scale enlarges a glyph pixel into a block', () => {
  const fb = new Framebuffer(20, 20);
  drawText(fb, 0, 0, 'I', [200, 50, 50], 2);
  // 'I' top row is all filled; at scale 2 the top-left 2x2 block is lit.
  assert.deepEqual(fb.getPixel(0, 0), [200, 50, 50, 255]);
  assert.deepEqual(fb.getPixel(1, 1), [200, 50, 50, 255]);
});

test('unknown characters fall back to the ? glyph (no crash, some ink)', () => {
  const fb = new Framebuffer(16, 10);
  assert.doesNotThrow(() => drawText(fb, 0, 0, '~', [255, 255, 255]));
  let lit = 0;
  for (let i = 3; i < fb.data.length; i += 4) if (fb.data[i] > 0) lit++;
  assert.ok(lit > 0);
});

test("semicolon, apostrophe, and asterisk have true 5x7 glyphs rather than '?' fallback", () => {
  const render = (text) => {
    const fb = new Framebuffer(16, 10);
    drawText(fb, 0, 0, text, [255, 255, 255]);
    return Buffer.from(fb.data);
  };
  const fallback = render('?');
  for (const glyph of [';', "'", '*']) {
    assert.notDeepEqual(render(glyph), fallback, `${glyph} must not render as ?`);
  }
  assert.notDeepEqual(render('T*'), render('T?'), 'the T* proof badge must render its true text');
});

test('all 26 T* cards retain their proof text and share the real asterisk glyph', () => {
  const cards = ['two-thread', 'counting-house'].flatMap((id) => {
    const shelf = SHELVES.find((s) => s.id === id);
    return shelfCards(shelf);
  });
  assert.equal(cards.length, 26);
  for (const card of cards) assert.equal(cardBand(card).tierName, 'T*', card.id);
});

test('lowercase maps to caps (same ink as uppercase)', () => {
  const lo = new Framebuffer(16, 10);
  const hi = new Framebuffer(16, 10);
  drawText(lo, 0, 0, 'a', [255, 255, 255]);
  drawText(hi, 0, 0, 'A', [255, 255, 255]);
  assert.deepEqual(Array.from(lo.data), Array.from(hi.data));
});

test('drawTextCentered centers within the given width', () => {
  const fb = new Framebuffer(40, 10);
  const text = 'HI';
  const w = measureText(text);
  drawTextCentered(fb, 0, 40, 0, text, [255, 255, 255]);
  // Left margin should equal right margin (within 1px of rounding).
  const expectedLeft = Math.round((40 - w) / 2);
  // First lit column:
  let firstCol = -1;
  outer:
  for (let x = 0; x < 40; x++) {
    for (let y = 0; y < 10; y++) {
      if (fb.getPixel(x, y)[3] > 0) { firstCol = x; break outer; }
    }
  }
  assert.ok(Math.abs(firstCol - expectedLeft) <= 1, `firstCol=${firstCol} expected~${expectedLeft}`);
});
