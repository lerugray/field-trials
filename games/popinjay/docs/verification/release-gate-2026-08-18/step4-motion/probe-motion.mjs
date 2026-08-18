// STEP 4 — MOTION LOOKER (gate run 2026-08-18, HEAD 968b27b). The moonwalk class.
//
// Static frames never satisfy this step, so every check here is a STRIP of consecutive
// frames from the SHIPPED artifact, assembled so facing-vs-travel and cycle progression
// are visible to an eye. Each strip is also measured (player x per frame, sprite-column
// hash per frame) so "the cycle advances" and "it faces the way it walks" are numbers as
// well as pictures.
//
// Run from the repo root:
//   node docs/verification/release-gate-2026-08-18/step4-motion/probe-motion.mjs

import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../../../..');
const URL = pathToFileURL(resolve(ROOT, 'dist/popinjay.html')).href;
const HEAD = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
const out = { head: HEAD, url: URL, strips: {} };

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
await page.goto(URL, { waitUntil: 'load' });
await page.waitForFunction('window.__popinjayReady === true');
await page.waitForTimeout(500);
await page.keyboard.press('Enter');
await page.waitForTimeout(1500);

// Grab the player's own neighbourhood, frame by frame, while an input is held.
async function strip(name, { hold, frames = 8, gapMs = 90, prep }) {
  if (prep) await prep();
  await page.waitForTimeout(300);
  const shots = [];
  const samples = [];
  if (hold) await page.keyboard.down(hold);
  for (let i = 0; i < frames; i++) {
    const s = await page.evaluate(() => {
      const P = window.POPINJAY;
      const pr = P.probe();
      const present = P.present;
      return { x: pr.playerX, feetY: pr.feetY, tick: pr.tick, wires: pr.wires, balloons: pr.balloons, present };
    });
    samples.push(s);
    // Crop a window around the player in DEVICE space so the sprite fills the tile.
    const pres = s.present, sc = pres.scale;
    const cx = Math.round(pres.x + (s.x / 4) * sc);   // world->native is /4 (VIEW is 4x native)
    const clip = {
      x: Math.max(0, Math.min(1440 - 180, cx - 90)),
      y: Math.max(0, Math.min(900 - 200, Math.round(pres.y + (s.feetY / 4) * sc) - 150)),
      width: 180, height: 200,
    };
    shots.push(await page.screenshot({ clip }));
    await page.waitForTimeout(gapMs);
  }
  if (hold) await page.keyboard.up(hold);
  // Write the frames out individually AND as one contact strip via a tiny canvas page.
  const b64 = shots.map((b) => b.toString('base64'));
  const stripPng = await page.evaluate(async (imgs) => {
    const c = document.createElement('canvas');
    c.width = 180 * imgs.length; c.height = 200;
    const g = c.getContext('2d');
    for (let i = 0; i < imgs.length; i++) {
      const im = new Image();
      await new Promise((r) => { im.onload = r; im.src = 'data:image/png;base64,' + imgs[i]; });
      g.drawImage(im, i * 180, 0);
      g.strokeStyle = '#ff0044'; g.strokeRect(i * 180 + 0.5, 0.5, 179, 199);
      g.fillStyle = '#ff0044'; g.font = '14px monospace'; g.fillText(String(i), i * 180 + 6, 16);
    }
    return c.toDataURL('image/png').split(',')[1];
  }, b64);
  writeFileSync(`${HERE}/${name}-STRIP.png`, Buffer.from(stripPng, 'base64'));
  out.strips[name] = {
    frames: samples.map((s) => ({ tick: s.tick, x: +s.x?.toFixed(1), feetY: +s.feetY?.toFixed(1), wires: s.wires, balloons: s.balloons })),
    netTravel: +(samples[samples.length - 1].x - samples[0].x).toFixed(1),
  };
  return out.strips[name];
}

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
      if (probe.feetY < startFeet - 4) return;
    }
  }
  throw new Error(`failed to stage a real ladder climb sweep (x=${probe.playerX}, feetY=${probe.feetY})`);
}

await strip('A-walk-right', { hold: 'ArrowRight', frames: 8 });
await page.waitForTimeout(300);
await strip('B-walk-left', { hold: 'ArrowLeft', frames: 8 });
await page.waitForTimeout(300);

// The wire: fired, climbing, and the split it causes. feelGate parks a Grand in the
// player's column and fires — the signature verb, deterministic.
await strip('C-wire-and-split', { frames: 10, gapMs: 110, prep: async () => page.evaluate(() => window.POPINJAY.feelGate()) });

// Balloon arcs with nothing else moving — the periodicity promise, seen.
await strip('D-balloon-arcs', { frames: 10, gapMs: 130, prep: async () => page.evaluate(() => window.POPINJAY.startStageAt(1, 2)) });

// Climb: the player on a ladder, moving UP — facing/pose while climbing.
await strip('E-climb-ladder', { hold: 'ArrowUp', frames: 8, gapMs: 100, prep: prepClimbAtLadder });

// Wind bands (locale 2) — drift that must shear arcs without breaking periodicity.
await strip('F-wind-drift', { frames: 10, gapMs: 130, prep: async () => page.evaluate(() => window.POPINJAY.startStageAt(2, 2)) });

// A full-frame motion strip too, so the WHOLE screen's movement is judgeable, not just
// the player's tile (the moonwalk class showed up at whole-scene scale on ADVERSARY).
{
  await page.evaluate(() => window.POPINJAY.startStageAt(1, 2));
  await page.waitForTimeout(400);
  const frames = [];
  await page.keyboard.down('ArrowRight');
  for (let i = 0; i < 6; i++) { frames.push((await page.screenshot()).toString('base64')); await page.waitForTimeout(120); }
  await page.keyboard.up('ArrowRight');
  const wide = await page.evaluate(async (imgs) => {
    const c = document.createElement('canvas');
    c.width = 480 * imgs.length; c.height = 300;
    const g = c.getContext('2d');
    for (let i = 0; i < imgs.length; i++) {
      const im = new Image();
      await new Promise((r) => { im.onload = r; im.src = 'data:image/png;base64,' + imgs[i]; });
      g.drawImage(im, 0, 0, im.width, im.height, i * 480, 0, 480, 300);
      g.strokeStyle = '#ff0044'; g.strokeRect(i * 480 + 0.5, 0.5, 479, 299);
      g.fillStyle = '#ff0044'; g.font = '20px monospace'; g.fillText(String(i), i * 480 + 8, 24);
    }
    return c.toDataURL('image/png').split(',')[1];
  }, frames);
  writeFileSync(`${HERE}/G-wholescene-walk-STRIP.png`, Buffer.from(wide, 'base64'));
}

await ctx.close();
await browser.close();
writeFileSync(`${HERE}/motion.json`, JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
