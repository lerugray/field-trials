// png.mjs — minimal dependency-free PNG decode/encode for the hero paint-over pipeline.
//
// Node's zlib is the only thing used. Decodes colour types 0/2/3/4/6 at bit depth 8
// (plus 1/2/4-bit palette/grayscale, which the rig sheets and the Vania pack both use
// in places), and encodes 8-bit RGBA. Everything in the pipeline works on a flat
// RGBA Uint8Array so no library-specific image object leaks past this module.

import { inflateSync, deflateSync } from 'node:zlib';
import { readFileSync, writeFileSync } from 'node:fs';

const SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

// ---------------------------------------------------------------- CRC32

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

// ---------------------------------------------------------------- decode

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

function unfilter(raw, width, height, bpp, bytesPerRow) {
  const out = Buffer.alloc(height * bytesPerRow);
  let pos = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[pos++];
    const line = raw.subarray(pos, pos + bytesPerRow);
    pos += bytesPerRow;
    const cur = out.subarray(y * bytesPerRow, (y + 1) * bytesPerRow);
    const prev = y > 0 ? out.subarray((y - 1) * bytesPerRow, y * bytesPerRow) : null;
    for (let x = 0; x < bytesPerRow; x++) {
      const a = x >= bpp ? cur[x - bpp] : 0;
      const b = prev ? prev[x] : 0;
      const c = prev && x >= bpp ? prev[x - bpp] : 0;
      const v = line[x];
      switch (filter) {
        case 0: cur[x] = v; break;
        case 1: cur[x] = (v + a) & 0xff; break;
        case 2: cur[x] = (v + b) & 0xff; break;
        case 3: cur[x] = (v + ((a + b) >> 1)) & 0xff; break;
        case 4: cur[x] = (v + paeth(a, b, c)) & 0xff; break;
        default: throw new Error(`unsupported PNG filter ${filter} on row ${y}`);
      }
    }
  }
  return out;
}

/** Read `bits`-wide sample #i out of a packed scanline. */
function sampleAt(row, i, bits) {
  if (bits === 8) return row[i];
  const per = 8 / bits;
  const byte = row[Math.floor(i / per)];
  const shift = 8 - bits * ((i % per) + 1);
  return (byte >> shift) & ((1 << bits) - 1);
}

/**
 * Decode a PNG file into { width, height, data } where data is RGBA8.
 * Interlaced PNGs are rejected loudly rather than decoded wrong.
 */
export function decodePNG(path) {
  const buf = readFileSync(path);
  if (!buf.subarray(0, 8).equals(SIG)) throw new Error(`${path}: not a PNG`);

  let width = 0, height = 0, depth = 8, colorType = 6, interlace = 0;
  let palette = null, trns = null;
  const idat = [];

  let p = 8;
  while (p < buf.length) {
    const len = buf.readUInt32BE(p);
    const type = buf.toString('ascii', p + 4, p + 8);
    const body = buf.subarray(p + 8, p + 8 + len);
    if (type === 'IHDR') {
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      depth = body[8];
      colorType = body[9];
      interlace = body[12];
    } else if (type === 'PLTE') {
      palette = body;
    } else if (type === 'tRNS') {
      trns = Buffer.from(body);
    } else if (type === 'IDAT') {
      idat.push(Buffer.from(body));
    } else if (type === 'IEND') {
      break;
    }
    p += 12 + len;
  }

  if (interlace) throw new Error(`${path}: interlaced PNG not supported`);
  if (depth === 16) throw new Error(`${path}: 16-bit PNG not supported`);

  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[colorType];
  if (!channels) throw new Error(`${path}: unsupported colour type ${colorType}`);

  const bitsPerPixel = channels * depth;
  const bytesPerRow = Math.ceil((width * bitsPerPixel) / 8);
  const bpp = Math.max(1, Math.ceil(bitsPerPixel / 8));
  const raw = unfilter(inflateSync(Buffer.concat(idat)), width, height, bpp, bytesPerRow);

  const data = new Uint8Array(width * height * 4);
  const maxVal = (1 << depth) - 1;
  const scale = 255 / maxVal;

  for (let y = 0; y < height; y++) {
    const row = raw.subarray(y * bytesPerRow, (y + 1) * bytesPerRow);
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4;
      if (colorType === 3) {
        const idx = sampleAt(row, x, depth);
        data[o] = palette[idx * 3];
        data[o + 1] = palette[idx * 3 + 1];
        data[o + 2] = palette[idx * 3 + 2];
        data[o + 3] = trns && idx < trns.length ? trns[idx] : 255;
      } else if (colorType === 0) {
        const g = Math.round(sampleAt(row, x, depth) * scale);
        data[o] = data[o + 1] = data[o + 2] = g;
        data[o + 3] = 255;
      } else if (colorType === 4) {
        data[o] = data[o + 1] = data[o + 2] = row[x * 2];
        data[o + 3] = row[x * 2 + 1];
      } else if (colorType === 2) {
        data[o] = row[x * 3];
        data[o + 1] = row[x * 3 + 1];
        data[o + 2] = row[x * 3 + 2];
        data[o + 3] = 255;
      } else {
        data[o] = row[x * 4];
        data[o + 1] = row[x * 4 + 1];
        data[o + 2] = row[x * 4 + 2];
        data[o + 3] = row[x * 4 + 3];
      }
    }
  }

  return { width, height, data };
}

// ---------------------------------------------------------------- encode

function chunk(type, body) {
  const out = Buffer.alloc(12 + body.length);
  out.writeUInt32BE(body.length, 0);
  out.write(type, 4, 'ascii');
  body.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + body.length)), 8 + body.length);
  return out;
}

/** Encode an RGBA8 image ({width,height,data}) as a PNG file. */
export function encodePNG(path, img) {
  const { width, height, data } = img;
  const bytesPerRow = width * 4;
  const raw = Buffer.alloc(height * (bytesPerRow + 1));
  for (let y = 0; y < height; y++) {
    raw[y * (bytesPerRow + 1)] = 0; // filter: none — these are tiny, flat images
    Buffer.from(data.buffer, data.byteOffset + y * bytesPerRow, bytesPerRow)
      .copy(raw, y * (bytesPerRow + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  writeFileSync(path, Buffer.concat([
    SIG,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]));
}

// ---------------------------------------------------------------- helpers

export function makeImage(width, height) {
  return { width, height, data: new Uint8Array(width * height * 4) };
}

export function getPx(img, x, y) {
  if (x < 0 || y < 0 || x >= img.width || y >= img.height) return [0, 0, 0, 0];
  const o = (y * img.width + x) * 4;
  return [img.data[o], img.data[o + 1], img.data[o + 2], img.data[o + 3]];
}

export function setPx(img, x, y, rgba) {
  if (x < 0 || y < 0 || x >= img.width || y >= img.height) return;
  const o = (y * img.width + x) * 4;
  img.data[o] = rgba[0];
  img.data[o + 1] = rgba[1];
  img.data[o + 2] = rgba[2];
  img.data[o + 3] = rgba[3] === undefined ? 255 : rgba[3];
}

export function alphaAt(img, x, y) {
  if (x < 0 || y < 0 || x >= img.width || y >= img.height) return 0;
  return img.data[(y * img.width + x) * 4 + 3];
}

/** Copy a sub-rectangle out of an image. */
export function cropImage(img, sx, sy, w, h) {
  const out = makeImage(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) setPx(out, x, y, getPx(img, sx + x, sy + y));
  }
  return out;
}

/** Blit src onto dst at (dx,dy), skipping fully transparent source pixels. */
export function blit(dst, src, dx, dy) {
  for (let y = 0; y < src.height; y++) {
    for (let x = 0; x < src.width; x++) {
      const px = getPx(src, x, y);
      if (px[3] === 0) continue;
      setPx(dst, dx + x, dy + y, px);
    }
  }
}

/** Integer nearest-neighbour upscale — the only scaling this pipeline ever does. */
export function scaleNearest(img, factor) {
  const out = makeImage(img.width * factor, img.height * factor);
  for (let y = 0; y < out.height; y++) {
    for (let x = 0; x < out.width; x++) {
      setPx(out, x, y, getPx(img, Math.floor(x / factor), Math.floor(y / factor)));
    }
  }
  return out;
}

export function hflip(img) {
  const out = makeImage(img.width, img.height);
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) setPx(out, img.width - 1 - x, y, getPx(img, x, y));
  }
  return out;
}

export function hex(r, g, b) {
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

export function parseHex(h) {
  const s = h.replace('#', '');
  return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16), 255];
}

/** Map of "#rrggbb" -> opaque pixel count. Alpha < 128 is treated as absent. */
export function colorHistogram(img) {
  const counts = new Map();
  for (let i = 0; i < img.width * img.height; i++) {
    const a = img.data[i * 4 + 3];
    if (a < 128) continue;
    const k = hex(img.data[i * 4], img.data[i * 4 + 1], img.data[i * 4 + 2]);
    counts.set(k, (counts.get(k) || 0) + 1);
  }
  return counts;
}
