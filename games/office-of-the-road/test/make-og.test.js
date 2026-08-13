// make-og.test.js — verify the share card dimensions and provenance.
// Skip if playwright is not installed (the "skip-if-no-playwright" convention).

import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function dirname(path) {
  const sep = path.lastIndexOf('/');
  return sep === -1 ? '.' : path.slice(0, sep);
}

function parsePngDimensions(buffer) {
  // PNG IHDR: offset 16, 4-byte big-endian width then height.
  if (buffer.length < 24 || buffer[0] !== 0x89 || buffer[1] !== 0x50) {
    throw new Error('not a PNG');
  }
  const width = (buffer[16] << 24) | (buffer[17] << 16) | (buffer[18] << 8) | buffer[19];
  const height = (buffer[20] << 24) | (buffer[21] << 16) | (buffer[22] << 8) | buffer[23];
  return { width, height };
}

let hasPlaywright = false;
try {
  await import('playwright');
  hasPlaywright = true;
} catch {
  hasPlaywright = false;
}

test('make-og.mjs writes a 1200x630 og.png from shipped assets', { skip: !hasPlaywright }, async () => {
  const tmp = await mkdtemp(resolve(tmpdir(), 'oor-og-'));
  const out = resolve(tmp, 'og.png');
  const result = await new Promise((done, fail) => {
    execFile(process.execPath, [resolve(ROOT, 'scripts/make-og.mjs'), out], (error, stdout, stderr) => {
      if (error) return fail(Object.assign(error, { stdout, stderr }));
      done({ stdout, stderr });
    });
  });
  if (!existsSync(out)) {
    throw new Error(`og.png was not written. result=${JSON.stringify(result)}`);
  }
  const { stdout, stderr } = result;
  const header = await readFile(out);
  const dims = parsePngDimensions(header);
  assert.equal(dims.width, 1200, 'width must be 1200');
  assert.equal(dims.height, 630, 'height must be 630');
  await rm(tmp, { recursive: true, force: true });
});
