import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Framebuffer } from '../src/gfx/framebuffer.js';
import {
  drawText, drawTextCentered, measureText, textHeight, DISPLAY_FONT_META,
} from '../src/gfx/font.js';
import { DISPLAY_ATLASES } from '../src/gfx/displayFontData.js';
import { SHELVES, shelfCards } from '../src/content/shelves.js';
import { cardBand } from '../src/puzzle/twists.js';

test('display font is Oswald atlas covering printable ASCII at every baked size', () => {
  assert.equal(DISPLAY_FONT_META.family, 'Oswald');
  for (const size of DISPLAY_FONT_META.sizes) {
    const atlas = DISPLAY_ATLASES[String(size)];
    assert.ok(atlas, `missing atlas ${size}`);
    for (let i = 32; i <= 126; i++) {
      const ch = String.fromCharCode(i);
      assert.ok(atlas.glyphs[ch], `size ${size} missing glyph for ${JSON.stringify(ch)}`);
    }
  }
});

test('measureText accounts for proportional advances and tracking', () => {
  assert.ok(measureText('ABC', 1, 1) > measureText('A', 1, 1));
  assert.equal(measureText('A', 1, 1), measureText('A', 1, 0)); // no trailing tracking
  assert.equal(measureText('', 1, 1), 0);
  assert.ok(measureText('II', 1, 2) > measureText('II', 1, 0));
});

test('measureText grows with display scale role', () => {
  assert.ok(measureText('AB', 5, 1) > measureText('AB', 1, 1));
});

test('textHeight follows baked lineHeight for the scale role', () => {
  assert.equal(textHeight(1), DISPLAY_ATLASES['9'].lineHeight);
  assert.equal(textHeight(5), DISPLAY_ATLASES['36'].lineHeight);
});

test('drawText marks at least one pixel for a visible glyph', () => {
  const fb = new Framebuffer(40, 20);
  drawText(fb, 0, 0, 'A', [255, 255, 255]);
  let lit = 0;
  for (let y = 0; y < 20; y++) {
    for (let x = 0; x < 40; x++) {
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
  const fb = new Framebuffer(128, 24);
  const w = drawText(fb, 0, 0, 'INDEX', [0, 0, 0]);
  assert.equal(w, measureText('INDEX', 1, 1));
});

test('title scale draws a larger glyph footprint than HUD scale', () => {
  const small = new Framebuffer(80, 40);
  const large = new Framebuffer(80, 40);
  drawText(small, 0, 0, 'I', [200, 50, 50], 1);
  drawText(large, 0, 0, 'I', [200, 50, 50], 5);
  let litS = 0, litL = 0;
  for (let i = 3; i < small.data.length; i += 4) if (small.data[i] > 0) litS++;
  for (let i = 3; i < large.data.length; i += 4) if (large.data[i] > 0) litL++;
  assert.ok(litL > litS, `title ink ${litL} should exceed HUD ink ${litS}`);
});

test('unknown characters fall back to the ? glyph (no crash, some ink)', () => {
  const fb = new Framebuffer(24, 16);
  assert.doesNotThrow(() => drawText(fb, 0, 0, '~', [255, 255, 255]));
  let lit = 0;
  for (let i = 3; i < fb.data.length; i += 4) if (fb.data[i] > 0) lit++;
  assert.ok(lit > 0);
});

test("semicolon, apostrophe, and asterisk have true glyphs rather than '?' fallback", () => {
  const render = (text) => {
    const fb = new Framebuffer(24, 16);
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
  const lo = new Framebuffer(24, 16);
  const hi = new Framebuffer(24, 16);
  drawText(lo, 0, 0, 'a', [255, 255, 255]);
  drawText(hi, 0, 0, 'A', [255, 255, 255]);
  assert.deepEqual(Array.from(lo.data), Array.from(hi.data));
});

test('drawTextCentered centers within the given width', () => {
  const fb = new Framebuffer(80, 16);
  const text = 'HI';
  const w = measureText(text);
  drawTextCentered(fb, 0, 80, 0, text, [255, 255, 255]);
  const expectedLeft = Math.round((80 - w) / 2);
  let firstCol = -1;
  outer:
  for (let x = 0; x < 80; x++) {
    for (let y = 0; y < 16; y++) {
      if (fb.getPixel(x, y)[3] > 0) { firstCol = x; break outer; }
    }
  }
  assert.ok(Math.abs(firstCol - expectedLeft) <= 2, `firstCol=${firstCol} expected~${expectedLeft}`);
});
