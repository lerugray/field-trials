// soak.mjs — run the M9 PLAYER-PATH SOAK (DESIGN-SEED M9 acceptance battery). It
// rebuilds, then drives the single-file build in headless Chrome under an
// accelerated virtual-time clock while the in-page soak (src/soak.js) plays a full
// expedition through REAL dispatched input events. A --dump-dom pass reads the
// machine-readable verdict from <title>; a --screenshot pass captures the
// acceptance dossier. Exits non-zero on any BLOCKER (a hard acceptance gate).
//
//   node scripts/soak.mjs [--seed N] [--budget MS]

import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

function findChrome() {
  if (process.env.CHROME && existsSync(process.env.CHROME)) return process.env.CHROME;
  for (const c of [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/mnt/c/Program Files/Google/Chrome/Application/chrome.exe',
    '/mnt/c/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    '/usr/bin/google-chrome', '/usr/bin/chromium',
  ]) if (existsSync(c)) return c;
  return null;
}
function toFileUrl(chrome, absPosix) {
  if (chrome.includes('/mnt/c/')) return 'file:///' + absPosix.replace(/^\/mnt\/([a-z])\//, (_, d) => d.toUpperCase() + ':/');
  return 'file://' + absPosix;
}
function toWin(absPosix) { return absPosix.replace(/^\/mnt\/([a-z])\//, (_, d) => d.toUpperCase() + ':\\').replace(/\//g, '\\'); }

function main() {
  const args = process.argv.slice(2);
  let seed = 1, budget = 180000, breakVerb = null;
  for (let i = 0; i < args.length; i++) { if (args[i] === '--seed') seed = args[++i]; else if (args[i] === '--budget') budget = parseInt(args[++i], 10) || budget; else if (args[i] === '--break-verb') breakVerb = args[++i]; }

  execFileSync(process.execPath, [resolve(ROOT, 'scripts/build.js')], { stdio: 'inherit' });
  const chrome = findChrome();
  if (!chrome) {
    console.log('[soak] no Chrome found; using the fresh-module-boot storage harness');
    const harnessArgs = [resolve(ROOT, 'scripts/soak-harness.mjs'), '--seed', String(seed), '--budget', String(Math.max(budget, 360000))];
    if (breakVerb) harnessArgs.push('--break-verb', breakVerb);
    const result = spawnSync(process.execPath, harnessArgs, { stdio: 'inherit' });
    process.exitCode = result.status == null ? 1 : result.status;
    return;
  }
  const url = toFileUrl(chrome, resolve(ROOT, 'dist/office-of-the-road.html')) + `?soak=1&fresh=1&seed=${seed}`;
  const base = ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1',
    '--run-all-compositor-stages-before-draw', `--virtual-time-budget=${budget}`, '--window-size=1280,800'];

  // Pass 1 — read the verdict from the page <title> after the soak completes.
  const dom = execFileSync(chrome, [...base, '--dump-dom', url], { encoding: 'utf8', maxBuffer: 1 << 26 });
  const m = /<title>([^<]*)<\/title>/.exec(dom);
  const title = m ? m[1] : '(no title)';
  console.log('[soak] ' + title);

  // Pass 2 — capture the acceptance dossier screenshot (dated, never overwrites).
  const outDir = resolve(ROOT, 'proofs');
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
  const now = new Date();
  const ts = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
  const outPosix = resolve(outDir, `soak-dossier-${ts}.png`);
  execFileSync(chrome, [...base, `--screenshot=${chrome.includes('/mnt/c/') ? toWin(outPosix) : outPosix}`, url], { stdio: ['ignore', 'ignore', 'inherit'] });
  console.log('[soak] dossier -> proofs/' + outPosix.split('/').pop());

  const pass = /SOAK PASS/.test(title) && /blockers=0/.test(title) && /reloads=[1-9]\d*/.test(title);
  console.log(pass ? '[soak] ACCEPTANCE: PASS (no blockers)' : '[soak] ACCEPTANCE: FAIL');
  process.exit(pass ? 0 : 1);
}
main();
