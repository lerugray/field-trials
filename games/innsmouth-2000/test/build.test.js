// Guards the single-file build's hand-maintained module list.
//
// scripts/build.js concatenates src/ modules in a hand-written dependency order. A module left off
// that list is silently dropped from the bundle: `node scripts/build.js` still reports success,
// `node --test` stays green (it imports the real modules, not the bundle), and only the built page
// dies, blank, on its first missing symbol. The Playwright gate in browser-gate.test.js catches it
// but is skipped wherever Playwright is absent, so this pure test is the always-on net.
//
// It cost a real blank build to learn: src/water.js (M-a) was written, imported, tested and shipped
// to dist without ever being added to the list.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { MODULES, buildBundle } from '../scripts/build.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function buildModuleList() { return MODULES; }

test('every src module is inlined by the single-file build, exactly once', () => {
  const listed = buildModuleList();
  const onDisk = readdirSync(join(ROOT, 'src'))
    .filter((f) => f.endsWith('.js'))
    .map((f) => `src/${f}`)
    .sort();

  const missing = onDisk.filter((m) => !listed.includes(m));
  assert.deepEqual(missing, [],
    `these modules exist in src/ but are not in scripts/build.js MODULES, so the built page would \
be missing their symbols: ${missing.join(', ')}`);

  const stale = listed.filter((m) => !onDisk.includes(m));
  assert.deepEqual(stale, [], `scripts/build.js lists modules that no longer exist: ${stale.join(', ')}`);

  assert.equal(new Set(listed).size, listed.length, 'a module is listed twice in the build');
});

// The strongest of the three: assemble the real bundle from src/ and parse it. Every module lands
// in ONE shared scope, so two modules declaring the same top-level name is a fatal redeclaration
// that kills the whole page. It shipped once: water.js and power.js each had a private `const NB`,
// and the built page was blank with no console output at all. Parsing from src/ (not from dist/)
// means an un-rebuilt dist cannot hide the fault.
test('the assembled single-file bundle parses as one script', () => {
  const bundle = buildBundle();
  try {
    new Function(bundle); // eslint-disable-line no-new-func
  } catch (err) {
    assert.fail(
      `the single-file bundle does not parse, so the built page would be blank: ${err.message}. `
      + 'A duplicate identifier means two src modules declare the same top-level name; the build '
      + 'flattens them into one scope, so rename one.',
    );
  }
});

test('the build lists each module after the modules it imports from', () => {
  const listed = buildModuleList();
  const position = new Map(listed.map((m, i) => [m, i]));
  for (const rel of listed) {
    const code = readFileSync(join(ROOT, rel), 'utf8');
    // Our own imports are always relative: `from './water.js'`.
    for (const m of code.matchAll(/from\s+'\.\/([^']+)'/g)) {
      const dep = `src/${m[1]}`;
      if (!position.has(dep)) continue; // covered by the completeness test above
      assert.ok(position.get(dep) < position.get(rel),
        `${rel} imports ${dep}, so ${dep} must come earlier in scripts/build.js MODULES `
        + `(now ${position.get(dep)} vs ${position.get(rel)})`);
    }
  }
});

// --- M-b additions to the guard -------------------------------------------------------------
// Everything above was written after a blank dist. These three were written after finding what that
// round of guards still could not see.

// Every top-level name declared in src/ must be declared in exactly ONE module.
//
// The parse test above catches a duplicate const/let/class, because those are a fatal redeclaration.
// It CANNOT catch a duplicate top-level FUNCTION: two identical `function clamp(...)` declarations in
// one scope are perfectly legal, the bundle parses, the page boots, and the LAST one declared wins
// for every caller in every module. node --test never sees it, because there each module keeps its
// own scope. So the built page and the suite quietly execute different code.
//
// Found live when this test was written: `clamp` was declared privately in camera.js, gods.js AND
// sim.js; `waterWithin` in gods.js and disasters.js; `isWaterTerrain` in mapgen.js, sim.js and (as an
// export) tools.js. All byte-identical, so nothing was broken -- but sim.js being last meant every
// call to isWaterTerrain in the BUNDLE, tools.js's own included, ran sim.js's private copy. One
// divergent edit to any of them and the built game would have behaved differently from its own green
// test suite, with no error anywhere. The duplicates were consolidated into tools.js exports; this
// test is what stops them coming back.
test('no top-level name is declared by two src modules', () => {
  const declarations = new Map(); // name -> [module, ...]
  for (const rel of buildModuleList()) {
    const code = readFileSync(join(ROOT, rel), 'utf8');
    const re = /^(?:export\s+)?(?:const|let|class|function|async function)\s+([A-Za-z_$][\w$]*)/gm;
    for (const m of code.matchAll(re)) {
      if (!declarations.has(m[1])) declarations.set(m[1], []);
      const where = declarations.get(m[1]);
      if (!where.includes(rel)) where.push(rel);
    }
  }
  const clashes = [...declarations.entries()]
    .filter(([, where]) => where.length > 1)
    .map(([name, where]) => `${name} (${where.join(', ')})`);
  assert.deepEqual(clashes, [],
    'the single-file build flattens every module into ONE scope, so these names collide there: '
    + `${clashes.join('; ')}. A duplicate const/let/class is a fatal redeclaration (the page goes `
    + 'blank); a duplicate function silently overrides, and the built page then runs different code '
    + 'from this test suite. Move the shared one into a module both can import.');
});

// Every symbol a module EXPORTS must survive into the bundle as a declaration. This is belt and
// braces over the module-list test: that one proves the file is listed, this one proves the stripper
// actually left its public symbols behind, and it names the missing symbol rather than leaving the
// built page to die on it.
test('every exported symbol from every module survives into the bundle', () => {
  const bundle = buildBundle();
  const missing = [];
  // Deliberately walks src/ ON DISK, not MODULES: a module dropped from the list would otherwise be
  // skipped by this check as well as by the bundle (caught when plant-testing this guard).
  const onDisk = readdirSync(join(ROOT, 'src')).filter((f) => f.endsWith('.js')).map((f) => `src/${f}`);
  for (const rel of onDisk) {
    const code = readFileSync(join(ROOT, rel), 'utf8');
    for (const m of code.matchAll(/^export\s+(?:const|let|class|function|async function)\s+([A-Za-z_$][\w$]*)/gm)) {
      const name = m[1];
      const declared = new RegExp(`^\\s*(?:const|let|class|function|async function)\\s+${name}\\b`, 'm');
      if (!declared.test(bundle)) missing.push(`${rel}:${name}`);
    }
  }
  assert.deepEqual(missing, [],
    `these exported symbols are missing from the assembled bundle: ${missing.join(', ')}`);
});

// No module syntax may survive the strip. `import`/`export` inside the IIFE is a SyntaxError, so the
// parse test would also fail on this, but only with a position; this names the offending line, which
// matters because the stripper's regexes are shape-sensitive and M-b introduced multi-line import
// blocks in three modules.
test('the bundle carries no leftover import or export syntax', () => {
  const bundle = buildBundle();
  const offenders = bundle
    .split('\n')
    .map((line, i) => ({ line, n: i + 1 }))
    .filter(({ line }) => /^\s*import\s/.test(line) || /^\s*export\s/.test(line)
      || /^\s*export\s*\{/.test(line))
    .map(({ line, n }) => `line ${n}: ${line.trim().slice(0, 80)}`);
  assert.deepEqual(offenders, [],
    `stripModuleSyntax left module syntax in the bundle:\n  ${offenders.join('\n  ')}`);
});
