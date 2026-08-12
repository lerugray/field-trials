// SHOELEATHER — render an M4 art-pass scene to a PNG proof frame (deterministic, node).
//
// The full-pass sibling of render-poc.mjs: renders a code-drawn scene from the
// SCENE_ART registry at native resolution, integer-upscales (nearest), and encodes a
// PNG with the built-in zlib (no image libraries; the game stays zero-dep).
// Usage: node scripts/render-scene.mjs <sceneId> [outfile] [scale]

import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Framebuffer } from '../src/render/framebuffer.js';
import { paintSceneArt, SCENE_ART } from '../src/render/scene-art.js';
import { LOGICAL_W, LOGICAL_H } from '../src/config.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}
function encodePng(fb) {
  const { width: w, height: h, data } = fb;
  const raw = Buffer.alloc(h * (w * 4 + 1));
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    for (let x = 0; x < w; x++) {
      const si = (y * w + x) * 4, di = y * (w * 4 + 1) + 1 + x * 4;
      raw[di] = data[si]; raw[di + 1] = data[si + 1]; raw[di + 2] = data[si + 2]; raw[di + 3] = data[si + 3];
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

const sceneId = process.argv[2];
if (!sceneId || !SCENE_ART[sceneId]) {
  console.error(`usage: node scripts/render-scene.mjs <sceneId> [outfile] [scale]\n  known scenes: ${Object.keys(SCENE_ART).join(', ')}`);
  process.exit(1);
}
const out = process.argv[3] || join(ROOT, 'docs', 'proof', `m4-${sceneId}-20260810.png`);
const scale = parseInt(process.argv[4] || '3', 10);

const fb = new Framebuffer(LOGICAL_W, LOGICAL_H);
paintSceneArt(fb, sceneId);
const up = fb.upscale(scale);
writeFileSync(out, encodePng(up));
console.log(`rendered ${sceneId} ${LOGICAL_W}x${LOGICAL_H} x${scale} -> ${out} (${up.width}x${up.height})`);
