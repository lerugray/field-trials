// Canvas dimetric renderer for INNSMOUTH 2000.
//
// The draw path needs a canvas 2D context and (in the browser) a document to bake tile sprites,
// but the projection math is pure and lives up top so node --test can cover it. The renderer
// culls to the visible viewport, draws tiles back-to-front (painter's order, STUDY 1.3), blits
// an ordered-dithered top-face sprite per terrain, and draws solid ramp-shaded wall bands under
// raised terrain (STUDY 1.2). No smooth gradients: every shade is a palette ramp step or a
// two-tone ordered dither, per the aesthetic law.

import {
  HALF_W, HALF_H, ELEV_STEP,
  tileToWorldElevated, visibleTileRange, drawOrder,
} from './geometry.js';
import {
  RAMP, SHADOW, BASE, LIGHT, HIGHLIGHT, hexToRgb, terrainRamp, ZONE_TINT, WIRE, POLE, UNDERGROUND,
  SKY, SKY_UNDER, SKY_GLOW, CHROME,
} from './palette.js';
import {
  DIR, hasNetwork, networkMask, hasPipe, pipeMask, isWaterSource, isWaterWorks, valveState,
  QUALITY, qualityFor, VIEW,
} from './tools.js';
import { PRESSURE, qualityAt } from './water.js';
import { SUBSTRATE } from './aquifer.js';

// --- pure screen geometry (testable in node) ---------------------------------------------

// The screen-space faces of a tile: its raised top-diamond corners, the two visible wall
// quads, and the wall height in screen pixels. Pure: only uses the camera's pure transform.
export function tileScreenFaces(col, row, elevation, camera) {
  const world = tileToWorldElevated(col, row, elevation);
  const c = camera.worldToScreen(world.x, world.y);
  const hw = HALF_W * camera.zoom;
  const hh = HALF_H * camera.zoom;
  const wallH = elevation * ELEV_STEP * camera.zoom;
  const T = { x: c.x, y: c.y - hh };
  const R = { x: c.x + hw, y: c.y };
  const B = { x: c.x, y: c.y + hh };
  const L = { x: c.x - hw, y: c.y };
  return {
    center: c,
    top: T, right: R, bottom: B, left: L,
    hw, hh, wallH,
    // Left-facing wall (down-left edge L->B) and right-facing wall (down-right edge B->R).
    leftWall: [L, B, { x: B.x, y: B.y + wallH }, { x: L.x, y: L.y + wallH }],
    rightWall: [B, R, { x: R.x, y: R.y + wallH }, { x: B.x, y: B.y + wallH }],
  };
}

// The midpoints of a tile's four diamond edges, keyed by the auto-connect direction bit that
// crosses that edge (STUDY 1.1 adjacency). Roads and wires run from the tile centre to these.
export function edgeMidpoints(faces) {
  const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  return {
    [DIR.SE.bit]: mid(faces.bottom, faces.right), // toward (col+1, row)
    [DIR.SW.bit]: mid(faces.bottom, faces.left), // toward (col, row+1)
    [DIR.NW.bit]: mid(faces.left, faces.top), // toward (col-1, row)
    [DIR.NE.bit]: mid(faces.top, faces.right), // toward (col, row-1)
  };
}

// --- ordered-dither tile sprites (browser) -----------------------------------------------

// --- the blue-hour art kit (art migration 2026-08-10) --------------------------------------
//
// The operator-approved direction is not a new palette bolted onto the old renderer: it is a
// different way of getting light onto the picture. Three ideas, all of which live here.
//
//   1. MATERIAL. A surface is never one flat fill. Its lightness is perturbed by cheap value
//      noise and then quantized back onto its own 4-step ramp through an 8x8 ordered dither, so
//      the ground and the walls carry grain without a single gradient or off-ramp colour.
//   2. LIGHT IS ADDED, NOT PAINTED. Windows, street lamps and the sky's one warm patch are
//      composited additively over the finished picture ('lighter'), from baked falloff sprites
//      whose low end is dithered away. Shade is the opposite operation: a dark wash and a
//      dithered vignette laid over the top.
//   3. NOTHING IS SMOOTH. Every falloff, wash and vignette is quantized and dithered, so a
//      screenshot still indexes to a small palette the way a 1994 disk would.
//
// All of it degrades safely: every bake needs a canvas factory, and where there is none (the
// node suite's mock context) the call sites fall back to the flat draw they replaced.

// 8x8 ordered dither thresholds in [0,1), for quantizing a continuous lightness onto a ramp.
const I2_BAYER8 = [
  0, 32, 8, 40, 2, 34, 10, 42, 48, 16, 56, 24, 50, 18, 58, 26,
  12, 44, 4, 36, 14, 46, 6, 38, 60, 28, 52, 20, 62, 30, 54, 22,
  3, 35, 11, 43, 1, 33, 9, 41, 51, 19, 59, 27, 49, 17, 57, 25,
  15, 47, 7, 39, 13, 45, 5, 37, 63, 31, 55, 23, 61, 29, 53, 21,
].map((v) => (v + 0.5) / 64);

function i2Bayer(x, y) {
  return I2_BAYER8[(((y & 7) << 3) + (x & 7))];
}

// A deterministic hash in [0,1). Same shape as tileHash below, but taking arbitrary integers so it
// can drive per-pixel noise as well as per-tile variation.
function i2Hash(x, y, s) {
  let h = (Math.imul(x + 37, 374761393) + Math.imul(y + 91, 668265263) + Math.imul(s + 11, 2246822519)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// Smooth value noise in [0,1): bilinear interpolation between hashed lattice points, smoothstepped.
// Two octaves is enough grain for a 64x32 tile or a wall face, and it is cheap enough to bake with.
function i2Noise(x, y, seed) {
  let sum = 0;
  let amp = 0.5;
  let total = 0;
  let f = 1;
  for (let o = 0; o < 2; o++) {
    const px = x * f;
    const py = y * f;
    const xi = Math.floor(px);
    const yi = Math.floor(py);
    const xf = px - xi;
    const yf = py - yi;
    const u = xf * xf * (3 - 2 * xf);
    const v = yf * yf * (3 - 2 * yf);
    const a = i2Hash(xi, yi, seed + o);
    const b = i2Hash(xi + 1, yi, seed + o);
    const c = i2Hash(xi, yi + 1, seed + o);
    const d = i2Hash(xi + 1, yi + 1, seed + o);
    sum += (a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v) * amp;
    total += amp;
    amp *= 0.5;
    f *= 2;
  }
  return sum / total;
}

// Quantize a lightness in [0,1] onto a ramp index, dithering between the two nearest steps so the
// boundary breaks up into the reference's chunky stipple instead of a hard band.
function i2RampIndex(steps, t, x, y) {
  const clamped = t < 0 ? 0 : t > 1 ? 1 : t;
  const v = clamped * (steps - 1);
  const i = Math.floor(v);
  const frac = v - i;
  const idx = i + (frac > i2Bayer(x, y) ? 1 : 0);
  return idx < 0 ? 0 : idx > steps - 1 ? steps - 1 : idx;
}

// A canvas factory, when one is available. buildTileSprites stashes the real one on the sprite set
// so every later bake can reach it without threading `document` through the draw path.
function i2Maker(sprites) {
  return sprites && typeof sprites.__mk === 'function' ? sprites.__mk : null;
}

// --- baked light ---------------------------------------------------------------------------

const i2GlowCache = new Map();

// A radial additive falloff, baked once per (colour, radius, strength, power) and blitted with
// 'lighter'. The falloff is quantized to 12 steps and its low tail is dithered out, so the halo
// reads as period stipple rather than a modern soft glow.
function i2GlowSprite(mk, color, radius, strength, pow) {
  const r = Math.max(2, Math.round(radius));
  const key = `${color}|${r}|${strength.toFixed(2)}|${pow}`;
  const hit = i2GlowCache.get(key);
  if (hit !== undefined) return hit;
  let sprite = null;
  const size = r * 2 + 1;
  const cv = mk(size, size);
  const ctx = cv.getContext('2d');
  if (ctx && typeof ctx.createImageData === 'function') {
    const img = ctx.createImageData(size, size);
    const data = img.data;
    const c = hexToRgb(color);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const dx = x - r;
        const dy = y - r;
        const d = Math.hypot(dx, dy) / r;
        const o = (y * size + x) * 4;
        data[o + 3] = 255;
        if (d > 1) continue;
        let v = Math.pow(1 - d, pow) * strength;
        v = Math.round(v * 12) / 12; // quantized, so the halo bands like indexed colour
        if (v <= 0) continue;
        if (v < 0.09 && v * 11 < i2Bayer(x, y)) continue; // dither the tail away
        data[o] = Math.min(255, c.r * v);
        data[o + 1] = Math.min(255, c.g * v);
        data[o + 2] = Math.min(255, c.b * v);
      }
    }
    ctx.putImageData(img, 0, 0);
    sprite = cv;
  }
  i2GlowCache.set(key, sprite);
  return sprite;
}

// Add light at a point. With a canvas factory this is one blit of a baked falloff; without one
// (the node suite's mock context) it is a short stack of flat additive discs, which is the same
// picture two steps coarser and keeps the call site exercised in the headless tests.
function i2Glow(ctx, sprites, x, y, radius, color, strength, pow = 2) {
  if (!(radius > 0) || !(strength > 0)) return;
  const mk = i2Maker(sprites);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const sprite = mk ? i2GlowSprite(mk, color, radius, strength, pow) : null;
  if (sprite) {
    const r = Math.max(2, Math.round(radius));
    ctx.drawImage(sprite, Math.round(x) - r, Math.round(y) - r);
  } else {
    ctx.fillStyle = color;
    for (let i = 4; i >= 1; i--) {
      ctx.globalAlpha = strength * Math.pow(i / 4, pow) * 0.34;
      const rr = radius * (i / 4);
      ctx.beginPath();
      if (ctx.ellipse) ctx.ellipse(x, y, rr, rr, 0, 0, Math.PI * 2);
      else ctx.arc(x, y, rr, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}

// A flattened pool of light on the ground under a lamp: the same additive falloff, squashed 2:1 so
// it sits in the dimetric plane instead of hanging in the air.
function i2Pool(ctx, sprites, x, y, rx, color, strength) {
  const mk = i2Maker(sprites);
  const sprite = mk ? i2GlowSprite(mk, color, rx, strength, 1.7) : null;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  if (sprite) {
    const r = Math.max(2, Math.round(rx));
    ctx.drawImage(sprite, Math.round(x) - r, Math.round(y) - r * 0.5, r * 2 + 1, r + 1);
  } else {
    ctx.fillStyle = color;
    for (let i = 3; i >= 1; i--) {
      ctx.globalAlpha = strength * (i / 3) * 0.3;
      const rr = rx * (i / 3);
      ctx.beginPath();
      if (ctx.ellipse) ctx.ellipse(x, y, rr, rr * 0.5, 0, 0, Math.PI * 2);
      else ctx.arc(x, y, rr * 0.7, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}

// --- baked sky and vignette ------------------------------------------------------------------

const i2ScreenCache = new Map();

// The blue hour behind the town: a dithered vertical ramp, darkest overhead, with one warm patch
// where the light went. Baked per viewport size and reused until the window changes.
function i2SkySprite(mk, w, h, underground) {
  const key = `sky|${w}|${h}|${underground ? 'u' : 's'}`;
  const hit = i2ScreenCache.get(key);
  if (hit !== undefined) return hit;
  let sprite = null;
  const cv = mk(w, h);
  const ctx = cv.getContext('2d');
  if (ctx && typeof ctx.createImageData === 'function') {
    const ramp = (underground ? SKY_UNDER : SKY).map(hexToRgb);
    const img = ctx.createImageData(w, h);
    const data = img.data;
    for (let y = 0; y < h; y++) {
      const base = underground ? 0.2 : (y / h) * 0.8;
      for (let x = 0; x < w; x++) {
        const n = (i2Noise(x * (underground ? 0.05 : 0.02), y * (underground ? 0.05 : 0.03), 70) - 0.5);
        const t = base + n * (underground ? 0.3 : 0.22);
        const col = ramp[i2RampIndex(ramp.length, t, x, y)];
        const o = (y * w + x) * 4;
        data[o] = col.r; data[o + 1] = col.g; data[o + 2] = col.b; data[o + 3] = 255;
      }
    }
    // The one warm patch, added into the sky itself so it costs nothing per frame.
    if (!underground) {
      const gx = Math.round(w * 0.82);
      const gy = Math.round(h * 0.14);
      const gr = Math.round(Math.min(w, h) * 0.34);
      const warm = hexToRgb(SKY_GLOW);
      for (let y = Math.max(0, gy - gr); y < Math.min(h, gy + gr); y++) {
        for (let x = Math.max(0, gx - gr); x < Math.min(w, gx + gr); x++) {
          const d = Math.hypot(x - gx, y - gy) / gr;
          if (d > 1) continue;
          let v = Math.pow(1 - d, 2.4) * 0.34;
          v = Math.round(v * 10) / 10;
          if (v <= 0) continue;
          if (v < 0.1 && v * 10 < i2Bayer(x, y)) continue;
          const o = (y * w + x) * 4;
          data[o] = Math.min(255, data[o] + warm.r * v);
          data[o + 1] = Math.min(255, data[o + 1] + warm.g * v);
          data[o + 2] = Math.min(255, data[o + 2] + warm.b * v);
        }
      }
    }
    ctx.putImageData(img, 0, 0);
    sprite = cv;
  }
  i2ScreenCache.set(key, sprite);
  return sprite;
}

// The vignette, as an ordered-dithered alpha mask rather than a smooth radial gradient: the corners
// of the plate go down toward ink in visible steps, which is what the reference's indexed screens
// actually did.
function i2VignetteSprite(mk, w, h, strength) {
  const key = `vig|${w}|${h}|${strength.toFixed(2)}`;
  const hit = i2ScreenCache.get(key);
  if (hit !== undefined) return hit;
  let sprite = null;
  const cv = mk(w, h);
  const ctx = cv.getContext('2d');
  if (ctx && typeof ctx.createImageData === 'function') {
    const ink = hexToRgb(CHROME.ink);
    const img = ctx.createImageData(w, h);
    const data = img.data;
    for (let y = 0; y < h; y++) {
      const dy = (y / h - 0.47) * 2;
      for (let x = 0; x < w; x++) {
        const dx = (x / w - 0.5) * 2;
        const d = Math.hypot(dx * 0.86, dy);
        if (d <= 0.44) continue;
        let a = (d - 0.44) * strength;
        if (a > 0.72) a = 0.72;
        a = Math.round(a * 10) / 10; // stepped, then dithered between the steps
        if (a <= 0) continue;
        if (a < 0.1 && a * 10 < i2Bayer(x, y)) continue;
        const o = (y * w + x) * 4;
        data[o] = ink.r; data[o + 1] = ink.g; data[o + 2] = ink.b;
        data[o + 3] = Math.round(a * 255);
      }
    }
    ctx.putImageData(img, 0, 0);
    sprite = cv;
  }
  i2ScreenCache.set(key, sprite);
  return sprite;
}

// Bake one TILE_W x TILE_H top-face diamond sprite for a terrain ramp, using ordered dither
// between the ramp's base and light steps (top of the tile lighter), a highlight along the
// upper edges and a shadow rim along the lower edges so the tile seats on the ground. Requires
// a document; called once at renderer init. `makeCanvas` is injected for testability.
export function bakeTileSprite(rampKey, makeCanvas, variant = 0) {
  const ramp = RAMP[rampKey] || RAMP.grass;
  const cv = makeCanvas(TILE_SPRITE_W, TILE_SPRITE_H);
  const ctx = cv.getContext('2d');
  const img = ctx.createImageData(TILE_SPRITE_W, TILE_SPRITE_H);
  const data = img.data;
  const steps = ramp.map(hexToRgb);
  const cShadow = steps[SHADOW];
  const cHigh = steps[HIGHLIGHT];
  // How hard the material mottles. Water and soil break up most; a road wants to stay a road.
  const grain = rampKey === 'deep' || rampKey === 'shallow' ? 0.34
    : rampKey === 'soil' || rampKey === 'dirt' ? 0.3
      : rampKey === 'road' ? 0.14 : 0.26;
  const seed = 901 + variant * 37;

  for (let py = 0; py < TILE_SPRITE_H; py++) {
    for (let px = 0; px < TILE_SPRITE_W; px++) {
      // Inside the diamond? Normalized Manhattan distance from center <= 1.
      const dx = Math.abs(px + 0.5 - HALF_W) / HALF_W;
      const dy = Math.abs(py + 0.5 - HALF_H) / HALF_H;
      const inside = dx + dy <= 1.0;
      const o = (py * TILE_SPRITE_W + px) * 4;
      if (!inside) { data[o + 3] = 0; continue; } // transparent outside the diamond

      const edge = dx + dy > 0.86; // near the rim
      const upper = py < HALF_H;
      let col;
      if (edge && upper) {
        col = cHigh; // lit upper rim
      } else if (edge && !upper) {
        col = cShadow; // shadowed lower rim seats the tile
      } else {
        // The material: a lightness biased toward the top of the tile, mottled by value noise, then
        // quantized back onto the ramp through the ordered dither. Only ever a ramp step, so the
        // tile stays inside the palette lock however much it varies.
        //
        // The band is centred on BASE..LIGHT (index ~1..2), which is where a terrain's read lives;
        // the noise then carries individual patches down to SHADOW and up to HIGHLIGHT. A first cut
        // centred the band on SHADOW..BASE and turned every field into a dark slab.
        const lift = 0.34 + (1 - py / TILE_SPRITE_H) * 0.34;
        const n = (i2Noise((px + variant * 13) * 0.16, (py - variant * 7) * 0.3, seed) - 0.5) * grain;
        col = steps[i2RampIndex(steps.length, lift + n, px, py)];
      }
      data[o] = col.r; data[o + 1] = col.g; data[o + 2] = col.b; data[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return cv;
}

// How many mottling variants each terrain gets. Four is enough that a field of marsh grass stops
// reading as one stamped tile repeated, and cheap enough to bake at boot (a few dozen 64x32s).
export const TILE_VARIANTS = 4;

export const TILE_SPRITE_W = HALF_W * 2; // 64
export const TILE_SPRITE_H = HALF_H * 2; // 32

// Build the full sprite set for a browser renderer: one sprite per terrain ramp (the first variant,
// which is what any caller reading `sprites[key]` gets), plus the mottling variants beside it and
// the canvas factory itself, so the light bakes above can reach a canvas from inside the draw path.
export function buildTileSprites(makeCanvas) {
  const sprites = {};
  const variants = {};
  for (const key of Object.keys(RAMP)) {
    variants[key] = [];
    for (let v = 0; v < TILE_VARIANTS; v++) variants[key].push(bakeTileSprite(key, makeCanvas, v));
    sprites[key] = variants[key][0];
  }
  sprites.__var = variants;
  sprites.__mk = makeCanvas;
  return sprites;
}

// The sprite for a tile, mottled by its own coordinates so neighbouring tiles of the same terrain
// differ. Falls back to the single sprite when a caller supplied a set without variants.
function i2TileSprite(sprites, key, col, row) {
  const set = sprites && sprites.__var ? sprites.__var[key] : null;
  if (!set || !set.length) return sprites[key];
  return set[Math.floor(tileHash(col, row, 5) * set.length) % set.length];
}

// --- the draw loop (browser: needs a real 2D context) ------------------------------------

// Draw the whole visible map. sprites is the object from buildTileSprites. `power` (optional) is
// the sim's power state; when a grid exists, unpowered built lots get a dim no-power mark.
//
// `opts.view` (M-a) selects the plane. VIEW.UNDERGROUND redraws the SAME map through the utility
// layer instead of building a second renderer: the ground goes to packed earth, the town above is
// reduced to brown-grey silhouettes, live mains read their pressure by colour, and a faint wash
// marks the tiles they water. `opts.water` is the sim's water state, which supplies all of it.
export function drawMap(ctx, map, camera, sprites, power = null, disaster = null, opts = {}) {
  const underground = opts.view === VIEW.UNDERGROUND;
  const water = opts.water || null;
  // M-b: the subsurface substrate, and the deep's own signs. Both optional, so every existing caller
  // (and the sim's very first frame, before a step has run) still draws.
  const aquifer = opts.aquifer || null;
  const deep = opts.deep ? withGlimpseSet(opts.deep) : null;
  // A slow clock for the few things down here that move: the highlight round a void, the bubbles in
  // an infested main, a shape crossing a fissure. Absent, everything draws still, which is what the
  // headless capture and the reduced-motion setting both want.
  const now = typeof opts.now === 'number' ? opts.now : 0;
  const zoom = camera.zoom;
  ctx.imageSmoothingEnabled = false; // nearest-neighbor: pixels stay crisp at every zoom
  // The tiles at the leading edge of an active wrath get the live effect (flames, fresh growth,
  // the rift's glow); their permanent aftermath is carried by tile.scar below.
  const frontSet = disaster && disaster.front ? new Set(disaster.front) : null;

  // Sky/void behind the map. The blue hour above the street (a dithered ramp, darkest overhead,
  // with the one warm patch where the light went); packed earth below it. Baked once per viewport.
  const skyMk = i2Maker(sprites);
  const sky = skyMk ? i2SkySprite(skyMk, camera.viewportW, camera.viewportH, underground) : null;
  if (sky) {
    ctx.drawImage(sky, 0, 0);
  } else {
    ctx.fillStyle = underground ? SKY_UNDER[1] : SKY[1];
    ctx.fillRect(0, 0, camera.viewportW, camera.viewportH);
  }

  const view = camera.visibleWorldRect();
  // Pad generously downward: raised tiles from further rows can intrude into view from below.
  const range = visibleTileRange(
    view.left, view.top - ELEV_STEP * (6 + 2),
    view.right, view.bottom,
    map.cols, map.rows, 2,
  );

  // Collect visible tiles and sort back-to-front.
  const order = [];
  for (let row = range.minRow; row <= range.maxRow; row++) {
    for (let col = range.minCol; col <= range.maxCol; col++) {
      order.push({ col, row });
    }
  }
  order.sort(drawOrder);

  const spriteW = TILE_SPRITE_W * zoom;
  const spriteH = TILE_SPRITE_H * zoom;

  for (const { col, row } of order) {
    const tile = map.tiles[map.index(col, row)];
    const faces = tileScreenFaces(col, row, tile.elevation, camera);

    // Wall bands under raised terrain (solid ramp steps, light from the upper right). Below the
    // street these read as cut soil banks rather than the terrain's own material.
    if (faces.wallH > 0) {
      const ramp = RAMP[terrainRamp(tile.terrain)];
      fillPoly(ctx, faces.leftWall, underground ? UNDERGROUND.earth : ramp[SHADOW]); // shadowed side
      fillPoly(ctx, faces.rightWall, underground ? UNDERGROUND.earthLight : ramp[BASE]); // lit side
    }

    // Top face: blit the pre-dithered sprite, its top-left at the diamond's bounding box. Which of
    // the terrain's mottling variants a tile gets is fixed by its own coordinates, so a field of
    // marsh grass or a stretch of open water varies instead of stamping one tile over and over.
    // Below the street the ground is not the terrain: it is the packed soil the mains are cut into,
    // and it gets the same mottled treatment so the plane reads as dug earth rather than a backdrop.
    const terrainKey = underground ? 'soil' : terrainRamp(tile.terrain);
    const sprite = i2TileSprite(sprites, terrainKey, col, row);
    ctx.drawImage(sprite, faces.left.x, faces.top.y, spriteW, spriteH);
    // ...and the surface detail the sprite cannot carry, because it has to differ per tile: a wave
    // crest on open water, a tide line on wet sand, a tuft in the marsh.
    if (!underground) i2TerrainDetail(ctx, faces, terrainKey, zoom, col, row);

    // --- the underground plane (M-a) ------------------------------------------------------
    // Soil over the ground, the town above it as silhouettes, the coverage wash, then the mains.
    // Nothing on the surface is drawn solid down here: the player is reading a utility map.
    if (underground) {
      const index = map.index(col, row);
      // The ground itself, faint, under everything: sweet, brackish, or open to the sea (M-b).
      if (aquifer) drawSubstrate(ctx, faces, aquifer.substrate[index], zoom, now);
      drawSurfaceGhost(ctx, faces, tile, zoom);
      // The coverage wash carries the WATER's quality, so the lots on a foul main read foul from
      // above the pipe as well as on it.
      if (water) {
        const wash = coverageWash(water, index);
        if (wash) fillDiamondFaces(ctx, faces, wash);
      }
      const pressure = water && water.pipes.has(index) ? water.pipes.get(index) : PRESSURE.DRY;
      const taint = water && water.taints && water.taints.has(index) ? water.taints.get(index) : 0;
      if (hasPipe(tile)) drawPipe(ctx, faces, pipeMask(tile), zoom, pressure, taint);
      if (isWaterWorks(tile)) drawWaterSource(ctx, faces, tile.structure, zoom, pressure, taint);
      // A fitted valve, and the iron cap of a sealing works.
      const valve = valveState(tile);
      if (valve) drawValve(ctx, faces, zoom, valve === 'shut');
      if (tile.sealed) drawSealCap(ctx, faces, zoom);
      // The signs. Handprints along an infested main, glyphs cut about a fouled pump head, and only
      // where the deep is genuinely crowded, a shape in the void: the ratified implied depiction.
      if (deep) {
        const mark = deep.marks ? deep.marks.get(index) : null;
        if (mark) drawDeepMark(ctx, faces, zoom, mark, now);
        if (deep.glimpseSet && deep.glimpseSet.has(index)) drawGlimpse(ctx, faces, zoom, now);
      }
      continue; // the surface passes below never run underground
    }

    // Overlays, back-to-front on the top face. A developed lot shows its building (which hides
    // the zone marker); an empty lot shows its zone marking. A placed civic structure sits on the
    // land directly.
    if (tile.structure) drawStructure(ctx, faces, tile.structure, zoom, sprites, col, row);
    else if (tile.building) drawBuilding(ctx, faces, tile.building, tile.zone, zoom, sprites, col, row);
    else if (tile.zone) drawZone(ctx, faces, tile.zone, zoom);
    // A crossing deliberately uses the established art twice: roadbed first, pylon and wires over
    // it, matching the reference silhouette without introducing a foreign sprite or palette.
    if (hasNetwork(tile, 'road')) {
      drawRoad(ctx, faces, networkMask(tile, 'road'), zoom);
      // A gas standard on roughly one street tile in three. Deterministic in the tile's own
      // coordinates, so it never flickers and never needs a scrap of sim state: the lamps are the
      // town's own light, and they are what makes the blue hour read as a town rather than a map.
      if (tileHash(col, row, 71) > 0.66) drawStreetLamp(ctx, sprites, faces, zoom);
    }
    if (hasNetwork(tile, 'powerline')) drawPowerline(ctx, faces, networkMask(tile, 'powerline'), zoom);

    // No-power mark: a built lot cut off from a working grid, once any generator exists.
    if (power && power.totals && power.totals.capacity > 0 && tile.building
        && !power.energized.has(map.index(col, row))) {
      drawNoPower(ctx, faces, zoom);
    }

    // Seeped ground (M-b): a foul main is leaking beneath this lot, and the surface has gone damp.
    // This is the one M-b sign that belongs on the SURFACE view, because it is what a player who
    // never goes below will notice, and it is the Greening's road inland.
    if (tile.damp > 0) drawDampGround(ctx, faces, zoom);

    // Disaster aftermath (permanent) then the live wrath effect on the leading edge.
    if (tile.scar) drawScar(ctx, faces, tile.scar, zoom, col, row);
    if (frontSet && frontSet.has(map.index(col, row))) {
      drawWrathFront(ctx, faces, disaster.kind, zoom, col, row);
    }
  }

  // Damp 1920s atmosphere (M7): a faint cold wash and a vignette pull the read toward overcast
  // coastal dread, without hiding the ground. Drawn over the map, under the chrome that follows.
  // The wash thickens with the town's dread, so the plate itself darkens as the place goes wrong.
  drawAtmosphere(ctx, camera, { dread: opts.dread, underground, sprites });
}

// A cold fog wash plus an edge vignette. Cheap, and it does most of the mood work that the palette
// retune leaves on the table.
//
// The vignette is a BAKED, ordered-dithered alpha mask rather than a smooth radial gradient (the
// aesthetic law: no smooth gradients anywhere), cached per viewport size. Where no canvas factory
// is available the old radial gradient still stands in, so the call site never goes dark.
export function drawAtmosphere(ctx, camera, opts = {}) {
  const w = camera.viewportW;
  const h = camera.viewportH;
  const underground = !!opts.underground;
  // The cold wash. Below the street it is a dead still air; above it, the fog thickens with dread.
  const dread = Math.max(0, Math.min(100, Number(opts.dread) || 0));
  const washAlpha = underground ? 0.1 : 0.1 + (dread / 100) * 0.16;
  ctx.fillStyle = underground
    ? `rgba(16, 11, 8, ${washAlpha.toFixed(3)})`
    : `rgba(24, 36, 44, ${washAlpha.toFixed(3)})`;
  ctx.fillRect(0, 0, w, h);

  // The vignette. Heavier below the street, where the plane should feel enclosed, and heavier again
  // as dread rises above it. Dread is BANDED into five steps before it reaches the strength, because
  // each distinct strength bakes its own full-viewport mask: a continuous dial would re-bake a
  // megapixel every time the meter twitched.
  const band = Math.round(dread / 25) / 4; // 0, .25, .5, .75, 1
  const strength = underground ? 1.35 : 0.86 + band * 0.35;
  const mk = i2Maker(opts.sprites);
  const vig = mk ? i2VignetteSprite(mk, w, h, strength) : null;
  if (vig) {
    ctx.drawImage(vig, 0, 0);
    return;
  }
  if (typeof ctx.createRadialGradient === 'function') {
    const g = ctx.createRadialGradient(w / 2, h * 0.46, Math.min(w, h) * 0.24, w / 2, h * 0.5, Math.max(w, h) * 0.72);
    g.addColorStop(0, 'rgba(0, 0, 0, 0)');
    g.addColorStop(1, `rgba(9, 13, 19, ${(0.42 * strength).toFixed(3)})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }
}

// --- surface detail and the town's own light -------------------------------------------------

// The per-tile marks the baked sprite cannot carry, because they have to differ tile by tile: a
// crest on open water, the tide line on wet sand, a tuft in the marsh. All deterministic in the
// tile's coordinates, so the world never shimmers between repaints.
function i2TerrainDetail(ctx, faces, key, zoom, col, row) {
  const c = faces.center;
  if (key === 'deep' || key === 'shallow') {
    const h = tileHash(col, row, 9);
    if (h <= 0.44) return;
    const ramp = RAMP[key];
    const len = (3 + h * 7) * zoom;
    const y = c.y + (tileHash(row, col, 3) - 0.5) * faces.hh * 0.7;
    ctx.strokeStyle = h > 0.8 ? ramp[HIGHLIGHT] : ramp[LIGHT];
    ctx.lineWidth = Math.max(1, 0.9 * zoom);
    ctx.globalAlpha = 0.72;
    ctx.beginPath();
    ctx.moveTo(c.x - len, y);
    ctx.lineTo(c.x + len, y);
    ctx.stroke();
    ctx.globalAlpha = 1;
    return;
  }
  if (key === 'beach') {
    if (tileHash(col, row, 13) <= 0.42) return;
    ctx.strokeStyle = RAMP.beach[HIGHLIGHT];
    ctx.lineWidth = Math.max(1, 0.8 * zoom);
    ctx.globalAlpha = 0.4;
    ctx.beginPath();
    ctx.moveTo(c.x - faces.hw * 0.4, c.y - 1 * zoom);
    ctx.lineTo(c.x + faces.hw * 0.24, c.y - 2 * zoom);
    ctx.stroke();
    ctx.globalAlpha = 1;
    return;
  }
  if (key !== 'grass' && key !== 'dirt') return;
  if (tileHash(col, row, 31) <= 0.66) return;
  const ramp = RAMP[key];
  const s = Math.max(1, 1.2 * zoom);
  ctx.fillStyle = ramp[HIGHLIGHT];
  ctx.fillRect(c.x - faces.hw * 0.2, c.y + faces.hh * 0.06, s, s);
  ctx.fillStyle = ramp[SHADOW];
  ctx.fillRect(c.x + faces.hw * 0.26, c.y - faces.hh * 0.14, s, s);
}

// A gas street standard: a brass post with a crossbar, a lit head, and the pool of light it throws
// on the roadbed. The pool goes down first so the post stands in its own light rather than beside
// it. This is the single element that turns the blue hour from a dark map into an inhabited town.
function drawStreetLamp(ctx, sprites, faces, zoom) {
  const c = faces.center;
  const h = 13 * zoom;
  const head = { x: c.x, y: c.y - h };
  i2Pool(ctx, sprites, c.x, c.y + 1 * zoom, Math.max(8, 15 * zoom), RAMP.gold[LIGHT], 0.3);
  ctx.strokeStyle = UNDERGROUND.joint;
  ctx.lineWidth = Math.max(1, 1.1 * zoom);
  ctx.beginPath();
  ctx.moveTo(c.x, c.y);
  ctx.lineTo(head.x, head.y);
  ctx.moveTo(head.x - 2.4 * zoom, head.y + 1 * zoom);
  ctx.lineTo(head.x + 2.4 * zoom, head.y + 1 * zoom);
  ctx.stroke();
  i2Glow(ctx, sprites, head.x, head.y, Math.max(7, 13 * zoom), RAMP.gold[LIGHT], 0.42, 2.2);
  ctx.fillStyle = RAMP.gold[HIGHLIGHT];
  const s = Math.max(1.4, 1.6 * zoom);
  ctx.fillRect(head.x - s / 2, head.y - s / 2, s, s);
}

// The dark the building sits in: a squashed pool of shade on the ground, offset toward the shadowed
// side. Cheap, and it is what stops a structure looking pasted on top of the tile.
function i2ContactShade(ctx, faces, zoom, spread = 1) {
  ctx.save();
  ctx.globalAlpha = 0.42;
  fillEllipse(
    ctx,
    { x: faces.center.x - 1.5 * zoom, y: faces.center.y + 2.5 * zoom },
    faces.hw * 0.8 * spread, faces.hh * 0.72 * spread, CHROME.ink,
  );
  ctx.globalAlpha = 1;
  ctx.restore();
}

// Material grain on a wall or roof quad: a scatter of deterministic ramp-step flecks, so a big flat
// face at 2x zoom reads as boards or slate rather than a painted polygon. Ramp steps only.
function i2FaceGrain(ctx, quad, ramp, zoom, seed, count = 7) {
  const s = Math.max(1, 1.1 * zoom);
  for (let i = 0; i < count; i++) {
    const u = tileHash(seed, i, 17);
    const v = tileHash(i, seed, 29);
    const p = quadPoint(quad, 0.08 + u * 0.84, 0.08 + v * 0.84);
    ctx.fillStyle = i % 3 === 0 ? ramp[LIGHT] : ramp[SHADOW];
    ctx.globalAlpha = 0.5;
    ctx.fillRect(p.x, p.y, s, s);
  }
  ctx.globalAlpha = 1;
}

// The wall ramp, roof ramp, lit-window colour and any feature for a lot's building, by zone and
// resident class. Sea-rotted clapboard for the Unwary; brine-green for Deep Ones; a pale sigil
// for Cultists; a smokestack for industry (STUDY 2.2 materials).
function buildingStyle(zone, cls) {
  if (zone === 'industrial') return { wall: 'brick', roof: 'slate', win: '#8a7a3a', feature: 'stack' };
  if (zone === 'commercial') return { wall: 'clapboard', roof: 'slate', win: '#e0b64c', feature: 'shopfront' };
  // residential varies by class
  if (cls === 'deepone') return { wall: 'shallow', roof: 'slate', win: '#6a9c8b', feature: 'none' };
  if (cls === 'cultist') return { wall: 'clapboard', roof: 'slate', win: '#b8892f', feature: 'sigil' };
  return { wall: 'clapboard', roof: 'slate', win: '#e0b64c', feature: 'none' }; // Unwary
}

const LEVEL_HEIGHT = [0, 1.1, 2.1, 3.2]; // building height in elevation units per tier

// Draw a dimetric building: two lit/shadowed clapboard walls rising from the lot, a slate roof
// with a gable ridge, rows of lamplit windows, and a per-type feature. Reads as a small 1920s
// structure, not a box.
function drawBuilding(ctx, faces, building, zone, zoom, sprites, col = 0, row = 0) {
  const style = buildingStyle(zone, building.cls);
  const wall = RAMP[style.wall];
  const roof = RAMP[style.roof];
  const H = (LEVEL_HEIGHT[building.level] || 1.1) * ELEV_STEP * zoom;

  const L = faces.left; const B = faces.bottom; const R = faces.right; const T = faces.top;
  const up = (p) => ({ x: p.x, y: p.y - H });
  const Lr = up(L); const Br = up(B); const Rr = up(R); const Tr = up(T);

  // The shade it stands in, before anything else, so the house seats on its lot.
  i2ContactShade(ctx, faces, zoom);

  // Front walls (light from the upper right: right face lit, left face shadowed). Both faces sit a
  // ramp step ABOVE where the M7 pass put them: with the blue-hour palette underneath, SHADOW/BASE
  // rendered the whole town as black blocks, and the approved direction has weathered boards you
  // can still read the colour of.
  fillPoly(ctx, [L, B, Br, Lr], wall[BASE]); // left face
  fillPoly(ctx, [B, R, Rr, Br], wall[LIGHT]); // right face
  // Board grain, then the wall edge seams for a clapboard read.
  const seed = col * 41 + row * 23;
  i2FaceGrain(ctx, [Lr, Br, B, L], wall, zoom, seed, 6);
  i2FaceGrain(ctx, [Br, Rr, R, B], wall, zoom, seed + 5, 8);
  strokePoly(ctx, [Lr, Br, Rr], wall[HIGHLIGHT], Math.max(1, zoom * 0.75));

  // Roof: raised top diamond, slate, with a gable ridge and a lit edge. Slate is the DARK mass over
  // the lit boards, which is what gives the town its silhouette from above.
  fillPoly(ctx, [Tr, Rr, Br, Lr], roof[BASE]);
  fillPoly(ctx, [Tr, Rr, Br], roof[SHADOW]); // right roof slope a touch darker
  i2FaceGrain(ctx, [Tr, Rr, Br, Lr], roof, zoom, seed + 17, 6);
  strokeLine(ctx, Tr, Br, CHROME.ink, Math.max(1, zoom * 0.75)); // ridge
  strokePoly(ctx, [Lr, Tr, Rr], roof[HIGHLIGHT], Math.max(1, zoom * 0.6)); // sunlit eaves

  // Windows LAST, over the roof line, because they are light rather than paint: the glow has to
  // spill onto the eaves and the air beside the house, not sit under them.
  const rows = building.level + 1;
  const cols = 2;
  drawWindows(ctx, [Lr, Br, B, L], cols, rows, style.win, zoom, 0.55, sprites);
  drawWindows(ctx, [Br, Rr, R, B], cols, rows, style.win, zoom, 1.0, sprites);

  // Per-type feature.
  if (style.feature === 'stack') {
    const sx = Tr.x + (Rr.x - Tr.x) * 0.35;
    const sy = Tr.y + (Rr.y - Tr.y) * 0.35;
    ctx.fillStyle = RAMP.rock[SHADOW];
    ctx.fillRect(sx - 2 * zoom, sy - 10 * zoom, 4 * zoom, 12 * zoom);
  } else if (style.feature === 'sigil') {
    // A pale mark over the door on the lit face.
    const c = { x: (Br.x + R.x + B.x + Rr.x) / 4, y: (Br.y + R.y + B.y + Rr.y) / 4 };
    ctx.strokeStyle = '#c9c2a8';
    ctx.lineWidth = Math.max(1, zoom * 0.6);
    ctx.beginPath();
    ctx.arc(c.x, c.y - 2 * zoom, 3 * zoom, 0, Math.PI * 2);
    ctx.stroke();
  }
}

// Bilinear point in a quad [p00, p10, p11, p01] at parameters (u across, v down).
function quadPoint(q, u, v) {
  const top = { x: q[0].x + (q[1].x - q[0].x) * u, y: q[0].y + (q[1].y - q[0].y) * u };
  const bot = { x: q[3].x + (q[2].x - q[3].x) * u, y: q[3].y + (q[2].y - q[3].y) * u };
  return { x: top.x + (bot.x - top.x) * v, y: top.y + (bot.y - top.y) * v };
}

// A grid of small lit windows on a wall quad [topLeft, topRight, botRight, botLeft].
//
// A window is a LIGHT SOURCE, not a yellow rectangle. Each pane gets its pigment, then a hot core
// pixel, and the face gets one additive halo over the whole lit band, so the glow spills onto the
// boards and the air the way it does in the approved direction. One halo per face rather than one
// per pane: at these zooms it reads identically and costs a fraction.
function drawWindows(ctx, quad, cols, rows, color, zoom, brightness, sprites = null) {
  const wpad = 0.22;
  const hpad = 0.18;
  const lit = Math.max(0.35, Math.min(1, brightness));
  ctx.fillStyle = color;
  ctx.globalAlpha = lit;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const u = wpad + (c + 0.5) * (1 - 2 * wpad) / cols;
      const v = hpad + (r + 0.5) * (1 - 2 * hpad) / rows;
      const p = quadPoint(quad, u, v);
      const s = 1.6 * zoom;
      ctx.fillRect(p.x - s / 2, p.y - s / 2, s, s * 1.3);
    }
  }
  ctx.globalAlpha = 1;
  // A tight bloom on each pane, then a hot core inside it. The bloom is deliberately SMALL: a
  // lamplit sash throws a few inches of light onto the boards around it, and the first cut of this
  // pass (one face-wide halo) put an orange disc the size of the roof on every house.
  const halo = Math.min(9 * zoom, Math.max(3, 4.5 * zoom));
  const core = Math.max(1, 0.9 * zoom);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const u = wpad + (c + 0.5) * (1 - 2 * wpad) / cols;
      const v = hpad + (r + 0.5) * (1 - 2 * hpad) / rows;
      const p = quadPoint(quad, u, v);
      if (zoom >= 0.75) i2Glow(ctx, sprites, p.x, p.y, halo, color, 0.34 * lit, 2.6);
      ctx.fillStyle = RAMP.gold[HIGHLIGHT];
      ctx.globalAlpha = Math.min(1, lit);
      ctx.fillRect(p.x - core / 2, p.y - core / 2, core, core);
      ctx.globalAlpha = 1;
    }
  }
}

function strokePoly(ctx, pts, color, w) {
  ctx.strokeStyle = color;
  ctx.lineWidth = w;
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.stroke();
}

function strokeLine(ctx, a, b, color, w) {
  ctx.strokeStyle = color;
  ctx.lineWidth = w;
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
}

// Wall / roof ramps per structure kind. Sea-rotted materials from the one palette (STUDY 2.2):
// iron-grey works, weathered clapboard civic halls, cold slate, and the shrine's black stone.
const STRUCT_STYLE = {
  gasworks: { wall: 'rock', roof: 'rock', H: 1.7 },
  whaleoil: { wall: 'clapboard', roof: 'slate', H: 1.9 },
  constabulary: { wall: 'clapboard', roof: 'slate', H: 1.9 },
  asylum: { wall: 'rock', roof: 'slate', H: 2.3 },
  chapel: { wall: 'clapboard', roof: 'slate', H: 1.8 },
  shrine: { wall: 'slate', roof: 'slate', H: 1.1 },
  university: { wall: 'rock', roof: 'slate', H: 2.0 },
  // The water works (M-a): a low brick pump house, a small clapboard well cover, and a squat
  // stone cistern. All three read short beside the civic halls, as municipal plant should.
  pumphouse: { wall: 'rock', roof: 'slate', H: 1.4 },
  wellhouse: { wall: 'clapboard', roof: 'slate', H: 1.0 },
  reservoir: { wall: 'rock', roof: 'rock', H: 1.2 },
  // The filter house (M-b): open sand beds beside a low brick shed. Lower than the pump house, so
  // the two are never confused from above.
  filterhouse: { wall: 'rock', roof: 'slate', H: 1.1 },
};

// Draw a placed civic structure as a real dimetric building with a distinctive silhouette: the
// gasholder drum, the rendering-works chimney, the watch-house blue lamp, the asylum cupola, the
// chapel steeple, the cult shrine's black monolith. Reuses the building light model (right face
// lit, left face shadowed) so it seats with the rest of the town.
function drawStructure(ctx, faces, structure, zoom, sprites = null, col = 0, row = 0) {
  const kind = structure.kind;
  const style = STRUCT_STYLE[kind] || STRUCT_STYLE.gasworks;

  // The gasworks is a cylindrical gasholder and the shrine is a standing monolith, not boxy
  // halls: draw each apart from the civic-building base.
  if (kind === 'gasworks') { i2ContactShade(ctx, faces, zoom); drawGasholder(ctx, faces, zoom); return; }
  if (kind === 'shrine') { i2ContactShade(ctx, faces, zoom, 0.8); drawShrine(ctx, faces, zoom, sprites); return; }

  const wall = RAMP[style.wall];
  const roof = RAMP[style.roof];
  const H = style.H * ELEV_STEP * zoom;
  const L = faces.left; const B = faces.bottom; const R = faces.right; const T = faces.top;
  const up = (p, h = H) => ({ x: p.x, y: p.y - h });
  const Lr = up(L); const Br = up(B); const Rr = up(R); const Tr = up(T);
  const seed = col * 41 + row * 23 + 101;

  i2ContactShade(ctx, faces, zoom, 1.05);

  // Front walls (same one-step lift as the houses: see drawBuilding).
  fillPoly(ctx, [L, B, Br, Lr], wall[BASE]); // left face (shadowed)
  fillPoly(ctx, [B, R, Rr, Br], wall[LIGHT]); // right face (lit)
  i2FaceGrain(ctx, [Lr, Br, B, L], wall, zoom, seed, 7);
  i2FaceGrain(ctx, [Br, Rr, R, B], wall, zoom, seed + 5, 9);
  strokePoly(ctx, [Lr, Br, Rr], wall[HIGHLIGHT], Math.max(1, zoom * 0.7));

  // Roof: the raised top diamond in slate with a gable ridge and a sunlit eave.
  fillPoly(ctx, [Tr, Rr, Br, Lr], roof[BASE]);
  fillPoly(ctx, [Tr, Rr, Br], roof[SHADOW]);
  i2FaceGrain(ctx, [Tr, Rr, Br, Lr], roof, zoom, seed + 17, 7);
  strokeLine(ctx, Tr, Br, CHROME.ink, Math.max(1, zoom * 0.7));
  strokePoly(ctx, [Lr, Tr, Rr], roof[HIGHLIGHT], Math.max(1, zoom * 0.55));

  const center = { x: (Lr.x + Rr.x) / 2, y: (Tr.y + Br.y) / 2 };

  if (kind === 'whaleoil') {
    // Barred windows on the works, a squat oil tank, and a tall smoking chimney.
    drawWindows(ctx, [Br, Rr, R, B], 3, 2, '#5a3f28', zoom, 0.9, sprites);
    // Oil tank (a small dark drum) on the left roof.
    const tk = { x: Tr.x + (Lr.x - Tr.x) * 0.5, y: Tr.y + (Lr.y - Tr.y) * 0.5 - 2 * zoom };
    fillEllipse(ctx, tk, 4 * zoom, 2 * zoom, RAMP.rock[SHADOW]);
    fillRectUp(ctx, tk, 4 * zoom, 5 * zoom, RAMP.rock[BASE]);
    fillEllipse(ctx, { x: tk.x, y: tk.y - 5 * zoom }, 4 * zoom, 2 * zoom, RAMP.rock[LIGHT]);
    // Chimney rising from the right roof, with a plume.
    const ch = { x: Tr.x + (Rr.x - Tr.x) * 0.55, y: Tr.y + (Rr.y - Tr.y) * 0.55 };
    ctx.fillStyle = RAMP.rock[BASE];
    ctx.fillRect(ch.x - 2 * zoom, ch.y - 18 * zoom, 4 * zoom, 18 * zoom);
    ctx.fillStyle = RAMP.rock[SHADOW];
    ctx.fillRect(ch.x - 2 * zoom, ch.y - 18 * zoom, 1.4 * zoom, 18 * zoom);
    // The furnace showing at the chimney mouth, under the plume.
    i2Glow(ctx, sprites, ch.x, ch.y - 18 * zoom, Math.max(5, 9 * zoom), '#8e3d33', 0.34, 2.2);
    drawSmoke(ctx, { x: ch.x, y: ch.y - 18 * zoom }, zoom);
  } else if (kind === 'constabulary') {
    drawWindows(ctx, [Lr, Br, B, L], 2, 2, '#8a7a3a', zoom, 0.55, sprites);
    drawWindows(ctx, [Br, Rr, R, B], 2, 2, '#c9a94a', zoom, 1.0, sprites);
    // The blue watch lamp over the door on the lit face, throwing its own cold light on the boards.
    const d = { x: (Br.x + R.x) / 2, y: (Br.y + R.y) / 2 - 3 * zoom };
    i2Glow(ctx, sprites, d.x, d.y, Math.max(7, 12 * zoom), '#2f5fa0', 0.44, 2.2);
    ctx.fillStyle = '#2f5fa0';
    ctx.beginPath();
    ctx.arc(d.x, d.y, Math.max(1.4, 2.2 * zoom), 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#8fb6e0'; ctx.lineWidth = Math.max(1, 0.6 * zoom); ctx.stroke();
  } else if (kind === 'asylum') {
    // Rows of barred institutional windows and a prominent central cupola with a pale dome, the
    // signature that sets the sanitarium apart from the town's other dark halls.
    drawBarredWindows(ctx, [Lr, Br, B, L], 3, 2, zoom, 0.55, sprites);
    drawBarredWindows(ctx, [Br, Rr, R, B], 3, 2, zoom, 0.9, sprites);
    const cup = { x: center.x, y: center.y - 4 * zoom };
    // A short drum, lit and shadowed like the walls.
    ctx.fillStyle = RAMP.rock[SHADOW];
    ctx.fillRect(cup.x - 5 * zoom, cup.y - 7 * zoom, 5 * zoom, 8 * zoom);
    ctx.fillStyle = RAMP.rock[LIGHT];
    ctx.fillRect(cup.x, cup.y - 7 * zoom, 5 * zoom, 8 * zoom);
    ctx.strokeStyle = '#2a2823'; ctx.lineWidth = Math.max(1, 0.5 * zoom);
    ctx.strokeRect(cup.x - 5 * zoom, cup.y - 7 * zoom, 10 * zoom, 8 * zoom);
    // The pale dome.
    fillEllipse(ctx, { x: cup.x, y: cup.y - 7 * zoom }, 6 * zoom, 3 * zoom, '#b9b4a4');
    ctx.fillStyle = '#8f8a7c';
    ctx.beginPath();
    if (ctx.ellipse) ctx.ellipse(cup.x, cup.y - 7 * zoom, 6 * zoom, 3 * zoom, 0, Math.PI, Math.PI * 2);
    else ctx.arc(cup.x, cup.y - 7 * zoom, 6 * zoom, 0, Math.PI);
    ctx.fill();
    // A little finial spike.
    ctx.fillStyle = '#2a2823';
    ctx.fillRect(cup.x - 0.6 * zoom, cup.y - 12 * zoom, 1.2 * zoom, 3 * zoom);
  } else if (kind === 'chapel') {
    drawWindows(ctx, [Lr, Br, B, L], 1, 2, '#b89a4a', zoom, 0.55, sprites);
    drawWindows(ctx, [Br, Rr, R, B], 1, 2, '#e0b64c', zoom, 1.0, sprites);
    // The steeple: a tall spire over the front gable, with a finial.
    const base = { x: Tr.x + (Br.x - Tr.x) * 0.28, y: Tr.y + (Br.y - Tr.y) * 0.28 };
    const spireH = 20 * zoom;
    const apex = { x: base.x, y: base.y - spireH };
    // Tower.
    fillRectUp(ctx, base, 4 * zoom, 8 * zoom, RAMP.clapboard[BASE]);
    ctx.fillStyle = RAMP.clapboard[SHADOW];
    ctx.fillRect(base.x - 2 * zoom, base.y - 8 * zoom, 1.4 * zoom, 8 * zoom);
    // Spire.
    ctx.fillStyle = RAMP.slate[BASE];
    ctx.beginPath();
    ctx.moveTo(base.x - 3 * zoom, base.y - 8 * zoom);
    ctx.lineTo(apex.x, apex.y);
    ctx.lineTo(base.x + 3 * zoom, base.y - 8 * zoom);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = RAMP.slate[HIGHLIGHT]; ctx.lineWidth = Math.max(1, 0.6 * zoom);
    ctx.beginPath(); ctx.moveTo(base.x + 3 * zoom, base.y - 8 * zoom); ctx.lineTo(apex.x, apex.y); ctx.stroke();
    // Finial.
    ctx.fillStyle = '#c9c2a8';
    ctx.fillRect(apex.x - 0.8 * zoom, apex.y - 3 * zoom, 1.6 * zoom, 3 * zoom);
  } else if (kind === 'university') {
    // A stone college hall: ranks of tall lit windows, a square battlemented tower with a lit
    // clock, and the Containment Wing marked by a cold violet lamp holding the Rift at bay.
    drawWindows(ctx, [Lr, Br, B, L], 3, 2, '#8a7a3a', zoom, 0.55, sprites);
    drawWindows(ctx, [Br, Rr, R, B], 3, 2, '#d8b45a', zoom, 1.0, sprites);
    // The battlemented tower over the left of the roof.
    const tw = { x: Tr.x + (Lr.x - Tr.x) * 0.42, y: Tr.y + (Lr.y - Tr.y) * 0.42 };
    const towH = 13 * zoom;
    ctx.fillStyle = RAMP.rock[BASE];
    ctx.fillRect(tw.x - 4.5 * zoom, tw.y - towH, 9 * zoom, towH);
    ctx.fillStyle = RAMP.rock[SHADOW];
    ctx.fillRect(tw.x - 4.5 * zoom, tw.y - towH, 3 * zoom, towH); // shadowed left
    ctx.strokeStyle = '#2a2823'; ctx.lineWidth = Math.max(1, 0.5 * zoom);
    ctx.strokeRect(tw.x - 4.5 * zoom, tw.y - towH, 9 * zoom, towH);
    // Crenellations along the tower top.
    ctx.fillStyle = RAMP.rock[LIGHT];
    for (let i = 0; i < 3; i++) {
      ctx.fillRect(tw.x - 4.5 * zoom + i * 3.2 * zoom, tw.y - towH - 2 * zoom, 2 * zoom, 2 * zoom);
    }
    // The lit clock face.
    ctx.fillStyle = '#e6d9a8';
    ctx.beginPath(); ctx.arc(tw.x, tw.y - towH * 0.55, 2.4 * zoom, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#2a2823'; ctx.beginPath();
    ctx.moveTo(tw.x, tw.y - towH * 0.55); ctx.lineTo(tw.x + 1.4 * zoom, tw.y - towH * 0.55 - 0.6 * zoom);
    ctx.moveTo(tw.x, tw.y - towH * 0.55); ctx.lineTo(tw.x, tw.y - towH * 0.55 - 1.8 * zoom); ctx.stroke();
    // The Containment Wing lamp: a cold violet glow on the right roof (the Yog-Sothoth hold).
    const cw = { x: Tr.x + (Rr.x - Tr.x) * 0.6, y: Tr.y + (Rr.y - Tr.y) * 0.6 - 2 * zoom };
    i2Glow(ctx, sprites, cw.x, cw.y, Math.max(8, 14 * zoom), '#7a5aa8', 0.42, 2.2);
    fillEllipse(ctx, cw, 1.8 * zoom, 1.8 * zoom, '#c3a8e0');
  } else if (kind === 'pumphouse') {
    // The municipal pump: a brick engine house with a lit window, a stubby vent stack, and a
    // standpipe elbow at the eave where the rising main turns down into the ground.
    drawWindows(ctx, [Br, Rr, R, B], 2, 1, '#c9a94a', zoom, 0.9, sprites);
    const st = { x: Tr.x + (Rr.x - Tr.x) * 0.5, y: Tr.y + (Rr.y - Tr.y) * 0.5 };
    ctx.fillStyle = RAMP.rock[BASE];
    ctx.fillRect(st.x - 2 * zoom, st.y - 10 * zoom, 4 * zoom, 10 * zoom); // vent stack
    ctx.fillStyle = RAMP.rock[SHADOW];
    ctx.fillRect(st.x - 2 * zoom, st.y - 10 * zoom, 1.4 * zoom, 10 * zoom);
    // The standpipe: up the lit face and over, in the same cold blue the mains use below.
    const sp = { x: (Br.x + Rr.x) / 2, y: (Br.y + Rr.y) / 2 };
    ctx.strokeStyle = UNDERGROUND.pipeGood;
    ctx.lineWidth = Math.max(1.4, 2 * zoom);
    ctx.beginPath();
    ctx.moveTo(sp.x + 5 * zoom, sp.y + 6 * zoom);
    ctx.lineTo(sp.x + 5 * zoom, sp.y - 4 * zoom);
    ctx.lineTo(sp.x - 1 * zoom, sp.y - 6 * zoom);
    ctx.stroke();
  } else if (kind === 'wellhouse') {
    // A covered well: a small shingled cap over a stone curb, with the windlass post beside it.
    // Deliberately the humblest thing the player can build.
    const cw2 = { x: (Lr.x + Rr.x) / 2, y: (Tr.y + Br.y) / 2 };
    fillEllipse(ctx, { x: cw2.x, y: cw2.y + 1 * zoom }, 5 * zoom, 2.6 * zoom, RAMP.rock[SHADOW]);
    fillEllipse(ctx, cw2, 4 * zoom, 2 * zoom, RAMP.rock[BASE]);
    fillEllipse(ctx, cw2, 2.4 * zoom, 1.2 * zoom, '#12161a'); // the shaft, dark all the way down
    // The windlass post and its crank.
    ctx.strokeStyle = RAMP.clapboard[SHADOW];
    ctx.lineWidth = Math.max(1, 1.2 * zoom);
    ctx.beginPath();
    ctx.moveTo(cw2.x - 4 * zoom, cw2.y); ctx.lineTo(cw2.x - 4 * zoom, cw2.y - 6 * zoom);
    ctx.lineTo(cw2.x + 4 * zoom, cw2.y - 6 * zoom); ctx.lineTo(cw2.x + 4 * zoom, cw2.y);
    ctx.stroke();
  } else if (kind === 'filterhouse') {
    // Two open sand beds set in stone kerbs, and a lit test-bench window in the shed beside them.
    // The beds are the silhouette: flat rectangles where every other works has a stack or a drum.
    const top = { x: (Lr.x + Rr.x) / 2, y: (Tr.y + Br.y) / 2 };
    for (const k of [-1, 1]) {
      const bed = { x: top.x + k * faces.hw * 0.26, y: top.y + k * faces.hh * 0.26 };
      fillDiamond(ctx, bed, faces.hw * 0.3, faces.hh * 0.3, RAMP.rock[SHADOW]); // the kerb
      fillDiamond(ctx, bed, faces.hw * 0.22, faces.hh * 0.22, RAMP.beach[LIGHT]); // the sand
    }
    // A skim of standing water across the nearer bed, so it reads as a working filter.
    const near = { x: top.x + faces.hw * 0.26, y: top.y + faces.hh * 0.26 };
    ctx.strokeStyle = UNDERGROUND.pipeGoodLit;
    ctx.lineWidth = Math.max(1, 0.7 * zoom);
    ctx.beginPath();
    ctx.moveTo(near.x - faces.hw * 0.14, near.y);
    ctx.lineTo(near.x + faces.hw * 0.06, near.y - faces.hh * 0.1);
    ctx.stroke();
    drawWindows(ctx, [Br, Rr, R, B], 1, 1, '#d8cf9a', zoom, 1.0, sprites); // the test bench, lit late
  } else if (kind === 'reservoir') {
    // A hill cistern: an open stone tank holding still water, with a low parapet all round. No
    // windows and no chimney, so it never reads as a hall.
    const top = { x: (Lr.x + Rr.x) / 2, y: (Tr.y + Br.y) / 2 };
    fillDiamond(ctx, top, faces.hw * 0.74, faces.hh * 0.74, RAMP.rock[SHADOW]); // the parapet
    fillDiamond(ctx, top, faces.hw * 0.6, faces.hh * 0.6, UNDERGROUND.pipeGood); // the held water
    // A still highlight across the water, so it reads wet rather than painted.
    ctx.strokeStyle = UNDERGROUND.pipeGoodLit;
    ctx.lineWidth = Math.max(1, 0.8 * zoom);
    ctx.beginPath();
    ctx.moveTo(top.x - faces.hw * 0.32, top.y - faces.hh * 0.1);
    ctx.lineTo(top.x + faces.hw * 0.1, top.y - faces.hh * 0.3);
    ctx.stroke();
  }
}

// The cult shrine: not a hall but a ring of rough dark stones about a tall black monolith, canted
// wrong, crowned with a cold green witch-light. Reads at a glance as the town's sinister note.
function drawShrine(ctx, faces, zoom, sprites = null) {
  const c = faces.center;
  // A low earthen plinth so the stones seat on the ground.
  fillDiamond(ctx, c, faces.hw * 0.62, faces.hh * 0.62, RAMP.dirt[SHADOW]);
  fillDiamond(ctx, c, faces.hw * 0.5, faces.hh * 0.5, '#2b2c30');

  // Two low flanking standing stones.
  const stone = (sx, sy, w, h) => {
    ctx.fillStyle = RAMP.slate[SHADOW];
    ctx.beginPath();
    ctx.moveTo(sx - w, sy);
    ctx.lineTo(sx + w, sy);
    ctx.lineTo(sx + w * 0.7, sy - h);
    ctx.lineTo(sx - w * 0.7, sy - h);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#4d6b60'; ctx.lineWidth = Math.max(1, 0.5 * zoom);
    ctx.beginPath(); ctx.moveTo(sx + w, sy); ctx.lineTo(sx + w * 0.7, sy - h); ctx.stroke();
  };
  stone(c.x - faces.hw * 0.42, c.y + faces.hh * 0.18, 2.4 * zoom, 8 * zoom);
  stone(c.x + faces.hw * 0.42, c.y + faces.hh * 0.18, 2.4 * zoom, 8 * zoom);

  // The central monolith: a broad black slab, leaning, tall enough to read as cyclopean.
  const base = { x: c.x, y: c.y + 3 * zoom };
  const monoH = 22 * zoom;
  const lean = 2.5 * zoom;
  const top = { x: base.x + lean, y: base.y - monoH };
  const bw = 5.5 * zoom;
  const tw = 4.2 * zoom;
  // Shadowed left face.
  ctx.fillStyle = '#17181c';
  ctx.beginPath();
  ctx.moveTo(base.x - bw, base.y);
  ctx.lineTo(base.x, base.y + 1.5 * zoom);
  ctx.lineTo(top.x, top.y + 1.5 * zoom);
  ctx.lineTo(top.x - tw, top.y);
  ctx.closePath();
  ctx.fill();
  // Lit right face (a hair greener, sea-rotted stone).
  ctx.fillStyle = '#26302c';
  ctx.beginPath();
  ctx.moveTo(base.x + bw, base.y);
  ctx.lineTo(base.x, base.y + 1.5 * zoom);
  ctx.lineTo(top.x, top.y + 1.5 * zoom);
  ctx.lineTo(top.x + tw, top.y);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#3a4a44'; ctx.lineWidth = Math.max(1, 0.6 * zoom);
  ctx.beginPath(); ctx.moveTo(base.x, base.y + 1.5 * zoom); ctx.lineTo(top.x, top.y + 1.5 * zoom); ctx.stroke();

  // The cold witch-light crown: real added light this time, so it throws its green onto the stones
  // and the air, then a bright core that stays sharp inside it.
  i2Glow(ctx, sprites, top.x, top.y, Math.max(9, 17 * zoom), '#4a8f78', 0.5, 2.1);
  fillEllipse(ctx, top, 2.2 * zoom, 2.2 * zoom, '#8fdcc2');
}

// A cylindrical gasholder drum with iron lattice bands, seated on the lot.
function drawGasholder(ctx, faces, zoom) {
  const c = faces.center;
  const rx = faces.hw * 0.72;
  const ry = faces.hh * 0.72;
  const H = 20 * zoom;
  const iron = RAMP.rock;
  // Bottom ellipse (shadow), side band, top ellipse (lit).
  fillEllipse(ctx, c, rx, ry, iron[SHADOW]);
  // Side wall as a quad between the two ellipses.
  ctx.fillStyle = iron[BASE];
  ctx.beginPath();
  ctx.moveTo(c.x - rx, c.y);
  ctx.lineTo(c.x - rx, c.y - H);
  ctx.lineTo(c.x + rx, c.y - H);
  ctx.lineTo(c.x + rx, c.y);
  ctx.closePath();
  ctx.fill();
  // A shaded left third for cylinder roundness.
  ctx.fillStyle = iron[SHADOW];
  ctx.beginPath();
  ctx.moveTo(c.x - rx, c.y);
  ctx.lineTo(c.x - rx, c.y - H);
  ctx.lineTo(c.x - rx * 0.3, c.y - H);
  ctx.lineTo(c.x - rx * 0.3, c.y);
  ctx.closePath();
  ctx.fill();
  // Iron lattice bands.
  ctx.strokeStyle = iron[HIGHLIGHT]; ctx.lineWidth = Math.max(1, 0.6 * zoom);
  for (const f of [0.15, 0.5, 0.85]) {
    const y = c.y - H * f;
    ctx.beginPath();
    ctx.ellipse ? ctx.ellipse(c.x, y, rx, ry * 0.5, 0, 0, Math.PI, false)
      : ctx.arc(c.x, y, rx, 0, Math.PI, false);
    ctx.stroke();
  }
  // Top drum.
  fillEllipse(ctx, { x: c.x, y: c.y - H }, rx, ry, iron[LIGHT]);
  ctx.strokeStyle = iron[HIGHLIGHT]; ctx.lineWidth = Math.max(1, 0.7 * zoom);
  ctx.beginPath();
  if (ctx.ellipse) ctx.ellipse(c.x, c.y - H, rx, ry, 0, 0, Math.PI * 2);
  else ctx.arc(c.x, c.y - H, rx, 0, Math.PI * 2);
  ctx.stroke();
}

// A grid of barred windows (a lit pane crossed by two dark bars) on a wall quad.
function drawBarredWindows(ctx, quad, cols, rows, zoom, brightness, sprites = null) {
  const wpad = 0.2;
  const hpad = 0.16;
  // The sanitarium's light is institutional and grudging: one weak halo over the whole rank, so it
  // never reads as warm as a house does.
  const mid = quadPoint(quad, 0.5, 0.5);
  i2Glow(ctx, sprites, mid.x, mid.y, Math.max(6, 11 * zoom), '#7a6a34', 0.18 * brightness, 2.2);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const u = wpad + (c + 0.5) * (1 - 2 * wpad) / cols;
      const v = hpad + (r + 0.5) * (1 - 2 * hpad) / rows;
      const p = quadPoint(quad, u, v);
      const s = 2.0 * zoom;
      ctx.globalAlpha = Math.max(0.4, brightness);
      ctx.fillStyle = '#7a6a34';
      ctx.fillRect(p.x - s / 2, p.y - s / 2, s, s * 1.2);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = RAMP.rock[SHADOW]; ctx.lineWidth = Math.max(0.6, 0.4 * zoom);
      ctx.beginPath();
      ctx.moveTo(p.x, p.y - s / 2); ctx.lineTo(p.x, p.y + s * 0.7);
      ctx.moveTo(p.x - s / 2, p.y); ctx.lineTo(p.x + s / 2, p.y);
      ctx.stroke();
    }
  }
}

function drawSmoke(ctx, top, zoom) {
  ctx.fillStyle = 'rgba(120,120,120,0.5)';
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.arc(top.x + i * 1.5 * zoom, top.y - i * 4 * zoom, (2 + i) * zoom, 0, Math.PI * 2);
    ctx.fill();
  }
}

// A small vertical box (footprint centred at c, rising h) for cupolas, towers, tanks.
function fillRectUp(ctx, c, halfW, h, color) {
  ctx.fillStyle = color;
  ctx.fillRect(c.x - halfW, c.y - h, halfW * 2, h);
}

function fillEllipse(ctx, c, rx, ry, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  if (ctx.ellipse) ctx.ellipse(c.x, c.y, rx, ry, 0, 0, Math.PI * 2);
  else ctx.arc(c.x, c.y, rx, 0, Math.PI * 2);
  ctx.fill();
}

// --- disaster art (M6) -------------------------------------------------------------------

// A cheap deterministic hash in [0,1) from a tile's coordinates, so each scarred/burning lot
// varies without any RNG state (the render must stay pure and repaint-stable).
function tileHash(col, row, salt = 0) {
  let h = (col * 374761393 + row * 668265263 + salt * 2246822519) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return (h >>> 8) / 0x1000000;
}

// What a wrath leaves behind, drawn on the top face of a razed lot.
function drawScar(ctx, faces, scar, zoom, col, row) {
  if (scar.kind === 'burnt') drawBurnt(ctx, faces, zoom, col, row);
  else if (scar.kind === 'overgrown') drawOvergrown(ctx, faces, zoom, col, row);
  else if (scar.kind === 'rubble') drawRubble(ctx, faces, zoom, col, row);
  else if (scar.kind === 'flooded') drawFloodFoam(ctx, faces, zoom, col, row);
}

// Scorched earth: a blackened diamond with a few charred stubs.
function drawBurnt(ctx, faces, zoom, col, row) {
  const c = faces.center;
  ctx.save();
  ctx.globalAlpha = 0.82;
  fillDiamond(ctx, c, faces.hw * 0.9, faces.hh * 0.9, '#1c1712');
  ctx.globalAlpha = 1;
  // Grey ash flecks and charred posts.
  for (let i = 0; i < 4; i++) {
    const a = tileHash(col, row, i) * Math.PI * 2;
    const rr = tileHash(row, col, i) * faces.hw * 0.55;
    const px = c.x + Math.cos(a) * rr;
    const py = c.y + Math.sin(a) * rr * 0.5;
    ctx.fillStyle = i % 2 ? '#3a332b' : '#0f0d0a';
    ctx.fillRect(px - 1 * zoom, py - 2.5 * zoom, 1.6 * zoom, 3 * zoom);
  }
  ctx.restore();
}

// Rank growth: sickly bright-green clumps and tendrils choking the lot.
function drawOvergrown(ctx, faces, zoom, col, row) {
  const c = faces.center;
  ctx.save();
  ctx.globalAlpha = 0.9;
  fillDiamond(ctx, c, faces.hw * 0.92, faces.hh * 0.92, '#2f5a24');
  ctx.globalAlpha = 1;
  const greens = ['#3f6b28', '#5c8a2f', '#7dae3c', '#9ac24a'];
  for (let i = 0; i < 6; i++) {
    const a = tileHash(col, row, i + 3) * Math.PI * 2;
    const rr = tileHash(row + 1, col, i) * faces.hw * 0.6;
    const px = c.x + Math.cos(a) * rr;
    const py = c.y + Math.sin(a) * rr * 0.5;
    const h = (3 + tileHash(col, row + 2, i) * 6) * zoom;
    ctx.strokeStyle = greens[i % greens.length];
    ctx.lineWidth = Math.max(1, 1.4 * zoom);
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.quadraticCurveTo(px + (i % 2 ? 2 : -2) * zoom, py - h * 0.6, px + (i % 2 ? 1 : -1) * zoom, py - h);
    ctx.stroke();
    ctx.fillStyle = greens[(i + 2) % greens.length];
    ctx.beginPath(); ctx.arc(px + (i % 2 ? 1 : -1) * zoom, py - h, 1.6 * zoom, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

// Collapsed masonry: a low heap of broken grey blocks.
function drawRubble(ctx, faces, zoom, col, row) {
  const c = faces.center;
  fillDiamond(ctx, c, faces.hw * 0.7, faces.hh * 0.7, RAMP.rock[SHADOW]);
  const blocks = ['#565963', '#6f7480', '#3f4148', '#8b909d'];
  for (let i = 0; i < 5; i++) {
    const bx = c.x + (tileHash(col, row, i) - 0.5) * faces.hw * 1.0;
    const by = c.y + (tileHash(row, col, i + 1) - 0.5) * faces.hh * 0.9;
    const s = (2 + tileHash(col + 1, row, i) * 2.5) * zoom;
    ctx.fillStyle = blocks[i % blocks.length];
    ctx.fillRect(bx - s / 2, by - s / 2, s, s * 0.8);
    ctx.strokeStyle = '#22242a'; ctx.lineWidth = Math.max(1, 0.4 * zoom);
    ctx.strokeRect(bx - s / 2, by - s / 2, s, s * 0.8);
  }
}

// White foam churning over a freshly drowned lot (it now reads as sea, but troubled sea).
function drawFloodFoam(ctx, faces, zoom, col, row) {
  const c = faces.center;
  ctx.save();
  ctx.globalAlpha = 0.5;
  // Troubled, foam-lit water: with the blue-hour retune the sea itself went near-black, so a
  // freshly drowned lot has to read LIGHTER than the tide around it, not darker.
  fillDiamond(ctx, c, faces.hw * 0.9, faces.hh * 0.9, '#4a6f6a');
  ctx.globalAlpha = 0.85;
  ctx.fillStyle = '#cfe6df';
  for (let i = 0; i < 5; i++) {
    const px = c.x + (tileHash(col, row, i) - 0.5) * faces.hw * 1.3;
    const py = c.y + (tileHash(row, col, i + 2) - 0.5) * faces.hh * 1.3;
    ctx.beginPath(); ctx.arc(px, py, (0.8 + tileHash(col, row, i + 5)) * zoom, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

// The live leading edge of a wrath, drawn over the scar it just laid.
function drawWrathFront(ctx, faces, kind, zoom, col, row) {
  if (kind === 'burning') drawFlames(ctx, faces, zoom, col, row);
  else if (kind === 'greening') drawGreenBloom(ctx, faces, zoom, col, row);
  else if (kind === 'rift') drawRiftGlow(ctx, faces, zoom, col, row);
  else if (kind === 'flood') drawFloodChurn(ctx, faces, zoom, col, row);
  else if (kind === 'awakening') drawQuake(ctx, faces, zoom, col, row);
}

// Tongues of fire rising from a burning lot: a soft glow, then stacked red/orange/gold flames.
function drawFlames(ctx, faces, zoom, col, row) {
  const c = { x: faces.center.x, y: faces.center.y - 2 * zoom };
  ctx.save();
  ctx.globalAlpha = 0.4;
  fillEllipse(ctx, c, 8 * zoom, 5 * zoom, '#b8532a');
  ctx.globalAlpha = 1;
  const tongues = [
    { col: '#7a1e12', h: 10, w: 5, dx: 0 },
    { col: '#c8461c', h: 14, w: 4, dx: -2.5 },
    { col: '#e8802a', h: 12, w: 3.5, dx: 2.5 },
    { col: '#f4c34a', h: 8, w: 2.2, dx: 0 },
  ];
  for (const t of tongues) {
    const jitter = (tileHash(col, row, t.h) - 0.5) * 2 * zoom;
    const bx = c.x + t.dx * zoom + jitter;
    const by = c.y + 3 * zoom;
    const h = t.h * zoom * (0.85 + tileHash(row, col, t.w) * 0.3);
    ctx.fillStyle = t.col;
    ctx.beginPath();
    ctx.moveTo(bx - t.w * zoom, by);
    ctx.quadraticCurveTo(bx - t.w * 0.5 * zoom, by - h * 0.6, bx, by - h);
    ctx.quadraticCurveTo(bx + t.w * 0.5 * zoom, by - h * 0.6, bx + t.w * zoom, by);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

// The advancing edge of the Greening: a taller, brighter burst of growth.
function drawGreenBloom(ctx, faces, zoom, col, row) {
  const c = faces.center;
  ctx.save();
  ctx.globalAlpha = 0.35;
  fillEllipse(ctx, { x: c.x, y: c.y - 3 * zoom }, 7 * zoom, 5 * zoom, '#7dae3c');
  ctx.globalAlpha = 1;
  for (let i = 0; i < 5; i++) {
    const bx = c.x + (tileHash(col, row, i + 7) - 0.5) * faces.hw * 0.9;
    const by = c.y + 2 * zoom;
    const h = (7 + tileHash(row, col, i) * 7) * zoom;
    ctx.strokeStyle = i % 2 ? '#9ac24a' : '#6c9a30';
    ctx.lineWidth = Math.max(1.2, 1.8 * zoom);
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.quadraticCurveTo(bx + (i % 2 ? 3 : -3) * zoom, by - h * 0.6, bx + (i % 2 ? 1.5 : -1.5) * zoom, by - h);
    ctx.stroke();
    ctx.fillStyle = '#c3e07a';
    ctx.beginPath(); ctx.arc(bx + (i % 2 ? 1.5 : -1.5) * zoom, by - h, 2 * zoom, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

// The Rift: a jagged violet tear hanging over the lot, glowing wrong.
function drawRiftGlow(ctx, faces, zoom, col, row) {
  const c = { x: faces.center.x, y: faces.center.y - 4 * zoom };
  ctx.save();
  ctx.globalAlpha = 0.4;
  fillEllipse(ctx, c, 9 * zoom, 7 * zoom, '#4a2a7a');
  ctx.globalAlpha = 1;
  // A vertical jagged slit.
  const h = 12 * zoom;
  ctx.fillStyle = '#1a0f2e';
  ctx.beginPath();
  ctx.moveTo(c.x, c.y - h / 2);
  ctx.lineTo(c.x + 2.5 * zoom, c.y - h * 0.15);
  ctx.lineTo(c.x + 1 * zoom, c.y + h / 2);
  ctx.lineTo(c.x - 2.5 * zoom, c.y + h * 0.2);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#b98fe0'; ctx.lineWidth = Math.max(1, 0.9 * zoom); ctx.stroke();
  // Cold sparks along the tear.
  ctx.fillStyle = '#d9c3f2';
  for (let i = 0; i < 3; i++) {
    const py = c.y - h / 2 + tileHash(col, row, i) * h;
    ctx.fillRect(c.x - 0.6 * zoom, py, 1.2 * zoom, 1.2 * zoom);
  }
  ctx.restore();
}

// The churning tide over a lot the flood is taking this moment.
function drawFloodChurn(ctx, faces, zoom, col, row) {
  const c = faces.center;
  ctx.save();
  ctx.globalAlpha = 0.6;
  fillDiamond(ctx, c, faces.hw * 0.95, faces.hh * 0.95, '#1f3f44');
  ctx.globalAlpha = 0.9;
  ctx.strokeStyle = '#dff0ea'; ctx.lineWidth = Math.max(1, 1.1 * zoom);
  for (let i = 0; i < 3; i++) {
    const yy = c.y + (tileHash(col, row, i) - 0.5) * faces.hh * 1.1;
    ctx.beginPath();
    ctx.moveTo(c.x - faces.hw * 0.6, yy);
    ctx.quadraticCurveTo(c.x, yy - 2 * zoom, c.x + faces.hw * 0.6, yy);
    ctx.stroke();
  }
  ctx.restore();
}

// The earthquake edge: a puff of dust and radiating ground cracks.
function drawQuake(ctx, faces, zoom, col, row) {
  const c = faces.center;
  ctx.save();
  ctx.strokeStyle = '#1a1712'; ctx.lineWidth = Math.max(1, 0.8 * zoom);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + tileHash(col, row, i);
    ctx.beginPath();
    ctx.moveTo(c.x, c.y);
    ctx.lineTo(c.x + Math.cos(a) * faces.hw * 0.7, c.y + Math.sin(a) * faces.hh * 0.7);
    ctx.stroke();
  }
  ctx.globalAlpha = 0.35;
  fillEllipse(ctx, { x: c.x, y: c.y - 4 * zoom }, 7 * zoom, 4 * zoom, '#8a8478');
  ctx.restore();
}

// The no-power mark: a small dim lightning bolt in a slashed disc over a cut-off lot.
function drawNoPower(ctx, faces, zoom) {
  const c = { x: faces.center.x, y: faces.top.y - 4 * zoom };
  const s = Math.max(4, 5 * zoom);
  ctx.fillStyle = 'rgba(20,22,26,0.72)';
  ctx.beginPath();
  ctx.arc(c.x, c.y, s, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#d8b038'; ctx.lineWidth = Math.max(1, 0.9 * zoom);
  ctx.beginPath();
  ctx.moveTo(c.x - s * 0.15, c.y - s * 0.55);
  ctx.lineTo(c.x - s * 0.4, c.y + s * 0.05);
  ctx.lineTo(c.x + s * 0.05, c.y + s * 0.05);
  ctx.lineTo(c.x + s * 0.15, c.y + s * 0.55);
  ctx.lineTo(c.x + s * 0.4, c.y - s * 0.05);
  ctx.lineTo(c.x - s * 0.05, c.y - s * 0.05);
  ctx.closePath();
  ctx.stroke();
}

// A zone lot: a coloured diamond border with corner brackets, the reference's way of showing
// zoning without hiding the ground (STUDY 3). No fill wash, so the land stays readable.
function drawZone(ctx, faces, zone, zoom) {
  const color = ZONE_TINT[zone] || '#888888';
  const inset = 0.82; // pull the marker in from the tile edge
  const c = faces.center;
  const p = (corner) => ({ x: c.x + (corner.x - c.x) * inset, y: c.y + (corner.y - c.y) * inset });
  const T = p(faces.top);
  const R = p(faces.right);
  const B = p(faces.bottom);
  const L = p(faces.left);
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1.5, 2 * zoom);
  ctx.beginPath();
  ctx.moveTo(T.x, T.y);
  ctx.lineTo(R.x, R.y);
  ctx.lineTo(B.x, B.y);
  ctx.lineTo(L.x, L.y);
  ctx.closePath();
  ctx.stroke();
  // Corner nubs make the lot read at a glance and at low zoom.
  const s = 3 * zoom;
  ctx.fillStyle = color;
  for (const corner of [T, R, B, L]) {
    ctx.fillRect(corner.x - s / 2, corner.y - s / 2, s, s);
  }
}

// A road: a dirt ribbon from the tile centre out to each connected edge, so straight runs,
// corners, tees and crossings all emerge from the auto-connect mask. Isolated roads show a
// small central patch.
function drawRoad(ctx, faces, mask, zoom) {
  // The street is cold grey stone-and-cinder, not the brown of bare earth: it has to separate from
  // the marsh it crosses at a glance, and the approved direction reads the lanes as pale ribbons
  // running between the dark blocks.
  const dirt = RAMP.road;
  const c = faces.center;
  const mids = edgeMidpoints(faces);
  const w = 8 * zoom; // roadbed half-width: a lane wide enough to read as pavement
  const curb = w + Math.max(1, zoom); // dark shoulder just outside the bed
  let bits = [DIR.SE.bit, DIR.SW.bit, DIR.NW.bit, DIR.NE.bit].filter((b) => mask & b);
  // An isolated stub still shows a short lane so the tile is never a bare patch.
  if (bits.length === 0) bits = [DIR.SE.bit, DIR.NW.bit];

  // Shadow shoulders first (curb), so arms seat on the ground.
  fillDiamond(ctx, c, curb * 1.2, curb * 0.6, dirt[SHADOW]);
  for (const b of bits) thickLine(ctx, c, mids[b], curb, dirt[SHADOW]);
  // The roadbed.
  fillDiamond(ctx, c, w * 1.2, w * 0.6, dirt[BASE]);
  for (const b of bits) thickLine(ctx, c, mids[b], w, dirt[BASE]);
  // A lighter packed-dirt centre rut down each arm.
  for (const b of bits) thickLine(ctx, c, mids[b], Math.max(1, 1.6 * zoom), dirt[LIGHT]);
}

// A power line: a short pole at the tile centre with slack wires to each connected neighbour.
function drawPowerline(ctx, faces, mask, zoom) {
  const c = faces.center;
  const mids = edgeMidpoints(faces);
  const poleH = 9 * zoom;
  const top = { x: c.x, y: c.y - poleH };
  ctx.strokeStyle = WIRE;
  ctx.lineWidth = Math.max(1, 1 * zoom);
  for (const b of [DIR.SE.bit, DIR.SW.bit, DIR.NW.bit, DIR.NE.bit]) {
    if (!(mask & b)) continue;
    const m = mids[b];
    ctx.beginPath();
    ctx.moveTo(top.x, top.y);
    ctx.lineTo(m.x, m.y - poleH * 0.6); // wire dips toward the neighbour pole
    ctx.stroke();
  }
  // The pole itself.
  ctx.strokeStyle = POLE;
  ctx.lineWidth = Math.max(1, 1.5 * zoom);
  ctx.beginPath();
  ctx.moveTo(c.x, c.y);
  ctx.lineTo(top.x, top.y);
  ctx.stroke();
}

// --- the underground utility view (M-a) --------------------------------------------------

// Fill a tile's whole top face (its four diamond corners) with one flat colour. Used for the soil
// over the ground and for the coverage wash, both of which must cover the tile exactly.
function fillDiamondFaces(ctx, faces, color) {
  fillPoly(ctx, [faces.top, faces.right, faces.bottom, faces.left], color);
}

// What stands on the surface, seen from below: a footprint, not a building. Roads trace their bed
// so the player can still read the street plan and lay trunk mains along it; everything else is a
// flat silhouette. Deliberately low-contrast so the mains always read brightest down here.
function drawSurfaceGhost(ctx, faces, tile, zoom) {
  if (hasNetwork(tile, 'road')) {
    const c = faces.center;
    const mids = edgeMidpoints(faces);
    let bits = [DIR.SE.bit, DIR.SW.bit, DIR.NW.bit, DIR.NE.bit]
      .filter((b) => networkMask(tile, 'road') & b);
    if (bits.length === 0) bits = [DIR.SE.bit, DIR.NW.bit];
    const w = 8 * zoom;
    fillDiamond(ctx, c, w * 1.2, w * 0.6, UNDERGROUND.ghostRoad);
    for (const b of bits) thickLine(ctx, c, mids[b], w, UNDERGROUND.ghostRoad);
  }
  // A building, a civic structure, or bare zoning above: one muted footprint, inset from the edge
  // so neighbouring lots stay distinct.
  if (tile.building || tile.structure || tile.zone) {
    const inset = tile.zone && !tile.building && !tile.structure ? 0.5 : 0.72;
    const c = faces.center;
    const p = (corner) => ({ x: c.x + (corner.x - c.x) * inset, y: c.y + (corner.y - c.y) * inset });
    fillPoly(ctx, [p(faces.top), p(faces.right), p(faces.bottom), p(faces.left)], UNDERGROUND.ghost);
  }
}

// Ground a foul main has seeped into, seen from the street: a green-dark wet patch with a couple of
// standing pools. Read from the surface, it is the tell that something is wrong below.
function drawDampGround(ctx, faces, zoom) {
  const c = faces.center;
  fillDiamond(ctx, c, faces.hw * 0.86, faces.hh * 0.86, UNDERGROUND.damp);
  ctx.fillStyle = UNDERGROUND.taintTaintedLit;
  for (const [dx, dy] of [[-0.22, 0.08], [0.26, -0.12], [0.04, 0.3]]) {
    ctx.beginPath();
    if (ctx.ellipse) {
      ctx.ellipse(c.x + faces.hw * dx, c.y + faces.hh * dy, 2.2 * zoom, 1.1 * zoom, 0, 0, Math.PI * 2);
    } else {
      ctx.arc(c.x + faces.hw * dx, c.y + faces.hh * dy, 1.6 * zoom, 0, Math.PI * 2);
    }
    ctx.fill();
  }
}

// --- the subsurface and its signs (M-b) ---------------------------------------------------

// Cache the deep state's glimpse list as a Set once per frame, rather than scanning an array per
// tile. Keyed on the array identity, so a new month's state rebuilds it and nothing goes stale.
let glimpseCacheKey = null;
let glimpseCacheSet = null;
function withGlimpseSet(deep) {
  if (!deep) return null;
  const list = deep.glimpses || [];
  if (glimpseCacheKey !== list) {
    glimpseCacheKey = list;
    glimpseCacheSet = new Set(list);
  }
  return { marks: deep.marks, glimpseSet: glimpseCacheSet };
}

// The aquifer, faint beneath the whole plane: sweet ground barely tints, brine reads muddy teal, and
// a sea-connected fissure is a hole of black-blue with a cold highlight moving round its rim.
function drawSubstrate(ctx, faces, substrate, zoom, now) {
  if (!substrate) return;
  if (substrate === SUBSTRATE.FRESH) {
    fillDiamondFaces(ctx, faces, UNDERGROUND.aquiferFresh);
    return;
  }
  if (substrate === SUBSTRATE.BRACKISH) {
    fillDiamondFaces(ctx, faces, UNDERGROUND.aquiferBrackish);
    return;
  }
  if (substrate !== SUBSTRATE.FISSURE) return;
  // A void: the ground is simply not there. Drawn as a dark diamond inset from the tile edge, so a
  // run of fissures reads as separate holes rather than one black field.
  const c = faces.center;
  fillDiamond(ctx, c, faces.hw * 0.9, faces.hh * 0.9, UNDERGROUND.aquiferVoid);
  const phase = (now / 1400) % 1;
  const wobble = 0.62 + 0.06 * Math.sin(phase * Math.PI * 2);
  ctx.strokeStyle = UNDERGROUND.voidEdge;
  ctx.lineWidth = Math.max(1, 0.7 * zoom);
  ctx.beginPath();
  ctx.moveTo(c.x, c.y - faces.hh * wobble);
  ctx.lineTo(c.x + faces.hw * wobble, c.y);
  ctx.lineTo(c.x, c.y + faces.hh * wobble);
  ctx.lineTo(c.x - faces.hw * wobble, c.y);
  ctx.closePath();
  ctx.stroke();
}

// Which coverage wash a covered tile gets: the pressure wash when the water is sound, and the
// quality wash once it is not, because on foul water the quality is the thing that matters.
function coverageWash(water, index) {
  const good = water.served.has(index);
  const low = water.lowServed.has(index);
  if (!good && !low) return null;
  const quality = qualityAt(water, index);
  if (quality === QUALITY.INFESTED) return UNDERGROUND.washInfested;
  if (quality === QUALITY.TAINTED) return UNDERGROUND.washTainted;
  if (quality === QUALITY.SUSPECT) return UNDERGROUND.washSuspect;
  return good ? UNDERGROUND.washGood : UNDERGROUND.washLow;
}

// The mottling a length of main carries for its quality, or null when the water is sweet.
function taintPaint(taint) {
  const q = qualityFor(taint);
  if (q === QUALITY.INFESTED) return { body: UNDERGROUND.taintInfested, lit: UNDERGROUND.taintInfestedLit, kind: q };
  if (q === QUALITY.TAINTED) return { body: UNDERGROUND.taintTainted, lit: UNDERGROUND.taintTaintedLit, kind: q };
  if (q === QUALITY.SUSPECT) return { body: UNDERGROUND.taintSuspect, lit: UNDERGROUND.taintSuspectLit, kind: q };
  return null;
}

// A brass valve wheel on the main: a ring with a spoked hub. Shut, it is drawn in the one warm
// colour anywhere on this plane, so a player scanning for the branch they closed finds it at once.
function drawValve(ctx, faces, zoom, shut) {
  const c = faces.center;
  const r = Math.max(2, 3.6 * zoom);
  ctx.strokeStyle = shut ? UNDERGROUND.valveShut : UNDERGROUND.valveOpen;
  ctx.lineWidth = Math.max(1.2, 1.4 * zoom);
  ctx.beginPath();
  ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
  ctx.stroke();
  // Spokes: an X for a shut wheel, a plus for one standing open, so the state reads without colour.
  ctx.beginPath();
  if (shut) {
    ctx.moveTo(c.x - r * 0.7, c.y - r * 0.7); ctx.lineTo(c.x + r * 0.7, c.y + r * 0.7);
    ctx.moveTo(c.x + r * 0.7, c.y - r * 0.7); ctx.lineTo(c.x - r * 0.7, c.y + r * 0.7);
  } else {
    ctx.moveTo(c.x - r, c.y); ctx.lineTo(c.x + r, c.y);
    ctx.moveTo(c.x, c.y - r * 0.6); ctx.lineTo(c.x, c.y + r * 0.6);
  }
  ctx.stroke();
}

// The iron cap of a sealing works: a plate of riveted iron laid over the fissure, with its bolts.
function drawSealCap(ctx, faces, zoom) {
  const c = faces.center;
  fillDiamond(ctx, c, faces.hw * 0.66, faces.hh * 0.66, UNDERGROUND.sealCap);
  ctx.strokeStyle = UNDERGROUND.sealCapLit;
  ctx.lineWidth = Math.max(1, 0.8 * zoom);
  ctx.beginPath();
  ctx.moveTo(c.x, c.y - faces.hh * 0.66);
  ctx.lineTo(c.x + faces.hw * 0.66, c.y);
  ctx.lineTo(c.x, c.y + faces.hh * 0.66);
  ctx.lineTo(c.x - faces.hw * 0.66, c.y);
  ctx.closePath();
  ctx.stroke();
  // Four bolt heads.
  ctx.fillStyle = UNDERGROUND.sealCapLit;
  for (const [dx, dy] of [[0, -0.34], [0.34, 0], [0, 0.34], [-0.34, 0]]) {
    ctx.beginPath();
    ctx.arc(c.x + faces.hw * dx, c.y + faces.hh * dy, Math.max(0.8, 0.7 * zoom), 0, Math.PI * 2);
    ctx.fill();
  }
}

// A sign, not a creature. A webbed handprint pressed on the inside of a pipe wall, or a ring of cut
// glyphs about a fouled pump head. Both drawn pale and chalky over the main, as marks on a map.
function drawDeepMark(ctx, faces, zoom, kind, now) {
  const c = faces.center;
  ctx.strokeStyle = UNDERGROUND.mark;
  ctx.fillStyle = UNDERGROUND.mark;
  ctx.lineWidth = Math.max(1, 0.6 * zoom);
  if (kind === 'glyph') {
    // A ring of short cut strokes, canted wrong, about the works.
    const r = Math.max(3, 5.5 * zoom);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.4;
      ctx.beginPath();
      ctx.moveTo(c.x + Math.cos(a) * r, c.y + Math.sin(a) * r * 0.5);
      ctx.lineTo(c.x + Math.cos(a) * r * 1.35, c.y + Math.sin(a) * r * 0.5 * 1.35);
      ctx.stroke();
    }
    return;
  }
  // A handprint: a small palm with three splayed, webbed fingers. Two or three pixels of intent.
  const s = Math.max(1.6, 2.2 * zoom);
  const drift = 0.4 * Math.sin(now / 2200);
  const px = c.x + s * 0.6;
  const py = c.y - s * 0.2 + drift;
  ctx.beginPath();
  if (ctx.ellipse) ctx.ellipse(px, py, s * 0.7, s * 0.5, 0, 0, Math.PI * 2);
  else ctx.arc(px, py, s * 0.6, 0, Math.PI * 2);
  ctx.fill();
  for (const a of [-0.9, -0.2, 0.5]) {
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(px + Math.cos(a) * s * 1.5, py + Math.sin(a) * s * 1.1 - s * 0.5);
    ctx.stroke();
  }
}

// The glimpse: a pale shape crossing a flooded void, seen only where the deep is crowded. It is a
// silhouette and a pair of eyes, and it never resolves into anything more than that.
function drawGlimpse(ctx, faces, zoom, now) {
  const c = faces.center;
  const t = (now / 3600) % 1;
  const swim = Math.sin(t * Math.PI * 2);
  const x = c.x + swim * faces.hw * 0.34;
  const y = c.y + Math.cos(t * Math.PI * 2) * faces.hh * 0.2;
  ctx.save();
  ctx.globalAlpha = 0.42 + 0.18 * Math.sin(now / 1700);
  ctx.fillStyle = UNDERGROUND.glimpse;
  ctx.beginPath();
  if (ctx.ellipse) ctx.ellipse(x, y, 3.4 * zoom, 1.5 * zoom, swim * 0.3, 0, Math.PI * 2);
  else ctx.arc(x, y, 2.4 * zoom, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
  // Two pale eyes, which is the only part of it the player will remember.
  ctx.fillStyle = '#d6e2d2';
  const ex = x + (swim >= 0 ? 1.8 : -1.8) * zoom;
  ctx.beginPath(); ctx.arc(ex, y - 0.4 * zoom, Math.max(0.6, 0.55 * zoom), 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(ex, y + 0.9 * zoom, Math.max(0.6, 0.55 * zoom), 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

// A water main: a trench cut from the tile centre out to each connected neighbour, with the pipe
// laid in it. The pipe's colour is its pressure (cold blue pressurized, dull grey-blue low, near
// black dry), which is the whole readout of the underground view. An unconnected stub still shows
// a short length, so a freshly laid tile is never a bare patch.
//
// M-b mottles the quality OVER that: flecks for suspect water, a sick-green sheath for tainted, and
// black-green with bubbles for infested. Pressure and quality are two different questions and the
// player must be able to answer both from one look at the pipe.
// Two arms running straight through (SE-NW or SW-NE) rather than turning a corner.
function i2StraightRun(bits) {
  const has = (b) => bits.includes(b);
  return (has(DIR.SE.bit) && has(DIR.NW.bit)) || (has(DIR.SW.bit) && has(DIR.NE.bit));
}

function drawPipe(ctx, faces, mask, zoom, pressure, taint = 0) {
  const body = pressure === PRESSURE.GOOD ? UNDERGROUND.pipeGood
    : pressure === PRESSURE.LOW ? UNDERGROUND.pipeLow : UNDERGROUND.pipeDry;
  const lit = pressure === PRESSURE.GOOD ? UNDERGROUND.pipeGoodLit
    : pressure === PRESSURE.LOW ? UNDERGROUND.pipeLowLit : UNDERGROUND.pipeDryLit;
  const c = faces.center;
  const mids = edgeMidpoints(faces);
  let bits = [DIR.SE.bit, DIR.SW.bit, DIR.NW.bit, DIR.NE.bit].filter((b) => mask & b);
  if (bits.length === 0) bits = [DIR.SE.bit, DIR.NW.bit];
  const w = 3.2 * zoom; // the pipe's half-width: a main, not a road
  const trench = w + Math.max(1, 1.6 * zoom);

  // The trench first, so the pipe seats in cut earth.
  fillDiamond(ctx, c, trench * 1.3, trench * 0.65, UNDERGROUND.trench);
  for (const b of bits) thickLine(ctx, c, mids[b], trench, UNDERGROUND.trench);
  // The pipe body.
  fillDiamond(ctx, c, w * 1.3, w * 0.65, body);
  for (const b of bits) thickLine(ctx, c, mids[b], w, body);
  // A lit crown along each arm reads the pressure at a glance, even at low zoom.
  for (const b of bits) thickLine(ctx, c, mids[b], Math.max(1, 1 * zoom), lit);
  // A junction collar wherever three or more arms meet.
  if (bits.length >= 3) fillDiamond(ctx, c, w * 0.8, w * 0.4, lit);
  // A brass bend-collar wherever the main turns a corner: the punctuation a period utility map puts
  // along its runs, and here it marks something real (a fitting the network actually has), so the
  // rhythm never lies about the pipework beneath it.
  if (bits.length === 2 && !i2StraightRun(bits)) {
    const r = Math.max(1.6, 2.6 * zoom);
    ctx.fillStyle = UNDERGROUND.joint;
    ctx.beginPath();
    ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = UNDERGROUND.jointCore;
    ctx.beginPath();
    ctx.arc(c.x, c.y, Math.max(0.7, r * 0.4), 0, Math.PI * 2);
    ctx.fill();
  }

  // What is IN the water, mottled over the pipe.
  const paint = taintPaint(taint);
  if (!paint) return;
  if (paint.kind === QUALITY.SUSPECT) {
    // Flecks: a scatter of short marks along each arm, deterministic in the tile's own geometry.
    ctx.fillStyle = paint.lit;
    for (const b of bits) {
      const m = mids[b];
      for (let k = 1; k <= 3; k++) {
        const f = k / 4;
        const fx = c.x + (m.x - c.x) * f;
        const fy = c.y + (m.y - c.y) * f;
        const s = Math.max(1, 0.9 * zoom);
        ctx.fillRect(fx - s / 2, fy - s / 2, s, s);
      }
    }
    return;
  }
  // Tainted and infested: the whole run takes the colour, so a foul branch is unmistakable from any
  // zoom. The infested case is darker and carries bubbles.
  const sheath = Math.max(1, w * 0.62);
  for (const b of bits) thickLine(ctx, c, mids[b], sheath, paint.body);
  fillDiamond(ctx, c, w * 0.9, w * 0.45, paint.body);
  if (paint.kind !== QUALITY.INFESTED) return;
  ctx.fillStyle = paint.lit;
  for (const b of bits) {
    const m = mids[b];
    for (let k = 1; k <= 2; k++) {
      const f = k / 3;
      const bx = c.x + (m.x - c.x) * f;
      const by = c.y + (m.y - c.y) * f;
      ctx.beginPath();
      ctx.arc(bx, by, Math.max(0.8, 0.8 * zoom), 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

// A pump, well, reservoir, or filter house seen from below: a bright head over the main, so the
// player can find their works instantly. A works with no pressure reads dim (an idle pump wanting
// power); a works whose intake has gone foul takes the quality's colour, because the intake is where
// the player must look first.
function drawWaterSource(ctx, faces, structure, zoom, pressure, taint = 0) {
  const live = pressure === PRESSURE.GOOD || pressure === PRESSURE.LOW;
  const paint = taintPaint(taint);
  const color = paint ? paint.lit : (live ? UNDERGROUND.source : UNDERGROUND.sourceDim);
  const c = faces.center;
  const r = 5 * zoom;
  // A shaft ring with a cross-brace: the period utility-map mark for a works.
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1.5, 1.6 * zoom);
  ctx.beginPath();
  ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(c.x - r, c.y); ctx.lineTo(c.x + r, c.y);
  ctx.moveTo(c.x, c.y - r); ctx.lineTo(c.x, c.y + r);
  ctx.stroke();
  // A reservoir holds water rather than drawing it: fill the ring to mark the stored head.
  if (structure && structure.kind === 'reservoir') {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(c.x, c.y, Math.max(1, r * 0.45), 0, Math.PI * 2);
    ctx.fill();
  }
  // A filter house makes no water and holds none: it is drawn as the sand beds it is, three bars
  // laid across the shaft ring, so it never reads as another pump head (M-b).
  if (structure && structure.kind === 'filterhouse') {
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(1, 0.9 * zoom);
    for (const k of [-1, 0, 1]) {
      ctx.beginPath();
      ctx.moveTo(c.x - r * 0.6, c.y + k * r * 0.34);
      ctx.lineTo(c.x + r * 0.6, c.y + k * r * 0.34);
      ctx.stroke();
    }
  }
}

// A filled diamond (2:1) centred at c with the given half-extents.
function fillDiamond(ctx, c, hw, hh, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(c.x, c.y - hh);
  ctx.lineTo(c.x + hw, c.y);
  ctx.lineTo(c.x, c.y + hh);
  ctx.lineTo(c.x - hw, c.y);
  ctx.closePath();
  ctx.fill();
}

// A filled rectangle along A->B with the given half-width (a thick line as a quad).
function thickLine(ctx, a, b, halfWidth, color) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const px = (-dy / len) * halfWidth;
  const py = (dx / len) * halfWidth;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(a.x + px, a.y + py);
  ctx.lineTo(b.x + px, b.y + py);
  ctx.lineTo(b.x - px, b.y - py);
  ctx.lineTo(a.x - px, a.y - py);
  ctx.closePath();
  ctx.fill();
}

function fillPoly(ctx, pts, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.closePath();
  ctx.fill();
}

// --- ambient animation (M9): the living world drawn over the map -------------------------------
// Projects the pure ambient entities (src/ambient.js, world coordinates) to the screen and draws
// them: sea shadows and figures at ground level, fog over the town, gulls on top. Cheap period art,
// no gradients required (a flat wash where a gradient is unavailable). Never reads or writes game
// state; it only paints what src/ambient.js already computed.
export function drawAmbient(ctx, ambient, camera) {
  if (!ambient) return;
  const z = camera.zoom;
  const inView = (p, m) => p.x >= -m && p.x <= camera.viewportW + m && p.y >= -m && p.y <= camera.viewportH + m;

  // Shadows gliding under the sea surface: soft dark ellipses, below everything else.
  for (const s of ambient.waterShadows) {
    const p = camera.worldToScreen(s.x, s.y);
    if (!inView(p, 60)) continue;
    ctx.fillStyle = 'rgba(6, 13, 19, 0.18)';
    ambEllipse(ctx, p.x, p.y, Math.max(6, s.rad * z), Math.max(3, s.rad * z * 0.5));
  }

  // A cart trundling its lane: a small weathered body on two dark wheels.
  for (const c of ambient.carts) {
    const p = camera.worldToScreen(c.x, c.y);
    if (!inView(p, 40)) continue;
    drawCart(ctx, p.x, p.y, z);
  }

  // A procession of hooded figures walking up to a shrine.
  for (const pr of ambient.processions) {
    for (const f of pr.figures) {
      const p = camera.worldToScreen(f.x, f.y);
      if (!inView(p, 30)) continue;
      drawFigure(ctx, p.x, p.y, z);
    }
  }

  // Fog banks drifting across the town: broad, soft, cold-grey banks with a diffuse edge.
  for (const f of ambient.fog) {
    const p = camera.worldToScreen(f.x, f.y);
    const w = f.w * z;
    const h = f.h * z;
    if (p.x + w < -40 || p.x - w > camera.viewportW + 40) continue;
    if (typeof ctx.createRadialGradient === 'function') {
      const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, Math.max(w, h));
      g.addColorStop(0, `rgba(176, 184, 190, ${f.alpha})`);
      g.addColorStop(0.6, `rgba(170, 178, 186, ${f.alpha * 0.7})`);
      g.addColorStop(1, 'rgba(170, 178, 186, 0)');
      ctx.fillStyle = g;
    } else {
      ctx.fillStyle = `rgba(172, 180, 187, ${f.alpha})`;
    }
    ambEllipse(ctx, p.x, p.y, w, h);
  }

  // Gulls wheeling on top: a small dark V that opens and closes as it flaps.
  for (const g of ambient.gulls) {
    const p = camera.worldToScreen(g.x, g.y);
    if (!inView(p, 20)) continue;
    drawGull(ctx, p.x, p.y, g.wing, z);
  }
}

function ambEllipse(ctx, cx, cy, rx, ry) {
  ctx.beginPath();
  if (typeof ctx.ellipse === 'function') {
    ctx.ellipse(cx, cy, Math.abs(rx), Math.abs(ry), 0, 0, Math.PI * 2);
  } else {
    // Fallback: a circle scaled to the ellipse (older contexts). Keeps the wash even if squat.
    ctx.arc(cx, cy, Math.abs((rx + ry) / 2), 0, Math.PI * 2);
  }
  ctx.fill();
}

function drawGull(ctx, cx, cy, wing, z) {
  // Two short strokes meeting at the body, forming a shallow V; `wing` (0..1) raises the tips.
  const span = Math.max(4, 6 * z);
  const lift = (0.3 + 0.7 * wing) * span * 0.7;
  ctx.strokeStyle = '#2c323a';
  ctx.lineWidth = Math.max(1.2, 1.3 * z);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(cx - span, cy - lift + span * 0.25);
  ctx.lineTo(cx, cy);
  ctx.lineTo(cx + span, cy - lift + span * 0.25);
  ctx.stroke();
}

function drawCart(ctx, cx, cy, z) {
  const w = Math.max(5, 8 * z);
  const h = Math.max(3, 5 * z);
  // The bed.
  ctx.fillStyle = '#5a4632';
  ctx.fillRect(cx - w / 2, cy - h, w, h * 0.7);
  // A darker top rail.
  ctx.fillStyle = '#413020';
  ctx.fillRect(cx - w / 2, cy - h, w, Math.max(1, h * 0.2));
  // Two wheels.
  ctx.fillStyle = '#241a12';
  const wr = Math.max(1.2, h * 0.35);
  ambEllipse(ctx, cx - w * 0.3, cy - wr * 0.4, wr, wr);
  ambEllipse(ctx, cx + w * 0.3, cy - wr * 0.4, wr, wr);
}

function drawFigure(ctx, cx, cy, z) {
  // A small hooded figure: a near-black robe (a narrow triangle) under a round head.
  const h = Math.max(4, 7 * z);
  const w = Math.max(2, 3.2 * z);
  ctx.fillStyle = '#1f242b';
  ctx.beginPath();
  ctx.moveTo(cx, cy - h); // the peak of the hood
  ctx.lineTo(cx - w / 2, cy);
  ctx.lineTo(cx + w / 2, cy);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#2a3038';
  ambEllipse(ctx, cx, cy - h * 0.85, Math.max(1, w * 0.34), Math.max(1, w * 0.34));
}
