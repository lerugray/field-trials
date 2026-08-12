// head-check.mjs — the one-glance head-vs-body proof strip, per variant.
//
//   node tools/head-check.mjs
//
// Output: docs/hero-draft/HEAD-CHECK-<date>-<variant>.png
//
// Three frames at 8x: idle F0, run F3, slash F3. Those three because idle is the ambiguous one
// that let a facing bug slip past twice, and run F3 and slash F3 are the two frames where the
// body's direction is unmistakable — a sprint stride and a lunge with a katana. If the face leads
// the body in these three, the hero is not mirrored against himself.
//
// This exists because a head-to-head consistency check cannot catch a uniform error: when every
// head is backwards, every head still agrees with every other head. The only checks that caught
// this were a physical anchor (verify-paintover check 5) and looking at zoomed crops.

import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { encodePNG, cropImage } from './png.mjs';
import { contactSheet } from './sheet.mjs';
import { sheetById, REPO_ROOT } from './rig-manifest.mjs';
import { VARIANTS } from './hero-parts.mjs';
import { paintSheet } from './paintover.mjs';

const DATE = '2026-08-09c';
const OUT_DIR = join(REPO_ROOT, 'docs', 'hero-draft');

// [sheet id, frame index, what the operator should see]
const PROOF_FRAMES = [
  ['idle', 0, 'idle f0 - face LEFT'],
  ['run', 3, 'run f3 - strides LEFT, face LEFT'],
  ['katana_slash', 3, 'slash f3 - lunges LEFT, face LEFT'],
];

function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  for (const variant of VARIANTS) {
    const frames = [];
    const labels = [];
    for (const [sheetId, frameIdx, caption] of PROOF_FRAMES) {
      const sheet = sheetById(sheetId);
      const { painted } = paintSheet(sheet, variant);
      const p = painted[frameIdx];
      const c = p.frame.content;
      // Pad generously and uniformly: a tight per-frame crop would recentre each pose and hide
      // the very thing being checked.
      const pad = 3;
      const x0 = Math.max(0, c.x0 - pad);
      const y0 = Math.max(0, c.y0 - pad);
      const x1 = Math.min(sheet.frameW - 1, c.x1 + pad);
      const y1 = Math.min(sheet.frameH - 1, c.y1 + pad);
      frames.push(cropImage(p.image, x0, y0, x1 - x0 + 1, y1 - y0 + 1));
      labels.push(caption);
    }
    // One row per frame so each keeps its own aspect; captions carry the expectation.
    const rows = frames.map((f, i) => ({ label: labels[i], frames: [f], cellLabels: [''] }));
    const img = contactSheet(rows, {
      zoom: 8,
      titleText: `HEAD CHECK ${DATE} - ${variant.label} - does the FACE lead the BODY?`,
      footerLines: [
        'canonical facing is LEFT. in all three the face, headband and eye must sit on the',
        'LEFT of the head, and the body must act leftward: stride, lunge and blade all left.',
      ],
      maxRowWidth: 1200,
    });
    const path = join(OUT_DIR, `HEAD-CHECK-${DATE}-${variant.id}.png`);
    encodePNG(path, img);
    console.log(`${variant.id}: ${img.width}x${img.height} -> ${path}`);
  }
}

main();
