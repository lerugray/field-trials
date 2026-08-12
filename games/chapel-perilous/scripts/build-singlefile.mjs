#!/usr/bin/env node
// Zero-dependency single-file bundler for file:// boot (CLAUDE.md hard rule 6).
// Walks the ES module graph from src/main.js, inlines data/*.json, strips
// import/export into factory modules (topological order), and emits
// chapel-perilous.html — one self-contained file. Dev index.html stays modular.
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { dirname, resolve, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ENTRY = 'src/main.js';
const OUT = 'chapel-perilous.html';

function toPosix(p) {
  return p.split('\\').join('/');
}

function relId(abs) {
  return toPosix(relative(ROOT, abs));
}

function resolveSpec(fromFile, spec) {
  return resolve(dirname(fromFile), spec);
}

/** Collect import declarations. Supports `with { type: 'json' }`. */
function findImports(src) {
  const re = /import\s+([\s\S]*?)\s+from\s+["']([^"']+)["'](?:\s+with\s*\{[^}]*\})?\s*;?/g;
  const out = [];
  let m;
  while ((m = re.exec(src))) {
    out.push({ clause: m[1].trim(), spec: m[2], full: m[0], index: m.index });
  }
  return out;
}

function parseClause(clause) {
  // Forms: `name` | `{ a, b as c }` | `name, { a }` | `* as ns`
  const c = clause.trim();
  if (c.startsWith('*')) {
    const mm = c.match(/^\*\s+as\s+(\w+)$/);
    if (!mm) throw new Error(`unsupported import clause: ${clause}`);
    return { defaultName: null, named: [], namespace: mm[1] };
  }
  let defaultName = null;
  let named = [];
  const brace = c.match(/\{([^}]*)\}/);
  if (brace) {
    named = brace[1].split(',').map((s) => s.trim()).filter(Boolean).map((s) => {
      const mm = s.match(/^(\w+)\s+as\s+(\w+)$/) || s.match(/^(\w+)$/);
      if (!mm) throw new Error(`bad named import: ${s}`);
      return { name: mm[1], as: mm[2] || mm[1] };
    });
    const before = c.slice(0, c.indexOf('{')).replace(/,\s*$/, '').trim();
    if (before) defaultName = before;
  } else {
    defaultName = c;
  }
  return { defaultName, named, namespace: null };
}

function stripImports(src) {
  return src.replace(/import\s+[\s\S]*?\s+from\s+["'][^"']+["'](?:\s+with\s*\{[^}]*\})?\s*;?\s*/g, '');
}

/**
 * Rewrite export forms and collect exported binding names.
 * Returns { body, exports: string[] }.
 */
function stripExports(src) {
  const exports = new Set();
  let body = src;

  // export function name / export async function name
  body = body.replace(/^export\s+(async\s+)?function\s+(\w+)/gm, (_, async, name) => {
    exports.add(name);
    return `${async || ''}function ${name}`;
  });

  // export class Name
  body = body.replace(/^export\s+class\s+(\w+)/gm, (_, name) => {
    exports.add(name);
    return `class ${name}`;
  });

  // export const/let/var name = ...  (one binding per decl; good enough here)
  body = body.replace(/^export\s+(const|let|var)\s+(\w+)/gm, (_, kind, name) => {
    exports.add(name);
    return `${kind} ${name}`;
  });

  // export { a, b as c };
  body = body.replace(/^export\s*\{([^}]+)\}\s*;?/gm, (_, inner) => {
    for (const part of inner.split(',')) {
      const s = part.trim();
      if (!s) continue;
      const mm = s.match(/^(\w+)\s+as\s+(\w+)$/) || s.match(/^(\w+)$/);
      if (!mm) throw new Error(`bad export list item: ${s}`);
      exports.add(mm[2] || mm[1]);
      // If `as`, the local name is mm[1] and export name is mm[2] —
      // factory return uses export name = local name.
      if (mm[2] && mm[2] !== mm[1]) {
        // keep a rewrite note via a synthetic const after — handled in return map
      }
    }
    return `/* export list: ${inner.trim()} */`;
  });

  // export default — unused in this repo; refuse loudly if it appears
  if (/^export\s+default\b/m.test(body)) {
    throw new Error('build-singlefile: export default is not supported');
  }

  return { body, exports: [...exports] };
}

/** Parse export { a as b } rename map from original source. */
function exportAliases(src) {
  const map = new Map(); // exportName -> localName
  const re = /^export\s*\{([^}]+)\}\s*;?/gm;
  let m;
  while ((m = re.exec(src))) {
    for (const part of m[1].split(',')) {
      const s = part.trim();
      if (!s) continue;
      const mm = s.match(/^(\w+)\s+as\s+(\w+)$/);
      if (mm) map.set(mm[2], mm[1]);
      else {
        const one = s.match(/^(\w+)$/);
        if (one) map.set(one[1], one[1]);
      }
    }
  }
  return map;
}

function walkGraph(entryRel) {
  const order = []; // topological: deps before dependents
  const visiting = new Set();
  const visited = new Set();
  const jsonFiles = new Set();
  const jsFiles = new Map(); // id -> { abs, src, imports }

  function visit(rel) {
    if (visited.has(rel)) return;
    if (visiting.has(rel)) throw new Error(`cycle at ${rel}`);
    visiting.add(rel);
    const abs = resolve(ROOT, rel);
    if (!existsSync(abs)) throw new Error(`missing module: ${rel}`);
    if (rel.endsWith('.json')) {
      jsonFiles.add(rel);
      visiting.delete(rel);
      visited.add(rel);
      return;
    }
    const src = readFileSync(abs, 'utf8');
    guardUnsupportedImportForms(rel, src);
    const imports = findImports(src);
    jsFiles.set(rel, { abs, src, imports });
    for (const imp of imports) {
      const depAbs = resolveSpec(abs, imp.spec);
      const depRel = relId(depAbs);
      visit(depRel);
    }
    visiting.delete(rel);
    visited.add(rel);
    order.push(rel);
  }

  visit(entryRel);
  guardOrphanModules(jsFiles);
  return { order, jsFiles, jsonFiles: [...jsonFiles] };
}

/**
 * HARDENING (2026-08-09, operator-approved): the import scanner is a regex, and a
 * regex scanner FAILS SILENTLY — an import form it doesn't recognize means a module
 * quietly never reaches the bundle, which ships a blank/broken page on a green suite
 * (the exact class that bit Innsmouth's M-a build twice). Two guards:
 * 1. guardUnsupportedImportForms: any import syntax findImports() cannot parse
 *    (dynamic import(), `export ... from` re-exports, bare side-effect imports)
 *    fails the build LOUDLY instead of being dropped.
 * 2. guardOrphanModules: every .js file under src/ must be reachable from the entry
 *    graph — a freshly-written module nobody imported yet is a build error, not a
 *    silent omission. Deliberate exclusions go in ORPHAN_ALLOWLIST with a reason.
 */
function guardUnsupportedImportForms(rel, src) {
  const stripped = src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[ \t]*\/\/.*$/gm, '');
  const offenders = [];
  if (/\bimport\s*\(/.test(stripped)) offenders.push('dynamic import()');
  if (/\bexport\s+(?:\*|\{[^}]*\})\s+from\s+["']/.test(stripped)) offenders.push('re-export (`export ... from`)');
  if (/^\s*import\s+["'][^"']+["']\s*;?\s*$/m.test(stripped)) offenders.push('bare side-effect import');
  if (offenders.length) {
    throw new Error(
      `build-singlefile: ${rel} uses import forms the bundler's scanner cannot follow ` +
      `(${offenders.join(', ')}). These would be SILENTLY DROPPED from the bundle. ` +
      `Rewrite as static named/default imports, or extend findImports() deliberately.`
    );
  }
}

const ORPHAN_ALLOWLIST = new Set([
  // rel path -> add with a one-line reason when a src module is deliberately unbundled
]);

function guardOrphanModules(jsFiles) {
  const found = [];
  (function walk(dir) {
    for (const name of readdirSync(dir)) {
      const abs = resolve(dir, name);
      if (statSync(abs).isDirectory()) walk(abs);
      else if (name.endsWith('.js')) found.push(relative(ROOT, abs).split('\\').join('/'));
    }
  })(resolve(ROOT, 'src'));
  const orphans = found.filter((rel) => !jsFiles.has(rel) && !ORPHAN_ALLOWLIST.has(rel));
  if (orphans.length) {
    throw new Error(
      `build-singlefile: ${orphans.length} module(s) under src/ are not reachable from ` +
      `${ENTRY} and would ship NOWHERE: ${orphans.join(', ')}. Import them or add to ` +
      `ORPHAN_ALLOWLIST with a reason.`
    );
  }
}

function bindingPrelude(fromRel, imports, jsonSet) {
  const lines = [];
  const fromAbs = resolve(ROOT, fromRel);
  for (const imp of imports) {
    const depRel = relId(resolveSpec(fromAbs, imp.spec));
    const parsed = parseClause(imp.clause);
    if (jsonSet.has(depRel) || depRel.endsWith('.json')) {
      if (!parsed.defaultName) throw new Error(`JSON import needs default binding: ${fromRel} <- ${depRel}`);
      lines.push(`const ${parsed.defaultName} = __DATA[${JSON.stringify(depRel)}];`);
      continue;
    }
    if (parsed.namespace) {
      lines.push(`const ${parsed.namespace} = __M[${JSON.stringify(depRel)}];`);
      continue;
    }
    const parts = [];
    if (parsed.defaultName) {
      // no default exports in this codebase — refuse
      throw new Error(`JS default import unsupported: ${fromRel} <- ${depRel}`);
    }
    if (parsed.named.length) {
      const dest = parsed.named.map((n) => (n.name === n.as ? n.name : `${n.name}: ${n.as}`)).join(', ');
      lines.push(`const { ${dest} } = __M[${JSON.stringify(depRel)}];`);
    }
  }
  return lines.join('\n');
}

function factoryFor(rel, record, jsonSet) {
  const aliases = exportAliases(record.src);
  const withoutImp = stripImports(record.src);
  const { body, exports: exportNames } = stripExports(withoutImp);
  // Merge alias export names
  for (const [exp, loc] of aliases) {
    if (!exportNames.includes(exp)) exportNames.push(exp);
  }
  const prelude = bindingPrelude(rel, record.imports, jsonSet);
  const returnProps = exportNames.map((name) => {
    const local = aliases.get(name) || name;
    return local === name ? name : `${name}: ${local}`;
  });
  return `
__M[${JSON.stringify(rel)}] = (function () {
${prelude}
${body}
return { ${returnProps.join(', ')} };
})();
`.trim();
}

function extractCss(html) {
  const m = html.match(/<style>([\s\S]*?)<\/style>/i);
  return m ? m[1].trim() : '';
}

function extractBody(html) {
  const m = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  if (!m) throw new Error('index.html: no <body>');
  // Drop the module script tag; keep the rest of the shell.
  return m[1].replace(/<script\b[\s\S]*?<\/script>/gi, '').trim();
}

/**
 * Build the single-file artifact.
 * @param {{ write?: boolean, outPath?: string }} [opts]
 * @returns {{ html: string, js: string, outPath: string, modules: string[] }}
 */
export function buildSinglefile(opts = {}) {
  const { order, jsFiles, jsonFiles } = walkGraph(ENTRY);
  const jsonSet = new Set(jsonFiles);

  const dataBlocks = jsonFiles.map((rel) => {
    const raw = readFileSync(resolve(ROOT, rel), 'utf8');
    // Validate JSON then re-emit compact.
    const parsed = JSON.parse(raw);
    return `__DATA[${JSON.stringify(rel)}] = ${JSON.stringify(parsed)};`;
  });

  const factories = order.map((rel) => factoryFor(rel, jsFiles.get(rel), jsonSet));

  const js = `/* chapel-perilous single-file bundle — generated by scripts/build-singlefile.mjs */
(function () {
"use strict";
var __DATA = Object.create(null);
var __M = Object.create(null);
${dataBlocks.join('\n')}
${factories.join('\n\n')}
globalThis.__CHP = __M[${JSON.stringify(ENTRY)}];
})();
`;

  // Sanity: no remaining ESM keywords as statements.
  if (/^\s*import\s/m.test(js) || /(?:^|\n)\s*export\s/m.test(js)) {
    throw new Error('build-singlefile: import/export survived the transform');
  }

  const indexHtml = readFileSync(resolve(ROOT, 'index.html'), 'utf8');
  const css = extractCss(indexHtml);
  const body = extractBody(indexHtml);

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Chapel Perilous</title>
  <meta name="description" content="A first-person grid dungeon crawler set in Illuminatus!-trilogy conspiracy static. A recovered operations manual, playable in the browser." />
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="Chapel Perilous" />
  <meta property="og:title" content="Chapel Perilous" />
  <meta property="og:description" content="A first-person grid dungeon crawler set in Illuminatus!-trilogy conspiracy static. A recovered operations manual, playable in the browser." />
  <meta property="og:url" content="https://lerugray.github.io/chp-preview/" />
  <meta property="og:image" content="https://lerugray.github.io/chp-preview/og.png" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="Chapel Perilous" />
  <meta name="twitter:description" content="A first-person grid dungeon crawler set in Illuminatus!-trilogy conspiracy static. Playable in the browser." />
  <meta name="twitter:image" content="https://lerugray.github.io/chp-preview/og.png" />
  <style>
${css}
  </style>
</head>
<body>
${body}
<script>
${js}
</script>
</body>
</html>
`;

  const outPath = resolve(ROOT, opts.outPath || OUT);
  if (opts.write !== false) writeFileSync(outPath, html, 'utf8');
  return { html, js, outPath, modules: order, jsonFiles };
}

const isMain = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (isMain) {
  const { outPath, modules, jsonFiles } = buildSinglefile({ write: true });
  console.log(`wrote ${relId(outPath)} (${modules.length} modules, ${jsonFiles.length} json)`);
}
