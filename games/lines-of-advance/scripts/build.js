// Minimal ES-module bundler for the single-file dist/index.html deliverable.
// Reads src/main.js, resolves relative imports, inlines everything into one
// inline <script type="module"> inside dist/index.html. No external deps.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, extname, basename } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const SRC_DIR = resolve(ROOT, 'src');
const OUT_FILE = process.env.LOA_BUILD_OUT
  ? resolve(process.env.LOA_BUILD_OUT)
  : resolve(ROOT, 'dist', 'index.html');
const OUT_DIR = dirname(OUT_FILE);

const IMPORT_RE = /import\s*\{([\s\S]*?)\}\s*from\s*['"]([^'"]+)['"];?/g;
const EXPORT_BLOCK_RE = /export\s*\{([^}]+)\}\s*;?/;

const seen = new Set();
const names = new Map(); // path -> safe variable name
const modules = [];      // { var, code }

function safeName(path) {
  if (!names.has(path)) {
    const base = basename(path, extname(path)).replace(/[^A-Za-z0-9_]/g, '_');
    names.set(path, `__${base}_${names.size}`);
  }
  return names.get(path);
}

function bundle(path) {
  if (seen.has(path)) return safeName(path);
  seen.add(path);

  let code = readFileSync(path, 'utf8');

  // Resolve imports first (dependencies must be bundled before this file).
  // Use a fresh regex so lastIndex does not leak across files.
  const importRe = new RegExp(IMPORT_RE.source, IMPORT_RE.flags);
  let out = '';
  let last = 0;
  let match;
  while ((match = importRe.exec(code)) !== null) {
    out += code.slice(last, match.index);
    const imports = match[1].split(',').map(s => s.trim()).filter(Boolean);
    const rel = match[2];
    const depPath = resolve(dirname(path), rel);
    const depVar = bundle(depPath);
    out += `const { ${imports.join(', ')} } = ${depVar};\n`;
    last = importRe.lastIndex;
  }
  out += code.slice(last);

  // Strip inline exports (export const/function/class -> const/function/class).
  out = out.replace(/export\s+(const|let|var|function|class)\s+/g, '$1 ');

  // Replace export { ... }; with return { ... };
  const exportMatch = EXPORT_BLOCK_RE.exec(out);
  if (!exportMatch) {
    throw new Error(`No export block found in ${path}`);
  }
  out = out.replace(EXPORT_BLOCK_RE, `return { ${exportMatch[1].trim()} };`);

  // Wrap in an IIFE assigned to a unique const.
  const varName = safeName(path);
  modules.push({ var: varName, code: `${varName} = (function () {\n"use strict";\n${out}\n})();` });
  return varName;
}

function inlineCss() {
  try {
    return readFileSync(resolve(ROOT, 'src', 'styles.css'), 'utf8');
  } catch {
    return '';
  }
}

function build() {
  const entry = resolve(SRC_DIR, 'main.js');
  bundle(entry);

  const declarations = modules.map(m => `let ${m.var};`).join('\n');
  const assignments = modules.map(m => m.code).join('\n');

  const css = inlineCss();

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="A local operational board game with hotseat play and a shallow game-specific engine.">
  <title>LINES OF ADVANCE</title>
  <style>
${css}
  </style>
</head>
<body>
  <div id="app"></div>
  <script type="module">
${declarations}
${assignments}
${modules[modules.length - 1].var}.init();
  </script>
</body>
</html>
`;

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(OUT_FILE, html, 'utf8');
  console.log(`Built ${OUT_FILE}`);
}

build();
