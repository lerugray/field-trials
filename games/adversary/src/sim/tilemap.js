// tilemap.js — the stage tile grid (DESIGN-SEED M3: tiles for stage 1). A stage is authored as an
// array of equal-length rows of legend chars; the map exposes solid queries by tile and by world
// pixel. Purely data + queries, headless-testable. Rendering + spawns layer on top.

import { FEEL } from '../config/feel.js';

// Tile legend. Empty/air is '.', solid ground/wall is '#'. Non-solid marker tiles ('p' player
// spawn, 'x' exit, digits for spawn points) are read by the stage loader, not by collision.
export const SOLID_TILES = Object.freeze(new Set(['#', '=']));

/**
 * @param {string[]} rows - equal-length legend rows (top row = y 0).
 * @param {object} [opts]
 * @param {number} [opts.tileSize=FEEL.TILE]
 */
export function createTilemap(rows, { tileSize = FEEL.TILE } = {}) {
  if (!Array.isArray(rows) || rows.length === 0) throw new Error('tilemap: empty');
  const w = rows[0].length;
  for (const r of rows) if (r.length !== w) throw new Error('tilemap: ragged rows');
  const h = rows.length;

  const get = (tx, ty) => (ty >= 0 && ty < h && tx >= 0 && tx < w ? rows[ty][tx] : '.');
  const solidAt = (tx, ty) => SOLID_TILES.has(get(tx, ty));

  return {
    rows: [...rows],
    w,
    h,
    tileSize,
    worldWidth: w * tileSize,
    worldHeight: h * tileSize,
    get,
    solidAt,
    /** Solid query at a world-pixel position. */
    solidAtPx(px, py) {
      return solidAt(Math.floor(px / tileSize), Math.floor(py / tileSize));
    },
    /** All (tx,ty,ch) cells matching a predicate — for the stage loader to find spawns/exit. */
    findCells(pred) {
      const out = [];
      for (let ty = 0; ty < h; ty++) {
        for (let tx = 0; tx < w; tx++) {
          const ch = rows[ty][tx];
          if (pred(ch, tx, ty)) out.push({ tx, ty, ch, x: tx * tileSize, y: ty * tileSize });
        }
      }
      return out;
    },
  };
}
