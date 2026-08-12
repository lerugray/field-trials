import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

// scripts/make-og.mjs renders the share card in a real browser, so this test needs
// Playwright. Playwright is a dev-only tool here, not a runtime dependency, so the test
// skips when it is absent (the same convention the other games' browser gates use) and
// runs for real in the browser CI job, which installs Chromium.
let havePlaywright = true;
try {
  await import('playwright');
} catch {
  havePlaywright = false;
}

test('make-og writes a 1200 by 630 PNG', { skip: havePlaywright ? false : 'playwright not installed' }, async () => {
  const dir = await mkdtemp(join(tmpdir(), 'adversary-og-'));
  const out = join(dir, 'og.png');

  try {
    const run = spawnSync(process.execPath, [resolve('scripts/make-og.mjs'), out], {
      cwd: resolve('.'),
      encoding: 'utf8',
    });
    assert.equal(run.status, 0, run.stderr || run.stdout);

    const png = await readFile(out);
    assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
    assert.equal(png.readUInt32BE(16), 1200);
    assert.equal(png.readUInt32BE(20), 630);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
