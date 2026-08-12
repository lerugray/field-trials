// THE JACQUARD INDEX — the board view (drawing a live puzzle in-register).
//
// Renders a Board+Puzzle as a picture on pattern paper: warp/weft ruling with heavier
// rules every five cells, clue counts on the selvedge margins (dimmed as they are
// satisfied), filled cells as textured STITCHES (indigo thread with a dither tooth and a
// diagonal sheen, never a flat box), crossed cells as bare-warp X's, and pencil marks at
// a distinctly lighter weight. A crosshair highlights the active row/column
// (line-tracking spec). Pure: draws into a Framebuffer; returns the layout for
// hit-testing. Every player-caused state has a visible representation the moment it
// changes (action-legibility law).

import { PALETTE } from '../gfx/palette.js';
import { bayer, hash2 } from '../gfx/dither.js';
import { drawText, measureText, textHeight } from '../gfx/font.js';
import {
  FILLED, CROSSED, BLANK, PENCIL_FILL, PENCIL_CROSS,
} from '../puzzle/board.js';
import { displayClue } from '../puzzle/clues.js';

// Compute a grid-aligned layout that fits `region` = {x, y, w, h}. Clues live in margin
// cells of the same size as the board cells (standard nonogram framing).
// `displayClues` (optional) overrides the margin clues (twist shelves, e.g. NEGATIVE CLOTH
// shows gap clues); it does not change the underlying solution, only what the margin reads.
export function computeLayout(puzzle, region, displayClues = null) {
  const rowClues = displayClues ? displayClues.rowClues : puzzle.rowClues;
  const colClues = displayClues ? displayClues.colClues : puzzle.colClues;
  let marginCols = 1;
  for (const c of rowClues) marginCols = Math.max(marginCols, displayClue(c).length);
  let marginRows = 1;
  for (const c of colClues) marginRows = Math.max(marginRows, displayClue(c).length);

  const cols = marginCols + puzzle.width;
  const rows = marginRows + puzzle.height;
  const cell = Math.max(6, Math.floor(Math.min(region.w / cols, region.h / rows)));

  const totalW = cols * cell;
  const totalH = rows * cell;
  const originX = region.x + Math.floor((region.w - totalW) / 2);
  const originY = region.y + Math.floor((region.h - totalH) / 2);

  return {
    cell,
    marginCols,
    marginRows,
    originX,
    originY,
    gridX: originX + marginCols * cell, // top-left of the playable grid
    gridY: originY + marginRows * cell,
    width: puzzle.width,
    height: puzzle.height,
  };
}

// Native pixel -> cell coord, or null if outside the playable grid.
export function hitTest(layout, px, py) {
  const x = Math.floor((px - layout.gridX) / layout.cell);
  const y = Math.floor((py - layout.gridY) / layout.cell);
  if (x < 0 || y < 0 || x >= layout.width || y >= layout.height) return null;
  return { x, y };
}

function digitScale(cell) {
  return Math.max(1, Math.floor((cell - 3) / textHeight(1)));
}

function drawStitch(fb, cx, cy, cell) {
  // A laid indigo stitch: inset block, dither tooth, diagonal thread sheen (compositing).
  const base = PALETTE.indigo;
  const inset = Math.max(1, Math.floor(cell / 10));
  const x0 = cx + inset, y0 = cy + inset;
  const s = cell - inset * 2;
  for (let yy = 0; yy < s; yy++) {
    for (let xx = 0; xx < s; xx++) {
      const tooth = bayer(cx + xx, cy + yy) * 10;
      const grain = (hash2(cx + xx, cy + yy) - 0.5) * 8;
      // Sheen brighter along the top-left to bottom-right thread direction.
      const diag = 1 - Math.abs((xx - yy) / s);
      const sheen = diag * 22;
      fb.setPixel(x0 + xx, y0 + yy, base[0] + tooth + grain + sheen, base[1] + tooth + grain + sheen, base[2] + tooth + grain + sheen + 6, 255);
    }
  }
  // A darker seat at the bottom-right so the stitch sits in the weave.
  fb.fillRect(x0, y0 + s - 1, s, 1, PALETTE.oilDeep[0], PALETTE.oilDeep[1], PALETTE.oilDeep[2], 60);
}

function drawCross(fb, cx, cy, cell, color, alpha) {
  const m = Math.max(2, Math.floor(cell / 4));
  const [r, g, b] = color;
  for (let i = m; i < cell - m; i++) {
    fb.setPixel(cx + i, cy + i, r, g, b, alpha);
    fb.setPixel(cx + (cell - 1 - i), cy + i, r, g, b, alpha);
  }
}

export function drawBoard(fb, board, layout, cursor = null, displayClues = null) {
  const p = board.puzzle;
  const cell = layout.cell;
  const rowClues = displayClues ? displayClues.rowClues : p.rowClues;
  const colClues = displayClues ? displayClues.colClues : p.colClues;

  // Pattern-paper ground under the whole board + margins.
  const totalW = (layout.marginCols + p.width) * cell;
  const totalH = (layout.marginRows + p.height) * cell;
  for (let yy = 0; yy < totalH; yy++) {
    for (let xx = 0; xx < totalW; xx++) {
      const tooth = bayer(xx, yy) * 5;
      fb.setPixel(layout.originX + xx, layout.originY + yy,
        PALETTE.manila[0] + tooth, PALETTE.manila[1] + tooth, PALETTE.manila[2] + tooth, 255);
    }
  }

  // Crosshair: warm wash over the active row and column (line tracking).
  if (cursor && cursor.x >= 0 && cursor.y >= 0) {
    const [hr, hg, hb] = PALETTE.brassLit;
    fb.fillRect(layout.gridX, layout.gridY + cursor.y * cell, p.width * cell, cell, hr, hg, hb, 34);
    fb.fillRect(layout.gridX + cursor.x * cell, layout.gridY, cell, p.height * cell, hr, hg, hb, 34);
  }

  // Cell marks.
  for (let y = 0; y < p.height; y++) {
    for (let x = 0; x < p.width; x++) {
      const cx = layout.gridX + x * cell;
      const cy = layout.gridY + y * cell;
      const prim = board.primaryAt(x, y);
      const pen = board.pencilAt(x, y);
      if (prim === FILLED) drawStitch(fb, cx, cy, cell);
      else if (prim === CROSSED) drawCross(fb, cx, cy, cell, PALETTE.inkSoft, 210);
      else if (pen === PENCIL_FILL) {
        // Tentative fill: a light hatched inset, distinct lower weight than a stitch.
        for (let i = 2; i < cell - 2; i += 2) {
          fb.setPixel(cx + i, cy + 2, PALETTE.indigo[0], PALETTE.indigo[1], PALETTE.indigo[2], 90);
          fb.setPixel(cx + 2, cy + i, PALETTE.indigo[0], PALETTE.indigo[1], PALETTE.indigo[2], 90);
        }
      } else if (pen === PENCIL_CROSS) {
        drawCross(fb, cx, cy, cell, PALETTE.inkSoft, 90);
      }
    }
  }

  // Grid ruling: hairlines every cell, heavier every fifth (nonogram grouping).
  const gl = PALETTE.gridLine;
  const gm = PALETTE.ink;
  for (let gx = 0; gx <= p.width; gx++) {
    const heavy = gx % 5 === 0;
    const c = heavy ? gm : gl;
    fb.vLine(layout.gridX + gx * cell, layout.gridY, p.height * cell, c[0], c[1], c[2], heavy ? 150 : 90);
  }
  for (let gy = 0; gy <= p.height; gy++) {
    const heavy = gy % 5 === 0;
    const c = heavy ? gm : gl;
    fb.hLine(layout.gridX, layout.gridY + gy * cell, p.width * cell, c[0], c[1], c[2], heavy ? 150 : 90);
  }

  // Clue counts on the selvedge margins, dimmed when the line is satisfied.
  const ds = digitScale(cell);
  for (let y = 0; y < p.height; y++) {
    const clue = displayClue(rowClues[y]);
    const dim = board.isRowSatisfied(y);
    const col = dim ? PALETTE.gridMajor : PALETTE.ink;
    // Right-align the sequence against the grid's left edge.
    let rx = layout.gridX - 3;
    for (let i = clue.length - 1; i >= 0; i--) {
      const s = String(clue[i]);
      const w = measureText(s, ds, 1);
      rx -= w;
      drawText(fb, rx, layout.gridY + y * cell + Math.floor((cell - textHeight(ds)) / 2), s, col, ds, 1);
      rx -= Math.floor(cell / 3);
    }
  }
  for (let x = 0; x < p.width; x++) {
    const clue = displayClue(colClues[x]);
    const dim = board.isColSatisfied(x);
    const col = dim ? PALETTE.gridMajor : PALETTE.ink;
    let by = layout.gridY - 3;
    for (let i = clue.length - 1; i >= 0; i--) {
      const s = String(clue[i]);
      by -= textHeight(ds);
      const w = measureText(s, ds, 1);
      drawText(fb, layout.gridX + x * cell + Math.floor((cell - w) / 2), by, s, col, ds, 1);
      by -= Math.floor(cell / 4);
    }
  }

  // A functional ink frame around the whole board.
  fb.strokeRect(layout.originX, layout.originY, totalW, totalH, PALETTE.inkSoft[0], PALETTE.inkSoft[1], PALETTE.inkSoft[2], 160);
  return layout;
}
