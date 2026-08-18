// overlay-proof.mjs — render every OVERLAY surface straight from the rasterizer to
// PNG, with no browser in the loop.
//
// The sibling of art-proof.mjs, and it exists for the same reason: the overlay layer
// is pure JS over a pixel buffer, so authoring iterations should cost a second rather
// than a Playwright boot. The full in-game proof set still goes through
// scripts/capture.mjs, which boots the real single-file build — that remains the
// artifact of record. This is the tool you draw WITH.
//
// The fixtures below are also the ones test/overlays.test.js renders, so a surface
// that throws, paints blank, or reaches for a glyph the fonts do not have fails
// `node --test` before anyone has to look at a picture.
//
//   node scripts/overlay-proof.mjs [--out DIR] [--scale N]

import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Painter, NATIVE, resetMissingGlyphs, missingGlyphs } from '../src/render/px.js';
import { writePNG } from './art-proof.mjs';
import * as OV from '../src/render/overlays.js';
import { paintVista } from '../src/render/vistas.js';
import { CATALOG } from '../src/sim/catalog.js';
import { beginSlide, holdSlide, paintSlide, resetSlide } from '../src/render/transition.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');

const IMPL = CATALOG.filter((c) => c.implemented);
const LOCALES = ['Emerald Midway', 'The Windward Pier', 'Sunset Ironworks'];

// Deliberately awkward fixtures: the LONGEST names and blurbs in the catalogue, a
// full loadout, six-figure scores — if a layout is going to overflow it will do it
// here rather than on someone's screen.
const OPT_ROWS = [
  { label: 'Master volume', type: 'scale', min: 0, max: 1, value: 0.7, text: '70%', on: false },
  { label: 'SFX level', type: 'scale', min: 0, max: 1, value: 0.9, text: '90%', on: false },
  { label: 'Mute all', type: 'toggle', value: false, text: 'OFF', on: false },
  { label: 'Game speed', type: 'scale', min: 0.8, max: 1.0, value: 0.9, text: '90%', on: false },
  { label: 'Composure hearts', type: 'count', min: 3, max: 5, value: 4, text: '4', on: false },
  { label: 'Closing bell (par)', type: 'toggle', value: false, text: 'ON', on: true },
  { label: 'Flash-reduce', type: 'toggle', value: true, text: 'ON', on: true },
  { label: 'Reduce motion', type: 'toggle', value: false, text: 'OFF', on: false },
];
const longest = [...IMPL].sort((a, b) => b.name.length - a.name.length);
const SC_DOWNED = { outcome: 'downed', locale: 2, stage: 3, culpritCls: 'penny', seed: 20260810, souvenirs: ['secondBarrel', 'quickSpool', 'plumeHat'], pops: 148, bestChain: 6, score: 24350, tickets: 9 };
const SC_VICTORY = { outcome: 'victory', locale: 3, stage: 'finale', seed: 1, souvenirs: ['secondBarrel', 'quickSpool', 'plumeHat', 'operaGlasses', 'ironGores'], pops: 612, bestChain: 11, score: 918200, tickets: 17 };

function stageBehind(p) { paintVista(p, { locale: 1, stage: 2, seed: 20260810 }); }
function titleBehind(p) {
  paintVista(p, { locale: 1, stage: 3, seed: 20260810 });
  for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) p.mul(x, y, '#1c2038', 0.42);
}

// name -> (painter) => void. Exported so the test suite renders the SAME fixtures.
export const SHEETS = {
  options: (p) => OV.drawOptions(p, { items: OPT_ROWS, cursor: 3 }),
  trunk: (p) => OV.drawTrunk(p, { owned: IMPL.slice(0, 7), locked: IMPL.slice(7), bank: 8, cursor: 4, cost: 12 }),
  'trunk-rich': (p) => OV.drawTrunk(p, { owned: IMPL.slice(0, 2), locked: [...IMPL.slice(2)], bank: 26, cursor: 13, cost: 12 }),
  'trunk-complete': (p) => OV.drawTrunk(p, { owned: IMPL, locked: [], bank: 30, cursor: 0, cost: 12 }),
  tourmap: (p) => OV.drawTourMap(p, { locale: 2, names: LOCALES }),
  'tourmap-3': (p) => OV.drawTourMap(p, { locale: 3, names: LOCALES }),
  draft: (p) => OV.drawDraft(p, { offer: [longest[0], longest[1], longest[2]], held: '2' }),
  'draft-none': (p) => OV.drawDraft(p, { offer: [IMPL[18], IMPL[4], IMPL[10]], held: 'NONE' }),
  scorecard: (p) => OV.drawScorecard(p, { sc: SC_DOWNED, souvenirs: ['Second Barrel', 'Quick Spool', 'Plume Hat'], unlock: { name: "Collector's Eye", bank: 8, cost: 12 } }),
  'scorecard-victory': (p) => OV.drawScorecard(p, { sc: SC_VICTORY, souvenirs: ['Second Barrel', 'Quick Spool', 'Plume Hat', 'Opera Glasses', 'Iron Gores'], unlock: { complete: true } }),
  'title-extras': (p) => {
    titleBehind(p);
    OV.drawTitleExtras(p, {
      seed: 20260810, seedInput: '', bank: 14, endless: true,
      scores: [{ score: 918200, seed: 1, victory: true }, { score: 44120, seed: 7 }, { score: 31000, seed: 22 }, { score: 12400, seed: 3 }],
      runs: [{ score: 918200, seed: 1, victory: true }, { score: 8100, locale: 2, stage: 3, culpritCls: 'penny' }, { score: 5400, locale: 1, stage: 2 }],
    });
    OV.drawResumeHint(p);
  },
  'title-extras-fresh': (p) => {
    titleBehind(p);
    OV.drawTitleExtras(p, { seed: 1, seedInput: '4077', bank: 0, endless: false, scores: [], runs: [] });
  },
  paused: (p) => { stageBehind(p); OV.drawPaused(p); },
  cleared: (p) => { stageBehind(p); OV.drawClearedRibbon(p, { score: 8420, timeBonus: 320 }); },
  downed: (p) => { stageBehind(p); OV.drawDowned(p); },
  centerpiece: (p) => { stageBehind(p); OV.drawCenterpiece(p, 'The Grand Carousel', 1); },
  'centerpiece-fading': (p) => { stageBehind(p); OV.drawCenterpiece(p, 'The Avalanche', 0.35); },
  rehearsal: (p) => { stageBehind(p); OV.drawRehearsal(p, 12); },
};

// The transition is a composite of two frames, so it gets its own fixture shape.
export function transitionSheet(phase, kind = 'locale', calm = false) {
  const out = new Painter(NATIVE.w, NATIVE.h);
  const from = new Painter(NATIVE.w, NATIVE.h);
  from.clear('#000000'); stageBehind(from);
  resetSlide();
  beginSlide(from, kind, calm);
  holdSlide(phase);
  out.clear('#000000');
  OV.drawTourMap(out, { locale: 2, names: LOCALES });
  paintSlide(out);
  resetSlide();
  return out;
}

export function renderSheet(name) {
  const p = new Painter(NATIVE.w, NATIVE.h);
  p.clear('#000000');
  SHEETS[name](p);
  return p;
}

function main() {
  const args = Object.fromEntries(process.argv.slice(2)
    .filter((a) => a.startsWith('--'))
    .map((a) => { const [k, v] = a.slice(2).split('='); return [k, v === undefined ? true : v]; }));
  const outDir = resolve(ROOT, String(args.out || 'proofs/overlays'));
  const scale = Number(args.scale || 2);
  mkdirSync(outDir, { recursive: true });

  resetMissingGlyphs();
  let n = 0;
  for (const name of Object.keys(SHEETS)) { writePNG(resolve(outDir, `ov-${name}.png`), renderSheet(name), scale); n++; }
  for (const ph of [0.28, 0.5, 0.74]) {
    writePNG(resolve(outDir, `ov-transition-${String(ph).replace('.', '')}.png`), transitionSheet(ph), scale); n++;
  }
  writePNG(resolve(outDir, 'ov-transition-calm.png'), transitionSheet(0.5, 'stage', true), scale); n++;
  const missing = missingGlyphs();
  console.log(`wrote ${n} overlay proofs to ${outDir} at ${scale}x (${NATIVE.w * scale}x${NATIVE.h * scale})`);
  console.log(`missing glyphs across every surface: ${missing}`);
  if (missing) { console.error('FAIL: a surface asked for a character the pixel faces do not have'); process.exit(1); }
}
// NB: compare against pathToFileURL — the repo path contains a space ("Dev Work"),
// which import.meta.url percent-encodes, so a raw `file://${argv[1]}` never matches.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
