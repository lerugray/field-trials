// Lighting as compositing, applied to the creature layer.
//
// The proof of concept re-drew its creatures as generic archetype rigs, because
// a software rasterizer cannot call into a Canvas2D path renderer. Doing that
// here would have thrown away the 70 hand-built species silhouettes (M13) to buy
// the lighting, which is a bad trade and not what the PoC was proving.
//
// So the creature keeps its existing renderer. drawCreature() paints the ALBEDO
// into a small offscreen canvas; this module reads those pixels back and relights
// them: every opaque pixel becomes a 6-step ramp built around its own colour,
// sampled at a lambert term from the scene's light rig and dithered like every
// other surface in the room. The species keeps its shape, its markings and its
// palette; it gains the room's light.
//
// compositeLitPixels() is deliberately pure (it takes an ImageData-shaped
// object) so the relight maths is exercised in node by test/lit-creature.test.js
// rather than only through a screenshot.

import { drawCreature, drawVfx, measureCreature, recenterOffsetY } from './creature.js';
import { litClamp, litFbm, litRampAt, litRampFromRgb, litShade, litHex, litT } from './lit.js';

const ALPHA_SOLID = 128; // at or above this an edge counts as silhouette
const ALPHA_MIN = 8; // below this the pixel is not there at all

// Relight one albedo buffer into the painter.
//
//   img   {width, height, data}  RGBA albedo, premultiplied by nothing
//   ox,oy where the buffer's top-left sits in painter space
//   o     {cx, cy, rx, ry, lights, amb, tex, rim, rimAmt, outline}
//
// Three passes, the same three the PoC's paintMask() ran: shade, ink the
// silhouette edge, then rim-light the edge that faces the dominant source.
export function compositeLitPixels(p, img, ox, oy, o) {
  const { width: w, height: h, data } = img;
  const lights = o.lights || [];
  const amb = o.amb === undefined ? 0.20 : o.amb;
  const tex = o.tex || litFbm(o.seed || 7, 3);
  const cx = o.cx, cy = o.cy, rx = Math.max(1, o.rx), ry = Math.max(1, o.ry);

  // 1. shade
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const k = (j * w + i) * 4;
      const a = data[k + 3];
      if (a < ALPHA_MIN) continue;
      const x = ox + i, y = oy + j;
      let t = litT(x, y, cx, cy, rx, ry, lights, amb);
      t += (tex(x * 0.30, y * 0.30) - 0.5) * 0.14;
      const ramp = litRampFromRgb(data[k], data[k + 1], data[k + 2]);
      p.px(x, y, litRampAt(ramp, litClamp(t, 0, 1), x, y), a / 255);
    }
  }

  // 2. ink outline on every silhouette edge, tinted from the pixel it borders so
  // a pale species does not get the same black line as a dark one
  const solid = (i, j) => {
    if (i < 0 || j < 0 || i >= w || j >= h) return false;
    return data[(j * w + i) * 4 + 3] >= ALPHA_SOLID;
  };
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      if (!solid(i, j)) continue;
      if (solid(i - 1, j) && solid(i + 1, j) && solid(i, j - 1) && solid(i, j + 1)) continue;
      const k = (j * w + i) * 4;
      const col = o.outline || litShade(litHex(data[k], data[k + 1], data[k + 2]), -0.72);
      p.px(ox + i, oy + j, col, 0.95);
    }
  }

  // 3. rim light from the dominant source
  const L0 = o.rim || lights[0];
  const rimAmt = o.rimAmt === undefined ? 0.55 : o.rimAmt;
  if (L0 && rimAmt > 0) {
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++) {
        if (!solid(i, j)) continue;
        const x = ox + i, y = oy + j;
        const ddx = L0.x - x, ddy = L0.y - y;
        const dd = Math.sqrt(ddx * ddx + ddy * ddy) + 0.001;
        const sx = Math.round(ddx / dd), sy = Math.round(ddy / dd);
        if (sx === 0 && sy === 0) continue;
        if (solid(i + sx, j + sy)) continue;
        const att = L0.range ? Math.pow(litClamp(1 - dd / L0.range, 0, 1), 1.2) : 1;
        p.add(x, y, L0.col || '#F0C060', rimAmt * att);
      }
    }
  }
  return p;
}

// Composite a buffer ADDITIVELY. Affinity VFX are the one creature-layer thing
// that is literally light, so it is neither shaded nor outlined — it is added,
// the same way the lamp and the spotlights are.
export function compositeAdditive(p, img, ox, oy, amt = 1) {
  const { width: w, height: h, data } = img;
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const k = (j * w + i) * 4;
      const a = data[k + 3];
      if (a < ALPHA_MIN) continue;
      const v = (a / 255) * amt;
      p.add(ox + i, oy + j, litHex(data[k], data[k + 1], data[k + 2]), v);
    }
  }
  return p;
}

// ---- the offscreen albedo buffer -------------------------------------------

let scratch = null;
let scratchCtx = null;

function ensureScratch(w, h) {
  if (typeof document === 'undefined' && typeof OffscreenCanvas === 'undefined') return null;
  if (!scratch) {
    scratch = typeof document !== 'undefined'
      ? document.createElement('canvas')
      : new OffscreenCanvas(w, h);
    scratchCtx = scratch.getContext('2d', { willReadFrequently: true });
  }
  if (scratch.width < w || scratch.height < h) {
    scratch.width = Math.max(scratch.width, w);
    scratch.height = Math.max(scratch.height, h);
  }
  return scratchCtx;
}

// Cached per rig shape: how big a buffer this creature needs at scale 1, and
// where its body centre sits inside it. measureCreature() is memo-worthy —
// it re-runs the whole draw through a bounds recorder.
const boxMemo = new Map();
function boxFor(creature) {
  const sp = creature.species || {};
  const key = `${sp.id}|${sp.archetype}`;
  let b = boxMemo.get(key);
  if (!b) { b = measureCreature(creature); boxMemo.set(key, b); }
  return b;
}

// The scale that draws this creature at `targetH` tall, clamped so it also fits
// `maxW` wide and never exceeds `maxH`. Sizing off the species' OWN measured box
// is what makes every one of the 70 read at the same apparent size in the room
// (a tall thin plant and a squat blob otherwise land wildly apart), and the maxH
// clamp is the M12 no-clipping guarantee kept on a grounded layout.
export function fitScale(creature, targetH, maxW, maxH, cap = 2) {
  const b = boxFor(creature);
  const bw = Math.max(1, b.maxX - b.minX);
  const bh = Math.max(1, b.maxY - b.minY);
  return Math.min(cap, targetH / bh, maxW / bw, maxH / bh);
}

// Draw `creature` into the painter, lit by `o.lights`.
//   o.x       centre column in painter space
//   o.ground  the floor line the creature stands on
//   o.scale   drawCreature scale
// Returns the body box actually used, or null when there is no canvas to
// rasterize into (node, or a stub context) — callers treat that as "skip".
export function drawLitCreature(p, creature, t, o) {
  if (!creature) return null;
  const scale = o.scale || 1;
  const b = boxFor(creature);
  // Generous padding: the measured box is the NEUTRAL pose, but idle bob,
  // reaction hops, pose lunges and the reaction icons (hearts, "!", puff) all
  // draw outside it. Too little pad here silently clips the care feedback.
  const pad = Math.ceil(46 * scale) + 10;
  const bw = Math.ceil((b.maxX - b.minX) * scale) + pad * 2;
  const bh = Math.ceil((b.maxY - b.minY) * scale) + pad * 2;
  const ctx = ensureScratch(bw, bh);
  if (!ctx || typeof ctx.getImageData !== 'function') return null;

  // where the body centre lands inside the buffer
  const bcx = pad - b.minX * scale;
  const bcy = pad - b.minY * scale;

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, bw, bh);
  drawCreature(ctx, creature, t, {
    cx: bcx,
    cy: bcy,
    scale,
    mood: o.mood,
    reaction: o.reaction,
    facing: o.facing,
    pose: o.pose,
    poseT: o.poseT,
  });

  let img;
  try {
    img = ctx.getImageData(0, 0, bw, bh);
  } catch {
    return null; // tainted or unavailable — leave the frame as it was
  }

  // the buffer's top-left in painter space: the creature stands with the bottom
  // of its measured box on the ground line
  const ox = Math.round(o.x - bcx);
  const oy = Math.round(o.ground - b.maxY * scale - pad);

  // ground contact first, so the body sits over its own shadow
  const footW = Math.max(4, Math.round((b.maxX - b.minX) * scale * 0.42));
  const footH = Math.max(2, Math.round(footW * 0.24));
  if (o.shadow !== false) {
    p.shadowPool(Math.round(o.x), Math.round(o.ground), footW, footH,
      o.shadowAmt === undefined ? 0.50 : o.shadowAmt, o.shadowCol);
  }
  if (o.cast) {
    p.castShadow(Math.round(o.x - footW * 0.7), Math.round(o.x + footW * 0.7), Math.round(o.ground),
      o.cast.len, o.cast.drop, o.cast.amt, o.cast.col);
  }

  compositeLitPixels(p, img, ox, oy, {
    cx: o.x,
    cy: oy + bcy - (b.maxY + b.minY) * 0.5 * scale,
    rx: ((b.maxX - b.minX) * scale) / 2,
    ry: ((b.maxY - b.minY) * scale) / 2,
    lights: o.lights,
    amb: o.amb,
    seed: o.seed || (creature.seed ?? 7),
    rim: o.rim,
    rimAmt: o.rimAmt,
  });
  return { ox, oy, w: bw, h: bh, scale };
}

// The affinity VFX burst, composited as light. Keeps drawVfx() as the single
// source of truth for what each element looks like — the burst still carries
// the family and hue that tell the player which element landed.
export function drawLitVfx(p, family, x, y, prog, o = {}) {
  const scale = o.scale || 1;
  const r = Math.ceil(60 * scale) + 12;
  const size = r * 2;
  const ctx = ensureScratch(size, size);
  if (!ctx || typeof ctx.getImageData !== 'function') return null;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, size, size);
  drawVfx(ctx, family, r, r, prog, { scale, hue: o.hue });
  let img;
  try { img = ctx.getImageData(0, 0, size, size); } catch { return null; }
  compositeAdditive(p, img, Math.round(x - r), Math.round(y - r), o.amt === undefined ? 0.9 : o.amt);
  return true;
}

// A creature's crowd descriptor — the shape and eyeshine the tournament stands
// use when the player's Memory Meadow retirees fill them (LEAN B).
export function crowdDescriptor(creature) {
  const sp = (creature && creature.species) || {};
  const hue = sp.hue ?? 40;
  return {
    archetype: sp.archetype || 'blob',
    eyeCol: litShade(hueToHex(hue), 0.42),
    name: sp.name || '',
  };
}

function hueToHex(h) {
  // a bright, low-saturation read of the species hue — the crowd's eyes are
  // catchlights, not portraits
  const c = 0.42, x = c * (1 - Math.abs(((((h % 360) + 360) % 360) / 60) % 2 - 1));
  const m = 0.62;
  const hh = (((h % 360) + 360) % 360);
  let r, g, b;
  if (hh < 60) { r = c; g = x; b = 0; }
  else if (hh < 120) { r = x; g = c; b = 0; }
  else if (hh < 180) { r = 0; g = c; b = x; }
  else if (hh < 240) { r = 0; g = x; b = c; }
  else if (hh < 300) { r = x; g = 0; b = c; }
  else { r = c; g = 0; b = x; }
  return litHex((r + m) * 255, (g + m) * 255, (b + m) * 255);
}

void recenterOffsetY;
