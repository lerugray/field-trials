#!/usr/bin/env node
// GATE 7b — layout probe over live rendered frames. Uses the game's own
// layoutProbe() bboxes (Playwright Chromium) to catch text-vs-text and
// text-vs-control collisions that catalog width checks cannot see.

import { spawnSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const probe = spawnSync('python3', [resolve(ROOT, 'scripts/layout-gate-probe.py')], {
  cwd: ROOT,
  encoding: 'utf8',
});

if (probe.stdout) process.stdout.write(probe.stdout);
if (probe.stderr) process.stderr.write(probe.stderr);

if (probe.status !== 0) {
  console.error('LAYOUT GATE FAILED');
  process.exit(probe.status == null ? 1 : probe.status);
}

console.log('LAYOUT GATE PASSED');
process.exit(0);
