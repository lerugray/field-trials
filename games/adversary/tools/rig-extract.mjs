// rig-extract.mjs — slice every manifest sheet into frames, segment each frame into body
// parts, and emit the per-frame geometry the compositor stamps against.
//
//   node tools/rig-extract.mjs                     # write tools/out/rig-geometry.json
//   node tools/rig-extract.mjs --report            # also print a per-sheet summary
//
// Output is derived data, committed as evidence: it is the record of what the rig actually
// contains, independent of any painting decision.

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { decodePNG, cropImage, hflip } from './png.mjs';
import { SHEETS, RIG_ROOT, TOOLS_DIR, PART_ORDER } from './rig-manifest.mjs';
import { segmentFrame, frameGeometry, contentBox } from './rig-segment.mjs';

// Painted sheets and per-part layer PNGs are regenerable intermediates -> gitignored out/.
export const OUT_DIR = join(TOOLS_DIR, 'out');
// The extraction record is evidence about the rig itself, independent of any paint decision,
// so it is committed.
export const DERIVED_DIR = join(TOOLS_DIR, 'derived');

// The game's own curated hero is authored facing LEFT and mirrored at render time for right
// (catalog §1.1). Normalising the whole set to left means the renderer's existing mirror
// logic keeps working, and it means the katana sheets — the only left-facing set in the pack
// — are the ones that DON'T get flipped. Applying one global mirror instead is the exact bug
// class that produced AR3A's backward sword.
export const CANONICAL_FACING = 'left';

/**
 * Load one sheet, slice it, and return per-frame { image (canonical facing), seg, geometry }.
 * The images returned here are the exact pixels the compositor paints over.
 */
export function loadSheetFrames(sheet) {
  const img = decodePNG(join(RIG_ROOT, sheet.png));
  const expectedW = sheet.frames * sheet.frameW;
  if (img.width !== expectedW) {
    throw new Error(`${sheet.id}: sheet is ${img.width}px wide, expected ${expectedW} `
      + `(${sheet.frames} x ${sheet.frameW}) — frame size or count is wrong`);
  }
  if (img.height !== sheet.frameH) {
    throw new Error(`${sheet.id}: sheet is ${img.height}px tall, expected ${sheet.frameH}`);
  }

  const mirrored = sheet.facing !== CANONICAL_FACING;
  const frames = [];
  for (let i = 0; i < sheet.frames; i++) {
    let cell = cropImage(img, i * sheet.frameW, 0, sheet.frameW, sheet.frameH);
    if (mirrored) cell = hflip(cell);
    const flash = (sheet.flashFrames || []).includes(i);
    const seg = segmentFrame(cell, { pinkPool: !!sheet.pinkPool, flash });
    frames.push({
      index: i,
      flash,
      image: cell,
      seg,
      geometry: frameGeometry(seg, cell.width),
      content: contentBox(seg.opaque, cell.width, cell.height, seg.masks),
    });
  }
  return { mirrored, frames };
}

/** Katana attachment metadata from the classified masks. The hand is the blade pixel nearest the
 *  authored front arm; bladeTip is the blade pixel farthest from that attachment. This replaces
 *  AR3B's hand-guessed overlay points with geometry from the same class masks that paint the art. */
function weaponAnchors(seg, w) {
  const blade = [];
  const arm = [];
  for (let i = 0; i < seg.masks.blade.length; i++) {
    if (seg.masks.blade[i]) blade.push({ x: i % w, y: Math.floor(i / w) });
    if (seg.masks.frontArm[i]) arm.push({ x: i % w, y: Math.floor(i / w) });
  }
  if (!blade.length || !arm.length) return null;
  let hand = blade[0];
  let handDistance = Infinity;
  for (const point of blade) {
    for (const armPoint of arm) {
      const distance = (point.x - armPoint.x) ** 2 + (point.y - armPoint.y) ** 2;
      if (distance < handDistance) { hand = point; handDistance = distance; }
    }
  }
  let bladeTip = hand;
  let tipDistance = -1;
  for (const point of blade) {
    const distance = (point.x - hand.x) ** 2 + (point.y - hand.y) ** 2;
    if (distance > tipDistance) { bladeTip = point; tipDistance = distance; }
  }
  return { hand, bladeTip };
}

function main() {
  const report = process.argv.includes('--report');
  mkdirSync(DERIVED_DIR, { recursive: true });

  const out = {
    _comment: 'DERIVED by tools/rig-extract.mjs. Per-frame body-part geometry of the rig '
      + 'sheets ADVERSARY paints over. Coordinates are frame-local pixels with the frame '
      + 'already normalised to the canonical facing. angleDeg is screen-space (y down).',
    generated: new Date().toISOString().slice(0, 10),
    canonicalFacing: CANONICAL_FACING,
    partOrder: PART_ORDER,
    sheets: {},
  };

  let totalFrames = 0;
  let totalUnclassified = 0;
  const lines = [];

  for (const sheet of SHEETS) {
    const { mirrored, frames } = loadSheetFrames(sheet);
    const heights = frames.map((f) => (f.content ? f.content.h : 0));
    let unclassified = 0;
    let blades = 0;
    let arcs = 0;

    out.sheets[sheet.id] = {
      verb: sheet.verb,
      frameW: sheet.frameW,
      frameH: sheet.frameH,
      frameCount: sheet.frames,
      sourceFacing: sheet.facing,
      mirroredToCanonical: mirrored,
      loops: sheet.loops,
      source: sheet.png,
      frames: frames.map((f) => {
        unclassified += f.seg.stats.unclassifiedCount;
        blades += f.seg.stats.bladePx;
        arcs += f.seg.stats.arcPx;
        return {
          index: f.index,
          flash: f.flash,
          opaque: f.seg.stats.opaqueCount,
          unclassified: f.seg.stats.unclassifiedCount,
          content: f.content,
          parts: f.geometry,
          anchors: weaponAnchors(f.seg, sheet.frameW) || undefined,
          blade: f.seg.stats.bladePx || undefined,
          arc: f.seg.stats.arcPx || undefined,
        };
      }),
    };

    totalFrames += frames.length;
    totalUnclassified += unclassified;
    const hmin = Math.min(...heights);
    const hmax = Math.max(...heights);
    lines.push(`${sheet.id.padEnd(14)} ${String(sheet.frames).padStart(2)}f  `
      + `h=${hmin}-${hmax}px  mirrored=${mirrored ? 'yes' : 'no '}  `
      + `unclassified=${unclassified}` + (blades + arcs ? `  bladePx/arcPx=${blades}/${arcs}` : ''));
  }

  const path = join(DERIVED_DIR, 'rig-geometry.json');
  writeFileSync(path, `${JSON.stringify(out, null, 1)}\n`);
  console.log(`wrote ${path}: ${SHEETS.length} sheets, ${totalFrames} frames, `
    + `${totalUnclassified} unclassified px`);
  if (report) for (const l of lines) console.log('  ', l);
}

// NOTE: the repo path contains a space ("Dev Work"), so import.meta.url is percent-encoded
// and the naive `file://${process.argv[1]}` comparison silently never matches. pathToFileURL
// is the only correct way to do this check here.
if (import.meta.url === pathToFileURL(process.argv[1]).href) main();
