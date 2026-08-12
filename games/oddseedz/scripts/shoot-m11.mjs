// shoot-m11 — proves the M11 pre-release certification fixes inside the real
// single-file app: the 375px mobile header (SUMMON on-screen), the fixed battle
// screen (obey badge in its own strip, stamina un-clipped), the coach ribbon in
// its grid row, the Settings panel, and the Save export/import panel. Boots
// dist/index.html in a real browser. Dev tooling only.

import { chromium } from 'playwright';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { mkdir } from 'node:fs/promises';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = pathToFileURL(resolve(ROOT, 'dist/index.html')).href;
const OUT = resolve(ROOT, 'docs/screenshots');
const DATE = process.argv[2] || 'undated';
const settle = (page, ms) => page.waitForTimeout(ms);
const shot = (page, name) => page.screenshot({ path: resolve(OUT, `${DATE}-m11-${name}.png`) });

async function dismissTitle(page) {
  if (await page.$('#title:not([hidden])')) {
    const begin = await page.$('#title-begin');
    if (begin) { await begin.click(); await settle(page, 300); }
  }
}

async function run() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch();
  const errors = [];
  const track = (page) => {
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  };

  // --- 1) mobile header @ 375x667: SUMMON must be on-screen ------------------
  const mob = await browser.newPage({ viewport: { width: 375, height: 667 } });
  track(mob);
  await mob.goto(DIST);
  await mob.waitForSelector('#scene');
  await settle(mob, 500);
  await dismissTitle(mob);
  await shot(mob, 'mobile-header-375');
  const box = await (await mob.$('#summon')).boundingBox();
  const onScreen = box && box.x >= 0 && box.x + box.width <= 375;
  console.log('mobile SUMMON right edge:', box ? (box.x + box.width).toFixed(0) : 'none', onScreen ? 'ON-SCREEN' : 'OFF-SCREEN');
  await mob.close();

  // --- 2) desktop: coach ribbon, battle screen (fixed badge), panels --------
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  track(page);
  await page.goto(DIST);
  await page.waitForSelector('#scene');
  await settle(page, 400);
  await dismissTitle(page);

  // fresh summon → coach ribbon renders in its grid row
  await page.fill('#phrase', 'a champion of the ring');
  await page.click('#summon');
  await page.waitForSelector('#rename-pet');
  await settle(page, 350);
  await shot(page, 'coach-ribbon');

  // Settings panel (never captured before)
  await page.click('#settings-open');
  await page.waitForSelector('#settings:not([hidden])');
  await settle(page, 300);
  await shot(page, 'settings');
  // Save export/import: grab the save code, paste it back, and arm the two-step
  // restore so the red 'Confirm overwrite' preview is captured (item 5).
  const code = await page.inputValue('#settings [data-savefield]').catch(() => '');
  if (code) {
    await page.fill('#settings [data-importfield]', code);
    await page.click('#settings [data-loadsave]'); // first click arms the confirm
    await settle(page, 200);
    await shot(page, 'restore-confirm');
  }
  const sclose = await page.$('#settings [data-sclose]');
  if (sclose) { await sclose.click(); await settle(page, 200); }

  // raise a few weeks, then a ranked bout to prove the fixed battle strip
  for (let i = 0; i < 4; i++) { const f = await page.$('#fastfwd'); if (f) { await f.click(); await settle(page, 120); } }
  const ring = await page.$('#to-ring');
  if (ring) {
    await ring.click();
    await page.waitForSelector('#battle .battle-panel');
    await settle(page, 300);
    // throw a move so the obey/refuse badge shows in its reserved strip
    for (const m of ['strike', 'dash', 'guard']) {
      if (await page.$(`.move[data-move="${m}"]:not([disabled])`)) { await page.click(`.move[data-move="${m}"]`); break; }
    }
    await settle(page, 250);
    await shot(page, 'battle-fixed');
    const bclose = await page.$('#battle [data-close]');
    if (bclose) { await bclose.click(); await settle(page, 200); }
  }

  console.log('m11 shots written; console errors:', errors.length);
  if (errors.length) console.log(errors.slice(0, 8));
  await browser.close();
  process.exit(errors.length ? 1 : 0);
}
run().catch((e) => { console.error(e); process.exit(1); });
