// Static cold-package verification for the one-file file:// release artifact.

import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const distDir = resolve(root, 'dist');
const distFile = resolve(distDir, 'index.html');
const files = readdirSync(distDir).filter(name => !name.startsWith('.')).sort();
const html = readFileSync(distFile, 'utf8');

assert.deepEqual(files, ['index.html'], 'dist must contain one deliverable file');
assert.match(html, /^<!DOCTYPE html>/);
assert.match(html, /<title>LINES OF ADVANCE<\/title>/);
assert.match(html, /<meta name="description" content="A local operational board game/);
assert.match(html, /<div id="app"><\/div>/);
assert.match(html, /<style>[\s\S]+<\/style>/);
assert.doesNotMatch(html, /<script\b[^>]*\bsrc\s*=/i);
assert.doesNotMatch(html, /<link\b/i);
assert.doesNotMatch(html, /<img\b/i);
assert.doesNotMatch(html, /\burl\s*\(/i);
assert.doesNotMatch(html, /\bfetch\s*\(/i);
assert.doesNotMatch(html, /assets\//i);

const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)];
assert.equal(scripts.length, 1, 'dist must contain one inline script');
assert.doesNotThrow(() => new Function(scripts[0][1]), 'inline module must parse');

for (const seam of [
  'Hotseat',
  'Engine: North',
  'NATO counters',
  'Chess-like',
  'Save File',
  'Load File',
  'Walkthrough',
  'Copy debug log',
  'loa-debug-mirror-v1',
  'help-dialog',
  'Supported down to 720 CSS pixels wide',
  '@media (max-width: 900px)',
  'base-v1',
  'validateReleaseHooks'
]) {
  assert.ok(html.includes(seam), `dist is missing packaged surface: ${seam}`);
}

console.log(`Verified single-file package: ${distFile} (${Buffer.byteLength(html)} bytes)`);
