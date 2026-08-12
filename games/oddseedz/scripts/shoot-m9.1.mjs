// shoot-m9.1 — re-proves the screens whose TEXT colours changed in the M9.1
// register-integrity fix round (directive item 5): the career/rank-ladder panel,
// the tournament battle (open + KO/result), the Memory Meadow, and the
// inheritance screen. Off-register win/promote/ko/up/boost text is now cream-gold
// and battle-loss text is warning-red; announcer beats are sanctioned dark-navy.
// Boots the real single-file dist at 1280x800. Dev tooling only; names the shots
// `<date>-m9.1-<screen>.png` so no existing M9 proof is overwritten.

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
const shot = (page, name) => page.screenshot({ path: resolve(OUT, `${DATE}-m9.1-${name}.png`) });

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

  await page.fill('#phrase', PHRASE);
  await page.click('#summon');
  await page.waitForSelector('#rename-pet');
  await settle(page, 300);

  // career / rank-ladder panel (log-win -> gold, log-promote -> gold, log-miss/loss -> red)
  await page.evaluate(() => { const c = document.querySelector('#card'); if (c) c.scrollTop = c.scrollHeight; });
  await settle(page, 250);
  await shot(page, 'career');
  await page.evaluate(() => { const c = document.querySelector('#card'); if (c) c.scrollTop = 0; });
  await settle(page, 150);

  // raise a few weeks so bouts are winnable
  for (let i = 0; i < 4; i++) { await page.click('#fastfwd'); await settle(page, 120); }

  // battle open + fight to KO (obey -> gold, ko -> gold, announce -> dark-navy, loss -> red)
  const ring = await page.$('#to-ring');
  if (ring) {
    await ring.click();
    await page.waitForSelector('#battle .battle-panel');
    await settle(page, 300);
    await shot(page, 'battle-open');
    for (let i = 0; i < 14; i++) {
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

  // Memory Meadow + inheritance (ms.up -> gold, egg-v.boost -> gold)
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
    const choose = await page.$('#meadow [data-choose]');
    if (choose) { await choose.click(); await settle(page, 300); await shot(page, 'inheritance'); }
  }

  console.log('m9.1 shots written; console errors:', errors.length);
  if (errors.length) console.log(errors.slice(0, 8));
  await browser.close();
  process.exit(errors.length ? 1 : 0);
}
run().catch((e) => { console.error(e); process.exit(1); });
