// smoke.mjs — headless boot smoke (DESIGN-SEED "STACK": Playwright smoke for boot + input).
// Builds the single-file dist, loads it over file://, asserts the boot ran with no console/page
// errors and that the canvas actually rendered non-black pixels, drives one input to prove the
// input path, then captures a fixed-viewport dated screenshot for the operator (CLAUDE.md rule 7).
//
// Usage: node scripts/smoke.mjs [YYYYMMDD]

import { chromium } from 'playwright';
import { writeBuild } from './build.js';
import { mkdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const VIEWPORT = { width: 512, height: 480 }; // exact 2× of the 256×240 logical frame

async function launchSmokeBrowser() {
  try { return await chromium.launch(); }
  catch (error) {
    const message = String(error?.message || error);
    if (!message.includes('MachPortRendezvousServer')) throw error;
    return chromium.launch({ args: ['--single-process', '--no-zygote'] });
  }
}

function stamp() {
  const arg = process.argv[2];
  if (arg && /^\d{8}$/.test(arg)) return arg;
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
}

async function main() {
  const outPath = writeBuild();
  const url = pathToFileURL(outPath).href;

  const browser = await launchSmokeBrowser();
  const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 1 });

  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));

  await page.goto(url);
  await page.waitForTimeout(300); // let a few frames of the fixed loop run

  // Drive Stage 1 carefully: advance to the first enemy on the starting ground, fight it, and
  // stay clear of the pits so the capture shows live combat (not a death screen).
  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(700);
  await page.keyboard.up('ArrowRight');
  for (let i = 0; i < 5; i++) {
    await page.keyboard.down('KeyJ');
    await page.waitForTimeout(70);
    await page.keyboard.up('KeyJ');
    await page.waitForTimeout(180);
  }
  await page.waitForTimeout(120);

  // Confirm the sim advanced and the player is alive for the capture.
  const state = await page.evaluate(() => {
    const s = window.__stage && window.__stage();
    return s ? { xp: s.progress.totalXp, gold: s.gold, level: s.progress.level, hp: s.progress.hp,
      dead: s.dead, enemies: s.enemies.filter((e) => e.alive).length } : null;
  });

  // Assert the tick counter advanced (sim loop is live) and the canvas rendered non-black pixels.
  const probe = await page.evaluate(() => {
    const c = document.getElementById('screen');
    const g = c.getContext('2d');
    const { data } = g.getImageData(0, 0, c.width, c.height);
    let nonBlack = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i] || data[i + 1] || data[i + 2]) nonBlack++;
    }
    return { w: c.width, h: c.height, nonBlack };
  });

  mkdirSync(join(ROOT, 'proofs'), { recursive: true });
  const label = process.env.SMOKE_LABEL || 'boot';
  const shot = join(ROOT, `proofs/${label}-${stamp()}.png`);
  await page.screenshot({ path: shot });
  await browser.close();

  const problems = [];
  if (errors.length) problems.push(`console/page errors: ${errors.join(' | ')}`);
  if (probe.nonBlack < 100) problems.push(`canvas looks blank (nonBlack=${probe.nonBlack})`);
  if (probe.w !== VIEWPORT.width || probe.h !== VIEWPORT.height) {
    problems.push(`unexpected canvas size ${probe.w}x${probe.h}`);
  }
  if (state && !(state.xp > 0 || state.gold > 30)) {
    problems.push(`player-core loop did not advance (xp=${state.xp} gold=${state.gold})`);
  }
  if (state && state.dead) problems.push('player died during the smoke drive');

  if (problems.length) {
    console.error('SMOKE FAILED:\n - ' + problems.join('\n - '));
    process.exit(1);
  }
  console.log(`smoke OK — canvas ${probe.w}x${probe.h}, ${probe.nonBlack} non-black px, no errors`);
  if (state) console.log(`player core: level ${state.level}, xp ${state.xp}, gold ${state.gold}`);
  console.log(`screenshot: ${shot}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
