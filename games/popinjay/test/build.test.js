// build.test.js — the single-file build must produce a syntactically valid, inlined
// bundle with no leftover module syntax (hard rule 7). We validate the bundle by
// running `node --check` on the extracted script — that catches a bad strip (stray
// import/export → syntax error) without needing a browser.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { buildBundle } from '../scripts/build.js';

test('build produces a bundle with all modules and no stray module syntax', () => {
  const { files, bundle, html } = buildBundle();
  // app.js is the entry and must be last (dependents after dependencies).
  assert.ok(files[files.length - 1].endsWith('app.js'));
  assert.ok(files.some((f) => f.endsWith('title.js')));
  assert.ok(files.some((f) => f.endsWith('fontData.js')), 'vendored period fonts are in the offline bundle');
  // M5 wired the House Band: band.js + score.js are now in the app graph (audio).
  assert.ok(files.some((f) => f.endsWith('band.js')), 'band.js is in the graph (audio wired)');
  assert.ok(files.some((f) => f.endsWith('score.js')), 'score.js is in the graph (the register)');
  assert.ok(files.some((f) => f.endsWith('input.js')), 'input.js is in the graph (keyboard+gamepad)');

  // No import/export statement should survive at line start in the bundle.
  for (const line of bundle.split('\n')) {
    assert.doesNotMatch(line, /^\s*import\s+[^;]*\sfrom\s+['"]/, `stray import: ${line}`);
    assert.doesNotMatch(line, /^\s*export\s+(default\s+)?(function|const|let|class|var)\b/, `stray export: ${line}`);
  }

  // The HTML shell is bootable-shaped: one canvas, one inline module script.
  assert.match(html, /<canvas id="stage">/);
  assert.match(html, /<script type="module">/);
  assert.match(html, /POPINJAY/);
  assert.match(html, /data:font\/ttf;base64,/, 'font bytes are embedded; file:\/\/ never fetches typography');
});

test('the inlined bundle is syntactically valid JavaScript', () => {
  const { bundle } = buildBundle();
  const tmp = join(tmpdir(), `popinjay-bundle-${process.pid}.mjs`);
  writeFileSync(tmp, bundle);
  try {
    // Throws (non-zero exit) if the bundle has any syntax error.
    execFileSync(process.execPath, ['--check', tmp], { stdio: 'pipe' });
  } finally {
    rmSync(tmp, { force: true });
  }
});
