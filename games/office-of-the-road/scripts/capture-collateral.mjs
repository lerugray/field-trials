// capture-collateral.mjs — capture a real-play frame for release collateral.
// Uses the same single-file build and deep-link params as scripts/proof.mjs,
// but writes dated PNGs to proof/release-collateral-20260812/.
//
// Usage: node scripts/capture-collateral.mjs <label> [--seed N] [--ticks N]
//        [--beats N] [--speed N] [--paused] [--camp] [--deck] [--shop]
//        [--route] [--dead] [--intake] [--title] [--howto] [--fresh] [--cvd alias]
//
// Requires playwright. If playwright is not installed, exits with a clear note.

import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const OUT_DIR = resolve(ROOT, 'proof/release-look-20260812');

function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function main() {
  const args = process.argv.slice(2);
  if (!args.length || args[0].startsWith('--')) {
    console.error('usage: node scripts/capture-collateral.mjs <label> [options]');
    process.exit(1);
  }
  const label = args[0].replace(/[^a-z0-9_-]/gi, '_');
  const opt = { size: '1280,800', seed: 20260812 };
  for (let i = 1; i < args.length; i++) {
    const a = args[i];
    if (a === '--paused') opt.paused = true;
    else if (a === '--camp') opt.camp = true;
    else if (a === '--deck') opt.deck = true;
    else if (a === '--shop') opt.shop = true;
    else if (a === '--route') opt.route = true;
    else if (a === '--dead') opt.dead = true;
    else if (a === '--intake') opt.intake = true;
    else if (a === '--title') opt.title = true;
    else if (a === '--howto') opt.howto = true;
    else if (a === '--opening') opt.opening = true;
    else if (a === '--fresh') opt.fresh = true;
    else if (a === '--ticks') opt.ticks = args[++i];
    else if (a === '--beats') opt.beats = args[++i];
    else if (a === '--cvd') opt.cvd = args[++i];
    else if (a === '--seed') opt.seed = args[++i];
    else if (a === '--speed') opt.speed = args[++i];
    else if (a === '--size') opt.size = args[i + 1] && !args[i + 1].startsWith('--') ? args[++i] : opt.size;
  }

  execFileSync(process.execPath, [resolve(ROOT, 'scripts/build.js')], { stdio: 'inherit' });

  const distPosix = resolve(ROOT, 'dist/office-of-the-road.html');
  if (!existsSync(distPosix)) throw new Error('build missing: ' + distPosix);

  const query = new URLSearchParams();
  if (opt.ticks != null) query.set('ticks', String(opt.ticks));
  if (opt.beats != null) query.set('beats', String(opt.beats));
  query.set('seed', String(opt.seed));
  if (opt.speed != null) query.set('speed', String(opt.speed));
  if (opt.paused) query.set('paused', '1');
  if (opt.fresh) query.set('fresh', '1');
  if (opt.camp) query.set('camp', '1');
  if (opt.deck) query.set('deck', '1');
  if (opt.shop) query.set('shop', '1');
  if (opt.route) query.set('route', '1');
  if (opt.dead) query.set('dead', '1');
  if (opt.intake) query.set('intake', '1');
  if (opt.title) query.set('title', '1');
  if (opt.howto) query.set('howto', '1');
  if (opt.opening) query.set('opening', '1');
  if (opt.cvd) query.set('cvd', opt.cvd);
  const url = pathToFileURL(distPosix).href + (query.toString() ? '?' + query.toString() : '');

  mkdirSync(OUT_DIR, { recursive: true });
  const outPosix = resolve(OUT_DIR, `${label}-${stamp()}.png`);
  if (existsSync(outPosix)) throw new Error('refusing to overwrite existing capture: ' + outPosix);

  const [w, h] = opt.size.split(',');

  (async () => {
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage({ viewport: { width: Number(w), height: Number(h) }, deviceScaleFactor: 1 });
      const errors = [];
      page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
      page.on('pageerror', (error) => errors.push(error.message));
      await page.goto(url, { waitUntil: 'load' });
      await page.waitForTimeout(700); // art decode + first paint
      await page.locator('#stage').screenshot({ path: outPosix, type: 'png' });
      if (errors.length) throw new Error(errors.join('\n'));
    } finally {
      await browser.close();
    }
    const kb = (statSync(outPosix).size / 1024).toFixed(1);
    console.log(`[capture] ${url}`);
    console.log(`[capture] wrote ${outPosix} (${kb} KB, ${w}x${h})`);
  })().catch((error) => { console.error(error); process.exit(1); });
}

main();
