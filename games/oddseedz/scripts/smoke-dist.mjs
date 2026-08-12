// smoke-dist — the headless boot check for the single-file artifact. Parses
// dist/index.html and asserts it is a self-contained, bootable page. Per the
// build law, a headless node parse counts as the boot check.

import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export async function smoke(path = resolve(ROOT, 'dist/game/index.html')) {
  const html = await readFile(path, 'utf8');
  const problems = [];

  const need = [
    ['<!DOCTYPE html>', 'doctype'],
    ['<canvas id="scene">', 'scene canvas'],
    ['id="phrase"', 'summon input'],
    ['id="summon"', 'summon button'],
    ['<script type="module">', 'inline module'],
    ['function summon', 'summon engine inlined'],
    ['function drawCreature', 'renderer inlined'],
    ['function boot', 'app boot inlined'],
    ['function resolveWeek', 'raising engine inlined'],
    ['function endWeek', 'week planner inlined'],
    ['id="plan"', 'planner bar'],
    ['SPECIES', 'roster inlined'],
    ['function moodOf', 'mood engine inlined'],
    ['function interact', 'care engine inlined'],
    ['function renderRoom', 'toy room inlined'],
    ['data-snack', 'snack tray inlined'],
    ['data-buytoy', 'toybox inlined'],
    ['function stepBattle', 'battle engine inlined'],
    ['function openBattle', 'battle UI inlined'],
    ['id="battle"', 'battle overlay'],
    ['data-move', 'battle command row inlined'],
    ['function battleTellView', 'battle tell presenter inlined'],
    ['data-tell', 'pre-command enemy tell inlined'],
    ['function resolveEntry', 'career/ladder engine inlined'],
    ['function advanceCalendar', 'mandatory-meet calendar inlined'],
    ['function renderCareer', 'career panel inlined'],
    ['career-log', 'career battle/prize log inlined'],
  ];
  for (const [needle, label] of need) {
    if (!html.includes(needle)) problems.push(`missing ${label}`);
  }

  // must be self-contained: no external fetches of any kind
  if (/\ssrc\s*=\s*["'][^"']+["']/.test(html)) problems.push('has a src= reference');
  if (/\shref\s*=\s*["']https?:/.test(html)) problems.push('has an external href');
  if (/https?:\/\/(?!www\.w3\.org)/.test(html)) problems.push('has a network URL');
  if (/^\s*import\s+[^;]*?from/m.test(html)) problems.push('has an unresolved import');

  // roster integrity should survive bundling: all five rarity strings present
  for (const r of ['common', 'uncommon', 'rare', 'epic', 'legendary']) {
    if (!html.includes(`'${r}'`)) problems.push(`rarity ${r} missing from bundle`);
  }

  return { ok: problems.length === 0, problems, bytes: Buffer.byteLength(html) };
}

// Allow `node scripts/smoke-dist.mjs` as a CLI.
if (import.meta.url === `file://${process.argv[1]}`) {
  const res = await smoke();
  if (!res.ok) {
    console.error('smoke FAILED:', res.problems.join('; '));
    process.exit(1);
  }
  console.log(`smoke OK — dist/game/index.html self-contained (${(res.bytes / 1024).toFixed(1)} kB)`);
}
