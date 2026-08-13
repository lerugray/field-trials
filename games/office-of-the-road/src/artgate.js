// artgate.js — THE ART IDIOM + PIXEL GATE (DESIGN-SEED M6). Every binding to a
// licensed sheet must slice on that sheet's NATIVE pixel grid — no off-grid
// offsets, no out-of-bounds cells, no implied stretch. This is the programmatic
// half of the M6 gate: given each sheet's real dimensions (read from the PNG
// headers by scripts/gates.mjs), it verifies every icon / terrain-tile / battler
// cell the game draws is grid-aligned and in-bounds.
//
// Pure logic (the dims are injected), so it is node-testable against the known
// sheet sizes and also run for real against the files at gate time.

import { ICON, ICON_FRAME, TERRAIN_TILE, TILE_FRAME, BATTLER, TOWN_TILE } from './art.js';

// cellOk: is a (col,row) frame of edge F fully inside a W×H sheet whose grid is a
// clean multiple of F? (An idiom-correct slice: aligned AND confirmed-grid.)
export function cellOk(col, row, F, W, H) {
  return F > 0 && W % F === 0 && H % F === 0 && col >= 0 && row >= 0 && (col + 1) * F <= W && (row + 1) * F <= H;
}

// checkIdiom: verify every bound cell against the given sheet dims.
//   dims = { iconset:[W,H], overworld:[W,H], battler:[W,H] }
// Returns { ok, checked, fails:[{ kind, name, reason }] }.
export function checkIdiom(dims) {
  const fails = [];
  let checked = 0;
  const test = (kind, name, col, row, F, WH) => {
    checked++;
    if (!WH) { fails.push({ kind, name, reason: 'no dims' }); return; }
    if (!cellOk(col, row, F, WH[0], WH[1])) fails.push({ kind, name, reason: `off-grid/out-of-bounds on ${WH[0]}×${WH[1]} @${F}` });
  };
  for (const [name, c] of Object.entries(ICON)) test('icon', name, c.col, c.row, ICON_FRAME, dims.iconset);
  for (const [name, c] of Object.entries(TERRAIN_TILE)) test('tile', name, c.col, c.row, TILE_FRAME, dims.overworld);
  for (const [name, c] of Object.entries(TOWN_TILE)) test('town', name, c.col, c.row, TILE_FRAME, dims.town);
  test('battler', 'BATTLER', BATTLER.col, BATTLER.row, BATTLER.size, dims.battler);
  return { ok: fails.length === 0, checked, fails };
}
