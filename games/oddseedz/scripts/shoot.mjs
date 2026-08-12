// shoot — boots dist/index.html in a real browser, drives the summon flow,
// verifies reload persistence and a clean console, and captures dated proof
// shots at 1280x800. Dev tooling only (playwright); not part of the artifact.

import { chromium } from 'playwright';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { mkdir } from 'node:fs/promises';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = pathToFileURL(resolve(ROOT, 'dist/index.html')).href;
const DATE = process.argv[2] || 'undated';
const OUT = resolve(ROOT, 'docs/screenshots');

// deterministic phrases chosen to show archetype + rarity variety
const DEMO = [
  { phrase: 'seed-12', tag: 'claude-legendary' },   // spectral, legendary (aura)
  { phrase: 'seed-1', tag: 'jellyfish-rare' },       // aquatic, rare
  { phrase: 'seed-2', tag: 'basilisk-rare' },        // critter, rare
  { phrase: 'seed-6', tag: 'goblin-uncommon' },      // humanoid
  { phrase: 'seed-5', tag: 'slime-common' },         // blob
  { phrase: 'seed-0', tag: 'bee-common' },           // bug
];

async function settle(page, ms) {
  await page.waitForTimeout(ms);
}

async function run() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));

  await page.goto(DIST);
  await page.waitForSelector('#scene');
  await settle(page, 300);

  // hero shots across archetypes/rarities
  for (const { phrase, tag } of DEMO) {
    await page.fill('#phrase', phrase);
    await page.click('#summon');
    await settle(page, 900); // let the idle animation breathe for the frame
    await page.screenshot({ path: resolve(OUT, `${DATE}-m1-${tag}.png`) });
    const name = await page.textContent('.pet-name');
    const species = await page.textContent('.pet-species');
    console.log(`  ${tag}: ${name} — ${species}`);
  }

  // persistence check: last summon was seed-0 (bee). reload; it must return.
  const before = await page.textContent('.pet-name');
  await page.reload();
  await page.waitForSelector('.pet-name');
  await settle(page, 400);
  const after = await page.textContent('.pet-name');
  const persisted = before === after;
  await page.screenshot({ path: resolve(OUT, `${DATE}-m1-reload-persist.png`) });

  await browser.close();

  console.log(`console errors: ${errors.length}`);
  for (const e of errors) console.log('  ! ' + e);
  console.log(`persistence: ${persisted ? 'OK' : 'FAILED'} (before=${before} after=${after})`);

  if (errors.length || !persisted) {
    process.exit(1);
  }
  console.log('shoot OK');
}

run().catch((e) => { console.error(e); process.exit(1); });
