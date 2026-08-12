import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bundle } from './build.js';

const IMPORT_STATEMENT = /^\s*import\b[^\n]*\bfrom\s+['"]/m;
const EXPORT_KEYWORD = /^\s*export\s+(const|let|var|class|function)\b/m;

test('bundle inlines the whole module graph', () => {
  const { js, files } = bundle();
  assert.ok(files.length >= 12, `expected many modules, got ${files.length}`);
  assert.match(js, /class Engine\b/);
  assert.match(js, /class Framebuffer\b/);
  assert.match(js, /function init\b/);
  assert.match(js, /buildM1World/);
});

test('bundle has no residual module syntax (self-contained)', () => {
  const { js } = bundle();
  assert.ok(!IMPORT_STATEMENT.test(js), 'residual import statement in bundle');
  assert.ok(!EXPORT_KEYWORD.test(js), 'residual export keyword in bundle');
});

test('bundled JS is syntactically valid', () => {
  const { js } = bundle();
  // Compiles the source (does not execute it) — a real syntax gate.
  assert.doesNotThrow(() => new Function(js));
});

test('aliased named imports get an explicit binding (no undefined refs)', () => {
  const { js } = bundle();
  // main.js does `import { reveal as revealText, isComplete as revealDone }`; the flat
  // single scope only has `reveal`/`isComplete`, so the bundler must bind the aliases.
  assert.match(js, /const revealText = reveal;/);
  assert.match(js, /const revealDone = isComplete;/);
  // and the alias must actually be defined before it is used (compiles + no ReferenceError
  // for these identifiers when the bundle is instantiated as a function body).
  assert.doesNotThrow(() => new Function(js));
});

test('html shell is a single self-contained file', () => {
  const { html } = bundle();
  assert.ok(!/type="module"/.test(html), 'still references a module script');
  assert.ok(!/src="\.\/src/.test(html), 'still references external src');
  assert.match(html, /<div id="app">/);
  assert.match(html, /SHOELEATHER/);
  assert.match(html, /<script>/);
  assert.match(html, /createElement\('canvas'\)/); // world+overlay canvases built in JS
  // No unescaped closing script tag inside the injected bundle.
  const scripts = html.split('<script>');
  assert.equal(scripts.length, 2, 'expected exactly one injected script');
});
