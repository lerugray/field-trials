#!/usr/bin/env node
// extract-font.mjs — AUTHORING STEP. Rasterizes the shipped Not Jam "Undead
// Pixel 8" glyph sheet into src/font-data.js, the bitmap table the game renders
// from.
//
//   node scripts/extract-font.mjs        # rewrite src/font-data.js
//   node scripts/extract-font.mjs --check  # verify the committed table matches
//
// WHY A GENERATED TABLE, not a runtime PNG blit: pixelTextWidth() must be exact
// and SYNCHRONOUS in plain Node — the text gate, the layout gate, the catalog
// and every render test measure text with no DOM and no Image. A table also
// means the face is present on the first painted frame (no async decode) and
// every lit cell stays an integer fillRect, which is the crisp-scaling law in
// src/pixel-font.js. The sheet is the source of truth; this script is the only
// path from it to the table.
//
// Source: materials/fonts/not-jam-undead-pixel-8/ (Not Jam, CC0 — Licence.txt
// ships beside it, the credit ships in ATTRIBUTION.md and the credits screen).

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FONT_DIR = resolve(ROOT, 'materials/fonts/not-jam-undead-pixel-8');
const SHEET = resolve(FONT_DIR, 'Glyphs.png');
const METRICS = resolve(FONT_DIR, 'Undead Pixel 8.json');
const OUT = resolve(ROOT, 'src/font-data.js');

// ---- a minimal, dependency-free PNG reader (8-bit, non-interlaced) ----------
function decodePng(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('not a PNG');
  let pos = 8, idat = [], ihdr = null, plte = null, trns = null;
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const body = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      ihdr = {
        w: body.readUInt32BE(0), h: body.readUInt32BE(4),
        depth: body[8], color: body[9], interlace: body[12],
      };
      if (ihdr.depth !== 8) throw new Error(`unsupported bit depth ${ihdr.depth}`);
      if (ihdr.interlace) throw new Error('interlaced PNG unsupported');
    } else if (type === 'PLTE') plte = Buffer.from(body);
    else if (type === 'tRNS') trns = Buffer.from(body);
    else if (type === 'IDAT') idat.push(Buffer.from(body));
    else if (type === 'IEND') break;
    pos += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[ihdr.color];
  const bpp = channels;
  const stride = ihdr.w * channels;
  const out = Buffer.alloc(ihdr.h * stride);
  let prev = Buffer.alloc(stride);
  let p = 0;
  for (let y = 0; y < ihdr.h; y++) {
    const filter = raw[p++];
    const line = Buffer.from(raw.subarray(p, p + stride)); p += stride;
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? line[i - bpp] : 0;
      const b = prev[i];
      const c = i >= bpp ? prev[i - bpp] : 0;
      if (filter === 1) line[i] = (line[i] + a) & 255;
      else if (filter === 2) line[i] = (line[i] + b) & 255;
      else if (filter === 3) line[i] = (line[i] + ((a + b) >> 1)) & 255;
      else if (filter === 4) {
        const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c);
        line[i] = (line[i] + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 255;
      }
    }
    line.copy(out, y * stride);
    prev = line;
  }
  // luminance + alpha lookup, the only two things the slicer needs
  const lum = new Uint8Array(ihdr.w * ihdr.h);
  const alpha = new Uint8Array(ihdr.w * ihdr.h);
  for (let y = 0; y < ihdr.h; y++) {
    for (let x = 0; x < ihdr.w; x++) {
      const i = y * stride + x * channels;
      let r, g, b, a = 255;
      if (ihdr.color === 6) { r = out[i]; g = out[i + 1]; b = out[i + 2]; a = out[i + 3]; }
      else if (ihdr.color === 2) { r = out[i]; g = out[i + 1]; b = out[i + 2]; }
      else if (ihdr.color === 0) { r = g = b = out[i]; }
      else if (ihdr.color === 4) { r = g = b = out[i]; a = out[i + 1]; }
      else { const idx = out[i]; r = plte[idx * 3]; g = plte[idx * 3 + 1]; b = plte[idx * 3 + 2]; a = trns && idx < trns.length ? trns[idx] : 255; }
      lum[y * ihdr.w + x] = (r + g + b) / 3;
      alpha[y * ihdr.w + x] = a;
    }
  }
  return { w: ihdr.w, h: ihdr.h, lum, alpha };
}

// ---- slice ------------------------------------------------------------------
// The sheet is a ruled grid: light rule lines box each glyph cell. Detect the
// pitch from the rules rather than trusting the metrics JSON's offsets, then
// take the cell interior. Ink is any dark opaque pixel; the rules are light.
// A rule line is a near-solid run of ONE mid-light value (the sheet's rules are
// flat #d0d0d0). A luminance BAND is not enough to identify them: the light
// checkerboard inside empty cells also lives in that band, and it lit up 101
// false "rows" on the first pass. Requiring a single dominant value rejects it.
const RULE_MIN = 180, RULE_MAX = 250, RULE_SHARE = 0.85;

/** True when one mid-light luminance owns almost the whole line. */
function isRuleLine(img, len, at) {
  const tally = new Map();
  for (let i = 0; i < len; i++) {
    const { v, a } = at(i);
    if (a <= 127 || v < RULE_MIN || v >= RULE_MAX) continue;
    tally.set(v, (tally.get(v) || 0) + 1);
  }
  for (const n of tally.values()) if (n > len * RULE_SHARE) return true;
  return false;
}

function detectGrid(img) {
  const cols = [], rows = [];
  for (let x = 0; x < img.w; x++) {
    if (isRuleLine(img, img.h, (y) => ({ v: img.lum[y * img.w + x], a: img.alpha[y * img.w + x] }))) cols.push(x);
  }
  for (let y = 0; y < img.h; y++) {
    if (isRuleLine(img, img.w, (x) => ({ v: img.lum[y * img.w + x], a: img.alpha[y * img.w + x] }))) rows.push(y);
  }
  if (cols.length < 2 || rows.length < 2) throw new Error('could not detect the glyph grid rules');
  // The pitch is the modal gap; anything off that lattice is noise (a glyph row
  // that happens to be near-solid, say) and is dropped.
  const onLattice = (list) => {
    const gaps = new Map();
    for (let i = 1; i < list.length; i++) {
      const d = list[i] - list[i - 1];
      gaps.set(d, (gaps.get(d) || 0) + 1);
    }
    let pitch = 0, best = -1;
    for (const [d, n] of gaps) if (n > best) { best = n; pitch = d; }
    const origin = list[0] % pitch;
    return { pitch, kept: list.filter((v) => v % pitch === origin) };
  };
  const c = onLattice(cols), r = onLattice(rows);
  return { cols: c.kept, rows: r.kept, cellW: c.pitch - 1, cellH: r.pitch - 1 };
}

function isInk(img, x, y) {
  return img.alpha[y * img.w + x] > 127 && img.lum[y * img.w + x] < 128;
}

function extract() {
  for (const p of [SHEET, METRICS]) {
    if (!existsSync(p)) throw new Error(`font source missing: ${relative(ROOT, p)}`);
  }
  const meta = JSON.parse(readFileSync(METRICS, 'utf8').replace(/^﻿/, ''));
  const img = decodePng(readFileSync(SHEET));
  const { cols, rows, cellW, cellH } = detectGrid(img);

  // Raw cells, still full-height so every glyph keeps a shared baseline.
  const cells = new Map();
  meta['in-glyphs'].forEach((line, r) => {
    [...line].forEach((ch, c) => {
      if (r >= rows.length || c >= cols.length) return;
      const x0 = cols[c] + 1, y0 = rows[r] + 1;
      const bits = [];
      for (let yy = 0; yy < cellH; yy++) {
        let row = '';
        for (let xx = 0; xx < cellW; xx++) row += isInk(img, x0 + xx, y0 + yy) ? '1' : '0';
        bits.push(row);
      }
      cells.set(ch, bits);
    });
  });

  // The face's true vertical extent across every inked glyph — this, not the
  // metrics JSON, is the cell height the leading law is computed from.
  let top = cellH, bottom = -1;
  for (const [ch, bits] of cells) {
    if (ch === ' ') continue;
    bits.forEach((row, i) => { if (row.includes('1')) { if (i < top) top = i; if (i > bottom) bottom = i; } });
  }
  const height = bottom - top + 1;

  // Horizontal trim per glyph (the renderer advances by ink width + 1, so the
  // sheet's uniform 14px cell bearings are not carried into the raster).
  const glyphs = {};
  let widest = 0;
  for (const [ch, bits] of cells) {
    const box = bits.slice(top, bottom + 1);
    let left = cellW, right = -1;
    for (const row of box) {
      for (let i = 0; i < row.length; i++) if (row[i] === '1') { if (i < left) left = i; if (i > right) right = i; }
    }
    if (right < 0) { glyphs[ch] = []; continue; } // blank (space and kin)
    glyphs[ch] = box.map((row) => row.slice(left, right + 1));
    widest = Math.max(widest, right - left + 1);
  }

  // The sheet marks the SPACE cell with a short baseline bar — a visible-width
  // indicator, not a glyph. Read its width as the space advance, then blank it,
  // or every word gap in the game renders as an underscore. ('_' keeps its own
  // identical-looking bar, which is a real glyph and is left alone.)
  const spaceMark = glyphs[' '] && glyphs[' '].length ? (glyphs[' '][0] || '').length : 0;
  const spaceAdvance = spaceMark > 1 ? spaceMark - 1 : 3;
  glyphs[' '] = [];

  // Cap height (an unaccented capital) and x-height, reported for the record.
  const capRows = glyphs['H'] ? glyphs['H'].filter((r) => r.includes('1')).length : 0;
  const xRows = glyphs['x'] ? glyphs['x'].filter((r) => r.includes('1')).length : 0;
  const ascent = glyphs['H'] ? glyphs['H'].findIndex((r) => r.includes('1')) : 0;

  return { meta, glyphs, height, widest, capRows, xRows, ascent, spaceAdvance, count: Object.keys(glyphs).length };
}

function emit(data) {
  const { meta, glyphs, height, widest, capRows, xRows, spaceAdvance } = data;
  // Deterministic order: printable ASCII first, then the rest by code point.
  const keys = Object.keys(glyphs).sort((a, b) => a.codePointAt(0) - b.codePointAt(0));
  const body = keys.map((ch) => {
    const rows = glyphs[ch].map((r) => `'${r}'`).join(',');
    return `  ${JSON.stringify(ch)}: [${rows}],`;
  }).join('\n');
  return `// font-data.js — GENERATED by scripts/extract-font.mjs. Do not hand-edit;
// re-run the extractor instead (\`node scripts/extract-font.mjs\`).
//
// THE FACE: "Undead Pixel 8" by Not Jam — a real, designed pixel font, released
// CC0 (public domain). Source sheet + metrics + licence ship in the repo at
// materials/fonts/not-jam-undead-pixel-8/. The credit rides in ATTRIBUTION.md
// and on the in-game credits screen.
//
// Rows are top-to-bottom, '1' = a lit cell. Every glyph shares the same
// ${height}-row box so baselines align; each is trimmed horizontally to its own ink
// and advances by width + 1 (see src/pixel-font.js). Glyphs with no ink (space)
// are the empty array and use the face's space advance.
//
// Metrics: cell ${widest}x${height} max · cap height ${capRows} · x-height ${xRows}
// · space advance ${spaceAdvance} · ${keys.length} glyphs.

export const FONT_NAME = ${JSON.stringify(meta['font-name'])};
export const FONT_AUTHOR = ${JSON.stringify(meta['font-author'] || 'Not Jam')};
export const FONT_LICENSE = 'CC0';
export const FONT_CELL_H = ${height};
export const FONT_CAP_H = ${capRows};
export const FONT_X_H = ${xRows};
export const FONT_SPACE_ADVANCE = ${spaceAdvance};

export const FONT_GLYPHS = {
${body}
};
`;
}

const data = extract();
const source = emit(data);
const check = process.argv.includes('--check');

if (check) {
  const have = existsSync(OUT) ? readFileSync(OUT, 'utf8') : '';
  if (have !== source) {
    console.error('[extract-font] src/font-data.js is STALE — re-run: node scripts/extract-font.mjs');
    process.exit(1);
  }
  console.log(`[extract-font] src/font-data.js matches the sheet (${data.count} glyphs, cell ≤${data.widest}x${data.height})`);
} else {
  writeFileSync(OUT, source, 'utf8');
  console.log(`[extract-font] wrote ${relative(ROOT, OUT)} — ${data.meta['font-name']} (${data.meta['font-license'] || 'CC0'}), `
    + `${data.count} glyphs, cell ≤${data.widest}x${data.height}, cap ${data.capRows}, x-height ${data.xRows}`);
}
