// THE JACQUARD INDEX — single-file build (hard-rule 9: zero deps; seed STACK: boot-
// anywhere single file rebuilt every milestone).
//
// Bundles the ES modules under src/ into one self-contained HTML with no network needs.
// Strategy: a tiny CommonJS-style __require shim wraps each module as a lazy factory, so
// modules bundle regardless of top-level name collisions and load in dependency order at
// runtime. The transform handles exactly the import/export forms this codebase uses
// (named imports; `export const/let/var/function/class`). No external bundler.

import { readFileSync, writeFileSync, readdirSync, statSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(ROOT, 'src');
const ENTRY = 'src/boot/browser.js';

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (name.endsWith('.js')) out.push(full);
  }
  return out;
}

// Canonical module id: posix path relative to the project root (e.g. src/gfx/font.js).
function idOf(absFile) {
  return path.relative(ROOT, absFile).split(path.sep).join('/');
}

function resolveSpec(fromId, spec) {
  const dir = path.posix.dirname(fromId);
  return path.posix.normalize(path.posix.join(dir, spec));
}

function transform(id, code) {
  const exported = [];

  // Named imports -> destructured __require. Handles aliases (`A as B` -> `A: B`).
  code = code.replace(
    /^import\s*\{([^}]*)\}\s*from\s*['"]([^'"]+)['"];?[ \t]*$/gm,
    (_m, names, spec) => {
      const binds = names.split(',').map((n) => n.trim()).filter(Boolean)
        .map((n) => n.replace(/\s+as\s+/, ': ')).join(', ');
      return `const {${binds}} = __require(${JSON.stringify(resolveSpec(id, spec))});`;
    },
  );

  // Bare side-effect imports -> require for side effects.
  code = code.replace(
    /^import\s+['"]([^'"]+)['"];?[ \t]*$/gm,
    (_m, spec) => `__require(${JSON.stringify(resolveSpec(id, spec))});`,
  );

  // export const/let/var/function/class NAME -> strip `export `, record the binding.
  code = code.replace(
    /^export\s+(async\s+function|function|class|const|let|var)\s+([A-Za-z0-9_$]+)/gm,
    (_m, kw, name) => { exported.push(name); return `${kw} ${name}`; },
  );

  // export { a, b }; -> record names (plain form only; no aliases used here).
  code = code.replace(/^export\s*\{([^}]*)\};?[ \t]*$/gm, (_m, names) => {
    names.split(',').map((s) => s.trim()).filter(Boolean).forEach((n) => exported.push(n));
    return '';
  });

  const tail = exported.length
    ? `\n  Object.assign(exports, { ${[...new Set(exported)].join(', ')} });\n`
    : '';
  return `__register(${JSON.stringify(id)}, function(module, exports, __require) {\n${code}\n${tail}});`;
}

export function buildBundleJS({ expose = false } = {}) {
  const files = walk(SRC);
  const runtime = `
var __modules = {}, __cache = {};
function __register(id, factory) { __modules[id] = factory; }
function __require(id) {
  if (__cache[id]) return __cache[id].exports;
  var factory = __modules[id];
  if (!factory) throw new Error('module not found: ' + id);
  var module = { exports: {} };
  __cache[id] = module;
  factory(module, module.exports, __require);
  return module.exports;
}`.trim();

  const bodies = files.map((f) => transform(idOf(f), readFileSync(f, 'utf8'))).join('\n\n');
  // `expose` (test-only) publishes __require before the entry so a node harness can
  // require bundled modules and diff them against the ESM originals.
  const exposeLine = expose
    ? `try { if (typeof globalThis !== 'undefined') globalThis.__JQ = __require; } catch (e) {}\n`
    : '';
  return `(function(){\n"use strict";\n${runtime}\n\n${bodies}\n\n${exposeLine}__require(${JSON.stringify(ENTRY)});\n})();`;
}

export function buildHTML() {
  const js = buildBundleJS();
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, user-scalable=no">
<title>THE JACQUARD INDEX</title>
<style>
  html, body { margin: 0; padding: 0; height: 100%; background: #100e0b; overflow: hidden; }
  canvas { display: block; image-rendering: pixelated; image-rendering: crisp-edges; }
</style>
</head>
<body>
<canvas id="jacquard"></canvas>
<script>
${js}
</script>
</body>
</html>
`;
}

// Run directly: emit dist/jacquard-index.html.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const dist = path.join(ROOT, 'dist');
  mkdirSync(dist, { recursive: true });
  const out = path.join(dist, 'jacquard-index.html');
  writeFileSync(out, buildHTML());
  const bytes = statSync(out).size;
  console.log(`built ${idOf(out)} (${(bytes / 1024).toFixed(1)} KB)`);
}
