import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { bundleModules, buildHtml } from '../scripts/build.js';

function sourceFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? sourceFiles(path) : entry.name.endsWith('.js') ? [path] : [];
  });
}

test('build: bundle contains no leftover module syntax', () => {
  const bundle = bundleModules();
  assert.doesNotMatch(bundle, /^\s*import\s/m);
  assert.doesNotMatch(bundle, /^\s*export\s/m);
});

test('build: bundle parses as valid JavaScript (browser globals resolve at runtime)', () => {
  const bundle = bundleModules();
  // new Function() parses without executing — browser globals (window, document) are not needed
  // to validate syntax. Throws SyntaxError if the strip/concat produced invalid code.
  assert.doesNotThrow(() => new Function(bundle));
});

test('build: html shell has the canvas and inlines the bundle', () => {
  const html = buildHtml();
  assert.match(html, /<canvas id="screen">/);
  assert.match(html, /image-rendering: pixelated/);
  assert.match(html, /ADVERSARY/);
  // Key substrate symbols made it in as DEFINITIONS (not merely call sites) — guards against a
  // module being dropped from the bundle list, which the runtime smoke once caught the hard way.
  for (const sym of ['createFixedStepper', 'createRng', 'resolveActions', 'createRenderer', 'parseSprite', 'createInputState', 'createKit', 'decideMelee', 'createProjectile', 'createStage']) {
    assert.match(html, new RegExp(`(function|const)\\s+${sym}\\b`), `bundle missing definition of ${sym}`);
  }
});

test('build: source render path contains no anti-aliased canvas text calls', () => {
  for (const file of sourceFiles(fileURLToPath(new URL('../src', import.meta.url)))) {
    const source = readFileSync(file, 'utf8');
    assert.doesNotMatch(source, /fillText/, `${file} must use the bitmap pixel font`);
    assert.doesNotMatch(source, /ctx\.font\s*=/, `${file} has a dead canvas font assignment`);
  }
});
