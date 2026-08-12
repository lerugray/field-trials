import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import { smoke } from '../scripts/smoke-dist.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

test('build produces a self-contained, bootable game and a Pages wrapper', async () => {
  // rebuild from source so the test always checks current code, not a stale dist
  execFileSync('node', ['scripts/build-singlefile.mjs'], { cwd: ROOT, stdio: 'pipe' });

  const game = resolve(ROOT, 'dist/game/index.html');
  const gameRes = await smoke(game);
  assert.ok(gameRes.ok, 'game smoke problems: ' + gameRes.problems.join('; '));
  assert.ok(gameRes.bytes > 8000, 'game artifact suspiciously small');

  const wrapper = resolve(ROOT, 'dist/index.html');
  const wrapperHtml = await readFile(wrapper, 'utf8');
  assert.ok(wrapperHtml.includes('<iframe'), 'wrapper missing iframe');
  assert.ok(wrapperHtml.includes("'/game/'"), 'wrapper iframe target is not /game/');
  assert.ok(wrapperHtml.includes('CANNOT LOAD'), 'wrapper missing loud failure message');
});
