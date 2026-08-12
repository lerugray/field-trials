"use strict";
const { test } = require("node:test");
const assert = require("node:assert");
const zlib = require("node:zlib"); // Node builtin, used only to VERIFY our encoder
const AL = require("../src/core.js");
require("../src/framebuffer.js");
require("../src/png.js");

test("CRC32/Adler32 match known reference values", () => {
  // crc32("IEND") over the ASCII bytes
  const iend = Uint8Array.from("IEND", (c) => c.charCodeAt(0));
  assert.strictEqual(AL._png.crc32(iend) >>> 0, 0xae426082);
  // adler32 of the ASCII string "abc" is 0x024d0127
  const abc = Uint8Array.from("abc", (c) => c.charCodeAt(0));
  assert.strictEqual(AL._png.adler32(abc) >>> 0, 0x024d0127);
});

test("encodePNG emits a valid signature and IHDR", () => {
  const fb = new AL.FrameBuffer(2, 2).clear(1, 2, 3);
  const png = AL.encodePNG(fb);
  assert.deepStrictEqual(
    Array.from(png.slice(0, 8)),
    [137, 80, 78, 71, 13, 10, 26, 10]
  );
  // IHDR length (13) at offset 8..11, then "IHDR"
  assert.strictEqual((png[8] << 24) | (png[9] << 16) | (png[10] << 8) | png[11], 13);
  assert.strictEqual(String.fromCharCode(png[12], png[13], png[14], png[15]), "IHDR");
  // width/height in IHDR data
  const w = (png[16] << 24) | (png[17] << 16) | (png[18] << 8) | png[19];
  const h = (png[20] << 24) | (png[21] << 16) | (png[22] << 8) | png[23];
  assert.strictEqual(w, 2);
  assert.strictEqual(h, 2);
});

test("IDAT stream inflates to correct filtered scanlines (roundtrip)", () => {
  const fb = new AL.FrameBuffer(2, 2);
  fb.set(0, 0, 255, 0, 0);
  fb.set(1, 0, 0, 255, 0);
  fb.set(0, 1, 0, 0, 255);
  fb.set(1, 1, 255, 255, 0);

  const png = AL.encodePNG(fb);

  // locate the IDAT chunk and inflate its data with Node's zlib
  let off = 8;
  let idat = null;
  while (off < png.length) {
    const len = (png[off] << 24) | (png[off + 1] << 16) | (png[off + 2] << 8) | png[off + 3];
    const type = String.fromCharCode(png[off + 4], png[off + 5], png[off + 6], png[off + 7]);
    const data = png.slice(off + 8, off + 8 + len);
    if (type === "IDAT") idat = data;
    off += 12 + len; // len + type(4) + data + crc(4)
  }
  assert.ok(idat, "IDAT present");

  const raw = zlib.inflateSync(Buffer.from(idat));
  // each scanline: 1 filter byte + 2 px * 4 bytes = 9 bytes; 2 rows => 18
  assert.strictEqual(raw.length, 18);
  assert.strictEqual(raw[0], 0); // filter None
  assert.deepStrictEqual(Array.from(raw.slice(1, 9)), [255, 0, 0, 255, 0, 255, 0, 255]);
  assert.strictEqual(raw[9], 0);
  assert.deepStrictEqual(Array.from(raw.slice(10, 18)), [0, 0, 255, 255, 255, 255, 0, 255]);
});

test("encodePNG handles a buffer larger than one stored block boundary", () => {
  // 200x200 RGBA raw = 200*(200*4+1)=160200 bytes > 65535 => multiple blocks
  const fb = new AL.FrameBuffer(200, 200).clear(30, 40, 50);
  const png = AL.encodePNG(fb);
  // find IDAT and confirm it inflates without error to the right size
  let off = 8, idat = null;
  while (off < png.length) {
    const len = (png[off] << 24) | (png[off + 1] << 16) | (png[off + 2] << 8) | png[off + 3];
    const type = String.fromCharCode(png[off + 4], png[off + 5], png[off + 6], png[off + 7]);
    if (type === "IDAT") idat = png.slice(off + 8, off + 8 + len);
    off += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.from(idat));
  assert.strictEqual(raw.length, 200 * (200 * 4 + 1));
});
