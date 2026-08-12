#!/usr/bin/env node
// Scene-legibility gate probe — holds the SHIPPED artifact to the art PoC's own
// measurements (src/gfx/instrument.js states them; test/instrument.test.js holds the
// measurements themselves honest).
//
// The unit tests can only prove the arithmetic. This proves the game: it boots
// dist/stray-squadron.html in headless Chromium at several seeds and scenes, reads the
// ?instrument socket, and fails if any frame is over the exposure ceiling, carrying more
// legible hostiles than the readability ceiling allows, piling them into a heap, or
// showing a capital that is not reading as mass.
//
// Playwright, via the same absolute-path import scripts/soak-stray-squadron.mjs uses
// (ESM ignores NODE_PATH, so the path has to be literal). A first version of this probe
// used plain `chromium --dump-dom --virtual-time-budget`; do not go back to it. The game
// runs an uninterrupted requestAnimationFrame loop, so virtual time never reaches its
// budget and the dump never fires — every scene silently burned its full timeout and the
// probe looked like it was working for fifteen minutes.
//
// Usage:  node scripts/instrument.mjs [--verbose]
// Exit 0 = every sampled frame passes; 1 = at least one gate failed.

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const artifact = path.join(root, 'dist', 'stray-squadron.html');
const verbose = process.argv.includes('--verbose');

// Playwright is not a runtime dependency of this game (zero third-party runtime deps is
// a hard rule) — it is a dev-only tool for this probe. Install it alongside the repo
// (`npm i -D playwright && npx playwright install chromium`), or point
// PLAYWRIGHT_MODULE at an existing checkout's playwright/index.mjs.
async function loadChromium() {
  if (process.env.PLAYWRIGHT_MODULE && fs.existsSync(process.env.PLAYWRIGHT_MODULE)) {
    const mod = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href);
    return mod.chromium;
  }
  try {
    const mod = await import('playwright');
    return mod.chromium;
  } catch {
    throw new Error(
      'playwright not found; run `npm i -D playwright && npx playwright install chromium`, '
      + 'or set PLAYWRIGHT_MODULE=/abs/path/to/playwright/index.mjs',
    );
  }
}

// The sampled board. Rail flight across several seeds (different sectors, different wave
// layouts) plus the run climax, which is the only scene with a capital in it.
const SCENES = [
  { label: 'rail/stray-m1', query: 'still=1&seed=stray-m1' },
  { label: 'rail/coldwater-7', query: 'still=1&seed=coldwater-7' },
  { label: 'rail/ss-42', query: 'still=1&seed=ss-42' },
  { label: 'rail/ss-1017', query: 'still=1&seed=ss-1017' },
  { label: 'target/near-gunner', query: 'target=18&kind=gunner&seed=stray-m1' },
  { label: 'target/lock-range', query: 'target=34&seed=stray-m1' },
  { label: 'climax/boss', query: 'boss=1&seed=stray-m1' },
  { label: 'climax/boss-alt', query: 'boss=1&seed=ss-42' },
];

if (!fs.existsSync(artifact)) {
  console.error(`[instrument] ${path.relative(root, artifact)} missing — run: node scripts/build.js`);
  process.exit(1);
}

const chromium = await loadChromium();
const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});

let failed = 0, ran = 0;
try {
  for (const scene of SCENES) {
    ran++;
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const consoleErrors = [];
    page.on('pageerror', (e) => consoleErrors.push(String(e.message).split('\n')[0]));
    page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });

    let r;
    try {
      await page.goto(`${pathToFileURL(artifact).href}?instrument=1&${scene.query}`,
        { waitUntil: 'load', timeout: 60000 });
      // Let the scene settle before measuring: a frozen proof pose still needs its
      // level built, its meshes uploaded and a few frames drawn.
      await page.waitForFunction(
        () => window.__strayInstrument && window.__strayFrame > 20,
        null, { timeout: 90000, polling: 250 },
      );
      r = await page.evaluate(() => window.__strayInstrument);
    } catch (e) {
      r = { error: String(e.message || e).split('\n')[0] };
    } finally {
      await page.close();
    }

    if (consoleErrors.length) {
      // A frame measured out of a broken page is not evidence of anything.
      console.error(`[instrument] FAIL ${scene.label}: page errors — ${consoleErrors[0]}`);
      failed++;
      continue;
    }
    if (!r || r.error) {
      console.error(`[instrument] FAIL ${scene.label}: ${r ? r.error : 'no reading'}`);
      failed++;
      continue;
    }

    const m = r.metrics || {};
    const line = `${scene.label}: native=${r.native ? `${r.native.width}x${r.native.height}@${r.native.scale}x` : '?'} `
      + `sector=${r.sector} legible=${m.legibleEnemies} clustered=${m.clustered} `
      + `hotPix=${(m.hotPixPct || 0).toFixed(2)}%`
      + (m.bossAreaPct != null ? ` bossArea=${m.bossAreaPct.toFixed(2)}%` : '');
    if (r.pass) {
      console.log(`[instrument] ok   ${line}`);
    } else {
      console.error(`[instrument] FAIL ${line}`);
      for (const f of r.failures) console.error(`               - ${f}`);
      failed++;
    }
    if (verbose) console.log(`               raw: ${JSON.stringify(r)}`);
  }
} finally {
  await browser.close();
}

console.log(`[instrument] ${ran - failed}/${ran} scenes pass the legibility gates`);
process.exit(failed ? 1 : 0);
