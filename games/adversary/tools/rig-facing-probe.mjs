// rig-facing-probe.mjs — establish each rig sheet's facing from PHYSICS, then check that the
// whole set shares one orientation.
//
//   node tools/rig-facing-probe.mjs
//
// WHY THIS FILE HAS BEEN REWRITTEN ONCE ALREADY. Its first version measured facing from toe
// direction — the mean x of the leg mask's lowest rows against the leg's centre of mass, on the
// theory that a foot juts forward. That measure is INVERTED on this rig (in these poses the
// bottom rows are dominated by the trailing foot and the heel), and it reported LEFT for all
// eleven sheets when the truth is RIGHT for all eleven. Acting on it removed the mirroring from
// nine sheets that were correct, and turned a two-sheet defect into an eleven-sheet one.
//
// The lesson is not "measure" — the first version measured. It is that an anatomical proxy is a
// guess wearing a number's clothing. Facing must come from something that cannot be read
// backwards.
//
// TWO ANCHORS, both physical:
//
//   1. THE DASH TRAIL. A motion trail streams BACKWARD. On the raw dash sheet the streaks sit
//      8-10 px LEFT of the body on 9 of 9 frames, so the body travels RIGHT. This is not an
//      anatomical inference — a trail cannot point the way you are going.
//      Corroborated independently by the death sheet, which topples FORWARD (catalog §2.2) and
//      ends prone with the head 13 px to the RIGHT of the body's centre.
//
//   2. CROSS-SHEET ORIENTATION SIGNATURE. Each sheet's body parts sit on characteristic sides of
//      the torso. Measured over every frame, all eleven agree — katana_slash (head +3.9,
//      frontLeg -7.0, backLeg +2.4) is indistinguishable from dash (+4.8, -6.9, +2.8) and death
//      (+4.1, -6.0, +1.9). No sheet is mirrored relative to the others, INCLUDING the katana
//      pair, which the catalog claims faces the other way. It does not.
//
// So: every sheet faces RIGHT in the source, canonical facing is LEFT, and all eleven are
// mirrored. The check below is the thing that would have caught both of this bug's generations.

import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { decodePNG, cropImage } from './png.mjs';
import { SHEETS, RIG_ROOT, sheetById } from './rig-manifest.mjs';
import { segmentFrame, frameGeometry } from './rig-segment.mjs';

/** The part-vs-torso offsets that make up a sheet's orientation signature. */
const SIGNATURE_PARTS = ['head', 'frontLeg', 'backLeg', 'frontArm'];

// Below this many pixels a sheet's offset carries no orientation information (a sprint's legs
// pass through the torso line; a tumble has no consistent layout at all).
const SIGNATURE_MIN = 1.5;

function sheetFrames(sheet) {
  const raw = decodePNG(join(RIG_ROOT, sheet.png));
  const out = [];
  for (let i = 0; i < sheet.frames; i++) {
    if ((sheet.flashFrames || []).includes(i)) continue;
    const cell = cropImage(raw, i * sheet.frameW, 0, sheet.frameW, sheet.frameH);
    const seg = segmentFrame(cell, { pinkPool: !!sheet.pinkPool });
    out.push({ index: i, seg, geo: frameGeometry(seg, sheet.frameW), w: sheet.frameW, h: sheet.frameH });
  }
  return out;
}

/**
 * ANCHOR 1 — the dash sheet's motion trail, measured on the RAW sheet.
 * @returns {{offset: number, frames: number, sourceFacing: 'left'|'right'}}
 */
export function measureTrailAnchor() {
  const sheet = sheetById('dash');
  const offsets = [];
  for (const f of sheetFrames(sheet)) {
    let tx = 0; let tn = 0; let bx = 0; let bn = 0;
    for (let k = 0; k < f.w * f.h; k++) {
      if (!f.seg.opaque[k]) continue;
      if (f.seg.trail[k]) { tx += k % f.w; tn++; } else { bx += k % f.w; bn++; }
    }
    if (tn < 8 || bn < 40) continue;
    offsets.push((tx / tn) - (bx / bn));
  }
  const mean = offsets.reduce((a, b) => a + b, 0) / offsets.length;
  // Trail behind means the body moves the OTHER way: trail left => travelling right.
  return { offset: +mean.toFixed(2), frames: offsets.length, sourceFacing: mean < 0 ? 'right' : 'left' };
}

/** ANCHOR 2 — per-sheet orientation signature, measured on the RAW sheet. */
export function measureSignature(sheet) {
  const acc = {};
  for (const p of SIGNATURE_PARTS) acc[p] = [];
  for (const f of sheetFrames(sheet)) {
    if (!f.geo.torso) continue;
    for (const p of SIGNATURE_PARTS) {
      if (f.geo[p]) acc[p].push(f.geo[p].centroid.x - f.geo.torso.centroid.x);
    }
  }
  const sig = {};
  for (const p of SIGNATURE_PARTS) {
    const a = acc[p];
    sig[p] = a.length ? +(a.reduce((x, y) => x + y, 0) / a.length).toFixed(1) : null;
  }
  return { id: sheet.id, declared: sheet.facing, sig };
}

/**
 * Everything wrong with the set's facing data, as a list of human-readable failures.
 * Empty means: the absolute anchor agrees with what the sheets declare, and every sheet is drawn
 * in the same orientation as the anchor sheet.
 */
export function facingProblems() {
  const problems = [];
  const anchor = measureTrailAnchor();
  const dash = sheetById('dash');

  if (dash.facing !== anchor.sourceFacing) {
    problems.push(`dash declares facing '${dash.facing}' but its motion trail sits `
      + `${anchor.offset}px to the ${anchor.offset < 0 ? 'LEFT' : 'RIGHT'} of the body over `
      + `${anchor.frames} frames, so it travels ${anchor.sourceFacing.toUpperCase()}`);
  }

  const ref = measureSignature(dash);
  for (const sheet of SHEETS) {
    const m = measureSignature(sheet);
    // Every sheet must declare the same facing as the anchor, because every sheet is drawn in
    // the same orientation as the anchor (asserted next).
    if (sheet.facing !== dash.facing) {
      problems.push(`sheet '${sheet.id}' declares '${sheet.facing}' but the set is uniform `
        + `('${dash.facing}')`);
    }
    for (const p of SIGNATURE_PARTS) {
      const a = ref.sig[p];
      const b = m.sig[p];
      if (a === null || b === null) continue;
      if (Math.abs(a) < SIGNATURE_MIN || Math.abs(b) < SIGNATURE_MIN) continue;
      if (Math.sign(a) !== Math.sign(b)) {
        problems.push(`sheet '${sheet.id}' looks MIRRORED vs the set: ${p} offset ${b} `
          + `vs ${a} on '${dash.id}'`);
      }
    }
  }
  return problems;
}

/**
 * The invariant on the FINAL normalised frames: after mirroring to canonical facing, the dash
 * trail must stream BACKWARD — i.e. away from the direction the hero now faces. This is the
 * head-vs-body class of check done against something that cannot be circular, since the trail's
 * direction is a fact about the source pixels and not about anything this pipeline draws.
 */
export function checkNormalisedTrail(loadSheetFrames, canonicalFacing) {
  const sheet = sheetById('dash');
  const { frames } = loadSheetFrames(sheet);
  const offsets = [];
  for (const f of frames) {
    let tx = 0; let tn = 0; let bx = 0; let bn = 0;
    const n = f.image.width * f.image.height;
    for (let k = 0; k < n; k++) {
      if (!f.seg.opaque[k]) continue;
      if (f.seg.trail[k]) { tx += k % f.image.width; tn++; } else { bx += k % f.image.width; bn++; }
    }
    if (tn < 8 || bn < 40) continue;
    offsets.push((tx / tn) - (bx / bn));
  }
  const mean = offsets.reduce((a, b) => a + b, 0) / offsets.length;
  // Facing left => forward is -x => the trail must be at +x (to the right).
  const want = canonicalFacing === 'left' ? 1 : -1;
  return {
    offset: +mean.toFixed(2),
    frames: offsets.length,
    ok: Math.sign(mean) === want,
    expected: canonicalFacing === 'left' ? 'trail on the RIGHT' : 'trail on the LEFT',
  };
}

function main() {
  const anchor = measureTrailAnchor();
  console.log('ANCHOR 1 — dash motion trail (raw):');
  console.log(`   trail sits ${anchor.offset}px ${anchor.offset < 0 ? 'LEFT' : 'RIGHT'} of body `
    + `over ${anchor.frames} frames => source faces ${anchor.sourceFacing.toUpperCase()}`);
  console.log('\nANCHOR 2 — orientation signature per sheet (raw, part x minus torso x):');
  for (const sheet of SHEETS) {
    const m = measureSignature(sheet);
    console.log(`   ${m.id.padEnd(14)} declared=${m.declared.padEnd(5)} `
      + SIGNATURE_PARTS.map((p) => `${p}=${String(m.sig[p]).padStart(5)}`).join('  '));
  }
  const problems = facingProblems();
  console.log(problems.length ? `\nFAIL:\n   ${problems.join('\n   ')}`
    : '\nOK: absolute anchor agrees with the declared facing, and all sheets share one orientation.');
  if (problems.length) process.exit(2);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main();
