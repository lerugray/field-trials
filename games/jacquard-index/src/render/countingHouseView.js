// THE JACQUARD INDEX — the counting-house board view (paired-ledger clues, in-register).
//
// The grid + stitches are the base machine (binary), but the margins are the twist: COLUMN
// clues on top as usual, and on the left ONE ledger per PAIR of rows (not a clue per row),
// drawn centred across the pair with a brass bracket grouping the two rows. The ledger is
// the interleaved-strip run-lengths (countinghouse.js). Pure: draws into a Framebuffer.

import { PALETTE } from '../gfx/palette.js';
import { bayer, hash2 } from '../gfx/dither.js';
import { drawText, measureText, textHeight } from '../gfx/font.js';
import { FILLED, CROSSED } from '../puzzle/board.js';
import { displayClue } from '../puzzle/clues.js';

export function computeCHLayout(puzzle, colClues, pairClues, region) {
  let marginCols = 1;
  for (const c of pairClues) marginCols = Math.max(marginCols, c.length || 1);
  marginCols += 1; // room for the pair bracket
  let marginRows = 1;
  for (const c of colClues) marginRows = Math.max(marginRows, displayClue(c).length);

  const cols = marginCols + puzzle.width;
  const rows = marginRows + puzzle.height;
  const cell = Math.max(8, Math.floor(Math.min(region.w / cols, region.h / rows)));
  const totalW = cols * cell, totalH = rows * cell;
  const originX = region.x + Math.floor((region.w - totalW) / 2);
  const originY = region.y + Math.floor((region.h - totalH) / 2);
  return {
    cell, marginCols, marginRows, originX, originY,
    gridX: originX + marginCols * cell, gridY: originY + marginRows * cell,
    width: puzzle.width, height: puzzle.height,
  };
}

export function hitTestCH(layout, px, py) {
  const x = Math.floor((px - layout.gridX) / layout.cell);
  const y = Math.floor((py - layout.gridY) / layout.cell);
  if (x < 0 || y < 0 || x >= layout.width || y >= layout.height) return null;
  return { x, y };
}

function drawStitch(fb, cx, cy, cell) {
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
function drawCross(fb, cx, cy, cell, color, alpha) {
  const m = Math.max(2, Math.floor(cell / 4));
  const [r, g, b] = color;
  for (let i = m; i < cell - m; i++) { fb.setPixel(cx + i, cy + i, r, g, b, alpha); fb.setPixel(cx + (cell - 1 - i), cy + i, r, g, b, alpha); }
}

// Is a pair's interleaved ledger fully satisfied by the current fills (for dimming)?
function ledgerSatisfied(board, p, width) {
  const yT = p * 2, yB = yT + 1;
  const strip = [];
  for (let x = 0; x < width; x++) {
    strip.push(board.primaryAt(x, yT) === FILLED ? 1 : 0);
    strip.push(board.primaryAt(x, yB) === FILLED ? 1 : 0);
  }
  const runs = []; let run = 0;
  for (const v of strip) { if (v) run++; else if (run > 0) { runs.push(run); run = 0; } }
  if (run > 0) runs.push(run);
  return runs;
}

export function drawCHBoard(fb, board, layout, cursor, puzzle, colClues, pairClues) {
  const cell = layout.cell, w = puzzle.width, h = puzzle.height;
  const totalW = (layout.marginCols + w) * cell, totalH = (layout.marginRows + h) * cell;
  for (let yy = 0; yy < totalH; yy++) for (let xx = 0; xx < totalW; xx++) {
    const tooth = bayer(xx, yy) * 5;
    fb.setPixel(layout.originX + xx, layout.originY + yy, PALETTE.manila[0] + tooth, PALETTE.manila[1] + tooth, PALETTE.manila[2] + tooth, 255);
  }
  if (cursor && cursor.x >= 0) {
    const [hr, hg, hb] = PALETTE.brassLit;
    fb.fillRect(layout.gridX, layout.gridY + cursor.y * cell, w * cell, cell, hr, hg, hb, 34);
    fb.fillRect(layout.gridX + cursor.x * cell, layout.gridY, cell, h * cell, hr, hg, hb, 34);
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const cx = layout.gridX + x * cell, cy = layout.gridY + y * cell;
    const m = board.primaryAt(x, y);
    if (m === FILLED) drawStitch(fb, cx, cy, cell);
    else if (m === CROSSED) drawCross(fb, cx, cy, cell, PALETTE.inkSoft, 210);
  }
  // Grid ruling; heavier every second row to show the pairs.
  const gl = PALETTE.gridLine, gm = PALETTE.ink;
  for (let gx = 0; gx <= w; gx++) { const heavy = gx % 5 === 0; const c = heavy ? gm : gl; fb.vLine(layout.gridX + gx * cell, layout.gridY, h * cell, c[0], c[1], c[2], heavy ? 150 : 90); }
  for (let gy = 0; gy <= h; gy++) { const heavy = gy % 2 === 0; const c = heavy ? gm : gl; fb.hLine(layout.gridX, layout.gridY + gy * cell, w * cell, c[0], c[1], c[2], heavy ? 150 : 80); }

  const ds = Math.max(1, Math.floor((cell - 3) / textHeight(1)));
  // Column clues (top), dimmed when the column is satisfied.
  for (let x = 0; x < w; x++) {
    const clue = displayClue(colClues[x]);
    const dim = board.isColSatisfied(x);
    const col = dim ? PALETTE.gridMajor : PALETTE.ink;
    let by = layout.gridY - 3;
    for (let i = clue.length - 1; i >= 0; i--) {
      by -= textHeight(ds);
      const s = String(clue[i]); const wtxt = measureText(s, ds, 1);
      drawText(fb, layout.gridX + x * cell + Math.floor((cell - wtxt) / 2), by, s, col, ds, 1);
      by -= Math.floor(cell / 4);
    }
  }
  // Pair ledgers (left), one per pair, centred across the two rows, with a bracket.
  for (let p = 0; p < pairClues.length; p++) {
    const yT = p * 2;
    const midY = layout.gridY + yT * cell + cell; // centre line between the two rows
    const clue = pairClues[p].length ? pairClues[p] : [0];
    const runs = ledgerSatisfied(board, p, w);
    const dim = runs.length === clue.length && runs.every((v, i) => v === clue[i]);
    const col = dim ? PALETTE.gridMajor : PALETTE.ink;
    let rx = layout.gridX - 5;
    for (let i = clue.length - 1; i >= 0; i--) {
      const s = String(clue[i]); const wtxt = measureText(s, ds, 1);
      rx -= wtxt;
      drawText(fb, rx, midY - Math.floor(textHeight(ds) / 2), s, col, ds, 1);
      rx -= Math.floor(cell / 3);
    }
    // Brass bracket grouping the pair.
    const bx = layout.originX + Math.floor(cell / 2);
    const y0 = layout.gridY + yT * cell + 2, y1 = layout.gridY + (yT + 2) * cell - 2;
    fb.vLine(bx, y0, y1 - y0, PALETTE.brass[0], PALETTE.brass[1], PALETTE.brass[2], 200);
    fb.hLine(bx, y0, 3, PALETTE.brass[0], PALETTE.brass[1], PALETTE.brass[2], 200);
    fb.hLine(bx, y1, 3, PALETTE.brass[0], PALETTE.brass[1], PALETTE.brass[2], 200);
  }
  fb.strokeRect(layout.originX, layout.originY, totalW, totalH, PALETTE.inkSoft[0], PALETTE.inkSoft[1], PALETTE.inkSoft[2], 160);
  return layout;
}
