/* ALKAHEST -- png: minimal zero-dependency PNG encoder.
 *
 * Encodes a FrameBuffer (RGBA8) to a PNG byte array. Uses DEFLATE "stored"
 * (uncompressed) blocks so we need no zlib. This exists so Node can write REAL,
 * deterministic PROOF FRAMES of the software renderer -- the same buffer the
 * browser blits -- satisfying the LOOK-at-it acceptance law headlessly.
 *
 * Browser-only code never calls this; it is required by scripts/proof.js under
 * Node. Kept dependency-free and small.
 */
;(function (root, factory) {
  var AL = root.AL || (root.AL = {});
  factory(AL);
  if (typeof module !== "undefined" && module.exports) module.exports = AL;
})(typeof self !== "undefined" ? self : globalThis, function (AL) {
  /* ---- CRC32 (PNG chunk integrity) ---- */
  var CRC_TABLE = (function () {
    var t = new Uint32Array(256), c, n, k;
    for (n = 0; n < 256; n++) {
      c = n;
      for (k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();

  function crc32(bytes) {
    var c = 0xffffffff;
    for (var i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }

  /* ---- Adler32 (zlib stream checksum) ---- */
  function adler32(bytes) {
    var a = 1, b = 0, MOD = 65521;
    for (var i = 0; i < bytes.length; i++) {
      a = (a + bytes[i]) % MOD;
      b = (b + a) % MOD;
    }
    return ((b << 16) | a) >>> 0;
  }

  /* ---- DEFLATE stored (uncompressed) stream, wrapped in zlib ---- */
  function zlibStore(raw) {
    var blocks = [];
    var MAX = 65535;
    var pos = 0;
    while (pos < raw.length) {
      var len = Math.min(MAX, raw.length - pos);
      var last = pos + len >= raw.length ? 1 : 0;
      var header = new Uint8Array(5);
      header[0] = last;                 // BFINAL, BTYPE=00 (stored)
      header[1] = len & 0xff;
      header[2] = (len >>> 8) & 0xff;
      header[3] = ~len & 0xff;
      header[4] = (~len >>> 8) & 0xff;
      blocks.push(header, raw.subarray(pos, pos + len));
      pos += len;
    }
    var body = concat(blocks);
    var adler = adler32(raw);
    var out = new Uint8Array(2 + body.length + 4);
    out[0] = 0x78; out[1] = 0x01;       // zlib header (CM=deflate, no dict)
    out.set(body, 2);
    var e = 2 + body.length;
    out[e] = (adler >>> 24) & 0xff;
    out[e + 1] = (adler >>> 16) & 0xff;
    out[e + 2] = (adler >>> 8) & 0xff;
    out[e + 3] = adler & 0xff;
    return out;
  }

  function concat(arrs) {
    var total = 0, i;
    for (i = 0; i < arrs.length; i++) total += arrs[i].length;
    var out = new Uint8Array(total), off = 0;
    for (i = 0; i < arrs.length; i++) { out.set(arrs[i], off); off += arrs[i].length; }
    return out;
  }

  function u32(v) {
    return new Uint8Array([(v >>> 24) & 0xff, (v >>> 16) & 0xff, (v >>> 8) & 0xff, v & 0xff]);
  }

  function chunk(type, data) {
    var typeBytes = new Uint8Array(4);
    for (var i = 0; i < 4; i++) typeBytes[i] = type.charCodeAt(i);
    var body = concat([typeBytes, data]);
    return concat([u32(data.length), body, u32(crc32(body))]);
  }

  /* Encode a FrameBuffer to PNG bytes (Uint8Array). */
  AL.encodePNG = function (fb) {
    var w = fb.w, h = fb.h, src = fb.data;

    // IHDR
    var ihdr = new Uint8Array(13);
    ihdr.set(u32(w), 0);
    ihdr.set(u32(h), 4);
    ihdr[8] = 8;   // bit depth
    ihdr[9] = 6;   // color type RGBA
    ihdr[10] = 0;  // compression
    ihdr[11] = 0;  // filter
    ihdr[12] = 0;  // interlace

    // raw scanlines, each prefixed with filter byte 0 (None)
    var stride = w * 4;
    var raw = new Uint8Array((stride + 1) * h);
    for (var y = 0; y < h; y++) {
      raw[y * (stride + 1)] = 0;
      raw.set(src.subarray(y * stride, y * stride + stride), y * (stride + 1) + 1);
    }

    var sig = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
    return concat([
      sig,
      chunk("IHDR", ihdr),
      chunk("IDAT", zlibStore(raw)),
      chunk("IEND", new Uint8Array(0))
    ]);
  };

  // expose for tests
  AL._png = { crc32: crc32, adler32: adler32 };
});
