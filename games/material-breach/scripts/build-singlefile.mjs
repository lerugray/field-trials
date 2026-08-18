// build-singlefile.mjs — the single-file assembler (DESIGN-SEED §5). Bundles the ES-module source
// graph reachable from src/boot.js into one dist/index.html with ZERO external fetches, so the
// game boots from a file:// double-click with no server and no network.
//
// It is a tiny module registry, not a strip-and-concat: each module keeps its own scope, so import
// aliases and same-named exports across modules are handled correctly, and a duplicate module id or
// an unresolved import fails LOUDLY at build time (hard rule: no silent failures).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'src');
const ENTRY = 'boot';

// Parse `import ... from './x.js'` into a CommonJS destructuring against require('x').
function transformImport(clause, id) {
  clause = clause.trim();
  // import * as ns from './x.js'
  let m = clause.match(/^\*\s+as\s+([A-Za-z0-9_$]+)$/);
  if (m) return `const ${m[1]} = require('${id}');`;
  // import { a, b as c } from './x.js'
  m = clause.match(/^\{([^}]*)\}$/);
  if (m) {
    const parts = m[1]
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => {
        const as = s.match(/^([A-Za-z0-9_$]+)\s+as\s+([A-Za-z0-9_$]+)$/);
        return as ? `${as[1]}: ${as[2]}` : s;
      });
    return `const { ${parts.join(', ')} } = require('${id}');`;
  }
  // import Foo from './x.js'  (default)
  m = clause.match(/^([A-Za-z0-9_$]+)$/);
  if (m) return `const ${m[1]} = require('${id}').default;`;
  throw new Error(`build: unhandled import clause "${clause}"`);
}

// Transform one module's ESM source into a registry factory body, collecting its exports.
function transformModule(source) {
  const exportNames = new Set();
  let out = source;

  // import ... from './x.js';  ->  const ... = require('x');
  out = out.replace(
    /^\s*import\s+([^;]+?)\s+from\s+['"]\.\/([A-Za-z0-9_$-]+)\.js['"];?\s*$/gm,
    (_all, clause, file) => transformImport(clause, file),
  );
  // Bare `import './x.js';` (side-effect import) -> require('x');
  out = out.replace(/^\s*import\s+['"]\.\/([A-Za-z0-9_$-]+)\.js['"];?\s*$/gm, (_all, file) => `require('${file}');`);

  // export function/const/let/class NAME  ->  drop `export `, remember NAME.
  out = out.replace(/^export\s+(function|const|let|class)\s+([A-Za-z0-9_$]+)/gm, (_all, kw, name) => {
    exportNames.add(name);
    return `${kw} ${name}`;
  });
  // export { a, b as c };  ->  remove line, remember exported bindings (under their local names).
  out = out.replace(/^export\s*\{([^}]*)\}\s*;?\s*$/gm, (_all, list) => {
    for (const item of list.split(',').map((s) => s.trim()).filter(Boolean)) {
      const as = item.match(/^([A-Za-z0-9_$]+)\s+as\s+([A-Za-z0-9_$]+)$/);
      if (as) exportNames.add(`${as[2]}=${as[1]}`); // exportedName=localName
      else exportNames.add(item);
    }
    return '';
  });

  // Append the export assignments so both consts and hoisted functions are bound by module end.
  const assigns = [...exportNames]
    .map((n) => {
      if (n.includes('=')) {
        const [exported, local] = n.split('=');
        return `exports.${exported} = ${local};`;
      }
      return `exports.${n} = ${n};`;
    })
    .join('\n');

  return `${out}\n${assigns}\n`;
}

// Resolve the reachable module graph from the entry, following only local ./x.js imports.
function collectModules(entryId) {
  const modules = new Map(); // id -> transformed body
  const stack = [entryId];
  while (stack.length) {
    const id = stack.pop();
    if (modules.has(id)) continue;
    let source;
    try {
      source = readFileSync(join(SRC, `${id}.js`), 'utf8');
    } catch {
      throw new Error(`build: cannot resolve module '${id}.js' in src/`);
    }
    modules.set(id, transformModule(source));
    const importRe = /import\s+(?:[^;]+?\s+from\s+)?['"]\.\/([A-Za-z0-9_$-]+)\.js['"]/g;
    let m;
    while ((m = importRe.exec(source))) stack.push(m[1]);
  }
  return modules;
}

function assembleScript(modules) {
  const parts = [];
  parts.push('(function(){');
  parts.push('"use strict";');
  parts.push('const __mods = {};');
  parts.push('const __cache = {};');
  parts.push('function require(id){');
  parts.push('  if (__cache[id]) return __cache[id].exports;');
  parts.push('  const module = { exports: {} };');
  parts.push('  __cache[id] = module;');
  parts.push('  if (!__mods[id]) throw new Error("module not found: " + id);');
  parts.push('  __mods[id](module, module.exports, require);');
  parts.push('  return module.exports;');
  parts.push('}');
  for (const [id, body] of modules) {
    parts.push(`__mods[${JSON.stringify(id)}] = function(module, exports, require){`);
    parts.push(body);
    parts.push('};');
  }
  parts.push(`require(${JSON.stringify(ENTRY)});`);
  parts.push('})();');
  return parts.join('\n');
}

// The two type faces, inlined as base64 @font-face rules. They MUST be embedded rather than
// linked: dist/index.html boots from a file:// double-click with no server and no network, so a
// face referenced by path would silently fall back and the whole document register would be lost
// without an error ever being raised. Both are CC0 (Not Jam Font Pack); the licence ships in
// ATTRIBUTION, which is itself embedded below.
const FACES = [
  { family: 'MB Serif', file: 'NotJamSerif11.ttf' },
  { family: 'MB Slab', file: 'NotJamSlabSerif11.ttf' },
];

function fontFaceBlock() {
  return FACES.map(({ family, file }) => {
    const path = join(ROOT, 'assets', 'fonts', file);
    let b64;
    try {
      b64 = readFileSync(path).toString('base64');
    } catch {
      // Loud, never silent: a missing face is a build failure, because the fallback would ship a
      // game that looks nothing like the one that was reviewed.
      throw new Error(`build: cannot read embedded font '${file}' at ${path}`);
    }
    return `@font-face {\n    font-family: "${family}";\n    src: url(data:font/ttf;base64,${b64}) format("truetype");\n    font-display: block;\n  }`;
  }).join('\n  ');
}

function attributionBlock() {
  // ATTRIBUTION ships inside the built artifact (collection contract item 9), and from M7a it
  // carries the cast rows and the font licence, both of which are conditions of use.
  try {
    const attribution = readFileSync(join(ROOT, 'ATTRIBUTION.md'), 'utf8');
    let licence = '';
    try {
      licence = `\n\n--- Not Jam Font Pack, CC0 1.0 licence text, as shipped in the pack ---\n\n${readFileSync(
        join(ROOT, 'assets', 'fonts', 'LICENCE-NotJamFontPack-CC0.txt'),
        'utf8',
      )}`;
    } catch {
      throw new Error('build: the embedded fonts ship without their licence text');
    }
    return attribution + licence;
  } catch (err) {
    if (String(err.message).startsWith('build:')) throw err;
    return 'ATTRIBUTION unavailable at build time.';
  }
}

function buildHtml(script) {
  const attribution = attributionBlock().replace(/-->/g, '--&gt;');
  const ogTitle = 'MATERIAL BREACH';
  // One in-register share line: institutional, defensive, and numeric.
  const ogDescription = 'Facility manager simulation: excavate, pay wages, answer notices, then file the closing report. 1 record filed.';
  const ogUrl = 'https://lerugray.github.io/field-trials/material-breach/';
  const ogImage = 'https://lerugray.github.io/field-trials/material-breach/og-card.png';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${ogTitle}</title>
<meta property="og:type" content="website" />
<meta property="og:site_name" content="Ray Weiss" />
<meta property="og:title" content="${ogTitle}" />
<meta property="og:description" content="${ogDescription}" />
<meta property="og:url" content="${ogUrl}" />
<meta property="og:image" content="${ogImage}" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${ogTitle}" />
<meta name="twitter:description" content="${ogDescription}" />
<meta name="twitter:image" content="${ogImage}" />
<!--
ATTRIBUTION (ships inside the artifact, collection contract v0 item 9):
${attribution}
-->
<style>
  ${fontFaceBlock()}
  html, body { margin: 0; height: 100%; background: #0b0b0e; overflow: hidden; }
  body { display: flex; align-items: center; justify-content: center; }
  #screen {
    image-rendering: pixelated;
    image-rendering: crisp-edges;
    display: block;
    background: #14141b;
  }
  #text {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    pointer-events: none;
    display: block;
  }
</style>
</head>
<body>
<canvas id="screen" width="640" height="360"></canvas>
<canvas id="text"></canvas>
<script>
${script}
</script>
</body>
</html>
`;
}

function main() {
  const modules = collectModules(ENTRY);
  const script = assembleScript(modules);
  const html = buildHtml(script);
  const outDir = join(ROOT, 'dist');
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, 'index.html');
  writeFileSync(outPath, html, 'utf8');
  const kb = (Buffer.byteLength(html, 'utf8') / 1024).toFixed(1);
  // eslint-disable-next-line no-console
  console.log(`built ${outPath} (${modules.size} modules, ${kb} KB)`);
}

main();
