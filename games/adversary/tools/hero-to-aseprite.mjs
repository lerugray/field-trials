// hero-to-aseprite.mjs — drive hero-to-aseprite.lua in ONE headless Aseprite invocation.
//
//   node tools/paintover.mjs && node tools/hero-to-aseprite.mjs
//
// Output: docs/hero-draft/aseprite/<variant>-<sheet>.aseprite — layered, indexed masters for
// hand-polish. Requires the layer PNGs paintover.mjs writes, so run that first.
//
// One invocation, not one per file: launching the Aseprite binary bounces the macOS Dock even
// in batch mode, so 33 launches is 33 interruptions on the operator's machine. Everything the
// Lua side needs goes into one request file.

import { execFileSync } from 'node:child_process';
import { writeFileSync, existsSync, mkdirSync, rmSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { SHEETS, TOOLS_DIR, REPO_ROOT } from './rig-manifest.mjs';
import { VARIANTS } from './hero-parts.mjs';
import { OUT_DIR } from './rig-extract.mjs';
import { decodePNG, colorHistogram } from './png.mjs';

const ASEPRITE = '/Users/rayweiss/Library/Application Support/Steam/steamapps/common/'
  + 'Aseprite/Aseprite.app/Contents/MacOS/aseprite';

const REQ_PATH = join(TOOLS_DIR, '.aseprite-request.json');
const LUA_PATH = join(TOOLS_DIR, 'hero-to-aseprite.lua');
// Masters live with the operator-facing deliverable, not in the tooling's scratch dir — the
// point of them is that Ray opens them.
const ASE_DIR = join(REPO_ROOT, 'docs', 'hero-draft', 'aseprite');

// Bottom-to-top, matching the rig's own layer stack. `outline` goes on top because it is drawn
// outward into empty pixels and never occludes anything.
const LAYER_ORDER = ['backLeg', 'backArm', 'torso', 'frontLeg', 'frontArm', 'head', 'blade',
  'arc', 'fx', 'flash', 'outline'];

function main() {
  mkdirSync(ASE_DIR, { recursive: true });

  const variants = [];
  for (const variant of VARIANTS) {
    const layerDir = join(OUT_DIR, variant.id, 'layers');
    if (!existsSync(layerDir)) {
      console.error(`missing ${layerDir} — run: node tools/paintover.mjs`);
      process.exit(2);
    }
    const available = new Set(readdirSync(layerDir));

    // Palette per variant, measured off the painted output rather than declared, so the Lua
    // side can never hit a colour the palette lacks.
    const palette = new Set();
    const sheets = [];
    for (const sheet of SHEETS) {
      const layers = [];
      for (const name of LAYER_ORDER) {
        const file = `${sheet.id}--${name}.png`;
        if (!available.has(file)) continue;
        const path = join(layerDir, file);
        for (const c of colorHistogram(decodePNG(path)).keys()) palette.add(c.toLowerCase());
        layers.push({ name, png: path });
      }
      if (!layers.length) continue;
      sheets.push({
        id: sheet.id, frameW: sheet.frameW, frameH: sheet.frameH, frames: sheet.frames, layers,
      });
    }
    variants.push({ id: variant.id, palette: [...palette].sort(), sheets });
  }

  writeFileSync(REQ_PATH, JSON.stringify({ outDir: ASE_DIR, variants }));
  // -b is mandatory: without it this opens the Aseprite GUI.
  execFileSync(ASEPRITE, ['-b', '--script', LUA_PATH], { stdio: 'inherit' });
  rmSync(REQ_PATH, { force: true });

  const made = readdirSync(ASE_DIR).filter((f) => f.endsWith('.aseprite'));
  console.log(`${made.length} .aseprite files in ${ASE_DIR}`);
  for (const v of variants) {
    console.log(`  ${v.id}: ${v.sheets.length} sets, ${v.palette.length}-colour palette`);
  }
}

main();
