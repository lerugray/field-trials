// art-proof.mjs — render environment art straight from the rasterizer to PNG.
//
// No browser needed: the vista layer is pure JS over a pixel buffer, so proofs of the
// ART can be produced headlessly and fast. (The full in-game proof set still goes
// through scripts/capture.mjs, which boots the real single-file build — this tool is
// for authoring iterations and for the locale before/after pairs.)
//
//   node scripts/art-proof.mjs [--out DIR] [--scale N] [--seed N]

import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { NATIVE } from '../src/render/px.js';
import { renderVista } from '../src/render/vistas.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');

// ---- a minimal PNG encoder (RGBA, no filtering) -----------------------------
function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = c ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td), 0);
  return Buffer.concat([len, td, crc]);
}
export function encodePNG(rgba, w, h) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;                       // filter: none
    for (let x = 0; x < w * 4; x++) raw[y * (w * 4 + 1) + 1 + x] = rgba[y * w * 4 + x];
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
// nearest-neighbor integer upscale, so a proof shows the pixels as the game shows them
export function upscale(rgba, w, h, s) {
  if (s === 1) return rgba;
  const out = new Uint8ClampedArray(w * s * h * s * 4);
  for (let y = 0; y < h * s; y++) {
    const sy = (y / s) | 0;
    for (let x = 0; x < w * s; x++) {
      const sx = (x / s) | 0;
      const si = (sy * w + sx) * 4, di = (y * w * s + x) * 4;
      out[di] = rgba[si]; out[di + 1] = rgba[si + 1]; out[di + 2] = rgba[si + 2]; out[di + 3] = rgba[si + 3];
    }
  }
  return out;
}
export function writePNG(path, painter, scale = 1) {
  const up = upscale(painter.d, painter.w, painter.h, scale);
  writeFileSync(path, encodePNG(up, painter.w * scale, painter.h * scale));
  return path;
}

// ---- CLI --------------------------------------------------------------------
function main() {
  const args = Object.fromEntries(process.argv.slice(2)
    .filter((a) => a.startsWith('--'))
    .map((a) => { const [k, v] = a.slice(2).split('='); return [k, v === undefined ? true : v]; }));
  const outDir = resolve(ROOT, String(args.out || 'proofs/art'));
  const scale = Number(args.scale || 3);
  const seed = Number(args.seed || 20260810);
  mkdirSync(outDir, { recursive: true });

  const names = { 1: 'midway', 2: 'pier', 3: 'ironworks' };
  const written = [];
  for (const locale of [1, 2, 3]) {
    for (const stage of [1, 2, 3, 4, 'finale']) {
      const p = renderVista({ locale, stage, seed });
      const f = resolve(outDir, `L${locale}-${names[locale]}-s${stage}.png`);
      writePNG(f, p, scale);
      written.push(f);
    }
  }
  console.log(`wrote ${written.length} art proofs to ${outDir} at ${scale}x (${NATIVE.w * scale}x${NATIVE.h * scale})`);
}
// NB: compare against pathToFileURL — the repo path contains a space ("Dev Work"),
// which import.meta.url percent-encodes, so a raw `file://${argv[1]}` never matches.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
