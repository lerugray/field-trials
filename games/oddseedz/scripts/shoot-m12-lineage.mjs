// shoot-m12-lineage — proves M12 items 2 and 3 in the real single-file app:
//   3) early retirement offered once a pet is Adult, behind a two-step confirm
//   2) the hatch/egg screen showing inherited deltas vs a fresh-summon baseline
// Drives the real loop: summon -> fast-forward to Adult -> early-retire (confirm)
// -> Meadow -> choose parent -> egg preview. Dev tooling only.

import { chromium } from 'playwright';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { mkdir } from 'node:fs/promises';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = pathToFileURL(resolve(ROOT, 'dist/index.html')).href;
const OUT = resolve(ROOT, 'docs/screenshots');
const DATE = process.argv[2] || 'undated';
const settle = (p, ms) => p.waitForTimeout(ms);
const shot = (page, name, el) => (el || page).screenshot({ path: resolve(OUT, `${DATE}-m12-${name}.png`) });

async function run() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch();
  const errors = [];
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));

  await page.goto(DIST);
  await page.waitForSelector('#scene');
  await settle(page, 400);
  const begin = await page.$('#title-begin');
  if (begin) { await begin.click(); await settle(page, 300); }

  await page.fill('#phrase', 'a bold champion of the wolfpack');
  await page.click('#summon');
  await page.waitForSelector('#rename-pet');
  await settle(page, 300);

  // fast-forward well into the pet's life (a properly raised parent, still short
  // of week 30 so this is a genuine EARLY retirement), then confirm the button.
  for (let i = 0; i < 22; i++) {
    const ff = await page.$('#fastfwd');
    if (ff) { await ff.click(); await settle(page, 110); }
    if (await page.$('#to-retire')) break; // reached twilight -> stop before due
  }
  const armedFound = !!(await page.$('#to-retire-early'));
  console.log('early-retire button present once Adult:', armedFound);
  await shot(page, 'early-retire-offered', await page.$('#card'));

  // two-step confirm: first click arms the red confirm
  await page.click('#to-retire-early');
  await page.waitForSelector('.retire-confirm');
  await settle(page, 200);
  await shot(page, 'early-retire-confirm', await page.$('#card'));

  // confirm the early retirement -> between generations, Meadow opens
  await page.click('#retire-yes');
  await page.waitForSelector('#meadow:not([hidden])');
  await settle(page, 300);

  // choose the lone retiree as a parent -> egg preview with inherited deltas
  await page.click('[data-choose="0"]');
  await page.waitForSelector('.egg-preview');
  await settle(page, 300);
  const egg = await page.$('.inherit');
  await shot(page, 'hatch-deltas', egg || (await page.$('#meadow')));

  // finish the loop: hatch the heir, confirm it becomes the active pet
  await page.click('#hatch-heir');
  await page.waitForSelector('#rename-pet');
  await settle(page, 300);
  const isHeir = await page.$eval('.pet-species', (n) => n.textContent).catch(() => '');
  console.log('heir hatched; species line:', isHeir);

  console.log('m12 lineage shots written; console errors:', errors.length);
  if (errors.length) console.log(errors.slice(0, 8));
  await browser.close();
  process.exit(errors.length ? 1 : 0);
}
run().catch((e) => { console.error(e); process.exit(1); });
