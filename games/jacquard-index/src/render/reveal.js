// THE JACQUARD INDEX — the woven reveal (M2: solved patterns render as cloth).
//
// When a card is solved the pattern is WOVEN: filled cells become finished fabric with a
// visible plain-weave (warp over weft, over-under interlace) plus a dither/fbm cloth tooth
// and a soft sheen (light as compositing). Empty cells are the bare loom ground. This is
// the game's native use of the material-texture law (hard-rule 3c).
//
// BINDING ASSERTION (studio amendment): the woven render is pixel-checked against the
// solution grid in the suite, never eyeball-only. `revealLayout` + `isClothAt` give the
// test the exact cell centers and a cloth predicate so it can assert the rendered fabric
// matches the solution cell-for-cell.

import { PALETTE } from '../gfx/palette.js';
import { bayer, hash2 } from '../gfx/dither.js';

// Simple centered grid layout (no clue margins — the reveal is just the picture).
export function revealLayout(puzzle, region) {
  const cell = Math.max(3, Math.floor(Math.min(region.w / puzzle.width, region.h / puzzle.height)));
  const totalW = cell * puzzle.width;
  const totalH = cell * puzzle.height;
  return {
    cell,
    gridX: region.x + Math.floor((region.w - totalW) / 2),
    gridY: region.y + Math.floor((region.h - totalH) / 2),
    width: puzzle.width,
    height: puzzle.height,
    totalW,
    totalH,
  };
}

export function cellCenter(layout, x, y) {
  return {
    px: layout.gridX + x * layout.cell + (layout.cell >> 1),
    py: layout.gridY + y * layout.cell + (layout.cell >> 1),
  };
}

// A single woven cell: plain weave over the thread color.
function weaveCell(fb, cx, cy, cell, thread) {
  const bundle = Math.max(1, Math.floor(cell / 6)); // thread-bundle thickness
  for (let yy = 0; yy < cell; yy++) {
    for (let xx = 0; xx < cell; xx++) {
      const wx = Math.floor(xx / bundle);
      const wy = Math.floor(yy / bundle);
      const warpOver = ((wx + wy) & 1) === 0;   // interlace: warp crosses over weft
      const shade = warpOver ? 16 : -14;         // lit crossing vs shadowed dip
      const tooth = bayer(cx + xx, cy + yy) * 8;
      const fbmv = (hash2((cx + xx) >> 1, (cy + yy) >> 1) - 0.5) * 10;
      const d = shade + tooth + fbmv;
      // A faint diagonal sheen across the whole cloth (compositing light).
      const sheen = (1 - Math.abs((xx - yy) / cell)) * 8;
      fb.setPixel(cx + xx, cy + yy, thread[0] + d + sheen, thread[1] + d + sheen, thread[2] + d + sheen + 4, 255);
    }
  }
}

// True if the rendered pixel at (px,py) reads as cloth (thread) rather than loom ground.
// The predicate the binding assertion uses: cloth is blue-biased (indigo thread); ground
// (manila/oil) is warm (red >= blue).
export function isClothAt(fb, px, py) {
  const [r, g, b] = fb.getPixel(px, py);
  return b > r + 6;
}

// Draw the finished cloth for `puzzle`'s solution into `region`. Returns the layout.
export function drawReveal(fb, puzzle, region, thread = PALETTE.indigo) {
  const layout = revealLayout(puzzle, region);
  const { cell, gridX, gridY } = layout;

  // Loom ground behind the cloth: bare warp on manila, faint tooth.
  for (let yy = 0; yy < layout.totalH; yy++) {
    for (let xx = 0; xx < layout.totalW; xx++) {
      const t = bayer(xx, yy) * 5;
      fb.setPixel(gridX + xx, gridY + yy, PALETTE.manilaShade[0] + t, PALETTE.manilaShade[1] + t, PALETTE.manilaShade[2] + t, 255);
    }
  }

  for (let y = 0; y < puzzle.height; y++) {
    for (let x = 0; x < puzzle.width; x++) {
      if (!puzzle.at(x, y)) continue;
      weaveCell(fb, gridX + x * cell, gridY + y * cell, cell, thread);
    }
  }

  fb.strokeRect(gridX, gridY, layout.totalW, layout.totalH, PALETTE.oilDeep[0], PALETTE.oilDeep[1], PALETTE.oilDeep[2], 150);
  return layout;
}
