// rig-manifest.mjs — which rig sheets this pipeline paints, and their measured geometry.
//
// Scope note: the rig pack ships 41 sheets / 315 frames. This manifest covers only the
// sheets that map onto a verb the game actually has (docs/ART-PACK-CATALOG-2026-08-09.md
// §4.1). Animations for verbs ADVERSARY does not have — crouch, slide, wall-cling, climb,
// push/pull, gunplay, roll — are deliberately absent: an animation existing is not
// authority to add a mechanic (see the forked-engines rule).
//
// Every frame size here is the MEASURED cell, not the filename's claim. `Player Death
// 64x64.png` is 48x48 with 10 frames; trusting its name slices it wrong.

import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const TOOLS_DIR = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = join(TOOLS_DIR, '..');

export const RIG_ROOT = '/Users/rayweiss/Desktop/Dev Work/pixel-art-library/extracted/'
  + '2D-Pixel-Art-Character-Template/2D-Pixel-Art-Character-Template';

// Bottom-to-top compositing order, taken from the rig's own Aseprite layer stack
// (BG / Back Leg / Back arm / Torso / Front Leg / Front Arm / Head, plus Slashies on the
// katana sheets). `fx` sits above everything because slash arcs read as foreground.
export const PART_ORDER = ['backLeg', 'backArm', 'torso', 'frontLeg', 'frontArm', 'head', 'weapon', 'fx'];

// Facing: every sheet in this manifest faces RIGHT in the source, so ALL ELEVEN are mirrored to
// the canonical LEFT. Established from physics, not anatomy — see tools/rig-facing-probe.mjs:
// the dash sheet's motion trail sits 8-10px LEFT of the body on 9 of 9 frames (a trail cannot
// point the way you are going), the death sheet topples forward and ends prone with its head 13px
// to the RIGHT, and all eleven sheets share one orientation signature, katana pair included.
//
// THIS VALUE HAS BEEN WRONG TWICE. Both times the pipeline was fine and the DATA was wrong:
//   1. Built from `docs/ART-PACK-CATALOG-2026-08-09.md` §2.4, which says the katana set faces
//      LEFT while the base sets face RIGHT. The base half is right; the katana half is not. So
//      the two katana sheets went unmirrored and shipped with the face on the back of the head.
//      The operator caught it on the slash, and was exactly right.
//   2. "Fixed" by measuring toe direction, which is INVERTED on this rig — it read LEFT for all
//      eleven. That removed the mirroring from the nine sheets that were correct and made every
//      sheet wrong. A proxy that can be read backwards is not a measurement.
//
// Canonical facing is LEFT because the game's curated hero is authored left and mirrored at
// render time. The per-sheet mirroring machinery stays for a future sheet that genuinely differs;
// what changed is that the values are now anchored to something physical and checked on every
// verify run.

export const SHEETS = [
  {
    id: 'idle', verb: 'idle', frames: 10, frameW: 48, frameH: 48, facing: 'right', loops: true,
    png: 'Idle/Player Idle 48x48.png', aseprite: 'Idle/Player Idle 48x48.aseprite',
  },
  {
    id: 'walk', verb: 'walk', frames: 8, frameW: 48, frameH: 48, facing: 'right', loops: true,
    png: 'Walk/PlayerWalk 48x48.png', aseprite: 'Walk/PlayerWalk 48x48.aseprite',
  },
  {
    id: 'run', verb: 'run', frames: 8, frameW: 48, frameH: 48, facing: 'right', loops: true,
    png: 'Run/player run 48x48.png', aseprite: 'Run/player run 48x48.aseprite',
  },
  {
    id: 'jump', verb: 'jump', frames: 6, frameW: 48, frameH: 48, facing: 'right', loops: false,
    png: 'Jump/player new jump 48x48.png', aseprite: 'Jump/player new jump 48x48.aseprite',
  },
  {
    id: 'land', verb: 'land', frames: 9, frameW: 48, frameH: 48, facing: 'right', loops: false,
    png: 'Land/player land 48x48.png', aseprite: 'Land/player land 48x48.aseprite',
  },
  {
    // The 1:1 fit for the Stage-4 double jump — an aerial flip distinguishes air jump
    // from ground jump for free (catalog §4.1).
    id: 'airspin', verb: 'double jump', frames: 6, frameW: 48, frameH: 48, facing: 'right', loops: true,
    png: 'Air Spin/player air spin 48x48.png', aseprite: 'Air Spin/player air spin 48x48.aseprite',
  },
  {
    // Dodge step. NOT Roll — DESIGN-SEED says "a step, not roll spam".
    id: 'dash', verb: 'dodge step', frames: 9, frameW: 48, frameH: 48, facing: 'right', loops: false,
    png: 'Dash/dash.png', aseprite: 'Dash/dash.aseprite',
  },
  {
    id: 'hurt', verb: 'hurt', frames: 4, frameW: 48, frameH: 48, facing: 'right', loops: false,
    png: 'Hurt-Damaged/Player Hurt 48x48.png', aseprite: 'Hurt-Damaged/Player Hurt 48x48.aseprite',
    // Frame 0 is a built-in white hit-flash: its pixels are washed-out tints of the
    // identifier colours rather than the identifiers themselves.
    flashFrames: [0],
  },
  {
    // Filename says 64x64. The pixels and the .aseprite both say 48x48 x 10.
    id: 'death', verb: 'death', frames: 10, frameW: 48, frameH: 48, facing: 'right', loops: false,
    png: 'Death/Player Death 64x64.png', aseprite: 'Death/Player Death 64x64.aseprite',
  },
  {
    id: 'katana_slash', verb: 'base melee', frames: 10, frameW: 80, frameH: 64, facing: 'right', loops: false,
    // Blade and slash arc share the pink family on both katana sheets; segmentation pools
    // them and splits by geometry.
    pinkPool: true,
    png: 'Katana Attack-Sheathe/player katana attack-sheathe 80x64.png',
    aseprite: 'Katana Attack-Sheathe/player katana attack-sheathe 80x64.aseprite',
  },
  {
    id: 'katana_combo', verb: 'base melee (chain)', frames: 9, frameW: 80, frameH: 64, facing: 'right', loops: true,
    pinkPool: true,
    png: 'Katana Continuous Attack/player katana continuous attack 80x64.png',
    aseprite: 'Katana Continuous Attack/player katana continuous attack 80x64.aseprite',
  },
];

export function sheetById(id) {
  const s = SHEETS.find((x) => x.id === id);
  if (!s) throw new Error(`no rig sheet '${id}'`);
  return s;
}
