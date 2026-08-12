// sheet.mjs — contact-sheet composition (labels, grids, zoom) shared by every tool here.
//
// Labels reuse the game's own committed 4x6 bitmap font (src/render/pixelfont.js) rather
// than a second font invented for tooling — one glyph set, one look.

import { PIXEL_FONT_GLYPHS } from '../src/render/pixelfont.js';
import { makeImage, setPx, blit, scaleNearest, parseHex } from './png.mjs';

const GW = 4;
const GH = 6;

export function textWidth(text) {
  return text.length === 0 ? 0 : text.length * (GW + 1) - 1;
}

export function drawText(img, text, x, y, colorHex) {
  const rgba = parseHex(colorHex);
  // The game font has no underscore, so a sheet id like katana_slash rendered as KATANA?SLASH
  // on an operator-facing capture. Normalise rather than extend the shipped font.
  const chars = String(text).toUpperCase().replace(/_/g, '-').split('');
  let cx = x;
  for (const ch of chars) {
    const glyph = PIXEL_FONT_GLYPHS[ch] || PIXEL_FONT_GLYPHS['?'] || PIXEL_FONT_GLYPHS[' '];
    for (let gy = 0; gy < GH; gy++) {
      const row = glyph[gy];
      for (let gx = 0; gx < GW; gx++) {
        if (row[gx] === '#') setPx(img, cx + gx, y + gy, rgba);
      }
    }
    cx += GW + 1;
  }
}

export function fillRect(img, x, y, w, h, colorHex) {
  const rgba = parseHex(colorHex);
  for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) setPx(img, xx, yy, rgba);
}

export function strokeRect(img, x, y, w, h, colorHex) {
  const rgba = parseHex(colorHex);
  for (let xx = x; xx < x + w; xx++) { setPx(img, xx, y, rgba); setPx(img, xx, y + h - 1, rgba); }
  for (let yy = y; yy < y + h; yy++) { setPx(img, x, yy, rgba); setPx(img, x + w - 1, yy, rgba); }
}

/**
 * Compose rows of native-resolution frames into one labelled contact sheet.
 *
 * rows: [{ label, frames: [image], cellLabels?: [string] }]
 * The zoom is applied to the FRAMES ONLY, after composition of the native cell, so the
 * pixel art scales by an exact integer while the label text stays crisp at 1x.
 */
export function contactSheet(rows, {
  zoom = 4,
  bg = '#12121a',
  cellBg = '#1d1d28',
  ink = '#e8e0d0',
  dim = '#7a7a90',
  pad = 6,
  gap = 4,
  titleText = null,
  footerLines = [],
  baseline = null, // optional y (in native frame coords) to mark on each cell
  maxRowWidth = 1400, // wrap wide rows instead of letting one set set the sheet's width
} = {}) {
  // A katana frame is 80px against a 48px idle frame, and its slash arc pushes the content
  // window wider still — left unwrapped, that ONE row set the sheet's width and the other
  // five sat in a third of it with 60% of the image empty. Wrap long rows into continuation
  // lines so the sheet's width is set by the budget, not by its widest animation.
  rows = rows.flatMap((row) => {
    const cellW = row.frames[0].width * zoom + gap;
    const perLine = Math.max(1, Math.floor(maxRowWidth / cellW));
    if (row.frames.length <= perLine) return [row];
    const out = [];
    for (let i = 0; i < row.frames.length; i += perLine) {
      out.push({
        label: i === 0 ? row.label : `${row.label.split('  ')[0]} (cont)`,
        frames: row.frames.slice(i, i + perLine),
        cellLabels: row.cellLabels ? row.cellLabels.slice(i, i + perLine) : undefined,
      });
    }
    return out;
  });

  const labelH = GH + 3;
  const headerH = titleText ? GH + 6 : 0;
  const footerH = footerLines.length ? footerLines.length * (GH + 2) + 4 : 0;

  // Measure
  let maxRowW = 0;
  const rowMetrics = rows.map((row) => {
    const fw = row.frames[0].width;
    const fh = row.frames[0].height;
    const w = row.frames.length * (fw * zoom + gap) - gap;
    maxRowW = Math.max(maxRowW, w, textWidth(row.label));
    return { fw, fh, w, h: fh * zoom };
  });

  const contentW = maxRowW;
  const totalW = contentW + pad * 2;
  let totalH = pad + headerH;
  for (const m of rowMetrics) totalH += labelH + m.h + gap + labelH;
  totalH += footerH + pad;

  const img = makeImage(totalW, totalH);
  fillRect(img, 0, 0, totalW, totalH, bg);

  let y = pad;
  if (titleText) {
    drawText(img, titleText, pad, y, ink);
    y += headerH;
  }

  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    const m = rowMetrics[r];
    drawText(img, row.label, pad, y, ink);
    y += labelH;

    let x = pad;
    for (let i = 0; i < row.frames.length; i++) {
      fillRect(img, x, y, m.fw * zoom, m.h, cellBg);
      if (baseline !== null) {
        fillRect(img, x, y + baseline * zoom, m.fw * zoom, 1, '#2c2c3c');
      }
      blit(img, scaleNearest(row.frames[i], zoom), x, y);
      strokeRect(img, x, y, m.fw * zoom, m.h, '#2a2a38');
      const cl = row.cellLabels ? row.cellLabels[i] : String(i);
      drawText(img, cl, x + 1, y + m.h + 1, dim);
      x += m.fw * zoom + gap;
    }
    y += m.h + gap + labelH;
  }

  if (footerLines.length) {
    y += 2;
    for (const line of footerLines) {
      drawText(img, line, pad, y, dim);
      y += GH + 2;
    }
  }

  return img;
}
