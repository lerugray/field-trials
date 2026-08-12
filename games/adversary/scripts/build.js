// build.js — bundle the ESM src modules into ONE self-contained dist/index.html
// (DESIGN-SEED "STACK": zero-dep, file:// double-click). Browsers can't fetch ES modules over
// file://, so we inline every module: strip import/export syntax and concatenate in dependency
// order into a single classic <script>. The codebase follows one discipline that makes this safe —
// named single-line imports, one declaration per exported name, no default exports, no name
// collisions across modules — which the sanity checks below enforce.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve, relative } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ENTRY = 'src/boot.js';

// Discover every module reachable from the entry by following relative imports, and return them in
// dependency order (leaf → entry) via post-order DFS. Eliminates a hand-maintained module list —
// adding a new module + importing it is all that's needed; the bundler finds it automatically.
function discoverModules(entry) {
  const ordered = [];
  const state = new Map(); // rel → 'visiting' | 'done'
  const importsOf = (rel) => {
    const src = readFileSync(join(ROOT, rel), 'utf8');
    const dir = dirname(rel);
    const deps = [];
    for (const m of src.matchAll(/from\s+['"](\.[^'"]+)['"]/g)) {
      deps.push(relative(ROOT, resolve(join(ROOT, dir), m[1])).split('\\').join('/'));
    }
    return deps;
  };
  const visit = (rel) => {
    if (state.get(rel) === 'done') return;
    if (state.get(rel) === 'visiting') return; // import cycle — post-order still yields a usable order
    state.set(rel, 'visiting');
    for (const dep of importsOf(rel)) visit(dep);
    state.set(rel, 'done');
    ordered.push(rel);
  };
  visit(entry);
  return ordered;
}

const MODULES = discoverModules(ENTRY);

/** Strip import statements (single- or multi-line) and export keywords for flat concatenation. */
function stripModule(src, file) {
  const lines = src.split('\n');
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();
    // Import statements: skip the whole statement, which may span several lines until it ends
    // with a terminating ';' (e.g. `} from './x.js';`).
    if (t.startsWith('import ') || t.startsWith('import{')) {
      while (i < lines.length && !/;\s*$/.test(lines[i])) i++;
      continue; // i now points at the terminating line; the for-loop's i++ skips it
    }
    if (/^export\s*\{[^}]*\}\s*;?$/.test(t)) continue;      // drop re-export statements
    if (t.startsWith('export default')) {
      throw new Error(`${file}: default exports are not supported by the bundler`);
    }
    out.push(lines[i].replace(/^(\s*)export\s+(const|function|class|let|var|async)\b/, '$1$2'));
  }
  return out.join('\n');
}

/** Concatenate the stripped modules into one bundle string. */
export function bundleModules() {
  const parts = [];
  for (const rel of MODULES) {
    const src = readFileSync(join(ROOT, rel), 'utf8');
    parts.push(`// ===== ${rel} =====\n${stripModule(src, rel)}`);
  }
  const bundle = parts.join('\n\n');

  // Sanity: no stray module syntax survived the strip.
  const leftover = bundle.match(/^\s*(import|export)\s/m);
  if (leftover) throw new Error(`bundler left module syntax in output: "${leftover[0].trim()}"`);

  // Sanity: no duplicate top-level declarations across modules (flattened scope → must be unique).
  const seen = new Map();
  for (const line of bundle.split('\n')) {
    const m = line.match(/^(?:const|let|function)\s+([A-Za-z_$][\w$]*)/); // column-0 = top level
    if (!m) continue;
    if (seen.has(m[1])) throw new Error(`bundler: duplicate top-level identifier '${m[1]}' — rename one (flattened scope collision)`);
    seen.set(m[1], true);
  }
  return bundle;
}

/** Build the full single-file HTML document string. */
export function buildHtml() {
  const bundle = bundleModules();
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, user-scalable=no">
<title>ADVERSARY</title>
<style>
  html, body { margin: 0; height: 100%; background: #000; overflow: hidden; }
  body { display: flex; align-items: center; justify-content: center; }
  #screen { display: block; image-rendering: pixelated; image-rendering: crisp-edges; }
  * { -webkit-tap-highlight-color: transparent; }
</style>
</head>
<body>
<canvas id="screen"></canvas>
<script>
${bundle}
</script>
</body>
</html>
`;
}

/** Build and write dist/index.html. */
export function writeBuild() {
  const html = buildHtml();
  mkdirSync(join(ROOT, 'dist'), { recursive: true });
  const outPath = join(ROOT, 'dist/index.html');
  writeFileSync(outPath, html);
  const kb = (Buffer.byteLength(html) / 1024).toFixed(1);
  console.log(`built dist/index.html (${kb} KiB, ${MODULES.length} modules inlined)`);
  return outPath;
}

// Auto-run only when invoked directly (not when imported by a test).
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  writeBuild();
}
