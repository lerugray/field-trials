#!/usr/bin/env node
// Objective text-readability gate (Pickett M10 pattern, adapted for OOR's
// shipped code-drawn bitmap face). Enumerates the COMPLETE player-visible
// catalog, wraps with the live wrapLinesNoEllipsis + pixelTextWidth path, and
// hard-asserts: zero right-edge overflow, zero dropped/clipped words, and a
// minimum ink x-height measured from actual pixelText canvas output.

import { buildTextCatalog } from '../src/text-catalog.js';
import { pixelText, pixelTextWidth, PIXEL_FONT } from '../src/pixel-font.js';
import { wrapLinesNoEllipsis } from '../src/text-wrap.js';
import { TEXT_LEADING, MIN_INTERLINE_GAP, CORE_TEXT_HEIGHT } from '../src/layout.js';

const OVERFLOW_SLACK = 0.5;
const LEADING_FLOOR = TEXT_LEADING;

function measureCtx(fontPx) {
  return { font: `${fontPx}px monospace`, textAlign: 'left', fillStyle: '#fff' };
}

function compactChars(s) {
  return String(s).replace(/\s+/g, '');
}

function droppedContent(text, lines) {
  const orig = compactChars(text);
  const got = compactChars(lines.join(''));
  return got.length < orig.length;
}

function lineHeightFor(fontPx) {
  return fontPx >= 9 ? Math.max(PIXEL_FONT.cellHeight * 2 + MIN_INTERLINE_GAP, Math.ceil(PIXEL_FONT.cellHeight * 2 * 1.35)) : TEXT_LEADING;
}

/** True when a wrapped line is a strict fragment of a source word (mid-word split). */
function intraWordSplits(text, lines) {
  const words = String(text).trim().split(/\s+/).filter(Boolean);
  const hits = [];
  for (const line of lines) {
    const chunk = line.trim();
    if (!chunk) continue;
    for (const word of words) {
      if (!/[A-Za-z]/.test(word)) continue;
      if (chunk === word || word.length < 2) continue;
      if ((word.startsWith(chunk) || word.endsWith(chunk)) && chunk.length < word.length) {
        hits.push({ word, line: chunk });
      }
    }
  }
  return hits;
}

function inkExtent(fontPx, probe = 'xHg') {
  const scale = fontPx >= 9 ? 2 : 1;
  const w = 80;
  const h = 24;
  const pixels = new Uint8Array(w * h);
  const ctx = {
    font: `${fontPx}px monospace`,
    textAlign: 'left',
    fillStyle: '#fff',
    fillRect(x, y, rw, rh) {
      for (let yy = y; yy < y + rh; yy++) for (let xx = x; xx < x + rw; xx++) {
        if (xx >= 0 && yy >= 0 && xx < w && yy < h) pixels[yy * w + xx] = 255;
      }
    },
  };
  pixelText(ctx, probe, 2, 2);
  let top = h, bottom = -1, ink = 0, partial = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const v = pixels[y * w + x];
    if (v === 0) continue;
    ink++;
    if (v < 255) partial++;
    if (y < top) top = y;
    if (y > bottom) bottom = y;
  }
  const height = bottom >= top ? bottom - top + 1 : 0;
  return { height, ink, partial, scale, floor: PIXEL_FONT.cellHeight * scale - 2 };
}

function main() {
  const catalog = buildTextCatalog();
  if (!Number.isInteger(catalog.bodyFontPx) || catalog.bodyFontPx !== 7) {
    console.error(`TEXT GATE FAILED: unexpected non-ratified body size ${catalog.bodyFontPx}px`);
    process.exit(1);
  }

  const failures = [];
  const splitFails = [];
  const leadingFails = [];
  for (const c of catalog.cases) {
    const ctx = measureCtx(c.fontPx);
    const lines = wrapLinesNoEllipsis(ctx, c.text, c.maxWidth, c.maxLines);
    const lh = lineHeightFor(c.fontPx);
    if (c.maxLines > 1 && lh < LEADING_FLOOR) {
      leadingFails.push({ id: c.id, lineHeight: lh, floor: LEADING_FLOOR, gap: lh - CORE_TEXT_HEIGHT, minGap: MIN_INTERLINE_GAP });
    }
    if (c.maxLines > 1 && lh - (c.fontPx >= 9 ? PIXEL_FONT.cellHeight * 2 : CORE_TEXT_HEIGHT) < MIN_INTERLINE_GAP) {
      leadingFails.push({ id: c.id, kind: 'gap', lineHeight: lh, gap: lh - CORE_TEXT_HEIGHT, minGap: MIN_INTERLINE_GAP });
    }
    const splits = intraWordSplits(c.text, lines);
    if (splits.length) splitFails.push({ id: c.id, splits, text: c.text });
    const tooWide = lines
      .map((line) => [line, pixelTextWidth(ctx, line)])
      .filter(([, w]) => w > c.maxWidth + OVERFLOW_SLACK);
    const truncated = droppedContent(c.text, lines);
    if (truncated || tooWide.length) {
      failures.push({
        id: c.id,
        truncated,
        tooWide: tooWide.map(([line, w]) => ({ line, w, maxWidth: c.maxWidth })),
        maxLines: c.maxLines,
        fontPx: c.fontPx,
        text: c.text,
      });
    }
  }

  // Legibility floor: measure actual bitmap ink (not font-metrics approximation).
  const bodyInk = inkExtent(catalog.bodyFontPx);
  const headInk = inkExtent(catalog.headingFontPx);
  const legibilityFails = [];
  if (bodyInk.partial > 0 || headInk.partial > 0) {
    legibilityFails.push({ kind: 'antialias', body: bodyInk, head: headInk });
  }
  if (bodyInk.height < bodyInk.floor) {
    legibilityFails.push({ kind: 'body-xheight', measured: bodyInk.height, floor: bodyInk.floor });
  }
  if (headInk.height < headInk.floor) {
    legibilityFails.push({ kind: 'heading-xheight', measured: headInk.height, floor: headInk.floor });
  }
  if (bodyInk.ink === 0 || headInk.ink === 0) {
    legibilityFails.push({ kind: 'no-ink', body: bodyInk.ink, head: headInk.ink });
  }

  if (failures.length || legibilityFails.length || splitFails.length || leadingFails.length) {
    console.error('TEXT GATE FAILED');
    for (const f of failures) console.error('  -', JSON.stringify(f));
    for (const f of legibilityFails) console.error('  - legibility:', JSON.stringify(f));
    for (const f of splitFails) console.error('  - intra-word split:', JSON.stringify(f));
    for (const f of leadingFails) console.error('  - leading:', JSON.stringify(f));
    console.error(`  catalog cases: ${catalog.cases.length}`);
    console.error(`  wrap failures: ${failures.length}`);
    console.error(`  legibility failures: ${legibilityFails.length}`);
    console.error(`  intra-word splits: ${splitFails.length}`);
    console.error(`  leading failures: ${leadingFails.length}`);
    process.exit(1);
  }

  console.log('TEXT GATE PASSED');
  console.log(`  catalog cases: ${catalog.cases.length}`);
  console.log(`  face: code-drawn ${PIXEL_FONT.cellWidth}×${PIXEL_FONT.cellHeight} bitmap @ shipped ${catalog.bodyFontPx}px (heading ${catalog.headingFontPx}px)`);
  console.log(`  right-edge overflow: 0; dropped words: 0; intra-word splits: 0`);
  console.log(`  leading floor: ${TEXT_LEADING}px (≥1.35×${CORE_TEXT_HEIGHT} / gap≥${MIN_INTERLINE_GAP}px) on multi-line surfaces`);
  console.log(`  ink x-height: body ${bodyInk.height}px (≥${bodyInk.floor}) · heading ${headInk.height}px (≥${headInk.floor}) · partials 0`);
  process.exit(0);
}

main();
