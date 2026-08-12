// shoot-m9 — proves the M9 visual register ("Sun-Disk Chrome") across EVERY screen
// inside the real single-file app: the summon/raise screen, the week plan, the
// stat card, rename, the tournament battle + announcer beats, the Memory Meadow,
// the inheritance screen, and the Buddies codex. Boots dist/index.html in a real
// browser at 1280x800. Dev tooling only.

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
const shot = (page, name) => page.screenshot({ path: resolve(OUT, `${DATE}-m9-${name}.png`) });

async function run() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));

  await page.goto(DIST);
  await page.waitForSelector('#scene');
  await settle(page, 400);

  // 1) fresh summon/title screen — the empty stage + summon bar + coach hint
  await shot(page, 'summon');

  // 2) raise screen — summoned pet, stat card (segmented meters), week plan
  await page.fill('#phrase', PHRASE);
  await page.click('#summon');
  await page.waitForSelector('#rename-pet');
  await settle(page, 350);
  await shot(page, 'raise');

  // 2b) plan previewed — queue a couple of drills so the meter deltas show
  for (let i = 0; i < 2; i++) {
    const d = await page.$('.act[data-act="drill_pow"]');
    if (d) { await d.click(); await settle(page, 150); }
  }
  await shot(page, 'plan-preview');

  // 2c) the career / rank-ladder panel — scroll the stat card to it
  await page.evaluate(() => { const c = document.querySelector('#card'); if (c) c.scrollTop = c.scrollHeight; });
  await settle(page, 250);
  await shot(page, 'career');
  await page.evaluate(() => { const c = document.querySelector('#card'); if (c) c.scrollTop = 0; });
  await settle(page, 150);

  // 3) rename mid-edit
  await page.click('#rename-pet');
  await page.waitForSelector('.rename-input');
  await page.fill('.rename-input', 'Ringmaster');
  await settle(page, 150);
  await shot(page, 'rename');
  await page.keyboard.press('Enter');
  await settle(page, 150);

  // 4) codex — the 70 Buddies grid in register chrome
  await page.click('#codex-open');
  await page.waitForSelector('#codex .codex-panel');
  await settle(page, 500);
  await shot(page, 'codex');
  await page.click('#codex [data-cclose]');
  await settle(page, 150);

  // raise a few weeks so bouts are winnable and twilight approaches
  for (let i = 0; i < 4; i++) { await page.click('#fastfwd'); await settle(page, 120); }

  // 5) tournament battle + announcer beats
  const ring = await page.$('#to-ring');
  if (ring) {
    await ring.click();
    await page.waitForSelector('#battle .battle-panel');
    await settle(page, 300);
    await shot(page, 'battle-open');
    for (let i = 0; i < 12; i++) {
      let move = null;
      for (const m of ['strike', 'dash', 'guard']) {
        if (await page.$(`.move[data-move="${m}"]:not([disabled])`)) { move = m; break; }
      }
      if (!move) break;
      await page.click(`.move[data-move="${move}"]`);
      await settle(page, 130);
      if (await page.$('.logline.ko')) break;
    }
    await settle(page, 250);
    await shot(page, 'battle-ko');
    const close = await page.$('#battle [data-close]');
    if (close) { await close.click(); await settle(page, 200); }
  }

  // 6) Memory Meadow + inheritance: race to twilight, retire, breed
  if (process.env.M9_LINEAGE !== '0') {
    // debug skip needs ?debug; instead fast-forward until retire appears
    for (let i = 0; i < 40 && !(await page.$('#to-retire')); i++) {
      await page.click('#fastfwd');
      await settle(page, 70);
    }
    const retire = await page.$('#to-retire');
    if (retire) {
      await retire.click();
      await page.waitForSelector('#meadow .meadow-panel');
      await settle(page, 400);
      await shot(page, 'meadow');
      // choose the retiree as a parent to preview the heir egg
      const choose = await page.$('#meadow [data-choose]');
      if (choose) { await choose.click(); await settle(page, 300); await shot(page, 'inheritance'); }
    }
  }

  console.log('m9 shots written; console errors:', errors.length);
  if (errors.length) console.log(errors.slice(0, 8));
  await browser.close();
  process.exit(errors.length ? 1 : 0);
}
run().catch((e) => { console.error(e); process.exit(1); });
