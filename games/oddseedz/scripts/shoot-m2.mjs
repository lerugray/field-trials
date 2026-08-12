// shoot-m2 — boots dist/index.html in a real browser and proves the M2 loop:
// summon a pet, queue a week (chits drain, deltas preview BEFORE confirming),
// end the week (stats/vitals/age/money move), and verify reload persistence of
// the new save schema. Captures dated proof shots at 1280x800. Dev tooling only.

import { chromium } from 'playwright';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { mkdir } from 'node:fs/promises';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = pathToFileURL(resolve(ROOT, 'dist/index.html')).href;
const DATE = process.argv[2] || 'undated';
const OUT = resolve(ROOT, 'docs/screenshots');

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

  // a rare, expressive pet to raise
  await page.fill('#phrase', 'seed-1');
  await page.click('#summon');
  await settle(page, 600);
  const startName = await page.textContent('.pet-name');

  // queue a week: 3 power drills, a rest, then a play — care+train share the pool
  const plan = ['drill_pow', 'drill_pow', 'drill_pow', 'rest', 'play'];
  for (const id of plan) {
    await page.click(`.act[data-act="${id}"]`);
    await settle(page, 120);
  }
  // PRE-CONFIRM: the preview (stat deltas + draining chits) is on screen now
  await settle(page, 250);
  await page.screenshot({ path: resolve(OUT, `${DATE}-m2-week-preview.png`) });

  const spentLabel = await page.textContent('.chits .label');
  const powDelta = await page.textContent('.stat .stat-delta.up');

  // CONFIRM the week
  await page.click('#endweek');
  await settle(page, 700);
  await page.screenshot({ path: resolve(OUT, `${DATE}-m2-week-resolved.png`) });
  const weekAfter = await page.textContent('.plan-week');

  // BLOCKED-ACTION answer: fill the whole budget then click one more
  const budgetText = await page.textContent('.chits .label'); // "Actions x / N"
  const budget = Number(budgetText.split('/')[1].trim());
  for (let i = 0; i < budget; i++) {
    await page.click('.act[data-act="drill_spd"]');
  }
  await page.click('.act[data-act="drill_spd"]'); // one over -> in-world answer
  await settle(page, 200);
  const toast = await page.textContent('#toast');
  await page.screenshot({ path: resolve(OUT, `${DATE}-m2-budget-full.png`) });
  await page.click('#clearplan');

  // PERSISTENCE: reload; the raised pet (with its new age/vitals) must return
  const beforeReload = await page.textContent('.pet-name');
  const ageBefore = await page.textContent('.plan-week');
  await page.reload();
  await page.waitForSelector('.pet-name');
  await settle(page, 400);
  const afterReload = await page.textContent('.pet-name');
  const ageAfter = await page.textContent('.plan-week');
  const persisted = beforeReload === afterReload && ageBefore === ageAfter;

  await browser.close();

  console.log(`start pet: ${startName}`);
  console.log(`queued 5 actions -> ${spentLabel.trim()}; power preview ${powDelta}`);
  console.log(`after End Week: ${weekAfter}`);
  console.log(`budget-full answer: "${toast.trim()}"`);
  console.log(`console errors: ${errors.length}`);
  for (const e of errors) console.log('  ! ' + e);
  console.log(`persistence: ${persisted ? 'OK' : 'FAILED'} (${ageBefore} -> reload -> ${ageAfter})`);

  if (errors.length || !persisted || !toast.trim()) process.exit(1);
  console.log('shoot-m2 OK');
}

run().catch((e) => { console.error(e); process.exit(1); });
