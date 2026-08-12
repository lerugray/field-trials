// Shared tile-art drawing. Pure w.r.t. the DOM — it only touches the canvas
// context handed in, so it imports cleanly in Node (never invoked headlessly)
// and is used by BOTH the game shell and the dev gallery, keeping a single
// draw path so a tile that passes in the gallery renders identically in-game.

import { TRANSPARENT } from './tileart.js';
import { texturedShade, accentHit } from './dither.js';

// Scratch buffer for the dither sub-grid fills (reused per art-pixel; sub is small).
const FILLS = new Array(64);

// The fill colour for one dithered sub-pixel: the sparse accent hue where an
// accent hit lands on a matching shade, else the ordered-dither ramp colour.
function subFill(s, wx, wy, i, j, dither, acc, shadeColor) {
  const shade = texturedShade(s, wx, wy, i, j, dither);
  if (acc && acc.shades.includes(shade) && accentHit(wx, wy, i, j, dither.seed || 0, acc.chance)) {
    return acc.color;
  }
  return shadeColor(shade);
}

// Draw one compiled art matrix at (px,py) with `cell` px per art-pixel.
// `shadeColor(shade)` maps a 0..6 ramp index to the active scheme's colour.
// TRANSPARENT pixels are skipped (terrain shows through for overlays).
//
// M8: pass `dither` to texture the fills (Cyclopean-study lever #1). Each art-
// pixel is then split into a SUB×SUB sub-grid and each sub-pixel gets an ordered-
// dither ramp index (see dither.js), so a flat region reads as grained material.
// `dither.wx/wy` anchor the grain to WORLD art-pixel coords so it scrolls with
// the map and never crawls; `seed`, `amp`, `levels`, `sub` tune it. Dither is
// skipped where the cell is too small to hold a sub-grid (keeps far zooms clean)
// and always skipped for shade 0 / transparent (silhouettes stay crisp).
// `accentPixel` ({shade, color}) is a DESIGNED, deterministic accent channel:
// any art-pixel whose base ramp shade equals `accentPixel.shade` fills solid with
// `accentPixel.color`. Unlike the probabilistic water-glint hook (dither.accent),
// this lights specific authored pixels every frame — the sprite's own accent
// element (a hood glint, a beast's danger tips), NOT a bare rect stroked around
// the tile. It only ever paints pixels the sprite actually has, so it can never
// draw a box on an empty tile (M8 REOPEN: the orange-box defect).
// `outline` ({shade}) is the M10 A4 VISIBILITY floor: a silhouette halo drawn in
// the transparent cells immediately around the sprite's own lit pixels, so an
// entity never blends into same-shade ground (Ray, two playtests: "enemies/npcs
// are incredibly difficult to see"). Like accentPixel it only ever paints cells
// adjacent to real sprite pixels — a shape-tracing ring, NEVER a bare rect on an
// empty tile (the M8 REOPEN orange-box gate still holds). The caller picks the
// halo shade to maximally contrast the ground (see contrastOutlineShade), so the
// silhouette clears a measured contrast delta in every biome. Drawn FIRST so the
// sprite paints on top of its own ring.
export function drawArt(ctx, grid, px, py, cell, shadeColor, dither = null, accentPixel = null, outline = null) {
  const sub = dither ? (dither.sub || 2) : 1;
  const doDither = !!dither && cell >= sub; // need >=1px per sub-pixel
  if (outline) {
    ctx.fillStyle = shadeColor(outline.shade);
    for (let y = 0; y < grid.length; y++) {
      const row = grid[y];
      for (let x = 0; x < row.length; x++) {
        if (row[x] !== TRANSPARENT) continue; // only paint the halo INTO empty cells
        if (!adjacentToSprite(grid, x, y)) continue; // ...that touch a lit sprite pixel
        ctx.fillRect(px + x * cell, py + y * cell, cell, cell);
      }
    }
  }
  for (let y = 0; y < grid.length; y++) {
    const row = grid[y];
    for (let x = 0; x < row.length; x++) {
      const s = row[x];
      if (s === TRANSPARENT) continue;
      const ox = px + x * cell;
      const oy = py + y * cell;
      if (accentPixel && s === accentPixel.shade) {
        ctx.fillStyle = accentPixel.color;
        ctx.fillRect(ox, oy, cell, cell);
        continue;
      }
      if (!doDither || s <= 0) {
        ctx.fillStyle = shadeColor(s);
        ctx.fillRect(ox, oy, cell, cell);
        continue;
      }
      const wx = (dither.wx || 0) + x;
      const wy = (dither.wy || 0) + y;
      const step = cell / sub;
      // Optional sparse accent (§3 color-to-world): a few sub-pixels of a target
      // shade become the accent hue — water glint, blood, gold. Meaningful, not
      // decorative: only fires where `accent.shades` includes the dithered shade.
      const acc = dither.accent;
      // M10 A11 (movement lag): resolve the sub-grid fills first, then COALESCE
      // equal-neighbour sub-pixels into fewer fillRects — a flat art-pixel becomes
      // ONE rect instead of sub² of them. Pixel-identical output (same fills, same
      // rects unioned), but the overworld frame was measured at ~243k fillRects;
      // flat terrain dominates, so coalescing cuts the raster cost that Ray felt.
      let uniform = true;
      for (let j = 0; j < sub; j++) {
        for (let i = 0; i < sub; i++) {
          const f = subFill(s, wx, wy, i, j, dither, acc, shadeColor);
          FILLS[j * sub + i] = f;
          if (f !== FILLS[0]) uniform = false;
        }
      }
      if (uniform) {
        ctx.fillStyle = FILLS[0];
        ctx.fillRect(ox, oy, cell + 0.5, cell + 0.5);
      } else {
        for (let j = 0; j < sub; j++) {
          let runStart = 0;
          let runFill = FILLS[j * sub];
          for (let i = 1; i <= sub; i++) {
            const f = i < sub ? FILLS[j * sub + i] : null;
            if (f !== runFill) {
              ctx.fillStyle = runFill;
              ctx.fillRect(ox + runStart * step, oy + j * step, (i - runStart) * step + 0.5, step + 0.5);
              runStart = i; runFill = f;
            }
          }
        }
      }
    }
  }
}

// Draw a terrain tile filling a `size`-px cell (integer cell where possible).
export function drawTile(ctx, grid, px, py, size, shadeColor, dither = null, accentPixel = null, outline = null) {
  const cell = size / grid.length;
  drawArt(ctx, grid, px, py, cell, shadeColor, dither, accentPixel, outline);
}

// Is (x,y) a transparent cell that 8-touches at least one lit sprite pixel? Used
// to place the silhouette halo one art-pixel out from the sprite's own body.
function adjacentToSprite(grid, x, y) {
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const ny = y + dy, nx = x + dx;
      if (ny < 0 || ny >= grid.length) continue;
      const row = grid[ny];
      if (nx < 0 || nx >= row.length) continue;
      if (row[nx] !== TRANSPARENT) return true;
    }
  }
  return false;
}

// The representative shade of an art matrix: the mean of its lit (non-transparent)
// pixels on the 0..6 ramp, rounded. This is the "ground brightness" an entity
// stands on — the input to the contrast-halo choice. Deterministic + pure.
export function reprShade(grid) {
  let sum = 0, n = 0;
  for (const row of grid) {
    for (const s of row) {
      if (s === TRANSPARENT) continue;
      sum += s; n += 1;
    }
  }
  return n ? Math.round(sum / n) : 0;
}

// Pick a halo shade at the FAR end of the 0..6 ramp from the ground it sits on,
// so a sprite's silhouette always clears a large brightness delta: dark ground
// gets a bright ring, bright ground a dark ring. Guarantees a delta of at least
// SHADE_MAX/2 (3 of 6) — measured by test/visibility.test.js in every biome.
export function contrastOutlineShade(groundShade, shadeMax = 6) {
  return groundShade <= shadeMax / 2 ? shadeMax : 0;
}

// M12 G4 — the DIMMER halo for common folk: one step in from the ramp extreme, so an
// ambient NPC still reads but doesn't shout the way a DANGER-flagged entity does (which
// keeps the full ramp-opposite ring). Still clears a positive delta on every ground;
// strictly less contrast than the full halo (tiered visibility).
export function dimOutlineShade(groundShade, shadeMax = 6) {
  return groundShade <= shadeMax / 2 ? shadeMax - 1 : 1;
}
