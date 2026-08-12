// contact-sheets.mjs — one operator-facing contact sheet per variant.
//
//   node tools/contact-sheets.mjs
//
// Output: docs/hero-draft/CONTACT-SHEET-2026-08-09-<variant>.png
//
// Six key sets per sheet at 4x nearest-neighbour, every frame labelled with its index. The
// sets are the ones a reviewer needs to judge a hero read: a loop (idle), locomotion (run),
// the two air states (jump, air-spin — the latter is where the rotating head basis has to
// hold up), an attack with its slash arc (katana), and the hit reaction.
//
// Filenames are dated and never overwritten with different content — per the repo's proofs
// rule, an operator-facing capture keeps its identity.

import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { encodePNG, cropImage, colorHistogram } from './png.mjs';
import { contactSheet } from './sheet.mjs';
import { sheetById, REPO_ROOT } from './rig-manifest.mjs';
import { VARIANTS } from './hero-parts.mjs';
import { paintSheet } from './paintover.mjs';
import { paletteReport } from './hero-palette.mjs';

// Revision suffix, not an overwrite: the 2026-08-09 sheets are the ones the operator actually
// reviewed and are kept as the record. Per the repo's proofs rule an operator-facing capture
// never changes content under a filename someone has already looked at.
const DATE = '2026-08-09c';
const OUT_DIR = join(REPO_ROOT, 'docs', 'hero-draft');

// The key sets, in the order a reviewer should read them.
const KEY_SETS = ['idle', 'run', 'jump', 'airspin', 'katana_slash', 'hurt'];

/**
 * Crop each frame to a tight, CONSISTENT window so the figure fills the cell without the
 * 48x48 canvas's weapon-arc headroom eating half the sheet. The window is computed per SET
 * (not per frame) from the union of that set's content boxes, so the character does not jitter
 * between cells — a per-frame crop would recentre every frame and destroy the read of the
 * animation's own movement.
 */
function setWindow(painted, frameW, frameH, pad = 2) {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const p of painted) {
    const c = p.frame.content;
    if (!c) continue;
    x0 = Math.min(x0, c.x0);
    y0 = Math.min(y0, c.y0);
    x1 = Math.max(x1, c.x1);
    y1 = Math.max(y1, c.y1);
  }
  // +1 all round for the outline pass, then the caller's padding.
  x0 = Math.max(0, x0 - 1 - pad);
  y0 = Math.max(0, y0 - 1 - pad);
  x1 = Math.min(frameW - 1, x1 + 1 + pad);
  y1 = Math.min(frameH - 1, y1 + 1 + pad);
  return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

/** Word-wrap for the footer: slicing mid-word left "THE A" on an operator-facing capture. */
function wrap(text, width) {
  const out = [];
  let line = '';
  for (const word of text.split(/\s+/)) {
    if (line && (line + ' ' + word).length > width) { out.push(line); line = word; }
    else line = line ? `${line} ${word}` : word;
  }
  if (line) out.push(line);
  return out;
}

export function buildContactSheet(variant) {
  const rows = [];
  const colors = new Set();

  for (const id of KEY_SETS) {
    const sheet = sheetById(id);
    const { painted } = paintSheet(sheet, variant);
    const win = setWindow(painted, sheet.frameW, sheet.frameH);
    const frames = painted.map((p) => cropImage(p.image, win.x, win.y, win.w, win.h));
    for (const f of frames) for (const c of colorHistogram(f).keys()) colors.add(c);
    rows.push({
      label: `${id}  (${sheet.verb}, ${sheet.frames}f${sheet.loops ? ', loops' : ''})`,
      frames,
      cellLabels: painted.map((p) => `f${p.frame.index}`),
    });
  }

  const pal = paletteReport();
  const img = contactSheet(rows, {
    zoom: 4,
    titleText: `ADVERSARY HERO DRAFT ${DATE} - ${variant.label}`,
    footerLines: [
      ...wrap(variant.blurb.replace(/[—–]/g, '-'), 100),
      `palette: vania spine ${pal.spine} + ${pal.extensions} hero tones. `
        + `this sheet uses ${colors.size} colours incl outline.`,
      'rig: 2d pixel art character template (draw-over rig). silhouette + timing from the rig,',
      'material and features authored. draft only - the hero look is the operator\'s call.',
    ],
  });
  return { img, colorCount: colors.size };
}

function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  for (const variant of VARIANTS) {
    const { img, colorCount } = buildContactSheet(variant);
    const path = join(OUT_DIR, `CONTACT-SHEET-${DATE}-${variant.id}.png`);
    encodePNG(path, img);
    console.log(`${variant.id}: ${img.width}x${img.height}, ${colorCount} colours -> ${path}`);
  }
}

main();
