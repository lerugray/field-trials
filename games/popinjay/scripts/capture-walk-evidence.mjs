// capture-walk-evidence.mjs — real walking frames for the 2026-08-18 play-notes lane.
// Run from repo root after build: node scripts/capture-walk-evidence.mjs

import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from './build.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const OUT = resolve(ROOT, 'docs/look-playnotes-20260818');
const URL = pathToFileURL(resolve(ROOT, 'dist/popinjay.html')).href;
const HEAD = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();

build();
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
await page.goto(URL, { waitUntil: 'load' });
await page.waitForFunction('window.__popinjayReady === true');
await page.waitForTimeout(400);
await page.keyboard.press('Enter');
await page.waitForTimeout(1200);

// Move to a flat spot on 1-1 and walk right so we can capture stride phases.
async function prepWalk() {
  await page.evaluate(() => window.POPINJAY.startStageAt(1, 1));
  await page.waitForTimeout(400);
  let probe = await page.evaluate(() => window.POPINJAY.probe());
  // Walk to a clean spot near the centre of the boardwalk.
  while (probe.playerX < 600) {
    await page.keyboard.down('ArrowRight');
    await page.waitForTimeout(40);
    await page.keyboard.up('ArrowRight');
    await page.waitForTimeout(20);
    probe = await page.evaluate(() => window.POPINJAY.probe());
  }
  return probe;
}

const startProbe = await prepWalk();
const shots = [];
const frames = [];

// Capture 8 frames while holding walk right; each frame is one phase (12 world px) apart.
// NOTE (2026-08-19 harvest correction): Player.walking is `dir !== 0` — true only while
// the key is actively held (src/sim/player.js). The original version of this script
// released ArrowRight and waited 60ms BEFORE each screenshot, so every capture landed
// after `walking` had already reverted to false: all 8 "walk" frames were silently the
// idle stand pose (identical leg silhouette, only camera-follow jitter differed — proven
// by an independent re-capture that held the key continuously and found two genuinely
// alternating leg/body shapes). Fixed by holding the key down across the whole capture
// loop and screenshotting mid-hold, so `walking` is actually true at capture time.
await page.keyboard.down('ArrowRight');
for (let i = 0; i < 8; i++) {
  // ~70 ms ≈ 4 ticks ≈ 12.7 world px, close to one WALK_PHASE_DIST — sampled while still held.
  await page.waitForTimeout(70);

  const s = await page.evaluate(() => {
    const pr = window.POPINJAY.probe();
    const pres = window.POPINJAY.present;
    return { x: pr.playerX, feetY: pr.feetY, tick: pr.tick, present: pres };
  });
  const pres = s.present;
  const sc = pres.scale;
  const K = 480 / 1280;
  const nx = s.x * K;
  const nf = s.feetY * K;
  const nh = Math.round(74 * K); // PLAYER.height native
  // Tight sprite box: native x±12, y=[top-10 .. feet+3].
  const spriteW = 25 * sc;
  const spriteH = (nh + 13) * sc;
  const clip = {
    x: Math.max(0, Math.min(1440 - Math.ceil(spriteW), Math.round(pres.x + (nx - 12) * sc))),
    y: Math.max(0, Math.min(900 - Math.ceil(spriteH), Math.round(pres.y + (nf - nh - 10) * sc))),
    width: Math.ceil(spriteW),
    height: Math.ceil(spriteH),
  };
  const png = await page.screenshot({ clip });
  writeFileSync(`${OUT}/walk-frame-${i}.png`, png);
  shots.push(png.toString('base64'));
  frames.push({ i, tick: s.tick, x: +s.x?.toFixed(1), feetY: +s.feetY?.toFixed(1) });
}
await page.keyboard.up('ArrowRight');

const UPSCALE = 3;
const stripPng = await page.evaluate(async ({ imgs, ups }) => {
  const c = document.createElement('canvas');
  const tmp = document.createElement('canvas');
  const tg = tmp.getContext('2d');
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  tg.imageSmoothingEnabled = false;

  // Load first image to get tile size.
  const first = new Image();
  await new Promise((r) => { first.onload = r; first.src = 'data:image/png;base64,' + imgs[0]; });
  const tw = first.width, th = first.height;
  c.width = tw * ups * imgs.length;
  c.height = th * ups;
  tmp.width = tw; tmp.height = th;

  for (let i = 0; i < imgs.length; i++) {
    const im = new Image();
    await new Promise((r) => { im.onload = r; im.src = 'data:image/png;base64,' + imgs[i]; });
    tg.clearRect(0, 0, tw, th);
    tg.drawImage(im, 0, 0);
    g.drawImage(tmp, 0, 0, tw, th, i * tw * ups, 0, tw * ups, th * ups);
    g.strokeStyle = '#ff0044';
    g.strokeRect(i * tw * ups + 0.5, 0.5, tw * ups - 1, th * ups - 1);
    g.fillStyle = '#ff0044';
    g.font = `${14 * ups}px monospace`;
    g.fillText(String(i), i * tw * ups + 6 * ups, 16 * ups);
  }
  return c.toDataURL('image/png').split(',')[1];
}, { imgs: shots, ups: UPSCALE });

writeFileSync(`${OUT}/walk-cycle-STRIP.png`, Buffer.from(stripPng, 'base64'));
writeFileSync(`${OUT}/walk-capture.json`, JSON.stringify({ head: HEAD, start: startProbe, frames }, null, 2));
await ctx.close();
await browser.close();
console.log(`[capture-walk-evidence] wrote ${OUT}/`);
