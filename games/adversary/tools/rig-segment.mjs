// rig-segment.mjs — turn one rig frame into per-body-part pixel masks + geometry.
//
// This is the single source of segmentation truth: the extractor (geometry JSON) and the
// compositor (painting) both call it, so they can never drift apart on what counts as a leg.
//
// How it classifies, in order:
//   1. Exact identifier-colour hit against the derived map (tools/rig-color-map.json).
//      This covers 100% of the pixels on 9 of the 11 sheets we paint.
//   2. Chromaticity fallback for the two sheets that do not: the dash sheet's motion trail
//      is dimmed copies of the identifier colours (#bd4a4a is the back leg's red at lower
//      luma), and RGB distance is the wrong metric for that — #3d525c is 163 units from the
//      head cyan in RGB but 9 degrees from it in hue. So match on hue, then flag the pixel
//      TRAIL (darker than its identifier) or FLASH (brighter).
//   3. Near-grey pixels with no hue to match are FX (white slash cores, flash pixels).
//
// Katana blade vs slash arc is separated by TONE USAGE measured across both katana sheets,
// plus adjacency for the one tone the two genuinely share — see BLADE_TONES below. The
// blade/arc classes exist only on sheets that actually carry a weapon.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { TOOLS_DIR } from './rig-manifest.mjs';

const MAP = JSON.parse(readFileSync(join(TOOLS_DIR, 'rig-color-map.json'), 'utf8'));

export const COLOR_TO_PART = MAP.colors;
export const RIG_COLORS = new Set(Object.keys(MAP.colors));

/** Classes the compositor knows how to paint. */
export const PART_CLASSES = [
  'backLeg', 'backArm', 'torso', 'frontLeg', 'frontArm', 'head', 'blade', 'arc', 'fx',
];

// Blade vs slash arc, resolved by MEASUREMENT rather than by colour naming or geometry.
//
// Counting each pink tone frame-by-frame across both katana sheets shows the pack uses:
//   #a3608f, #bf6fa7  — present in every frame that shows a blade, absent otherwise, and
//                       scaling with blade length. Blade-only.
//   #f092d4, #f7a3e0  — present ONLY in the three frames per sheet that have a big sweep.
//                       Arc-only.
//   #d77bba           — genuinely shared: the blade's body tone AND the arc's mid tone.
//                       (katana_combo f6-f8 is a bare vertical blade of 12+4+29 px across
//                       exactly these three tones and no arc at all.)
//
// So the shared tone is resolved by adjacency: a #d77bba pixel joins the blade if it can
// reach a blade-only pixel through other #d77bba pixels, otherwise it is arc. This is why
// the earlier connected-component-plus-thinness approach was the wrong tool — it was trying
// to recover from geometry a distinction the palette already encodes.
const BLADE_TONES = new Set(['#a3608f', '#bf6fa7']);
const ARC_TONES = new Set(['#f092d4', '#f7a3e0']);
const SHARED_TONES = new Set(['#d77bba']);
const PINK_POOL = new Set([...BLADE_TONES, ...ARC_TONES, ...SHARED_TONES]);

// --------------------------------------------------------------- tone ranks
//
// Each rig part is drawn in 2-4 identifier tones — base plus shade, sometimes a mid or a
// highlight. That is the original animator's SHADING, encoded in the identifier palette, and
// it is the most valuable thing in the pack after the timing. Ranking a part's tones by luma
// gives a normalised 0..1 position that the compositor maps onto its own ramp, so the paint
// pass inherits 315 frames of professional shading decisions instead of inventing light from
// scratch on each frame.
//
// Ranks are computed GLOBALLY per part, not per frame, so a tone means the same thing in
// every frame of every sheet — a limb cannot silently change value between frames.

function luma(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export const TONE_RANK = (() => {
  const byPart = new Map();
  for (const [hex, part] of Object.entries(MAP.colors)) {
    const cls = part === 'weapon' ? 'blade' : part;
    if (!byPart.has(cls)) byPart.set(cls, []);
    byPart.get(cls).push(hex);
  }
  // Pool the pink tones into their measured classes before ranking.
  byPart.set('blade', [...BLADE_TONES, ...SHARED_TONES]);
  byPart.set('arc', [...ARC_TONES, ...SHARED_TONES]);

  const out = {};
  for (const [part, hexes] of byPart) {
    const sorted = [...new Set(hexes)].sort((a, b) => luma(a) - luma(b));
    out[part] = {};
    sorted.forEach((hex, i) => {
      out[part][hex] = sorted.length === 1 ? 0.5 : i / (sorted.length - 1);
    });
  }
  return out;
})();

function rgbToHsl(r, g, b) {
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return [0, 0, l];
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6;
  else if (max === gn) h = ((bn - rn) / d + 2) / 6;
  else h = ((rn - gn) / d + 4) / 6;
  return [h * 360, s, l];
}

function hueDistance(a, b) {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

// Precompute the HSL of every identifier colour once, so the fallback is a cheap scan.
const IDENTIFIERS = Object.entries(MAP.colors).map(([hex, part]) => {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const [h, s, l] = rgbToHsl(r, g, b);
  return { hex, part, h, s, l };
}).filter((c) => c.s > 0.15); // grey identifiers carry no hue to match against

/**
 * Resolve a non-identifier colour to a part by hue, choosing only among `candidates`.
 *
 * The candidate set matters, and getting it wrong is silent. Passing every identifier makes
 * the dash sheet's dim purple trail (#935c89) hue-match the katana's mauve (#a3608f) and
 * report 226 "blade" pixels on a sheet that has no weapon in it at all. A motion trail is by
 * definition a dimmed copy of a colour already in the frame, so the candidates are the exact
 * identifier tones the frame actually contains — nothing else.
 *
 * @returns {{part: string, trail: boolean, flash: boolean}}
 */
function resolveByHue(r, g, b, candidates) {
  const [h, s, l] = rgbToHsl(r, g, b);
  if (s < 0.12) {
    // No hue to match: a white/grey pixel. These are slash cores and flash pixels.
    return { part: 'fx', trail: false, flash: l > 0.6 };
  }
  let best = null;
  let bestD = Infinity;
  for (const c of candidates) {
    const d = hueDistance(h, c.h) + Math.abs(s - c.s) * 40;
    if (d < bestD) { bestD = d; best = c; }
  }
  if (best && bestD < 45) {
    return { part: best.part, trail: l < best.l - 0.04, flash: l > best.l + 0.08 };
  }
  return { part: 'unclassified', trail: false, flash: false };
}

/** Exact identifier lookup, or null. */
export function classifyColor(r, g, b) {
  const hex = `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
  const part = MAP.colors[hex];
  return part ? { part, hex } : null;
}

const IDENTIFIER_BY_HEX = new Map(IDENTIFIERS.map((c) => [c.hex, c]));

/**
 * Resolve the map's 'weapon' class for one sheet.
 *
 * A weapon tone can only BE a weapon on a sheet that contains a weapon. #a3608f is the katana
 * blade on the katana sheets and, on the flattened dash sheet, 172 pixels of speed streak —
 * the pack reuses the tone, and the layer audit could not see the conflict because dash's
 * source was flattened to one layer before shipping and so never voted. Left unscoped this
 * reported 226 blade pixels on a sheet whose animation has no blade in it. On a non-katana
 * sheet the tone is trail FX.
 */
function weaponClass(part, pinkPool) {
  if (part !== 'weapon') return part;
  return pinkPool ? 'blade' : 'fx';
}

/**
 * 8-connected component labelling over a boolean mask. Returns arrays of pixel indices.
 *
 * 8-connected, not 4: a 1px-wide diagonal blade touches its neighbours only at the corners,
 * so 4-connectivity shatters it into single pixels. That is exactly what happened on the
 * first run — every katana blade came back as four 1-2px "components" and the blade detector
 * never fired once across 19 frames.
 */
function components(mask, w, h) {
  const seen = new Uint8Array(mask.length);
  const out = [];
  const stack = [];
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i] || seen[i]) continue;
    const comp = [];
    stack.push(i);
    seen[i] = 1;
    while (stack.length) {
      const p = stack.pop();
      comp.push(p);
      const x = p % w;
      const y = (p - x) / w;
      const push = (nx, ny) => {
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) return;
        const n = ny * w + nx;
        if (mask[n] && !seen[n]) { seen[n] = 1; stack.push(n); }
      };
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (dx || dy) push(x + dx, y + dy);
    }
    out.push(comp);
  }
  return out;
}

/**
 * Principal-axis geometry of a pixel set.
 * `angleDeg` is measured in screen space (x right, y DOWN), so a positive angle points
 * down-and-right. `elongation` is the ratio of principal to secondary spread; `thickness`
 * is the mean width perpendicular to the axis.
 */
export function pixelGeometry(indices, w) {
  const n = indices.length;
  if (n === 0) return null;
  let sx = 0, sy = 0;
  for (const p of indices) { sx += p % w; sy += (p - (p % w)) / w; }
  const cx = sx / n;
  const cy = sy / n;

  let xx = 0, yy = 0, xy = 0;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of indices) {
    const x = p % w;
    const y = (p - x) / w;
    const dx = x - cx;
    const dy = y - cy;
    xx += dx * dx; yy += dy * dy; xy += dx * dy;
    if (x < x0) x0 = x; if (x > x1) x1 = x;
    if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  xx /= n; yy /= n; xy /= n;

  // Eigen-decomposition of the 2x2 covariance matrix.
  const tr = xx + yy;
  const det = xx * yy - xy * xy;
  const disc = Math.max(0, (tr * tr) / 4 - det);
  const l1 = tr / 2 + Math.sqrt(disc);
  const l2 = tr / 2 - Math.sqrt(disc);
  let ax, ay;
  if (Math.abs(xy) > 1e-9) { ax = l1 - yy; ay = xy; } else if (xx >= yy) { ax = 1; ay = 0; } else { ax = 0; ay = 1; }
  const alen = Math.hypot(ax, ay) || 1;
  ax /= alen; ay /= alen;

  const major = Math.sqrt(Math.max(l1, 0)) * 2;
  const minor = Math.sqrt(Math.max(l2, 0)) * 2;

  return {
    count: n,
    bbox: { x0, y0, x1, y1, w: x1 - x0 + 1, h: y1 - y0 + 1 },
    centroid: { x: +cx.toFixed(2), y: +cy.toFixed(2) },
    axis: { x: +ax.toFixed(4), y: +ay.toFixed(4) },
    angleDeg: +((Math.atan2(ay, ax) * 180) / Math.PI).toFixed(1),
    major: +major.toFixed(2),
    minor: +minor.toFixed(2),
    elongation: +(minor > 0.001 ? major / minor : 99).toFixed(2),
    thickness: +(n / Math.max(1, major)).toFixed(2),
  };
}

/**
 * Segment one frame image into part masks.
 *
 * @param frame {width,height,data} RGBA, already cropped to one cell and already mirrored
 *              to the canonical facing.
 * @param opts.pinkPool  split the pink family into blade/arc geometrically (katana sheets)
 * @param opts.flash     treat every opaque pixel as one flash silhouette (hit-flash frames)
 * @returns { masks: {part: Uint8Array}, opaque: Uint8Array, stats }
 */
export function segmentFrame(frame, { pinkPool = false, flash = false } = {}) {
  const { width: w, height: h, data } = frame;
  const n = w * h;
  const opaque = new Uint8Array(n);
  const masks = {};
  const trail = new Uint8Array(n);
  const tone = new Float32Array(n).fill(0.5);
  for (const p of PART_CLASSES) masks[p] = new Uint8Array(n);
  masks.flash = new Uint8Array(n);
  masks.unclassified = new Uint8Array(n);

  const hexOf = new Array(n);
  const pinkShared = new Uint8Array(n);
  const leftover = [];
  const present = new Map(); // hex -> identifier record, for the hue fallback's candidate set
  let unclassifiedCount = 0;
  let opaqueCount = 0;

  // ---- pass 1: exact identifier hits only.
  for (let i = 0; i < n; i++) {
    if (data[i * 4 + 3] < 128) continue;
    opaque[i] = 1;
    opaqueCount++;
    if (flash) { masks.flash[i] = 1; continue; }

    const r = data[i * 4];
    const g = data[i * 4 + 1];
    const b = data[i * 4 + 2];
    const hex = `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
    hexOf[i] = hex;

    if (pinkPool && PINK_POOL.has(hex)) {
      if (BLADE_TONES.has(hex)) { masks.blade[i] = 1; tone[i] = TONE_RANK.blade[hex]; }
      else if (ARC_TONES.has(hex)) { masks.arc[i] = 1; tone[i] = TONE_RANK.arc[hex]; }
      else pinkShared[i] = 1; // resolved by adjacency below
      continue;
    }

    const c = classifyColor(r, g, b);
    if (!c) { leftover.push(i); continue; }
    const cls = weaponClass(c.part, pinkPool);
    masks[cls][i] = 1;
    if (cls === 'fx' && c.part === 'weapon') { trail[i] = 1; tone[i] = 0; }
    else {
      const ranks = TONE_RANK[cls];
      if (ranks && ranks[hex] !== undefined) tone[i] = ranks[hex];
    }
    const ident = IDENTIFIER_BY_HEX.get(hex);
    if (ident) present.set(hex, ident);
  }

  // ---- pass 2: trail / flash tints, resolved only against tones present in this frame.
  const candidates = [...present.values()];
  let trailCount = 0;
  for (const i of leftover) {
    const c = resolveByHue(data[i * 4], data[i * 4 + 1], data[i * 4 + 2], candidates);
    if (c.part === 'unclassified') { masks.unclassified[i] = 1; unclassifiedCount++; continue; }
    const cls = weaponClass(c.part, pinkPool);
    masks[cls][i] = 1;
    if (c.trail || cls === 'fx') { trail[i] = 1; trailCount++; tone[i] = 0; } else tone[i] = c.flash ? 1 : 0.5;
  }

  // Resolve the shared pink tone: grow from blade-only pixels through shared pixels. Anything
  // the blade cannot reach belongs to a slash arc.
  let sharedToBlade = 0;
  let sharedToArc = 0;
  if (pinkPool) {
    const queue = [];
    for (let i = 0; i < n; i++) if (masks.blade[i]) queue.push(i);
    while (queue.length) {
      const p = queue.pop();
      const x = p % w;
      const y = (p - x) / w;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const q = ny * w + nx;
          if (!pinkShared[q]) continue;
          pinkShared[q] = 0;
          masks.blade[q] = 1;
          tone[q] = TONE_RANK.blade[hexOf[q]] ?? 0.5;
          sharedToBlade++;
          queue.push(q);
        }
      }
    }
    for (let i = 0; i < n; i++) {
      if (!pinkShared[i]) continue;
      masks.arc[i] = 1;
      tone[i] = TONE_RANK.arc[hexOf[i]] ?? 0.5;
      sharedToArc++;
    }
  }

  // Reported for the record, not used for classification any more.
  const bladeGeo = pixelGeometry(indicesOf(masks.blade), w);
  const arcGeo = pixelGeometry(indicesOf(masks.arc), w);

  return {
    masks,
    opaque,
    trail,
    tone,
    stats: {
      opaqueCount,
      unclassifiedCount,
      trailCount,
      sharedToBlade,
      sharedToArc,
      bladePx: bladeGeo ? bladeGeo.count : 0,
      arcPx: arcGeo ? arcGeo.count : 0,
      bladeElongation: bladeGeo ? bladeGeo.elongation : null,
    },
  };
}

function indicesOf(mask) {
  const out = [];
  for (let i = 0; i < mask.length; i++) if (mask[i]) out.push(i);
  return out;
}

/**
 * Geometry for every non-empty mask in a segmentation.
 *
 * MOTION-TRAIL PIXELS ARE EXCLUDED. The dash sheet's speed streaks classify into the limb they
 * are a dimmed copy OF, so a head trail lands in the head mask — and counting those streaks
 * inflated the head's bounding box and dragged its centroid sideways until every real head
 * pixel fell into a narrow band of the local frame. The visible symptom was subtle and easy to
 * miss: on five of nine dash frames the hero's head painted as a bare skin-coloured disc with
 * no hair, no headband and no eye, because every feature zone tested false. Features must be
 * placed against the limb, not against the limb plus its ghost.
 */
export function frameGeometry(seg, w) {
  const out = {};
  for (const [part, mask] of Object.entries(seg.masks)) {
    const solid = [];
    const all = [];
    for (let i = 0; i < mask.length; i++) {
      if (!mask[i]) continue;
      all.push(i);
      if (!seg.trail[i]) solid.push(i);
    }
    if (!all.length) continue;
    // Fall back to all pixels if a part is nothing BUT trail, so it still gets painted.
    out[part] = pixelGeometry(solid.length ? solid : all, w);
  }
  return out;
}

/** Lowest opaque row — the feet anchor. Integration must anchor by feet, not canvas centre. */
export function contentBox(opaque, w, h, masks = null) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i < opaque.length; i++) {
    if (!opaque[i]) continue;
    const x = i % w;
    const y = (i - x) / w;
    if (x < x0) x0 = x; if (x > x1) x1 = x;
    if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  if (x1 < 0) return null;
  // The runtime root is the feet, not the canvas centre. Prefer the lowest leg pixels so a
  // grounded katana or FX pixel can never drag the player root sideways. Tumbling/airborne
  // frames still get a stable authored root for proof placement and transition continuity.
  const legPixels = [];
  for (const part of ['backLeg', 'frontLeg']) {
    const mask = masks?.[part];
    if (!mask) continue;
    for (let i = 0; i < mask.length; i++) if (mask[i]) legPixels.push(i);
  }
  const rootPixels = legPixels.length ? legPixels : Array.from(opaque.keys()).filter((i) => opaque[i]);
  const feetY = rootPixels.reduce((lowest, i) => Math.max(lowest, Math.floor(i / w)), -Infinity);
  const feetXs = rootPixels.filter((i) => Math.floor(i / w) === feetY).map((i) => i % w);
  const feetX = feetXs.reduce((sum, x) => sum + x, 0) / feetXs.length;
  return {
    x0, y0, x1, y1, w: x1 - x0 + 1, h: y1 - y0 + 1,
    feetX: +feetX.toFixed(2), feetY,
  };
}
