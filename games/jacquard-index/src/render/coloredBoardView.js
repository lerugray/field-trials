// THE JACQUARD INDEX — the coloured board view (TWO-THREAD, drawn in-register).
//
// Like the base board view, but the two threads are told apart by SHAPE, not hue
// (hard-rule 6): thread A is a SOLID stitch (indigo), thread B is a RING stitch (madder) —
// unmistakable in greyscale. Clue counts on the margin carry the same shape swatch beside
// the number, so the player reads which thread each count belongs to without the colour.
// Bare-warp crosses render as in the base machine. Pure: draws into a Framebuffer.

import { PALETTE } from '../gfx/palette.js';
import { bayer, hash2 } from '../gfx/dither.js';
import { drawText, measureText, textHeight } from '../gfx/font.js';
import { CB_A, CB_B, CB_CROSS } from '../puzzle/coloredBoard.js';

const THREAD_COL = { [CB_A]: PALETTE.indigo, [CB_B]: PALETTE.madder };

export function computeColoredLayout(card, region) {
  const { rowClues, colClues } = card.colored;
  let marginCols = 1;
  for (const c of rowClues) marginCols = Math.max(marginCols, c.length || 1);
  let marginRows = 1;
  for (const c of colClues) marginRows = Math.max(marginRows, c.length || 1);

  const cols = marginCols + card.width;
  const rows = marginRows + card.height;
  const cell = Math.max(8, Math.floor(Math.min(region.w / cols, region.h / rows)));
  const totalW = cols * cell, totalH = rows * cell;
  const originX = region.x + Math.floor((region.w - totalW) / 2);
  const originY = region.y + Math.floor((region.h - totalH) / 2);
  return {
    cell, marginCols, marginRows, originX, originY,
    gridX: originX + marginCols * cell,
    gridY: originY + marginRows * cell,
    width: card.width, height: card.height,
  };
}

export function hitTestColored(layout, px, py) {
  const x = Math.floor((px - layout.gridX) / layout.cell);
  const y = Math.floor((py - layout.gridY) / layout.cell);
  if (x < 0 || y < 0 || x >= layout.width || y >= layout.height) return null;
  return { x, y };
}

// Thread A: a solid indigo stitch with dither tooth + diagonal sheen (matches the base look).
function drawStitchA(fb, cx, cy, cell) {
  const base = PALETTE.indigo;
  const inset = Math.max(1, Math.floor(cell / 10));
  const x0 = cx + inset, y0 = cy + inset, s = cell - inset * 2;
  for (let yy = 0; yy < s; yy++) for (let xx = 0; xx < s; xx++) {
    const tooth = bayer(cx + xx, cy + yy) * 10;
    const grain = (hash2(cx + xx, cy + yy) - 0.5) * 8;
    const diag = 1 - Math.abs((xx - yy) / s);
    const sheen = diag * 22;
    fb.setPixel(x0 + xx, y0 + yy, base[0] + tooth + grain + sheen, base[1] + tooth + grain + sheen, base[2] + tooth + grain + sheen + 6, 255);
  }
}

// Thread B: a madder RING stitch — filled block with a bare-warp centre punched out, so its
// silhouette differs from thread A even with no colour.
function drawStitchB(fb, cx, cy, cell) {
  const base = PALETTE.madder;
  const inset = Math.max(1, Math.floor(cell / 10));
  const x0 = cx + inset, y0 = cy + inset, s = cell - inset * 2;
  const hole = Math.max(2, Math.floor(s / 3));
  const h0 = Math.floor((s - hole) / 2);
  for (let yy = 0; yy < s; yy++) for (let xx = 0; xx < s; xx++) {
    const inHole = xx >= h0 && xx < h0 + hole && yy >= h0 && yy < h0 + hole;
    if (inHole) { // the punched warp centre (manila ground shows through)
      const t = bayer(cx + xx, cy + yy) * 5;
      fb.setPixel(x0 + xx, y0 + yy, PALETTE.manila[0] + t, PALETTE.manila[1] + t, PALETTE.manila[2] + t, 255);
      continue;
    }
    const tooth = bayer(cx + xx, cy + yy) * 9;
    const grain = (hash2(cx + xx, cy + yy) - 0.5) * 8;
    fb.setPixel(x0 + xx, y0 + yy, base[0] + tooth + grain, base[1] + tooth + grain, base[2] + tooth + grain, 255);
  }
}

function drawCross(fb, cx, cy, cell, color, alpha) {
  const m = Math.max(2, Math.floor(cell / 4));
  const [r, g, b] = color;
  for (let i = m; i < cell - m; i++) {
    fb.setPixel(cx + i, cy + i, r, g, b, alpha);
    fb.setPixel(cx + (cell - 1 - i), cy + i, r, g, b, alpha);
  }
}

// A small shape swatch for a clue: solid square (A) or ring square (B), in the thread hue.
function drawSwatch(fb, x, y, size, color, ring) {
  const [r, g, b] = color;
  fb.fillRect(x, y, size, size, r, g, b, 255);
  if (ring) {
    const h = Math.max(1, Math.floor(size / 3));
    const h0 = Math.floor((size - h) / 2);
    fb.fillRect(x + h0, y + h0, h, h, PALETTE.manila[0], PALETTE.manila[1], PALETTE.manila[2], 255);
  }
}

export function drawColoredBoard(fb, board, layout, cursor, card) {
  const cell = layout.cell;
  const w = card.width, h = card.height;
  const totalW = (layout.marginCols + w) * cell;
  const totalH = (layout.marginRows + h) * cell;

  // Pattern-paper ground.
  for (let yy = 0; yy < totalH; yy++) for (let xx = 0; xx < totalW; xx++) {
    const tooth = bayer(xx, yy) * 5;
    fb.setPixel(layout.originX + xx, layout.originY + yy, PALETTE.manila[0] + tooth, PALETTE.manila[1] + tooth, PALETTE.manila[2] + tooth, 255);
  }

  if (cursor && cursor.x >= 0 && cursor.y >= 0) {
    const [hr, hg, hb] = PALETTE.brassLit;
    fb.fillRect(layout.gridX, layout.gridY + cursor.y * cell, w * cell, cell, hr, hg, hb, 34);
    fb.fillRect(layout.gridX + cursor.x * cell, layout.gridY, cell, h * cell, hr, hg, hb, 34);
  }

  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const cx = layout.gridX + x * cell, cy = layout.gridY + y * cell;
    const m = board.markAt(x, y);
    if (m === CB_A) drawStitchA(fb, cx, cy, cell);
    else if (m === CB_B) drawStitchB(fb, cx, cy, cell);
    else if (m === CB_CROSS) drawCross(fb, cx, cy, cell, PALETTE.inkSoft, 210);
  }

  // Grid ruling.
  const gl = PALETTE.gridLine, gm = PALETTE.ink;
  for (let gx = 0; gx <= w; gx++) { const heavy = gx % 5 === 0; const c = heavy ? gm : gl; fb.vLine(layout.gridX + gx * cell, layout.gridY, h * cell, c[0], c[1], c[2], heavy ? 150 : 90); }
  for (let gy = 0; gy <= h; gy++) { const heavy = gy % 5 === 0; const c = heavy ? gm : gl; fb.hLine(layout.gridX, layout.gridY + gy * cell, w * cell, c[0], c[1], c[2], heavy ? 150 : 90); }

  // Coloured clues on the margins: number + shape swatch, in run order.
  const ds = Math.max(1, Math.floor((cell - 3) / textHeight(1)));
  const sw = Math.max(3, Math.floor(cell / 4));
  for (let y = 0; y < h; y++) {
    const clue = card.colored.rowClues[y];
    let rx = layout.gridX - 3;
    for (let i = clue.length - 1; i >= 0; i--) {
      const run = clue[i];
      const s = String(run.len);
      const numW = measureText(s, ds, 1);
      rx -= numW;
      drawText(fb, rx, layout.gridY + y * cell + Math.floor((cell - textHeight(ds)) / 2), s, PALETTE.ink, ds, 1);
      rx -= sw + 2;
      drawSwatch(fb, rx, layout.gridY + y * cell + Math.floor((cell - sw) / 2), sw, THREAD_COL[run.color], run.color === CB_B);
      rx -= Math.floor(cell / 6);
    }
  }
  for (let x = 0; x < w; x++) {
    const clue = card.colored.colClues[x];
    let by = layout.gridY - 3;
    for (let i = clue.length - 1; i >= 0; i--) {
      const run = clue[i];
      by -= sw + 1;
      drawSwatch(fb, layout.gridX + x * cell + Math.floor((cell - sw) / 2), by, sw, THREAD_COL[run.color], run.color === CB_B);
      by -= textHeight(ds) + 1;
      const s = String(run.len);
      const numW = measureText(s, ds, 1);
      drawText(fb, layout.gridX + x * cell + Math.floor((cell - numW) / 2), by, s, PALETTE.ink, ds, 1);
      by -= Math.floor(cell / 8);
    }
  }

  fb.strokeRect(layout.originX, layout.originY, totalW, totalH, PALETTE.inkSoft[0], PALETTE.inkSoft[1], PALETTE.inkSoft[2], 160);
  return layout;
}

// Expose the stitch renderers for the woven-reveal payoff.
export { drawStitchA, drawStitchB };
