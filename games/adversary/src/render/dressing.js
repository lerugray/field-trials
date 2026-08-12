// dressing.js — deterministic placement of environmental decoration (M12-ART: "screens stop reading
// as bare geometry"). Two pure layouts: surface dressing (gravestones, vines, moss, ruins on the
// ground) and distant parallax silhouettes. Both are seeded off the stage so they replay identically
// (DESIGN-SEED determinism) and both are theme-gated — a stage only grows the dressing kinds its
// THEME lists. Nothing here draws; stagerender consumes these arrays. Kept pure so it is
// headless-testable without a canvas.

import { createRng } from '../core/rng.js';
import { themeFor } from './palette.js';

// Which dressing kinds sit ON the ground surface vs. hang from an overhang (vines) vs. background.
const SURFACE_KINDS = new Set([
  'grass', 'gravestone', 'brokenArch', 'skull', 'torch', 'gargoyle', 'banner',
]);
const HANGING_KINDS = new Set(['vine', 'moss']);
const LANDMARK_KINDS = new Set(['gravestone', 'brokenArch', 'gargoyle', 'banner']);
const DRESSING_SPAN = 12; // one quiet landmark per ~192 world pixels at 16px tiles

/**
 * Find every exposed top-surface tile column: a solid tile with empty space directly above it.
 * Returns an array of { tx, ty } (tile coords of the surface tile).
 */
export function surfaceCells(tilemap) {
  const cells = [];
  for (let tx = 0; tx < tilemap.w; tx++) {
    for (let ty = 0; ty < tilemap.h; ty++) {
      if (tilemap.solidAt(tx, ty) && !tilemap.solidAt(tx, ty - 1)) {
        cells.push({ tx, ty });
        break; // topmost surface only
      }
    }
  }
  return cells;
}

/**
 * Place ground/overhang dressing deterministically. Each surface column has a small chance to grow a
 * theme-allowed decoration; adjacent placements are thinned so the field breathes. Returns
 * [{ kind, x, y, seed }] in world pixels where (x,y) is the decoration's bottom-center anchor
 * (surface top for ground kinds; ceiling for hanging kinds — here we anchor hanging under the
 * surface tile's top as a wall creeper).
 *
 * @param {object} tilemap - needs solidAt, w, h, tileSize
 * @param {string} themeId
 * @param {number|string} seed
 */
export function computeDressing(tilemap, themeId, seed) {
  const theme = themeFor(themeId);
  const ts = tilemap.tileSize;
  const allowed = theme.dressing || [];
  const surfaceKinds = allowed.filter((k) => SURFACE_KINDS.has(k));
  const hangingKinds = allowed.filter((k) => HANGING_KINDS.has(k));
  const rng = createRng(`dress:${themeId}:${seed}`);
  const cells = surfaceCells(tilemap);
  const out = [];
  let cooldown = 0;
  for (const { tx, ty } of cells) {
    if (cooldown > 0) { cooldown--; continue; }
    // Ground dressing: sparse. Bigger ruins are rarer than moss/grass.
    if (surfaceKinds.length && rng.chance(0.16)) {
      const kind = rng.pick(surfaceKinds);
      const heavy = LANDMARK_KINDS.has(kind);
      out.push({ kind, x: tx * ts + ts / 2, y: ty * ts, seed: rng.int(0, 9999) });
      cooldown = heavy ? 3 : 1; // keep heavy props from clumping
    } else if (hangingKinds.length && rng.chance(0.10)) {
      const kind = rng.pick(hangingKinds);
      out.push({ kind, x: tx * ts + ts / 2, y: ty * ts, hanging: true, seed: rng.int(0, 9999) });
    }
  }

  // AR2 readability/place gate: every screen-width stretch receives one restrained landmark when
  // random dressing left it bare. This is still seeded and surface-anchored; it only prevents the
  // long undecorated runs visible in AR1, without turning every tile into visual noise.
  if (surfaceKinds.length) {
    const landmarkKinds = surfaceKinds.filter((kind) => LANDMARK_KINDS.has(kind));
    const guaranteedKinds = landmarkKinds.length ? landmarkKinds : surfaceKinds;
    const bucketCount = Math.ceil(tilemap.w / DRESSING_SPAN);
    for (let bucket = 0; bucket < bucketCount; bucket++) {
      const start = bucket * DRESSING_SPAN;
      const end = Math.min(tilemap.w, start + DRESSING_SPAN);
      if (out.some((dec) => dec.x / ts >= start && dec.x / ts < end)) continue;
      const candidates = cells.filter(({ tx }) => tx >= start + 1 && tx < end - 1);
      if (!candidates.length) continue;
      const cell = rng.pick(candidates);
      const kind = rng.pick(guaranteedKinds);
      out.push({
        kind, x: cell.tx * ts + ts / 2, y: cell.ty * ts, seed: rng.int(0, 9999),
        guaranteed: true,
      });
    }
  }
  out.sort((a, b) => a.x - b.x);
  return out;
}

/**
 * Distant parallax silhouettes for the backdrop — a jagged skyline of the theme's ruins that scrolls
 * slower than the foreground. Returns [{ kind, x, w, h }] in world pixels along the ground band; the
 * renderer applies the parallax factor and draws them as flat theme-tinted silhouettes.
 *
 * @param {number} worldWidth - stage world width in pixels
 * @param {string} themeId
 * @param {number|string} seed
 */
export function parallaxLayout(worldWidth, themeId, seed) {
  const rng = createRng(`parallax:${themeId}:${seed}`);
  const out = [];
  // A silhouette every ~56-96 px across roughly 1.5x the world (parallax compresses it on screen).
  let x = 0;
  const span = Math.ceil(worldWidth * 0.7);
  const kinds = ['spire', 'wall', 'tomb', 'tower', 'arch'];
  while (x < span) {
    const kind = rng.pick(kinds);
    const w = kind === 'wall' ? rng.int(28, 52) : kind === 'arch' ? rng.int(24, 38) : rng.int(12, 22);
    const h = kind === 'spire' ? rng.int(40, 78)
      : kind === 'tower' ? rng.int(34, 58)
        : kind === 'wall' || kind === 'arch' ? rng.int(20, 34) : rng.int(16, 26);
    out.push({ kind, x, w, h });
    x += w + rng.int(18, 40);
  }
  return out;
}
