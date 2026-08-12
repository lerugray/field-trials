// verify-paintover.mjs — objective checks on the painted output. Exits 2 on any failure.
//
//   node tools/verify-paintover.mjs
//   node tools/verify-paintover.mjs --aseprite   # also verify the .aseprite masters
//
// Four checks, each answering a question that "it looks fine" cannot:
//
//   1. COVERAGE — did every part stamp on every frame? Painted body pixels must equal the
//      rig's opaque pixels exactly, per part and per frame. A part that silently failed to
//      stamp leaves a hole that is easy to miss on a 4x contact sheet and impossible to miss
//      here.
//   2. NO RIG COLOURS — zero pixels of any of the 27 rig identifier colours (#5fcde4 and kin)
//      may survive into the output. One leaked identifier colour means a pixel was copied
//      rather than repainted.
//   3. PALETTE — every colour in the output must be in the declared palette. This is what
//      makes the "12-colour sprite" claim on the contact sheet checkable rather than asserted.
//   4. ASEPRITE — the masters exist, carry the right frame count, and carry one layer per
//      part rather than a flattened image.
//   5. FACING — anchored on physics, then on uniformity, then on the FINAL frames:
//      (a) the raw dash sheet's motion trail says which way the source faces (a trail cannot
//          point the way you are going);
//      (b) every sheet shares one orientation signature, so none is mirrored against the set;
//      (c) after normalisation the trail must stream BACKWARD relative to canonical facing.
//      (c) is the head-vs-body invariant: it compares what the pipeline OUTPUTS against a fact
//      about the source pixels, so unlike a head-to-head consistency check it cannot pass while
//      every head is uniformly backwards. That is precisely how this bug survived two rounds.

import { existsSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { decodePNG, colorHistogram } from './png.mjs';
import { SHEETS, TOOLS_DIR, REPO_ROOT } from './rig-manifest.mjs';
import { RIG_COLORS } from './rig-segment.mjs';
import { VARIANTS } from './hero-parts.mjs';
import { PALETTE } from './hero-palette.mjs';
import { paintSheet } from './paintover.mjs';
import { loadSheetFrames, CANONICAL_FACING } from './rig-extract.mjs';
import { facingProblems, checkNormalisedTrail } from './rig-facing-probe.mjs';

const ASEPRITE = '/Users/rayweiss/Library/Application Support/Steam/steamapps/common/'
  + 'Aseprite/Aseprite.app/Contents/MacOS/aseprite';

const ALLOWED = new Set(Object.values(PALETTE).map((c) => c.toLowerCase()));

function main() {
  const withAseprite = process.argv.includes('--aseprite');
  const failures = [];
  const rows = [];

  let totalFrames = 0;
  let totalRigPx = 0;
  let totalPaintedPx = 0;
  let totalOutlinePx = 0;
  let rigColourLeaks = 0;
  let offPaletteLeaks = 0;

  for (const variant of VARIANTS) {
    let vFrames = 0;
    let vRig = 0;
    let vPainted = 0;
    const vColours = new Set();

    for (const sheet of SHEETS) {
      const { sheetImage, painted } = paintSheet(sheet, variant);

      // --- check 1: coverage, per frame and per part.
      for (const p of painted) {
        const { seg } = p.frame;
        const w = p.image.width;
        const n = w * p.image.height;

        // Every class the segmenter found must be fully painted.
        for (const [cls, mask] of Object.entries(seg.masks)) {
          let expect = 0;
          for (let i = 0; i < n; i++) if (mask[i]) expect++;
          if (expect === 0) continue;
          if (cls === 'unclassified') {
            failures.push(`${variant.id}/${sheet.id} f${p.frame.index}: `
              + `${expect} unclassified rig pixels`);
            continue;
          }
          let got = 0;
          for (let i = 0; i < n; i++) {
            if (!mask[i]) continue;
            if (p.image.data[i * 4 + 3] >= 128) got++;
          }
          if (got !== expect) {
            failures.push(`${variant.id}/${sheet.id} f${p.frame.index}: part '${cls}' `
              + `stamped ${got}/${expect} px`);
          }
        }

        // Painted total, minus the outline it adds outward, must equal the rig's opaque total.
        let rigOpaque = 0;
        for (let i = 0; i < n; i++) if (seg.opaque[i]) rigOpaque++;
        let paintedOpaque = 0;
        for (let i = 0; i < n; i++) if (p.image.data[i * 4 + 3] >= 128) paintedOpaque++;
        let outlinePx = 0;
        if (p.layers.outline) {
          const o = p.layers.outline;
          for (let i = 0; i < n; i++) if (o.data[i * 4 + 3] >= 128) outlinePx++;
        }
        if (paintedOpaque - outlinePx !== rigOpaque) {
          failures.push(`${variant.id}/${sheet.id} f${p.frame.index}: painted `
            + `${paintedOpaque} - outline ${outlinePx} != rig opaque ${rigOpaque}`);
        }

        totalFrames++;
        vFrames++;
        vRig += rigOpaque;
        vPainted += paintedOpaque;
        totalOutlinePx += outlinePx;
      }

      // --- checks 2 and 3: colours in the finished sheet.
      const hist = colorHistogram(sheetImage);
      for (const [c, count] of hist) {
        vColours.add(c.toLowerCase());
        if (RIG_COLORS.has(c.toLowerCase())) {
          failures.push(`${variant.id}/${sheet.id}: ${count}px of rig identifier colour ${c}`);
          rigColourLeaks += count;
        }
        if (!ALLOWED.has(c.toLowerCase())) {
          failures.push(`${variant.id}/${sheet.id}: ${count}px of off-palette colour ${c}`);
          offPaletteLeaks += count;
        }
      }
    }

    totalRigPx += vRig;
    totalPaintedPx += vPainted;
    rows.push(`${variant.id.padEnd(11)} ${String(vFrames).padStart(3)} frames  `
      + `${String(vRig).padStart(6)} rig px painted  ${vColours.size} colours`);
  }

  // --- check 5: facing, from physics through to the final frames.
  const facingBad = facingProblems();
  for (const p of facingBad) failures.push(`facing: ${p}`);
  const trail = checkNormalisedTrail(loadSheetFrames, CANONICAL_FACING);
  if (!trail.ok) {
    failures.push(`facing: after normalising to '${CANONICAL_FACING}' the dash trail sits `
      + `${trail.offset}px from the body — expected ${trail.expected}. The hero is mirrored `
      + `against the direction he is painted to face.`);
  }
  const facingLine = facingBad.length || !trail.ok
    ? `facing    ${facingBad.length} data problem(s), normalised-trail ${trail.ok ? 'ok' : 'FAILED'}`
    : `facing    anchor+uniformity ok; normalised trail ${trail.offset >= 0 ? '+' : ''}${trail.offset}px `
      + `(${trail.expected}) over ${trail.frames} frames`;

  // --- check 4: the aseprite masters.
  let aseLine = 'aseprite  (skipped — pass --aseprite)';
  if (withAseprite) {
    const dir = join(REPO_ROOT, 'docs', 'hero-draft', 'aseprite');
    if (!existsSync(dir)) {
      failures.push('no docs/hero-draft/aseprite — run: node tools/hero-to-aseprite.mjs');
    } else {
      const files = readdirSync(dir).filter((f) => f.endsWith('.aseprite'));
      const expected = VARIANTS.length * SHEETS.length;
      if (files.length !== expected) {
        failures.push(`aseprite: ${files.length} files, expected ${expected}`);
      }
      // One Aseprite launch for the whole audit; per-file launches bounce the Dock.
      const script = join(TOOLS_DIR, 'aseprite-audit.lua');
      const out = execFileSync(ASEPRITE, ['-b', '--script-param',
        `dir=${dir}`, '--script', script], { encoding: 'utf8' });
      let checked = 0;
      for (const line of out.trim().split('\n')) {
        const m = line.match(/^AUDIT (\S+) frames=(\d+) layers=(\d+) mode=(\S+)$/);
        if (!m) continue;
        checked++;
        const [, name, frames, layers, mode] = m;
        const sheetId = name.replace(/\.aseprite$/, '').split('-').slice(1).join('-');
        const sheet = SHEETS.find((s) => s.id === sheetId);
        if (!sheet) { failures.push(`aseprite: ${name} matches no manifest sheet`); continue; }
        if (Number(frames) !== sheet.frames) {
          failures.push(`aseprite: ${name} has ${frames} frames, rig has ${sheet.frames}`);
        }
        if (Number(layers) < 2) failures.push(`aseprite: ${name} is flattened (${layers} layer)`);
        if (mode !== 'INDEXED') failures.push(`aseprite: ${name} is ${mode}, expected INDEXED`);
      }
      aseLine = `aseprite  ${checked} masters audited (frames, layers, indexed)`;
    }
  }

  console.log('--- paint-over verification -------------------------------------');
  for (const r of rows) console.log('  ', r);
  console.log('  ', facingLine);
  console.log('  ', aseLine);
  console.log('   totals:',
    `${totalFrames} painted frames`,
    `| rig px ${totalRigPx} == painted ${totalPaintedPx - totalOutlinePx} (+${totalOutlinePx} outline)`,
    `| rig-colour leaks ${rigColourLeaks}`,
    `| off-palette px ${offPaletteLeaks}`);

  if (failures.length) {
    console.error(`\nFAIL: ${failures.length} problem(s)`);
    for (const f of failures.slice(0, 40)) console.error('   -', f);
    if (failures.length > 40) console.error(`   ... and ${failures.length - 40} more`);
    process.exit(2);
  }
  console.log('\nPASS: coverage complete, zero rig colours, palette clean.');
}

main();
