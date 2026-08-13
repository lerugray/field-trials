// proof.mjs — capture a dated proof screenshot of the single-file build via
// headless Chrome (DESIGN-SEED hard rule #9: fixed viewports, dated filenames,
// never overwrite an existing proof).
//
//   node scripts/proof.mjs <label> [--ticks N] [--seed N] [--speed i]
//                          [--paused] [--size WxH]
//
// Rebuilds first, then loads dist/office-of-the-road.html?<params> in headless
// Chrome and writes proofs/<label>-<YYYYMMDD-HHMMSS>.png. The boot params make
// the captured frame deterministic. Chrome is located via $CHROME or the known
// Windows path (this machine).

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

function findChrome() {
  if (process.env.CHROME && existsSync(process.env.CHROME)) return process.env.CHROME;
  const candidates = [
    '/mnt/c/Program Files/Google/Chrome/Application/chrome.exe',
    '/mnt/c/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ];
  for (const c of candidates) if (existsSync(c)) return c;
  throw new Error('no Chrome found — set $CHROME to a Chrome/Chromium binary');
}

// Convert a WSL/absolute repo path to a file URL Chrome can open. Windows Chrome
// needs a Windows path; a Linux Chrome takes the POSIX path.
function toFileUrl(chrome, absPosix) {
  if (chrome.includes('/mnt/c/')) {
    // /mnt/c/Users/... -> C:/Users/...
    const win = absPosix.replace(/^\/mnt\/([a-z])\//, (_, d) => d.toUpperCase() + ':/');
    return 'file:///' + win;
  }
  return 'file://' + absPosix;
}

function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function main() {
  const args = process.argv.slice(2);
  if (!args.length || args[0].startsWith('--')) {
    console.error('usage: node scripts/proof.mjs <label> [--ticks N] [--seed N] [--speed i] [--paused] [--size WxH]');
    process.exit(1);
  }
  const label = args[0].replace(/[^a-z0-9_-]/gi, '_');
  const opt = { size: '1280,800' };
  for (let i = 1; i < args.length; i++) {
    const a = args[i];
    if (a === '--paused') opt.paused = true;
    else if (a === '--asdocket') opt.asdocket = true;
    else if (a === '--camp') opt.camp = true;
    else if (a === '--deck') opt.deck = true;
    else if (a === '--shop') opt.shop = true;
    else if (a === '--route') opt.route = true;
    else if (a === '--dead') opt.dead = true;
    else if (a === '--intake') opt.intake = true;
    else if (a === '--fresh') opt.fresh = true;
    else if (a === '--ticks') opt.ticks = args[++i];
    else if (a === '--beats') opt.beats = args[++i];
    else if (a === '--cvd') opt.cvd = args[++i];
    else if (a === '--seed') opt.seed = args[++i];
    else if (a === '--speed') opt.speed = args[++i];
    else if (a === '--size') opt.size = args[++i].replace('x', ',');
  }

  // Rebuild so the proof reflects current source.
  execFileSync(process.execPath, [resolve(ROOT, 'scripts/build.js')], { stdio: 'inherit' });

  const chrome = findChrome();
  const distPosix = resolve(ROOT, 'dist/office-of-the-road.html');
  if (!existsSync(distPosix)) throw new Error('build missing: ' + distPosix);

  const query = new URLSearchParams();
  if (opt.ticks) query.set('ticks', opt.ticks);
  if (opt.beats) query.set('beats', opt.beats);
  if (opt.seed) query.set('seed', opt.seed);
  if (opt.speed) query.set('speed', opt.speed);
  if (opt.paused) query.set('paused', '1');
  if (opt.asdocket) query.set('asdocket', '1');
  if (opt.camp) query.set('camp', '1');
  if (opt.deck) query.set('deck', '1');
  if (opt.shop) query.set('shop', '1');
  if (opt.route) query.set('route', '1');
  if (opt.dead) query.set('dead', '1');
  if (opt.intake) query.set('intake', '1');
  if (opt.fresh) query.set('fresh', '1');
  if (opt.cvd) query.set('cvd', opt.cvd);
  const qs = query.toString();
  const url = toFileUrl(chrome, distPosix) + (qs ? '?' + qs : '');

  const proofsDir = resolve(ROOT, 'proofs');
  if (!existsSync(proofsDir)) mkdirSync(proofsDir, { recursive: true });
  const outPosix = resolve(proofsDir, `${label}-${stamp()}.png`);
  if (existsSync(outPosix)) throw new Error('refusing to overwrite existing proof: ' + outPosix);
  const outArg = chrome.includes('/mnt/c/')
    ? outPosix.replace(/^\/mnt\/([a-z])\//, (_, d) => d.toUpperCase() + ':\\').replace(/\//g, '\\')
    : outPosix;

  const [w, h] = opt.size.split(',');
  execFileSync(chrome, [
    '--headless=new', '--disable-gpu', '--hide-scrollbars',
    '--force-device-scale-factor=1', '--run-all-compositor-stages-before-draw',
    `--window-size=${w},${h}`, `--screenshot=${outArg}`, url,
  ], { stdio: ['ignore', 'ignore', 'inherit'] });

  if (!existsSync(outPosix)) throw new Error('Chrome produced no screenshot');
  const kb = (statSync(outPosix).size / 1024).toFixed(1);
  console.log(`[proof] ${url}`);
  console.log(`[proof] wrote proofs/${outPosix.split('/').pop()} (${kb} KB, ${w}x${h})`);
}

main();
