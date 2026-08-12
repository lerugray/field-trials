// shoot-m8-app — proves the M8 onboarding + genre-completeness pass INSIDE the
// real single-file app: the first-run coach hint, the rename affordance, the
// planner fast-forward, and a battle carrying the announcer beats. Boots
// dist/index.html in a real browser. Dev tooling only.

import { chromium } from 'playwright';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { mkdir } from 'node:fs/promises';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = pathToFileURL(resolve(ROOT, 'dist/index.html')).href;
const OUT = resolve(ROOT, 'docs/screenshots');
const DATE = process.argv[2] || 'undated';
const PHRASE = 'a champion of the ring';
const settle = (page, ms) => page.waitForTimeout(ms);

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

  // --- shot 1: fresh boot with the first-run coach hint (summon step) ---
  await page.screenshot({ path: resolve(OUT, `${DATE}-m8-coach-summon.png`) });

  // --- shot 2: post-summon — the card with rename pencil, the raise coach hint,
  // and the planner (fast-forward button visible) ---
  await page.fill('#phrase', PHRASE);
  await page.click('#summon');
  await page.waitForSelector('#rename-pet');
  await settle(page, 300);
  await page.screenshot({ path: resolve(OUT, `${DATE}-m8-raise-coach.png`) });

  // --- shot 3: rename mid-edit (inline input open) ---
  await page.click('#rename-pet');
  await page.waitForSelector('.rename-input');
  await page.fill('.rename-input', 'Sir Pounce');
  await settle(page, 150);
  await page.screenshot({ path: resolve(OUT, `${DATE}-m8-rename.png`) });
  await page.keyboard.press('Enter');
  await settle(page, 150);

  // Fast-forward a few weeks so E wins are reliable and a clash lands.
  for (let i = 0; i < 4; i++) { await page.click('#fastfwd'); await settle(page, 120); }

  // --- shot 4: a bout showing the announcer beats in the log ---
  const ring = await page.$('#to-ring');
  if (ring) {
    await ring.click();
    await page.waitForSelector('#battle .battle-panel');
    await settle(page, 250);
    // play a few rounds so intro + clash + (ideally) a KO flourish are on screen
    for (let i = 0; i < 10; i++) {
      let move = null;
      for (const m of ['strike', 'dash', 'guard']) {
        if (await page.$(`.move[data-move="${m}"]:not([disabled])`)) { move = m; break; }
      }
      if (!move) break;
      await page.click(`.move[data-move="${move}"]`);
      await settle(page, 140);
      if (await page.$('.logline.ko')) break;
    }
    await settle(page, 200);
    await page.screenshot({ path: resolve(OUT, `${DATE}-m8-announcer.png`) });
  }

  console.log('m8 app shots written; console errors:', errors.length);
  if (errors.length) console.log(errors.slice(0, 6));
  await browser.close();
  process.exit(errors.length ? 1 : 0);
}
run().catch((e) => { console.error(e); process.exit(1); });
