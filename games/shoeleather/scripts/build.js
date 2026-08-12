// SHOELEATHER — zero-dependency single-file build (CLAUDE.md rule 11: boot-anywhere).
//
// Inlines the local ES-module graph rooted at src/main.js into ONE classic <script>
// and injects it into index.html's shell, producing dist/shoeleather.html — the
// artifact the operator reviews. No bundler, no npm: we resolve relative imports,
// emit dependencies before dependents (so top-level const/class TDZ is satisfied in
// the single classic-script scope), and strip import/export syntax.
//
// This is deliberately small and only handles THIS codebase's conventions: relative
// single-line imports, `export const|let|var|class|function`, and re-export lines.
// It refuses (throws) on anything it does not understand, so drift fails loudly.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ENTRY = join(ROOT, 'src', 'main.js');
const SHELL = join(ROOT, 'index.html');
const OUT_DIR = join(ROOT, 'dist');
const OUT = join(OUT_DIR, 'shoeleather.html');

const IMPORT_RE = /^\s*import\b[^\n]*\bfrom\s+['"]([^'"]+)['"]\s*;?\s*$/;
const SIDE_IMPORT_RE = /^\s*import\s+['"][^'"]+['"]\s*;?\s*$/;

function resolveImport(fromFile, spec) {
  if (!spec.startsWith('.')) {
    throw new Error(`build only inlines relative imports, got "${spec}" in ${fromFile}`);
  }
  return resolve(dirname(fromFile), spec);
}

// Post-order DFS: collect files with dependencies first, dependents last.
function collect(entry) {
  const order = [];
  const state = new Map(); // file -> 'visiting' | 'done'
  function visit(file) {
    const s = state.get(file);
    if (s === 'done') return;
    if (s === 'visiting') return; // import cycle: the earlier visit will emit it
    state.set(file, 'visiting');
    const src = readFileSync(file, 'utf8');
    for (const line of src.split('\n')) {
      const m = line.match(IMPORT_RE);
      if (m) visit(resolveImport(file, m[1]));
    }
    state.set(file, 'done');
    order.push(file);
  }
  visit(entry);
  return order;
}

// Aliased named imports (`import { a as b } from '...'`) need an explicit binding in the
// flattened single scope: the original name `a` exists (its module is emitted first), but
// `b` does not unless we create it. Emit `const b = a;` per aliased specifier. Non-aliased
// specifiers need nothing (they share the flat scope). Returns the binding lines (or []).
function aliasBindings(line) {
  const braces = line.match(/import\s*\{([^}]*)\}\s*from/);
  if (!braces) return [];
  const bindings = [];
  for (const spec of braces[1].split(',')) {
    const m = spec.trim().match(/^(\w+)\s+as\s+(\w+)$/);
    if (m) bindings.push(`const ${m[2]} = ${m[1]};`);
  }
  return bindings;
}

function stripModuleSyntax(src, file) {
  const out = [];
  for (const line of src.split('\n')) {
    if (IMPORT_RE.test(line)) { out.push(...aliasBindings(line)); continue; }
    if (SIDE_IMPORT_RE.test(line)) continue;
    if (/^\s*export\s*\{/.test(line) || /^\s*export\s+\*/.test(line)) continue;
    if (/^\s*export\s+default\b/.test(line)) {
      throw new Error(`build does not support 'export default' (${file})`);
    }
    out.push(line.replace(/^(\s*)export\s+(const|let|var|class|function|async\s+function)\b/, '$1$2'));
  }
  return out.join('\n');
}

export function bundle() {
  const files = collect(ENTRY);
  const parts = files.map((f) => {
    const rel = f.slice(ROOT.length + 1);
    return `// ==== ${rel} ====\n${stripModuleSyntax(readFileSync(f, 'utf8'), f)}`;
  });
  const js = parts.join('\n\n');
  const shell = readFileSync(SHELL, 'utf8');
  const scriptTag = /<script\s+type="module"\s+src="\.\/src\/main\.js"><\/script>/;
  if (!scriptTag.test(shell)) {
    throw new Error('index.html shell is missing the expected module <script> tag');
  }
  const safeJs = js.replace(/<\/script>/g, '<\\/script>');
  const html = shell.replace(scriptTag, `<script>\n${safeJs}\n</script>`);
  return { js, html, files };
}

function main() {
  const { html, files } = bundle();
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(OUT, html, 'utf8');
  const kb = (Buffer.byteLength(html) / 1024).toFixed(1);
  console.log(`built ${OUT} from ${files.length} modules (${kb} kB, zero deps)`);
}

// pathToFileURL resolves a RELATIVE argv[1] (`node scripts/build.js`) to an
// absolute URL; the old string-concat guard only matched absolute invocations,
// silently no-opping relative ones with exit 0 — a stale dist that looked built.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
