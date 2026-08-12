import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  GLYPH_W,
  GLYPH_H,
  SUPPORTED,
  hasGlyph,
  measure,
  drawText,
} from '../src/render/font.js';

// A recording stub 2D context: counts fillRect calls and remembers the last
// fillStyle set, so we can assert drawText paints the right number of pixels
// without a real canvas.
function stubCtx() {
  const ctx = {
    fillRects: [],
    _fillStyle: null,
    set fillStyle(v) {
      this._fillStyle = v;
    },
    get fillStyle() {
      return this._fillStyle;
    },
    fillRect(x, y, w, h) {
      this.fillRects.push([x, y, w, h]);
    },
  };
  return ctx;
}

test('the font covers upper- and lowercase, digits, and core punctuation', () => {
  for (const ch of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') assert.ok(hasGlyph(ch), `missing ${ch}`);
  for (const ch of 'abcdefghijklmnopqrstuvwxyz') assert.ok(hasGlyph(ch), `missing ${ch}`);
  for (const ch of '0123456789') assert.ok(hasGlyph(ch), `missing ${ch}`);
  for (const ch of ' .,:;!?-+/()%&') assert.ok(hasGlyph(ch), `missing punctuation ${ch}`);
});

test('every authored glyph is exactly GLYPH_W x GLYPH_H and only lights valid cells', () => {
  // Draw each supported char at scale 1 and confirm no pixel escapes the cell.
  for (const ch of SUPPORTED) {
    const ctx = stubCtx();
    drawText(ctx, ch, 0, 0, { scale: 1, tracking: 0 });
    for (const [x, y, w, h] of ctx.fillRects) {
      assert.equal(w, 1);
      assert.equal(h, 1);
      assert.ok(x >= 0 && x < GLYPH_W, `${ch}: pixel x=${x} out of 0..${GLYPH_W - 1}`);
      assert.ok(y >= 0 && y < GLYPH_H, `${ch}: pixel y=${y} out of 0..${GLYPH_H - 1}`);
    }
  }
});

test('space is blank and advances the pen', () => {
  const ctx = stubCtx();
  const end = drawText(ctx, ' ', 0, 0, { scale: 1, tracking: 1 });
  assert.equal(ctx.fillRects.length, 0, 'space lights no pixels');
  assert.equal(end, GLYPH_W, 'a single glyph advance is GLYPH_W (no trailing tracking)');
});

test('measure width matches glyphs + interior tracking, no trailing gap', () => {
  assert.equal(measure('', { scale: 2 }).width, 0);
  const one = measure('A', { scale: 2, tracking: 1 });
  assert.equal(one.width, GLYPH_W * 2); // one glyph, no interior gap
  assert.equal(one.height, GLYPH_H * 2);
  const three = measure('ABC', { scale: 3, tracking: 1 });
  // 3 glyphs + 2 interior gaps
  assert.equal(three.width, (3 * GLYPH_W + 2 * 1) * 3);
});

test('drawText fills once per lit pixel and honours scale', () => {
  const ctx1 = stubCtx();
  drawText(ctx1, 'I', 0, 0, { scale: 1, tracking: 0 });
  // 'I' = top bar (5) + stem (5) + bottom bar (5), stem shares two corners -> 13 lit
  const litAtScale1 = ctx1.fillRects.length;
  assert.ok(litAtScale1 > 0);
  const ctx2 = stubCtx();
  drawText(ctx2, 'I', 0, 0, { scale: 3, tracking: 0 });
  assert.equal(ctx2.fillRects.length, litAtScale1, 'same pixel count at any scale');
  for (const [, , w, h] of ctx2.fillRects) {
    assert.equal(w, 3);
    assert.equal(h, 3);
  }
});

test('drawText sets the requested colour', () => {
  const ctx = stubCtx();
  drawText(ctx, 'X', 0, 0, { color: '#E88C3A' });
  assert.equal(ctx.fillStyle, '#E88C3A');
});

test('an unsupported character renders the .notdef box without throwing', () => {
  assert.ok(!hasGlyph('☃')); // snowman: not authored
  const ctx = stubCtx();
  assert.doesNotThrow(() => drawText(ctx, '☃', 0, 0, { scale: 1, tracking: 0 }));
  assert.ok(ctx.fillRects.length > 0, 'notdef paints a visible box');
});

test('aliases fold onto authored glyphs', () => {
  assert.ok(hasGlyph('↑')); // up arrow -> ▲
  assert.ok(hasGlyph('✗')); // ballot X -> ×
  const ctx = stubCtx();
  drawText(ctx, '↑', 0, 0, { scale: 1, tracking: 0 });
  assert.ok(ctx.fillRects.length > 0);
});

test('drawText advances the pen across a multi-glyph run', () => {
  const ctx = stubCtx();
  const end = drawText(ctx, 'AB', 0, 0, { scale: 2, tracking: 1 });
  assert.equal(end, measure('AB', { scale: 2, tracking: 1 }).width);
});
