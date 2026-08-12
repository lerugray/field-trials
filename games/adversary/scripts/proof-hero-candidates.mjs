// Emit the AR2d operator-pick strip from licensed local pack art only.
// The composition is authored at logical resolution and enlarged by the same nearest-neighbor 2x
// used by the shipped game. Candidate frames are an integer 1/2 reduction from Willibab's 72px
// character-creator sheets to a proposed 18px in-game frame by an exact integer 1/4 reduction; the
// current 58px knight and 27x24 walker are copied without scaling.

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PIXEL_FONT_GLYPHS, textWidth } from '../src/render/pixelfont.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const LIBRARY = '/Users/rayweiss/Desktop/Dev Work/pixel-art-library/extracted';
const CREATOR = join(LIBRARY, 'My_Character_Creator_Pack', 'My_Character_Creator_Pack');
const STAMP = '20260808e';
const OUTPUT = join(ROOT, 'docs', 'proofs', `ar2d-${STAMP}`, `hero-candidates-${STAMP}.png`);
const LOGICAL_W = 640;
const LOGICAL_H = 132;
const DISPLAY_SCALE = 2;

const CANDIDATES = [
  { label: 'A', sheet: 'hero7.png' },
  { label: 'B', sheet: 'hero9.png' },
  { label: 'C', sheet: 'hero11.png' },
  { label: 'D', sheet: 'hero13.png' },
  { label: 'E', sheet: 'hero15.png' },
];

const rgba = (hex) => {
  const value = Number.parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255, 255];
};

const canvas = new Uint8Array(LOGICAL_W * LOGICAL_H * 4);

function fillRect(x, y, w, h, color) {
  const [r, g, b, a] = rgba(color);
  for (let py = Math.max(0, y); py < Math.min(LOGICAL_H, y + h); py++) {
    for (let px = Math.max(0, x); px < Math.min(LOGICAL_W, x + w); px++) {
      const offset = (py * LOGICAL_W + px) * 4;
      canvas[offset] = r;
      canvas[offset + 1] = g;
      canvas[offset + 2] = b;
      canvas[offset + 3] = a;
    }
  }
}

function decodePng(path, width, height) {
  const result = spawnSync('ffmpeg', [
    '-v', 'error', '-i', path, '-f', 'rawvideo', '-pix_fmt', 'rgba', 'pipe:1',
  ], { encoding: null, maxBuffer: width * height * 4 + 1024 * 1024 });
  if (result.status !== 0) throw new Error(`ffmpeg could not decode ${path}: ${result.stderr}`);
  if (result.stdout.length !== width * height * 4) {
    throw new Error(`${path}: decoded ${result.stdout.length} bytes, expected ${width * height * 4}`);
  }
  return { pixels: new Uint8Array(result.stdout), width, height };
}

function crop(image, x, y, width, height) {
  const pixels = new Uint8Array(width * height * 4);
  for (let py = 0; py < height; py++) {
    const source = ((y + py) * image.width + x) * 4;
    pixels.set(image.pixels.subarray(source, source + width * 4), py * width * 4);
  }
  return { pixels, width, height };
}

function nearest(image, width, height) {
  const pixels = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    const sy = Math.floor((y * image.height) / height);
    for (let x = 0; x < width; x++) {
      const sx = Math.floor((x * image.width) / width);
      const source = (sy * image.width + sx) * 4;
      const target = (y * width + x) * 4;
      pixels.set(image.pixels.subarray(source, source + 4), target);
    }
  }
  return { pixels, width, height };
}

function opaqueBounds(image) {
  let left = image.width;
  let top = image.height;
  let right = -1;
  let bottom = -1;
  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) {
      if (image.pixels[(y * image.width + x) * 4 + 3] === 0) continue;
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x);
      bottom = Math.max(bottom, y);
    }
  }
  if (right < 0) throw new Error('asset contains no opaque pixels');
  return { left, top, right, bottom, width: right - left + 1, height: bottom - top + 1 };
}

function blit(image, x, y) {
  for (let sy = 0; sy < image.height; sy++) {
    const dy = y + sy;
    if (dy < 0 || dy >= LOGICAL_H) continue;
    for (let sx = 0; sx < image.width; sx++) {
      const dx = x + sx;
      if (dx < 0 || dx >= LOGICAL_W) continue;
      const source = (sy * image.width + sx) * 4;
      const alpha = image.pixels[source + 3];
      if (alpha === 0) continue;
      const target = (dy * LOGICAL_W + dx) * 4;
      if (alpha === 255) {
        canvas.set(image.pixels.subarray(source, source + 4), target);
        continue;
      }
      const inverse = 255 - alpha;
      canvas[target] = Math.round((image.pixels[source] * alpha + canvas[target] * inverse) / 255);
      canvas[target + 1] = Math.round((image.pixels[source + 1] * alpha + canvas[target + 1] * inverse) / 255);
      canvas[target + 2] = Math.round((image.pixels[source + 2] * alpha + canvas[target + 2] * inverse) / 255);
      canvas[target + 3] = 255;
    }
  }
}

function drawText(text, x, y, color, scale = 1) {
  const [r, g, b, a] = rgba(color);
  const chars = [...String(text).toUpperCase()];
  for (let i = 0; i < chars.length; i++) {
    const rows = PIXEL_FONT_GLYPHS[chars[i]] || PIXEL_FONT_GLYPHS['?'];
    const gx = x + i * 5 * scale;
    for (let row = 0; row < 6; row++) {
      for (let col = 0; col < 4; col++) {
        if (rows[row][col] !== '#') continue;
        for (let py = 0; py < scale; py++) {
          for (let px = 0; px < scale; px++) {
            const dx = gx + col * scale + px;
            const dy = y + row * scale + py;
            const offset = (dy * LOGICAL_W + dx) * 4;
            canvas[offset] = r;
            canvas[offset + 1] = g;
            canvas[offset + 2] = b;
            canvas[offset + 3] = a;
          }
        }
      }
    }
  }
}

function centeredText(text, centerX, y, color, scale = 1) {
  drawText(text, Math.round(centerX - textWidth(text, scale) / 2), y, color, scale);
}

function stand(image, centerX, surfaceY) {
  const bounds = opaqueBounds(image);
  const x = Math.round(centerX - image.width / 2);
  const y = surfaceY - 1 - bounds.bottom;
  blit(image, x, y);
  return { ...bounds, drawX: x, drawY: y, footRow: y + bounds.bottom };
}

fillRect(0, 0, LOGICAL_W, LOGICAL_H, '#0b0c12');
fillRect(2, 2, LOGICAL_W - 4, LOGICAL_H - 4, '#14151e');
centeredText('HERO SCALE CANDIDATES', LOGICAL_W / 2, 6, '#f0c84a', 2);
centeredText('LOGICAL 1X SHOWN AT GAME 2X', LOGICAL_W / 2, 21, '#8b90a6');

const current = decodePng(join(ROOT, 'assets', 'art', 'player.png'), 58, 58);
const enemy = decodePng(join(ROOT, 'assets', 'art', 'enemy_walker.png'), 27, 24);
const measurements = [];

for (let index = 0; index < CANDIDATES.length; index++) {
  const candidate = CANDIDATES[index];
  const laneX = index * 128;
  const surfaceY = 104;
  if (index > 0) fillRect(laneX, 30, 1, 96, '#343746');
  centeredText('PICK', laneX + 24, 36, '#8b90a6');
  centeredText('BIG', laneX + 68, 36, '#8b90a6');
  centeredText('FOE', laneX + 105, 36, '#8b90a6');
  centeredText(candidate.label, laneX + 24, 48, '#f0c84a', 2);

  const source = decodePng(join(CREATOR, 'Examples', candidate.sheet), 648, 432);
  const frame = nearest(crop(source, 4 * 72, 0, 72, 72), 18, 18);
  const pickMeasure = stand(frame, laneX + 24, surfaceY);
  const currentMeasure = stand(current, laneX + 68, surfaceY);
  const enemyMeasure = stand(enemy, laneX + 105, surfaceY);
  measurements.push({ candidate: candidate.label, sheet: candidate.sheet, pick: pickMeasure });

  fillRect(laneX + 8, surfaceY, 112, 1, '#cbbd86');
  fillRect(laneX + 8, surfaceY + 1, 112, 2, '#77834b');
  fillRect(laneX + 8, surfaceY + 3, 112, 12, '#393742');
  for (let x = laneX + 12; x < laneX + 116; x += 16) fillRect(x, surfaceY + 7, 9, 1, '#5c6070');

  if (pickMeasure.footRow !== surfaceY - 1 || currentMeasure.footRow !== surfaceY - 1 || enemyMeasure.footRow !== surfaceY - 1) {
    throw new Error(`${candidate.label}: strip ground contact invariant failed`);
  }
}

centeredText('PICK 18 BOX / BIG 58 BOX / FOE 27 X 24', LOGICAL_W / 2, 121, '#8b90a6');

mkdirSync(dirname(OUTPUT), { recursive: true });
if (existsSync(OUTPUT)) throw new Error(`refusing to overwrite ${OUTPUT}`);
const encoded = spawnSync('ffmpeg', [
  '-v', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${LOGICAL_W}x${LOGICAL_H}`,
  '-i', 'pipe:0', '-vf', `scale=${LOGICAL_W * DISPLAY_SCALE}:${LOGICAL_H * DISPLAY_SCALE}:flags=neighbor`,
  '-frames:v', '1', OUTPUT,
], { input: canvas, encoding: null, maxBuffer: 4 * 1024 * 1024 });
if (encoded.status !== 0) throw new Error(`ffmpeg could not encode strip: ${encoded.stderr}`);

console.log(`hero candidate strip: ${OUTPUT}`);
console.log(`current opaque bbox: ${JSON.stringify(opaqueBounds(current))}`);
console.log(`enemy opaque bbox: ${JSON.stringify(opaqueBounds(enemy))}`);
for (const item of measurements) console.log(`${item.candidate} ${item.sheet}: ${JSON.stringify(item.pick)}`);
