// shoot-m6 — boots dist/index.html in a real browser and proves M6, THE LINEAGE
// GATE: summon → raise → age out → RETIRE (alive, frolicking in the Memory
// Meadow, a read-only sheet) → INHERIT into the next egg (visible inherited
// traits) → hatch an HEIR whose lineage is visible with a tooltip. Captures dated
// shots at 1280x800. Dev tooling only (no assets shipped; node_modules gitignored).

import { chromium } from 'playwright';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { mkdir } from 'node:fs/promises';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = pathToFileURL(resolve(ROOT, 'dist/index.html')).href;
const DATE = process.argv[2] || 'undated';
const OUT = resolve(ROOT, 'docs/screenshots');
const PHRASE = 'the long road home';

const settle = (page, ms) => page.waitForTimeout(ms);

// End quiet weeks until the pet ages into retirement (the Retire button appears).
async function ageToRetirement(page, cap = 45) {
  for (let i = 0; i < cap; i++) {
    if (await page.$('#to-retire')) return true;
    const btn = await page.$('#endweek');
    if (!btn) break;
    await btn.click();
    await settle(page, 90);
  }
  return !!(await page.$('#to-retire'));
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

  await page.fill('#phrase', PHRASE);
  await page.click('#summon');
  await settle(page, 400);
  const parentName = (await page.textContent('.pet-name')).trim();

  // Age the pet out to its twilight so retirement comes due.
  const aged = await ageToRetirement(page);
  await settle(page, 200);

  // --- shot 1: the twilight career panel with the Retire affordance present
  await page.screenshot({ path: resolve(OUT, `${DATE}-m6-twilight.png`) });

  // Retire: the pet graduates — alive — into the Meadow (auto-opens the overlay).
  await page.click('#to-retire');
  await page.waitForSelector('#meadow .meadow-panel');
  await settle(page, 500);
  const meadowCount = await page.$$eval('.retiree', (rs) => rs.length);

  // --- shot 2: the Memory Meadow — the retiree frolicking + its read-only sheet
  await page.screenshot({ path: resolve(OUT, `${DATE}-m6-meadow.png`) });

  // Close the overlay to show the frolicking Meadow on the main stage + the
  // between-generations card.
  await page.click('#meadow [data-mclose]');
  await settle(page, 500);
  await page.waitForSelector('#to-inherit');
  // --- shot 3: the retired parent frolicking on the main stage (between generations)
  await page.screenshot({ path: resolve(OUT, `${DATE}-m6-meadow-stage.png`) });

  // Reopen the Meadow and breed: choose the retiree as a parent (a wild seed
  // fills the second slot — generation one), previewing the heir.
  await page.click('#to-inherit');
  await page.waitForSelector('#meadow .meadow-panel');
  await settle(page, 300);
  await page.click('.ret-choose[data-choose="0"]');
  await page.waitForSelector('.egg-preview');
  await settle(page, 300);
  const boostText = (await page.textContent('.egg-v.boost')).trim();

  // --- shot 4: the inheritance screen — the egg preview with visible inherited traits
  await page.screenshot({ path: resolve(OUT, `${DATE}-m6-inheritance.png`) });

  // Hatch the heir.
  await page.click('#hatch-heir');
  await page.waitForSelector('.lineage');
  await settle(page, 400);
  const heirName = (await page.textContent('.pet-name')).trim();
  const lineageText = (await page.textContent('.lineage')).trim();

  // --- shot 5: the heir's card, its lineage ribbon (parents + inherited stats) visible
  await page.screenshot({ path: resolve(OUT, `${DATE}-m6-heir.png`) });

  // Persistence: the heir + its lineage survive a reload.
  await page.reload();
  await page.waitForSelector('.pet-name');
  await settle(page, 500);
  const heirAfter = (await page.textContent('.pet-name')).trim();
  const lineagePersists = !!(await page.$('.lineage'));
  const meadowPersists = await page.$$eval('.rank-chip', () => true).catch(() => false);

  await browser.close();

  console.log(`parent: ${parentName} (retired), heir: ${heirName}`);
  console.log(`aged to retirement: ${aged}, retirees in Meadow: ${meadowCount}`);
  console.log(`inherited head-start: "${boostText}"`);
  console.log(`heir lineage ribbon: "${lineageText}"`);
  console.log(`after reload: heir "${heirAfter}", lineage persists: ${lineagePersists}`);
  console.log(`console errors: ${errors.length}`);
  for (const e of errors) console.log('  ! ' + e);

  const ok =
    errors.length === 0 &&
    aged && meadowCount >= 1 &&
    boostText.length > 0 &&
    /heir of/i.test(lineageText) &&
    heirAfter === heirName && lineagePersists;
  if (!ok) { console.error('shoot-m6 FAILED assertions'); process.exit(1); }
  console.log('shoot-m6 OK');
}

run().catch((e) => { console.error(e); process.exit(1); });
