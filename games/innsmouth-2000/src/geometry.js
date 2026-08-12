// Dimetric projection geometry for INNSMOUTH 2000.
//
// The 2:1 dimetric projection locked in docs/STUDY.md section 1. Tile grid coordinates are
// (col, row); world pixel coordinates are (x, y) at authoring scale (1 unit = 1 px at 2x zoom).
// This module is pure math: no canvas, no camera. The renderer composes camera + zoom on top.

// The master tile ratio (STUDY 1.1). A ground diamond is TILE_W wide by TILE_H tall.
export const TILE_W = 64;
export const TILE_H = 32;
export const HALF_W = TILE_W / 2; // 32
export const HALF_H = TILE_H / 2; // 16

// Vertical pixels per terrain elevation level and per building storey (STUDY 1.2).
export const ELEV_STEP = 16;

// World-pixel CENTER of a tile's ground diamond, before elevation.
//   centerX = (col - row) * HALF_W
//   centerY = (col + row) * HALF_H
// Moving +1 col goes down-right; +1 row goes down-left (the diamond walk, STUDY 1.1).
export function tileToWorld(col, row) {
  return {
    x: (col - row) * HALF_W,
    y: (col + row) * HALF_H,
  };
}

// World center of a tile raised by `elevation` levels (top face of a cliff/building base).
export function tileToWorldElevated(col, row, elevation = 0) {
  const w = tileToWorld(col, row);
  return { x: w.x, y: w.y - elevation * ELEV_STEP };
}

// Exact inverse: the tile (col, row) whose ground diamond contains world pixel (x, y).
// A tile's diamond maps to the axis-aligned unit square centered on its integer coordinate,
// so rounding the continuous solution recovers the containing tile exactly (STUDY 1.1).
// FLAT only: this assumes elevation 0. For a world point taken from screen (a mouse pick), use
// worldToTileElevated below -- the renderer draws raised tiles higher on screen, and this alone
// would pick the wrong tile on any hill.
export function worldToTile(x, y) {
  const colF = x / TILE_W + y / TILE_H;
  const rowF = y / TILE_H - x / TILE_W;
  return {
    col: Math.floor(colF + 0.5),
    row: Math.floor(rowF + 0.5),
  };
}

// Elevation-corrected inverse (M9.7, the cursor/tile misalignment fix). render.js draws a tile's
// diamond raised by elevation*ELEV_STEP px (tileToWorldElevated), so a screen pick run through
// the plain worldToTile above recovers a tile shifted toward smaller col+row by roughly
// elevation/2 in each axis -- verified empirically: elevation 2 mispicked every time, off by
// exactly one tile diagonally, on ANY terrain above a gentle slope (PROGRESS.md "cursor/tile
// alignment fix"). `mapLike` is anything shaped like GameMap (inBounds(col,row), tileAt(col,row)
// -> { elevation }) -- geometry.js stays DOM-free, but this needs the real elevation field to
// invert against, so it takes a map rather than importing one.
//
// Fix: guess flat, look up that guess's real elevation, and re-solve with it added back --
// terrain elevation changes gradually tile-to-tile (STUDY heightfield), so this converges in a
// couple of steps for the ordinary rolling terrain almost everything is built on. Capped well
// above the map's max elevation range so it can never spin.
//
// Known limit (measured, not a regression this introduces): at a sheer cliff -- an elevation
// jump of 2+ within a single tile, e.g. the rock faces at MAX_ELEV -- a click on the exact
// top-face center can still resolve one tile short, because the flat first guess can land
// squarely on a genuinely self-consistent LOWER tile with nothing left to correct against. A
// fuller fix needs real occlusion/wall-face hit-testing (a much bigger change); an exhaustive
// per-elevation sweep was tried and made ordinary sloped terrain WORSE (it walks past the right
// tile on any smooth multi-tile slope), so it was reverted in favour of this narrower, measured
// win -- see test/geometry.test.js's pick-alignment tests for the exact bound.
export function worldToTileElevated(x, y, mapLike) {
  let t = worldToTile(x, y);
  for (let i = 0; i < 8; i++) {
    if (!mapLike.inBounds(t.col, t.row)) break;
    const e = mapLike.tileAt(t.col, t.row).elevation || 0;
    if (e === 0) break;
    const next = worldToTile(x, y + e * ELEV_STEP);
    if (next.col === t.col && next.row === t.row) break; // converged
    t = next;
  }
  return t;
}

// The four corners of a tile's ground diamond in world coordinates, given its center.
// Order: top, right, bottom, left (clockwise from top). Used by the renderer to path a tile.
export function diamondCorners(cx, cy) {
  return [
    { x: cx, y: cy - HALF_H }, // top
    { x: cx + HALF_W, y: cy }, // right
    { x: cx, y: cy + HALF_H }, // bottom
    { x: cx - HALF_W, y: cy }, // left
  ];
}

// The tightest inclusive tile range covering a world-space rectangle, clamped to a grid of
// `cols` x `rows`. The renderer uses this to cull to the visible viewport before drawing.
// Because the projection rotates the grid, all four rectangle corners are probed.
export function visibleTileRange(worldLeft, worldTop, worldRight, worldBottom, cols, rows, pad = 1) {
  const corners = [
    worldToTile(worldLeft, worldTop),
    worldToTile(worldRight, worldTop),
    worldToTile(worldLeft, worldBottom),
    worldToTile(worldRight, worldBottom),
  ];
  let minCol = Infinity;
  let maxCol = -Infinity;
  let minRow = Infinity;
  let maxRow = -Infinity;
  for (const c of corners) {
    minCol = Math.min(minCol, c.col);
    maxCol = Math.max(maxCol, c.col);
    minRow = Math.min(minRow, c.row);
    maxRow = Math.max(maxRow, c.row);
  }
  return {
    minCol: Math.max(0, minCol - pad),
    maxCol: Math.min(cols - 1, maxCol + pad),
    minRow: Math.max(0, minRow - pad),
    maxRow: Math.min(rows - 1, maxRow + pad),
  };
}

// Painter's-algorithm draw key: iterate tiles by increasing (col + row), then by row
// (STUDY 1.3). Returns a comparator for [col, row] pairs.
export function drawOrder(a, b) {
  const da = a.col + a.row;
  const db = b.col + b.row;
  if (da !== db) return da - db;
  return a.row - b.row;
}
