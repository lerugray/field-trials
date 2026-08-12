// SHOELEATHER — headless acceptance soak (M3).
//
// Builds the single-file game, then drives a WIN path and a LOSS path through it in a
// REAL headless browser (chrome-headless-shell --dump-dom). The in-page soak hook
// (?soak=win|loss) runs the flow with real DOM events and writes a #soak-result marker;
// this runner dumps the DOM and checks each marker reads "OK errors=0". Exits non-zero
// on any failure so it can gate a milestone.
//
// Usage: node scripts/soak.mjs

import { execFileSync } from 'node:child_process';
import { readdirSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BUILD = join(ROOT, 'dist', 'shoeleather.html');

function findChrome() {
  if (process.env.SOAK_CHROME && existsSync(process.env.SOAK_CHROME)) return process.env.SOAK_CHROME;
  const caches = [
    join(process.env.HOME || '', '.cache', 'ms-playwright'),
    join(process.env.HOME || '', 'Library', 'Caches', 'ms-playwright'),
  ];
  for (const cache of caches) {
    if (!existsSync(cache)) continue;
    const dirs = readdirSync(cache).filter((d) => d.startsWith('chromium_headless_shell') || d.startsWith('chromium-'));
    dirs.sort().reverse(); // newest revision first
    for (const d of dirs) {
      for (const rel of [
        'chrome-headless-shell-linux64/chrome-headless-shell', 'chrome-linux64/chrome', 'chrome-linux/chrome',
        'chrome-headless-shell-mac-arm64/chrome-headless-shell', 'chrome-headless-shell-mac/chrome-headless-shell',
        'chrome-mac/Chromium.app/Contents/MacOS/Chromium', 'chrome-mac-arm64/Chromium.app/Contents/MacOS/Chromium',
      ]) {
        const p = join(cache, d, rel);
        if (existsSync(p)) return p;
      }
    }
  }
  return null;
}

function dumpDom(chrome, url) {
  return execFileSync(chrome, [
    '--headless', '--disable-gpu', '--disable-software-rasterizer', '--no-sandbox', '--single-process', '--no-zygote',
    '--virtual-time-budget=4000', '--dump-dom', url,
  ], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });
}

function main() {
  console.log('[soak] building single-file...');
  execFileSync('node', [join(ROOT, 'scripts', 'build.js')], { stdio: 'inherit' });

  const chrome = findChrome();
  if (!chrome) { console.error('[soak] no headless chromium found in ~/.cache/ms-playwright'); process.exit(2); }
  console.log('[soak] chrome:', chrome);

  let failed = false;
  // Both shipped cases, each on a WIN and a LOSS path.
  const cases = [{ label: 'case-1', q: '' }, { label: 'case-2', q: 'case=2&' }];
  for (const c of cases) {
    for (const mode of ['win', 'loss']) {
      const url = `file://${BUILD}?${c.q}soak=${mode}`;
      const dom = dumpDom(chrome, url);
      const m = dom.match(/SOAK (win|loss) (OK|FAIL) errors=(\d+)([^<]*)/);
      if (!m) { console.error(`[soak] ${c.label}/${mode}: NO MARKER (page did not complete the flow)`); failed = true; continue; }
      const line = m[0].trim();
      const pass = m[2] === 'OK' && m[3] === '0';
      console.log(`[soak] ${pass ? 'PASS' : 'FAIL'} :: ${c.label} :: ${line}`);
      if (!pass) failed = true;
    }
  }

  if (failed) { console.error('[soak] ACCEPTANCE FAILED'); process.exit(1); }
  console.log('[soak] acceptance green: both cases walk the shipped build cleanly (win + loss).');
}

main();
