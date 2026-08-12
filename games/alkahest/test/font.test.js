"use strict";
const { test } = require("node:test");
const assert = require("node:assert");
const AL = require("../src/core.js");
require("../src/framebuffer.js");
require("../src/font.js");

test("font covers A-Z, 0-9, and needed punctuation, all 5x7", () => {
  const need = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 .,!:'-";
  for (const ch of need) {
    const g = AL.FONT.glyphs[ch];
    assert.ok(g, `glyph for '${ch}'`);
    assert.strictEqual(g.length, 7, `'${ch}' has 7 rows`);
    for (const row of g) assert.strictEqual(row.length, 5, `'${ch}' rows are 5 wide`);
  }
});

test("textWidth matches drawn advance", () => {
  assert.strictEqual(AL.textWidth("A", 1, 1), 5);
  assert.strictEqual(AL.textWidth("AB", 1, 1), 11); // 5 + 1 + 5
  assert.strictEqual(AL.textWidth("AB", 2, 1), 22); // (10+2)+10
});

test("drawText renders visible ink and lowercase folds to uppercase", () => {
  const fb = new AL.FrameBuffer(40, 10).clear(0, 0, 0);
  AL.drawText(fb, "hi", 1, 1, [255, 255, 255], { scale: 1 });
  let lit = 0;
  for (let y = 0; y < 10; y++) for (let x = 0; x < 40; x++) if (fb.get(x, y)[0] > 0) lit++;
  assert.ok(lit > 0, "text produced visible pixels");
});

test("drawTextCentered centers within the buffer", () => {
  const fb = new AL.FrameBuffer(40, 10).clear(0, 0, 0);
  const x = AL.drawTextCentered(fb, "AB", 1, [255, 255, 255], { scale: 1, spacing: 1 });
  const w = AL.textWidth("AB", 1, 1);
  assert.strictEqual(x, Math.round((40 - w) / 2));
});

test("engraved text lays a shadow offset under the face", () => {
  const fb = new AL.FrameBuffer(40, 16).clear(0, 0, 0);
  AL.drawTextEngraved(fb, "T", 2, 2, [255, 255, 255], [80, 40, 10], { scale: 2 });
  // both a light face pixel and a darker shadow pixel should exist
  let face = false, shadow = false;
  for (let y = 0; y < 16; y++) for (let x = 0; x < 40; x++) {
    const p = fb.get(x, y);
    if (p[0] > 200) face = true;
    if (p[0] > 40 && p[0] < 120 && p[1] < 80) shadow = true;
  }
  assert.ok(face && shadow, "face and shadow both present");
});
