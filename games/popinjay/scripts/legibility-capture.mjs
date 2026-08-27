// legibility-capture.mjs — proof frames for red+shadow surfaces at DPR 2 only.
import { chromium } from 'playwright';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from './build.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const PROOFS = resolve(ROOT, 'proofs', 'legibility-2026-08-26');
const VP = { w: 1440, h: 900, tag: '1440x900' };
const DPR = 2;
const SCENES = [
  { prefix: 'title-wordmark', prep: null },
  { prefix: 'title-extras', prep: (p) => p.evaluate(() => window.POPINJAY.titleExtrasDemo()) },
  { prefix: 'pause-menu', prep: (p) => p.evaluate(() => window.POPINJAY.pauseDemo()) },
  { prefix: 'downed-beat', prep: (p) => p.evaluate(() => window.POPINJAY.killDemo()) },
  { prefix: 'tour-map', prep: (p) => p.evaluate(() => window.POPINJAY.tourmapDemo()) },
  { prefix: 'scorecard', prep: (p) => p.evaluate(() => window.POPINJAY.scorecardDemo()) },
  { prefix: 'trunk', prep: (p) => p.evaluate(() => window.POPINJAY.trunkDemo()) },
  { prefix: 'draft', prep: (p) => p.evaluate(() => window.POPINJAY.draftDemo()) },
  { prefix: 'hud-bell', prep: (p) => p.evaluate(() => window.POPINJAY.dripDemo(2, 2)) },
];
function stamp() {
  const d = new Date();
  const p = (n, w = 2) => String(n).padStart(w, '0');
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}-${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}`;
}
async function captureOne(browser, scene, tag, ts, url) {
  const context = await browser.newContext({ viewport: { width: VP.w, height: VP.h }, deviceScaleFactor: DPR });
  const page = await context.newPage();
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction('window.__popinjayReady === true', { timeout: 10000 });
  if (scene.prep) await scene.prep(page);
  await page.waitForTimeout(scene.prefix === 'downed-beat' ? 500 : 200);
  const base = `${tag}-${scene.prefix}_${VP.tag}@${DPR}x_${ts}`;
  const pngPath = resolve(PROOFS, `${base}.png`);
  if (existsSync(pngPath)) throw new Error(`proof already exists: ${pngPath}`);
  await page.screenshot({ path: pngPath });
  await context.close();
  return pngPath;
}
async function main() {
  const tagArg = (process.argv.find((a) => a.startsWith('--tag=')) || '--tag=run').slice(6);
  build();
  mkdirSync(PROOFS, { recursive: true });
  const url = pathToFileURL(resolve(ROOT, 'dist/popinjay.html')).href;
  const ts = stamp();
  const browser = await chromium.launch({ headless: true });
  const paths = [];
  try {
    for (const scene of SCENES) paths.push(await captureOne(browser, scene, tagArg, ts, url));
  } finally { await browser.close(); }
  console.log(`[legibility-capture] ${paths.length} frame(s)`);
  for (const p of paths) console.log(`  ${p}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
