import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildBundleJS, buildHTML } from '../build.js';
import { Framebuffer } from '../src/gfx/framebuffer.js';
import { composeTitle } from '../src/scenes/title.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

// Runs the bundled single-file JS in this node process (no document/window, so the
// browser auto-boot is inert), then reaches into the bundle's module registry via the
// exposed __require. This proves the bundler's import/export transform is faithful:
// the bundled code must produce the exact same title frame as the ESM source.
function loadBundle() {
  const js = buildBundleJS({ expose: true });
  // Indirect eval in a fresh function scope; the IIFE publishes globalThis.__JQ.
  // eslint-disable-next-line no-new-func
  new Function(js)();
  const req = globalThis.__JQ;
  delete globalThis.__JQ;
  return req;
}

test('bundle evaluates without a DOM and exposes its module registry', () => {
  assert.doesNotThrow(() => {
    const req = loadBundle();
    assert.equal(typeof req, 'function');
  });
});

test('bundled modules resolve their imports (framebuffer + title present)', () => {
  const req = loadBundle();
  const fbMod = req('src/gfx/framebuffer.js');
  const titleMod = req('src/scenes/title.js');
  assert.equal(typeof fbMod.Framebuffer, 'function');
  assert.equal(typeof titleMod.composeTitle, 'function');
});

test('bundled composeTitle is byte-identical to the ESM source', () => {
  const req = loadBundle();
  const B = req('src/gfx/framebuffer.js').Framebuffer;
  const bundledCompose = req('src/scenes/title.js').composeTitle;

  const bundled = new B(200, 140);
  bundledCompose(bundled);

  const esm = new Framebuffer(200, 140);
  composeTitle(esm);

  assert.deepEqual(Array.from(bundled.data), Array.from(esm.data));
});

test('buildHTML emits a self-contained document with the inlined bundle', () => {
  const html = buildHTML();
  assert.match(html, /<!DOCTYPE html>/);
  assert.match(html, /id="jacquard"/);
  assert.match(html, /__register\(/);         // bundle inlined
  assert.doesNotMatch(html, /<script[^>]+src=/); // no external scripts (boot-anywhere)
  assert.doesNotMatch(html, /import\s+\{/);      // ES imports were transformed away
});

test('the boot entry is required last in the bundle', () => {
  const js = buildBundleJS();
  assert.match(js, /__require\("src\/boot\/browser\.js"\);\s*\}\)\(\);\s*$/);
});

test('build.js runs as a CLI from a path containing spaces and writes dist', () => {
  assert.match(ROOT, /\s/, 'regression fixture requires a repository path containing spaces');
  const stdout = execFileSync(process.execPath, [path.join(ROOT, 'build.js')], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  const outputPath = path.join(ROOT, 'dist', 'jacquard-index.html');
  assert.match(stdout, /^built dist\/jacquard-index\.html \([\d.]+ KB\)\n$/);
  assert.equal(readFileSync(outputPath, 'utf8'), buildHTML());
});
