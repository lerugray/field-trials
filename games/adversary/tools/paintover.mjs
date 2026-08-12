// paintover.mjs — stamp the hero's authored parts onto every rig frame.
//
//   node tools/paintover.mjs                 # all variants, all sheets
//   node tools/paintover.mjs --variant hooded --sheet idle
//
// Output: tools/out/<variant>/<sheet>.png — repainted sheets at the rig's own frame layout,
// so the timing is preserved exactly.
//
// PIPELINE ORDER (each pass depends on the previous one being finished):
//   1. assign      — every part pixel gets a RAMP plus an integer index into it, from the rig's
//                    tone rank, with far-side limbs shifted one step darker. Features (eye,
//                    visor slit, headband, belt) are assigned a fixed colour and marked locked.
//   2. shade       — top-lit rim: an unlocked pixel with nothing above it moves one step UP ITS
//                    OWN RAMP. This is the whole reason step 1 keeps the ramp instead of a
//                    colour. The first version of this pass searched the palette for "the next
//                    brightest similar colour" and blew every boot and helm out to #feffff and
//                    speckled rose across the arms, because a 4-step ink ramp's neighbour in
//                    palette space is not its neighbour in ramp space.
//   3. resolve     — ramp+index -> hex.
//   4. outline     — 1px ink around the BODY silhouette only. Slash arcs are not outlined;
//                    outlining a glow makes it read as a solid object.
//
// WHY PAINT THROUGH THE MASK rather than stamp rotated limb sprites: at this scale a limb is
// three to six pixels across. Nearest-neighbour rotation of a 4px-wide forearm does not
// produce a rotated forearm, it produces gravel — and the rig frame already contains the
// correct silhouette for every pose, drawn by hand. Painting inside the mask keeps all 89
// hand-authored silhouettes intact and spends the effort on material and feature instead.
// The head is the one part with a real drawn feature set, and it is clipped to its mask so a
// tumble frame that shows a sliver of skull gets a sliver, never an overdrawn face.

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { makeImage, setPx, getPx, encodePNG, parseHex, blit, colorHistogram } from './png.mjs';
import { SHEETS, sheetById, TOOLS_DIR } from './rig-manifest.mjs';
import { loadSheetFrames, OUT_DIR } from './rig-extract.mjs';
import { OUTLINE, PALETTE, rampAt } from './hero-palette.mjs';
import {
  VARIANTS, variantById, headBasis, limbSpan, headFeature, headPointFeatures,
  BLADE_RAMP, ARC_RAMP,
} from './hero-parts.mjs';

const BODY_PARTS = ['backLeg', 'backArm', 'torso', 'frontLeg', 'frontArm', 'head'];

/** Paint one frame. Returns { image, stamped: {part: pixelCount} }. */
export function paintFrame(frame, variant) {
  const { image: rig, seg, geometry } = frame;
  const w = rig.width;
  const h = rig.height;
  const out = makeImage(w, h);
  const stamped = {};
  const body = new Uint8Array(w * h); // body silhouette, for outline + shading

  // A single body centroid, used to orient limbs proximal->distal.
  const bodyCentroid = geometry.torso
    ? geometry.torso.centroid
    : (geometry.head ? geometry.head.centroid : { x: w / 2, y: h / 2 });
  const basis = headBasis(geometry.head, geometry.torso);

  // ---- flash frames: the rig's built-in hit-flash is a whole-body wash. Painting features
  // into it would fight the effect, so it becomes a two-tone silhouette, which is what a
  // Famicom hit-flash actually is.
  if (frame.flash) {
    let n = 0;
    for (let i = 0; i < w * h; i++) {
      if (!seg.masks.flash[i]) continue;
      setPx(out, i % w, Math.floor(i / w), parseHex(PALETTE.white));
      body[i] = 1;
      n++;
    }
    stamped.flash = n;
    const flashOutline = outlinePass(out, body, w, h);
    return { image: out, stamped, layers: splitLayers(out, seg, w, h, flashOutline, ['flash']) };
  }

  // ---- pass 1: assign a ramp + index (or a locked feature colour) to every part pixel.
  const ramp = new Array(w * h).fill(null);
  const index = new Int8Array(w * h);
  const locked = new Uint8Array(w * h);

  const assign = (i, r, idx, isLocked = false) => {
    ramp[i] = r;
    index[i] = Math.max(0, Math.min(r.length - 1, idx));
    locked[i] = isLocked ? 1 : 0;
    body[i] = 1;
  };

  for (const part of BODY_PARTS) {
    const mask = seg.masks[part];
    const geo = geometry[part];
    if (!geo) continue;
    const mat = variant.materials[part];
    if (!mat) continue;
    let n = 0;
    for (let i = 0; i < w * h; i++) {
      if (!mask[i]) continue;
      const x = i % w;
      const y = (i - x) / w;
      const tone = seg.tone[i];
      const baseIdx = toneIndex(mat.ramp, tone) + (mat.shift || 0);

      // A motion-trail pixel is a ghost of its own material, never a solid limb.
      if (seg.trail[i]) { assign(i, mat.ramp, (mat.shift || 0) - 1, true); n++; continue; }

      let done = false;
      if (part === 'head') {
        const f = headFeature(variant, x, y, geo, basis, tone);
        if (f) { assign(i, [f], 0, true); done = true; }
      } else if (part === 'frontLeg' || part === 'backLeg') {
        const span = limbSpan(x, y, geo, bodyCentroid);
        if (span >= BOOT_SPAN) {
          // Index 0 unconditionally: a boot is its ramp's darkest step, and the rim-light pass
          // supplies the lit top edge. Letting the leg's tone rank index the boot ramp made
          // the front leg — the brightest tone in the rig — wear grey boots.
          assign(i, variant.boot, 0);
          done = true;
        }
      } else if (part === 'frontArm' || part === 'backArm') {
        const span = limbSpan(x, y, geo, bodyCentroid);
        if (span >= BRACER_SPAN) { assign(i, mat.ramp, baseIdx - 1); done = true; }
      } else if (part === 'torso') {
        const span = limbSpan(x, y, geo, bodyCentroid);
        if (span > BELT_SPAN) { assign(i, [variant.belt], 0, true); done = true; }
        else if (variant.pauldron && span < PAULDRON_SPAN && torsoFwd(x, y, geo, basis) > 0) {
          // Front side only. Unrestricted it painted a grey band clean across the shoulders
          // and read as a bib rather than as a shoulder plate.
          assign(i, [PALETTE.slate, PALETTE.ash], toneIndex([0, 0], tone));
          done = true;
        }
      }
      if (!done) assign(i, mat.ramp, baseIdx);
      n++;
    }
    stamped[part] = n;
  }

  // ---- head point features (eyes), clipped to the head mask.
  if (geometry.head) {
    for (const p of headPointFeatures(variant, geometry.head, basis)) {
      const i = p.y * w + p.x;
      if (p.x < 0 || p.y < 0 || p.x >= w || p.y >= h) continue;
      if (!seg.masks.head[i]) continue;
      assign(i, [p.color], 0, true);
    }
  }

  // ---- weapon. Part of the body silhouette: a held blade is a solid object and gets the
  // same outline. Slash arcs and trails do not.
  let bladeN = 0;
  for (let i = 0; i < w * h; i++) {
    if (!seg.masks.blade[i]) continue;
    assign(i, BLADE_RAMP, toneIndex(BLADE_RAMP, seg.tone[i]), true);
    bladeN++;
  }
  if (bladeN) stamped.blade = bladeN;

  // ---- pass 1b: contact shadow. Where a nearer part overlaps a farther one, the farther
  // pixels along the seam drop a step. At 30px this is what makes an arm read as being IN
  // FRONT of a torso rather than merely adjacent to it; the near/far ramp shift alone leaves
  // the seam flat.
  const depthOf = new Int8Array(w * h).fill(-1);
  BODY_PARTS.forEach((part, order) => {
    const mask = seg.masks[part];
    for (let i = 0; i < w * h; i++) if (mask[i]) depthOf[i] = order;
  });
  const shadowed = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    if (depthOf[i] < 0 || locked[i]) continue;
    const x = i % w;
    const y = (i - x) / w;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const q = ny * w + nx;
      if (depthOf[q] > depthOf[i] + 1) { shadowed[i] = 1; break; }
    }
  }
  for (let i = 0; i < w * h; i++) {
    if (shadowed[i] && ramp[i]) index[i] = Math.max(0, index[i] - 1);
  }

  // ---- pass 2: top-lit rim, one step up the pixel's OWN ramp.
  const lit = new Int8Array(index);
  for (let i = 0; i < w * h; i++) {
    if (!body[i] || locked[i] || !ramp[i]) continue;
    const y = Math.floor(i / w);
    const above = y > 0 ? body[i - w] : 0;
    if (!above) lit[i] = Math.min(ramp[i].length - 1, index[i] + 1);
  }

  // ---- pass 3: resolve to pixels.
  for (let i = 0; i < w * h; i++) {
    if (!body[i] || !ramp[i]) continue;
    const idx = locked[i] ? index[i] : lit[i];
    setPx(out, i % w, Math.floor(i / w), parseHex(ramp[i][Math.max(0, Math.min(ramp[i].length - 1, idx))]));
  }

  // Slash arcs and FX sit outside the silhouette and are not outlined.
  let arcN = 0;
  for (let i = 0; i < w * h; i++) {
    if (!seg.masks.arc[i] && !seg.masks.fx[i]) continue;
    if (body[i]) continue;
    const t = seg.masks.arc[i] ? seg.tone[i] : 0.35;
    setPx(out, i % w, Math.floor(i / w), parseHex(rampAt(ARC_RAMP, t, 0)));
    arcN++;
  }
  if (arcN) stamped.arc = arcN;

  // ---- pass 4: outline.
  const outline = outlinePass(out, body, w, h);

  return {
    image: out,
    stamped,
    layers: splitLayers(out, seg, w, h, outline, [...BODY_PARTS, 'blade', 'arc', 'fx']),
  };
}

/**
 * Split the resolved frame back into one image per body part, plus the outline.
 *
 * The point is hand-polish: an .aseprite whose layers match the rig's own body-part stack lets
 * the operator repaint a forearm without touching the torso under it, which is the whole reason
 * the rig ships layered in the first place. A flattened sprite would throw that away at the
 * last step.
 */
function splitLayers(img, seg, w, h, outlinePixels, parts) {
  const layers = {};
  for (const part of parts) {
    const mask = seg.masks[part];
    if (!mask) continue;
    let any = false;
    const layer = makeImage(w, h);
    for (let i = 0; i < w * h; i++) {
      if (!mask[i]) continue;
      const px = getPx(img, i % w, Math.floor(i / w));
      if (px[3] === 0) continue;
      setPx(layer, i % w, Math.floor(i / w), px);
      any = true;
    }
    if (any) layers[part] = layer;
  }
  if (outlinePixels.length) {
    const layer = makeImage(w, h);
    for (const [x, y] of outlinePixels) setPx(layer, x, y, getPx(img, x, y));
    layers.outline = layer;
  }
  return layers;
}

/** Forward-axis position of a pixel within a part, in the head/body basis. */
function torsoFwd(x, y, geo, basis) {
  return (x - geo.centroid.x) * basis.fwd.x + (y - geo.centroid.y) * basis.fwd.y;
}

/** Nearest integer index in `r` for a normalised tone. */
function toneIndex(r, tone) {
  return Math.round(Math.min(1, Math.max(0, tone)) * (r.length - 1));
}

// Feature extents, in normalised proximal->distal span along a part's own axis. Kept here
// rather than inline so all four are visible together and stay in proportion at ~30px.
const BOOT_SPAN = 0.74;
const BRACER_SPAN = 0.76;
const BELT_SPAN = 0.90;
const PAULDRON_SPAN = 0.13;

/** 1px ink outline around the body silhouette, drawn outward into empty pixels. */
function outlinePass(img, body, w, h) {
  const ink = parseHex(OUTLINE);
  const add = [];
  for (let i = 0; i < w * h; i++) {
    if (body[i]) continue;
    const x = i % w;
    const y = (i - x) / w;
    let touches = false;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      if (body[ny * w + nx]) { touches = true; break; }
    }
    if (!touches) continue;
    // Never overwrite a slash arc with outline — the arc reads as light, not as an edge.
    if (getPx(img, x, y)[3] > 0) continue;
    add.push([x, y]);
  }
  for (const [x, y] of add) setPx(img, x, y, ink);
  return add;
}

// ---------------------------------------------------------------- sheet output

export function paintSheet(sheet, variant) {
  const { frames } = loadSheetFrames(sheet);
  const out = makeImage(sheet.frameW * sheet.frames, sheet.frameH);
  const painted = [];
  const layerSheets = {};
  for (const f of frames) {
    const { image, stamped, layers } = paintFrame(f, variant);
    blit(out, image, f.index * sheet.frameW, 0);
    for (const [name, layer] of Object.entries(layers)) {
      if (!layerSheets[name]) layerSheets[name] = makeImage(sheet.frameW * sheet.frames, sheet.frameH);
      blit(layerSheets[name], layer, f.index * sheet.frameW, 0);
    }
    painted.push({ frame: f, image, stamped, layers });
  }
  return { sheetImage: out, painted, layerSheets };
}

function main() {
  const args = process.argv.slice(2);
  const vIdx = args.indexOf('--variant');
  const sIdx = args.indexOf('--sheet');
  const variants = vIdx >= 0 ? [variantById(args[vIdx + 1])] : VARIANTS;
  const sheets = sIdx >= 0 ? [sheetById(args[sIdx + 1])] : SHEETS;

  for (const variant of variants) {
    const dir = join(OUT_DIR, variant.id);
    mkdirSync(dir, { recursive: true });
    let frames = 0;
    const colors = new Set();
    const layerDir = join(dir, 'layers');
    mkdirSync(layerDir, { recursive: true });
    for (const sheet of sheets) {
      const { sheetImage, layerSheets } = paintSheet(sheet, variant);
      encodePNG(join(dir, `${sheet.id}.png`), sheetImage);
      for (const [name, img] of Object.entries(layerSheets)) {
        encodePNG(join(layerDir, `${sheet.id}--${name}.png`), img);
      }
      for (const c of colorHistogram(sheetImage).keys()) colors.add(c);
      frames += sheet.frames;
    }
    console.log(`${variant.id}: ${sheets.length} sheets, ${frames} frames, `
      + `${colors.size} distinct colours -> ${dir}`);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main();
