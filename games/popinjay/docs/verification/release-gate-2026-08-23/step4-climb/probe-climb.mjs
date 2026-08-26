// STEP 4 — real ladder climb at HEAD (READ-ONLY probe copy; evidence to this dir).
// Adapted from scripts/capture-climb-evidence.mjs — does not rebuild; does not write
// into the 2026-08-18 dossier. Run from repo root:
//   node docs/verification/release-gate-2026-08-23/step4-climb/probe-climb.mjs

import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../../../..');
const OUT = HERE;
const URL = pathToFileURL(resolve(ROOT, 'dist/popinjay.html')).href;
const HEAD = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
await page.goto(URL, { waitUntil: 'load' });
await page.waitForFunction('window.__popinjayReady === true');
await page.waitForTimeout(400);
await page.keyboard.press('Enter');
await page.waitForTimeout(1200);

async function prepClimbAtLadder() {
  await page.evaluate(() => window.POPINJAY.startStageAt(1, 2));
  await page.waitForTimeout(400);
  let probe = await page.evaluate(() => window.POPINJAY.probe());
  const targets = [140, 220, 300, 380, 460, 540, 620, 700, 780, 860, 940, 1020, 1100];
  for (const targetX of targets) {
    let tries = 0;
    while (Math.abs(probe.playerX - targetX) > 8 && tries++ < 40) {
      const key = probe.playerX < targetX ? 'ArrowRight' : 'ArrowLeft';
      await page.keyboard.down(key);
      await page.waitForTimeout(70);
      await page.keyboard.up(key);
      await page.waitForTimeout(35);
      probe = await page.evaluate(() => window.POPINJAY.probe());
    }
    const startFeet = probe.feetY;
    for (let i = 0; i < 4; i++) {
      await page.keyboard.down('ArrowUp');
      await page.waitForTimeout(140);
      await page.keyboard.up('ArrowUp');
      await page.waitForTimeout(40);
      probe = await page.evaluate(() => window.POPINJAY.probe());
      if (probe.feetY < startFeet - 4) return probe;
    }
  }
  throw new Error(`failed to mount ladder (x=${probe.playerX}, feetY=${probe.feetY})`);
}

const mounted = await prepClimbAtLadder();
const shots = [];
const frames = [];
const hashes = [];
await page.keyboard.down('ArrowUp');
for (let i = 0; i < 8; i++) {
  const s = await page.evaluate(() => {
    const pr = window.POPINJAY.probe();
    const pres = window.POPINJAY.present;
    return { x: pr.playerX, feetY: pr.feetY, state: pr.playerState, tick: pr.tick, present: pres };
  });
  const pres = s.present;
  const sc = pres.scale;
  const K = 480 / 1280;
  const cx = Math.round(pres.x + s.x * K * sc);
  const clip = {
    x: Math.max(0, Math.min(1440 - 180, cx - 90)),
    y: Math.max(0, Math.min(900 - 200, Math.round(pres.y + s.feetY * K * sc) - 150)),
    width: 180,
    height: 200,
  };
  const png = await page.screenshot({ clip });
  writeFileSync(`${OUT}/climb-frame-${i}.png`, png);
  shots.push(png.toString('base64'));
  const sha = createHash('sha256').update(png).digest('hex');
  hashes.push(sha);
  frames.push({ i, tick: s.tick, state: s.state, x: +s.x?.toFixed(1), feetY: +s.feetY?.toFixed(1), sha256: sha });
  await page.waitForTimeout(100);
}
await page.keyboard.up('ArrowUp');

const stripPng = await page.evaluate(async (imgs) => {
  const c = document.createElement('canvas');
  c.width = 180 * imgs.length;
  c.height = 200;
  const g = c.getContext('2d');
  for (let i = 0; i < imgs.length; i++) {
    const im = new Image();
    await new Promise((r) => { im.onload = r; im.src = 'data:image/png;base64,' + imgs[i]; });
    g.drawImage(im, i * 180, 0);
    g.strokeStyle = '#ff0044';
    g.strokeRect(i * 180 + 0.5, 0.5, 179, 199);
    g.fillStyle = '#ff0044';
    g.font = '14px monospace';
    g.fillText(String(i), i * 180 + 6, 16);
  }
  return c.toDataURL('image/png').split(',')[1];
}, shots);

writeFileSync(`${OUT}/climb-cycle-STRIP.png`, Buffer.from(stripPng, 'base64'));

const uniqueHashes = new Set(hashes).size;
const feetYs = frames.map((f) => f.feetY);
const xFixed = frames.every((f) => Math.abs(f.x - frames[0].x) < 0.5);
const ascending = feetYs.every((y, i) => i === 0 || y <= feetYs[i - 1] - 1);
const climbingState = frames.every((f) => f.state === 'climb');

const summary = {
  head: HEAD,
  url: URL,
  mounted,
  frames,
  verdict: {
    allClimbState: climbingState,
    xFixedDuringAscent: xFixed,
    feetYMonotonicFall: ascending,
    framesNotByteIdentical: uniqueHashes >= 2,
    uniqueFrameHashes: uniqueHashes,
    feetYSpan: [feetYs[0], feetYs[feetYs.length - 1]],
  },
};
writeFileSync(`${OUT}/capture.json`, JSON.stringify(summary, null, 2));
await ctx.close();
await browser.close();
console.log('[probe-climb] VERDICT', JSON.stringify(summary.verdict, null, 2));
console.log(`[probe-climb] wrote ${OUT}/`);
