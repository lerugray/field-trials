// build.js — single-file build (DESIGN-SEED stack).
//
//   node scripts/build.js  ->  dist/office-of-the-road.html
//
// The game ships as ONE self-contained HTML file that boots from file:// on a
// double-click: zero dependencies, zero fetches, all code + (later) all art
// inlined. This script concatenates the ES modules under src/ into a single
// classic <script>, in dependency order, stripping the module syntax.
//
// Dependency discovery reads ONLY real `import ... from '...'` statements (lines
// whose first non-space token is `import`). It never scans comments, so a module
// may mention the import keyword in prose without registering a bogus edge.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ART_KEYS, TAROT_KEYS, ICONSET_KEY, OVERWORLD_KEY, TOWN_KEY } from '../src/art.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const SRC = resolve(ROOT, 'src');
const ENTRY = resolve(SRC, 'main.js');
const OUT_DIR = resolve(ROOT, 'dist');
const OUT = resolve(OUT_DIR, 'office-of-the-road.html');
const ATTRIBUTION_PATH = resolve(ROOT, 'ATTRIBUTION.md');

// Licensed battler art (CC BY, Willibab "Simple 8-bit Sideview Battlers"). Every
// key in art.js resolves to one sv_actor sheet here; the sheets are inlined as
// base64 data URIs so the single-file build boots from file:// with zero fetches
// (art law: licensed packs only, no generated/code-drawn stand-ins).
const SV_DIR = resolve(ROOT,
  'materials/art-packs/Simple-8-bit-Sideview-Battlers/Simple 8-bit Sideview Battlers/Simple 8-bit Sideview Battlers/Style 1/sv_actors');
const TAROT_DIR = resolve(ROOT, 'materials/art-packs/Pixel-Tarot');
// UI iconography (CC BY, Willibab's Retro Icons) — one 512×1408 iconset.
const ICONSET_PATH = resolve(ROOT, "materials/art-packs/Willibab-s-Retro-Icons/Willibab's Retro Icons/Willibab's Retro Icons/Iconset.png");
// Overworld terrain tiles (CC BY, Willibab Overworld OW_A2, 256×256 @16px).
const OVERWORLD_PATH = resolve(ROOT, 'materials/art-packs/WILLIBAB_OVERWORLD/WILLIBAB_OVERWORLD/Tileset 1x/OW_A2.png');
// Town floor tiles (CC BY, Willibab Town, TOWNS_ALL_1x 512×544 @16px).
const TOWN_PATH = resolve(ROOT, 'materials/art-packs/WILLIBAB_TOWN/WILLIBAB_TOWN/Tileset/TOWNS_ALL_1x.png');

function inlineOne(dir, key, out) {
  const p = resolve(dir, key + '.png');
  if (!existsSync(p)) throw new Error(`art missing: ${relative(ROOT, p)} (referenced in art.js)`);
  out[key] = 'data:image/png;base64,' + readFileSync(p).toString('base64');
}
function inlineArt() {
  const out = {};
  for (const key of ART_KEYS) inlineOne(SV_DIR, key, out); // Willibab battlers (CC BY)
  for (const key of TAROT_KEYS) inlineOne(TAROT_DIR, key, out); // Pixel Tarot (GuttyKreum)
  if (!existsSync(ICONSET_PATH)) throw new Error('iconset missing: ' + relative(ROOT, ICONSET_PATH));
  out[ICONSET_KEY] = 'data:image/png;base64,' + readFileSync(ICONSET_PATH).toString('base64'); // Retro Icons (CC BY)
  if (!existsSync(OVERWORLD_PATH)) throw new Error('overworld tileset missing: ' + relative(ROOT, OVERWORLD_PATH));
  out[OVERWORLD_KEY] = 'data:image/png;base64,' + readFileSync(OVERWORLD_PATH).toString('base64'); // Overworld tiles (CC BY)
  if (!existsSync(TOWN_PATH)) throw new Error('town tileset missing: ' + relative(ROOT, TOWN_PATH));
  out[TOWN_KEY] = 'data:image/png;base64,' + readFileSync(TOWN_PATH).toString('base64'); // Town tiles (CC BY)
  return out;
}

// Match a real import statement and capture its module specifier.
const IMPORT_RE = /^\s*import\b[^;]*?\bfrom\s*['"]([^'"]+)['"]\s*;?\s*$/;

// Read a module, return { code, deps } where deps are resolved absolute paths of
// its relative imports (in first-seen order).
function readModule(absPath) {
  const raw = readFileSync(absPath, 'utf8');
  const lines = raw.split('\n');
  const deps = [];
  const kept = [];
  for (const line of lines) {
    const m = line.match(IMPORT_RE);
    if (m) {
      const spec = m[1];
      if (spec.startsWith('.')) {
        deps.push(resolve(dirname(absPath), spec));
      }
      // Drop the import line entirely (local names come from concatenation;
      // non-relative specifiers are not supported in a zero-dependency build).
      continue;
    }
    kept.push(stripExport(line));
  }
  return { code: kept.join('\n'), deps };
}

// stripExport: turn a module's `export` declarations into plain top-level ones.
// Handles `export const/let/var/function/class/async function` and drops
// `export { ... }` / `export default` re-export lines (unused in this codebase).
function stripExport(line) {
  if (/^\s*export\s*\{/.test(line)) return ''; // export { a, b };
  if (/^\s*export\s+default\b/.test(line)) return line.replace(/^\s*export\s+default\s+/, '');
  return line.replace(/^(\s*)export\s+/, '$1');
}

// Topologically order modules starting from the entry (deps emitted before the
// modules that import them). Detects cycles loudly.
function orderModules(entry) {
  const order = [];
  const state = new Map(); // path -> 'visiting' | 'done'
  const codeOf = new Map();
  function visit(path, stack) {
    const st = state.get(path);
    if (st === 'done') return;
    if (st === 'visiting') {
      throw new Error(`import cycle: ${[...stack, path].map((p) => relative(ROOT, p)).join(' -> ')}`);
    }
    if (!existsSync(path)) {
      throw new Error(`missing module: ${relative(ROOT, path)} (imported in the graph)`);
    }
    state.set(path, 'visiting');
    const { code, deps } = readModule(path);
    codeOf.set(path, code);
    for (const d of deps) visit(d, [...stack, path]);
    state.set(path, 'done');
    order.push(path);
  }
  visit(entry, []);
  return order.map((p) => ({ path: p, code: codeOf.get(p) }));
}

function build() {
  if (!existsSync(ENTRY)) {
    console.error(`[build] no entry at ${relative(ROOT, ENTRY)} — nothing to build yet.`);
    process.exit(1);
  }
  const modules = orderModules(ENTRY);
  const banner = modules.map((m) => ` *   ${relative(ROOT, m.path)}`).join('\n');
  const art = inlineArt();
  if (!existsSync(ATTRIBUTION_PATH)) throw new Error('missing attribution: ATTRIBUTION.md');
  const attribution = readFileSync(ATTRIBUTION_PATH, 'utf8');
  const artPreamble = `// ===== inlined licensed art (Willibab CC BY, sv_actors) =====\n` +
    `const ART_DATA = ${JSON.stringify(art)};\n` +
    `// ===== inlined licensing notice (ATTRIBUTION.md) =====\n` +
    `const ATTRIBUTION_TEXT = ${JSON.stringify(attribution)};`;
  const bundle = artPreamble + '\n\n' + modules
    .map((m) => `// ===== ${relative(ROOT, m.path)} =====\n${m.code}`)
    .join('\n\n');
  const artKb = (Buffer.byteLength(JSON.stringify(art), 'utf8') / 1024).toFixed(0);

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>THE OFFICE OF THE ROAD</title>
<style>
  html, body { margin: 0; padding: 0; background: #0d0b0a; color: #e8dfce; overflow: hidden;
    font-family: ui-monospace, "DejaVu Sans Mono", monospace; }
  #stage { display: block; position: absolute; left: 0; top: 0; image-rendering: pixelated; }
  #boot-error { position: absolute; inset: 0; display: none; padding: 24px; box-sizing: border-box;
    background: #2a0d0d; color: #ffd9d9; font-size: 14px; white-space: pre-wrap; z-index: 9999; }
</style>
</head>
<body>
<canvas id="stage"></canvas>
<pre id="boot-error"></pre>
<script>
/* THE OFFICE OF THE ROAD — single-file build. Generated by scripts/build.js.
 * Bundled modules (dependency order):
${banner}
 */
"use strict";
(function () {
try {
${bundle}
} catch (e) {
  // Loudness law: a boot failure must be VISIBLE, never a blank canvas.
  var el = document.getElementById('boot-error');
  if (el) { el.style.display = 'block';
    el.textContent = 'THE OFFICE OF THE ROAD failed to open the file.\\n\\n' +
      (e && e.stack ? e.stack : e); }
  throw e;
}
})();
</script>
</body>
</html>
`;

  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(OUT, html, 'utf8');
  const kb = (Buffer.byteLength(html, 'utf8') / 1024).toFixed(1);
  console.log(`[build] wrote ${relative(ROOT, OUT)} (${kb} KB, ${modules.length} modules, ${ART_KEYS.length} battlers + ${TAROT_KEYS.length} tarot ~${artKb} KB art)`);
}

build();
