// shoot-m3 — boots dist/index.html in a real browser and proves the M3 toy-room
// bond layer: pet/poke/drag, a snack pantry with DISCOVERED likes, a toybox, and
// mood/temperament states with visible reactions. The milestone proof: an
// interaction changes mood/Bond and the pet visibly behaves differently after.
// Captures dated proof shots at 1280x800. Dev tooling only.

import { chromium } from 'playwright';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { mkdir } from 'node:fs/promises';

import { SNACKS, tasteOf } from '../src/engine/care.js';
import { summon } from '../src/engine/summon.js';
import { moodOf } from '../src/engine/mood.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = pathToFileURL(resolve(ROOT, 'dist/index.html')).href;
const DATE = process.argv[2] || 'undated';
const OUT = resolve(ROOT, 'docs/screenshots');
const PHRASE = 'toybox-1';

const settle = (page, ms) => page.waitForTimeout(ms);
const bondOf = (page) => page.$eval('.vitals .vital:nth-child(1) .vital-val', (n) => parseInt(n.textContent, 10));
const moodLabel = (page) => page.textContent('.pet-mood');

async function run() {
  await mkdir(OUT, { recursive: true });
  // The engine is deterministic, so we know this pet's hidden favorite up front.
  const creature = summon(PHRASE);
  const truth = tasteOf(creature);
  const favLabel = SNACKS.find((s) => s.id === truth.favorite).label;

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));

  await page.goto(DIST);
  await page.waitForSelector('#scene');
  await settle(page, 300);

  await page.fill('#phrase', PHRASE);
  await page.click('#summon');
  await settle(page, 600);

  const name = (await page.textContent('.pet-name')).trim();
  const moodStart = (await moodLabel(page)).trim();
  const bondStart = await bondOf(page);
  await page.screenshot({ path: resolve(OUT, `${DATE}-m3-room-baseline.png`) });

  // FEED THE FAVORITE: delight reaction (hearts), Bond jumps, taste discovered.
  await page.click(`.snack[data-snack="${truth.favorite}"]`);
  await settle(page, 220); // catch the reaction mid-animation
  await page.screenshot({ path: resolve(OUT, `${DATE}-m3-snack-delight.png`) });
  const toastFav = (await page.textContent('#toast')).trim();
  const bondAfterFav = await bondOf(page);

  // Keep bonding until the mood visibly lifts (content -> happy/playful).
  for (let i = 0; i < 8; i++) {
    await page.click(`.snack[data-snack="${truth.favorite}"]`);
    await settle(page, 90);
    const m = (await moodLabel(page)).trim();
    if (m.includes('happy') || m.includes('playful')) break;
  }
  await settle(page, 200);
  const moodHappy = (await moodLabel(page)).trim();
  const bondHappy = await bondOf(page);
  await page.screenshot({ path: resolve(OUT, `${DATE}-m3-mood-happy.png`) });

  // BUY + PLAY A TOY: a playful reaction from the toybox.
  await page.click('.toy.buy[data-buytoy="ball"]');
  await settle(page, 150);
  await page.click('.toy.owned[data-toy="ball"]');
  await settle(page, 220);
  await page.screenshot({ path: resolve(OUT, `${DATE}-m3-toy-play.png`) });
  const toastToy = (await page.textContent('#toast')).trim();

  // POKE teaches temperament (a visible playful-or-startled reaction).
  await page.click('.care-act[data-do="poke"]');
  await settle(page, 220);
  const toastPoke = (await page.textContent('#toast')).trim();

  // DROP THE MOOD: feed the disliked snack until stress flips the face to a
  // grumpy/anxious state (best-effort; proves the negative reactions exist too).
  let moodLow = moodHappy;
  for (let i = 0; i < 24; i++) {
    await page.click(`.snack[data-snack="${truth.disliked}"]`);
    await settle(page, 70);
    const m = (await moodLabel(page)).trim();
    if (m.includes('grumpy') || m.includes('anxious')) { moodLow = m; break; }
    moodLow = m;
  }
  await settle(page, 200);
  await page.screenshot({ path: resolve(OUT, `${DATE}-m3-mood-low.png`) });

  // PERSISTENCE: reload; discovered tastes + owned toy must survive.
  await page.reload();
  await page.waitForSelector('.pet-name');
  await settle(page, 400);
  const tasteNote = (await page.textContent('.taste-note')).trim();
  const ownsBall = await page.$('.toy.owned[data-toy="ball"]') != null;

  await browser.close();

  const engineMood = moodOf({ ...creature, bond: bondHappy, stress: 5, fatigue: 0 }).id;
  console.log(`pet: ${name}  (hidden favorite: ${favLabel})`);
  console.log(`mood: ${moodStart} -> ${moodHappy} -> ${moodLow}`);
  console.log(`bond: ${bondStart} -> favorite ${bondAfterFav} -> bonded ${bondHappy}`);
  console.log(`favorite toast: "${toastFav}"`);
  console.log(`toy toast: "${toastToy}"`);
  console.log(`poke toast: "${toastPoke}"`);
  console.log(`after reload: tastes "${tasteNote}", owns ball: ${ownsBall}`);
  console.log(`console errors: ${errors.length}`);
  for (const e of errors) console.log('  ! ' + e);

  const ok =
    errors.length === 0 &&
    toastFav.toLowerCase().includes('love') &&
    bondAfterFav > bondStart &&
    tasteNote.includes('loves') &&
    ownsBall;
  if (!ok) { console.error('shoot-m3 FAILED assertions'); process.exit(1); }
  console.log('shoot-m3 OK');
}

run().catch((e) => { console.error(e); process.exit(1); });
